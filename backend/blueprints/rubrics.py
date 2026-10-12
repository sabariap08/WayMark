"""Rubrics per event round."""
from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, PlatformSetting, Rubric
from utils.helpers import audit
from utils.security import current_user
from utils.serializers import rubric_json

rubrics_bp = Blueprint('rubrics', __name__)

DEFAULT_CRITERIA = [
    {'id': 'c1', 'name': 'Problem relevance', 'description': 'How well the solution addresses the brief', 'weight': 30, 'maxScore': 10},
    {'id': 'c2', 'name': 'Solution quality', 'description': 'Depth, craft and feasibility of the work', 'weight': 30, 'maxScore': 10},
    {'id': 'c3', 'name': 'Demo & storytelling', 'description': 'Clarity of the walkthrough and narrative', 'weight': 20, 'maxScore': 10},
    {'id': 'c4', 'name': 'Technical depth', 'description': 'Engineering choices and originality', 'weight': 20, 'maxScore': 10},
]


def _default_rubric_name():
    row = PlatformSetting.query.get(1)
    if row and isinstance(row.data, dict) and row.data.get('defaultRubricName'):
        return row.data['defaultRubricName']
    return 'Standard judging rubric'


@rubrics_bp.route('/rubrics', methods=['GET'])
def list_rubrics():
    event_id = request.args.get('eventId')
    query = Rubric.query
    if event_id:
        query = query.filter_by(event_id=event_id)
    rows = query.order_by(Rubric.created_at.desc()).all()
    return jsonify([rubric_json(r) for r in rows])


@rubrics_bp.route('/rubrics/<rubric_id>', methods=['GET'])
def get_rubric(rubric_id):
    row = Rubric.query.get(rubric_id)
    if not row:
        return jsonify({'message': 'Rubric not found.'}), 404
    return jsonify(rubric_json(row))


@rubrics_bp.route('/rubrics', methods=['POST'])
def create_rubric():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    if event_id and not Event.query.get(event_id):
        return jsonify({'message': 'Event not found.'}), 404
    row = Rubric(
        event_id=event_id,
        rubric_name=str(payload.get('rubricName') or payload.get('name') or _default_rubric_name()),
        round=str(payload.get('round') or 'preliminary'),
        criteria=payload.get('criteria') if isinstance(payload.get('criteria'), list) else list(DEFAULT_CRITERIA),
    )
    db.session.add(row)
    db.session.commit()
    audit('Rubric created', current_user(), target=row.rubric_name)
    return jsonify(rubric_json(row)), 201


@rubrics_bp.route('/events/<event_id>/rubrics/<round_name>', methods=['GET', 'PUT'])
def event_rubric(event_id, round_name):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    row = Rubric.query.filter_by(event_id=event_id, round=round_name).order_by(Rubric.created_at.desc()).first()
    if request.method == 'GET':
        if not row:
            return jsonify({'eventId': event_id, 'round': round_name, 'rubricName': _default_rubric_name(),
                            'criteria': list(DEFAULT_CRITERIA)})
        return jsonify(rubric_json(row))

    payload = request.get_json(silent=True) or {}
    if not row:
        row = Rubric(event_id=event_id, round=round_name, rubric_name=_default_rubric_name(),
                     criteria=list(DEFAULT_CRITERIA))
        db.session.add(row)
    if payload.get('rubricName'):
        row.rubric_name = str(payload['rubricName'])
    if isinstance(payload.get('criteria'), list):
        row.criteria = payload['criteria']
    db.session.commit()
    audit('Rubric updated', current_user(), target=(event.title or '') + ' / ' + round_name)
    return jsonify(rubric_json(row))