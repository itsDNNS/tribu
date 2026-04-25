import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from sqlalchemy import or_

from app.core import cache
from app.core.backup import create_backup, enforce_retention
from app.core.clock import utcnow
from app.core.push import send_push_for_user
from app.core.recurrence import expand_event
from app.database import SessionLocal
from app.models import (
    CalendarEvent, FamilyBirthday, Membership, Notification,
    NotificationPreference, NotificationSentLog, Task,
)

logger = logging.getLogger(__name__)

BACKUP_JOB_ID = "scheduled_backup"
NOTIFICATION_JOB_ID = "check_notifications"

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
        now = utcnow()
        tomorrow = now.date() + timedelta(days=1)

        memberships = db.query(Membership).all()
        user_families: dict[int, list[int]] = {}
        for m in memberships:
            user_families.setdefault(m.user_id, []).append(m.family_id)

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
            start_of_day = datetime(now.year, now.month, now.day)
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
            legacy.delivered_at = legacy.delivered_at or legacy.sent_at or now
            legacy.last_attempt_at = legacy.last_attempt_at or legacy.sent_at or now
            legacy.last_error = None
            return True

        def deliver(
            uid: int,
            fid: int,
            ntype: str,
            title: str,
            body: str,
            link: str | None,
            source_type: str,
            source_id: int,
            trigger_key: str,
        ) -> None:
            """Idempotent reminder delivery for a (user, trigger_key) pair.

            On first invocation creates exactly one in-app Notification and one
            NotificationSentLog row. On retry runs reuses the existing log,
            does NOT create another in-app Notification, but may re-attempt
            push if push is enabled and the previous attempt failed.
            """
            pref = get_pref(uid)
            if _in_quiet_hours(pref.quiet_start, pref.quiet_end, now):
                return

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
            if pref.push_enabled:
                try:
                    push_result = send_push_for_user(db, uid, title, body, link)
                except Exception as exc:
                    logger.exception("Push notification failed for user %s", uid)
                    log.delivery_attempts = (log.delivery_attempts or 0) + 1
                    log.last_attempt_at = now
                    log.last_error = f"unexpected: {type(exc).__name__}: {exc}"[:500]
                    log.status = "failed"
                    return

            log.delivery_attempts = (log.delivery_attempts or 0) + 1
            log.last_attempt_at = now

            if push_result is None:
                # Push disabled — in-app delivery is the only channel and it
                # succeeded the moment we created the Notification row.
                log.status = "delivered"
                log.delivered_at = now
                log.last_error = None
                return

            if push_result.attempted == 0:
                # No subscriptions / VAPID not configured / library missing.
                # In-app notification still landed, so the reminder reached
                # the user via the only channel that was active.
                log.status = "delivered"
                log.delivered_at = now
                log.last_error = (
                    f"push_skipped:{push_result.skipped_reason}"
                    if push_result.skipped_reason
                    else None
                )
                return

            if push_result.succeeded > 0:
                log.status = "delivered"
                log.delivered_at = now
                log.last_error = (
                    "; ".join(push_result.errors)[:500] if push_result.errors else None
                )
            elif push_result.failed == 0:
                # Only gone subscriptions were removed. The in-app
                # notification exists and there is no transient endpoint left
                # to retry, so the reminder is complete.
                log.status = "delivered"
                log.delivered_at = now
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
            window = now + timedelta(minutes=pref.reminder_minutes)
            events = (
                db.query(CalendarEvent)
                .filter(
                    CalendarEvent.family_id.in_(fam_ids),
                    CalendarEvent.all_day == False,
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
            for ev in events:
                occurrences = (
                    expand_event(ev, range_start=now, range_end=window + timedelta(seconds=1))
                    if ev.recurrence
                    else [{"starts_at": ev.starts_at}]
                )
                for occurrence in occurrences:
                    starts_at = occurrence["starts_at"]
                    if starts_at <= now or starts_at > window:
                        continue
                    mins = int((starts_at - now).total_seconds() / 60)
                    deliver(
                        uid, ev.family_id, "event_reminder",
                        ev.title,
                        f"Starts in {mins} minutes",
                        "calendar", "event", ev.id,
                        _event_trigger_key(ev.id, starts_at),
                    )


        # 2. Overdue tasks
        for uid, fam_ids in user_families.items():
            overdue = (
                db.query(Task)
                .filter(
                    Task.family_id.in_(fam_ids),
                    Task.status == "open",
                    Task.due_date != None,
                    Task.due_date < now,
                )
                .all()
            )
            for task in overdue:
                deliver(
                    uid, task.family_id, "task_due",
                    task.title,
                    "Task is overdue",
                    "tasks", "task", task.id,
                    _task_trigger_key(task.id, task.due_date),
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
                deliver(
                    uid, bd.family_id, "birthday",
                    bd.person_name,
                    f"Birthday tomorrow ({tomorrow.strftime('%b %d')})",
                    "dashboard", "birthday", bd.id,
                    _birthday_trigger_key(bd.id, tomorrow),
                )

        db.commit()
        # Invalidate notification count caches for affected users
        for uid in user_families:
            cache.invalidate(f"tribu:notif_count:{uid}")
        logger.info("Notification check completed.")

    except Exception:
        db.rollback()
        logger.exception("Notification check failed")
    finally:
        db.close()


def start_notification_job():
    scheduler = get_scheduler()
    existing = scheduler.get_job(NOTIFICATION_JOB_ID)
    if existing:
        scheduler.remove_job(NOTIFICATION_JOB_ID)
    scheduler.add_job(
        _check_notifications,
        trigger=IntervalTrigger(minutes=5),
        id=NOTIFICATION_JOB_ID,
        replace_existing=True,
    )
    logger.info("Notification check job started (every 5 min).")


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
