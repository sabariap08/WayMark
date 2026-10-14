"""Feedback: participant surveys with AI summary support."""
from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, Feedback, Registration
from utils.helpers import audit, notify, parse_bool
from utils.security import can_manage_event, current_user, is_admin
from utils.serializers import feedback_json

feedback_bp = Blueprint('feedback', __name__)


@feedback_bp.route('/feedback', methods=['GET'])
def list_feedback():
    user = current_user()
    event_id = request.args.get('eventId')
    query = Feedback.query
    if event_id:
        query = query.filter_by(event_id=event_id)
    if not is_admin(user):
        manage = bool(user and event_id and can_manage_event(user, Event.query.get(event_id)))
        if not manage:
            query = query.filter_by(user_id=(user.id if user else ''))
    rows = query.order_by(Feedback.submitted_at.desc()).all()
    return jsonify([feedback_json(f) for f in rows])


@feedback_bp.route('/feedback', methods=['POST'])
def create_feedback():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404

    reg = None
    if user:
        reg = Registration.query.filter_by(event_id=event_id, user_id=user.id).first()
    attended = reg is not None and reg.attendance_status == 'Checked in'
    if not attended and event.status != 'Completed':
        return jsonify({'message': 'Feedback opens after you attend the event.'}), 409

    anonymous = parse_bool(payload.get('anonymous'))
    row = Feedback(
        event_id=event_id, event_title=event.title,
        user_id=user.id if user else '',
        user_name=user.name if user else '',
        overall_rating=int(payload.get('overallRating') or payload.get('overall') or 0),
        content_rating=int(payload.get('contentRating') or payload.get('content') or 0),
        organization_rating=int(payload.get('organizationRating') or payload.get('organization') or 0),
        venue_rating=int(payload.get('venueRating') or payload.get('venue') or 0),
        what_worked=str(payload.get('whatWorked') or ''),
        what_didnt=str(payload.get('whatDidnt') or ''),
        would_recommend=parse_bool(payload.get('wouldRecommend'), True),
        attend_again=parse_bool(payload.get('attendAgain'), True),
        anonymous=anonymous,
    )
    db.session.add(row)
    db.session.commit()
    if event.host_id:
        notify(event.host_id, 'New feedback received', 'Someone shared feedback for ' + (event.title or 'your event') + '.', 'reminder')
    audit('Feedback submitted', user, target=event.title)
    return jsonify(feedback_json(row)), 201