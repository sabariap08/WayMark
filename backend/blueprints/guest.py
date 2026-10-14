"""Guest apps: activate scoped jury / volunteer links into session tokens.

Guest links never create a user account and never grant an application role.
They only carry a scoped identity (the assignment/volunteer id) that the judge
and scanner apps understand.
"""
from flask import Blueprint, jsonify, request

from extensions import db
from models import JuryAssignment, Volunteer
from utils.helpers import audit
from utils.security import issue_token
from utils.serializers import assignment_json, volunteer_json

guest_bp = Blueprint('guest', __name__)


@guest_bp.route('/guest/activate', methods=['POST'])
def activate():
    payload = request.get_json(silent=True) or {}
    token_value = str(payload.get('token') or '').strip()
    if not token_value:
        return jsonify({'message': 'A guest link token is required.'}), 400

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
