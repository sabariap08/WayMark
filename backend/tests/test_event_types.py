"""Admin event-type CRUD and config validation for the universal event engine."""
from conftest import delete, get, patch, post
from models import Event, EventType

BASE_CONFIG = {
    'participation': 'team',
    'teamSizeMin': 1,
    'teamSizeMax': 4,
    'fields': [{'key': 'track', 'label': 'Track', 'type': 'text'}],
    'registrationQuestions': [{'key': 'github', 'label': 'GitHub', 'type': 'url'}],
    'workflow': [{'key': 'description', 'label': 'Event brief'},
                 {'key': 'publish', 'label': 'Publish'}],
    'evaluation': {'enabled': True, 'type': 'jury'},
    'certificates': {'enabled': True, 'rules': ['verified_attendance', 'result_rank']},
}


def _create(client, token, name, config=None):
    payload = {'name': name, 'tagline': 'Test tagline', 'cssClass': 'test',
               'config': BASE_CONFIG if config is None else config}
    return post(client, '/api/event-types', payload, token=token)


def _system_type_id(client, token):
    rows = get(client, '/api/event-types', token=token).get_json()
    for row in rows:
        if row.get('isSystem'):
            return row['id']
    raise AssertionError('no system event type found')


def test_create_event_type_persists_config(client, app, db, admin_token):
    res = _create(client, admin_token, 'Robotics Sprint')
    assert res.status_code == 201, res.get_json()
    data = res.get_json()
    assert data['name'] == 'Robotics Sprint'
    assert data['isSystem'] is False
    assert data['config']['teamSizeMax'] == 4
    with app.app_context():
        row = EventType.query.get(data['id'])
        assert row is not None
        assert row.config['participation'] == 'team'
        assert row.config['certificates']['rules'] == ['verified_attendance', 'result_rank']
        assert row.config['workflow'][1]['key'] == 'publish'


def test_create_event_type_without_config_defaults_to_empty_object(client, admin_token):
    res = post(client, '/api/event-types', {'name': 'Bare Type'}, token=admin_token)
    assert res.status_code == 201, res.get_json()
    assert res.get_json()['config'] == {}
    # clean up: other tests assert every stored event type carries a config
    assert delete(client, '/api/event-types/' + res.get_json()['id'],
                  token=admin_token).status_code == 200


def test_duplicate_event_type_name_conflicts(client, admin_token):
    assert _create(client, admin_token, 'Duplicate Type').status_code == 201
    duplicate = _create(client, admin_token, 'Duplicate Type')
    assert duplicate.status_code == 409
    assert 'already exists' in duplicate.get_json()['message']


def test_update_merges_config_by_default_and_replaces_on_flag(client, app, db, admin_token):
    created = _create(client, admin_token, 'Merge Type').get_json()
    merged = patch(client, '/api/event-types/' + created['id'],
                   {'config': {'participation': 'individual'},
                    'tagline': 'Updated tagline'}, token=admin_token)
    assert merged.status_code == 200, merged.get_json()
    body = merged.get_json()
    assert body['tagline'] == 'Updated tagline'
    assert body['config']['participation'] == 'individual'
    assert body['config']['teamSizeMax'] == 4
    assert body['config']['workflow']

    replaced = patch(client, '/api/event-types/' + created['id'],
                     {'config': {'participation': 'team'}, 'replaceConfig': True},
                     token=admin_token)
    assert replaced.status_code == 200, replaced.get_json()
    assert replaced.get_json()['config'] == {'participation': 'team'}
    with app.app_context():
        assert EventType.query.get(created['id']).config == {'participation': 'team'}


def test_invalid_configs_return_400_with_precise_message(client, admin_token):
    cases = [
        ([], 'object'),
        ({'participation': 'group'}, 'participation'),
        ({'teamSizeMin': 6, 'teamSizeMax': 2}, 'teamSizeMin'),
        ({'teamSizeMin': 'two'}, 'teamSizeMin'),
        ({'workflow': [{'label': 'Missing key'}]}, 'key'),
        ({'workflow': [{'key': 'no-label'}]}, 'label'),
        ({'certificates': {'rules': ['submission']}}, 'certificate rule'),
        ({'evaluation': {'type': 'panel'}}, 'evaluation.type'),
        ({'fields': [{'key': 'x', 'label': 'No type'}]}, 'type'),
        ({'registrationQuestions': [{'key': 'x', 'type': 'text'}]}, 'label'),
    ]
    for config, needle in cases:
        res = _create(client, admin_token, 'Invalid Config Type', config=config)
        assert res.status_code == 400, (config, res.get_json())
        assert needle.lower() in res.get_json()['message'].lower(), (config, res.get_json())
    listed = get(client, '/api/event-types', token=admin_token)
    names = [row['name'] for row in listed.get_json()]
    assert 'Invalid Config Type' not in names


def test_event_type_writes_require_admin(client, admin_token, user_token):
    assert post(client, '/api/event-types', {'name': 'Anon Type'}).status_code == 401
    assert post(client, '/api/event-types', {'name': 'User Type'},
                token=user_token).status_code == 403
    created = _create(client, admin_token, 'Admin Only Type').get_json()
    assert patch(client, '/api/event-types/' + created['id'],
                 {'tagline': 'x'}, token=user_token).status_code == 403
    assert delete(client, '/api/event-types/' + created['id'],
                  token=user_token).status_code == 403
    assert delete(client, '/api/event-types/does-not-exist',
                  token=admin_token).status_code == 404


def test_system_event_type_cannot_be_deleted(client, admin_token):
    system_id = _system_type_id(client, admin_token)
    res = delete(client, '/api/event-types/' + system_id, token=admin_token)
    assert res.status_code == 403
    assert 'system' in res.get_json()['message'].lower()


def test_non_system_event_type_can_be_deleted(client, app, db, admin_token):
    created = _create(client, admin_token, 'Deletable Type').get_json()
    with app.app_context():
        assert EventType.query.get(created['id']) is not None
    res = delete(client, '/api/event-types/' + created['id'], token=admin_token)
    assert res.status_code == 200, res.get_json()
    with app.app_context():
        assert EventType.query.get(created['id']) is None


def test_event_type_in_use_cannot_be_deleted(client, app, db, admin_token):
    created = _create(client, admin_token, 'In Use Type').get_json()
    event_res = post(client, '/api/events', {'title': 'Hosted by In Use Type',
                                             'category': 'Hackathon', 'seats': 10},
                     token=admin_token)
    assert event_res.status_code == 201, event_res.get_json()
    event_id = event_res.get_json()['id']
    with app.app_context():
        event = Event.query.get(event_id)
        event.event_type = 'In Use Type'
        db.session.commit()
    blocked = delete(client, '/api/event-types/' + created['id'], token=admin_token)
    assert blocked.status_code == 409
    assert 'in use' in blocked.get_json()['message'].lower()
    with app.app_context():
        event = Event.query.get(event_id)
        event.event_type = ''
        db.session.commit()
    assert delete(client, '/api/event-types/' + created['id'],
                  token=admin_token).status_code == 200


def test_update_rejects_duplicate_rename(client, admin_token):
    first = _create(client, admin_token, 'Rename Source').get_json()
    _create(client, admin_token, 'Rename Target')
    res = patch(client, '/api/event-types/' + first['id'],
                {'name': 'Rename Target'}, token=admin_token)
    assert res.status_code == 409
