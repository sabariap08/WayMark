"""Users: profile management and directory."""
from flask import Blueprint, jsonify, request

from extensions import db
from models import User
from utils.helpers import audit, parse_bool
from utils.security import current_user, require_auth
from utils.serializers import user_json

users_bp = Blueprint('users', __name__)


@users_bp.route('/users', methods=['GET'])
def list_users():
    query = User.query
    role = request.args.get('role')
    status = request.args.get('status')
    q = (request.args.get('q') or '').strip().lower()
    if role:
        query = query.filter_by(role=role.lower())
    if status:
        query = query.filter_by(status=status)
    if q:
        query = query.filter(db.or_(User.name.ilike('%' + q + '%'), User.email.ilike('%' + q + '%')))
    rows = query.order_by(User.created_at.asc()).all()
    return jsonify([user_json(u) for u in rows])


@users_bp.route('/users/me', methods=['GET'])
def me():
    return jsonify(user_json(current_user()))


def _apply_profile(user, payload):
    text_fields = {
        'name': ('name', 160), 'phone': ('phone', 40), 'org': ('org', 160),
        'bio': ('bio', 2000), 'website': ('website', 220), 'location': ('location', 160),
        'birthDate': ('birth_date', 30), 'pronouns': ('pronouns', 40),
    }
    for key, (attr, limit) in text_fields.items():
        if key in payload and payload[key] is not None:
            setattr(user, attr, str(payload[key])[:limit])
    if 'email' in payload and payload['email']:
        new_email = str(payload['email']).strip().lower()
        existing = User.query.filter_by(email=new_email).first()
        if existing and existing.id != user.id:
            return 'That email is already in use.'
        user.email = new_email
    for key, attr in (('emailUpdates', 'email_updates'), ('smsReminders', 'sms_reminders'), ('publicProfile', 'public_profile')):
        if key in payload:
            setattr(user, attr, parse_bool(payload[key]))
    return None


@users_bp.route('/users/me', methods=['PUT', 'PATCH'])
def update_me():
    user = current_user()
    if not user:
        return jsonify({'message': 'Authentication required.'}), 401
    payload = request.get_json(silent=True) or {}
    error = _apply_profile(user, payload)
    if error:
        return jsonify({'message': error}), 409
    db.session.commit()
    audit('Profile updated', user, target=user.email)
    return jsonify(user_json(user))


@users_bp.route('/me/registrations', methods=['GET'])
def my_registrations():
    from models import Registration
    from utils.serializers import registration_json
    user = current_user()
    query = Registration.query
    if user:
        query = query.filter_by(user_id=user.id)
    rows = query.order_by(Registration.registered_at.desc()).all()
    return jsonify([registration_json(r) for r in rows])


@users_bp.route('/me/certificates', methods=['GET'])
def my_certificates():
    from models import Certificate
    from utils.serializers import certificate_json
    user = current_user()
    query = Certificate.query
    if user:
        query = query.filter(db.or_(Certificate.recipient_id == user.id,
                                    Certificate.recipient_name == user.name))
    rows = query.order_by(Certificate.issue_date.desc()).all()
    return jsonify([certificate_json(c) for c in rows])