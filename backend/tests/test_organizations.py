"""Tests for organizations."""
from conftest import get, post, patch, delete


def _create_event(client, admin_token, title):
    ev = post(client, '/api/events', {'title': title, 'category': 'Hackathon',
                                      'seats': 10, 'date': '2026-11-05'},
              token=admin_token).get_json()
    return ev.get('event') and ev['event'].get('id') or ev.get('id')


def test_create_org_and_members(client, admin_token, user_token):
    res = post(client, '/api/organizations', {'name': 'Test Org'}, token=admin_token)
    assert res.status_code in (200, 201)
    org_id = res.get_json()['id']

    # Unknown user -> 409; bad role/permission -> 400.
    assert post(client, '/api/organizations/' + org_id + '/members',
                {'email': 'ghost@example.com'}, token=admin_token).status_code == 409
    assert post(client, '/api/organizations/' + org_id + '/members',
                {'email': 'user@baymark.com', 'orgRole': 'Boss'},
                token=admin_token).status_code == 400
    assert post(client, '/api/organizations/' + org_id + '/members',
                {'email': 'user@baymark.com', 'permissions': ['root']},
                token=admin_token).status_code == 400

    res2 = post(client, '/api/organizations/' + org_id + '/members',
                {'email': 'user@baymark.com', 'orgRole': 'Member',
                 'permissions': ['events', 'reports']}, token=admin_token)
    assert res2.status_code in (200, 201)
    member = res2.get_json()
    assert member['orgRole'] == 'Member'
    assert set(member['permissions']) == {'events', 'reports'}

    # Duplicate membership -> 409.
    assert post(client, '/api/organizations/' + org_id + '/members',
                {'email': 'user@baymark.com'}, token=admin_token).status_code == 409

    res3 = get(client, '/api/organizations/' + org_id + '/members', token=admin_token)
    assert res3.status_code == 200
    members = res3.get_json()
    assert any(m['email'] == 'user@baymark.com' for m in members)
    assert any(m['orgRole'] == 'Owner' for m in members)

    up = patch(client, '/api/organizations/members/' + member['id'],
               {'orgRole': 'Manager'}, token=admin_token)
    assert up.status_code == 200
    assert up.get_json()['orgRole'] == 'Manager'


def test_cannot_remove_last_owner(client, admin_token):
    org = post(client, '/api/organizations', {'name': 'Owner Org'}, token=admin_token).get_json()
    members = get(client, '/api/organizations/' + org['id'] + '/members',
                  token=admin_token).get_json()
    owner = [m for m in members if m['orgRole'] == 'Owner'][0]
    res = delete(client, '/api/organizations/members/' + owner['id'], token=admin_token)
    assert res.status_code == 409

    # A non-owner member can be removed.
    post(client, '/api/organizations/' + org['id'] + '/members',
         {'email': 'user@baymark.com', 'orgRole': 'Member'}, token=admin_token)
    user_member = [m for m in get(client, '/api/organizations/' + org['id'] + '/members',
                                 token=admin_token).get_json() if m['orgRole'] == 'Member'][0]
    assert delete(client, '/api/organizations/members/' + user_member['id'],
                  token=admin_token).status_code == 200


def test_org_isolation_non_member(client, admin_token, user_token):
    private = post(client, '/api/organizations', {'name': 'Private Org'}, token=admin_token).get_json()
    mine = post(client, '/api/organizations', {'name': 'User Org'}, token=user_token).get_json()
    private_id = private['id']

    # Even after swapping the org id in the URL, a non-member gets 403/404.
    assert get(client, '/api/organizations/' + private_id, token=user_token).status_code in (403, 404)
    assert get(client, '/api/organizations/' + private_id + '/members',
               token=user_token).status_code in (403, 404)
    assert get(client, '/api/organizations/' + private_id + '/events',
               token=user_token).status_code in (403, 404)
    assert patch(client, '/api/organizations/' + private_id, {'name': 'Hijacked'},
                 token=user_token).status_code in (403, 404)
    assert delete(client, '/api/organizations/' + private_id, token=user_token).status_code in (403, 404)

    # The user's own organization remains accessible.
    assert get(client, '/api/organizations/' + mine['id'] + '/members',
               token=user_token).status_code == 200


def test_org_events_isolation(client, admin_token, user_token):
    o1 = post(client, '/api/organizations', {'name': 'Org1'}, token=admin_token).get_json()['id']
    o2 = post(client, '/api/organizations', {'name': 'Org2'}, token=admin_token).get_json()['id']
    e1 = _create_event(client, admin_token, 'E1')
    e2 = _create_event(client, admin_token, 'E2')
    assert post(client, '/api/events/' + e1 + '/organization', {'orgId': o1},
                token=admin_token).status_code == 200
    assert post(client, '/api/events/' + e2 + '/organization', {'orgId': o2},
                token=admin_token).status_code == 200

    # Member of org2 only cannot see org1 events.
    post(client, '/api/organizations/' + o2 + '/members',
         {'email': 'user@baymark.com', 'orgRole': 'Member', 'permissions': ['events']},
         token=admin_token)
    assert get(client, '/api/organizations/' + o1 + '/events',
               token=user_token).status_code in (403, 404)

    # Member of org1 sees only org1's events.
    post(client, '/api/organizations/' + o1 + '/members',
         {'email': 'user@baymark.com', 'orgRole': 'Member', 'permissions': ['events']},
         token=admin_token)
    res2 = get(client, '/api/organizations/' + o1 + '/events', token=user_token)
    assert res2.status_code == 200
    ids = [e['id'] for e in res2.get_json()]
    assert e1 in ids
    assert e2 not in ids

    # Member without the events permission is denied.
    o3 = post(client, '/api/organizations', {'name': 'Org3'}, token=admin_token).get_json()['id']
    post(client, '/api/organizations/' + o3 + '/members',
         {'email': 'user@baymark.com', 'orgRole': 'Member'}, token=admin_token)
    assert get(client, '/api/organizations/' + o3 + '/events', token=user_token).status_code == 403

    # Detaching an event removes it from the org list.
    assert post(client, '/api/events/' + e1 + '/organization', {'orgId': ''},
                token=admin_token).status_code == 200
    ids_after = [e['id'] for e in get(client, '/api/organizations/' + o1 + '/events',
                                      token=user_token).get_json()]
    assert e1 not in ids_after

    # Unknown org -> 404.
    assert post(client, '/api/events/' + e2 + '/organization', {'orgId': 'does-not-exist'},
                token=admin_token).status_code == 404
