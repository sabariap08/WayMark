"""WayMark backend test harness.

Runs against a throwaway SQLite database so the suite can never touch real
project data. `WM_DEMO_AUTH=0` is set BEFORE the app is imported so anonymous
requests are genuinely 401 rather than resolving to the demo user - which is
what lets the authorization tests assert real behavior.

Run:  python -m pytest tests -q     (from backend/)
"""
import os
import sys
import tempfile

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Environment must be prepared before `app` is imported.
os.environ['WM_DEMO_AUTH'] = '0'
os.environ['SMTP_HOST'] = ''
os.environ['AI_PROVIDER'] = 'local'
os.environ['PAYMENT_PROVIDER'] = ''
_SQLITE_DIR = tempfile.mkdtemp(prefix='waymark-tests-')
os.environ['DATABASE_URL'] = 'sqlite:///' + os.path.join(_SQLITE_DIR, 'waymark-tests.db').replace('\\', '/')

import pytest  # noqa: E402

from app import create_app  # noqa: E402


def _login(client, identifier, password):
    res = client.post('/api/auth/login', json={'email': identifier, 'password': password})
    assert res.status_code == 200, res.get_json()
    return res.get_json()['token']


@pytest.fixture(scope='session')
def app():
    application = create_app()
    application.config['TESTING'] = True
    application.config['DEMO_AUTH'] = False
    yield application


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db(app):
    from extensions import db as _db
    with app.app_context():
        yield _db
        _db.session.rollback()


def auth(token):
    return {'Authorization': 'Bearer ' + token}


@pytest.fixture(scope='session')
def admin_token(app):
    with app.test_client() as client:
        return _login(client, 'admin@baymark.com', 'admin@123')


@pytest.fixture(scope='session')
def user_token(app):
    with app.test_client() as client:
        return _login(client, 'user@baymark.com', 'user@123')


@pytest.fixture()
def admin_headers(admin_token):
    return auth(admin_token)


@pytest.fixture()
def user_headers(user_token):
    return auth(user_token)


def get(client, url, token=None, **kw):
    return client.get(url, headers=auth(token) if token else {}, **kw)


def post(client, url, payload=None, token=None, **kw):
    return client.post(url, json=payload or {}, headers=auth(token) if token else {}, **kw)


def patch(client, url, payload=None, token=None, **kw):
    return client.patch(url, json=payload or {}, headers=auth(token) if token else {}, **kw)


def delete(client, url, token=None, **kw):
    return client.delete(url, headers=auth(token) if token else {}, **kw)


@pytest.fixture()
def sample_event(app, admin_token):
    """A minimal draft event owned by the admin."""
    with app.test_client() as client:
        res = post(client, '/api/events', {
            'title': 'Test Event Engine',
            'category': 'Hackathon',
            'seats': 50,
            'date': '2026-11-05',
        }, token=admin_token)
        assert res.status_code in (200, 201), res.get_json()
        data = res.get_json()
        yield (data.get('event') or data)
