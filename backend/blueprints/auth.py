"""Auth: signup, login, logout, me, password reset with OTP.

OTP behaviour: when SMTP is not configured the API returns
`otpFallback` (a code of zeros, length = OTP_LENGTH) both from the request
endpoint and via the in-app mail outbox. Never blocks the flow.
"""
import random
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request

from extensions import db
from models import OtpCode, User
from utils.helpers import audit
from utils.mailer import email_configured, fallback_otp, send_mail
from utils.security import current_user, hash_password, issue_token, verify_password
from utils.serializers import user_json

auth_bp = Blueprint('auth', __name__)


def _otp_for(email, purpose):
    length = int(current_app.config.get('OTP_LENGTH', 6))
    if not email_configured():
        return fallback_otp()
    return ''.join(random.choice('0123456789') for _ in range(length))


def _create_otp(email, purpose):
    code = _otp_for(email, purpose)
    row = OtpCode(
        email=email,
        code=code,
        purpose=purpose,
        expires_at=datetime.utcnow() + timedelta(minutes=int(current_app.config.get('OTP_EXP_MINUTES', 15))),
    )
    db.session.add(row)
    db.session.commit()
    return row


@auth_bp.route('/auth/signup', methods=['POST'])
def signup():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name') or '').strip()
    email = str(payload.get('email') or '').strip().lower()
    password = str(payload.get('password') or '')
    role = str(payload.get('role') or 'participant').strip().lower()

    if not name or not email or not password:
        return jsonify({'message': 'Name, email and password are required.'}), 400
    if role not in ('participant', 'host', 'jury', 'admin'):
        role = 'participant'
    if User.query.filter_by(email=email).first():
        return jsonify({'message': 'An account with this email already exists.'}), 409

    user = User(name=name, email=email, password_hash=hash_password(password), role=role)
    db.session.add(user)
    db.session.commit()

    send_mail(email, 'Welcome to WayMark', 'Hi ' + name + ',\n\nYour WayMark account is ready.\n\n— WayMark', kind='system')
    audit('Account created', user, target=email)
    return jsonify({'token': issue_token(user), 'user': user_json(user)}), 201


@auth_bp.route('/auth/login', methods=['POST'])
def login():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email') or '').strip().lower()
    password = str(payload.get('password') or '')
    user = User.query.filter_by(email=email).first()
    if not user or not verify_password(user, password):
        return jsonify({'message': 'Invalid email or password.'}), 401
    if (user.status or '').lower() == 'suspended':
        return jsonify({'message': 'This account has been suspended.'}), 403
    audit('Signed in', user, target=email)
    return jsonify({'token': issue_token(user), 'user': user_json(user)})


@auth_bp.route('/auth/logout', methods=['POST'])
def logout():
    return jsonify({'ok': True})


@auth_bp.route('/auth/me', methods=['GET'])
def me():
    user = current_user()
    if not user:
        return jsonify({'message': 'Authentication required.'}), 401
    return jsonify({'user': user_json(user)})


@auth_bp.route('/auth/password-reset', methods=['POST'])
def password_reset():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email') or '').strip().lower()
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'message': 'No account found for that email address.'}), 404

    otp = _create_otp(email, 'password_reset')
    send_mail(email, 'Your WayMark password reset code',
              'Hi ' + user.name + ',\n\nYour password reset code is: ' + otp.code
              + '\n\nIt expires in ' + str(current_app.config.get('OTP_EXP_MINUTES', 15)) + ' minutes.\n\n— WayMark',
              kind='otp')
    audit('Password reset requested', user, target=email)
    body = {
        'ok': True,
        'emailConfigured': email_configured(),
        'message': 'Reset code sent.' if email_configured()
        else 'Email is not configured. Use the code shown in the in-app message outbox.',
    }
    if not email_configured():
        body['otpFallback'] = fallback_otp()
    return jsonify(body)


def _verify_otp(email, purpose, code):
    row = OtpCode.query.filter_by(email=email, purpose=purpose, used=False) \
        .order_by(OtpCode.created_at.desc()).first()
    if not row:
        return None, 'Request a new code first.'
    if row.expires_at < datetime.utcnow():
        return None, 'This code has expired. Request a new one.'
    if str(code or '').strip() != row.code:
        return None, 'Incorrect code. Please try again.'
    row.used = True
    db.session.commit()
    return row, None


@auth_bp.route('/auth/otp/request', methods=['POST'])
def otp_request():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email') or '').strip().lower()
    purpose = str(payload.get('purpose') or 'password_reset')
    if not email:
        return jsonify({'message': 'Email is required.'}), 400
    otp = _create_otp(email, purpose)
    send_mail(email, 'Your WayMark verification code',
              'Your verification code is: ' + otp.code, kind='otp')
    body = {'ok': True, 'emailConfigured': email_configured()}
    if not email_configured():
        body['otpFallback'] = fallback_otp()
    return jsonify(body)


@auth_bp.route('/auth/otp/verify', methods=['POST'])
def otp_verify():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email') or '').strip().lower()
    purpose = str(payload.get('purpose') or 'password_reset')
    code = payload.get('code')
    row, error = _verify_otp(email, purpose, code)
    if error:
        return jsonify({'message': error}), 400
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'message': 'No account found for that email address.'}), 404
    reset_token = issue_token(user, extra={'scope': 'password_reset'}, hours=1)
    return jsonify({'ok': True, 'token': reset_token})


@auth_bp.route('/auth/password-reset/confirm', methods=['POST'])
def password_reset_confirm():
    payload = request.get_json(silent=True) or {}
    token = str(payload.get('token') or '')
    password = str(payload.get('password') or '')
    email = str(payload.get('email') or '').strip().lower()
    code = payload.get('code')

    user = None
    if token:
        from utils.security import decode_token
        claims = decode_token(token)
        if claims and claims.get('scope') == 'password_reset':
            user = User.query.filter_by(email=claims.get('email', '')).first()
    elif email and code is not None:
        row, error = _verify_otp(email, 'password_reset', code)
        if error:
            return jsonify({'message': error}), 400
        user = User.query.filter_by(email=email).first()

    if not user:
        return jsonify({'message': 'This reset link is invalid or has expired.'}), 400
    if len(password) < 8:
        return jsonify({'message': 'Password must be at least 8 characters.'}), 400
    user.password_hash = hash_password(password)
    db.session.commit()
    audit('Password reset completed', user, target=user.email)
    return jsonify({'ok': True, 'message': 'Password updated. You can sign in now.'})