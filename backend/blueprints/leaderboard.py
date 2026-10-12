"""Leaderboard: standings derived from scores and released results."""
from flask import Blueprint, jsonify, request

from models import Event
from blueprints.events import results_for_event

leaderboard_bp = Blueprint('leaderboard', __name__)


@leaderboard_bp.route('/leaderboard', methods=['GET'])
def leaderboard():
    event_id = request.args.get('eventId')
    if event_id:
        event = Event.query.get(event_id)
        if not event:
            return jsonify({'message': 'Event not found.'}), 404
        entries = results_for_event(event)
        for e in entries:
            e['eventId'] = event.id
            e['eventTitle'] = event.title
        return jsonify(entries)

    entries = []
    for event in Event.query.all():
        if not event.results_released and not request.args.get('includeUnreleased'):
            continue
        for e in results_for_event(event):
            e['eventId'] = event.id
            e['eventTitle'] = event.title
            entries.append(e)
    entries.sort(key=lambda e: (-e.get('score', 0), e.get('rank', 99)))
    for i, entry in enumerate(entries, start=1):
        entry['globalRank'] = i
    return jsonify(entries)