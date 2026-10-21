"""Live operations center: real-time event metrics, incident management, and
schedule-change propagation with idempotent notification jobs."""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from extensions import db
from models import (AttendanceLog, CheckInException, Event, Incident, Job, Notification,
                    Registration, Resource, ResourceBooking, Score, Session, Submission,
                    Task, User, Volunteer)
from utils.helpers import audit, notify_admins, parse_bool
from utils.schedule_time import to_minutes, valid_day, valid_time
from utils.security import can_manage_event, current_user, require_event_manager
from utils.serializers import incident_json, job_json, session_json
from utils.webhooks import emit

operations_bp = Blueprint('operations', __name__)

SEVERITIES = ('Low', 'Medium', 'High', 'Critical')
INCIDENT_STATUSES = ('Open', 'Investigating', 'Resolved', 'Closed')
OPEN_INCIDENT_STATUSES = ('Open', 'Investigating')
LEGAL_TRANSITIONS = {
    'Open': {'Investigating', 'Resolved', 'Closed'},
    'Investigating': {'Resolved'},
    'Resolved': {'Closed'},
    'Closed': set(),
}
OPEN_TASK_STATUSES = ('Open', 'In progress', 'Blocked')
CLOSED_TASK_STATUSES = ('Done', 'Cancelled')
CRITICAL_ALERT_TITLE = 'Critical incident reported'
ROOM_KINDS = ('Room', 'Auditorium', 'Laboratory')


def _guard(event):
    user = current_user()
    if not user:
        return jsonify({'message': 'Authentication required.'}), 401
    if not can_manage_event(user, event):
        return jsonify({'message': 'You can only manage events you host.'}), 403
    return None


def _event_day(event, now):
    for value in (getattr(event, 'start_date', '') or '', event.date or ''):
        if valid_day(value):
            return str(value).strip()
    return now.strftime('%Y-%m-%d')


def _start_dt(session):
    if valid_day(session.day) and valid_time(session.start_time):
        return datetime.strptime(session.day + ' ' + session.start_time, '%Y-%m-%d %H:%M')
    return None


def _notify_critical_once(incident):
    admins = User.query.filter_by(role='admin').all()
    if not admins:
        return
    marker = '%' + (incident.id or '') + '%'
    exists = Notification.query.filter(Notification.user_id.in_([a.id for a in admins]),
                                       Notification.type == 'alert',
                                       Notification.message.like(marker)).first()
    if exists:
        return
    message = ('Incident "' + (incident.title or '') + '" (' + (incident.id or '')
               + ') was reported as CRITICAL'
               + ((' at ' + incident.location) if incident.location else '')
               + '. Immediate attention required.')
    notify_admins(CRITICAL_ALERT_TITLE, message, 'alert')


