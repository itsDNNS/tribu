import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from sqlalchemy import or_

from app.core import cache
from app.core.backup import create_backup, enforce_retention
from app.core.clock import app_timezone, local_day_bounds_as_utc_naive, local_wall_now, local_wall_to_utc_naive, utcnow
from app.core.push import send_push_for_user
from app.core.notification_actions import reminder_push_actions
from app.core.reminder_text import reminder_text, short_date, user_language
from app.core.notification_preferences import should_push_notification_type
from app.core.notification_destinations import EligibleReminderUser, dispatch_family_notification
from app.core.recurrence import expand_event, load_series_changes
from app.database import SessionLocal
from app.models import (
    CalendarEvent, CalendarSubscription, FamilyBirthday, MealPlan, Membership, Notification,
    NotificationPreference, NotificationSentLog, ReminderSnooze, ShoppingList, Task,
)

logger = logging.getLogger(__name__)

BACKUP_JOB_ID = "scheduled_backup"
NOTIFICATION_JOB_ID = "check_notifications"
CALENDAR_SUBSCRIPTION_REFRESH_JOB_ID = "refresh_calendar_subscriptions"
BACKUP_SCHEDULE_SYNC_JOB_ID = "sync_backup_schedule"
DST_TRANSITION_BUFFER = timedelta(hours=3)
# Meal reminders go out from this hour of the evening before, naming at most
# this many missing ingredients.
MEAL_REMINDER_HOUR = 17
MEAL_REMINDER_ITEMS = 4
# A week before a birthday without a gift, in the morning.
GIFT_REMINDER_DAYS = 7
GIFT_REMINDER_HOUR = 9

_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler()
    return _scheduler


def _run_backup(db_url: str, backup_dir: str, retention: int):
    try:
        logger.info("Scheduled backup starting...")
        create_backup(db_url, backup_dir)
        enforce_retention(backup_dir, retention)
        logger.info("Scheduled backup completed.")
    except Exception:
        logger.exception("Scheduled backup failed")


def _get_trigger(schedule: str) -> CronTrigger | None:
    triggers = {
        "daily": CronTrigger(hour=3, minute=0),
        "weekly": CronTrigger(day_of_week="sun", hour=3, minute=0),
        "monthly": CronTrigger(day=1, hour=3, minute=0),
    }
    return triggers.get(schedule)


def configure_backup_schedule(schedule: str, db_url: str, backup_dir: str, retention: int):
    scheduler = get_scheduler()

    existing = scheduler.get_job(BACKUP_JOB_ID)
    if existing:
        scheduler.remove_job(BACKUP_JOB_ID)

    if schedule == "off":
        logger.info("Backup schedule disabled.")
        return

    trigger = _get_trigger(schedule)
    if trigger is None:
        logger.warning("Unknown schedule: %s", schedule)
        return

    scheduler.add_job(
        _run_backup,
        trigger=trigger,
        id=BACKUP_JOB_ID,
        args=[db_url, backup_dir, retention],
        replace_existing=True,
    )
    logger.info("Backup schedule set to: %s", schedule)


def _in_quiet_hours(quiet_start: str | None, quiet_end: str | None, now: datetime) -> bool:
    if not quiet_start or not quiet_end:
        return False
    try:
        start_h, start_m = map(int, quiet_start.split(":"))
        end_h, end_m = map(int, quiet_end.split(":"))
    except (ValueError, AttributeError):
        return False

    current_minutes = now.hour * 60 + now.minute
    start_minutes = start_h * 60 + start_m
    end_minutes = end_h * 60 + end_m

    if start_minutes <= end_minutes:
        return start_minutes <= current_minutes < end_minutes
    else:
        return current_minutes >= start_minutes or current_minutes < end_minutes


def _event_trigger_key(event_id: int, starts_at: datetime) -> str:
    # Include the occurrence timestamp so a rescheduled event re-alerts.
    return f"event:{event_id}:{starts_at.replace(microsecond=0).isoformat()}"


