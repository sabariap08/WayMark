"""Scores: jury scoring with rubric criteria, reopen flow."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import JuryAssignment, Rubric, Score, Submission
from utils.helpers import audit
from utils.security import current_user
from utils.serializers import score_json

scores_bp = Blueprint('scores', __name__)


def _total_from_criteria(criteria, rubric):
    rubric_map = {}
    for c in (rubric.criteria or []) if rubric else []:
        rubric_map[str(c.get('id'))] = c
    total = 0.0
    max_score = 0.0
    for entry in criteria or []:
        cid = str(entry.get('id') or entry.get('criterionId') or '')
        value = float(entry.get('value') or entry.get('score') or 0)
        meta = rubric_map.get(cid, {})
        weight = float(meta.get('weight') or entry.get('weight') or 0) / 100.0
        max_score += float(meta.get('maxScore') or entry.get('maxScore') or 10) * weight
        total += value * weight
    return round(total, 2), round(max_score, 2)


def create_score():
    payload = request.get_json(silent=True) or {}
    user = current_user()
    event_id = str(payload.get('eventId') or '')
    submission_id = str(payload.get('submissionId') or '')
    criteria = payload.get('criteria') if isinstance(payload.get('criteria'), list) else []

    submission = Submission.query.get(submission_id) if submission_id else None
    if not submission and event_id:
        assignment = None
        if user:
            assignment = JuryAssignment.query.filter_by(event_id=event_id, jury_member_id=user.id).first()
            scored = {s.submission_id for s in Score.query.filter_by(
                event_id=event_id, jury_member_id=user.id).all()}
        else:
            scored = set()
        for candidate in Submission.query.filter_by(event_id=event_id).order_by(Submission.submitted_at.asc()).all():
            if candidate.id not in scored:
                submission = candidate
                break
    if not submission:
        return jsonify({'message': 'No submissions are awaiting your score.'}), 409

    rubric = Rubric.query.filter_by(event_id=submission.event_id).order_by(Rubric.created_at.desc()).first()
    total, max_score = _total_from_criteria(criteria, rubric)

    jury_name = user.name if user else 'Guest judge'
    existing = None
    if user:
        existing = Score.query.filter_by(submission_id=submission.id, jury_member_id=user.id).first()
    if existing:
        existing.criteria = criteria
        existing.total = total
        existing.max_score = max_score
        existing.comment = str(payload.get('comment') or '')
        existing.status = 'Submitted'
        existing.submitted_at = datetime.utcnow()
        db.session.commit()
        row = existing
    else:
        row = Score(
            event_id=submission.event_id, submission_id=submission.id,
            jury_member_id=user.id if user else '', jury_name=jury_name,
            criteria=criteria, total=total, max_score=max_score,
            comment=str(payload.get('comment') or ''), status='Submitted',
        )
        db.session.add(row)
        db.session.commit()
    submission.status = 'Scored'
    db.session.commit()
    audit('Score submitted', user, target=submission.team_name + ' (' + str(total) + ')')
    data = score_json(row)
    data['submission'] = {'id': submission.id, 'teamName': submission.team_name,
                          'projectTitle': submission.project_title}
    return jsonify(data), 201


@scores_bp.route('/scores', methods=['POST'])
def post_score():
    return create_score()


@scores_bp.route('/scores/<score_id>/reopen', methods=['POST'])
def reopen_score(score_id):
    row = Score.query.get(score_id)
    if not row:
        return jsonify({'message': 'Score not found.'}), 404
    payload = request.get_json(silent=True) or {}
    row.status = 'Reopened'
    row.comment = (row.comment or '') + (' | Reopened: ' + str(payload.get('reason') or 'no reason'))
    db.session.commit()
    audit('Score reopened', current_user(), target=row.jury_name + ' / ' + score_id)
    return jsonify(score_json(row))