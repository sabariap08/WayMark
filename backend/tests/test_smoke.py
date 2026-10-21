"""Baseline: the app boots, migrations run, event types are configured, and
authorization behaves correctly with the demo fallback disabled."""
from conftest import get, post


def test_health(client):
    res = get(client, '/api/health')
    assert res.status_code == 200
    data = res.get_json()
    assert data['ok'] is True
    assert 'sqlite' in data['database'].lower()


def test_migrations_applied(app):
    from migrations import migration_status
    with app.app_context():
        status = migration_status()
    assert len(status) >= 4
    assert all(row['applied'] for row in status), status
    ids = [row['id'] for row in status]
    assert ids == sorted(ids), 'migrations must run in order'


def test_event_types_are_configured(app):
    from models import EventType
    with app.app_context():
        rows = EventType.query.all()
        names = {r.name for r in rows}
        assert {'Hackathon', 'Academic conference', 'College symposium',
                'IT conference', 'Corporate event'} <= names
        for row in rows:
            assert isinstance(row.config, dict), row.name + ' has no config object'
            if row.is_system:
                assert 'workflow' in row.config, row.name
                assert 'certificates' in row.config, row.name
                assert 'evaluation' in row.config, row.name
        hackathon = EventType.query.filter_by(name='Hackathon').first()
        assert hackathon.config['participation'] == 'team'
        assert hackathon.config['evaluation']['enabled'] is True
        corporate = EventType.query.filter_by(name='Corporate event').first()
        assert corporate.config['participation'] == 'individual'


def test_anonymous_requests_are_unauthenticated(client):
    assert get(client, '/api/auth/me').status_code == 401
    assert get(client, '/api/events').status_code in (200, 401)  # public browse allowed
    assert get(client, '/api/admin/users').status_code == 401


def test_normal_user_cannot_reach_admin_api(client, user_headers):
    assert get(client, '/api/admin/users', token=user_headers['Authorization'][7:]).status_code == 403


def test_admin_can_reach_admin_api(client, admin_headers):
    res = get(client, '/api/admin/users', token=admin_headers['Authorization'][7:])
    assert res.status_code == 200
    assert isinstance(res.get_json(), list)


def test_signup_always_creates_normal_user(client, app):
    email = 'newcomer+engine@baymark.com'
    res = post(client, '/api/auth/signup', {
        'name': 'Event Newcomer', 'email': email, 'password': 'secret-pass-1',
        'role': 'admin',
    })
    assert res.status_code in (200, 201), res.get_json()
    from models import User
    with app.app_context():
        user = User.query.filter_by(email=email).first()
        assert user is not None
        assert user.role == 'user', 'public signup must never grant admin'
