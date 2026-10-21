"""Achievements: certificate eligibility, batch issuing, sync and profile."""
import uuid

from flask import g, has_app_context

from conftest import get as _get
from conftest import patch as _patch
from conftest import post as _post

from models import (Achievement, AttendanceLog, Certificate, Event, Registration,
                    User, Volunteer)


def _reset_identity():
    """The db fixture holds an app context open for the whole test and Flask's
    test client reuses it, so `g._wm_user` (the cached current_user) would leak
    from one request into the next. Clear it so every call resolves its own
    token - otherwise an anonymous call would make later calls look anonymous."""
    if has_app_context() and hasattr(g, '_wm_user'):
        del g._wm_user


def get(client, url, token=None, **kw):
    _reset_identity()
    return _get(client, url, token=token, **kw)


def post(client, url, payload=None, token=None, **kw):
    _reset_identity()
    return _post(client, url, payload, token=token, **kw)


def patch(client, url, payload=None, token=None, **kw):
    _reset_identity()
    return _patch(client, url, payload, token=token, **kw)


def _uid():
    return uuid.uuid4().hex[:10]


def _admin(app):
    with app.app_context():
        return User.query.filter_by(role='admin').first()


def _make_user(db, name):
    user = User(name=name, email=name.lower().replace(' ', '.') + '+' + _uid()
                + '@example.com', role='user', status='Active')
    db.session.add(user)
    db.session.commit()
    return user


def _make_event(db, host, title=None, **kw):
    event = Event(title=title or ('Cert Lab ' + _uid()), host_id=host.id,
                  host_name=host.name, category='Workshop', date='2026-09-10',
                  seats=50, status='Published', approval_status='Approved')
    for key, value in kw.items():
        setattr(event, key, value)
    db.session.add(event)
    db.session.commit()
    return event


def _register(db, event, user, status='Confirmed', attendance='Registered'):
    reg = Registration(user_id=user.id, user_name=user.name, user_email=user.email,
                       event_id=event.id, event_title=event.title, status=status,
                       attendance_status=attendance)
    db.session.add(reg)
    db.session.commit()
    return reg


def _check_in(db, event, reg, session='Day 1 - Morning'):
    log = AttendanceLog(event_id=event.id, registration_id=reg.id, user_id=reg.user_id,
                        participant_name=reg.user_name, participant_email=reg.user_email,
                        session=session, status='Checked in')
    db.session.add(log)
    db.session.commit()
    return log


# --------------------------------------------------------------------------- #
# Eligibility                                                                  #
# --------------------------------------------------------------------------- #

def test_eligibility_attended_registrant_eligible_unattended_is_missing(db, client, app, admin_token):
    admin = _admin(app)
    event = _make_event(db, admin)
    attender = _make_user(db, 'Ada Attendee')
    absent = _make_user(db, 'Bob Absent')
    reg_a = _register(db, event, attender, attendance='Checked in')
    _register(db, event, absent)
    _check_in(db, event, reg_a)

    res = get(client, '/api/events/' + event.id + '/certificates/eligibility', token=admin_token)
    assert res.status_code == 200, res.get_json()
    rows = res.get_json()
    assert isinstance(rows, list) and len(rows) == 2

    by_user = {row['userId']: row for row in rows}
    eligible = by_user[attender.id]
    assert eligible['eligible'] is True
    assert eligible['missing'] == []
    assert 'verified_attendance' in eligible['reasons']
    assert eligible['rules'] == ['verified_attendance']
    assert eligible['evaluations']['verified_attendance']['passed'] is True

    not_eligible = by_user[absent.id]
    assert not_eligible['eligible'] is False
    assert 'verified_attendance' in not_eligible['missing']
    assert not_eligible['reasons'] == []
    assert not_eligible['evaluations']['verified_attendance']['passed'] is False
    assert not_eligible['evaluations']['verified_attendance']['detail']


def test_eligibility_uses_event_config_rules_and_ignores_unknown_keys(db, client, app, admin_token):
    admin = _admin(app)
    event = _make_event(db, admin,
                        config={'certificates': {'enabled': True,
                                                 'rules': ['verified_attendance', 'submission']}})
    attender = _make_user(db, 'Cara Attendee')
    absent = _make_user(db, 'Dan Absent')
    reg = _register(db, event, attender, attendance='Checked in')
    _register(db, event, absent)
    _check_in(db, event, reg)

    res = get(client, '/api/events/' + event.id + '/certificates/eligibility', token=admin_token)
    assert res.status_code == 200
    rows = {row['userId']: row for row in res.get_json()}
    assert rows[attender.id]['rules'] == ['verified_attendance', 'submission']
    assert rows[attender.id]['eligible'] is True
    # unsupported keys never block a certificate but are reported
    assert rows[attender.id]['evaluations']['submission']['supported'] is False
    assert rows[absent.id]['eligible'] is False
    assert rows[absent.id]['missing'] == ['verified_attendance']


