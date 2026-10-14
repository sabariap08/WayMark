"""Jury: event-scoped guest assignments (never a third application role).

Jury members are records on an event plus a scoped guest link. They do not get
a login or a role. Only an admin or the event's host may manage them.
"""
from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, JuryAssignment, Rubric, Score, Submission
from utils.helpers import audit, guest_token, notify
from utils.mailer import send_mail
from utils.security import can_manage_event, current_user, is_admin
from utils.serializers import assignment_json

jury_bp = Blueprint('jury', __name__)


def _manager_or_403(event):
    if not can_manage_event(current_user(), event):
        return jsonify({'message': 'Only the event host or an admin can manage its jury.'}), 403
    return None


@jury_bp.route('/jury', methods=['GET'])
def list_jury():
    event_id = request.args.get('eventId')
    if event_id:
        event = Event.query.get(event_id)
        if not event:
            return jsonify({'message': 'Event not found.'}), 404
        denied = _manager_or_403(event)
        if denied:
            return denied
        rows = JuryAssignment.query.filter_by(event_id=event_id).all()
        return jsonify([assignment_json(j) for j in rows])
    if not is_admin(current_user()):
        return jsonify({'message': 'Administrator access is required to view all jury members.'}), 403
    rows = JuryAssignment.query.order_by(JuryAssignment.created_at.desc()).all()
    return jsonify([assignment_json(j) for j in rows])


@jury_bp.route('/jury', methods=['POST'])
def add_jury():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    event = Event.query.get(event_id) if event_id else None
    if not event:
        return jsonify({'message': 'A valid event is required to add a jury member.'}), 400
    denied = _manager_or_403(event)
    if denied:
        return denied

    name = str(payload.get('name') or payload.get('juryName') or '').strip()
    email = str(payload.get('email') or payload.get('juryEmail') or '').strip().lower()
    if not name or not email:
        return jsonify({'message': 'Jury name and email are required.'}), 400

    assignment = JuryAssignment(
        event_id=event.id, event_title=event.title,
        jury_name=name, jury_email=email,
        expertise=str(payload.get('expertise') or ''),
        assigned_tracks=payload.get('assignedTracks') if isinstance(payload.get('assignedTracks'), list) else [],
        status='Active', guest_token=guest_token(),
    )
    db.session.add(assignment)
    db.session.commit()
    send_mail(email, 'You are invited to judge: ' + (event.title or ''),
              'Hi ' + name + ',\n\nYou have been added as a jury member for ' + (event.title or 'the event')
              + '.\nOpen your judging link: judge.html?token=' + assignment.guest_token
              + '\n\n— WayMark', kind='system')
    audit('Jury member added', current_user(), target=name + ' @ ' + (event.title or ''))
    return jsonify(assignment_json(assignment)), 201


@jury_bp.route('/jury/<entry_id>', methods=['PUT', 'PATCH'])
def update_jury(entry_id):
    assignment = JuryAssignment.query.get(entry_id)
    if not assignment:
        return jsonify({'message': 'Jury entry not found.'}), 404
    event = Event.query.get(assignment.event_id)
    denied = _manager_or_403(event) if event else None
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    if payload.get('name') or payload.get('juryName'):
        assignment.jury_name = str(payload.get('name') or payload.get('juryName'))[:160]
    if payload.get('email') or payload.get('juryEmail'):
        assignment.jury_email = str(payload.get('email') or payload.get('juryEmail'))[:200]
    if 'expertise' in payload:
        assignment.expertise = str(payload.get('expertise') or '')[:160]
    if 'status' in payload:
        assignment.status = str(payload.get('status') or assignment.status)[:30]
    if isinstance(payload.get('assignedTracks'), list):
        assignment.assigned_tracks = payload['assignedTracks']
    db.session.commit()
    audit('Jury assignment updated', current_user(), target=assignment.jury_name)
    return jsonify(assignment_json(assignment))


@jury_bp.route('/jury/<entry_id>', methods=['DELETE'])
def remove_jury(entry_id):
    assignment = JuryAssignment.query.get(entry_id)
    if not assignment:
        return jsonify({'message': 'Jury entry not found.'}), 404
    event = Event.query.get(assignment.event_id)
    denied = _manager_or_403(event) if event else None
    if denied:
        return denied
    name = assignment.jury_name
    db.session.delete(assignment)
    db.session.commit()
    audit('Jury assignment removed', current_user(), target=name)
    return jsonify({'ok': True})


@jury_bp.route('/jury/assignments', methods=['GET'])
def list_assignments():
    event_id = request.args.get('eventId')
    query = JuryAssignment.query
    if event_id:
        event = Event.query.get(event_id)
        if not event:
            return jsonify({'message': 'Event not found.'}), 404
        denied = _manager_or_403(event)
        if denied:
            return denied
        query = query.filter_by(event_id=event_id)
    elif not is_admin(current_user()):
        return jsonify({'message': 'Administrator access is required.'}), 403
    rows = query.order_by(JuryAssignment.created_at.asc()).all()
    return jsonify([assignment_json(j) for j in rows])


@jury_bp.route('/jury/assignments', methods=['POST'])
def create_assignment():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    denied = _manager_or_403(event)
    if denied:
        return denied
    email = str(payload.get('juryEmail') or payload.get('email') or '').strip().lower()
    name = str(payload.get('juryName') or payload.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Jury member name is required.'}), 400
    assignment = JuryAssignment(
        event_id=event.id, event_title=event.title,
        jury_name=name, jury_email=email,
        expertise=str(payload.get('expertise') or ''),
        assigned_tracks=payload.get('assignedTracks') if isinstance(payload.get('assignedTracks'), list) else [],
        status='Active', guest_token=guest_token(),
    )
    db.session.add(assignment)
    db.session.commit()
    audit('Jury assigned', current_user(), target=name + ' @ ' + (event.title or ''))
    return jsonify(assignment_json(assignment)), 201


@jury_bp.route('/jury/lookup', methods=['POST'])
def lookup():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    token_value = str(payload.get('token') or '')
    event = Event.query.get(event_id) if event_id else None
    assignment = None
    if token_value:
        assignment = JuryAssignment.query.filter_by(guest_token=token_value).first()
        if assignment and not event:
            event = Event.query.get(assignment.event_id)
    if not event:
        return jsonify({'message': 'Event not found for this judging session.'}), 404
    rubric = Rubric.query.filter_by(event_id=event.id).order_by(Rubric.created_at.desc()).first()
    subs = Submission.query.filter_by(event_id=event.id).all()
    scored_ids = set()
    if assignment:
        scored_ids = {s.submission_id for s in Score.query.filter_by(
            event_id=event.id, jury_member_id=assignment.id).all()}
    return jsonify({
        'event': {'id': event.id, 'title': event.title, 'category': event.category, 'status': event.status},
        'rubric': {'id': rubric.id, 'rubricName': rubric.rubric_name, 'round': rubric.round,
                   'criteria': rubric.criteria or []} if rubric else None,
        'submissions': [{'id': s.id, 'teamName': s.team_name, 'projectTitle': s.project_title,
                         'track': s.track, 'scored': s.id in scored_ids} for s in subs],
        'assignment': assignment_json(assignment),
    })


@jury_bp.route('/jury/scores', methods=['POST'])
def jury_scores():
    from blueprints.scores import create_score
    return create_score()