def _metrics(event):
    now = datetime.utcnow()
    real_today = now.strftime('%Y-%m-%d')
    now_hm = now.strftime('%H:%M')
    event_day = _event_day(event, now)
    ref_day = event_day if event_day and event_day <= real_today else real_today

    regs = Registration.query.filter_by(event_id=event.id).all()
    logs = AttendanceLog.query.filter_by(event_id=event.id).all()
    sessions = Session.query.filter_by(event_id=event.id).all()
    volunteers = Volunteer.query.filter_by(event_id=event.id).all()
    tasks = Task.query.filter_by(event_id=event.id).all()
    incidents = Incident.query.filter_by(event_id=event.id).all()
    jobs = Job.query.filter_by(event_id=event.id).all()
    submissions = Submission.query.filter_by(event_id=event.id).all()
    scored_ids = {row.submission_id for row in Score.query.filter_by(event_id=event.id).all()
                  if row.submission_id}

    today_rows = [s for s in sessions if (s.day or '') == ref_day]
    current = None
    if ref_day == real_today:
        for s in sorted(today_rows, key=lambda x: x.start_time or ''):
            if (s.status or '') in ('Completed', 'Cancelled'):
                continue
            if s.start_time and s.end_time and s.start_time <= now_hm <= s.end_time:
                current = s
                break
    upcoming = sorted([s for s in sessions
                       if _start_dt(s) and _start_dt(s) > now and (s.status or '') != 'Cancelled'],
                      key=_start_dt)[:3]
    delayed = sorted([s for s in sessions
                      if _start_dt(s) and _start_dt(s) < now
                      and (s.status or '') not in ('Completed', 'Cancelled')],
                     key=_start_dt)

    rooms = []
    resources = {r.id: r for r in Resource.query.filter_by(event_id=event.id).all()}
    booking_rows = ResourceBooking.query.filter_by(event_id=event.id) \
        .filter(ResourceBooking.status != 'Released').all()
    for booking in booking_rows:
        if (booking.day or '') != real_today:
            continue
        if not (booking.start_time and booking.end_time
                and booking.start_time <= now_hm <= booking.end_time):
            continue
        resource = resources.get(booking.resource_id)
        if not resource or (resource.kind or 'Room') not in ROOM_KINDS:
            continue
        booked_session = Session.query.get(booking.session_id) if booking.session_id else None
        capacity = resource.capacity or 0
        occupied = (booked_session.capacity if booked_session else 0) or 0
        percent = round(min(100.0, occupied * 100.0 / capacity), 1) if capacity else 0.0
        rooms.append({
            'resourceId': resource.id,
            'name': resource.name or '',
            'capacity': capacity,
            'occupied': occupied,
            'percent': percent,
            'sessionTitle': (booked_session.title if booked_session else '') or '',
        })
    rooms.sort(key=lambda r: (r['name'], r['resourceId']))

    checked_in = len(logs)
    last_checkin = max([log.timestamp for log in logs if log.timestamp], default=None)
    total_regs = len(regs)
    cutoff = now - timedelta(hours=24)

    return {
        'updatedAt': now.isoformat() + 'Z',
        'event': {
            'id': event.id,
            'title': event.title or '',
            'status': event.status or 'Draft',
            'date': event.date or '',
            'seats': event.seats or 0,
        },
        'registrations': {
            'total': total_regs,
            'confirmed': sum(1 for r in regs if r.status == 'Confirmed'),
            'waitlisted': sum(1 for r in regs if r.status == 'Waitlisted'),
            'cancelled': sum(1 for r in regs if r.status == 'Cancelled'),
            'verified': sum(1 for r in regs if r.attendance_status == 'Checked in'),
        },
        'attendance': {
            'checkedIn': checked_in,
            'noShows': sum(1 for r in regs if r.attendance_status == 'No-show'),
            'exceptions': CheckInException.query.filter_by(event_id=event.id).count(),
            'checkinPercent': round(checked_in * 100.0 / total_regs, 1) if total_regs else 0.0,
            'lastCheckInAt': (last_checkin.isoformat() + 'Z') if last_checkin else '',
        },
        'sessions': {
            'total': len(sessions),
            'published': sum(1 for s in sessions if s.status == 'Published'),
            'today': len(today_rows),
            'current': session_json(current),
            'upcoming': [session_json(s) for s in upcoming],
            'delayed': [session_json(s) for s in delayed],
            'completed': sum(1 for s in sessions if s.status == 'Completed'),
        },
        'rooms': rooms,
        'volunteers': {
            'total': len(volunteers),
            'active': sum(1 for v in volunteers if v.status == 'Active'),
            'confirmed': sum(1 for v in volunteers if v.status == 'Confirmed'),
        },
        'tasks': {
            'total': len(tasks),
            'open': sum(1 for t in tasks if (t.status or '') in OPEN_TASK_STATUSES),
            'unassigned': sum(1 for t in tasks if not t.assignee_id
                              and (t.status or '') not in CLOSED_TASK_STATUSES),
            'overdue': sum(1 for t in tasks if t.due_at and t.due_at < now
                           and (t.status or '') not in CLOSED_TASK_STATUSES),
            'blocked': sum(1 for t in tasks if t.status == 'Blocked'),
        },
        'evaluations': {
            'pending': sum(1 for s in submissions if s.id not in scored_ids),
            'scored': sum(1 for s in submissions if s.id in scored_ids),
        },
        'incidents': {
            'open': sum(1 for i in incidents if (i.status or '') in OPEN_INCIDENT_STATUSES),
            'critical': sum(1 for i in incidents if i.severity == 'Critical'),
            'investigating': sum(1 for i in incidents if i.status == 'Investigating'),
        },
        'jobs': {
            'queued': sum(1 for j in jobs if j.status == 'Queued'),
            'failed': sum(1 for j in jobs if j.status == 'Failed'),
            'sent': sum(1 for j in jobs if j.status == 'Sent'),
        },
        'communications': {
            'jobsLast24h': sum(1 for j in jobs if j.created_at and j.created_at >= cutoff),
            'failuresLast24h': sum(1 for j in jobs if j.status == 'Failed'
                                   and j.created_at and j.created_at >= cutoff),
        },
    }


