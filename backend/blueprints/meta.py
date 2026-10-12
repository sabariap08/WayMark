"""Public meta: event types, categories, statuses."""
from flask import Blueprint, jsonify

from models import EventType
from utils.serializers import iso  # noqa: F401  (kept for consistency)

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


@meta_bp.route('/meta', methods=['GET'])
def meta():
    rows = EventType.query.order_by(EventType.sort_order.asc()).all()
    if not rows:
        types = [[name, tagline, css] for name, tagline, css in DEFAULT_TYPES]
    else:
        types = [[t.name, t.tagline, t.css_class] for t in rows]
    return jsonify({
        'eventTypes': types,
        'eventCategories': CATEGORIES,
        'eventStatuses': STATUSES,
    })


@meta_bp.route('/event-types', methods=['GET'])
def event_types():
    rows = EventType.query.order_by(EventType.sort_order.asc()).all()
    if not rows:
        return jsonify([{'id': css, 'name': name, 'tagline': tagline, 'cssClass': css}
                        for name, tagline, css in DEFAULT_TYPES])
    return jsonify([{'id': t.id, 'name': t.name, 'tagline': t.tagline, 'cssClass': t.css_class}
                    for t in rows])


@meta_bp.route('/event-types/<event_type_id>', methods=['GET'])
def event_type(event_type_id):
    row = EventType.query.get(event_type_id) or EventType.query.filter_by(name=event_type_id).first()
    if not row:
        return jsonify({'message': 'Event type not found.'}), 404
    return jsonify({'id': row.id, 'name': row.name, 'tagline': row.tagline, 'cssClass': row.css_class})