def test_eligibility_requires_manager_and_authentication(db, client, app, admin_token, user_token):
    admin = _admin(app)
    event = _make_event(db, admin)

    assert get(client, '/api/events/' + event.id + '/certificates/eligibility').status_code == 401
    assert get(client, '/api/events/' + event.id + '/certificates/eligibility',
               token=user_token).status_code == 403
    assert get(client, '/api/events/' + event.id + '/certificates/eligibility',
               token=admin_token).status_code == 200
    # a missing event is a 404 for the manager
    assert get(client, '/api/events/nope/certificates/eligibility',
               token=admin_token).status_code == 404


# --------------------------------------------------------------------------- #
# Issuing                                                                      #
# --------------------------------------------------------------------------- #

def test_issue_eligible_creates_certificates_once(db, client, app, admin_token):
    admin = _admin(app)
    event = _make_event(db, admin)
    attender = _make_user(db, 'Eve Attendee')
    absent = _make_user(db, 'Fred Absent')
    reg = _register(db, event, attender, attendance='Checked in')
    _register(db, event, absent)
    _check_in(db, event, reg)

    first = post(client, '/api/events/' + event.id + '/certificates/issue-eligible',
                 {}, token=admin_token)
    assert first.status_code == 200, first.get_json()
    body = first.get_json()
    assert body['issued'] == 1
    assert len(body['certificates']) == 1
    assert body['certificates'][0]['recipientId'] == attender.id
    assert body['certificates'][0]['credentialId'].startswith('WM-CERT-')
    assert body['certificates'][0]['issueDate']
    assert body['certificates'][0]['issuer']
    skipped_users = {row['userId']: row['reason'] for row in body['skipped']}
    assert absent.id in skipped_users
    assert 'verified_attendance' in skipped_users[absent.id]

    second = post(client, '/api/events/' + event.id + '/certificates/issue-eligible',
                  {}, token=admin_token)
    assert second.status_code == 200
    assert second.get_json()['issued'] == 0
    reasons = {row['userId']: row['reason'] for row in second.get_json()['skipped']}
    assert absent.id in reasons and 'verified_attendance' in reasons[absent.id]
    assert attender.id in reasons and 'already issued' in reasons[attender.id]

    with app.app_context():
        certs = Certificate.query.filter_by(event_id=event.id).all()
        assert len(certs) == 1, 're-running must not duplicate certificates'
        achievements = Achievement.query.filter_by(event_id=event.id).all()
        assert len(achievements) == 1
        assert achievements[0].dedupe_key == 'cert:' + certs[0].id
        assert achievements[0].credential_id == certs[0].credential_id
        assert achievements[0].kind == 'Participation'


def test_issue_eligible_requires_manager_and_authentication(db, client, app, user_token):
    admin = _admin(app)
    event = _make_event(db, admin)
    url = '/api/events/' + event.id + '/certificates/issue-eligible'
    assert post(client, url, {}, token=None).status_code == 401
    assert post(client, url, {}, token=user_token).status_code == 403


# --------------------------------------------------------------------------- #
# Sync                                                                         #
# --------------------------------------------------------------------------- #

def test_achievement_sync_is_idempotent(db, client, app, admin_token):
    admin = _admin(app)
    event = _make_event(db, admin)
    one = _make_user(db, 'Grace Participant')
    two = _make_user(db, 'Heidi Participant')
    helper = _make_user(db, 'Ivan Volunteer')
    _register(db, event, one)
    _register(db, event, two)
    db.session.add(Volunteer(event_id=event.id, event_title=event.title,
                             name=helper.name, email=helper.email,
                             responsibility='Registration desk', status='Confirmed',
                             invite_token='vol-' + _uid()))
    db.session.commit()

    url = '/api/events/' + event.id + '/achievements/sync'
    first = post(client, url, {}, token=admin_token)
    assert first.status_code == 200, first.get_json()
    assert first.get_json() == {'created': 3, 'existing': 0}

    second = post(client, url, {}, token=admin_token)
    assert second.status_code == 200
    assert second.get_json()['created'] == 0
    assert second.get_json()['existing'] == 3

    with app.app_context():
        rows = Achievement.query.filter_by(event_id=event.id).all()
        assert len(rows) == 3
        keys = {row.dedupe_key for row in rows}
        assert 'participation:' + event.id + ':' + one.id in keys
        assert 'participation:' + event.id + ':' + two.id in keys
        assert any(key.startswith('volunteer:') for key in keys)
        assert all(row.event_title == event.title for row in rows)
        volunteer_row = [row for row in rows if row.dedupe_key.startswith('volunteer:')][0]
        assert volunteer_row.user_id == helper.id
        assert volunteer_row.kind == 'Volunteer service'


