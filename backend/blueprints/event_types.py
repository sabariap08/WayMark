"""Admin-managed event types: the data-driven behaviour config for the
universal event engine. System types are seeded and cannot be deleted."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, EventType
from utils.helpers import audit, parse_bool, parse_int
from utils.security import current_user, require_admin
from utils.serializers import event_type_json

event_types_bp = Blueprint('event_types', __name__)

PARTICIPATION_MODES = ('individual', 'team')
CERTIFICATE_RULES = ('verified_attendance', 'session_attendance', 'workshop_completion',
                     'result_rank', 'presentation', 'volunteer_service')
EVALUATION_TYPES = ('jury', 'reviewer', 'none')


def _validate_config(config):
    if not isinstance(config, dict):
        return 'Config must be an object.'
    if 'participation' in config and config.get('participation') not in PARTICIPATION_MODES:
        return 'Config participation must be "individual" or "team".'
    for key in ('teamSizeMin', 'teamSizeMax'):
        if key not in config or config.get(key) is None:
            continue
        value = config.get(key)
        if isinstance(value, bool) or not isinstance(value, int):
            return 'Config ' + key + ' must be an integer.'
    low = config.get('teamSizeMin')
    high = config.get('teamSizeMax')
    if isinstance(low, int) and not isinstance(low, bool) \
            and isinstance(high, int) and not isinstance(high, bool) and low > high:
        return 'Config teamSizeMin must be less than or equal to teamSizeMax.'
    workflow = config.get('workflow')
    if workflow is not None:
        if not isinstance(workflow, list):
            return 'Config workflow must be a list.'
        for index, step in enumerate(workflow):
            if not isinstance(step, dict):
                return 'Workflow step ' + str(index + 1) + ' must be an object.'
            if not str(step.get('key') or '').strip():
                return 'Workflow step ' + str(index + 1) + ' needs a key.'
            if not str(step.get('label') or '').strip():
                return 'Workflow step ' + str(index + 1) + ' needs a label.'
    certificates = config.get('certificates')
    if certificates is not None:
        if not isinstance(certificates, dict):
            return 'Config certificates must be an object.'
        rules = certificates.get('rules')
        if rules is not None:
            if not isinstance(rules, list):
                return 'Config certificates.rules must be a list.'
            for rule in rules:
                if rule not in CERTIFICATE_RULES:
                    return ('Unknown certificate rule "' + str(rule) + '". Allowed rules: '
                            + ', '.join(CERTIFICATE_RULES) + '.')
    evaluation = config.get('evaluation')
    if evaluation is not None:
        if not isinstance(evaluation, dict):
            return 'Config evaluation must be an object.'
        if 'type' in evaluation and evaluation.get('type') not in EVALUATION_TYPES:
            return 'Config evaluation.type must be "jury", "reviewer" or "none".'
    for list_key, noun in (('fields', 'Field'), ('registrationQuestions', 'Question')):
        entries = config.get(list_key)
        if entries is None:
            continue
        if not isinstance(entries, list):
            return 'Config ' + list_key + ' must be a list.'
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                return noun + ' ' + str(index + 1) + ' must be an object.'
            if not str(entry.get('label') or '').strip():
                return noun + ' ' + str(index + 1) + ' needs a label.'
            if not str(entry.get('type') or '').strip():
                return noun + ' ' + str(index + 1) + ' needs a type.'
    return None


def _apply_basic_fields(row, payload):
    if 'name' in payload:
        name = str(payload.get('name') or '').strip()
        if not name:
            return 'Event type name is required.'
        row.name = name[:80]
    if 'tagline' in payload and payload.get('tagline') is not None:
        row.tagline = str(payload.get('tagline'))[:240]
    if 'cssClass' in payload and payload.get('cssClass') is not None:
        row.css_class = str(payload.get('cssClass'))[:40]
    if 'sortOrder' in payload:
        row.sort_order = parse_int(payload.get('sortOrder'), row.sort_order or 0)
    return None


@event_types_bp.route('/event-types', methods=['POST'])
@require_admin
def create_event_type():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Event type name is required.'}), 400
    if EventType.query.filter_by(name=name).first():
        return jsonify({'message': 'An event type named "' + name + '" already exists.'}), 409
    config = payload.get('config')
    if config is None:
        config = {}
    problem = _validate_config(config)
    if problem:
        return jsonify({'message': problem}), 400
    row = EventType(name=name[:80], is_system=False, config=config,
                    sort_order=parse_int(payload.get('sortOrder'), EventType.query.count()))
    problem = _apply_basic_fields(row, payload)
    if problem:
        return jsonify({'message': problem}), 400
    row.updated_at = datetime.utcnow()
    db.session.add(row)
    db.session.commit()
    audit('Event type created', current_user(), target=row.name)
    return jsonify(event_type_json(row)), 201


@event_types_bp.route('/event-types/<event_type_id>', methods=['PUT', 'PATCH'])
@require_admin
def update_event_type(event_type_id):
    row = EventType.query.get(event_type_id)
    if not row:
        return jsonify({'message': 'Event type not found.'}), 404
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name') or '').strip()
    if name and name != row.name:
        other = EventType.query.filter_by(name=name).first()
        if other and other.id != row.id:
            return jsonify({'message': 'An event type named "' + name + '" already exists.'}), 409
    if 'config' in payload:
        incoming = payload.get('config')
        if incoming is None:
            incoming = {}
        if not isinstance(incoming, dict):
            return jsonify({'message': 'Config must be an object.'}), 400
        if parse_bool(payload.get('replaceConfig')):
            merged = dict(incoming)
        else:
            merged = dict(row.config or {})
            merged.update(incoming)
        problem = _validate_config(merged)
        if problem:
            return jsonify({'message': problem}), 400
        row.config = merged
    problem = _apply_basic_fields(row, payload)
    if problem:
        return jsonify({'message': problem}), 400
    row.updated_at = datetime.utcnow()
    db.session.commit()
    audit('Event type updated', current_user(), target=row.name)
    return jsonify(event_type_json(row))


@event_types_bp.route('/event-types/<event_type_id>', methods=['DELETE'])
@require_admin
def delete_event_type(event_type_id):
    row = EventType.query.get(event_type_id)
    if not row:
        return jsonify({'message': 'Event type not found.'}), 404
    if row.is_system:
        return jsonify({'message': 'System event types cannot be deleted.'}), 403
    in_use = Event.query.filter(Event.event_type == row.name).count()
    if in_use:
        return jsonify({'message': 'Event type "' + row.name + '" is in use by '
                                   + str(in_use) + ' event(s) and cannot be deleted.'}), 409
    name = row.name
    db.session.delete(row)
    db.session.commit()
    audit('Event type deleted', current_user(), target=name)
    return jsonify({'ok': True})
