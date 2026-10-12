"""Attendance: roster, check-in (scanner/manual), undo, exceptions."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import AttendanceLog, CheckInException, Event, Registration
from utils.helpers import audit, parse_bool
from utils.security import current_user
from utils.serializers import attendance_json, exception_json, registration_json

attendance_bp = Blueprint('attendance', __name__)

VALID_STATUSES = ('Confirmed', 'Registered')


def perform_checkin(event_id, code, method='scanner', session=None):
    event = Event.query.get(event_id) if event_id else None
    if event_id and not event:
        return jsonify({'message': 'Event not found.'}), 404

    reg = None
    if code:
        reg = Registration.query.filter_by(ticket_code=code).first()

    if not reg:
        db.session.add(CheckInException(
            event_id=event_id or '', participant_name=code or 'Unknown pass',
            type='Pass not recognised', status='Open',
            detail='Ticket code "' + (code or '') + '" did not match any registration.',
        ))
        db.session.commit()
        return jsonify({'message': 'Pass not recognised. Logged as an exception.'}), 404

    if event and reg.event_id != event.id:
        db.session.add(CheckInException(
            event_id=event.id, registration_id=reg.id, user_id=reg.user_id,
            participant_name=reg.user_name, type='Wrong event', status='Open',
            detail='Pass belongs to "' + (reg.event_title or 'another event') + '".',
        ))
        db.session.commit()
        return jsonify({'message': 'This pass belongs to a different event.'}), 409

    if reg.status not in VALID_STATUSES:
        db.session.add(CheckInException(
            event_id=reg.event_id, registration_id=reg.id, user_id=reg.user_id,
            participant_name=reg.user_name, type='Pass not active', status='Open',
            detail='Registration status is "' + (reg.status or '') + '".',
        ))
        db.session.commit()
        return jsonify({'message': 'This pass is not active (' + (reg.status or 'unknown') + ').'}), 409

    existing = AttendanceLog.query.filter_by(registration_id=reg.id).first()
    if existing:
        return jsonify({'message': 'Already checked in at ' + existing.timestamp.strftime('%H:%M') + '.'}), 409

    log = AttendanceLog(
        event_id=reg.event_id, registration_id=reg.id, user_id=reg.user_id,
        participant_name=reg.user_name, participant_email=reg.user_email,
        session=session or 'Day 1 - Morning', method=method, status='Checked in',
    )
    reg.attendance_status = 'Checked in'
    db.session.add(log)
    db.session.commit()
    audit('Checked in', current_user(), target=reg.user_name + ' @ ' + (reg.event_title or ''))
    data = attendance_json(log)
    data['participantName'] = reg.user_name
    data['name'] = reg.user_name
    return jsonify(data), 201


@attendance_bp.route('/attendance/roster', methods=['GET'])
def roster():
    event_id = request.args.get('eventId')
    session = request.args.get('session')
    query = Registration.query.filter(Registration.status.in_(list(VALID_STATUSES)))
    if event_id:
        query = query.filter_by(event_id=event_id)
    rows = query.order_by(Registration.registered_at.asc()).all()
    logs = {}
    for log in AttendanceLog.query.all():
        if not session or log.session == session:
            logs[log.registration_id] = log
    result = []
    for r in rows:
        log = logs.get(r.id)
        data = registration_json(r)
        data['checkedIn'] = bool(log)
        data['logId'] = log.id if log else ''
        data['session'] = (log.session if log else '') or ''
        result.append(data)
    return jsonify(result)


@attendance_bp.route('/attendance/check-in', methods=['POST'])
def check_in():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    code = str(payload.get('code') or payload.get('ticketCode') or '')
    registration_id = str(payload.get('registrationId') or '')
    email = str(payload.get('participantEmail') or payload.get('email') or '').strip().lower()
    method = str(payload.get('method') or 'manual')
    session = payload.get('session')

    if registration_id and not code:
        reg = Registration.query.get(registration_id)
        if not reg:
            return jsonify({'message': 'Registration not found.'}), 404
        code = reg.ticket_code or ''
    if not code and email and event_id:
        reg = Registration.query.filter_by(event_id=event_id, user_email=email).first()
        if reg:
            code = reg.ticket_code or ''
    if not code:
        return jsonify({'message': 'Provide a ticket code or registration id.'}), 400
    return perform_checkin(event_id, code, method=method, session=session)


@attendance_bp.route('/attendance/<log_id>/undo', methods=['POST'])
def undo(log_id):
    log = AttendanceLog.query.get(log_id)
    if not log:
        return jsonify({'message': 'Attendance entry not found.'}), 404
    reg = Registration.query.get(log.registration_id)
    if reg:
        reg.attendance_status = 'Registered'
    db.session.delete(log)
    db.session.commit()
    audit('Check-in undone', current_user(), target=log.participant_name or log.id)
    return jsonify({'ok': True})


@attendance_bp.route('/attendance', methods=['GET'])
def list_attendance():
    event_id = request.args.get('eventId')
    query = AttendanceLog.query
    if event_id:
        query = query.filter_by(event_id=event_id)
    rows = query.order_by(AttendanceLog.timestamp.desc()).all()
    return jsonify([attendance_json(a) for a in rows])


@attendance_bp.route('/attendance/exceptions', methods=['GET'])
def list_exceptions():
    event_id = request.args.get('eventId')
    query = CheckInException.query
    if event_id:
        query = query.filter_by(event_id=event_id)
    rows = query.order_by(CheckInException.detected_at.desc()).all()
    return jsonify([exception_json(x) for x in rows])