def _task_trigger_key(task_id: int, due_date: datetime) -> str:
    # Include the due timestamp so a moved due-date re-alerts.
    return f"task:{task_id}:{due_date.replace(microsecond=0).isoformat()}"


def _birthday_trigger_key(birthday_id: int, target_date) -> str:
    return f"birthday:{birthday_id}:{target_date.isoformat()}"


def _check_notifications():
    db = SessionLocal()
    try:
        audit_now = utcnow()
        now = local_wall_now(audit_now)
        tomorrow = now.date() + timedelta(days=1)

        memberships = db.query(Membership).all()
        user_families: dict[int, list[int]] = {}
        family_users: dict[int, list[int]] = {}
        for m in memberships:
            user_families.setdefault(m.user_id, []).append(m.family_id)
            family_users.setdefault(m.family_id, []).append(m.user_id)

        prefs_map: dict[int, NotificationPreference] = {}
        for pref in db.query(NotificationPreference).all():
            prefs_map[pref.user_id] = pref

        def get_pref(uid: int) -> NotificationPreference:
            if uid in prefs_map:
                return prefs_map[uid]
            default = NotificationPreference(user_id=uid, reminders_enabled=True, reminder_minutes=30)
            return default

        def get_log(uid: int, trigger_key: str) -> NotificationSentLog | None:
            return (
                db.query(NotificationSentLog)
                .filter(
                    NotificationSentLog.user_id == uid,
                    NotificationSentLog.trigger_key == trigger_key,
                )
                .first()
            )

        def _reminder_due_for_pref(starts_at: datetime, pref: NotificationPreference) -> bool:
            starts_at_utc = local_wall_to_utc_naive(starts_at)
            window_utc = audit_now + timedelta(minutes=pref.reminder_minutes)
            return audit_now < starts_at_utc <= window_utc

        def _minutes_until(starts_at: datetime) -> int:
            starts_at_utc = local_wall_to_utc_naive(starts_at)
            return int((starts_at_utc - audit_now).total_seconds() / 60)

        def eligible_reminder_users(fid: int, starts_at: datetime | None = None) -> list[EligibleReminderUser]:
            users: list[EligibleReminderUser] = []
            for candidate_uid in family_users.get(fid, []):
                pref = get_pref(candidate_uid)
                if not pref.reminders_enabled:
                    continue
                if starts_at is not None and not _reminder_due_for_pref(starts_at, pref):
                    continue
                users.append(
                    EligibleReminderUser(
                        user_id=candidate_uid,
                        in_quiet_hours=_in_quiet_hours(pref.quiet_start, pref.quiet_end, now),
                    )
                )
            return users

        dispatched_destination_keys: set[tuple[str, str, int, str]] = set()
        pending_destination_dispatches = []

        def dispatch_destination_once(
            *,
            event_type: str,
            fid: int,
            title: str,
            body: str,
            link: str | None,
            source_type: str,
            source_id: int,
            trigger_key: str,
            eligible_users: list[EligibleReminderUser],
        ) -> None:
            key = (event_type, source_type, source_id, trigger_key)
            if key in dispatched_destination_keys:
                return
            dispatched_destination_keys.add(key)
            pending_destination_dispatches.append({
                "family_id": fid,
                "event_type": event_type,
                "title": title,
                "body": body,
                "link": link,
                "source_type": source_type,
                "source_id": source_id,
                "trigger_key": trigger_key,
                "eligible_users": eligible_users,
            })

        def dispatch_pending_destinations() -> None:
            for destination_dispatch in pending_destination_dispatches:
                try:
                    dispatch_family_notification(**destination_dispatch)
                except Exception:
                    logger.warning("Family notification destination dispatch failed")

        def adopt_legacy_log(
            uid: int,
            source_type: str,
            source_id: int,
            trigger_key: str,
        ) -> bool:
            """Attach a deterministic trigger key to a same-day legacy log.

            Before 0032, the scheduler created the in-app Notification and a
            source/user/day log together. If such a legacy log already exists,
            the reminder was already surfaced, so adopting the log avoids
            creating a duplicate in-app notification after upgrade.
            """
            start_of_day, _ = local_day_bounds_as_utc_naive(now.date())
            legacy = (
                db.query(NotificationSentLog)
                .filter(
                    NotificationSentLog.user_id == uid,
                    NotificationSentLog.source_type == source_type,
                    NotificationSentLog.source_id == source_id,
                    NotificationSentLog.trigger_key.is_(None),
                    NotificationSentLog.sent_at >= start_of_day,
                )
                .order_by(NotificationSentLog.sent_at.desc())
                .first()
            )
            if not legacy:
                return False
            legacy.trigger_key = trigger_key
            legacy.status = "delivered"
            legacy.delivered_at = legacy.delivered_at or legacy.sent_at or audit_now
            legacy.last_attempt_at = legacy.last_attempt_at or legacy.sent_at or audit_now
            legacy.last_error = None
            return True

        languages: dict[int, str] = {}

        def language_of(uid: int) -> str:
            if uid not in languages:
                languages[uid] = user_language(db, uid)
            return languages[uid]

        def deliver(
            uid: int,
            fid: int,
            ntype: str,
            title: str,
            body,
            link: str | None,
            source_type: str,
            source_id: int,
            trigger_key: str,
            event_starts_at: datetime | None = None,
        ) -> None:
            """Idempotent reminder delivery for a (user, trigger_key) pair.

            On first invocation creates exactly one in-app Notification and one
            NotificationSentLog row. On retry runs reuses the existing log,
            does NOT create another in-app Notification, but may re-attempt
            push if push is enabled and the previous attempt failed.
            """
            pref = get_pref(uid)
            if not pref.reminders_enabled:
                return
            if _in_quiet_hours(pref.quiet_start, pref.quiet_end, now):
                return
            # Texts in the recipient's language (#535).
            lang = language_of(uid)
            if callable(body):
                body = body(lang)

            log = get_log(uid, trigger_key)
            first_run = log is None

            if first_run and adopt_legacy_log(uid, source_type, source_id, trigger_key):
                return

            if first_run:
                notif = Notification(
                    user_id=uid, family_id=fid, type=ntype,
                    title=title, body=body, link=link,
                )
                db.add(notif)
                log = NotificationSentLog(
                    source_type=source_type,
                    source_id=source_id,
                    user_id=uid,
                    trigger_key=trigger_key,
                    status="pending",
                    delivery_attempts=0,
                )
                db.add(log)
                # Flush so the partial-unique index catches concurrent inserts
                # before push, and so subsequent get_log calls find the row.
                db.flush()
            else:
                # Retry: only proceed if the previous attempt was not delivered.
                if log.status == "delivered":
                    return

            push_result = None
            push_allowed, push_skip_reason = should_push_notification_type(pref, ntype)
            if push_allowed:
                try:
                    push_body = body
                    if event_starts_at is not None:
                        # A relative countdown becomes false when Android delays
                        # delivery or the notification remains in the tray.
                        push_body = reminder_text(
                            lang, "event_starts_at",
                            when=f"{event_starts_at:%Y-%m-%d %H:%M} ({app_timezone().key})",
                        )
                    # Buttons for the reminder (Tribu 2.0, N-2).
                    action_options = reminder_push_actions(
                        uid, fid, source_type, source_id, ntype, title, push_body, link, lang,
                    )
                    if event_starts_at is not None:
                        push_result = send_push_for_user(
                            db, uid, title, push_body, link,
                            urgent=True,
                            expires_at=local_wall_to_utc_naive(event_starts_at),
                            **action_options,
                        )
                    else:
                        push_result = send_push_for_user(db, uid, title, push_body, link, **action_options)
                except Exception as exc:
                    logger.exception("Push notification failed for user %s", uid)
                    log.delivery_attempts = (log.delivery_attempts or 0) + 1
                    log.last_attempt_at = audit_now
                    log.last_error = f"unexpected: {type(exc).__name__}: {exc}"[:500]
                    log.status = "failed"
                    return

            log.delivery_attempts = (log.delivery_attempts or 0) + 1
            log.last_attempt_at = audit_now

            if push_result is None:
                # Push disabled, category disabled, or unknown for this type.
                # In-app delivery is the only active channel and succeeded the
                # moment we created the Notification row.
                log.status = "delivered"
                log.delivered_at = audit_now
                log.last_error = f"push_skipped:{push_skip_reason}" if push_skip_reason else None
                return

            if push_result.attempted == 0:
                # No subscriptions / VAPID not configured / library missing.
                # In-app notification still landed, so the reminder reached
                # the user via the only channel that was active.
                log.status = "delivered"
                log.delivered_at = audit_now
                log.last_error = (
                    f"push_skipped:{push_result.skipped_reason}"
                    if push_result.skipped_reason
                    else None
                )
                return

            if push_result.succeeded > 0:
                log.status = "delivered"
                log.delivered_at = audit_now
                log.last_error = (
                    "; ".join(push_result.errors)[:500] if push_result.errors else None
                )
            elif push_result.failed == 0:
                # Only gone subscriptions were removed. The in-app
                # notification exists and there is no transient endpoint left
                # to retry, so the reminder is complete.
                log.status = "delivered"
                log.delivered_at = audit_now
                log.last_error = (
                    f"push_removed_subscriptions:{push_result.removed}"
                    if push_result.removed
                    else None
                )
            else:
                # Every attempted endpoint failed transiently — keep the
                # row retryable so the next scheduler tick can try again.
                log.status = "failed"
                log.last_error = (
                    "; ".join(push_result.errors)[:500] if push_result.errors else "push_failed"
                )

        # 1. Event reminders
        for uid, fam_ids in user_families.items():
            pref = get_pref(uid)
            if not pref.reminders_enabled:
                continue
            window = now + timedelta(minutes=pref.reminder_minutes) + DST_TRANSITION_BUFFER
            events = (
                db.query(CalendarEvent)
                .filter(
                    CalendarEvent.family_id.in_(fam_ids),
                    CalendarEvent.all_day.is_(False),
                    CalendarEvent.starts_at <= window,
                    or_(
                        CalendarEvent.starts_at > now,
                        CalendarEvent.recurrence.isnot(None),
                    ),
                    or_(
                        CalendarEvent.recurrence.is_(None),
                        CalendarEvent.recurrence_end.is_(None),
                        CalendarEvent.recurrence_end >= now,
                    ),
                )
                .all()
            )
            series_changes = load_series_changes(db, events)
            for ev in events:
                occurrences = (
                    expand_event(ev, range_start=now, range_end=window + timedelta(seconds=1), series_changes=series_changes)
                    if ev.recurrence
                    else [{"starts_at": ev.starts_at}]
                )
                for occurrence in occurrences:
                    starts_at = occurrence["starts_at"]
                    if starts_at <= now or starts_at > window:
                        continue
                    if not _reminder_due_for_pref(starts_at, pref):
                        continue
                    mins = _minutes_until(starts_at)
                    body = f"Starts in {mins} minutes"
                    localized_body = lambda lang, mins=mins: reminder_text(lang, "event_starts_in", minutes=mins)
                    trigger_key = _event_trigger_key(ev.id, starts_at)
                    dispatch_destination_once(
                        event_type="calendar.reminder",
                        fid=ev.family_id,
                        title=ev.title,
                        body=body,
                        link=f"/calendar?event={ev.id}",
                        source_type="event",
                        source_id=ev.id,
                        trigger_key=trigger_key,
                        eligible_users=eligible_reminder_users(ev.family_id, starts_at),
                    )
                    deliver(
                        uid, ev.family_id, "event_reminder",
                        ev.title,
                        localized_body,
                        f"/calendar?event={ev.id}", "event", ev.id,
                        trigger_key,
                        event_starts_at=starts_at,
                    )


        # 2. Overdue tasks
        for uid, fam_ids in user_families.items():
            overdue = (
                db.query(Task)
                .filter(
                    Task.family_id.in_(fam_ids),
                    Task.status == "open",
                    Task.due_date.isnot(None),
                    Task.due_date < now,
                )
                .all()
            )
            for task in overdue:
                trigger_key = _task_trigger_key(task.id, task.due_date)
                dispatch_destination_once(
                    event_type="task.reminder",
                    fid=task.family_id,
                    title=task.title,
                    body="Task is overdue",
                    link=f"/tasks?id={task.id}",
                    source_type="task",
                    source_id=task.id,
                    trigger_key=trigger_key,
                    eligible_users=eligible_reminder_users(task.family_id),
                )
                deliver(
                    uid, task.family_id, "task_due",
                    task.title,
                    lambda lang: reminder_text(lang, "task_overdue"),
                    f"/tasks?id={task.id}", "task", task.id,
                    trigger_key,
                )

        # 3. Birthday reminders (tomorrow)
        for uid, fam_ids in user_families.items():
            pref = get_pref(uid)
            if not pref.reminders_enabled:
                continue
            birthdays = (
                db.query(FamilyBirthday)
                .filter(
                    FamilyBirthday.family_id.in_(fam_ids),
                    FamilyBirthday.month == tomorrow.month,
                    FamilyBirthday.day == tomorrow.day,
                )
                .all()
            )
            for bd in birthdays:
                body = f"Birthday tomorrow ({tomorrow.strftime('%b %d')})"
                trigger_key = _birthday_trigger_key(bd.id, tomorrow)
                dispatch_destination_once(
                    event_type="birthday.reminder",
                    fid=bd.family_id,
                    title=bd.person_name,
                    body=body,
                    link=f"/birthdays?id={bd.id}",
                    source_type="birthday",
                    source_id=bd.id,
                    trigger_key=trigger_key,
                    eligible_users=eligible_reminder_users(bd.family_id),
                )
                deliver(
                    uid, bd.family_id, "birthday",
                    bd.person_name,
                    lambda lang: reminder_text(lang, "birthday_tomorrow", date=short_date(lang, tomorrow)),
                    f"/birthdays?id={bd.id}", "birthday", bd.id,
                    trigger_key,
                )

        # 4. Tomorrow's meals whose ingredients are not on a list yet
        #    (Tribu 2.0, N-2): in the evening, with an "Add to list" button.
        if now.hour >= MEAL_REMINDER_HOUR:
            deliver_meal_reminders(db, tomorrow=tomorrow, user_families=user_families, deliver=deliver)

        # 4b. A birthday in a week and nobody takes care of a gift yet.
        if now.hour >= GIFT_REMINDER_HOUR:
            deliver_gift_reminders(
                db, on=now.date() + timedelta(days=GIFT_REMINDER_DAYS), user_families=user_families, deliver=deliver,
            )

        # 5. Reminders someone asked to hear about again (Tribu 2.0, N-2)
        snoozed_users = deliver_snoozed_reminders(db, now=utcnow(), local_now=now, get_pref=get_pref)

        db.commit()
        # Invalidate notification count caches for affected users
        for uid in {*user_families, *snoozed_users}:
            cache.invalidate(f"tribu:notif_count:{uid}")
        # Dispatch external household destinations only after in-app and
        # browser push delivery state is persisted. Apprise targets are remote
        # calls and must not sit in front of existing delivery channels.
        dispatch_pending_destinations()
        logger.info("Notification check completed.")

    except Exception:
        db.rollback()
        logger.exception("Notification check failed")
    finally:
        db.close()


