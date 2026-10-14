"""Dashboard overview, role-aware."""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify

from extensions import db
from models import (AttendanceLog, AuditLog, Certificate, Event, Feedback, HostingRequest,
                    Job, JuryAssignment, Notification, Registration, Score, User)
from utils.helpers import CATEGORY_META, humanize
from utils.security import current_user, is_admin
from utils.serializers import event_json

dashboard_bp = Blueprint('dashboard', __name__)

ACTIVITY_ICONS = (
    ('certificate', ('certificate',), 'amber'),
    ('sparkles', ('result', 'score', 'released', 'ai '), 'blue'),
    ('user', ('checked in', 'sign', 'account', 'registration', 'waitlist'), 'teal'),
    ('alert', ('cancel', 'failed', 'reject', 'suspend'), 'rose'),
    ('check', ('approv', 'publish', 'complet', 'created', 'updated', 'submitted'), 'green'),
)


def _activity_from_audit(row):
    action = (row.action or '').lower()
    icon, tone = 'clock', 'blue'
    for candidate, keywords, candidate_tone in ACTIVITY_ICONS:
        if any(k in action for k in keywords):
            icon, tone = candidate, candidate_tone
            break
    return {'title': row.action or '', 'detail': row.target or '', 'time': humanize(row.timestamp), 'tone': tone, 'icon': icon}


def _trend():
    now = datetime.utcnow()
    months = []
    cursor = now.replace(day=1)
    for _ in range(6):
        months.append(cursor)
        cursor = (cursor - timedelta(days=1)).replace(day=1)
    months.reverse()
    result = []
    for m in months:
        end = (m + timedelta(days=32)).replace(day=1)
        count = Registration.query.filter(Registration.registered_at >= m,
                                          Registration.registered_at < end).count()
        result.append({'label': m.strftime('%b'), 'value': count})
    return result


def _stats_for(user):
    if is_admin(user):
        pending = Event.query.filter(Event.status == 'Pending').count()
        hosting = HostingRequest.query.filter_by(status='Pending').count()
        failed_jobs = Job.query.filter_by(status='Failed').count()
        return [
            {'label': 'Awaiting review', 'value': str(pending), 'detail': 'Events needing a decision', 'icon': 'calendar', 'accent': 'amber'},
            {'label': 'Hosting requests', 'value': str(hosting), 'detail': 'Pending host submissions', 'icon': 'ticket', 'accent': 'blue'},
            {'label': 'Failed jobs', 'value': str(failed_jobs), 'detail': 'Check jobs & failed sends', 'icon': 'alert', 'accent': 'rose'},
            {'label': 'Users', 'value': str(User.query.count()), 'detail': 'Registered accounts', 'icon': 'users', 'accent': 'teal'},
        ]
    regs = Registration.query.filter_by(user_id=user.id).all() if user else []
    upcoming = [r for r in regs if r.status in ('Confirmed', 'Registered')]
    waitlisted = [r for r in regs if r.status in ('Waitlisted', 'Offered')]
    hosted = Event.query.filter_by(host_id=user.id).count() if user else 0
    hosting_requests = HostingRequest.query.filter_by(user_id=user.id).count() if user else 0
    certs = Certificate.query.filter(db.or_(Certificate.recipient_id == (user.id if user else ''),
                                            Certificate.recipient_name == (user.name if user else '')),
                                     Certificate.status == 'Valid').count()
    attended_ids = {r.event_id for r in regs if r.attendance_status == 'Checked in'}
    feedback_ids = {f.event_id for f in Feedback.query.filter_by(user_id=(user.id if user else '')).all()}
    pending_feedback = len(attended_ids - feedback_ids)
    return [
        {'label': 'Upcoming events', 'value': str(len(upcoming)), 'detail': 'Next: ' + (upcoming[0].event_title if upcoming else 'Nothing scheduled yet'), 'icon': 'calendar', 'accent': 'blue'},
        {'label': 'Waitlist', 'value': str(len(waitlisted)), 'detail': 'Offers expire in 48h' if waitlisted else 'No waitlist entries', 'icon': 'ticket', 'accent': 'amber'},
        {'label': 'My hosted events', 'value': str(hosted), 'detail': str(hosting_requests) + ' hosting request(s)', 'icon': 'award', 'accent': 'teal'},
        {'label': 'Feedback pending', 'value': str(pending_feedback), 'detail': 'Events awaiting your review', 'icon': 'users', 'accent': 'rose'},
    ]


def _quick_actions(role):
    if role == 'admin':
        return [{'label': 'Review pending events', 'detail': 'Decide on submissions'},
                {'label': 'Review hosting requests', 'detail': 'Approve or reject host-submitted events'},
                {'label': 'Open audit log', 'detail': 'Recent platform activity'}]
    return [{'label': 'Discover events', 'detail': 'Find something to join'},
            {'label': 'Host an event', 'detail': 'Submit a hosting request'},
            {'label': 'View my registrations', 'detail': 'Tickets and QR passes'},
            {'label': 'Download certificates', 'detail': 'After attending events'}]


@dashboard_bp.route('/dashboard', methods=['GET'])
def overview():
    user = current_user()
    role = 'admin' if is_admin(user) else 'user'

    if is_admin(user):
        events = Event.query.order_by(Event.created_at.desc()).limit(8).all()
    else:
        regs = Registration.query.filter_by(user_id=user.id).all() if user else []
        event_ids = {r.event_id for r in regs} if user else set()
        hosted_ids = {e.id for e in Event.query.filter_by(host_id=user.id).all()} if user else set()
        all_ids = list(event_ids | hosted_ids)
        events = Event.query.filter(Event.id.in_(all_ids)).order_by(Event.created_at.desc()).limit(8).all() if all_ids else []

    category_counts = {}
    for e in Event.query.all():
        category_counts[e.category or 'Other'] = category_counts.get(e.category or 'Other', 0) + 1
    breakdown = [{'label': name, 'value': count,
                  'color': CATEGORY_META.get(name, {'color': '#2B4BD8'})['color']}
                 for name, count in sorted(category_counts.items(), key=lambda kv: -kv[1])]

    attendance_data = []
    for e in events:
        attendance_data.append({'label': (e.title or '')[:16], 'value': AttendanceLog.query.filter_by(event_id=e.id).count()})

    audits = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(6).all()
    return jsonify({
        'summaryStats': _stats_for(user),
        'registrationTrend': _trend(),
        'categoryBreakdown': breakdown,
        'attendanceData': attendance_data,
        'recentActivities': [_activity_from_audit(a) for a in audits],
        'dashboardEvents': [event_json(e) for e in events],
        'quickActions': _quick_actions(role),
    })