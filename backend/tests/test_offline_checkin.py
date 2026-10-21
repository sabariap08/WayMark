"""Tests for offline check-in sync."""
from datetime import datetime, timedelta

from conftest import get, post


def test_online_checkin_still_works(client, admin_token, app):
    ev = post(client, '/api/events', {'title': 'Chk', 'category': 'Hackathon', 'seats': 10, 'date': '2026-11-05'}, token=admin_token).get_json()
    ev_id = ev.get('event') and ev['event'].get('id') or ev.get('id')
    # create a registration
    from models import User, Registration
    with app.app_context():
        user = User.query.filter_by(email='user@baymark.com').first()
        reg = Registration(user_id=user.id, user_name=user.name, user_email=user.email,
                           event_id=ev_id, event_title='Chk', status='Confirmed',
                           ticket_code='TICKET123')
        from extensions import db
        db.session.add(reg)
        db.session.commit()
    res = post(client, '/api/attendance/check-in', {'eventId': ev_id, 'code': 'TICKET123'}, token=admin_token)
    assert res.status_code in (200, 201)


def test_offline_sync_flow(client, admin_token, app):
    ev = post(client, '/api/events', {'title': 'Off', 'category': 'Hackathon', 'seats': 20, 'date': '2026-11-05'}, token=admin_token).get_json()
    ev_id = ev.get('event') and ev['event'].get('id') or ev.get('id')
    from models import User, Registration
    from extensions import db
    with app.app_context():
        user = User.query.filter_by(email='user@baymark.com').first()
        reg = Registration(user_id=user.id, user_name=user.name, user_email=user.email,
                           event_id=ev_id, event_title='Off', status='Confirmed',
                           ticket_code='OFFT1')
        db.session.add(reg)
        db.session.commit()
    # first sync
    res = post(client, '/api/attendance/sync', {'deviceId': 'd1', 'scans': [{'clientScanId': 's1', 'ticketCode': 'OFFT1', 'scannedAt': '2026-11-05T09:00:00', 'eventId': ev_id}]}, token=admin_token)
    assert res.status_code == 200
    data = res.get_json()
    assert data['accepted'] >= 1
    # retry same scan -> duplicate, no second AttendanceLog
    res2 = post(client, '/api/attendance/sync', {'deviceId': 'd1', 'scans': [{'clientScanId': 's1', 'ticketCode': 'OFFT1', 'scannedAt': '2026-11-05T09:00:00', 'eventId': ev_id}]}, token=admin_token)
    assert res2.status_code == 200
    data2 = res2.get_json()
    assert data2['duplicates'] >= 1 or data2['syncStatus']['duplicates'] >= 1
    from models import AttendanceLog
    with app.app_context():
        assert AttendanceLog.query.filter_by(event_id=ev_id).count() == 1
    # invalid ticket
    res3 = post(client, '/api/attendance/sync', {'deviceId': 'd1', 'scans': [{'clientScanId': 's2', 'ticketCode': 'BAD', 'scannedAt': '2026-11-05T09:01:00', 'eventId': ev_id}]}, token=admin_token)
    data3 = res3.get_json()
    assert data3['rejected'] >= 1


def test_offline_sync_conflict(client, admin_token, app):
    ev = post(client, '/api/events', {'title': 'Conf', 'category': 'Hackathon', 'seats': 20, 'date': '2026-11-05'}, token=admin_token).get_json()
    ev_id = ev.get('event') and ev['event'].get('id') or ev.get('id')
    from models import User, Registration
    from extensions import db
    with app.app_context():
        user = User.query.filter_by(email='user@baymark.com').first()
        reg = Registration(user_id=user.id, user_name=user.name, user_email=user.email,
                           event_id=ev_id, event_title='Conf', status='Confirmed',
                           ticket_code='CONFT1')
        db.session.add(reg)
        db.session.commit()
    # check in online first
    post(client, '/api/attendance/check-in', {'eventId': ev_id, 'code': 'CONFT1'}, token=admin_token)
    # now sync from different device
    res = post(client, '/api/attendance/sync', {'deviceId': 'd2', 'scans': [{'clientScanId': 'sc1', 'ticketCode': 'CONFT1', 'scannedAt': '2026-11-05T09:05:00', 'eventId': ev_id}]}, token=admin_token)
    data = res.get_json()
    assert len(data.get('conflicts', [])) >= 1 or data['syncStatus']['conflicts'] >= 1


