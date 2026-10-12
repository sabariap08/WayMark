"""Dashboard overview, role-aware."""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify

from extensions import db
from models import (AttendanceLog, AuditLog, Certificate, Event, Feedback, Job,
                    JuryAssignment, Notification, Registration, Score, User)
from utils.helpers import CATEGORY_META, humanize
from utils.security import current_user
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
    role = (user.role if user else 'participant') or 'participant'
    if role == 'host':
        my_events = Event.query.filter_by(host_id=user.id).all()
        event_ids = [e.id for e in my_events]
        regs = Registration.query.filter(Registration.event_id.in_(event_ids)).count() if event_ids else 0
        checkins = AttendanceLog.query.filter(AttendanceLog.event_id.in_(event_ids)).count() if event_ids else 0
        pending = Event.query.filter(Event.host_id == user.id, Event.status == 'Pending').count()
        return [
            {'label': 'My events', 'value': str(len(my_events)), 'detail': 'Across all statuses', 'icon': 'calendar', 'accent': 'blue'},
            {'label': 'Registrations', 'value': str(regs), 'detail': 'On your events', 'icon': 'ticket', 'accent': 'teal'},
            {'label': 'Check-ins', 'value': str(checkins), 'detail': 'Across live events', 'icon': 'users', 'accent': 'green'},
            {'label': 'Pending review', 'value': str(pending), 'detail': 'Awaiting approval', 'icon': 'award', 'accent': 'amber'},
        ]
    if role == 'jury':
        from models import Submission
        assignments = JuryAssignment.query.filter_by(jury_member_id=user.id).all()
        subs_count = 0
        for a in assignments:
            subs_count += Submission.query.filter_by(event_id=a.event_id).count()
        scored = Score.query.filter_by(jury_member_id=user.id).count()
        return [
            {'label': 'Assigned evaluations', 'value': str(subs_count), 'detail': 'Across active events', 'icon': 'calendar', 'accent': 'blue'},
            {'label': 'Scored', 'value': str(scored), 'detail': 'Submissions finalised', 'icon': 'ticket', 'accent': 'teal'},
            {'label': 'Remaining', 'value': str(max(subs_count - scored, 0)), 'detail': 'Awaiting your scores', 'icon': 'users', 'accent': 'amber'},
        ]
    if role == 'admin':
        pending = Event.query.filter(Event.status == 'Pending').count()
        failed_jobs = Job.query.filter_by(status='Failed').count()
        return [
            {'label': 'Awaiting review', 'value': str(pending), 'detail': 'Events needing a decision', 'icon': 'calendar', 'accent': 'amber'},
            {'label': 'Failed jobs', 'value': str(failed_jobs), 'detail': 'Check jobs & failed sends', 'icon': 'ticket', 'accent': 'rose'},
            {'label': 'Platform events', 'value': str(Event.query.count()), 'detail': 'Across all hosts', 'icon': 'award', 'accent': 'blue'},
            {'label': 'Users', 'value': str(User.query.count()), 'detail': 'Registered accounts', 'icon': 'users', 'accent': 'teal'},
        ]
    regs = Registration.query.filter_by(user_id=user.id).all() if user else []
    upcoming = [r for r in regs if r.status in ('Confirmed', 'Registered')]
    waitlisted = [r for r in regs if r.status in ('Waitlisted', 'Offered')]
    certs = Certificate.query.filter(db.or_(Certificate.recipient_id == (user.id if user else ''),
                                            Certificate.recipient_name == (user.name if user else '')),
                                     Certificate.status == 'Valid').count()
    attended_ids = {r.event_id for r in regs if r.attendance_status == 'Checked in'}
    feedback_ids = {f.event_id for f in Feedback.query.filter_by(user_id=(user.id if user else '')).all()}
    pending_feedback = len(attended_ids - feedback_ids)
    return [
        {'label': 'Upcoming events', 'value': str(len(upcoming)), 'detail': 'Next: ' + (upcoming[0].event_title if upcoming else 'Nothing scheduled yet'), 'icon': 'calendar', 'accent': 'blue'},
        {'label': 'Waitlist', 'value': str(len(waitlisted)), 'detail': 'Offers expire in 48h' if waitlisted else 'No waitlist entries', 'icon': 'ticket', 'accent': 'amber'},
        {'label': 'Certificates ready', 'value': str(certs), 'detail': 'Ready to download & verify', 'icon': 'award', 'accent': 'teal'},
        {'label': 'Feedback pending', 'value': str(pending_feedback), 'detail': 'Events awaiting your review', 'icon': 'users', 'accent': 'rose'},
    ]


def _quick_actions(role):
    if role == 'admin':
        return [{'label': 'Review pending events', 'detail': 'Decide on submissions'},
                {'label': 'Check failed jobs', 'detail': 'Retry email sends'},
                {'label': 'Open audit log', 'detail': 'Recent platform activity'}]
    if role == 'host':
        return [{'label': 'Create a new event', 'detail': 'Start the 5-step wizard'},
                {'label': 'Open event workspace', 'detail': 'Registrations, attendance, results'},
                {'label': 'Compose a message', 'detail': 'Email your registrants'}]
    if role == 'jury':
        return [{'label': 'Open scoring app', 'detail': 'Score assigned submissions'},
                {'label': 'Review the rubric', 'detail': 'Criteria and weights'}]
    return [{'label': 'Discover events', 'detail': 'Find something to join'},
            {'label': 'View my registrations', 'detail': 'Tickets and QR passes'},
            {'label': 'Download certificates', 'detail': 'After attending events'}]


@dashboard_bp.route('/dashboard', methods=['GET'])
def overview():
    user = current_user()
    role = (user.role if user else 'participant') or 'participant'

    if role == 'host':
        events = Event.query.filter_by(host_id=user.id).order_by(Event.created_at.desc()).limit(8).all()
    elif role == 'participant':
        regs = Registration.query.filter_by(user_id=user.id).all() if user else []
        event_ids = [r.event_id for r in regs]
        events = Event.query.filter(Event.id.in_(event_ids)).order_by(Event.created_at.desc()).limit(8).all() if event_ids else []
    else:
        events = Event.query.order_by(Event.created_at.desc()).limit(8).all()

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