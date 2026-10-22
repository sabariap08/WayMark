"""Guest access links: scoped judge and scanner credentials per event.

A guest link is created by the host or an admin, shown once, and stored hashed.
It is bound to one event and one kind (judge | scanner) and is only valid inside
its access window. Activating it exchanges the raw token for a short guest
session token (see blueprints/guest.py). Guests never get an app role.

Routes:
    POST   /events/{id}/guests            create a judge or scanner link
    GET    /events/{id}/guests            list links (token never returned)
    POST   /guests/{id}/resend            re-issue a fresh token, email it
    POST   /guests/{id}/revoke            revoke immediately
    POST   /guests/{id}/conflict          a judge declares a conflict
"""
import hashlib
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, GuestAccess
from utils.helpers import audit
from utils.mailer import send_mail
from utils.security import can_manage_event, current_user
from utils.serializers import guest_access_json

guests_bp = Blueprint('guests', __name__)

KINDS = ('judge', 'scanner')


def _hash_token(raw):
    return hashlib.sha256(('wm-guest:' + (raw or '')).encode('utf-8')).hexdigest()


def _new_raw_token():
    import secrets
    return 'ga-' + secrets.token_urlsafe(24)


def _parse_dt(value, default=None):
    if not value:
        return default
    text = str(value).strip().replace('Z', '+00:00')
    try:
        return datetime.fromisoformat(text).replace(tzinfo=None)
    except ValueError:
        for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M'):
            try:
                return datetime.strptime(text[:16], fmt)
            except ValueError:
                continue
    return default


def _manager_or_403(event):
    if not can_manage_event(current_user(), event):
        return jsonify({'message': 'Only the event host or an admin can manage guest links.'}), 403
    return None


@guests_bp.route('/events/<event_id>/guests', methods=['POST'])
def create_guest(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    denied = _manager_or_403(event)
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    kind = str(payload.get('kind') or 'judge').strip().lower()
    if kind not in KINDS:
        return jsonify({'message': 'Guest kind must be "judge" or "scanner".'}), 400
    name = str(payload.get('name') or '').strip()
    email = str(payload.get('email') or '').strip().lower()
    if not name:
        return jsonify({'message': 'Guest name is required.'}), 400
    access_from = _parse_dt(payload.get('accessFrom'), datetime.utcnow())
    access_to = _parse_dt(payload.get('accessTo'), access_from + timedelta(days=2))
    if access_to <= access_from:
        return jsonify({'message': 'accessTo must be after accessFrom.'}), 400

    raw = _new_raw_token()
    guest = GuestAccess(
        event_id=event.id, event_title=event.title, kind=kind, name=name, email=email,
        mobile=str(payload.get('mobile') or ''), affiliation=str(payload.get('affiliation') or ''),
        panel_role=str(payload.get('panelRole') or ''), section=str(payload.get('section') or ''),
        access_from=access_from, access_to=access_to, status='invited',
        token_hash=_hash_token(raw), created_by=(current_user().id if current_user() else ''),
    )
    db.session.add(guest)
    db.session.commit()
    if email:
        link = 'scanner.html?token=' + raw if kind == 'scanner' else 'judge.html?token=' + raw
        send_mail(email, 'Your ' + kind + ' link for ' + (event.title or ''),
                  'Hi ' + name + ',\n\nYou have been invited as a ' + kind + ' for '
                  + (event.title or 'the event') + '.\nOpen your link: ' + link
                  + '\n\nThis link is valid until ' + access_to.strftime('%b %d, %Y %H:%M') + '.\n\n— WayMark',
                  kind='system')
    audit('Guest ' + kind + ' link created', current_user(), target=name + ' @ ' + (event.title or ''))
    data = guest_access_json(guest)
    data['token'] = raw  # shown once, never stored in plain text
    return jsonify(data), 201


@guests_bp.route('/events/<event_id>/guests', methods=['GET'])
def list_guests(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    denied = _manager_or_403(event)
    if denied:
        return denied
    kind = request.args.get('kind')
    query = GuestAccess.query.filter_by(event_id=event_id)
    if kind:
        query = query.filter_by(kind=kind)
    rows = query.order_by(GuestAccess.created_at.desc()).all()
    return jsonify([guest_access_json(g) for g in rows])


@guests_bp.route('/guests/<guest_id>/resend', methods=['POST'])
def resend_guest(guest_id):
    guest = GuestAccess.query.get(guest_id)
    if not guest:
        return jsonify({'message': 'Guest link not found.'}), 404
    event = Event.query.get(guest.event_id)
    denied = _manager_or_403(event) if event else None
    if denied:
        return denied
    raw = _new_raw_token()
    guest.token_hash = _hash_token(raw)
    guest.status = 'invited'
    guest.revoked_at = None
    db.session.commit()
    if guest.email:
        link = 'scanner.html?token=' + raw if guest.kind == 'scanner' else 'judge.html?token=' + raw
        send_mail(guest.email, 'Your ' + (guest.kind or 'guest') + ' link (reissued)',
                  'Hi ' + (guest.name or 'there') + ',\n\nHere is a fresh link: ' + link + '\n\n— WayMark',
                  kind='system')
    audit('Guest link resent', current_user(), target=guest.name)
    data = guest_access_json(guest)
    data['token'] = raw
    return jsonify(data)


@guests_bp.route('/guests/<guest_id>/revoke', methods=['POST'])
def revoke_guest(guest_id):
    guest = GuestAccess.query.get(guest_id)
    if not guest:
        return jsonify({'message': 'Guest link not found.'}), 404
    event = Event.query.get(guest.event_id)
    denied = _manager_or_403(event) if event else None
    if denied:
        return denied
    guest.status = 'revoked'
    guest.revoked_at = datetime.utcnow()
    db.session.commit()
    audit('Guest link revoked', current_user(), target=guest.name)
    return jsonify(guest_access_json(guest))


@guests_bp.route('/guests/<guest_id>/conflict', methods=['POST'])
def declare_conflict(guest_id):
    """A judge can declare a conflict of interest through their link."""
    guest = GuestAccess.query.get(guest_id)
    if not guest:
        return jsonify({'message': 'Guest link not found.'}), 404
    guest.conflict_declared_at = datetime.utcnow()
    db.session.commit()
    audit('Conflict declared', guest.name, target=guest.event_title or guest_id)
    return jsonify(guest_access_json(guest))


@guests_bp.route('/guest/resolve', methods=['GET'])
def resolve_guest_token():
    """Look up a guest link by raw token (used by guest.py activation and by
    the scanner/judge apps to learn their scope)."""
    raw = request.args.get('token') or ''
    if not raw:
        return jsonify({'message': 'A token is required.'}), 400
    guest = GuestAccess.query.filter_by(token_hash=_hash_token(raw)).first()
    if not guest:
        return jsonify({'message': 'This guest link is invalid.'}), 404
    return jsonify(guest_access_json(guest))
