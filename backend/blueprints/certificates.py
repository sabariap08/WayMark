"""Certificates: issue, withdraw, public credential verification."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import Certificate, Event, Registration
from utils.helpers import audit, credential_code, notify
from utils.mailer import send_mail
from utils.rate_limit import rate_limit
from utils.security import can_manage_event, current_user, is_admin
from utils.serializers import certificate_json

certificates_bp = Blueprint('certificates', __name__)


@certificates_bp.route('/certificates', methods=['GET'])
def list_certificates():
    user = current_user()
    event_id = request.args.get('eventId')
    query = Certificate.query
    if event_id:
        query = query.filter_by(event_id=event_id)
    if not is_admin(user):
        manage = bool(user and event_id and can_manage_event(user, Event.query.get(event_id)))
        if not manage:
            query = query.filter(db.or_(Certificate.recipient_id == (user.id if user else ''),
                                        Certificate.recipient_name == (user.name if user else '')))
    rows = query.order_by(Certificate.issue_date.desc()).all()
    return jsonify([certificate_json(c) for c in rows])


@certificates_bp.route('/certificates/issue', methods=['POST'])
def issue_certificate():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if not can_manage_event(current_user(), event):
        return jsonify({'message': 'Only the event host or an admin can issue certificates.'}), 403

    recipient_id = str(payload.get('recipientId') or '')
    registration = None
    if payload.get('registrationId'):
        registration = Registration.query.get(str(payload['registrationId']))
    elif recipient_id:
        registration = Registration.query.filter_by(event_id=event_id, user_id=recipient_id).first()

    name = str(payload.get('recipientName') or (registration.user_name if registration else '')).strip()
    if not name:
        return jsonify({'message': 'Recipient name is required.'}), 400
    if not recipient_id and registration:
        recipient_id = registration.user_id or ''

    existing = Certificate.query.filter_by(event_id=event_id, recipient_id=recipient_id).first() if recipient_id else None
    if existing:
        return jsonify(certificate_json(existing)), 200

    cert = Certificate(
        recipient_name=name, recipient_id=recipient_id, event_id=event_id,
        event_title=event.title or '',
        issue_date=datetime.utcnow().strftime('%b %d, %Y'),
        credential_id=credential_code(),
        issuer=str(payload.get('issuer') or 'WayMark Events'),
        type=str(payload.get('type') or 'Participation'), status='Valid',
    )
    db.session.add(cert)
    db.session.commit()
    if registration:
        notify(registration.user_id, 'Certificate issued', 'Your certificate for ' + (event.title or 'the event') + ' is ready.', 'certificate')
        send_mail(registration.user_email, 'Your certificate: ' + (event.title or ''),
                  'Credential ID: ' + cert.credential_id, kind='certificate')
    audit('Certificate issued', current_user(), target=name + ' @ ' + (event.title or ''))
    return jsonify(certificate_json(cert)), 201


@certificates_bp.route('/certificates/<cert_id>/withdraw', methods=['POST'])
def withdraw_certificate(cert_id):
    cert = Certificate.query.get(cert_id)
    if not cert:
        return jsonify({'message': 'Certificate not found.'}), 404
    if not can_manage_event(current_user(), Event.query.get(cert.event_id)):
        return jsonify({'message': 'Only the event host or an admin can withdraw a certificate.'}), 403
    payload = request.get_json(silent=True) or {}
    cert.status = 'Withdrawn'
    cert.withdrawn_at = datetime.utcnow()
    if payload.get('reason'):
        audit('Certificate withdrawn', current_user(), target=cert.credential_id + ' — ' + str(payload['reason']))
    else:
        audit('Certificate withdrawn', current_user(), target=cert.credential_id)
    db.session.commit()
    return jsonify(certificate_json(cert))


from utils.rate_limit import rate_limit


@certificates_bp.route('/verify/<credential_id>', methods=['GET'])
@rate_limit(limit=30, window_seconds=60)
def verify(credential_id):
    cert = Certificate.query.filter_by(credential_id=credential_id).first()
    if not cert:
        return jsonify({'valid': False, 'status': 'Not found',
                        'message': 'No certificate matches this credential ID.'}), 404
    data = certificate_json(cert)
    data['valid'] = cert.status == 'Valid'
    data['certificate'] = certificate_json(cert)
    if cert.status != 'Valid':
        data['message'] = 'This certificate has been withdrawn by the issuer.'
    return jsonify(data)