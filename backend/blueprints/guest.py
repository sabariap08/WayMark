"""Guest apps: activate scoped jury / volunteer links into session tokens.

Guest links never create a user account and never grant an application role.
They only carry a scoped identity (the assignment/volunteer id) that the judge
and scanner apps understand.
"""
from flask import Blueprint, jsonify, request

from extensions import db
from models import GuestAccess, JuryAssignment, Volunteer
from utils.helpers import audit
from utils.rate_limit import rate_limit
from utils.security import issue_token
from utils.serializers import assignment_json, guest_access_json, volunteer_json

guest_bp = Blueprint('guest', __name__)


@guest_bp.route('/guest/activate', methods=['POST'])
@rate_limit(limit=15, window_seconds=60)
def activate():
    payload = request.get_json(silent=True) or {}
    token_value = str(payload.get('token') or '').strip()
    if not token_value:
        return jsonify({'message': 'A guest link token is required.'}), 400

    # New-style scoped guest links (judge or scanner), stored hashed.
    from blueprints.guests import _hash_token
    from datetime import datetime
    guest = GuestAccess.query.filter_by(token_hash=_hash_token(token_value)).first()
    if guest:
        if guest.status == 'revoked':
            return jsonify({'message': 'This guest link has been revoked.'}), 403
        now = datetime.utcnow()
        if guest.access_from and now < guest.access_from:
            return jsonify({'message': 'This guest link is not active yet.'}), 403
        if guest.access_to and now > guest.access_to:
            return jsonify({'message': 'This guest link has expired.'}), 403
        guest.status = 'active'
        guest.activated_at = now
        db.session.commit()
        session_token = issue_token(
            _pseudo(guest.id, guest.name or 'Guest', guest.email or ''),
            extra={'scope': 'guest', 'kind': guest.kind or 'judge', 'guestId': guest.id,
                   'eventId': guest.event_id, 'name': guest.name or '', 'section': guest.section or ''},
            hours=12,
        )
        label = 'Scanner' if (guest.kind or '') == 'scanner' else 'Jury'
        audit(label + ' guest session activated', guest.name or 'Guest',
              target=guest.event_title or token_value)
        return jsonify({
            'token': session_token,
            'user': {'id': guest.id, 'name': guest.name or 'Guest', 'email': guest.email or '',
                     'role': label + ' (guest)', 'roleKey': 'guest'},
            'guest': guest_access_json(guest),
            'scope': guest.kind or 'judge',
        })

    assignment = JuryAssignment.query.filter_by(guest_token=token_value).first()
    if assignment:
        session_token = issue_token(
            _pseudo(assignment.id, assignment.jury_name or 'Guest judge', assignment.jury_email or ''),
            extra={'scope': 'guest', 'kind': 'jury', 'assignmentId': assignment.id,
                   'eventId': assignment.event_id, 'name': assignment.jury_name or ''},
            hours=12,
        )
        audit('Jury guest session activated', assignment.jury_name or 'Guest judge',
              target=assignment.event_title or token_value)
        return jsonify({
            'token': session_token,
            'user': {'id': assignment.id, 'name': assignment.jury_name or 'Guest judge',
                     'email': assignment.jury_email or '', 'role': 'Jury (guest)', 'roleKey': 'guest'},
            'assignment': assignment_json(assignment),
            'scope': 'jury',
        })

    volunteer = Volunteer.query.filter_by(invite_token=token_value).first()
    if volunteer:
        session_token = issue_token(
            _pseudo(volunteer.id, volunteer.name or 'Volunteer', volunteer.email or ''),
            extra={'scope': 'guest', 'kind': 'volunteer', 'volunteerId': volunteer.id,
                   'eventId': volunteer.event_id, 'name': volunteer.name or ''},
            hours=12,
        )
        if (volunteer.status or '').lower() == 'invited':
            volunteer.status = 'Confirmed'
            db.session.commit()
        audit('Volunteer session activated', volunteer.name or 'Volunteer',
              target=volunteer.event_title or token_value)
        return jsonify({
            'token': session_token,
            'user': {'id': volunteer.id, 'name': volunteer.name or 'Volunteer',
                     'email': volunteer.email or '', 'role': 'Volunteer (guest)', 'roleKey': 'guest'},
            'volunteer': volunteer_json(volunteer),
            'scope': 'volunteer',
        })

    return jsonify({'message': 'This guest link is invalid or has expired.'}), 404


def _pseudo(entity_id, name, email):
    """A lightweight object the token issuer expects (sub/email/role only)."""
    class _P:
        pass
    p = _P()
    p.id = entity_id
    p.name = name
    p.email = email
    p.role = 'guest'
    return p
