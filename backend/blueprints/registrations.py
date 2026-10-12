"""Registrations: join events, waitlist, ticket/QR, offers, overrides."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import CheckInException, Event, Registration
from utils.helpers import (audit, notify, parse_bool, promote_waitlist, refresh_event_counts,
                           ticket_code)
from utils.mailer import send_mail
from utils.security import current_user
from utils.serializers import registration_json

registrations_bp = Blueprint('registrations', __name__)

ACTIVE_STATUSES = ('Confirmed', 'Registered')


def _next_waitlist_position(event):
    rows = Registration.query.filter(
        Registration.event_id == event.id,
        Registration.status.in_(['Waitlisted', 'Offered']),
    ).all()
    positions = [r.waitlist_position or 0 for r in rows]
    return (max(positions) if positions else 0) + 1


@registrations_bp.route('/registrations', methods=['GET'])
def list_registrations():
    user = current_user()
    query = Registration.query
    event_id = request.args.get('eventId')
    if event_id:
        query = query.filter_by(event_id=event_id)
    if user and user.role not in ('host', 'admin'):
        query = query.filter_by(user_id=user.id)
    elif user and user.role in ('host', 'admin') and not event_id and not parse_bool(request.args.get('all')):
        query = query.filter_by(user_id=user.id)
    rows = query.order_by(Registration.registered_at.desc()).all()
    return jsonify([registration_json(r) for r in rows])


@registrations_bp.route('/registrations', methods=['POST'])
def create_registration():
    user = current_user()
    if not user:
        return jsonify({'message': 'Authentication required.'}), 401
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or payload.get('event_id') or '')
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if event.status in ('Cancelled', 'Completed', 'Draft', 'Rejected'):
        return jsonify({'message': 'Registration is not open for this event.'}), 409
    existing = Registration.query.filter_by(event_id=event.id, user_id=user.id).first()
    if existing and existing.status not in ('Cancelled', 'Declined'):
        return jsonify({'message': 'You are already registered for this event.'}), 409
    if existing:
        db.session.delete(existing)
        db.session.commit()

    confirmed = Registration.query.filter(
        Registration.event_id == event.id,
        Registration.status.in_(list(ACTIVE_STATUSES)),
    ).count()
    wants_waitlist = parse_bool(payload.get('waitlist'))
    full = confirmed >= (event.seats or 0)

    reg = Registration(
        user_id=user.id, user_name=user.name, user_email=user.email,
        event_id=event.id, event_title=event.title, category=event.category,
        date=event.date, time=event.time, location=event.location,
    )
    if full or wants_waitlist:
        reg.status = 'Waitlisted'
        reg.ticket_code = None
        reg.waitlist_position = _next_waitlist_position(event)
        message = 'Event is full - you joined the waitlist at position ' + str(reg.waitlist_position) + '.'
    else:
        reg.status = 'Confirmed'
        reg.ticket_code = ticket_code()
        message = 'Registration confirmed.'
    db.session.add(reg)
    db.session.commit()
    refresh_event_counts(event)

    if reg.status == 'Waitlisted':
        send_mail(user.email, 'Waitlisted: ' + (event.title or ''),
                  'Hi ' + user.name + ',\n\n' + (event.title or 'The event') + ' is currently full. '
                  + 'You are #' + str(reg.waitlist_position) + ' on the waitlist. We will email you if a seat opens up.',
                  kind='reminder')
    else:
        send_mail(user.email, 'Registration confirmed: ' + (event.title or ''),
                  'Hi ' + user.name + ',\n\nYou are confirmed for ' + (event.title or 'the event')
                  + '.\nTicket: ' + reg.ticket_code + '\n\n— WayMark', kind='message')
    notify(user.id, 'Registration ' + reg.status.lower(), message, 'reminder')
    audit('Registration created', user, target=event.title + ' (' + reg.status + ')')
    return jsonify(registration_json(reg)), 201


@registrations_bp.route('/registrations/<reg_id>', methods=['DELETE'])
def cancel_registration(reg_id):
    user = current_user()
    reg = Registration.query.get(reg_id)
    if not reg:
        return jsonify({'message': 'Registration not found.'}), 404
    if user and user.role == 'participant' and reg.user_id != user.id:
        return jsonify({'message': 'You can only cancel your own registration.'}), 403
    event = Event.query.get(reg.event_id)
    reg.status = 'Cancelled'
    db.session.commit()
    if event:
        promote_waitlist(event)
        refresh_event_counts(event)
    audit('Registration cancelled', user, target=reg.event_title)
    return jsonify({'ok': True})


@registrations_bp.route('/registrations/<reg_id>/ticket', methods=['GET'])
def registration_ticket(reg_id):
    reg = Registration.query.get(reg_id)
    if not reg:
        return jsonify({'message': 'Registration not found.'}), 404
    event = Event.query.get(reg.event_id)
    return jsonify({
        'ticketCode': reg.ticket_code or '',
        'holder': reg.user_name or '',
        'email': reg.user_email or '',
        'eventTitle': reg.event_title or '',
        'category': reg.category or '',
        'date': reg.date or '',
        'time': reg.time or '',
        'location': reg.location or '',
        'status': reg.status or '',
        'attendanceStatus': reg.attendance_status or '',
        'organizer': (event.organizer if event else '') or '',
        'qrCodeUrl': reg.qr_code_url or '',
    })


@registrations_bp.route('/registrations/<reg_id>/qr', methods=['GET'])
def registration_qr(reg_id):
    reg = Registration.query.get(reg_id)
    if not reg:
        return jsonify({'message': 'Registration not found.'}), 404
    if not reg.ticket_code:
        return jsonify({'message': 'This registration has no ticket yet.'}), 409
    return jsonify({
        'ticketCode': reg.ticket_code,
        'qrCodeUrl': reg.qr_code_url or '',
        'payload': 'WAYMARK|' + reg.ticket_code + '|' + (reg.event_id or ''),
    })


@registrations_bp.route('/registrations/<reg_id>/accept-offer', methods=['POST'])
def accept_offer(reg_id):
    user = current_user()
    reg = Registration.query.get(reg_id)
    if not reg:
        return jsonify({'message': 'Registration not found.'}), 404
    if reg.status not in ('Offered', 'Waitlisted'):
        return jsonify({'message': 'No waitlist offer is active for this registration.'}), 409
    event = Event.query.get(reg.event_id)
    if event:
        confirmed = Registration.query.filter(
            Registration.event_id == event.id,
            Registration.status.in_(list(ACTIVE_STATUSES)),
        ).count()
        if confirmed >= (event.seats or 0):
            return jsonify({'message': 'The event is still full. Try again later.'}), 409
        reg.status = 'Confirmed'
        reg.ticket_code = ticket_code()
        reg.waitlist_position = None
        reg.offer_expires_at = None
        db.session.commit()
        refresh_event_counts(event)
        send_mail(reg.user_email, 'Seat confirmed: ' + (event.title or ''),
                  'Hi ' + (reg.user_name or 'there') + ',\n\nYour seat is confirmed. Ticket: ' + reg.ticket_code,
                  kind='message')
        notify(reg.user_id, 'Waitlist offer accepted', 'You are confirmed for ' + (event.title or 'the event') + '.', 'reminder')
        audit('Waitlist offer accepted', user, target=reg.event_title)
    else:
        reg.status = 'Confirmed'
        reg.ticket_code = ticket_code()
        db.session.commit()
    return jsonify(registration_json(reg))


@registrations_bp.route('/registrations/<reg_id>/decline-offer', methods=['POST'])
def decline_offer(reg_id):
    user = current_user()
    reg = Registration.query.get(reg_id)
    if not reg:
        return jsonify({'message': 'Registration not found.'}), 404
    reg.status = 'Declined'
    reg.offer_expires_at = None
    db.session.commit()
    event = Event.query.get(reg.event_id)
    if event:
        promote_waitlist(event)
        refresh_event_counts(event)
    audit('Waitlist offer declined', user, target=reg.event_title)
    return jsonify(registration_json(reg))


@registrations_bp.route('/registrations/<reg_id>/override', methods=['POST'])
def override_registration(reg_id):
    user = current_user()
    reg = Registration.query.get(reg_id)
    if not reg:
        return jsonify({'message': 'Registration not found.'}), 404
    payload = request.get_json(silent=True) or {}
    reason = str(payload.get('reason') or payload.get('note') or '')
    if payload.get('status'):
        reg.status = str(payload['status'])
    if payload.get('attendanceStatus'):
        reg.attendance_status = str(payload['attendanceStatus'])
    elif payload.get('attended'):
        reg.attendance_status = 'Checked in'
    db.session.commit()
    for exc in CheckInException.query.filter_by(registration_id=reg.id, status='Open').all():
        exc.status = 'Resolved'
        exc.detail = (exc.detail or '') + ' | Overridden by ' + ((user.name if user else 'staff')) + (' — ' + reason if reason else '')
    db.session.commit()
    audit('Registration overridden', user, target=reg.event_title + ' (' + (reason or 'no reason') + ')')
    return jsonify(registration_json(reg))


@registrations_bp.route('/checkin', methods=['POST'])
def checkin():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    code = str(payload.get('code') or payload.get('ticketCode') or '').strip()
    method = str(payload.get('method') or 'scanner')
    from blueprints.attendance import perform_checkin
    return perform_checkin(event_id, code, method)