def test_sync_requires_manager_and_authentication(db, client, app, user_token):
    admin = _admin(app)
    event = _make_event(db, admin)
    url = '/api/events/' + event.id + '/achievements/sync'
    assert post(client, url, {}, token=None).status_code == 401
    assert post(client, url, {}, token=user_token).status_code == 403


# --------------------------------------------------------------------------- #
# Profile: /me/achievements, share, summary                                    #
# --------------------------------------------------------------------------- #

def test_share_toggle_is_owner_only(db, client, app, user_token):
    admin = _admin(app)
    demo = User.query.filter_by(email='user@baymark.com').first()
    event = _make_event(db, admin)
    own = Achievement(user_id=demo.id, event_id=event.id, event_title=event.title,
                      kind='Participation', title='Participated', shared=True,
                      dedupe_key='test-share-' + _uid())
    db.session.add(own)
    db.session.commit()

    other_email = 'stranger.' + _uid() + '@example.com'
    signup = post(client, '/api/auth/signup',
                  {'name': 'Stranger', 'email': other_email, 'password': 'secret-pass-1'})
    assert signup.status_code == 201, signup.get_json()
    other_token = signup.get_json()['token']

    assert patch(client, '/api/achievements/' + own.id + '/share',
                 {'shared': False}).status_code == 401, 'anonymous must be 401'
    denied = patch(client, '/api/achievements/' + own.id + '/share',
                   {'shared': False}, token=other_token)
    assert denied.status_code == 403, denied.get_json()

    ok = patch(client, '/api/achievements/' + own.id + '/share',
               {'shared': False}, token=user_token)
    assert ok.status_code == 200, ok.get_json()
    assert ok.get_json()['shared'] is False

    missing = patch(client, '/api/achievements/does-not-exist/share',
                    {'shared': True}, token=user_token)
    assert missing.status_code == 404

    with app.app_context():
        assert Achievement.query.get(own.id).shared is False


def test_me_achievements_default_shared_only_and_summary(db, client, app, user_token):
    admin = _admin(app)
    demo = User.query.filter_by(email='user@baymark.com').first()
    Achievement.query.filter_by(user_id=demo.id).delete()
    db.session.commit()
    other = _make_user(db, 'Mallory Holder')
    event_a = _make_event(db, admin, title='Profile Lab A')
    event_b = _make_event(db, admin, title='Profile Lab B')

    shared = Achievement(user_id=demo.id, event_id=event_a.id, event_title=event_a.title,
                         kind='Participation', title='Shared badge', shared=True,
                         dedupe_key='test-me-' + _uid())
    private = Achievement(user_id=demo.id, event_id=event_b.id, event_title=event_b.title,
                          kind='Volunteer service', title='Private badge', shared=False,
                          dedupe_key='test-me-' + _uid())
    hidden = Achievement(user_id=other.id, event_id=event_a.id, event_title=event_a.title,
                         kind='Award', title='Someone else', shared=True,
                         dedupe_key='test-me-' + _uid())
    db.session.add_all([shared, private, hidden])
    db.session.commit()

    default = get(client, '/api/me/achievements', token=user_token)
    assert default.status_code == 200, default.get_json()
    body = default.get_json()
    ids = [row['id'] for row in body['achievements']]
    assert shared.id in ids
    assert private.id not in ids, 'unshared achievements stay private by default'
    assert hidden.id not in ids, "another user's achievements must never be listed"
    assert body['counts'] == {'Participation': 1}

    everything = get(client, '/api/me/achievements?all=1', token=user_token)
    assert everything.status_code == 200
    all_ids = [row['id'] for row in everything.get_json()['achievements']]
    assert shared.id in all_ids and private.id in all_ids
    assert hidden.id not in all_ids

    summary = get(client, '/api/achievements/summary', token=user_token)
    assert summary.status_code == 200
    data = summary.get_json()
    assert data['total'] == 2
    assert data['shared'] == 1
    assert data['byKind'] == {'Participation': 1, 'Volunteer service': 1}

    assert get(client, '/api/me/achievements').status_code == 401
    assert get(client, '/api/achievements/summary').status_code == 401
