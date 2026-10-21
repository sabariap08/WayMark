"""Task management: creation validation, dependency enforcement, filters,
volunteer recommendations, assignment guards, and hour tracking."""
from datetime import datetime, timedelta

from conftest import delete, get, patch, post
from models import Resource, ResourceBooking, Session, Task, User, Venue, Volunteer


def test_tasks_require_event_manager(client, app, db, sample_event, admin_token,
                                     user_token):
    url = '/api/events/' + sample_event['id'] + '/tasks'
    assert get(client, url).status_code == 401
    assert get(client, url, token=user_token).status_code == 403
    assert post(client, url, {'title': 'Sneaky'}).status_code == 401
    assert post(client, url, {'title': 'Sneaky'}, token=user_token).status_code == 403
    assert get(client, url, token=admin_token).status_code == 200
    assert get(client, '/api/events/does-not-exist/tasks',
               token=admin_token).status_code == 404


def test_task_create_validation(client, app, db, sample_event, admin_token):
    event_id = sample_event['id']
    url = '/api/events/' + event_id + '/tasks'
    admin_row = User.query.filter_by(email='admin@baymark.com').first()

    assert post(client, url, {'description': 'no title'},
                token=admin_token).status_code == 400
    assert post(client, url, {'title': 'Bad priority', 'priority': 'Urgent'},
                token=admin_token).status_code == 400
    assert post(client, url, {'title': 'Bad due', 'dueAt': 'next tuesday'},
                token=admin_token).status_code == 400
    assert post(client, url, {'title': 'Bad volunteer', 'assigneeId': 'ghost',
                              'assigneeType': 'volunteer'},
                token=admin_token).status_code == 400
    assert post(client, url, {'title': 'Bad user', 'assigneeId': 'ghost-user'},
                token=admin_token).status_code == 400
    assert post(client, url, {'title': 'Bad type', 'assigneeId': admin_row.id,
                              'assigneeType': 'jury'},
                token=admin_token).status_code == 400
    assert post(client, url, {'title': 'Bad session', 'sessionId': 'ghost-session'},
                token=admin_token).status_code == 400

    res = post(client, url, {'title': 'Print badges', 'priority': 'High',
                             'dueAt': '2026-12-01T10:00:00',
                             'assigneeId': admin_row.id, 'description': 'All of them'},
               token=admin_token)
    assert res.status_code == 201
    task = res.get_json()
    assert task['title'] == 'Print badges'
    assert task['priority'] == 'High'
    assert task['assigneeType'] == 'user'
    assert task['assigneeId'] == admin_row.id
    assert task['status'] == 'Open'
    assert task['dependsOn'] == []
    assert task['isOverdue'] is False

    other = post(client, '/api/events', {'title': 'Other Event For Tasks'},
                 token=admin_token).get_json()
    foreign = post(client, '/api/events/' + other['id'] + '/tasks', {'title': 'Foreign task'},
                   token=admin_token).get_json()
    res = post(client, url, {'title': 'Cross event dep', 'dependsOn': [foreign['id']]},
               token=admin_token)
    assert res.status_code == 400


