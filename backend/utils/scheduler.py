"""Background job scheduler (thread-based).

Catches up on due jobs at startup and can auto-complete events that ended
>= 24 hours ago with no host action (matches T14). Each tick is idempotent;
jobs are rows in wm_jobs and processed in-order.

The worker lives inside the same service (no message broker).
"""
import atexit
import threading
import time
from datetime import datetime, timedelta

from extensions import db
from models import Event, Job, MailMessage, Registration
from utils.helpers import audit
from utils.mailer import send_mail

_lock = threading.Lock()
_thread = None
_stop = threading.Event()


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def auto_complete_events(app):
    """T14: if an event ended >= 25 hours ago and never completed/cancelled,
    the scheduler marks it Completed and opens feedback."""
    with app.app_context():
        now = datetime.utcnow()
        today = now.date()
        for event in Event.query.all():
            if (event.status or '') in ('Completed', 'Cancelled', 'Rejected'):
                continue
            end = _parse_date(getattr(event, 'end_date', None)) or _parse_date(getattr(event, 'date', None))
            if not end:
                continue
            if today - end < timedelta(hours=25):
                continue
            event.status = 'Completed'
            event.updated_at = now
            db.session.add(Job(
                event_id=event.id, event_title=event.title, type='auto-complete',
                label='Auto-completed (ended >25h ago)', subject='Auto-completed',
                audience='System', recipients_count=0, status='Sent'))
            db.session.commit()


def run_due_jobs(app, limit=50):
    """Process due mail jobs (retry/finalize). Idempotent."""
    with app.app_context():
        now = datetime.utcnow()
        jobs = Job.query.filter(Job.status.in_(['Queued', 'Failed'])).order_by(Job.created_at.asc()).limit(limit).all()
        processed = 0
        for job in jobs:
            mails = MailMessage.query.filter_by(job_id=job.id).all()
            if not mails:
                job.status = 'Sent'
                job.error = ''
                job.updated_at = now
                processed += 1
                continue
            sent = 0
            for mail in mails:
                if (mail.status or '') == 'Sent':
                    sent += 1
                    continue
                row = send_mail(mail.to_email, mail.subject, mail.body, kind=mail.kind, job_id=job.id)
                if row and row.status == 'Sent':
                    sent += 1
            job.status = 'Sent' if sent >= len(mails) else 'Failed'
            job.error = '' if job.status == 'Sent' else 'Some messages not delivered (mail not configured or failed).'
            job.updated_at = now
            processed += 1
        db.session.commit()
        return processed


def tick(app):
    auto_complete_events(app)
    run_due_jobs(app)


def _loop(app, interval_seconds):
    while not _stop.is_set():
        try:
            tick(app)
        except Exception:
            pass
        _stop.wait(interval_seconds)


def start_scheduler(app, interval_seconds=60):
    global _thread
    if _thread and _thread.is_alive():
        return _thread
    _stop.clear()
    _thread = threading.Thread(target=_loop, args=(app, interval_seconds), daemon=True)
    _thread.start()
    atexit.register(stop_scheduler)
    return _thread


def stop_scheduler():
    _stop.set()
