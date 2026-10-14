"""Host an Event: Normal Users submit a hosting request; an Admin approves it
into a real Event. A hosting request is not a role - every Normal User may
submit one, and the approved event is owned by that same user."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, HostingRequest
from utils.helpers import audit, category_meta, initials_of, notify, notify_admins, parse_int
from utils.mailer import send_mail
from utils.security import current_user, is_admin, require_admin
from utils.serializers import event_json, hosting_json

hosting_bp = Blueprint('hosting', __name__)

TEXT_FIELDS = {
    'title': ('title', 220), 'category': ('category', 80), 'description': ('description', 6000),
    'bannerUrl': ('banner_url', 400), 'date': ('date', 60), 'endDate': ('end_date', 60),
    'time': ('time', 60), 'location': ('location', 220), 'venue': ('venue', 220),
    'onlineUrl': ('online_url', 300), 'organizer': ('organizer', 160),
    'contactEmail': ('contact_email', 200), 'contactPhone': ('contact_phone', 60),
    'website': ('website', 220), 'regOpen': ('reg_open', 60), 'regDeadline': ('reg_deadline', 60),
    'eligibility': ('eligibility', 4000), 'fee': ('fee', 80), 'rules': ('rules', 6000),
    'staffing': ('staffing', 4000), 'documents': ('documents', 400),
}
LIST_FIELDS = {'tags': ('tags', 12, 60), 'agenda': ('agenda', 30, 200),
               'requirements': ('requirements', 15, 200)}


def _apply_payload(row, payload):
    for key, (attr, limit) in TEXT_FIELDS.items():
        if key in payload and payload[key] is not None:
            setattr(row, attr, str(payload[key])[:limit])
    if 'seats' in payload:
        row.seats = max(1, parse_int(payload.get('seats'), row.seats or 100))
    for key, (attr, cap, item_limit) in LIST_FIELDS.items():
        if isinstance(payload.get(key), list):
            setattr(row, attr, [str(t)[:item_limit] for t in payload[key][:cap]])
    row.updated_at = datetime.utcnow()
    return row


def _can_view(row):
    user = current_user()
    return is_admin(user) or (user and row.user_id == user.id)


@hosting_bp.route('/hosting-requests', methods=['GET'])
def list_hosting():
    user = current_user()
    query = HostingRequest.query
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    if not is_admin(user):
        query = query.filter_by(user_id=(user.id if user else ''))
    rows = query.order_by(HostingRequest.submitted_at.desc()).all()
    return jsonify([hosting_json(r) for r in rows])


@hosting_bp.route('/hosting-requests', methods=['POST'])
def create_hosting():
    user = current_user()
    if not user:
        return jsonify({'message': 'Sign in to submit a hosting request.'}), 401
    payload = request.get_json(silent=True) or {}
    title = str(payload.get('title') or '').strip()
    if not title:
        return jsonify({'message': 'Event title is required.'}), 400
    row = HostingRequest(user_id=user.id, requester_name=user.name or '',
                         requester_email=user.email or '', organizer=str(payload.get('organizer') or user.name or ''))
    _apply_payload(row, payload)
    row.status = 'Pending'
    row.submitted_at = datetime.utcnow()
    db.session.add(row)
    db.session.commit()
    notify_admins('New hosting request', (user.name or 'A user') + ' requested to host "' + title + '".')
    audit('Hosting request submitted', user, target=title)
    return jsonify(hosting_json(row)), 201


@hosting_bp.route('/hosting-requests/<req_id>', methods=['GET'])
def get_hosting(req_id):
    row = HostingRequest.query.get(req_id)
    if not row:
        return jsonify({'message': 'Hosting request not found.'}), 404
    if not _can_view(row):
        return jsonify({'message': 'You can only view your own hosting requests.'}), 403
    return jsonify(hosting_json(row))


@hosting_bp.route('/hosting-requests/<req_id>', methods=['PUT', 'PATCH'])
def update_hosting(req_id):
    row = HostingRequest.query.get(req_id)
    if not row:
        return jsonify({'message': 'Hosting request not found.'}), 404
    if not _can_view(row):
        return jsonify({'message': 'You can only edit your own hosting requests.'}), 403
    if row.status == 'Approved' and not is_admin(current_user()):
        return jsonify({'message': 'An approved hosting request can no longer be edited.'}), 409
    payload = request.get_json(silent=True) or {}
    _apply_payload(row, payload)
    db.session.commit()
    audit('Hosting request updated', current_user(), target=row.title)
    return jsonify(hosting_json(row))


@hosting_bp.route('/hosting-requests/<req_id>/resubmit', methods=['POST'])
def resubmit_hosting(req_id):
    row = HostingRequest.query.get(req_id)
    if not row:
        return jsonify({'message': 'Hosting request not found.'}), 404
    user = current_user()
    if not (user and row.user_id == user.id) and not is_admin(user):
        return jsonify({'message': 'You can only resubmit your own hosting requests.'}), 403
    if row.status not in ('Changes requested', 'Rejected', 'Cancelled'):
        return jsonify({'message': 'Only a request that needs changes, was rejected, or cancelled can be resubmitted.'}), 409
    payload = request.get_json(silent=True) or {}
    _apply_payload(row, payload)
    row.status = 'Pending'
    row.decision_reason = ''
    row.decided_by = ''
    row.decided_at = None
    row.submitted_at = datetime.utcnow()
    db.session.commit()
    notify_admins('Hosting request resubmitted', (user.name or 'A user') + ' resubmitted "' + (row.title or '') + '".')
    audit('Hosting request resubmitted', user, target=row.title)
    return jsonify(hosting_json(row))


@hosting_bp.route('/hosting-requests/<req_id>/cancel', methods=['POST'])
def cancel_hosting(req_id):
    row = HostingRequest.query.get(req_id)
    if not row:
        return jsonify({'message': 'Hosting request not found.'}), 404
    user = current_user()
    if not (user and row.user_id == user.id) and not is_admin(user):
        return jsonify({'message': 'You can only cancel your own hosting requests.'}), 403
    if row.status == 'Approved':
        return jsonify({'message': 'An approved hosting request cannot be cancelled here.'}), 409
    row.status = 'Cancelled'
    row.updated_at = datetime.utcnow()
    db.session.commit()
    audit('Hosting request cancelled', user, target=row.title)
    return jsonify(hosting_json(row))


def _decide(req_id, status, reason='', notify_title=''):
    row = HostingRequest.query.get(req_id)
    if not row:
        return None, None
    row.status = status
    row.decision_reason = reason or ''
    row.decided_by = (current_user().name if current_user() else '')
    row.decided_at = datetime.utcnow()
    row.updated_at = datetime.utcnow()
    return row, None


@hosting_bp.route('/hosting-requests/<req_id>/approve', methods=['POST'])
@require_admin
def approve_hosting(req_id):
    row = HostingRequest.query.get(req_id)
    if not row:
        return jsonify({'message': 'Hosting request not found.'}), 404
    if row.status == 'Approved':
        return jsonify({'message': 'This request has already been approved.'}), 409
    payload = request.get_json(silent=True) or {}
    start_status = str(payload.get('status') or 'Registration open')

    event = Event(title=row.title, host_id=row.user_id, host_name=row.requester_name or '',
                  organizer=row.organizer or row.requester_name or '')
    event.category = row.category or 'Community'
    event.description = row.description or ''
    event.date = row.date or ''
    event.time = row.time or ''
    event.location = row.location or row.venue or (row.online_url or 'Online')
    event.reg_deadline = row.reg_deadline or ''
    event.contact_email = row.contact_email or row.requester_email or ''
    event.website = row.website or ''
    event.seats = row.seats or 100
    event.capacity_num = row.seats or 100
    event.tags = row.tags or []
    event.agenda = row.agenda or []
    event.requirements = row.requirements or []
    meta = category_meta(event.category)
    event.tone = meta['tone']
    event.color = meta['color']
    event.initials = initials_of(event.title)
    event.status = start_status
    event.approval_status = 'Approved'
    db.session.add(event)
    db.session.flush()

    row.status = 'Approved'
    row.decision_reason = str(payload.get('reason') or '')
    row.decided_by = (current_user().name if current_user() else '')
    row.decided_at = datetime.utcnow()
    row.event_id = event.id
    row.updated_at = datetime.utcnow()
    db.session.commit()

    notify(row.user_id, 'Hosting request approved', 'Your event "' + (row.title or '') + '" is now live.', 'approval')
    if row.requester_email:
        send_mail(row.requester_email, 'Your event was approved: ' + (row.title or ''),
                  'Your hosting request was approved and the event is now live on WayMark.', kind='system')
    audit('Hosting request approved', current_user(), target=row.title)
    data = hosting_json(row)
    data['event'] = event_json(event)
    return jsonify(data)


@hosting_bp.route('/hosting-requests/<req_id>/reject', methods=['POST'])
@require_admin
def reject_hosting(req_id):
    row = HostingRequest.query.get(req_id)
    if not row:
        return jsonify({'message': 'Hosting request not found.'}), 404
    payload = request.get_json(silent=True) or {}
    reason = str(payload.get('reason') or payload.get('message') or '')
    row.status = 'Rejected'
    row.decision_reason = reason
    row.decided_by = (current_user().name if current_user() else '')
    row.decided_at = datetime.utcnow()
    row.updated_at = datetime.utcnow()
    db.session.commit()
    notify(row.user_id, 'Hosting request rejected', 'Your request "' + (row.title or '') + '" was not approved.'
           + ((' — ' + reason) if reason else ''), 'approval')
    if row.requester_email:
        send_mail(row.requester_email, 'Event not approved: ' + (row.title or ''),
                  'Your hosting request was not approved.' + (('\n\n' + reason) if reason else ''), kind='system')
    audit('Hosting request rejected', current_user(), target=row.title)
    return jsonify(hosting_json(row))


@hosting_bp.route('/hosting-requests/<req_id>/request-changes', methods=['POST'])
@require_admin
def request_hosting_changes(req_id):
    row = HostingRequest.query.get(req_id)
    if not row:
        return jsonify({'message': 'Hosting request not found.'}), 404
    payload = request.get_json(silent=True) or {}
    reason = str(payload.get('reason') or payload.get('message') or '')
    row.status = 'Changes requested'
    row.decision_reason = reason
    row.decided_by = (current_user().name if current_user() else '')
    row.decided_at = datetime.utcnow()
    row.updated_at = datetime.utcnow()
    db.session.commit()
    notify(row.user_id, 'Changes requested', 'Please update "' + (row.title or '') + '".'
           + ((' — ' + reason) if reason else ''), 'approval')
    audit('Hosting changes requested', current_user(), target=row.title)
    return jsonify(hosting_json(row))
