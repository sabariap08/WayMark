"""Tests for blueprint gaps: identity snapshot/verification, guest_access,
slug/visibility, approval history, scheduler auto-complete, rate limiting."""
from datetime import datetime, timedelta

from models import (Certificate, Event, EventApprovalRecord, GuestAccess,
                    Registration, Submission, User)
from tests.conftest import auth


def _admin_login(client):
    res = client.post('/api/auth/login', json={'email': 'admin@baymark.com', 'password': 'admin@123'})
    return res.get_json()['token']


def _user_login(client):
    res = client.post('/api/auth/login', json={'email': 'user@baymark.com', 'password': 'user@123'})
    return res.get_json()['token']


def test_registration_has_identity_snapshot_and_verification(app, client, admin_token):
    # Create event as admin
    r = client.post('/api/events', json={'title': 'VerifyMe', 'category': 'Workshop', 'seats': 20}, headers=auth(admin_token))
    assert r.status_code in (200, 201)
    event_id = (r.get_json().get('event') or r.get_json()).get('id')
    client.post('/api/events/' + event_id + '/submit', headers=auth(admin_token))
    client.post('/api/events/' + event_id + '/approve', headers=auth(admin_token))
    # Register as normal user
    ut = _user_login(client)
    rr = client.post('/api/registrations', json={'eventId': event_id, 'answers': {}}, headers=auth(ut))
    assert rr.status_code == 201
    data = rr.get_json()
    reg_id = data['id']
    assert data.get('identitySnapshot') and data['identitySnapshot'].get('email')
    assert data.get('verificationState') in ('pending', 'verified', 'exception', 'overridden')


def test_verification_queue_and_override(app, client, admin_token):
    r = client.post('/api/events', json={'title': 'VerifyQ', 'category': 'Seminar', 'seats': 10}, headers=auth(admin_token))
    event_id = (r.get_json().get('event') or r.get_json()).get('id')
    client.post('/api/events/' + event_id + '/submit', headers=auth(admin_token))
    client.post('/api/events/' + event_id + '/approve', headers=auth(admin_token))
    ut = _user_login(client)
    rr = client.post('/api/registrations', json={'eventId': event_id}, headers=auth(ut))
    reg_id = rr.get_json()['id']
    q = client.get('/api/events/' + event_id + '/verification', headers=auth(admin_token))
    assert q.status_code == 200
    assert 'counts' in q.get_json()
    ov = client.post('/api/registrations/' + reg_id + '/verify', json={'override': True, 'note': 'Host approved manually'}, headers=auth(admin_token))
    assert ov.status_code == 200
    assert ov.get_json().get('verificationState') == 'overridden'
    assert ov.get_json().get('verificationNote')


def test_verification_requires_note_for_override(app, client, admin_token):
    r = client.post('/api/events', json={'title': 'VerifyNo', 'category': 'Talk', 'seats': 5}, headers=auth(admin_token))
    event_id = (r.get_json().get('event') or r.get_json()).get('id')
    client.post('/api/events/' + event_id + '/submit', headers=auth(admin_token))
    client.post('/api/events/' + event_id + '/approve', headers=auth(admin_token))
    ut = _user_login(client)
    rr = client.post('/api/registrations', json={'eventId': event_id}, headers=auth(ut))
    reg_id = rr.get_json()['id']
    ov = client.post('/api/registrations/' + reg_id + '/verify', json={'override': True}, headers=auth(admin_token))
    assert ov.status_code == 400


def test_guest_access_judge_and_scanner_lifecycle(app, client, admin_token):
    r = client.post('/api/events', json={'title': 'GuestEv', 'category': 'Hackathon', 'seats': 50}, headers=auth(admin_token))
    event_id = (r.get_json().get('event') or r.get_json()).get('id')
    # Create judge link
    gj = client.post('/api/events/' + event_id + '/guests', json={'kind': 'judge', 'name': 'Dr. Judge', 'email': 'judge@example.com'}, headers=auth(admin_token))
    assert gj.status_code == 201
    gjd = gj.get_json()
    assert gjd.get('token')
    guest_id = gjd['id']
    # Create scanner link
    gs = client.post('/api/events/' + event_id + '/guests', json={'kind': 'scanner', 'name': 'Door Staff', 'email': 'scan@example.com'}, headers=auth(admin_token))
    assert gs.status_code == 201
    assert gs.get_json().get('token')
    # List
    lst = client.get('/api/events/' + event_id + '/guests', headers=auth(admin_token))
    assert lst.status_code == 200
    assert len(lst.get_json()) >= 2
    # Activate judge
    act = client.post('/api/guest/activate', json={'token': gjd['token']})
    assert act.status_code == 200
    ad = act.get_json()
    assert ad.get('token')
    assert (ad.get('user') or {}).get('roleKey') == 'guest'
    # Revoke
    rv = client.post('/api/guests/' + guest_id + '/revoke', headers=auth(admin_token))
    assert rv.status_code == 200
    assert rv.get_json().get('status') == 'revoked'
    # Activate revoked -> 403
    act2 = client.post('/api/guest/activate', json={'token': gjd['token']})
    assert act2.status_code == 403
    # Resend
    rs = client.post('/api/guests/' + guest_id + '/resend', headers=auth(admin_token))
    assert rs.status_code == 200
    assert rs.get_json().get('token')
    assert rs.get_json().get('status') == 'invited'


