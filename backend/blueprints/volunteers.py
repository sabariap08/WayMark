"""Volunteer Management: event-scoped volunteer records with invite links.

Volunteers are not an application role. Only an admin or the event's host may
add, edit, remove, or invite them. Each volunteer gets a scoped invite link.
"""
from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, Volunteer
from utils.helpers import audit, guest_token, parse_bool
from utils.mailer import send_mail
from utils.serializers import volunteer_json

volunteers_bp = Blueprint('volunteers', __name__)

FIELDS = {
    'name': ('name', 160), 'email': ('email', 200), 'phone': ('phone', 60),
    'department': ('department', 120), 'responsibility': ('responsibility', 200),
    'shiftDate': ('shift_date', 60), 'shiftTime': ('shift_time', 60),
    'status': ('status', 30), 'notes': ('notes', 4000),
}
STATUSES = ('Invited', 'Confirmed', 'Active', 'Removed')


def _forbid_unless_manager(event):
    from utils.security import can_manage_event, current_user
    if not can_manage_event(current_user(), event):
        return jsonify({'message': 'Only the event host or an admin can manage its volunteers.'}), 403
    return None


def _invite_url(token_value):
    return 'volunteer.html?token=' + token_value


@volunteers_bp.route('/volunteers', methods=['GET'])
def list_volunteers():
    from utils.security import current_user, is_admin
    user = current_user()
    event_id = request.args.get('eventId')
    query = Volunteer.query
    if event_id:
        event = Event.query.get(event_id)
        if not event:
            return jsonify({'message': 'Event not found.'}), 404
        denied = _forbid_unless_manager(event)
        if denied:
            return denied
        query = query.filter_by(event_id=event_id)
    elif not is_admin(user):
        return jsonify({'message': 'Administrator access is required to view all volunteers.'}), 403
    rows = query.order_by(Volunteer.created_at.desc()).all()
    return jsonify([volunteer_json(v) for v in rows])


@volunteers_bp.route('/volunteers', methods=['POST'])
def create_volunteer():
    from utils.security import current_user
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    event = Event.query.get(event_id) if event_id else None
    if not event:
        return jsonify({'message': 'A valid event is required to add a volunteer.'}), 400
    denied = _forbid_unless_manager(event)
    if denied:
        return denied
    name = str(payload.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Volunteer name is required.'}), 400
    row = Volunteer(event_id=event.id, event_title=event.title or '', name=name,
                    email=str(payload.get('email') or '').strip().lower(),
                    invite_token=guest_token('vol'), status='Invited')
    for key, (attr, limit) in FIELDS.items():
        if key in payload and payload[key] is not None and key != 'name':
            setattr(row, attr, str(payload[key])[:limit])
    if row.status not in STATUSES:
        row.status = 'Invited'
    db.session.add(row)
    db.session.commit()
    _send_invite(row, event)
    audit('Volunteer added', current_user(), target=name + ' @ ' + (event.title or ''))
    return jsonify(volunteer_json(row)), 201


@volunteers_bp.route('/volunteers/<vol_id>', methods=['PUT', 'PATCH'])
def update_volunteer(vol_id):
    from utils.security import current_user
    row = Volunteer.query.get(vol_id)
    if not row:
        return jsonify({'message': 'Volunteer not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event) if event else None
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    for key, (attr, limit) in FIELDS.items():
        if key in payload and payload[key] is not None:
            setattr(row, attr, str(payload[key])[:limit])
    if row.status not in STATUSES:
        row.status = 'Confirmed'
    db.session.commit()
    audit('Volunteer updated', current_user(), target=row.name)
    return jsonify(volunteer_json(row))


@volunteers_bp.route('/volunteers/<vol_id>', methods=['DELETE'])
def delete_volunteer(vol_id):
    from utils.security import current_user
    row = Volunteer.query.get(vol_id)
    if not row:
        return jsonify({'message': 'Volunteer not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event) if event else None
    if denied:
        return denied
    name = row.name
    db.session.delete(row)
    db.session.commit()
    audit('Volunteer removed', current_user(), target=name)
    return jsonify({'ok': True})


@volunteers_bp.route('/volunteers/<vol_id>/invite', methods=['POST'])
def invite_volunteer(vol_id):
    from utils.security import current_user
    row = Volunteer.query.get(vol_id)
    if not row:
        return jsonify({'message': 'Volunteer not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event) if event else None
    if denied:
        return denied
    if not row.invite_token:
        row.invite_token = guest_token('vol')
        db.session.commit()
    _send_invite(row, event)
    audit('Volunteer invited', current_user(), target=row.name)
    data = volunteer_json(row)
    data['inviteUrl'] = _invite_url(row.invite_token)
    return jsonify(data)


def _send_invite(row, event):
    if not row.email:
        return
    send_mail(row.email, 'Volunteer invitation: ' + (event.title if event else ''),
              'Hi ' + (row.name or 'there') + ',\n\nYou are invited to volunteer for '
              + ((event.title if event else 'the event') or 'the event') + '.'
              + ('\nShift: ' + (row.shift_date or '') + ' ' + (row.shift_time or '')).rstrip()
              + '\nConfirm here: ' + _invite_url(row.invite_token) + '\n\n— WayMark', kind='system')
