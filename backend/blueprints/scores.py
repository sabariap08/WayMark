"""Scores: jury scoring with rubric criteria, reopen flow."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, JuryAssignment, Rubric, Score, Submission
from utils.helpers import audit
from utils.security import can_manage_event, current_claims, current_user
from utils.serializers import score_json

scores_bp = Blueprint('scores', __name__)


def _judge_identity():
    """(member_id, name). A guest jury link yields the assignment; a signed-in
    user yields their own id."""
    claims = current_claims() or {}
    if claims.get('scope') == 'guest' and claims.get('kind') == 'jury':
        assignment = JuryAssignment.query.get(claims.get('assignmentId'))
        if assignment:
            return assignment.id, (assignment.jury_name or 'Guest judge')
    user = current_user()
    return (user.id if user else ''), (user.name if user else 'Guest judge')


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
    event_id = str(payload.get('eventId') or '')
    submission_id = str(payload.get('submissionId') or '')
    criteria = payload.get('criteria') if isinstance(payload.get('criteria'), list) else []
    member_id, jury_name = _judge_identity()

    submission = Submission.query.get(submission_id) if submission_id else None
    if not submission and event_id:
        scored = {s.submission_id for s in Score.query.filter_by(
            event_id=event_id, jury_member_id=member_id).all()}
        for candidate in Submission.query.filter_by(event_id=event_id).order_by(Submission.submitted_at.asc()).all():
            if candidate.id not in scored:
                submission = candidate
                break
    if not submission:
        return jsonify({'message': 'No submissions are awaiting your score.'}), 409

    rubric = Rubric.query.filter_by(event_id=submission.event_id).order_by(Rubric.created_at.desc()).first()
    total, max_score = _total_from_criteria(criteria, rubric)

    existing = None
    if member_id:
        existing = Score.query.filter_by(submission_id=submission.id, jury_member_id=member_id).first()
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
            jury_member_id=member_id, jury_name=jury_name,
            criteria=criteria, total=total, max_score=max_score,
            comment=str(payload.get('comment') or ''), status='Submitted',
        )
        db.session.add(row)
        db.session.commit()
    submission.status = 'Scored'
    db.session.commit()
    audit('Score submitted', jury_name, target=submission.team_name + ' (' + str(total) + ')')
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
    if not can_manage_event(current_user(), Event.query.get(row.event_id)):
        return jsonify({'message': 'Only the event host or an admin can reopen a score.'}), 403
    payload = request.get_json(silent=True) or {}
    row.status = 'Reopened'
    row.comment = (row.comment or '') + (' | Reopened: ' + str(payload.get('reason') or 'no reason'))
    db.session.commit()
    audit('Score reopened', current_user(), target=row.jury_name + ' / ' + score_id)
    return jsonify(score_json(row))