def _meal_trigger_key(plan_id: int, plan_date) -> str:
    return f"meal:{plan_id}:{plan_date.isoformat()}"


def _gift_trigger_key(birthday_id: int, on) -> str:
    return f"gift:{birthday_id}:{on.isoformat()}"


def deliver_gift_reminders(db, *, on, user_families: dict[int, list[int]], deliver) -> None:
    """A week before a birthday, tells the grown-ups (not the birthday
    person) when nobody takes care of a gift yet."""
    from app.core.deps import next_birthday_date
    from app.modules.gifts_router import birthday_recipient, gift_under_way

    adults = {
        (member.user_id, member.family_id)
        for member in db.query(Membership).filter(Membership.is_adult.is_(True)).all()
    }
    family_ids = {fid for fids in user_families.values() for fid in fids}
    if not family_ids:
        return
    birthdays = (
        db.query(FamilyBirthday)
        .filter(FamilyBirthday.family_id.in_(family_ids), FamilyBirthday.month == on.month)
        .order_by(FamilyBirthday.id)
        .all()
    )
    for birthday in birthdays:
        if next_birthday_date(birthday.month, birthday.day, on) != on:
            continue
        member, recipient = birthday_recipient(db, birthday)
        if gift_under_way(db, birthday.family_id, recipient, on):
            continue
        for uid, fam_ids in user_families.items():
            if birthday.family_id not in fam_ids or (uid, birthday.family_id) not in adults or uid == member:
                continue
            deliver(
                uid, birthday.family_id, "gift_reminder",
                birthday.person_name,
                lambda lang: reminder_text(lang, "gift_nothing_yet", date=short_date(lang, on)),
                f"/gifts?occasion=birthday:{on.isoformat()}:{recipient}", "gift_occasion", birthday.id,
                _gift_trigger_key(birthday.id, on),
            )