def test_dependency_enforcement_and_cycle_rejection(client, app, db, sample_event,
                                                   admin_token):
    url = '/api/events/' + sample_event['id'] + '/tasks'
    a = post(client, url, {'title': 'Prepare venue'}, token=admin_token).get_json()
    b = post(client, url, {'title': 'Set up stalls', 'dependsOn': [a['id']]},
             token=admin_token).get_json()

    res = patch(client, '/api/tasks/' + b['id'], {'status': 'Done'}, token=admin_token)
    assert res.status_code == 409
    assert 'Prepare venue' in res.get_json()['message']

    res = patch(client, '/api/tasks/' + a['id'], {'status': 'Done'}, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['completedAt']

    res = patch(client, '/api/tasks/' + b['id'], {'status': 'Done'}, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['completedAt']

    c = post(client, url, {'title': 'Cycle C'}, token=admin_token).get_json()
    d = post(client, url, {'title': 'Cycle D'}, token=admin_token).get_json()
    res = patch(client, '/api/tasks/' + d['id'], {'dependsOn': [c['id']]},
                token=admin_token)
    assert res.status_code == 200
    res = patch(client, '/api/tasks/' + c['id'], {'dependsOn': [d['id']]},
                token=admin_token)
    assert res.status_code == 400
    assert res.get_json()['message'] == 'Circular dependency detected'
    res = patch(client, '/api/tasks/' + c['id'], {'dependsOn': [c['id']]},
                token=admin_token)
    assert res.status_code == 400
    assert res.get_json()['message'] == 'Circular dependency detected'


def test_cancel_and_delete_dependency_guards(client, app, db, sample_event, admin_token):
    url = '/api/events/' + sample_event['id'] + '/tasks'
    base = post(client, url, {'title': 'Base task'}, token=admin_token).get_json()
    open_child = post(client, url, {'title': 'Open child', 'dependsOn': [base['id']]},
                      token=admin_token).get_json()
    done_child = post(client, url, {'title': 'Done child', 'dependsOn': [base['id']]},
                      token=admin_token).get_json()

    res = patch(client, '/api/tasks/' + done_child['id'], {'status': 'Done'},
                token=admin_token)
    assert res.status_code == 409

    assert patch(client, '/api/tasks/' + base['id'], {'status': 'Done'},
                 token=admin_token).status_code == 200
    assert patch(client, '/api/tasks/' + done_child['id'], {'status': 'Done'},
                 token=admin_token).status_code == 200

    res = patch(client, '/api/tasks/' + base['id'], {'status': 'Cancelled'},
                token=admin_token)
    assert res.status_code == 409
    assert 'Open child' in res.get_json()['message']

    res = delete(client, '/api/tasks/' + base['id'], token=admin_token)
    assert res.status_code == 409
    assert 'Open child' in res.get_json()['message']

    assert patch(client, '/api/tasks/' + open_child['id'], {'status': 'Cancelled'},
                 token=admin_token).status_code == 200
    assert patch(client, '/api/tasks/' + base['id'], {'status': 'Cancelled'},
                 token=admin_token).status_code == 200


def test_task_filters(client, app, db, sample_event, admin_token):
    event_id = sample_event['id']
    url = '/api/events/' + event_id + '/tasks'
    now = datetime.utcnow()
    admin_row = User.query.filter_by(email='admin@baymark.com').first()

    overdue = post(client, url, {'title': 'Overdue task',
                                 'dueAt': (now - timedelta(days=1)).isoformat()},
                   token=admin_token).get_json()
    future = post(client, url, {'title': 'Future task',
                                'dueAt': (now + timedelta(days=1)).isoformat(),
                                'assigneeId': admin_row.id},
                  token=admin_token).get_json()
    done = post(client, url, {'title': 'Finished task'}, token=admin_token).get_json()
    assert patch(client, '/api/tasks/' + done['id'], {'status': 'Done'},
                 token=admin_token).status_code == 200
    blocked = post(client, url, {'title': 'Blocked task'}, token=admin_token).get_json()
    assert patch(client, '/api/tasks/' + blocked['id'], {'status': 'Blocked'},
                 token=admin_token).status_code == 200

    rows = get(client, url + '?filter=overdue', token=admin_token).get_json()
    assert [t['id'] for t in rows] == [overdue['id']]
    rows = get(client, url + '?filter=completed', token=admin_token).get_json()
    assert [t['id'] for t in rows] == [done['id']]
    rows = get(client, url + '?filter=blocked', token=admin_token).get_json()
    assert [t['id'] for t in rows] == [blocked['id']]
    rows = get(client, url + '?filter=unassigned', token=admin_token).get_json()
    assert {t['id'] for t in rows} == {overdue['id'], blocked['id']}
    rows = get(client, url + '?assigneeId=' + admin_row.id, token=admin_token).get_json()
    assert [t['id'] for t in rows] == [future['id']]
    rows = get(client, url + '?filter=all', token=admin_token).get_json()
    assert len(rows) == 4


def test_dependency_graph_view(client, app, db, sample_event, admin_token):
    event_id = sample_event['id']
    url = '/api/events/' + event_id + '/tasks'
    t1 = post(client, url, {'title': 'Design'}, token=admin_token).get_json()
    t2 = post(client, url, {'title': 'Build', 'dependsOn': [t1['id']]},
              token=admin_token).get_json()
    t3 = post(client, url, {'title': 'Test', 'dependsOn': [t2['id']]},
              token=admin_token).get_json()

    session = Session(event_id=event_id, title='Build session', day='2026-12-05',
                      start_time='10:00', end_time='12:00', status='Published')
    resource = Resource(event_id=event_id, name='Projector One', kind='Projector')
    db.session.add_all([session, resource])
    db.session.flush()
    row2 = Task.query.get(t2['id'])
    row2.session_id = session.id
    row2.resource_id = resource.id
    db.session.commit()

    data = get(client, '/api/events/' + event_id + '/tasks/dependencies',
               token=admin_token).get_json()
    assert len(data['nodes']) == 3
    assert {'from': t1['id'], 'to': t2['id']} in data['edges']
    assert {'from': t2['id'], 'to': t3['id']} in data['edges']
    nodes = {n['id']: n for n in data['nodes']}
    assert nodes[t1['id']]['type'] == 'unassigned'
    assert nodes[t1['id']]['resourceAllocated'] is None
    assert nodes[t2['id']]['sessionTitle'] == 'Build session'
    assert nodes[t2['id']]['resourceTitle'] == 'Projector One'
    assert nodes[t2['id']]['resourceAllocated'] is False

    db.session.add(ResourceBooking(event_id=event_id, session_id=session.id,
                                   resource_id=resource.id, day='2026-12-05',
                                   start_time='10:00', end_time='12:00',
                                   status='Planned'))
    db.session.commit()
    data = get(client, '/api/events/' + event_id + '/tasks/dependencies',
               token=admin_token).get_json()
    nodes = {n['id']: n for n in data['nodes']}
    assert nodes[t2['id']]['resourceAllocated'] is True


def test_recommendations_respect_availability_and_hours(client, app, db, sample_event,
                                                        admin_token):
    event_id = sample_event['id']
    today = datetime.utcnow().strftime('%Y-%m-%d')
    venue = Venue(event_id=event_id, name='Innovation Hall')
    db.session.add(venue)
    db.session.flush()  # venue.id exists only after the flush
    session = Session(event_id=event_id, title='Workshop on testing', day=today,
                      start_time='09:00', end_time='12:00', session_type='Workshop',
                      venue_id=venue.id, status='Published')
    good = Volunteer(event_id=event_id, name='Asha Volunteer', status='Confirmed',
                     skills=['Workshop', 'Python'], venue='Innovation Hall',
                     availability=[{'day': today, 'from': '08:00', 'to': '13:00'}],
                     max_hours=8, assigned_hours=1)
    capped = Volunteer(event_id=event_id, name='Busy Bee', status='Confirmed',
                       skills=['Workshop'],
                       availability=[{'day': today, 'from': '13:00', 'to': '18:00'}],
                       max_hours=2, assigned_hours=1.5)
    db.session.add_all([venue, session, good, capped])
    db.session.commit()

    url = ('/api/events/' + event_id + '/volunteers/recommendations?sessionId='
           + session.id)
    assert get(client, url).status_code == 401
    res = get(client, url, token=admin_token)
    assert res.status_code == 200
    data = res.get_json()
    assert data['estimateHours'] == 3.0
    rows = data['recommendations']
    assert [r['volunteerId'] for r in rows] == [good.id, capped.id]
    assert rows[0]['blockers'] == []
    assert any('Available' in reason for reason in rows[0]['reasons'])
    assert any('Skill match' in reason for reason in rows[0]['reasons'])
    assert any('Venue match' in reason for reason in rows[0]['reasons'])
    assert any('Within hour cap' in reason for reason in rows[0]['reasons'])
    assert any('availability' in blocker.lower() for blocker in rows[1]['blockers'])
    assert any(blocker.startswith('Hour cap exceeded') for blocker in rows[1]['blockers'])
    assert rows[1]['score'] < rows[0]['score']

    assert get(client, '/api/events/' + event_id
               + '/volunteers/recommendations?sessionId=ghost',
               token=admin_token).status_code == 400
    task = post(client, '/api/events/' + event_id + '/tasks',
                {'title': 'Assist the workshop', 'sessionId': session.id},
                token=admin_token).get_json()
    res = get(client, '/api/events/' + event_id
              + '/volunteers/recommendations?taskId=' + task['id'], token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['estimateHours'] == 3.0


def test_assignment_guards_and_completion_counter(client, app, db, sample_event,
                                                  admin_token):
    event_id = sample_event['id']
    today = datetime.utcnow().strftime('%Y-%m-%d')
    target = Session(event_id=event_id, title='Registration desk', day=today,
                     start_time='09:00', end_time='12:00', status='Published')
    overlapping = Session(event_id=event_id, title='Panel discussion', day=today,
                          start_time='10:00', end_time='11:00', status='Published')
    busy = Volunteer(event_id=event_id, name='Busy Volunteer', status='Confirmed',
                     max_hours=4, assigned_hours=3)
    booked = Volunteer(event_id=event_id, name='Booked Volunteer', status='Confirmed')
    free = Volunteer(event_id=event_id, name='Free Volunteer', status='Confirmed')
    db.session.add_all([target, overlapping, busy, booked, free])
    db.session.flush()
    task = Task(event_id=event_id, title='Staff the desk', session_id=target.id)
    clash = Task(event_id=event_id, title='Run the panel', session_id=overlapping.id,
                 assignee_id=booked.id, assignee_type='volunteer', status='In progress')
    db.session.add_all([task, clash])
    db.session.commit()

    url = '/api/tasks/' + task.id + '/assign'
    assert post(client, url, {}).status_code == 401
    assert post(client, url, {'assigneeId': 'ghost'},
                token=admin_token).status_code == 400

    res = post(client, url, {'assigneeId': busy.id, 'assigneeType': 'volunteer'},
               token=admin_token)
    assert res.status_code == 409
    assert 'Hour cap' in res.get_json()['message']

    res = post(client, url, {'assigneeId': booked.id, 'assigneeType': 'volunteer'},
               token=admin_token)
    assert res.status_code == 409
    assert 'Overlapping assignment' in res.get_json()['message']

    res = post(client, url, {'assigneeId': free.id}, token=admin_token)
    assert res.status_code == 200
    data = res.get_json()
    assert data['assigneeId'] == free.id
    assert data['assigneeType'] == 'volunteer'

    res = patch(client, '/api/tasks/' + task.id, {'status': 'Done'}, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['completedAt']
    assert Volunteer.query.get(free.id).completed_tasks == 1

    assert patch(client, '/api/tasks/' + task.id, {'status': 'Done'},
                 token=admin_token).status_code == 200
    assert Volunteer.query.get(free.id).completed_tasks == 1

    assert patch(client, '/api/tasks/' + task.id, {'status': 'In progress'},
                 token=admin_token).status_code == 200
    assert Volunteer.query.get(free.id).completed_tasks == 0


def test_record_volunteer_hours(client, app, db, sample_event, admin_token, user_token):
    event_id = sample_event['id']
    volunteer = Volunteer(event_id=event_id, name='Hours Volunteer', status='Confirmed',
                          max_hours=6, assigned_hours=1)
    db.session.add(volunteer)
    db.session.commit()
    url = '/api/events/' + event_id + '/volunteers/' + volunteer.id + '/hours'

    assert post(client, url, {'hours': 2}).status_code == 401
    assert post(client, url, {'hours': 2}, token=user_token).status_code == 403
    assert post(client, url, {'hours': 0}, token=admin_token).status_code == 400
    assert post(client, url, {'hours': 'lots'}, token=admin_token).status_code == 400
    assert post(client, url, {}, token=admin_token).status_code == 400
    assert post(client, '/api/events/' + event_id + '/volunteers/ghost/hours',
                {'hours': 1}, token=admin_token).status_code == 404

    res = post(client, url, {'hours': 2.5}, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['assignedHours'] == 3.5
    assert Volunteer.query.get(volunteer.id).assigned_hours == 3.5


def test_task_404s(client, app, db, sample_event, admin_token):
    assert patch(client, '/api/tasks/ghost', {'status': 'Done'},
                 token=admin_token).status_code == 404
    assert delete(client, '/api/tasks/ghost', token=admin_token).status_code == 404
    assert post(client, '/api/tasks/ghost/assign', {'assigneeId': 'x'},
                token=admin_token).status_code == 404
    assert get(client, '/api/events/' + sample_event['id']
               + '/volunteers/recommendations?taskId=ghost',
               token=admin_token).status_code == 400
