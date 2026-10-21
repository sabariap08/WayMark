"""Scheduling engine: sessions, venues, resources, bookings and conflict rules.

Each test builds its own event so assertions never depend on seeded data."""
from conftest import delete, get, patch, post
from models import Event, Resource, ResourceBooking, ScheduleConflict, Session, Venue

DAY = '2026-11-10'


def _new_event(client, token, title='Schedule Test Event'):
    res = post(client, '/api/events', {'title': title, 'category': 'Hackathon',
                                       'seats': 100, 'date': DAY}, token=token)
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def _venue(client, token, event_id, name='Main Hall'):
    res = post(client, '/api/events/' + event_id + '/venues', {'name': name}, token=token)
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def _resource(client, token, event_id, name='Projector 1', kind='Projector', **extra):
    payload = {'name': name, 'kind': kind}
    payload.update(extra)
    res = post(client, '/api/events/' + event_id + '/resources', payload, token=token)
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def _session(client, token, event_id, **overrides):
    payload = {'title': 'Session', 'day': DAY, 'startTime': '10:00', 'endTime': '11:00'}
    payload.update(overrides)
    res = post(client, '/api/events/' + event_id + '/sessions', payload, token=token)
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def _validate(client, token, event_id):
    res = post(client, '/api/events/' + event_id + '/schedule/validate', {}, token=token)
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def _of_type(conflicts, conflict_type):
    return [c for c in conflicts if c['conflictType'] == conflict_type]


def test_room_overlap_detected_and_fingerprint_idempotent(client, app, db, admin_token):
    event = _new_event(client, admin_token, 'Room Overlap Event')
    venue = _venue(client, admin_token, event['id'])
    first = _session(client, admin_token, event['id'], title='Opening keynote',
                     venueId=venue['id'], startTime='10:00', endTime='11:00')
    second = _session(client, admin_token, event['id'], title='Hands-on workshop',
                      venueId=venue['id'], startTime='10:30', endTime='11:30')

    conflicts = _validate(client, admin_token, event['id'])
    room = _of_type(conflicts, 'Room overlap')
    assert len(room) == 1
    assert set(room[0]['sessionIds']) == {first['id'], second['id']}
    assert room[0]['resourceId'] == venue['id']
    assert room[0]['status'] == 'Open'
    assert room[0]['detail']['timeSuggestions'], 'free time suggestions must be computed'
    assert room[0]['detail']['suggestion']['sessionId'] in (first['id'], second['id'])

    again = _validate(client, admin_token, event['id'])
    assert len(_of_type(again, 'Room overlap')) == 1
    assert len(again) == len(conflicts)

    with app.app_context():
        rows = ScheduleConflict.query.filter_by(event_id=event['id'],
                                                conflict_type='Room overlap').all()
        assert len(rows) == 1
        assert rows[0].fingerprint

    resolved = post(client, '/api/conflicts/' + room[0]['id'] + '/resolve',
                    {'resolution': 'Moved the workshop.'}, token=admin_token)
    assert resolved.status_code == 200, resolved.get_json()
    assert resolved.get_json()['status'] == 'Resolved'
    reopened = _validate(client, admin_token, event['id'])
    assert len(_of_type(reopened, 'Room overlap')) == 1


def test_setup_teardown_buffer_causes_room_overlap(client, admin_token):
    event = _new_event(client, admin_token, 'Buffer Overlap Event')
    venue = _venue(client, admin_token, event['id'])
    first = _session(client, admin_token, event['id'], title='Talk A',
                     venueId=venue['id'], startTime='10:00', endTime='11:00',
                     teardownMinutes=30)
    second = _session(client, admin_token, event['id'], title='Talk B',
                      venueId=venue['id'], startTime='11:15', endTime='12:00',
                      setupMinutes=15)
    conflicts = _validate(client, admin_token, event['id'])
    room = _of_type(conflicts, 'Room overlap')
    assert len(room) == 1
    assert set(room[0]['sessionIds']) == {first['id'], second['id']}


