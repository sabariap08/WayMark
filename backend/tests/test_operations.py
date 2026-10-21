"""Live operations center, incidents, and schedule-change propagation.

Every metric assertion is checked against rows inserted by the test itself."""
from datetime import datetime, timedelta

from conftest import delete, get, patch, post
from models import (AttendanceLog, CheckInException, Incident, Job, Notification,
                    Registration, Resource, ResourceBooking, Score, Session, Submission,
                    Task, User, Volunteer)


def _own_event(client, admin_token, title='Ops Board Event'):
    today = datetime.utcnow().strftime('%Y-%m-%d')
    res = post(client, '/api/events', {'title': title, 'category': 'Hackathon',
                                       'seats': 40, 'date': today}, token=admin_token)
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def test_operations_requires_event_manager(client, app, db, sample_event,
                                           admin_token, user_token):
    url = '/api/events/' + sample_event['id'] + '/operations'
    assert get(client, url).status_code == 401
    assert get(client, url, token=user_token).status_code == 403
    assert get(client, url, token=admin_token).status_code == 200
    assert get(client, '/api/events/does-not-exist/operations',
               token=admin_token).status_code == 404


def test_operations_metrics_equal_inserted_rows(client, app, db, admin_token):
    event = _own_event(client, admin_token)
    event_id = event['id']
    now = datetime.utcnow()
    today = now.strftime('%Y-%m-%d')
    yesterday = (now - timedelta(days=1)).strftime('%Y-%m-%d')
    tomorrow = (now + timedelta(days=1)).strftime('%Y-%m-%d')
    admin_row = User.query.filter_by(email='admin@baymark.com').first()

    regs = []
    for i, (status, attendance) in enumerate([
            ('Confirmed', 'Checked in'), ('Confirmed', 'No-show'),
            ('Waitlisted', 'Registered'), ('Cancelled', 'Registered')], start=1):
        row = Registration(event_id=event_id, user_id='ops-user-' + str(i),
                           user_name='Participant ' + str(i),
                           user_email='ops%d@example.com' % i, event_title=event['title'],
                           status=status, attendance_status=attendance,
                           ticket_code='WM-OPS-%d' % i)
        db.session.add(row)
        regs.append(row)
    db.session.flush()
    db.session.add(AttendanceLog(event_id=event_id, registration_id=regs[0].id,
                                 user_id=regs[0].user_id, participant_name=regs[0].user_name,
                                 participant_email=regs[0].user_email))
    db.session.add(CheckInException(event_id=event_id, participant_name='Unknown pass',
                                    type='Pass not recognised', status='Open'))

    s_now = Session(event_id=event_id, title='Opening keynote', day=today,
                    start_time='00:00', end_time='23:59', status='Published',
                    session_type='Keynote', capacity=50)
    s_next = Session(event_id=event_id, title='Workshop A', day=tomorrow,
                     start_time='09:00', end_time='10:00', status='Published',
                     session_type='Workshop')
    s_late = Session(event_id=event_id, title='Panel', day=yesterday,
                     start_time='10:00', end_time='11:00', status='Draft')
    s_done = Session(event_id=event_id, title='Closing', day=yesterday,
                     start_time='13:00', end_time='14:00', status='Completed')
    db.session.add_all([s_now, s_next, s_late, s_done])

    db.session.add_all([
        Task(event_id=event_id, title='Order badges', status='Open',
             due_at=now - timedelta(days=1)),
        Task(event_id=event_id, title='Fix projector', status='Blocked',
             assignee_id=admin_row.id, assignee_name=admin_row.name, assignee_type='user'),
        Task(event_id=event_id, title='Book caterer', status='Done',
             completed_at=now - timedelta(days=2)),
    ])
    db.session.add_all([
        Incident(event_id=event_id, title='Mic failure', severity='Critical', status='Open'),
        Incident(event_id=event_id, title='Late juror', severity='Medium',
                 status='Investigating'),
        Incident(event_id=event_id, title='Spilled water', severity='Low', status='Resolved',
                 resolved_at=now - timedelta(hours=1)),
    ])
    sub_scored = Submission(event_id=event_id, team_name='Team One', project_title='Alpha')
    sub_pending = Submission(event_id=event_id, team_name='Team Two', project_title='Beta')
    db.session.add_all([sub_scored, sub_pending])
    db.session.flush()
    db.session.add(Score(event_id=event_id, submission_id=sub_scored.id,
                         jury_name='Jury', total=80, max_score=100))
    db.session.add_all([
        Job(event_id=event_id, event_title=event['title'], type='message',
            label='welcome-blast', status='Queued'),
        Job(event_id=event_id, event_title=event['title'], type='message',
            label='reminder-blast', status='Sent', created_at=now - timedelta(hours=2)),
        Job(event_id=event_id, event_title=event['title'], type='message',
            label='digest-blast', status='Failed', created_at=now - timedelta(hours=3)),
    ])
    db.session.add_all([
        Volunteer(event_id=event_id, event_title=event['title'], name='V One',
                  status='Active'),
        Volunteer(event_id=event_id, event_title=event['title'], name='V Two',
                  status='Confirmed'),
        Volunteer(event_id=event_id, event_title=event['title'], name='V Three',
                  status='Invited'),
    ])
    room = Resource(event_id=event_id, name='Hall A', kind='Room', capacity=100)
    db.session.add(room)
    db.session.flush()
    db.session.add(ResourceBooking(event_id=event_id, session_id=s_now.id,
                                   resource_id=room.id, day=today, start_time='00:00',
                                   end_time='23:59', status='Confirmed'))
    db.session.commit()

    res = get(client, '/api/events/' + event_id + '/operations', token=admin_token)
    assert res.status_code == 200
    data = res.get_json()

    assert data['event']['id'] == event_id
    assert data['event']['title'] == event['title']
    assert data['event']['seats'] == 40
    assert data['registrations'] == {'total': 4, 'confirmed': 2, 'waitlisted': 1,
                                     'cancelled': 1, 'verified': 1}
    assert data['attendance']['checkedIn'] == 1
    assert data['attendance']['noShows'] == 1
    assert data['attendance']['exceptions'] == 1
    assert data['attendance']['checkinPercent'] == 25.0
    assert data['attendance']['lastCheckInAt']

    assert data['sessions']['total'] == 4
    assert data['sessions']['published'] == 2
    assert data['sessions']['today'] == 1
    assert data['sessions']['current']['id'] == s_now.id
    assert [s['id'] for s in data['sessions']['upcoming']] == [s_next.id]
    assert [s['id'] for s in data['sessions']['delayed']] == [s_late.id, s_now.id]
    assert data['sessions']['completed'] == 1

    assert len(data['rooms']) == 1
    assert data['rooms'][0]['resourceId'] == room.id
    assert data['rooms'][0]['occupied'] == 50
    assert data['rooms'][0]['percent'] == 50.0
    assert data['rooms'][0]['sessionTitle'] == 'Opening keynote'

    assert data['volunteers'] == {'total': 3, 'active': 1, 'confirmed': 1}
    assert data['tasks'] == {'total': 3, 'open': 2, 'unassigned': 1, 'overdue': 1,
                             'blocked': 1}
    assert data['evaluations'] == {'pending': 1, 'scored': 1}
    assert data['incidents'] == {'open': 2, 'critical': 1, 'investigating': 1}
    assert data['jobs'] == {'queued': 1, 'failed': 1, 'sent': 1}
    assert data['communications'] == {'jobsLast24h': 3, 'failuresLast24h': 1}


