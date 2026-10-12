"""Jury: members, assignments, guest links, lookup, scoring entry point."""
from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, JuryAssignment, Rubric, Score, Submission, User
from utils.helpers import audit, guest_token, notify
from utils.mailer import send_mail
from utils.security import current_user
from utils.serializers import assignment_json, user_json

jury_bp = Blueprint('jury', __name__)


@jury_bp.route('/jury', methods=['GET'])
def list_jury():
    event_id = request.args.get('eventId')
    if event_id:
        rows = JuryAssignment.query.filter_by(event_id=event_id).all()
        return jsonify([assignment_json(j) for j in rows])
    members = User.query.filter_by(role='jury').all()
    return jsonify([user_json(u) for u in members])


@jury_bp.route('/jury', methods=['POST'])
def add_jury():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name') or '').strip()
    email = str(payload.get('email') or '').strip().lower()
    if not name or not email:
        return jsonify({'message': 'Jury name and email are required.'}), 400
    member = User.query.filter_by(email=email).first()
    if not member:
        member = User(name=name, email=email, role='jury', status='Invited')
        db.session.add(member)
        db.session.commit()
    elif member.role != 'jury':
        member.role = 'jury'
        db.session.commit()

    event_id = str(payload.get('eventId') or '')
    assignment = None
    if event_id:
        event = Event.query.get(event_id)
        if not event:
            return jsonify({'message': 'Event not found.'}), 404
        assignment = JuryAssignment(
            event_id=event.id, event_title=event.title,
            jury_member_id=member.id, jury_name=name, jury_email=email,
            expertise=str(payload.get('expertise') or ''), status='Active',
            assigned_tracks=payload.get('assignedTracks') if isinstance(payload.get('assignedTracks'), list) else [],
            guest_token=guest_token(),
        )
        db.session.add(assignment)
        db.session.commit()
        send_mail(email, 'You are invited to judge: ' + (event.title or ''),
                  'Hi ' + name + ',\n\nYou have been added as a jury member for ' + (event.title or 'the event')
                  + '.\nYour judging link token: ' + assignment.guest_token
                  + '\nOpen judge.html?token=' + assignment.guest_token + '\n\n— WayMark', kind='system')
        notify(member.id, 'Jury invitation', 'You are judging ' + (event.title or 'an event') + '.', 'approval')
        audit('Jury member added', current_user(), target=name + ' @ ' + (event.title or ''))
    return jsonify(assignment_json(assignment) if assignment else user_json(member)), 201


@jury_bp.route('/jury/<entry_id>', methods=['DELETE'])
def remove_jury(entry_id):
    assignment = JuryAssignment.query.get(entry_id)
    if assignment:
        db.session.delete(assignment)
        db.session.commit()
        audit('Jury assignment removed', current_user(), target=assignment.jury_name)
        return jsonify({'ok': True})
    member = User.query.get(entry_id)
    if member and member.role == 'jury':
        member.status = 'Removed'
        db.session.commit()
        audit('Jury member removed', current_user(), target=member.name)
        return jsonify({'ok': True})
    return jsonify({'message': 'Jury entry not found.'}), 404


@jury_bp.route('/jury/assignments', methods=['GET'])
def list_assignments():
    event_id = request.args.get('eventId')
    query = JuryAssignment.query
    if event_id:
        query = query.filter_by(event_id=event_id)
    rows = query.order_by(JuryAssignment.created_at.asc()).all()
    return jsonify([assignment_json(j) for j in rows])


@jury_bp.route('/jury/assignments', methods=['POST'])
def create_assignment():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    email = str(payload.get('juryEmail') or payload.get('email') or '').strip().lower()
    name = str(payload.get('juryName') or payload.get('name') or '').strip()
    member = User.query.filter_by(email=email).first() if email else None
    if payload.get('juryMemberId'):
        member = User.query.get(str(payload['juryMemberId'])) or member
    if member and not name:
        name = member.name
    if not name:
        return jsonify({'message': 'Jury member name is required.'}), 400
    assignment = JuryAssignment(
        event_id=event.id, event_title=event.title,
        jury_member_id=(member.id if member else ''),
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
        scored_ids = {s.submission_id for s in Score.query.filter_by(event_id=event.id, jury_member_id=assignment.jury_member_id).all()}
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