def test_speaker_overlap_is_flagged(client, admin_token):
    event = _new_event(client, admin_token, 'Speaker Overlap Event')
    first = _session(client, admin_token, event['id'], title='Keynote', roomName='Room A',
                     startTime='10:00', endTime='11:00',
                     speakers=[{'name': 'Ada Lovelace', 'email': 'ADA@example.com'}])
    second = _session(client, admin_token, event['id'], title='Panel', roomName='Room B',
                      startTime='10:30', endTime='11:30',
                      speakers=[{'name': 'ada lovelace', 'email': ''}])
    conflicts = _validate(client, admin_token, event['id'])
    speaker = _of_type(conflicts, 'Speaker overlap')
    assert len(speaker) == 1
    assert set(speaker[0]['sessionIds']) == {first['id'], second['id']}
    assert 'Ada Lovelace' in speaker[0]['person']


def test_missing_required_resource_then_booking_clears_it(client, app, db, admin_token):
    event = _new_event(client, admin_token, 'Missing Resource Event')
    projector = _resource(client, admin_token, event['id'], name='Projector 7')
    session = _session(client, admin_token, event['id'], title='Demo session',
                       requiredResourceIds=[projector['id']])
    conflicts = _validate(client, admin_token, event['id'])
    missing = _of_type(conflicts, 'Missing resource')
    assert len(missing) == 1
    assert missing[0]['severity'] == 'Critical'
    assert missing[0]['resourceId'] == projector['id']
    assert missing[0]['sessionIds'] == [session['id']]

    booked = post(client, '/api/sessions/' + session['id'] + '/bookings',
                  {'resourceId': projector['id']}, token=admin_token)
    assert booked.status_code == 201, booked.get_json()
    cleared = _validate(client, admin_token, event['id'])
    assert _of_type(cleared, 'Missing resource') == []
    with app.app_context():
        row = ScheduleConflict.query.get(missing[0]['id'])
        assert row.status == 'Resolved'
        assert row.resolution == 'Auto: condition cleared'


def test_capacity_exceeded_names_both_numbers(client, app, db, admin_token):
    event = _new_event(client, admin_token, 'Capacity Event')
    session = _session(client, admin_token, event['id'], title='Small room talk',
                       capacity=5)
    with app.app_context():
        row = Event.query.get(event['id'])
        row.registered_num = 42
        db.session.commit()
    conflicts = _validate(client, admin_token, event['id'])
    capacity = _of_type(conflicts, 'Capacity exceeded')
    assert len(capacity) == 1
    assert capacity[0]['severity'] == 'Warning'
    assert capacity[0]['sessionIds'] == [session['id']]
    assert '5' in capacity[0]['message']
    assert '42' in capacity[0]['message']


def test_booking_clash_returns_409_naming_conflicting_session(client, admin_token):
    event = _new_event(client, admin_token, 'Booking Clash Event')
    projector = _resource(client, admin_token, event['id'], name='Shared projector')
    first = _session(client, admin_token, event['id'], title='Morning demo',
                     startTime='10:00', endTime='11:00')
    second = _session(client, admin_token, event['id'], title='Late demo',
                      startTime='10:30', endTime='11:30')
    booked = post(client, '/api/sessions/' + first['id'] + '/bookings',
                  {'resourceId': projector['id']}, token=admin_token)
    assert booked.status_code == 201, booked.get_json()
    booking_id = booked.get_json()['id']

    clash = post(client, '/api/sessions/' + second['id'] + '/bookings',
                 {'resourceId': projector['id']}, token=admin_token)
    assert clash.status_code == 409
    assert 'Morning demo' in clash.get_json()['message']

    listed = get(client, '/api/sessions/' + first['id'] + '/bookings', token=admin_token)
    assert listed.status_code == 200
    assert len(listed.get_json()) == 1

    assert delete(client, '/api/bookings/' + booking_id, token=admin_token).status_code == 200
    retry = post(client, '/api/sessions/' + second['id'] + '/bookings',
                 {'resourceId': projector['id']}, token=admin_token)
    assert retry.status_code == 201, retry.get_json()