def deliver_meal_reminders(db, *, tomorrow, user_families: dict[int, list[int]], deliver) -> None:
    """Tells the grown-ups what tomorrow's meals still need from the shop."""
    from app.modules.meal_plans_router import missing_meal_ingredients

    adults = {
        (member.user_id, member.family_id)
        for member in db.query(Membership).filter(Membership.is_adult.is_(True)).all()
    }
    family_ids = {fid for fids in user_families.values() for fid in fids}
    if not family_ids:
        return
    plans = (
        db.query(MealPlan)
        .filter(MealPlan.family_id.in_(family_ids), MealPlan.plan_date == tomorrow)
        .order_by(MealPlan.id)
        .all()
    )
    has_list = {
        fid for (fid,) in db.query(ShoppingList.family_id).filter(ShoppingList.family_id.in_(family_ids)).distinct()
    }
    for plan in plans:
        if plan.family_id not in has_list:
            continue
        missing = missing_meal_ingredients(db, plan)
        if not missing:
            continue
        items = ", ".join(entry["name"].strip() for entry in missing[:MEAL_REMINDER_ITEMS])
        if len(missing) > MEAL_REMINDER_ITEMS:
            items += ", …"
        for uid, fam_ids in user_families.items():
            if plan.family_id not in fam_ids or (uid, plan.family_id) not in adults:
                continue
            deliver(
                uid, plan.family_id, "meal_reminder",
                plan.meal_name,
                lambda lang, items=items: reminder_text(lang, "meal_missing", items=items),
                "/meal_plans", "meal_plan", plan.id,
                _meal_trigger_key(plan.id, tomorrow),
            )


