"""Events: CRUD, approval workflow, workspace data, results."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import (AttendanceLog, CheckInException, Event, Job, Notification, Registration,
                    Rubric, Score, Submission, User)
from utils.helpers import (attendance_count, audit, category_meta, initials_of, notify,
                           notify_admins, parse_bool, parse_int, promote_waitlist,
                           refresh_event_counts)
from utils.mailer import send_mail
from utils.security import current_user, require_auth
from utils.serializers import (attendance_json, event_json, exception_json, job_json,
                               registration_json, rubric_json, score_json, submission_json)

events_bp = Blueprint('events', __name__)

EDITABLE_FIELDS = {
    'title': ('title', 220), 'category': ('category', 80), 'description': ('description', 6000),
    'date': ('date', 60), 'time': ('time', 60), 'location': ('location', 220),
    'organizer': ('organizer', 160), 'regDeadline': ('reg_deadline', 60),
    'contactEmail': ('contact_email', 200), 'website': ('website', 220),
}
FLAG_FIELDS = {
    'certificatesEnabled': 'certificates_enabled', 'juryEnabled': 'jury_enabled',
    'feedbackEnabled': 'feedback_enabled', 'attendanceRequired': 'attendance_required',
}


def _apply_event_payload(event, payload, creating=False):
    for key, (attr, limit) in EDITABLE_FIELDS.items():
        if key in payload and payload[key] is not None:
            setattr(event, attr, str(payload[key])[:limit])
    if 'seats' in payload:
        seats = max(1, parse_int(payload.get('seats'), event.seats or 100))
        event.seats = seats
        event.capacity_num = seats
    for key, attr in FLAG_FIELDS.items():
        if key in payload:
            setattr(event, attr, parse_bool(payload[key]))
    if isinstance(payload.get('tags'), list):
        event.tags = [str(t)[:60] for t in payload['tags'][:12]]
    if isinstance(payload.get('agenda'), list):
        event.agenda = payload['agenda'][:30]
    if isinstance(payload.get('requirements'), list):
        event.requirements = [str(t)[:200] for t in payload['requirements'][:15]]
    if creating:
        meta = category_meta(event.category)
        event.tone = meta['tone']
        event.color = meta['color']
        event.initials = initials_of(event.title)
        event.status = event.status or 'Draft'
        event.approval_status = event.approval_status or 'Draft'
    event.updated_at = datetime.utcnow()
    return event


@events_bp.route('/events', methods=['GET'])
def list_events():
    user = current_user()
    query = Event.query
    status = request.args.get('status')
    category = request.args.get('category')
    q = (request.args.get('q') or '').strip().lower()
    if status:
        query = query.filter_by(status=status)
    if category:
        query = query.filter_by(category=category)
    if q:
        query = query.filter(Event.title.ilike('%' + q + '%'))
    if parse_bool(request.args.get('mine')) and user:
        query = query.filter_by(host_id=user.id)
    rows = query.order_by(Event.created_at.desc()).all()
    return jsonify([event_json(e) for e in rows])


@events_bp.route('/events', methods=['POST'])
def create_event():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    title = str(payload.get('title') or '').strip()
    if not title:
        return jsonify({'message': 'Event title is required.'}), 400
    event = Event(title=title, host_id=user.id if user else '', host_name=user.name if user else '',
                  organizer=(user.name if user else ''))
    _apply_event_payload(event, payload, creating=True)
    db.session.add(event)
    db.session.commit()
    audit('Event created', user, target=event.title)
    return jsonify(event_json(event)), 201


@events_bp.route('/events/<event_id>', methods=['GET'])
def get_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    return jsonify(event_json(event))


@events_bp.route('/events/<event_id>', methods=['PUT', 'PATCH'])
def update_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    payload = request.get_json(silent=True) or {}
    _apply_event_payload(event, payload)
    db.session.commit()
    audit('Event updated', current_user(), target=event.title)
    return jsonify(event_json(event))


@events_bp.route('/events/<event_id>', methods=['DELETE'])
def delete_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    Registration.query.filter_by(event_id=event.id).delete()
    db.session.delete(event)
    db.session.commit()
    audit('Event deleted', current_user(), target=event.title)
    return jsonify({'ok': True})


@events_bp.route('/events/<event_id>/submit', methods=['POST'])
def submit_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    event.status = 'Pending'
    event.approval_status = 'Pending'
    event.submitted_at = datetime.utcnow()
    event.updated_at = datetime.utcnow()
    db.session.commit()
    notify_admins('Event submitted for review', (event.title or 'An event') + ' is awaiting approval.', 'approval')
    audit('Event submitted', current_user(), target=event.title)
    return jsonify(event_json(event))


@events_bp.route('/events/<event_id>/approve', methods=['POST'])
def approve_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    payload = request.get_json(silent=True) or {}
    event.status = payload.get('status') or 'Registration open'
    event.approval_status = 'Approved'
    event.updated_at = datetime.utcnow()
    db.session.commit()
    if event.host_id:
        notify(event.host_id, 'Event approved', (event.title or 'Your event') + ' is now live.', 'approval')
        send_mail(event.contact_email or '', 'Your event was approved: ' + (event.title or ''),
                  'Good news — ' + (event.title or 'your event') + ' is approved and live on WayMark.',
                  kind='system')
    audit('Event approved', current_user(), target=event.title)
    return jsonify(event_json(event))


@events_bp.route('/events/<event_id>/cancel', methods=['POST'])
def cancel_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    payload = request.get_json(silent=True) or {}
    reason = str(payload.get('reason') or '')
    event.status = 'Cancelled'
    event.rejection_reason = reason
    event.updated_at = datetime.utcnow()
    db.session.commit()
    for reg in Registration.query.filter_by(event_id=event.id).all():
        notify(reg.user_id, 'Event cancelled', (event.title or 'The event') + ' was cancelled.'
               + (' Reason: ' + reason if reason else ''), 'alert')
        send_mail(reg.user_email, 'Cancelled: ' + (event.title or ''),
                  'Hi ' + (reg.user_name or 'there') + ',\n\n' + (event.title or 'The event')
                  + ' has been cancelled.' + (' Reason: ' + reason if reason else ''), kind='system')
    audit('Event cancelled', current_user(), target=event.title)
    return jsonify(event_json(event))


@events_bp.route('/events/<event_id>/complete', methods=['POST'])
def complete_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    event.status = 'Completed'
    event.updated_at = datetime.utcnow()
    db.session.commit()
    for reg in Registration.query.filter_by(event_id=event.id).all():
        if reg.attendance_status == 'Registered':
            reg.attendance_status = 'No-show'
        notify(reg.user_id, 'Event completed', (event.title or 'The event') + ' has wrapped up. Thanks for joining!', 'reminder')
    db.session.commit()
    audit('Event completed', current_user(), target=event.title)
    return jsonify(event_json(event))


@events_bp.route('/events/<event_id>/duplicate', methods=['POST'])
def duplicate_event(event_id):
    source = Event.query.get(event_id)
    if not source:
        return jsonify({'message': 'Event not found.'}), 404
    copy = Event(
        host_id=source.host_id, host_name=source.host_name, title=(source.title or 'Event') + ' (copy)',
        category=source.category, description=source.description, date=source.date, time=source.time,
        location=source.location, seats=source.seats, capacity_num=source.capacity_num,
        organizer=source.organizer, reg_deadline=source.reg_deadline, contact_email=source.contact_email,
        website=source.website, tags=list(source.tags or []), agenda=list(source.agenda or []),
        requirements=list(source.requirements or []), status='Draft', approval_status='Draft',
        tone=source.tone, color=source.color, initials=source.initials,
        certificates_enabled=source.certificates_enabled, jury_enabled=source.jury_enabled,
        feedback_enabled=source.feedback_enabled, attendance_required=source.attendance_required,
    )
    db.session.add(copy)
    db.session.commit()
    audit('Event duplicated', current_user(), target=source.title)
    return jsonify(event_json(copy)), 201


@events_bp.route('/events/<event_id>/registrations', methods=['GET'])
def event_registrations(event_id):
    rows = Registration.query.filter_by(event_id=event_id).order_by(Registration.registered_at.asc()).all()
    return jsonify([registration_json(r) for r in rows])


@events_bp.route('/events/<event_id>/participants', methods=['GET'])
def event_participants(event_id):
    rows = Registration.query.filter_by(event_id=event_id).all()
    return jsonify([registration_json(r) for r in rows])


@events_bp.route('/events/<event_id>/roster', methods=['GET'])
def event_roster(event_id):
    session = request.args.get('session')
    rows = Registration.query.filter(
        Registration.event_id == event_id,
        Registration.status.in_(['Confirmed', 'Registered']),
    ).all()
    logs = {(l.registration_id): l for l in AttendanceLog.query.filter_by(event_id=event_id).all()
            if not session or l.session == session}
    result = []
    for r in rows:
        log = logs.get(r.id)
        data = registration_json(r)
        data['checkedIn'] = bool(log)
        data['logId'] = log.id if log else ''
        data['session'] = (log.session if log else '') or ''
        result.append(data)
    return jsonify(result)


@events_bp.route('/events/<event_id>/attendance', methods=['GET'])
def event_attendance(event_id):
    rows = AttendanceLog.query.filter_by(event_id=event_id).order_by(AttendanceLog.timestamp.desc()).all()
    return jsonify([attendance_json(a) for a in rows])


@events_bp.route('/events/<event_id>/no-shows', methods=['GET'])
def event_no_shows(event_id):
    checked = {l.registration_id for l in AttendanceLog.query.filter_by(event_id=event_id).all()}
    rows = Registration.query.filter(
        Registration.event_id == event_id,
        Registration.status.in_(['Confirmed', 'Registered']),
    ).all()
    result = []
    for r in rows:
        if r.id not in checked:
            data = registration_json(r)
            data['attendanceStatus'] = 'No-show'
            result.append(data)
    return jsonify(result)


@events_bp.route('/events/<event_id>/exceptions', methods=['GET'])
def event_exceptions(event_id):
    rows = CheckInException.query.filter_by(event_id=event_id).order_by(CheckInException.detected_at.desc()).all()
    return jsonify([exception_json(x) for x in rows])


@events_bp.route('/events/<event_id>/jobs', methods=['GET'])
def event_jobs(event_id):
    rows = Job.query.filter_by(event_id=event_id).order_by(Job.created_at.desc()).all()
    return jsonify([job_json(j) for j in rows])


@events_bp.route('/events/<event_id>/submissions', methods=['GET'])
def event_submissions(event_id):
    rows = Submission.query.filter_by(event_id=event_id).order_by(Submission.submitted_at.asc()).all()
    scores = Score.query.filter_by(event_id=event_id).all()
    totals = {}
    for s in scores:
        totals.setdefault(s.submission_id, []).append(s.total or 0)
    result = []
    for sub in rows:
        values = totals.get(sub.id, [])
        avg = sum(values) / len(values) if values else None
        result.append(submission_json(sub, avg))
    return jsonify(result)


def results_for_event(event):
    subs = Submission.query.filter_by(event_id=event.id).all()
    scores = Score.query.filter(Score.event_id == event.id, Score.status != 'Reopened').all()
    rubric = Rubric.query.filter_by(event_id=event.id).order_by(Rubric.created_at.desc()).first()
    max_total = 0.0
    if rubric and rubric.criteria:
        for c in rubric.criteria:
            max_total += (c.get('maxScore') or 10) * ((c.get('weight') or 0) / 100.0)
    by_sub = {}
    for s in scores:
        by_sub.setdefault(s.submission_id, []).append(s)
    entries = []
    for sub in subs:
        jury_scores = by_sub.get(sub.id, [])
        totals = [s.total or 0 for s in jury_scores]
        avg = sum(totals) / len(totals) if totals else 0
        spread = (max(totals) - min(totals)) if len(totals) > 1 else 0
        entries.append({
            'submissionId': sub.id,
            'teamName': sub.team_name or '',
            'projectTitle': sub.project_title or '',
            'track': sub.track or '',
            'score': round(avg, 1),
            'maxScore': round(max_total or (len(rubric.criteria) * 10 if rubric and rubric.criteria else 100), 1),
            'spread': round(spread, 1),
            'flagged': spread > 2.5,
            'judges': [s.jury_name or '' for s in jury_scores],
            'judgeCount': len(jury_scores),
        })
    entries.sort(key=lambda e: e['score'], reverse=True)
    for i, entry in enumerate(entries, start=1):
        entry['rank'] = i
        if i == 1:
            entry['award'], entry['tone'] = 'Winner', 'amber'
        elif i == 2:
            entry['award'], entry['tone'] = 'Runner-up', 'blue'
        elif i == 3:
            entry['award'], entry['tone'] = 'Third place', 'teal'
        else:
            entry['award'], entry['tone'] = '', 'slate'
    return entries


@events_bp.route('/events/<event_id>/results', methods=['GET'])
def event_results(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    rubric = Rubric.query.filter_by(event_id=event_id).order_by(Rubric.created_at.desc()).first()
    return jsonify({
        'event': event_json(event),
        'released': bool(event.results_released),
        'releasedAt': event.released_at.isoformat() + 'Z' if event.released_at else '',
        'rubric': rubric_json(rubric),
        'entries': results_for_event(event),
    })


@events_bp.route('/events/<event_id>/results/release', methods=['POST'])
def release_results(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    entries = results_for_event(event)
    if not entries:
        return jsonify({'message': 'No scored submissions to release yet.'}), 400
    event.results_released = True
    event.released_at = datetime.utcnow()
    event.updated_at = datetime.utcnow()
    regs = Registration.query.filter_by(event_id=event.id).all()
    for reg in regs:
        notify(reg.user_id, 'Results released', 'Results for ' + (event.title or 'the event') + ' are now live.', 'certificate')
        send_mail(reg.user_email, 'Results released: ' + (event.title or ''),
                  'Hi ' + (reg.user_name or 'there') + ',\n\nResults for ' + (event.title or 'the event')
                  + ' have been released. Check the event page for standings.\n\n— WayMark', kind='system')
    Job.query  # noqa: B018
    db.session.add(Job(event_id=event.id, event_title=event.title, type='results',
                       label='Results released', subject='Results released',
                       audience='All registrants', recipients_count=len(regs), status='Sent'))
    db.session.commit()
    audit('Results released', current_user(), target=event.title)
    return jsonify({'ok': True, 'released': True, 'entries': entries})


@events_bp.route('/events/<event_id>/certificates/generate', methods=['POST'])
def generate_certificates(event_id):
    from utils.helpers import credential_code
    from models import Certificate
    from utils.serializers import certificate_json

    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    payload = request.get_json(silent=True) or {}
    cert_type = str(payload.get('type') or 'Participation')
    checked = {l.registration_id for l in AttendanceLog.query.filter_by(event_id=event.id).all()}
    regs = Registration.query.filter_by(event_id=event.id).all()
    issued = []
    for reg in regs:
        attended = reg.id in checked or reg.attendance_status == 'Checked in'
        if not attended and not parse_bool(payload.get('includeNoShows')):
            continue
        existing = Certificate.query.filter_by(event_id=event.id, recipient_id=reg.user_id).first()
        if existing:
            issued.append(existing)
            continue
        cert = Certificate(
            recipient_name=reg.user_name or '', recipient_id=reg.user_id or '',
            event_id=event.id, event_title=event.title or '',
            issue_date=datetime.utcnow().strftime('%b %d, %Y'),
            credential_id=credential_code(), type=cert_type,
            issuer='WayMark Events', status='Valid',
        )
        db.session.add(cert)
        issued.append(cert)
        notify(reg.user_id, 'Certificate ready', 'Your certificate for ' + (event.title or 'the event') + ' is available.', 'certificate')
        send_mail(reg.user_email, 'Your certificate is ready: ' + (event.title or ''),
                  'Hi ' + (reg.user_name or 'there') + ',\n\nYour certificate for ' + (event.title or 'the event')
                  + ' is ready. Credential ID: ' + cert.credential_id + '\n\n— WayMark', kind='certificate')
    db.session.add(Job(event_id=event.id, event_title=event.title, type='certificates',
                       label='Certificate batch', subject='Certificate batch',
                       audience='Attendees', recipients_count=len(issued), status='Sent'))
    db.session.commit()
    audit('Certificates generated', current_user(), target=event.title + ' (' + str(len(issued)) + ')')
    return jsonify({'ok': True, 'issued': len(issued), 'certificates': [certificate_json(c) for c in issued]})


@events_bp.route('/events/<event_id>/leaderboard', methods=['GET'])
def event_leaderboard(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    return jsonify(results_for_event(event))