"""Guest apps: activate judge/scanner links into scoped sessions."""
from flask import Blueprint, jsonify, request

from extensions import db
from models import JuryAssignment, User
from utils.helpers import audit
from utils.security import issue_token
from utils.serializers import assignment_json, user_json

guest_bp = Blueprint('guest', __name__)


@guest_bp.route('/guest/activate', methods=['POST'])
def activate():
    payload = request.get_json(silent=True) or {}
    token_value = str(payload.get('token') or '').strip()
    if not token_value:
        return jsonify({'message': 'A guest link token is required.'}), 400

    assignment = JuryAssignment.query.filter_by(guest_token=token_value).first()
    if not assignment:
        return jsonify({'message': 'This guest link is invalid or has expired.'}), 404

    member = None
    if assignment.jury_member_id:
        member = User.query.get(assignment.jury_member_id)
    if not member and assignment.jury_email:
        member = User.query.filter_by(email=assignment.jury_email).first()
    if not member:
        member = User(
            name=assignment.jury_name or 'Guest judge',
            email=assignment.jury_email or (token_value + '@guest.waymark.dev'),
            role='jury', status='Active',
        )
        db.session.add(member)
        db.session.commit()
        assignment.jury_member_id = member.id
        db.session.commit()

    session_token = issue_token(member, extra={'scope': 'guest', 'assignmentId': assignment.id})
    audit('Guest session activated', member, target=assignment.event_title or token_value)
    return jsonify({
        'token': session_token,
        'user': user_json(member),
        'assignment': assignment_json(assignment),
        'scope': 'jury',
    })