def deliver_snoozed_reminders(db, *, now: datetime, local_now: datetime, get_pref) -> set[int]:
    """Sends the reminders whose snooze has run out, once each.

    Tasks done or deleted in the meantime and removed events are dropped;
    quiet hours postpone the reminder to a later run.
    """
    notified: set[int] = set()
    due = (
        db.query(ReminderSnooze)
        .filter(ReminderSnooze.delivered_at.is_(None), ReminderSnooze.remind_at <= now)
        .order_by(ReminderSnooze.remind_at.asc())
        .limit(200)
        .all()
    )
    for snooze in due:
        if snooze.source_type == "task":
            task = db.query(Task).filter(Task.id == snooze.source_id).first()
            if task is None or task.status != "open":
                snooze.delivered_at = now
                continue
        elif snooze.source_type == "event":
            if db.query(CalendarEvent.id).filter(CalendarEvent.id == snooze.source_id).first() is None:
                snooze.delivered_at = now
                continue
        pref = get_pref(snooze.user_id)
        if not pref.reminders_enabled:
            snooze.delivered_at = now
            continue
        if _in_quiet_hours(pref.quiet_start, pref.quiet_end, local_now):
            continue
        snooze.delivered_at = now
        db.add(Notification(
            user_id=snooze.user_id, family_id=snooze.family_id, type=snooze.notification_type,
            title=snooze.title, body=snooze.body, link=snooze.link,
        ))
        notified.add(snooze.user_id)
        push_allowed, _ = should_push_notification_type(pref, snooze.notification_type)
        if not push_allowed:
            continue
        try:
            send_push_for_user(
                db, snooze.user_id, snooze.title, snooze.body or "", snooze.link,
                **reminder_push_actions(
                    snooze.user_id, snooze.family_id, snooze.source_type, snooze.source_id,
                    snooze.notification_type, snooze.title, snooze.body, snooze.link,
                    user_language(db, snooze.user_id),
                ),
            )
        except Exception:
            logger.exception("Snoozed reminder push failed for user %s", snooze.user_id)
    return notified