def _make_registration(app, ev_id, ticket, title='Man'):
    from models import User, Registration
    from extensions import db
    with app.app_context():
        user = User.query.filter_by(email='user@baymark.com').first()
        reg = Registration(user_id=user.id, user_name=user.name, user_email=user.email,
                           event_id=ev_id, event_title=title, status='Confirmed',
                           ticket_code=ticket)
        db.session.add(reg)
        db.session.commit()
        return reg.id


def test_offline_manifest_permissions(client, admin_token, user_token, app):
    ev = post(client, '/api/events', {'title': 'Man', 'category': 'Hackathon', 'seats': 20, 'date': '2026-11-05'}, token=admin_token).get_json()
    ev_id = ev.get('event') and ev['event'].get('id') or ev.get('id')
    reg_id = _make_registration(app, ev_id, 'MANF1')
    url = '/api/attendance/offline-manifest?eventId=' + ev_id

    res = get(client, url, token=admin_token)
    assert res.status_code == 200
    data = res.get_json()
    assert 'items' in data
    assert data['items'] == [{'ticketCode': 'MANF1', 'registrationId': reg_id}]
    for item in data['items']:
        assert set(item.keys()) <= {'ticketCode', 'registrationId'}
    assert 'offlineNote' in data and 'expiresAt' in data
    assert data['title'] == 'Man'
    assert 'email' not in str(data).lower()

    # Non-manager, missing, invalid and expired tokens are rejected.
    assert get(client, url, token=user_token).status_code == 403
    assert get(client, url).status_code == 401
    assert client.get(url, headers={'Authorization': 'Bearer garbage'}).status_code == 401
    import jwt
    expired = jwt.encode(
        {'sub': 'x', 'iat': datetime.utcnow() - timedelta(hours=2),
         'exp': datetime.utcnow() - timedelta(hours=1)},
        app.config['SECRET_KEY'], algorithm='HS256')
    assert client.get(url, headers={'Authorization': 'Bearer ' + expired}).status_code == 401

    # An active volunteer scoped token may read the limited manifest.
    from models import Volunteer
    from extensions import db
    with app.app_context():
        volunteer = Volunteer(event_id=ev_id, event_title='Man', name='Vol One',
                              email='vol@example.com', status='Confirmed',
                              invite_token='vol-token-1')
        db.session.add(volunteer)
        db.session.commit()
    activated = post(client, '/api/guest/activate', {'token': 'vol-token-1'})
    assert activated.status_code == 200
    vtoken = activated.get_json()['token']
    guest = get(client, url, token=vtoken)
    assert guest.status_code == 200
    assert guest.get_json()['items'] == [{'ticketCode': 'MANF1', 'registrationId': reg_id}]

    # A removed volunteer's previously issued token no longer works.
    with app.app_context():
        volunteer = Volunteer.query.filter_by(invite_token='vol-token-1').first()
        volunteer.status = 'Removed'
        db.session.commit()
    assert get(client, url, token=vtoken).status_code == 401


def test_sync_status(client, admin_token, user_token, app):
    ev = post(client, '/api/events', {'title': 'SyncStat', 'category': 'Hackathon', 'seats': 20, 'date': '2026-11-05'}, token=admin_token).get_json()
    ev_id = ev.get('event') and ev['event'].get('id') or ev.get('id')
    _make_registration(app, ev_id, 'SYNCT1', title='SyncStat')

    res = get(client, '/api/attendance/sync-status?eventId=' + ev_id, token=admin_token)
    assert res.status_code == 200
    empty = res.get_json()
    assert empty['accepted'] == 0 and empty['devices'] == []

    post(client, '/api/attendance/sync', {'deviceId': 'dev-1', 'scans': [
        {'clientScanId': 'ss1', 'ticketCode': 'SYNCT1', 'eventId': ev_id},
        {'clientScanId': 'ss2', 'ticketCode': 'NOPE', 'eventId': ev_id},
    ]}, token=admin_token)

    status = get(client, '/api/attendance/sync-status?eventId=' + ev_id,
                 token=admin_token).get_json()
    assert status['accepted'] == 1
    assert status['rejected'] == 1
    assert status['pending'] == 2
    assert status['lastSyncAt']
    assert status['devices'] == [{'deviceId': 'dev-1', 'scans': 2, 'lastSeen': status['lastSyncAt']}]

    assert get(client, '/api/attendance/sync-status?eventId=' + ev_id,
               token=user_token).status_code == 403
    assert get(client, '/api/attendance/sync-status', token=admin_token).status_code == 400
