"""Messages & jobs: compose to audiences, in-app mail outbox."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, Job, JuryAssignment, MailMessage, Registration
from utils.helpers import audit
from utils.mailer import email_configured, send_mail
from utils.security import can_manage_event, current_user, is_admin
from utils.serializers import job_json, mail_json

messages_bp = Blueprint('messages', __name__)

AUDIENCES = ('All registrants', 'Confirmed only', 'Waitlisted', 'Jury members', 'Custom list')


def _audience_recipients(event, audience, custom):
    if audience == 'Jury members':
        rows = JuryAssignment.query.filter_by(event_id=event.id).all()
        return [(r.jury_name or '', r.jury_email or '') for r in rows if r.jury_email]
    query = Registration.query.filter_by(event_id=event.id)
    if audience == 'Confirmed only':
        query = query.filter(Registration.status.in_(['Confirmed', 'Registered']))
    elif audience == 'Waitlisted':
        query = query.filter(Registration.status.in_(['Waitlisted', 'Offered']))
    else:
        query = query.filter(Registration.status.notin_(['Cancelled', 'Declined']))
    if audience == 'Custom list':
        emails = [str(e).strip().lower() for e in (custom or []) if str(e).strip()]
        rows = Registration.query.filter(Registration.event_id == event.id,
                                         Registration.user_email.in_(emails)).all()
        return [(r.user_name or '', r.user_email or '') for r in rows]
    return [(r.user_name or '', r.user_email or '') for r in query.all() if r.user_email]


@messages_bp.route('/messages', methods=['GET'])
def list_messages():
    user = current_user()
    query = MailMessage.query
    if not is_admin(user):
        query = query.filter_by(to_email=user.email or '')
    if request.args.get('kind'):
        query = query.filter_by(kind=request.args.get('kind'))
    rows = query.order_by(MailMessage.created_at.desc()).limit(100).all()
    return jsonify([mail_json(m) for m in rows])


@messages_bp.route('/events/<event_id>/messages', methods=['POST'])
def send_event_message(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if not can_manage_event(current_user(), event):
        return jsonify({'message': 'Only the event host or an admin can message its registrants.'}), 403
    payload = request.get_json(silent=True) or {}
    subject = str(payload.get('subject') or '').strip()
    body = str(payload.get('body') or '').strip()
    audience = str(payload.get('audience') or 'All registrants')
    if audience not in AUDIENCES:
        audience = 'All registrants'
    if not subject or not body:
        return jsonify({'message': 'Subject and message body are required.'}), 400

    recipients = _audience_recipients(event, audience, payload.get('recipients'))
    job = Job(
        event_id=event.id, event_title=event.title or '', type='message',
        label=subject, subject=subject, audience=audience,
        recipients_count=len(recipients), status='Sent',
    )
    db.session.add(job)
    db.session.commit()

    for name, email in recipients[:200]:
        personalized = body.replace('{{name}}', name or 'there').replace('{{event}}', event.title or '')
        send_mail(email, subject, personalized, kind='message', job_id=job.id)

    audit('Message sent', current_user(), target=(event.title or '') + ' — ' + subject + ' (' + str(len(recipients)) + ')')
    data = job_json(job)
    data['recipients'] = len(recipients)
    data['emailConfigured'] = email_configured()
    if not email_configured():
        data['note'] = 'Email is not configured - messages were stored in the in-app outbox.'
    return jsonify(data), 201


@messages_bp.route('/messages/<mail_id>/resend', methods=['POST'])
def resend_mail(mail_id):
    mail = MailMessage.query.get(mail_id)
    if not mail:
        return jsonify({'message': 'Mail not found.'}), 404
    row = send_mail(mail.to_email, mail.subject, mail.body, kind=mail.kind)
    audit('Mail resent', current_user(), target=mail.to_email)
    return jsonify(mail_json(row))