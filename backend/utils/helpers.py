"""Shared helpers: codes, audits, notifications, humanised times."""
import random
import string
from datetime import datetime

from extensions import db
from models import AttendanceLog, AuditLog, Event, Notification, Registration, User

CATEGORY_META = {
    'Hackathon': {'tone': 'blue', 'color': '#2B4BD8'},
    'Workshop': {'tone': 'teal', 'color': '#0E9384'},
    'Conference': {'tone': 'purple', 'color': '#6941C6'},
    'Competition': {'tone': 'orange', 'color': '#E4780C'},
    'Community': {'tone': 'green', 'color': '#067647'},
}

STATUS_TONES = {
    'Draft': 'slate',
    'Pending': 'amber',
    'Changes requested': 'amber',
    'Published': 'blue',
    'Registration open': 'blue',
    'Registration closed': 'slate',
    'Ongoing': 'green',
    'Completed': 'slate',
    'Cancelled': 'red',
    'Rejected': 'red',
}


def initials_of(title):
    words = [w for w in str(title or '').split() if w]
    if not words:
        return 'WM'
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[1][0]).upper()


def category_meta(category):
    return CATEGORY_META.get(category, {'tone': 'blue', 'color': '#2B4BD8'})


def ticket_code():
    alphabet = string.ascii_uppercase + string.digits
    return 'WM-' + ''.join(random.choice(alphabet) for _ in range(4)) + '-' + ''.join(random.choice(alphabet) for _ in range(4))


def credential_code():
    alphabet = string.ascii_uppercase + string.digits
    return 'WM-CERT-' + ''.join(random.choice(alphabet) for _ in range(8))


def guest_token(prefix='jury'):
    alphabet = string.ascii_lowercase + string.digits
    return prefix + '-' + ''.join(random.choice(alphabet) for _ in range(10))


def parse_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


def humanize(dt):
    if not dt:
        return ''
    delta = datetime.utcnow() - dt
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return 'just now'
    if seconds < 3600:
        return str(seconds // 60) + 'm ago'
    if seconds < 86400:
        return str(seconds // 3600) + 'h ago'
    if seconds < 86400 * 7:
        return str(seconds // 86400) + 'd ago'
    return dt.strftime('%b %d, %Y')


def audit(action, user=None, target='', status='Success', ip=''):
    try:
        entry = AuditLog(
            action=action,
            user=(user.name if hasattr(user, 'name') else str(user or 'system')),
            target=target,
            status=status,
            ip=ip or '',
        )
        db.session.add(entry)
        db.session.commit()
        return entry
    except Exception:
        db.session.rollback()
        return None


def notify(user_id, title, message, ntype='reminder'):
    try:
        row = Notification(user_id=user_id or '', title=title, message=message, type=ntype)
        db.session.add(row)
        db.session.commit()
        return row
    except Exception:
        db.session.rollback()
        return None


def notify_admins(title, message, ntype='approval'):
    for admin in User.query.filter_by(role='admin').all():
        notify(admin.id, title, message, ntype)


def refresh_event_counts(event):
    if not event:
        return
    rows = Registration.query.filter_by(event_id=event.id).all()
    confirmed = [r for r in rows if r.status in ('Confirmed', 'Registered')]
    waitlisted = [r for r in rows if r.status in ('Waitlisted', 'Offered')]
    event.registered_num = len(confirmed)
    event.waitlist_num = len(waitlisted)
    event.capacity_num = event.seats or event.capacity_num or 100
    db.session.commit()


def promote_waitlist(event, mails=None):
    """Offer the next open seat to the first waitlisted registration."""
    if not event:
        return None
    confirmed = Registration.query.filter(
        Registration.event_id == event.id,
        Registration.status.in_(['Confirmed', 'Registered']),
    ).count()
    if confirmed >= (event.seats or 0):
        return None
    nxt = Registration.query.filter_by(event_id=event.id, status='Waitlisted') \
        .order_by(Registration.waitlist_position.asc(), Registration.registered_at.asc()).first()
    if not nxt:
        return None
    from datetime import timedelta
    nxt.status = 'Offered'
    nxt.offer_expires_at = datetime.utcnow() + timedelta(hours=48)
    db.session.commit()
    notify(nxt.user_id, 'Waitlist offer for ' + (event.title or 'event'),
           'A seat opened up. Accept your waitlist offer before it expires.', 'reminder')
    if mails is not None:
        from utils.mailer import send_mail
        send_mail(nxt.user_email, 'You are off the waitlist: ' + (event.title or ''),
                  'Hi ' + (nxt.user_name or 'there') + ',\n\nA seat opened up for ' + (event.title or 'the event')
                  + '. Confirm before the offer expires.\n\n— WayMark', kind='reminder')
    refresh_event_counts(event)
    return nxt


def attendance_count(event_id):
    return AttendanceLog.query.filter_by(event_id=event_id).count()


def event_or_404(event_id):
    return Event.query.get(event_id)