def start_notification_job():
    scheduler = get_scheduler()
    existing = scheduler.get_job(NOTIFICATION_JOB_ID)
    if existing:
        scheduler.remove_job(NOTIFICATION_JOB_ID)
    scheduler.add_job(
        _check_notifications,
        trigger=IntervalTrigger(minutes=1),
        id=NOTIFICATION_JOB_ID,
        replace_existing=True,
    )
    logger.info("Notification check job started (every 1 min).")


def _refresh_active_calendar_subscriptions():
    from app.modules.calendar_router import _refresh_calendar_subscription

    db = SessionLocal()
    try:
        subscriptions = (
            db.query(CalendarSubscription)
            .filter(CalendarSubscription.status == "active")
            .order_by(CalendarSubscription.last_synced_at.asc().nullsfirst(), CalendarSubscription.id.asc())
            .limit(25)
            .all()
        )
        for subscription in subscriptions:
            fallback_membership = (
                db.query(Membership)
                .filter(Membership.family_id == subscription.family_id)
                .order_by(Membership.user_id.asc())
                .first()
            )
            user_id = subscription.created_by_user_id or (fallback_membership.user_id if fallback_membership else None)
            if user_id is None:
                logger.warning("Skipping calendar subscription %s without a usable owner", subscription.id)
                continue
            _refresh_calendar_subscription(
                db,
                subscription=subscription,
                user_id=user_id,
            )
        if subscriptions:
            logger.info("Refreshed %s calendar subscription(s).", len(subscriptions))
    except Exception:
        db.rollback()
        logger.exception("Calendar subscription refresh failed")
    finally:
        db.close()