def test_apply_suggestion_moves_session(client, admin_token):
    event = _new_event(client, admin_token, 'Apply Suggestion Event')
    venue = _venue(client, admin_token, event['id'], name='Studio')
    first = _session(client, admin_token, event['id'], title='Session A',
                     venueId=venue['id'], startTime='10:00', endTime='11:00')
    second = _session(client, admin_token, event['id'], title='Session B',
                      venueId=venue['id'], startTime='10:30', endTime='11:30')
    conflicts = _validate(client, admin_token, event['id'])
    room = _of_type(conflicts, 'Room overlap')[0]
    suggestion = room['detail']['suggestion']
    assert suggestion and suggestion.get('sessionId')
    assert suggestion['day'] == DAY

    applied = post(client, '/api/conflicts/' + room['id'] + '/apply',
                   {'suggestion': suggestion}, token=admin_token)
    assert applied.status_code == 200, applied.get_json()
    data = applied.get_json()
    assert data['ok'] is True
    assert data['session']['id'] == suggestion['sessionId']
    assert data['session']['startTime'] == suggestion['startTime']
    assert data['session']['endTime'] == suggestion['endTime']

    moved = get(client, '/api/sessions/' + suggestion['sessionId'], token=admin_token)
    assert moved.status_code == 200
    assert moved.get_json()['startTime'] == suggestion['startTime']
    assert _of_type(_validate(client, admin_token, event['id']), 'Room overlap') == []


def test_published_session_guard_then_confirm(client, admin_token):
    event = _new_event(client, admin_token, 'Published Guard Event')
    venue = _venue(client, admin_token, event['id'], name='Auditorium')
    _session(client, admin_token, event['id'], title='Published talk',
             venueId=venue['id'], startTime='10:00', endTime='11:00')
    second = _session(client, admin_token, event['id'], title='Draft talk',
                      venueId=venue['id'], startTime='10:30', endTime='11:30')
    published = patch(client, '/api/sessions/' + second['id'],
                      {'status': 'Published'}, token=admin_token)
    assert published.status_code == 200, published.get_json()

    conflicts = _validate(client, admin_token, event['id'])
    room = _of_type(conflicts, 'Room overlap')[0]
    suggestion = {'sessionId': second['id'], 'day': DAY,
                  'startTime': '11:30', 'endTime': '12:30'}
    blocked = post(client, '/api/conflicts/' + room['id'] + '/apply',
                   {'suggestion': suggestion}, token=admin_token)
    assert blocked.status_code == 409
    assert 'confirmPublished' in blocked.get_json()['message']

    confirmed = post(client, '/api/conflicts/' + room['id'] + '/apply',
                     {'suggestion': suggestion, 'confirmPublished': True},
                     token=admin_token)
    assert confirmed.status_code == 200, confirmed.get_json()
    moved = get(client, '/api/sessions/' + second['id'], token=admin_token)
    assert moved.get_json()['startTime'] == '11:30'


def test_manager_only_writes_and_anonymous_401(client, sample_event,
                                               admin_token, user_token):
    event_id = sample_event['id']
    assert post(client, '/api/events/' + event_id + '/sessions',
                {'title': 'Anon'}).status_code == 401
    assert post(client, '/api/events/' + event_id + '/sessions',
                {'title': 'User', 'day': DAY, 'startTime': '09:00', 'endTime': '10:00'},
                token=user_token).status_code == 403
    assert post(client, '/api/events/' + event_id + '/venues',
                {'name': 'Nope'}, token=user_token).status_code == 403
    assert post(client, '/api/events/' + event_id + '/resources',
                {'name': 'Nope', 'kind': 'Projector'}, token=user_token).status_code == 403
    assert post(client, '/api/events/' + event_id + '/schedule/validate',
                {}, token=user_token).status_code == 403
    assert get(client, '/api/events/' + event_id + '/conflicts',
               token=user_token).status_code == 403
    assert get(client, '/api/events/' + event_id + '/sessions').status_code == 401

    created = post(client, '/api/events/' + event_id + '/sessions',
                   {'title': 'Admin session', 'day': DAY,
                    'startTime': '09:00', 'endTime': '10:00'}, token=admin_token)
    assert created.status_code == 201
    assert get(client, '/api/events/' + event_id + '/schedule',
               token=admin_token).status_code == 200


