"""Auth helpers: password hashing, JWT tokens, request decorators."""
from datetime import datetime, timedelta
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from models import User


def hash_password(password):
    return generate_password_hash(password or '')


def verify_password(user, password):
    if not user or not user.password_hash:
        return False
    return check_password_hash(user.password_hash, password or '')


def issue_token(user, extra=None, hours=None):
    payload = {
        'sub': user.id,
        'email': user.email,
        'role': user.role,
        'iat': datetime.utcnow(),
        'exp': datetime.utcnow() + timedelta(hours=hours or current_app.config['JWT_EXP_HOURS']),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')


def decode_token(token):
    try:
        return jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
    except Exception:
        return None


def _token_from_request():
    header = request.headers.get('Authorization', '')
    if header.startswith('Bearer '):
        return header[7:].strip()
    return request.cookies.get('waymark_token') or None


def resolve_user(allow_demo=True):
    """Return (user, claims). Falls back to the seeded demo user when no
    token is supplied so the frontend can browse without logging in."""
    token = _token_from_request()
    claims = decode_token(token) if token else None
    if claims:
        user = User.query.get(claims.get('sub'))
        if user:
            return user, claims
    if allow_demo:
        email = current_app.config.get('DEMO_USER_EMAIL') or 'admin@waymark.dev'
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User.query.filter_by(role='admin').first()
        if not user:
            user = User.query.first()
        return user, None
    return None, None


def current_user():
    if not hasattr(g, '_wm_user'):
        g._wm_user = resolve_user()
    return g._wm_user[0]


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({'message': 'Authentication required.'}), 401
        return fn(*args, **kwargs)
    return wrapper


def require_role(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({'message': 'Authentication required.'}), 401
            if roles and user.role not in roles:
                return jsonify({'message': 'You do not have permission for this action.'}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator