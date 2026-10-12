"""Submissions: teams and projects entering evaluation."""
from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, Score, Submission
from utils.helpers import audit
from utils.security import current_user
from utils.serializers import submission_json

submissions_bp = Blueprint('submissions', __name__)


@submissions_bp.route('/submissions', methods=['GET'])
def list_submissions():
    event_id = request.args.get('eventId')
    query = Submission.query
    if event_id:
        query = query.filter_by(event_id=event_id)
    rows = query.order_by(Submission.submitted_at.asc()).all()
    scores = Score.query.all()
    totals = {}
    for s in scores:
        totals.setdefault(s.submission_id, []).append(s.total or 0)
    result = []
    for sub in rows:
        values = totals.get(sub.id, [])
        avg = sum(values) / len(values) if values else None
        result.append(submission_json(sub, avg))
    return jsonify(result)


@submissions_bp.route('/submissions/<submission_id>', methods=['GET'])
def get_submission(submission_id):
    row = Submission.query.get(submission_id)
    if not row:
        return jsonify({'message': 'Submission not found.'}), 404
    scores = Score.query.filter_by(submission_id=row.id).all()
    values = [s.total or 0 for s in scores]
    avg = sum(values) / len(values) if values else None
    data = submission_json(row, avg)
    data['scores'] = [{'id': s.id, 'juryName': s.jury_name, 'total': round(s.total or 0, 1),
                       'comment': s.comment or '', 'status': s.status or ''} for s in scores]
    return jsonify(data)


@submissions_bp.route('/submissions', methods=['POST'])
def create_submission():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    team = str(payload.get('teamName') or '').strip()
    title = str(payload.get('projectTitle') or payload.get('title') or '').strip()
    if not team or not title:
        return jsonify({'message': 'Team name and project title are required.'}), 400
    row = Submission(
        event_id=event_id, team_name=team, project_title=title,
        track=str(payload.get('track') or ''), description=str(payload.get('description') or ''),
        status='Submitted',
    )
    db.session.add(row)
    db.session.commit()
    audit('Submission created', current_user(), target=team + ' — ' + title)
    return jsonify(submission_json(row)), 201