def test_reads_hide_unpublished_sessions_from_non_managers(client, admin_token, user_token):
    event = _new_event(client, admin_token, 'Visibility Event')
    draft = _session(client, admin_token, event['id'], title='Draft agenda item')
    live = _session(client, admin_token, event['id'], title='Published agenda item',
                    startTime='12:00', endTime='13:00', status='Published')
    assert patch(client, '/api/sessions/' + draft['id'],
                 {'status': 'Draft'}, token=admin_token).status_code == 200

    as_manager = get(client, '/api/events/' + event['id'] + '/sessions', token=admin_token)
    assert {s['id'] for s in as_manager.get_json()} == {draft['id'], live['id']}
    as_user = get(client, '/api/events/' + event['id'] + '/sessions', token=user_token)
    assert [s['id'] for s in as_user.get_json()] == [live['id']]
    assert get(client, '/api/sessions/' + draft['id'], token=user_token).status_code == 404
    assert get(client, '/api/sessions/' + live['id'], token=user_token).status_code == 200
    schedule = get(client, '/api/events/' + event['id'] + '/schedule', token=user_token)
    assert [s['id'] for s in schedule.get_json()['sessions']] == [live['id']]
    assert schedule.get_json()['bookings'] == []


def test_session_payload_validation(client, admin_token):
    event = _new_event(client, admin_token, 'Validation Event')
    other = _new_event(client, admin_token, 'Other Event')
    foreign_venue = _venue(client, admin_token, other['id'], name='Foreign venue')
    foreign_resource = _resource(client, admin_token, other['id'], name='Foreign kit')

    assert post(client, '/api/events/' + event['id'] + '/sessions',
                {'day': DAY, 'startTime': '10:00', 'endTime': '11:00'},
                token=admin_token).status_code == 400
    assert post(client, '/api/events/' + event['id'] + '/sessions',
                {'title': 'Bad day', 'day': '10-11-2026',
                 'startTime': '10:00', 'endTime': '11:00'},
                token=admin_token).status_code == 400
    assert post(client, '/api/events/' + event['id'] + '/sessions',
                {'title': 'Bad order', 'day': DAY,
                 'startTime': '11:00', 'endTime': '11:00'},
                token=admin_token).status_code == 400
    assert post(client, '/api/events/' + event['id'] + '/sessions',
                {'title': 'Foreign venue', 'day': DAY, 'startTime': '10:00',
                 'endTime': '11:00', 'venueId': foreign_venue['id']},
                token=admin_token).status_code == 400
    assert post(client, '/api/events/' + event['id'] + '/sessions',
                {'title': 'Foreign resource', 'day': DAY, 'startTime': '10:00',
                 'endTime': '11:00', 'requiredResourceIds': [foreign_resource['id']]},
                token=admin_token).status_code == 400

    good = _session(client, admin_token, event['id'], title='Valid session')
    assert patch(client, '/api/sessions/' + good['id'],
                 {'endTime': '09:00'}, token=admin_token).status_code == 400
    assert patch(client, '/api/sessions/' + good['id'],
                 {'title': ''}, token=admin_token).status_code == 400
    assert delete(client, '/api/sessions/' + good['id'], token=admin_token).status_code == 200


def test_schedule_bundle_contains_all_collections(client, admin_token):
    event = _new_event(client, admin_token, 'Schedule Bundle Event')
    venue = _venue(client, admin_token, event['id'], name='Bundle Hall')
    resource = _resource(client, admin_token, event['id'], name='Bundle mic',
                         kind='Audio system')
    session = _session(client, admin_token, event['id'], title='Bundle session',
                       venueId=venue['id'])
    booked = post(client, '/api/sessions/' + session['id'] + '/bookings',
                  {'resourceId': resource['id']}, token=admin_token)
    assert booked.status_code == 201
    data = get(client, '/api/events/' + event['id'] + '/schedule', token=admin_token).get_json()
    assert data['days'] == [DAY]
    assert len(data['sessions']) == 1
    assert len(data['venues']) == 1
    assert len(data['resources']) == 1
    assert len(data['bookings']) == 1
    with_vendor = get(client, '/api/events/' + event['id'] + '/venues', token=admin_token)
    assert with_vendor.get_json()[0]['name'] == 'Bundle Hall'