def test_operations_without_rows_reports_zeros(client, app, db, admin_token):
    event = _own_event(client, admin_token, title='Empty Ops Event')
    data = get(client, '/api/events/' + event['id'] + '/operations',
               token=admin_token).get_json()
    assert data['registrations']['total'] == 0
    assert data['attendance']['checkedIn'] == 0
    assert data['attendance']['checkinPercent'] == 0.0
    assert data['sessions']['total'] == 0
    assert data['sessions']['current'] is None
    assert data['sessions']['upcoming'] == []
    assert data['sessions']['delayed'] == []
    assert data['rooms'] == []
    assert data['tasks']['total'] == 0
    assert data['incidents']['open'] == 0
    assert data['jobs']['queued'] == 0


def test_incident_authz_validation_and_transitions(client, app, db, sample_event,
                                                   admin_token, user_token):
    event_id = sample_event['id']
    base = '/api/events/' + event_id + '/incidents'

    assert get(client, base).status_code == 401
    assert get(client, base, token=user_token).status_code == 403
    assert post(client, base, {'title': 'x'}).status_code == 401
    assert post(client, base, {'title': 'x'}, token=user_token).status_code == 403
    assert post(client, base, {'severity': 'High'}, token=admin_token).status_code == 400
    assert post(client, base, {'title': 'Bad', 'severity': 'Catastrophic'},
                token=admin_token).status_code == 400

    res = post(client, base, {'title': 'Sound cut out', 'description': 'Main hall mic',
                              'severity': 'high', 'location': 'Main hall',
                              'assigneeId': 'stage-crew-1'}, token=admin_token)
    assert res.status_code == 201
    inc = res.get_json()
    assert inc['status'] == 'Open'
    assert inc['severity'] == 'High'
    assert inc['assigneeId'] == 'stage-crew-1'

    assert patch(client, '/api/incidents/' + inc['id'], {'status': 'Investigating'},
                 token=user_token).status_code == 403
    assert patch(client, '/api/incidents/' + inc['id'], {'status': 'Investigating'}
                 ).status_code == 401

    res = patch(client, '/api/incidents/' + inc['id'], {'status': 'Investigating'},
                token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['status'] == 'Investigating'

    res = patch(client, '/api/incidents/' + inc['id'], {'status': 'Closed'},
                token=admin_token)
    assert res.status_code == 409

    res = patch(client, '/api/incidents/' + inc['id'],
                {'status': 'Resolved', 'resolution': 'Replaced the microphone.'},
                token=admin_token)
    assert res.status_code == 200
    data = res.get_json()
    assert data['status'] == 'Resolved'
    assert data['resolvedAt']
    assert data['resolution'] == 'Replaced the microphone.'

    res = patch(client, '/api/incidents/' + inc['id'], {'status': 'Investigating'},
                token=admin_token)
    assert res.status_code == 409

    assert patch(client, '/api/incidents/' + inc['id'], {'status': 'Closed'},
                 token=admin_token).status_code == 200
    assert patch(client, '/api/incidents/' + inc['id'], {'status': 'Open'},
                 token=admin_token).status_code == 409

    second = post(client, base, {'title': 'Trip hazard', 'severity': 'Low'},
                  token=admin_token).get_json()
    assert patch(client, '/api/incidents/' + second['id'], {'status': 'Closed'},
                 token=admin_token).status_code == 200

    rows = get(client, base + '?status=all', token=admin_token).get_json()
    assert {r['id'] for r in rows} == {inc['id'], second['id']}
    rows = get(client, base + '?status=open', token=admin_token).get_json()
    assert rows == []
    rows = get(client, base + '?status=all&severity=High', token=admin_token).get_json()
    assert [r['id'] for r in rows] == [inc['id']]

    assert delete(client, '/api/incidents/' + inc['id']).status_code == 401
    assert delete(client, '/api/incidents/' + inc['id'],
                  token=user_token).status_code == 403
    assert delete(client, '/api/incidents/' + inc['id'],
                  token=admin_token).status_code == 200
    assert delete(client, '/api/incidents/' + inc['id'],
                  token=admin_token).status_code == 404


def test_critical_incident_notifies_admins_once(client, app, db, sample_event, admin_token):
    event_id = sample_event['id']
    admins = User.query.filter_by(role='admin').all()
    assert admins

    def alerts_for(incident_id):
        return Notification.query.filter(
            Notification.type == 'alert',
            Notification.title == 'Critical incident reported',
            Notification.message.like('%' + incident_id + '%')).count()

    res = post(client, '/api/events/' + event_id + '/incidents',
               {'title': 'Fire alarm triggered', 'severity': 'Critical',
                'location': 'East wing'}, token=admin_token)
    assert res.status_code == 201
    inc = res.get_json()
    assert alerts_for(inc['id']) == len(admins)

    res = patch(client, '/api/incidents/' + inc['id'],
                {'title': 'Fire alarm triggered (East wing)', 'description': 'Edited twice'},
                token=admin_token)
    assert res.status_code == 200
    assert alerts_for(inc['id']) == len(admins)
    res = patch(client, '/api/incidents/' + inc['id'], {'status': 'Investigating'},
                token=admin_token)
    assert res.status_code == 200
    assert alerts_for(inc['id']) == len(admins)

    res = post(client, '/api/events/' + event_id + '/incidents',
               {'title': 'Stage barrier gave way', 'severity': 'critical'},
               token=admin_token)
    assert res.status_code == 201
    inc2 = res.get_json()
    assert alerts_for(inc2['id']) == len(admins)


def test_schedule_change_is_idempotent(client, app, db, sample_event, admin_token,
                                       user_token):
    event_id = sample_event['id']
    admin_id = User.query.filter_by(email='admin@baymark.com').first().id
    user_id = User.query.filter_by(email='user@baymark.com').first().id
    session = Session(event_id=event_id, title='Intro talk', day='2026-12-01',
                      start_time='10:00', end_time='11:00', status='Published')
    db.session.add(session)
    db.session.add_all([
        Registration(event_id=event_id, user_id=admin_id, status='Confirmed',
                     user_email='admin@baymark.com', ticket_code='WM-SCH-1'),
        Registration(event_id=event_id, user_id=user_id, status='Registered',
                     user_email='user@baymark.com', ticket_code='WM-SCH-2'),
        Registration(event_id=event_id, user_id='waitlisted-1', status='Waitlisted',
                     user_email='waiting@example.com', ticket_code='WM-SCH-3'),
    ])
    db.session.commit()

    url = '/api/sessions/' + session.id + '/changes'
    assert post(client, url).status_code == 401
    assert post(client, url, {'day': '2026-12-02'}, token=user_token).status_code == 403
    assert post(client, url, {'day': 'not-a-day'}, token=admin_token).status_code == 400
    assert post(client, url, {'startTime': '25:00'}, token=admin_token).status_code == 400
    assert post(client, url, {'day': '2026-12-02', 'startTime': '16:00',
                              'endTime': '15:00'}, token=admin_token).status_code == 400
    assert post(client, '/api/sessions/does-not-exist/changes', {},
                token=admin_token).status_code == 404

    payload = {'day': '2026-12-02', 'startTime': '14:00', 'endTime': '15:30',
               'notify': True}
    res = post(client, url, payload, token=admin_token)
    assert res.status_code == 200
    data = res.get_json()
    assert data['session']['day'] == '2026-12-02'
    assert data['session']['startTime'] == '14:00'
    assert data['session']['endTime'] == '15:30'
    assert data['notified'] == 2
    label = 'session-change:' + session.id + ':2026-12-02 14:00-15:30'
    assert data['job']['label'] == label
    assert data['job']['status'] == 'Queued'
    assert Job.query.filter_by(event_id=event_id, label=label).count() == 1
    title_prefix = 'Schedule change: Intro talk'
    assert Notification.query.filter(
        Notification.title.like(title_prefix + '%'),
        Notification.user_id.in_([admin_id, user_id])).count() == 2

    res = post(client, url, payload, token=admin_token)
    assert res.status_code == 200
    data2 = res.get_json()
    assert data2['notified'] == 0
    assert data2['job']['id'] == data['job']['id']
    assert Job.query.filter_by(event_id=event_id, label=label).count() == 1
    assert Notification.query.filter(
        Notification.title.like(title_prefix + '%'),
        Notification.user_id.in_([admin_id, user_id])).count() == 2

    res = post(client, url, {'day': '2026-12-03', 'startTime': '09:00',
                             'endTime': '10:00', 'notify': False}, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['notified'] == 0
    assert res.get_json()['job'] is None
    assert Job.query.filter_by(event_id=event_id).count() == 1
