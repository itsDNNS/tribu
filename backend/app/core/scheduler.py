import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.backup import create_backup, enforce_retention

logger = logging.getLogger(__name__)

BACKUP_JOB_ID = "scheduled_backup"

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
