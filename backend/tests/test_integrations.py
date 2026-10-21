"""Tests for integrations module."""
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from conftest import get, post, patch, delete


def test_webhook_create_and_list(client, admin_token, app):
    res = post(client, '/api/webhooks', {'url': 'https://example.com/hook', 'events': ['registration.created']}, token=admin_token)
    assert res.status_code in (200, 201)
    data = res.get_json()
    assert 'secretPlain' in data
    assert data.get('secretSet') is True
    res2 = get(client, '/api/webhooks', token=admin_token)
    assert res2.status_code == 200
    assert isinstance(res2.get_json(), list)


class _CaptureHandler(BaseHTTPRequestHandler):
    captured = {}

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        type(self).captured['body'] = self.rfile.read(length)
        type(self).captured['signature'] = self.headers.get('X-WayMark-Signature', '')
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, *args):
        pass


def test_webhook_signature_and_retry_does_not_duplicate(client, admin_token, app):
    _CaptureHandler.captured = {}
    server = HTTPServer(('127.0.0.1', 0), _CaptureHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        res = post(client, '/api/webhooks', {
            'url': 'http://127.0.0.1:' + str(port) + '/hook',
            'events': ['webhook.test'], 'secret': 'hook-secret',
        }, token=admin_token)
        hook_id = res.get_json()['id']
        tres = post(client, '/api/webhooks/' + hook_id + '/test', token=admin_token)
        assert tres.status_code == 200

        from utils import webhooks
        body = _CaptureHandler.captured.get('body')
        assert body
        expected = 'sha256=' + webhooks.signature('hook-secret', body)
        assert _CaptureHandler.captured.get('signature') == expected

        deliveries = get(client, '/api/webhooks/' + hook_id + '/deliveries', token=admin_token).get_json()
        assert len(deliveries) == 1
        delivery_id = deliveries[0]['id']
        assert deliveries[0]['status'] == 'Delivered'

        rres = post(client, '/api/webhooks/deliveries/' + delivery_id + '/retry', token=admin_token)
        assert rres.status_code == 200
        assert rres.get_json()['id'] == delivery_id

        after = get(client, '/api/webhooks/' + hook_id + '/deliveries', token=admin_token).get_json()
        assert len(after) == 1  # retry never creates a second delivery
        assert after[0]['attempts'] >= 2
    finally:
        server.shutdown()


def _publish(client, admin_token, ev_id, status='Registration open'):
    res = post(client, '/api/events/' + ev_id + '/approve', {'status': status}, token=admin_token)
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def _new_event(client, admin_token, title='Test Event Engine'):
    res = post(client, '/api/events', {'title': title, 'category': 'Hackathon',
                                       'seats': 50, 'date': '2026-11-05'}, token=admin_token)
    assert res.status_code in (200, 201), res.get_json()
    data = res.get_json()
    return (data.get('event') or data)['id']


def test_ics_public_and_me(client, admin_token, user_token, app):
    ev_id = _new_event(client, admin_token, 'ICS Event')
    url = '/api/events/' + ev_id + '/calendar.ics'

    # Draft: anonymous 401, non-manager 403, host/admin 200.
    assert get(client, url).status_code == 401
    assert get(client, url, token=user_token).status_code == 403
    draft = get(client, url, token=admin_token)
    assert draft.status_code == 200
    assert draft.data.startswith(b'BEGIN:VCALENDAR')

    from models import Session
    from extensions import db
    with app.app_context():
        db.session.add_all([
            Session(event_id=ev_id, title='Opening Keynote', day='2026-11-05',
                    start_time='10:00', end_time='11:00', status='Published',
                    room_name='Main Hall'),
            Session(event_id=ev_id, title='Workshop ' + ('x' * 140), day='2026-11-05',
                    start_time='11:30', end_time='13:00', status='Published',
                    room_name='Lab 1'),
            Session(event_id=ev_id, title='Draft session', day='2026-11-05',
                    start_time='14:00', end_time='15:00', status='Draft'),
        ])
        db.session.commit()

    _publish(client, admin_token, ev_id)
    published = get(client, url)
    assert published.status_code == 200
    text = published.data.decode('utf-8')
    assert text.startswith('BEGIN:VCALENDAR')
    assert '\r\n' in text
    assert text.count('BEGIN:VEVENT') == 2  # only published sessions
    assert 'SUMMARY:Opening Keynote' in text
    assert 'DTSTART:20261105T043000Z' in text  # 10:00 IST (+05:30) -> 04:30 UTC
    assert 'Draft session' not in text
    assert 'END:VCALENDAR' in text
    # Every physical line is at most 75 octets (RFC 5545 folding).
    for line in published.data.split(b'\r\n'):
        assert len(line) <= 75

    # /me calendar: one VEVENT per confirmed registration.
    reg = post(client, '/api/registrations', {'eventId': ev_id}, token=user_token)
    assert reg.status_code == 201, reg.get_json()
    mres = get(client, '/api/me/calendar.ics', token=user_token)
    assert mres.status_code == 200
    assert mres.data.startswith(b'BEGIN:VCALENDAR')
    assert mres.data.count(b'BEGIN:VEVENT') >= 1
    assert get(client, '/api/me/calendar.ics').status_code == 401


def test_import_validate_commit(client, admin_token, app):
    ev_id = _new_event(client, admin_token, 'Import Event')
    url = '/api/events/' + ev_id + '/import/registrations'

    csv_data = 'name,email,phone,college\nBad guy,bademail,,\nGood guy,good@example.com,999,Good College\n'
    res = client.post(url, data={'file': (io.BytesIO(csv_data.encode('utf-8')), 'test.csv'),
                                 'mode': 'validate'},
                      headers={'Authorization': 'Bearer ' + admin_token})
    assert res.status_code == 200
    data = res.get_json()
    assert data['mode'] == 'validate'
    assert data['created'] == 0
    assert data['total'] == 2
    assert any(e.get('column') == 'email' for e in data.get('errors', []))

    from models import Registration
    from extensions import db
    with app.app_context():
        assert Registration.query.filter_by(event_id=ev_id).count() == 0

    # JSON rows, validate only, still creates nothing.
    jres = post(client, url, {'rows': [['name', 'email'], ['Carol', 'carol@example.com']],
                              'mode': 'validate'}, token=admin_token)
    assert jres.status_code == 200
    assert jres.get_json()['valid'] == 1
    assert jres.get_json()['created'] == 0

    csv_ok = 'name,email\nAlice,alice@example.com\nBob,bob@example.com\n'
    res2 = client.post(url, data={'file': (io.BytesIO(csv_ok.encode('utf-8')), 'ok.csv'),
                                  'mode': 'commit'},
                       headers={'Authorization': 'Bearer ' + admin_token})
    assert res2.status_code == 200
    data2 = res2.get_json()
    assert data2['created'] == 2
    assert data2['skippedDuplicates'] == 0

    # Same file again -> duplicates skipped, nothing created.
    res3 = client.post(url, data={'file': (io.BytesIO(csv_ok.encode('utf-8')), 'ok.csv'),
                                  'mode': 'commit'},
                       headers={'Authorization': 'Bearer ' + admin_token})
    assert res3.status_code == 200
    data3 = res3.get_json()
    assert data3['created'] == 0
    assert data3['skippedDuplicates'] == 2

    # Duplicate email inside one file -> only the first occurrence is imported.
    csv_dup = 'name,email\nDup One,dup1@example.com\nDup Two,dup1@example.com\n'
    res4 = client.post(url, data={'file': (io.BytesIO(csv_dup.encode('utf-8')), 'dup.csv'),
                                  'mode': 'commit'},
                       headers={'Authorization': 'Bearer ' + admin_token})
    assert res4.status_code == 200
    data4 = res4.get_json()
    assert data4['created'] == 1
    assert data4['skippedDuplicates'] == 1

    with app.app_context():
        emails = sorted(r.user_email for r in Registration.query.filter_by(event_id=ev_id).all())
        assert emails == ['alice@example.com', 'bob@example.com', 'dup1@example.com']


def test_exports(client, admin_token, user_token):
    ev_id = _new_event(client, admin_token, 'Exports Event')
    res = get(client, '/api/events/' + ev_id + '/exports/registrations?format=csv', token=admin_token)
    assert res.status_code == 200
    assert 'text/csv' in res.content_type
    assert b'Ticket' in res.data
    assert 'attachment' in res.headers.get('Content-Disposition', '')

    xres = get(client, '/api/events/' + ev_id + '/exports/registrations?format=xlsx', token=admin_token)
    assert xres.status_code == 200
    assert 'spreadsheetml' in xres.content_type

    for kind in ('schedule', 'tasks', 'budget', 'sponsors'):
        kres = get(client, '/api/events/' + ev_id + '/exports/' + kind + '?format=csv', token=admin_token)
        assert kres.status_code == 200, kind

    assert get(client, '/api/events/' + ev_id + '/exports/registrations?format=csv',
               token=user_token).status_code == 403
    assert get(client, '/api/events/' + ev_id + '/exports/nope?format=csv',
               token=admin_token).status_code == 404


def test_public_api_keys(client, admin_token, user_token):
    res = get(client, '/api/integrations/keys', token=admin_token)
    assert res.status_code == 200
    data = res.get_json()
    assert 'publicApiKey' in data
    key = data['publicApiKey']
    assert key

    assert get(client, '/api/integrations/keys', token=user_token).status_code == 403
    assert get(client, '/api/integrations/keys').status_code == 401

    vres = client.get('/api/v1/events', headers={'X-WayMark-Key': key})
    assert vres.status_code == 200
    events = vres.get_json()
    assert isinstance(events, list)
    for event in events:
        for forbidden in ('contactEmail', 'hostName', 'hostId', 'config', 'settings', 'currency'):
            assert forbidden not in event
        assert 'amount' not in json.dumps(event).lower()

    assert client.get('/api/v1/events', headers={'X-WayMark-Key': 'wrong-key'}).status_code == 401
    assert client.get('/api/v1/events').status_code == 401
    # A user token is accepted too.
    assert get(client, '/api/v1/events', token=user_token).status_code == 200

    res2 = patch(client, '/api/integrations/keys', {'rotate': True}, token=admin_token)
    assert res2.status_code == 200
    new_key = res2.get_json()['publicApiKey']
    assert new_key and new_key != key
    assert client.get('/api/v1/events', headers={'X-WayMark-Key': key}).status_code == 401
    assert client.get('/api/v1/events', headers={'X-WayMark-Key': new_key}).status_code == 200


def test_public_api_detail_and_schedule(client, admin_token):
    ev_id = _new_event(client, admin_token, 'Public API Event')
    _publish(client, admin_token, ev_id)
    key_res = get(client, '/api/integrations/keys', token=admin_token).get_json()
    headers = {'X-WayMark-Key': key_res['publicApiKey']}
    detail = client.get('/api/v1/events/' + ev_id, headers=headers)
    assert detail.status_code == 200
    payload = detail.get_json()
    assert payload['id'] == ev_id
    assert 'contactEmail' not in payload and 'config' not in payload

    sched = client.get('/api/v1/events/' + ev_id + '/schedule', headers=headers)
    assert sched.status_code == 200
    assert sched.get_json()['eventId'] == ev_id
    assert isinstance(sched.get_json()['sessions'], list)
