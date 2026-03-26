import logging
from datetime import datetime, timedelta, date

from app.core.utils import utcnow

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.backup import create_backup, enforce_retention

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


def _check_notifications():
    from app.database import SessionLocal
    from app.models import (
        CalendarEvent, FamilyBirthday, Membership, Notification,
        NotificationPreference, NotificationSentLog, Task,
    )

    db = SessionLocal()
    try:
        now = utcnow()
        today = now.date()
        tomorrow = today + timedelta(days=1)

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

        def already_sent(source_type: str, source_id: int, uid: int) -> bool:
            return db.query(NotificationSentLog).filter(
                NotificationSentLog.source_type == source_type,
                NotificationSentLog.source_id == source_id,
                NotificationSentLog.user_id == uid,
                NotificationSentLog.sent_at >= datetime(today.year, today.month, today.day),
            ).first() is not None

        def create_notif(uid: int, fid: int, ntype: str, title: str, body: str, link: str | None, source_type: str, source_id: int):
            pref = get_pref(uid)
            if _in_quiet_hours(pref.quiet_start, pref.quiet_end, now):
                return
            notif = Notification(
                user_id=uid, family_id=fid, type=ntype,
                title=title, body=body, link=link,
            )
            db.add(notif)
            log = NotificationSentLog(source_type=source_type, source_id=source_id, user_id=uid)
            db.add(log)
            if pref.push_enabled:
                try:
                    from app.core.push import send_push_for_user
                    send_push_for_user(db, uid, title, body, link)
                except Exception:
                    logger.exception("Push notification failed for user %s", uid)

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
                    CalendarEvent.starts_at > now,
                    CalendarEvent.starts_at <= window,
                    CalendarEvent.all_day == False,
                )
                .all()
            )
            for ev in events:
                if not already_sent("event", ev.id, uid):
                    mins = int((ev.starts_at - now).total_seconds() / 60)
                    create_notif(
                        uid, ev.family_id, "event_reminder",
                        ev.title,
                        f"Starts in {mins} minutes",
                        "calendar", "event", ev.id,
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
                if not already_sent("task", task.id, uid):
                    create_notif(
                        uid, task.family_id, "task_due",
                        task.title,
                        "Task is overdue",
                        "tasks", "task", task.id,
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
                if not already_sent("birthday", bd.id, uid):
                    create_notif(
                        uid, bd.family_id, "birthday",
                        bd.person_name,
                        f"Birthday tomorrow ({tomorrow.strftime('%b %d')})",
                        "dashboard", "birthday", bd.id,
                    )

        db.commit()
        # Invalidate notification count caches for affected users
        from app.core import cache
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
