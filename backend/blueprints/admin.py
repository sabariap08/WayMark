"""Admin: review queue, moderation, users, jobs, AI logs, platform settings."""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import (AiLog, AuditLog, Event, EventApprovalRecord, Job, MailMessage, PlatformSetting, User)
from utils.helpers import audit, notify
from utils.mailer import email_configured, send_mail, smtp_from
from utils.security import current_user, require_admin
from utils.serializers import (ai_log_json, approval_record_json, audit_json, event_json, job_json, user_json)

admin_bp = Blueprint('admin', __name__)

DEFAULT_SETTINGS = {
    'platformName': 'WayMark',
    'supportEmail': 'support@waymark.dev',
    'timezone': 'Asia/Kolkata (GMT+5:30)',
    'defaultRubricName': 'Standard judging rubric',
    'certificateIssuer': 'WayMark Events',
    'maintenanceMode': False,
    'allowSelfSignup': True,
    'autoApproveEvents': False,
    'emailNotifications': True,
    'smsReminders': False,
}


def get_settings():
    row = PlatformSetting.query.get(1)
    if not row:
        row = PlatformSetting(id=1, data=dict(DEFAULT_SETTINGS))
        db.session.add(row)
        db.session.commit()
    merged = dict(DEFAULT_SETTINGS)
    merged.update(row.data or {})
    return row, merged


@admin_bp.route('/admin/settings', methods=['GET'])
@require_admin
def settings_get():
    _, data = get_settings()
    data['emailConfigured'] = email_configured()
    data['smtpFrom'] = smtp_from()
    return jsonify(data)


@admin_bp.route('/admin/settings', methods=['PATCH', 'PUT'])
@require_admin
def settings_update():
    row, _ = get_settings()
    payload = request.get_json(silent=True) or {}
    data = dict(row.data or {})
    for key in DEFAULT_SETTINGS:
        if key in payload and payload[key] is not None:
            data[key] = payload[key]
    row.data = data
    row.updated_at = datetime.utcnow()
    db.session.commit()
    audit('Platform settings updated', current_user(), target=', '.join(sorted(payload.keys())))
    merged = dict(DEFAULT_SETTINGS)
    merged.update(data)
    merged['emailConfigured'] = email_configured()
    merged['smtpFrom'] = smtp_from()
    return jsonify(merged)


@admin_bp.route('/admin/review-queue', methods=['GET'])
@require_admin
def review_queue():
    rows = Event.query.filter(Event.status.in_(['Pending', 'Changes requested'])).order_by(Event.submitted_at.asc()).all()
    return jsonify([event_json(e) for e in rows])


def _moderate(event_id, status, approval_status, notify_title, reason='', mail_subject='', action=''):
    event = Event.query.get(event_id)
    if not event:
        return None
    event.status = status
    event.approval_status = approval_status
    event.rejection_reason = reason or ''
    event.updated_at = datetime.utcnow()
    if action:
        db.session.add(EventApprovalRecord(
            event_id=event.id, action=action, reason=reason or '',
            actor_id=(current_user().id if current_user() else ''),
            actor_name=(current_user().name if current_user() else 'system')))
    db.session.commit()
    if event.host_id:
        message = notify_title + ': ' + (event.title or 'your event') + ((' — ' + reason) if reason else '')
        notify(event.host_id, 'Event ' + status.lower(), message, 'approval')
    if mail_subject and event.contact_email:
        send_mail(event.contact_email, mail_subject + (event.title or ''),
                  (notify_title + ' for ' + (event.title or 'your event') + '.') + (('\n\n' + reason) if reason else ''),
                  kind='system')
    return event


@admin_bp.route('/admin/events/<event_id>/approve', methods=['POST'])
@require_admin
def approve(event_id):
    payload = request.get_json(silent=True) or {}
    event = _moderate(event_id, str(payload.get('status') or 'Registration open'), 'Approved',
                      'Approved', mail_subject='Your event was approved: ', action='approved')
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    audit('Event approved', current_user(), target=event.title)
    return jsonify(event_json(event))


@admin_bp.route('/admin/events/<event_id>/request-changes', methods=['POST'])
@require_admin
def request_changes(event_id):
    payload = request.get_json(silent=True) or {}
    reason = str(payload.get('message') or payload.get('reason') or '')
    event = _moderate(event_id, 'Changes requested', 'Changes requested',
                      'Changes requested', reason=reason, mail_subject='Changes requested: ',
                      action='changes_requested')
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    audit('Changes requested', current_user(), target=event.title)
    return jsonify(event_json(event))


