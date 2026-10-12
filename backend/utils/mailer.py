"""In-app mail delivery.

Every outgoing message is persisted to the `wm_mail_messages` table so it can
be displayed in the app's message section regardless of SMTP availability.
When SMTP is not configured the mail is marked "Stored" and OTPs fall back to
a hardcoded code of zeros (length = OTP_LENGTH).
"""
import smtplib
from email.mime.text import MIMEText

from flask import current_app

from extensions import db
from models import MailMessage


def email_configured():
    return bool(current_app.config.get('SMTP_HOST'))


def smtp_from():
    return current_app.config.get('SMTP_FROM') or 'WayMark <no-reply@waymark.dev>'


def fallback_otp():
    return '0' * int(current_app.config.get('OTP_LENGTH', 6))


def _try_smtp(to_email, subject, body):
    host = current_app.config.get('SMTP_HOST')
    if not host:
        return False, 'Email not configured - message kept in the in-app outbox.'
    port = int(current_app.config.get('SMTP_PORT', 587))
    user = current_app.config.get('SMTP_USER')
    password = current_app.config.get('SMTP_PASSWORD')
    sender = smtp_from()
    msg = MIMEText(body or '', 'plain', 'utf-8')
    msg['Subject'] = subject or '(no subject)'
    msg['From'] = sender
    msg['To'] = to_email
    try:
        with smtplib.SMTP(host, port, timeout=12) as server:
            server.ehlo()
            if port == 587:
                server.starttls()
                server.ehlo()
            if user:
                server.login(user, password or '')
            server.sendmail(sender.split('<')[-1].strip('>'), [to_email], msg.as_string())
        return True, ''
    except Exception as exc:
        return False, 'SMTP error: ' + str(exc)


def send_mail(to_email, subject, body, kind='message', job_id=''):
    """Persist a mail record and best-effort deliver it via SMTP."""
    delivered, error = _try_smtp(to_email, subject, body)
    row = MailMessage(
        to_email=to_email or '',
        from_email=smtp_from(),
        subject=subject or '',
        body=body or '',
        kind=kind or 'message',
        status='Sent' if delivered else 'Stored',
        error='' if delivered else error,
        job_id=job_id or '',
    )
    try:
        db.session.add(row)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return None
    return row