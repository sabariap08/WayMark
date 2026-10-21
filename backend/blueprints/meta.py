"""Public meta: event types (with their behaviour config), categories, statuses."""
from flask import Blueprint, jsonify

from models import EventType
from utils.serializers import event_type_json

meta_bp = Blueprint('meta', __name__)

DEFAULT_TYPES = [
    ('Hackathon', 'Multi-day building sprints judged on demo', 'hackathon'),
    ('Workshop', 'Hands-on learning with mentors', 'workshop'),
    ('Conference', 'Talks, panels and networking', 'conference'),
    ('Competition', 'Head-to-head judged contests', 'competition'),
    ('Community', 'Casual meetups for the community', 'community'),
]

CATEGORIES = ['Hackathon', 'Workshop', 'Conference', 'Competition', 'Community']
STATUSES = ['Draft', 'Pending', 'Changes requested', 'Published', 'Registration open',
            'Registration closed', 'Ongoing', 'Completed', 'Cancelled', 'Rejected']


def _rows():
    return EventType.query.order_by(EventType.sort_order.asc()).all()


@meta_bp.route('/meta', methods=['GET'])
def meta():
    rows = _rows()
    if not rows:
        types = [[name, tagline, css] for name, tagline, css in DEFAULT_TYPES]
        categories = list(CATEGORIES)
    else:
        types = [[t.name, t.tagline, t.css_class] for t in rows]
        # Categories follow the configured event types so a new type shows up in
        # filters without a code change.
        categories = list(dict.fromkeys([t.name for t in rows] + CATEGORIES))
    return jsonify({
        'eventTypes': types,
        'eventCategories': categories,
        'eventStatuses': STATUSES,
    })


@meta_bp.route('/event-types', methods=['GET'])
def event_types():
    rows = _rows()
    if not rows:
        return jsonify([{'id': css, 'name': name, 'tagline': tagline, 'cssClass': css,
                         'config': {}}
                        for name, tagline, css in DEFAULT_TYPES])
    return jsonify([event_type_json(t) for t in rows])


@meta_bp.route('/event-types/<event_type_id>', methods=['GET'])
def event_type(event_type_id):
    row = EventType.query.get(event_type_id) or EventType.query.filter_by(name=event_type_id).first()
    if not row:
        return jsonify({'message': 'Event type not found.'}), 404
    return jsonify(event_type_json(row))