@admin_bp.route('/admin/events/<event_id>/reject', methods=['POST'])
@require_admin
def reject(event_id):
    payload = request.get_json(silent=True) or {}
    reason = str(payload.get('reason') or payload.get('message') or '')
    event = _moderate(event_id, 'Rejected', 'Rejected', 'Rejected', reason=reason,
                      mail_subject='Event not approved: ', action='rejected')
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    audit('Event rejected', current_user(), target=event.title)
    return jsonify(event_json(event))


@admin_bp.route('/admin/users', methods=['GET'])
@require_admin
def admin_users():
    query = User.query
    role = request.args.get('role')
    if role:
        query = query.filter_by(role=role.lower())
    rows = query.order_by(User.created_at.asc()).all()
    return jsonify([user_json(u) for u in rows])


@admin_bp.route('/admin/events/<event_id>/approval-history', methods=['GET'])
@require_admin
def approval_history(event_id):
    rows = EventApprovalRecord.query.filter_by(event_id=event_id).order_by(EventApprovalRecord.created_at.asc()).all()
    return jsonify([approval_record_json(r) for r in rows])


@admin_bp.route('/events/<event_id>/approval-history', methods=['GET'])
def event_approval_history(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    from utils.security import can_manage_event
    if not can_manage_event(current_user(), event) and not __import__('utils.security', fromlist=['is_admin']).is_admin(current_user()):
        return jsonify({'message': 'Only the event host or an admin can view approval history.'}), 403
    rows = EventApprovalRecord.query.filter_by(event_id=event_id).order_by(EventApprovalRecord.created_at.asc()).all()
    return jsonify([approval_record_json(r) for r in rows])
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found.'}), 404
    payload = request.get_json(silent=True) or {}
    user.status = str(payload.get('status') or 'Suspended')
    db.session.commit()
    audit('User ' + user.status.lower(), current_user(), target=user.email)
    return jsonify(user_json(user))


@admin_bp.route('/admin/events', methods=['GET'])
@require_admin
def admin_events():
    status = request.args.get('status')
    query = Event.query
    if status:
        query = query.filter_by(status=status)
    rows = query.order_by(Event.created_at.desc()).all()
    return jsonify([event_json(e) for e in rows])


@admin_bp.route('/admin/audit', methods=['GET'])
@require_admin
def admin_audit():
    q = (request.args.get('q') or '').strip().lower()
    query = AuditLog.query
    if q:
        query = query.filter(AuditLog.action.ilike('%' + q + '%'))
    rows = query.order_by(AuditLog.timestamp.desc()).limit(200).all()
    return jsonify([audit_json(a) for a in rows])


@admin_bp.route('/admin/jobs', methods=['GET'])
@require_admin
def admin_jobs():
    status = request.args.get('status')
    query = Job.query
    if status:
        query = query.filter_by(status=status)
    rows = query.order_by(Job.created_at.desc()).limit(100).all()
    return jsonify([job_json(j) for j in rows])


@admin_bp.route('/admin/jobs/<job_id>/retry', methods=['POST'])
@require_admin
def retry_job(job_id):
    job = Job.query.get(job_id)
    if not job:
        return jsonify({'message': 'Job not found.'}), 404
    mails = MailMessage.query.filter_by(job_id=job.id).all()
    delivered = 0
    for mail in mails:
        row = send_mail(mail.to_email, mail.subject, mail.body, kind=mail.kind, job_id=job.id)
        if row and row.status == 'Sent':
            delivered += 1
    job.status = 'Sent' if delivered or not mails else 'Failed'
    job.error = '' if job.status == 'Sent' else 'Retry attempted - email still not configured.'
    job.updated_at = datetime.utcnow()
    db.session.commit()
    audit('Job retried', current_user(), target=job.label or job.id)
    return jsonify(job_json(job))


@admin_bp.route('/admin/ai-logs', methods=['GET'])
@require_admin
def admin_ai_logs():
    rows = AiLog.query.order_by(AiLog.created_at.desc()).limit(100).all()
    return jsonify([ai_log_json(a) for a in rows])


@admin_bp.route('/admin/mail', methods=['GET'])
@require_admin
def admin_mail():
    rows = MailMessage.query.order_by(MailMessage.created_at.desc()).limit(200).all()
    from utils.serializers import mail_json
    return jsonify([mail_json(m) for m in rows])