def start_calendar_subscription_refresh_job():
    scheduler = get_scheduler()
    existing = scheduler.get_job(CALENDAR_SUBSCRIPTION_REFRESH_JOB_ID)
    if existing:
        scheduler.remove_job(CALENDAR_SUBSCRIPTION_REFRESH_JOB_ID)
    scheduler.add_job(
        _refresh_active_calendar_subscriptions,
        trigger=IntervalTrigger(hours=6),
        id=CALENDAR_SUBSCRIPTION_REFRESH_JOB_ID,
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    logger.info("Calendar subscription refresh job started (every 6 hours).")


_applied_backup_schedule: tuple[str, int] | None = None


def sync_backup_schedule(db_url: str, backup_dir: str) -> bool:
    """Apply the stored backup schedule if it changed.

    Only the process that runs the scheduler applies it, so a change saved
    through another worker reaches it through the database. Returns True when
    the schedule was (re)configured.
    """
    global _applied_backup_schedule
    from app.core.utils import get_setting

    db = SessionLocal()
    try:
        wanted = (get_setting(db, "backup_schedule", "off"), int(get_setting(db, "backup_retention", "7")))
    finally:
        db.close()
    if wanted == _applied_backup_schedule:
        return False
    configure_backup_schedule(wanted[0], db_url, backup_dir, wanted[1])
    _applied_backup_schedule = wanted
    return True


def start_backup_schedule_sync_job(db_url: str, backup_dir: str):
    sync_backup_schedule(db_url, backup_dir)
    get_scheduler().add_job(
        sync_backup_schedule,
        trigger=IntervalTrigger(minutes=1),
        id=BACKUP_SCHEDULE_SYNC_JOB_ID,
        args=[db_url, backup_dir],
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )


def start_scheduler():
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started.")


def shutdown_scheduler():
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down.")
