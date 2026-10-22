"""Registration verification: host review of identity/eligibility.

"Verified" means: the required event questions were answered, the identity
snapshot is present, and no eligibility rule was broken. The host owns the
final call and can override a registration with a note (which is recorded).

States (registration.verification_state):
    pending    - not yet reviewed
    verified   - passes all checks
    exception  - missing required data / eligibility fails
    overridden - host forced verified with a note
"""
from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, Registration
from utils.helpers import audit
from utils.security import can_manage_event, current_user
from utils.serializers import registration_json

verification_bp = Blueprint('verification', __name__)

VERIFICATION_STATES = ('pending', 'verified', 'exception', 'overridden')


def _required_question_keys(event):
    """The `key`s of registration questions the event type marks required."""
    cfg = {}
    if event is not None:
        cfg = event.config if isinstance(event.config, dict) else {}
        if not cfg:
            from models import EventType
            et = EventType.query.filter_by(name=event.event_type).first()
            cfg = (et.config or {}) if et else {}
    keys = []
    for q in (cfg.get('registrationQuestions') or []):
        if isinstance(q, dict) and q.get('required') and q.get('key'):
            keys.append(str(q.get('key')))
    return keys


def evaluate_verification(reg, event=None):
    """Return (state, note, problems). Pure function so it is unit-testable."""
    problems = []
    snapshot = reg.identity_snapshot if isinstance(reg.identity_snapshot, dict) else {}
    if not (snapshot.get('name') or reg.user_name):
        problems.append('Missing participant name.')
    if not (snapshot.get('email') or reg.user_email):
        problems.append('Missing participant email.')
    event = event or Event.query.get(reg.event_id)
    answers = reg.answers if isinstance(reg.answers, dict) else {}
    for key in _required_question_keys(event):
        value = answers.get(key)
        if value in (None, '', [], {}):
            problems.append('Required question "' + key + '" was not answered.')
    if problems:
        return 'exception', '; '.join(problems), problems
    return 'verified', '', problems


def apply_verification(reg, event=None):
    """Compute and store the verification state. Never touches 'overridden'."""
    if (reg.verification_state or '') == 'overridden':
        return reg
    state, note, _ = evaluate_verification(reg, event)
    reg.verification_state = state
    reg.verification_note = note
    return reg


@verification_bp.route('/events/<event_id>/verification', methods=['GET'])
def verification_queue(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if not can_manage_event(current_user(), event):
        return jsonify({'message': 'Only the event host or an admin can review verification.'}), 403
    state = request.args.get('state')
    query = Registration.query.filter_by(event_id=event_id)
    if state:
        query = query.filter_by(verification_state=state)
    rows = query.order_by(Registration.registered_at.asc()).all()
    counts = {s: 0 for s in VERIFICATION_STATES}
    for reg in Registration.query.filter_by(event_id=event_id).all():
        counts[reg.verification_state or 'pending'] = counts.get(reg.verification_state or 'pending', 0) + 1
    return jsonify({
        'counts': counts,
        'registrations': [registration_json(r) for r in rows],
    })


@verification_bp.route('/registrations/<reg_id>/verify', methods=['POST'])
def verify_registration(reg_id):
    reg = Registration.query.get(reg_id)
    if not reg:
        return jsonify({'message': 'Registration not found.'}), 404
    event = Event.query.get(reg.event_id)
    if not can_manage_event(current_user(), event):
        return jsonify({'message': 'Only the event host or an admin can verify a registration.'}), 403
    payload = request.get_json(silent=True) or {}
    requested = str(payload.get('state') or '').strip().lower()
    note = str(payload.get('note') or payload.get('reason') or '')

    if requested == 'overridden':
        if not note:
            return jsonify({'message': 'An override requires a note explaining why.'}), 400
        reg.verification_state = 'overridden'
        reg.verification_note = note
    elif requested in ('verified', 'exception', 'pending'):
        reg.verification_state = requested
        reg.verification_note = note
    elif payload.get('override'):
        if not note:
            return jsonify({'message': 'An override requires a note explaining why.'}), 400
        reg.verification_state = 'overridden'
        reg.verification_note = note
    else:
        apply_verification(reg, event)
    db.session.commit()
    audit('Registration verification set to ' + (reg.verification_state or ''),
          current_user(), target=reg.user_name + ' @ ' + (reg.event_title or ''))
    return jsonify(registration_json(reg))
