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
    """Return (user, claims). Falls back to the seeded demo *normal user* (never
    an admin) only when NO token is supplied at all, so unauthenticated demo
    browsing can never reach admin APIs. A token that is present but unresolved
    (invalid, expired, or a scoped guest link) never gains demo privileges."""
    token = _token_from_request()
    if token:
        claims = decode_token(token)
        if not claims:
            return None, None
        user = User.query.get(claims.get('sub'))
        return (user, claims) if user else (None, claims)
    if allow_demo:
        email = current_app.config.get('DEMO_USER_EMAIL') or 'user@baymark.com'
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User.query.filter_by(role='user', status='Active').first()
        if not user:
            user = User.query.filter_by(role='user').first()
        return user, None
    return None, None


def current_claims():
    if not hasattr(g, '_wm_user'):
        g._wm_user = resolve_user()
    return g._wm_user[1]


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


def role_key(user):
    return (user.role or 'user').lower() if user else ''


def is_admin(user):
    return bool(user) and role_key(user) == 'admin'


def can_manage_event(user, event):
    """True when the user is an admin, or owns (hosts) the given event."""
    if is_admin(user):
        return True
    return bool(user and event and event.host_id and event.host_id == user.id)


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({'message': 'Authentication required.'}), 401
        if not is_admin(user):
            return jsonify({'message': 'Administrator access is required for this action.'}), 403
        return fn(*args, **kwargs)
    return wrapper


def require_event_manager(event_id_arg='event_id'):
    """Decorator factory: the request must target an event the caller owns or
    the caller must be an admin. Injects the Event as kwarg `_event`."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            from models import Event
            user = current_user()
            if not user:
                return jsonify({'message': 'Authentication required.'}), 401
            event_id = kwargs.get(event_id_arg) or (args[0] if args else None)
            event = Event.query.get(event_id) if event_id else None
            if not event:
                return jsonify({'message': 'Event not found.'}), 404
            if not can_manage_event(user, event):
                return jsonify({'message': 'You can only manage events you host.'}), 403
            kwargs['_event'] = event
            return fn(*args, **kwargs)
        return wrapper
    return decorator