@operations_bp.route('/events/<event_id>/operations', methods=['GET'])
@require_event_manager('event_id')
def operations_center(event_id, _event=None):
    return jsonify(_metrics(_event))


@operations_bp.route('/events/<event_id>/incidents', methods=['GET'])
@require_event_manager('event_id')
def list_incidents(event_id, _event=None):
    status = (request.args.get('status') or 'all').strip().lower()
    severity = (request.args.get('severity') or '').strip()
    query = Incident.query.filter_by(event_id=event_id)
    if status == 'open':
        query = query.filter(Incident.status.in_(list(OPEN_INCIDENT_STATUSES)))
    if severity:
        query = query.filter_by(severity=severity)
    rows = query.order_by(Incident.created_at.desc()).all()
    return jsonify([incident_json(row) for row in rows])


@operations_bp.route('/events/<event_id>/incidents', methods=['POST'])
@require_event_manager('event_id')
def create_incident(event_id, _event=None):
    event = _event
    payload = request.get_json(silent=True) or {}
    title = str(payload.get('title') or '').strip()
    if not title:
        return jsonify({'message': 'Incident title is required.'}), 400
    severity = str(payload.get('severity') or 'Medium').strip()
    if severity.capitalize() in SEVERITIES:
        severity = severity.capitalize()
    if severity not in SEVERITIES:
        return jsonify({'message': 'Severity must be one of Low, Medium, High, Critical.'}), 400
    row = Incident(event_id=event.id, title=title,
                   description=str(payload.get('description') or ''),
                   severity=severity, status='Open',
                   location=str(payload.get('location') or ''),
                   created_by=(current_user().name if current_user() else ''))
    assignee_id = str(payload.get('assigneeId') or '').strip()
    if assignee_id:
        row.assignee_id = assignee_id
        person = User.query.get(assignee_id) or Volunteer.query.get(assignee_id)
        row.assignee_name = (person.name if person else '')
    db.session.add(row)
    db.session.commit()
    audit('Incident reported', current_user(),
          target=title + ' @ ' + (event.title or ''))
    if severity == 'Critical':
        _notify_critical_once(row)
    return jsonify(incident_json(row)), 201


@operations_bp.route('/incidents/<incident_id>', methods=['PUT', 'PATCH'])
def update_incident(incident_id):
    row = Incident.query.get(incident_id)
    if not row:
        return jsonify({'message': 'Incident not found.'}), 404
    event = Event.query.get(row.event_id) if row.event_id else None
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    denied = _guard(event)
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    user = current_user()
    old_status = row.status or 'Open'
    resolved_now = False
    closed_now = False

    if payload.get('status') is not None:
        new_status = str(payload.get('status')).strip()
        if new_status not in INCIDENT_STATUSES:
            return jsonify({'message': 'Status must be one of Open, Investigating, Resolved, Closed.'}), 400
        if new_status != old_status:
            if new_status not in LEGAL_TRANSITIONS.get(old_status, set()):
                return jsonify({'message': 'Illegal status transition from ' + old_status
                                           + ' to ' + new_status + '.'}), 409
            row.status = new_status
            if new_status == 'Resolved':
                row.resolved_at = datetime.utcnow()
                row.resolution = str(payload.get('resolution') or row.resolution or '')
                resolved_now = True
            if new_status == 'Closed':
                closed_now = True

    if 'title' in payload and payload['title'] is not None:
        title = str(payload['title']).strip()
        if not title:
            return jsonify({'message': 'Incident title is required.'}), 400
        row.title = title
    if 'description' in payload and payload['description'] is not None:
        row.description = str(payload['description'])
    if 'location' in payload and payload['location'] is not None:
        row.location = str(payload['location'])
    if 'resolution' in payload and payload['resolution'] is not None and not resolved_now:
        row.resolution = str(payload['resolution'])
    if 'severity' in payload and payload['severity'] is not None:
        severity = str(payload['severity']).strip()
        if severity.capitalize() in SEVERITIES:
            severity = severity.capitalize()
        if severity not in SEVERITIES:
            return jsonify({'message': 'Severity must be one of Low, Medium, High, Critical.'}), 400
        row.severity = severity
    if 'assigneeId' in payload:
        assignee_id = str(payload.get('assigneeId') or '').strip()
        row.assignee_id = assignee_id
        if assignee_id:
            person = User.query.get(assignee_id) or Volunteer.query.get(assignee_id)
            row.assignee_name = (person.name if person else '')
        else:
            row.assignee_name = ''
    row.updated_at = datetime.utcnow()
    db.session.commit()
    if resolved_now:
        audit('Incident resolved', user, target=row.title)
    elif closed_now:
        audit('Incident closed', user, target=row.title)
    else:
        audit('Incident updated', user, target=row.title)
    if row.severity == 'Critical' and (row.status or '') in OPEN_INCIDENT_STATUSES:
        _notify_critical_once(row)
    return jsonify(incident_json(row))


@operations_bp.route('/incidents/<incident_id>', methods=['DELETE'])
def delete_incident(incident_id):
    row = Incident.query.get(incident_id)
    if not row:
        return jsonify({'message': 'Incident not found.'}), 404
    event = Event.query.get(row.event_id) if row.event_id else None
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    denied = _guard(event)
    if denied:
        return denied
    title = row.title or row.id
    db.session.delete(row)
    db.session.commit()
    audit('Incident deleted', current_user(), target=title)
    return jsonify({'ok': True})


@operations_bp.route('/sessions/<session_id>/changes', methods=['POST'])
def publish_session_change(session_id):
    session = Session.query.get(session_id)
    if not session:
        return jsonify({'message': 'Session not found.'}), 404
    event = Event.query.get(session.event_id) if session.event_id else None
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    denied = _guard(event)
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}

    day = session.day or ''
    if payload.get('day') is not None and str(payload.get('day')).strip() != '':
        day = str(payload.get('day')).strip()
        if not valid_day(day):
            return jsonify({'message': 'day must be a YYYY-MM-DD date.'}), 400
    start = session.start_time or ''
    if payload.get('startTime') is not None and str(payload.get('startTime')).strip() != '':
        start = str(payload.get('startTime')).strip()
        if not valid_time(start):
            return jsonify({'message': 'startTime must be HH:MM.'}), 400
    end = session.end_time or ''
    if payload.get('endTime') is not None and str(payload.get('endTime')).strip() != '':
        end = str(payload.get('endTime')).strip()
        if not valid_time(end):
            return jsonify({'message': 'endTime must be HH:MM.'}), 400
    if valid_day(day) and valid_time(start) and valid_time(end) \
            and to_minutes(end) <= to_minutes(start):
        return jsonify({'message': 'endTime must be after startTime.'}), 400

    previous = {'day': session.day or '', 'startTime': session.start_time or '',
                'endTime': session.end_time or ''}
    session.day = day
    session.start_time = start
    session.end_time = end
    session.updated_at = datetime.utcnow()
    db.session.commit()
    audit('Schedule change published', current_user(),
          target=(session.title or '') + ' — ' + day + ' ' + start + '-' + end)

    result = {'session': session_json(session), 'notified': 0, 'job': None,
              'webhookQueued': False}
    if not parse_bool(payload.get('notify'), True):
        return jsonify(result)

    label = 'session-change:' + session.id + ':' + day + ' ' + start + '-' + end
    existing = Job.query.filter_by(event_id=event.id, label=label).first()
    if existing:
        result['job'] = job_json(existing)
        return jsonify(result)

    participants = Registration.query.filter(
        Registration.event_id == event.id,
        Registration.status.in_(['Confirmed', 'Registered'])).all()
    title = 'Schedule change: ' + (session.title or 'session') + ' — ' + day + ' ' + start + '-' + end
    message = ('The schedule for "' + (session.title or 'session') + '" is now '
               + day + ' ' + start + '-' + end + '.')
    job = Job(event_id=event.id, event_title=event.title or '', type='message',
              label=label, subject=title, audience='Confirmed only',
              recipients_count=0, status='Queued')
    db.session.add(job)
    notified = 0
    for reg in participants:
        if not reg.user_id:
            continue
        seen = Notification.query.filter_by(user_id=reg.user_id, title=title).first()
        if seen:
            continue
        db.session.add(Notification(user_id=reg.user_id, title=title, message=message,
                                    type='reminder'))
        notified += 1
    job.recipients_count = notified
    db.session.commit()

    deliveries = emit('schedule.updated', {
        'eventId': event.id,
        'sessionId': session.id,
        'title': session.title or '',
        'day': day,
        'startTime': start,
        'endTime': end,
        'previous': previous,
    }, event_id=event.id, idempotency_key=label)
    result['notified'] = notified
    result['job'] = job_json(job)
    result['webhookQueued'] = bool(deliveries)
    return jsonify(result)