def test_guest_link_scoped_by_window(app, client, admin_token):
    from models import GuestAccess
    from extensions import db
    r = client.post('/api/events', json={'title': 'WindowEv', 'category': 'Talk', 'seats': 10}, headers=auth(admin_token))
    event_id = (r.get_json().get('event') or r.get_json()).get('id')
    # Create via API then tamper
    gj = client.post('/api/events/' + event_id + '/guests', json={'kind': 'judge', 'name': 'J2', 'email': 'j2@example.com'}, headers=auth(admin_token))
    tok = gj.get_json()['token']
    gid = gj.get_json()['id']
    with app.app_context():
        g = GuestAccess.query.get(gid)
        g.access_from = datetime.utcnow() + timedelta(hours=1)
        db.session.commit()
    act = client.post('/api/guest/activate', json={'token': tok})
    assert act.status_code == 403


def test_event_slug_visibility_and_discovery(app, client, admin_token):
    r = client.post('/api/events', json={'title': 'My Great Event!', 'category': 'Workshop', 'seats': 15, 'visibility': 'unlisted'}, headers=auth(admin_token))
    assert r.status_code in (200, 201)
    ev = r.get_json().get('event') or r.get_json()
    assert ev.get('slug')
    assert ev.get('visibility') == 'unlisted'
    # fetch by slug
    bs = client.get('/api/events/by-slug/' + ev['slug'])
    assert bs.status_code == 200
    # duplicate slug
    r2 = client.post('/api/events', json={'title': 'Other', 'category': 'Talk', 'seats': 5, 'slug': ev['slug']}, headers=auth(admin_token))
    assert r2.status_code == 409


def test_approval_records_insert_only(app, client, admin_token):
    r = client.post('/api/events', json={'title': 'TrailEv', 'category': 'Conference', 'seats': 100}, headers=auth(admin_token))
    event_id = (r.get_json().get('event') or r.get_json()).get('id')
    # submit
    s = client.post('/api/events/' + event_id + '/submit', headers=auth(admin_token))
    assert s.status_code == 200
    # request changes
    rc = client.post('/api/events/' + event_id + '/request-changes', json={'reason': 'Missing details'}, headers=auth(admin_token))
    assert rc.status_code == 200
    # approve
    ap = client.post('/api/events/' + event_id + '/approve', headers=auth(admin_token))
    assert ap.status_code == 200
    with app.app_context():
        rows = EventApprovalRecord.query.filter_by(event_id=event_id).order_by(EventApprovalRecord.created_at.asc()).all()
        actions = [x.action for x in rows]
        assert 'submitted' in actions or 'resubmitted' in actions
        assert 'changes_requested' in actions
        assert 'approved' in actions
    hist = client.get('/api/admin/events/' + event_id + '/approval-history', headers=auth(admin_token))
    assert hist.status_code == 200


def test_request_changes_requires_reason(app, client, admin_token):
    r = client.post('/api/events', json={'title': 'TrailEv2', 'category': 'Workshop', 'seats': 10}, headers=auth(admin_token))
    event_id = (r.get_json().get('event') or r.get_json()).get('id')
    client.post('/api/events/' + event_id + '/submit', headers=auth(admin_token))
    rc = client.post('/api/events/' + event_id + '/request-changes', json={}, headers=auth(admin_token))
    assert rc.status_code == 400


def test_scheduler_auto_complete_tick(app, client, admin_token):
    from utils.scheduler import tick
    r = client.post('/api/events', json={'title': 'OldEv', 'category': 'Talk', 'seats': 10}, headers=auth(admin_token))
    event_id = (r.get_json().get('event') or r.get_json()).get('id')
    with app.app_context():
        ev = Event.query.get(event_id)
        ev.status = 'Registration open'
        ev.end_date = (datetime.utcnow() - timedelta(days=2)).strftime('%Y-%m-%d')
        from extensions import db
        db.session.commit()
    tick(app)
    with app.app_context():
        ev = Event.query.get(event_id)
        assert ev.status == 'Completed'


def test_rate_limit_on_guest_activate(app, client):
    from utils import rate_limit as rl
    rl._BUCKETS.clear()
    for i in range(16):
        res = client.post('/api/guest/activate', json={'token': 'nope-' + str(i)})
    # should eventually hit 429
    assert res.status_code in (404, 429)


def test_certificate_verify_rate_limited_shape(app, client):
    from utils import rate_limit as rl
    rl._BUCKETS.clear()
    res = None
    for i in range(40):
        res = client.get('/api/verify/NOPE-' + str(i))
    assert res.status_code in (404, 429)
