"""Analytics: per-event metrics, edition compare, NL query allow-list, insights."""
import uuid
from datetime import datetime

from flask import g, has_app_context

from conftest import get as _get
from conftest import post as _post

from models import (AttendanceLog, BudgetCategory, BudgetLine, Event, Feedback,
                    Registration, Score, Session, Sponsor, Submission, Task, User,
                    Volunteer)

METRIC_GROUPS = ('event', 'registrations', 'attendance', 'capacity', 'feedback',
                 'sessions', 'expenses', 'sponsors', 'volunteers', 'competition',
                 'retention')


def _reset_identity():
    """The db fixture keeps one app context open for the whole test and Flask's
    test client reuses it, so `g._wm_user` (the cached current_user) leaks
    between requests. Clear it so each call resolves its own token."""
    if has_app_context() and hasattr(g, '_wm_user'):
        del g._wm_user


def get(client, url, token=None, **kw):
    _reset_identity()
    return _get(client, url, token=token, **kw)


def post(client, url, payload=None, token=None, **kw):
    _reset_identity()
    return _post(client, url, payload, token=token, **kw)


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
    event = Event(title=title or ('Analytics Lab ' + _uid()), host_id=host.id,
                  host_name=host.name, category='Hackathon', date='2026-09-10',
                  seats=50, status='Completed', approval_status='Approved')
    for key, value in kw.items():
        setattr(event, key, value)
    db.session.add(event)
    db.session.commit()
    return event


def _register(db, event, user, registered_at=None, status='Confirmed',
              attendance='Registered'):
    reg = Registration(user_id=user.id, user_name=user.name, user_email=user.email,
                       event_id=event.id, event_title=event.title, status=status,
                       attendance_status=attendance)
    if registered_at:
        reg.registered_at = registered_at
    db.session.add(reg)
    db.session.commit()
    return reg


def _check_in(db, event, reg, session='Morning Workshop'):
    log = AttendanceLog(event_id=event.id, registration_id=reg.id, user_id=reg.user_id,
                        participant_name=reg.user_name, participant_email=reg.user_email,
                        session=session, status='Checked in')
    db.session.add(log)
    db.session.commit()
    return log


def _populated_event(db, admin):
    """5 confirmed (3 checked in), seats 10, feedback 5+4, budget 100k/120k."""
    event = _make_event(db, admin, seats=10)
    day_one = datetime(2026, 9, 1, 9, 0)
    day_two = datetime(2026, 9, 2, 9, 0)
    checked = 0
    for index in range(5):
        user = _make_user(db, 'Participant ' + str(index))
        stamp = day_one if index < 2 else day_two
        attendance = 'Registered'
        if index < 3:
            attendance = 'Checked in'
        reg = _register(db, event, user, registered_at=stamp, attendance=attendance)
        if index < 3:
            _check_in(db, event, reg)
            checked += 1

    for rating, recommend in ((5, True), (4, False)):
        db.session.add(Feedback(event_id=event.id, event_title=event.title,
                                user_name='Reviewer ' + str(rating),
                                overall_rating=rating, content_rating=rating,
                                would_recommend=recommend))

    category = BudgetCategory(event_id=event.id, name='Venue', planned_minor=100000,
                              currency='INR')
    db.session.add(category)
    db.session.commit()
    db.session.add_all([
        BudgetLine(event_id=event.id, category_id=category.id, description='Hall deposit',
                   kind='Expense', amount_minor=60000, currency='INR'),
        BudgetLine(event_id=event.id, category_id=category.id, description='Catering',
                   kind='Expense', amount_minor=60000, currency='INR'),
    ])

    db.session.add_all([
        Session(event_id=event.id, title='Morning Workshop', session_type='Workshop',
                day='2026-09-10', status='Completed'),
        Session(event_id=event.id, title='Evening Talk', session_type='Talk',
                day='2026-09-10', status='Draft'),
    ])
    db.session.add(Sponsor(event_id=event.id, name='Acme', promised_minor=50000,
                           received_minor=25000,
                           deliverables=[{'title': 'Banner', 'done': True},
                                         {'title': 'Booth', 'done': False}]))
    db.session.add(Volunteer(event_id=event.id, event_title=event.title,
                             name='Vera Helper', email='vera+' + _uid() + '@example.com',
                             status='Confirmed', invite_token='vol-' + _uid()))
    db.session.add_all([
        Task(event_id=event.id, title='Print badges', status='Done'),
        Task(event_id=event.id, title='Setup stage', status='Done'),
        Task(event_id=event.id, title='Pack down', status='Open'),
    ])
    db.session.add(Submission(event_id=event.id, team_name='Team One',
                              project_title='Project One'))
    db.session.add(Submission(event_id=event.id, team_name='Team Two',
                              project_title='Project Two'))
    db.session.commit()
    subs = Submission.query.filter_by(event_id=event.id).all()
    db.session.add(Score(event_id=event.id, submission_id=subs[0].id,
                         jury_name='Judge', total=82.0, max_score=100))
    db.session.commit()
    assert checked == 3
    return event


# --------------------------------------------------------------------------- #
# Per-event metrics                                                            #
# --------------------------------------------------------------------------- #

def test_event_analytics_numbers_match_manual_expectations(db, client, app, admin_token):
    admin = _admin(app)
    event = _populated_event(db, admin)

    res = get(client, '/api/analytics/events/' + event.id, token=admin_token)
    assert res.status_code == 200, res.get_json()
    data = res.get_json()

    for group in METRIC_GROUPS:
        assert str(data[group].get('formula') or '').strip(), group + ' is missing a formula'
    assert data['formulas']['attendance.rate'] == 'checkedIn / confirmed * 100'

    assert data['event']['id'] == event.id
    assert data['event']['title'] == event.title

    registrations = data['registrations']
    assert registrations['total'] == 5
    assert registrations['confirmed'] == 5
    assert registrations['waitlisted'] == 0
    assert registrations['cancelled'] == 0
    assert registrations['overTime'] == [
        {'date': '2026-09-01', 'count': 2},
        {'date': '2026-09-02', 'count': 3},
    ]

    attendance = data['attendance']
    assert attendance['checkedIn'] == 3
    assert attendance['noShows'] == 2
    assert attendance['rate'] == 60.0            # 3 / 5 * 100
    assert attendance['formula'] == 'checkedIn / confirmed * 100'

    capacity = data['capacity']
    assert capacity['seats'] == 10
    assert capacity['utilizationPercent'] == 50.0   # 5 / 10 * 100

    feedback = data['feedback']
    assert feedback['responses'] == 2
    assert feedback['averageOverall'] == 4.5        # (5 + 4) / 2
    assert feedback['wouldRecommendPercent'] == 50.0

    sessions = data['sessions']
    assert sessions['total'] == 2
    assert sessions['completed'] == 1
    assert sessions['attendedSessions'] == 1

    expenses = data['expenses']
    assert expenses['plannedMinor'] == 100000
    assert expenses['actualMinor'] == 120000
    assert expenses['variancePercent'] == 20.0      # (120000 - 100000) / 100000 * 100
    assert expenses['currency'] == 'INR'

    sponsors = data['sponsors']
    assert sponsors['count'] == 1
    assert sponsors['promisedMinor'] == 50000
    assert sponsors['receivedMinor'] == 25000
    assert sponsors['deliverableCompletionPercent'] == 50.0

    volunteers = data['volunteers']
    assert volunteers['total'] == 1
    assert volunteers['tasksTotal'] == 3
    assert volunteers['tasksCompleted'] == 2
    assert volunteers['taskCompletionPercent'] == 66.7   # 2 / 3 * 100

    competition = data['competition']
    assert competition['submissions'] == 2
    assert competition['scored'] == 1
    assert competition['participationRatePercent'] == 50.0

    retention = data['retention']
    assert retention['participantsFromPreviousEdition'] is None
    assert retention['percent'] is None
    assert retention['note'] == 'No earlier edition recorded'


def test_event_analytics_retention_finds_earlier_edition(db, client, app, admin_token):
    admin = _admin(app)
    old = _make_event(db, admin, title='Robotics Expo 2025', date='2025-04-01')
    new = _make_event(db, admin, title='Robotics Expo 2026', date='2026-04-01')
    returning = _make_user(db, 'Rita Returner')
    _make_user(db, 'Newbie Person')
    _register(db, old, returning, status='Confirmed')
    _register(db, new, returning, status='Confirmed')

    res = get(client, '/api/analytics/events/' + new.id, token=admin_token)
    assert res.status_code == 200
    retention = res.get_json()['retention']
    assert retention['participantsFromPreviousEdition'] == 1
    assert retention['percent'] == 100.0
    assert retention['previousEventId'] == old.id
    assert retention['formula']


def test_event_analytics_requires_manager(db, client, app, admin_token, user_token):
    admin = _admin(app)
    event = _make_event(db, admin)
    url = '/api/analytics/events/' + event.id
    assert get(client, url).status_code == 401
    assert get(client, url, token=user_token).status_code == 403
    assert get(client, url, token=admin_token).status_code == 200
    assert get(client, '/api/analytics/events/missing-id',
               token=admin_token).status_code == 404


# --------------------------------------------------------------------------- #
# Compare                                                                      #
# --------------------------------------------------------------------------- #

def test_compare_marks_missing_feedback_not_comparable(db, client, app, admin_token, user_token):
    admin = _admin(app)
    with_feedback = _populated_event(db, admin)
    without_feedback = _make_event(db, admin, seats=20)
    _register(db, without_feedback, _make_user(db, 'Solo Attendee'), status='Confirmed')

    url = ('/api/analytics/compare?eventIdA=' + with_feedback.id
           + '&eventIdB=' + without_feedback.id)
    assert get(client, url).status_code == 401, 'anonymous must be 401'
    assert get(client, url, token=user_token).status_code == 403, 'cross-user compare must be 403'

    res = get(client, url, token=admin_token)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body['a']['event']['id'] == with_feedback.id
    assert body['b']['event']['id'] == without_feedback.id

    deltas = {row['metric']: row for row in body['deltas']}
    feedback_delta = deltas['feedback.averageOverall']
    assert feedback_delta['comparable'] is False
    assert feedback_delta['valueB'] is None
    assert 'feedback' in feedback_delta['reason'].lower()
    assert 'edition B' in feedback_delta['reason']

    confirmed = deltas['registrations.confirmed']
    assert confirmed['comparable'] is True
    assert confirmed['valueA'] == 5
    assert confirmed['valueB'] == 1
    assert confirmed['delta'] == -4
    assert confirmed['formula']

    assert get(client, '/api/analytics/compare?eventIdA=' + with_feedback.id,
               token=admin_token).status_code == 400
    assert get(client, '/api/analytics/compare?eventIdA=nope&eventIdB='
               + without_feedback.id, token=admin_token).status_code == 404


# --------------------------------------------------------------------------- #
# Natural-language query                                                       #
# --------------------------------------------------------------------------- #

def test_unknown_question_is_rejected_with_allow_list(db, client, admin_token):
    res = post(client, '/api/analytics/query',
               {'question': 'which team will win the world cup next year?' },
               token=admin_token)
    assert res.status_code == 400, res.get_json()
    body = res.get_json()
    assert body['message']
    supported = body['supported']
    assert isinstance(supported, list) and supported
    assert 'registrations_over_time' in supported
    assert 'no_show_rate' in supported
    assert 'sponsor_deliverables_pending' in supported
    assert 'feedback_averages' in supported

    empty = post(client, '/api/analytics/query', {}, token=admin_token)
    assert empty.status_code == 400
    assert empty.get_json()['supported'] == supported


def test_query_known_intent_returns_computed_metrics(db, client, app, admin_token, user_token):
    admin = _admin(app)
    event = _populated_event(db, admin)

    denied = post(client, '/api/analytics/query',
                  {'question': 'what is the no-show rate?', 'eventId': event.id},
                  token=user_token)
    assert denied.status_code == 403
    assert post(client, '/api/analytics/query',
                {'question': 'what is the no-show rate?', 'eventId': event.id}
                ).status_code == 401

    res = post(client, '/api/analytics/query',
               {'question': 'What was the no-show rate?', 'eventId': event.id},
               token=admin_token)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body['intent'] == 'no_show_rate'
    assert body['metrics']['confirmed'] == 5
    assert body['metrics']['noShows'] == 2
    assert body['metrics']['noShowRate'] == 40.0
    assert body['formulae']['noShowRate'] == 'noShows / confirmed * 100'
    assert '2 of 5' in body['answer']

    feedback = post(client, '/api/analytics/query',
                    {'question': 'How was the feedback?', 'eventId': event.id},
                    token=admin_token)
    assert feedback.status_code == 200
    assert feedback.get_json()['intent'] == 'feedback_averages'
    assert feedback.get_json()['metrics']['averageOverall'] == 4.5

    over_time = post(client, '/api/analytics/query',
                     {'question': 'Show me registrations over time.'},
                     token=admin_token)
    assert over_time.status_code == 200
    body = over_time.get_json()
    assert body['intent'] == 'registrations_over_time'
    assert body['metrics']['total'] >= 5
    assert body['formulae']['byDate']
    assert body['metrics']['byDate'] == sorted(body['metrics']['byDate'],
                                               key=lambda row: row['date'])


# --------------------------------------------------------------------------- #
# Insights                                                                     #
# --------------------------------------------------------------------------- #

def test_insights_are_computed_from_metrics(db, client, app, admin_token, user_token):
    admin = _admin(app)
    event = _populated_event(db, admin)
    empty = _make_event(db, admin, title='Empty Insights ' + _uid())
    url = '/api/ai/insights'

    assert post(client, url, {'eventId': event.id}).status_code == 401
    assert post(client, url, {'eventId': event.id}, token=user_token).status_code == 403
    assert post(client, url, {}, token=admin_token).status_code == 400
    assert post(client, url, {'eventId': 'missing'}, token=admin_token).status_code == 404

    no_data = post(client, url, {'eventId': empty.id}, token=admin_token)
    assert no_data.status_code == 404
    assert no_data.get_json()['message'] == 'No event data to summarise yet.'

    res = post(client, url, {'eventId': event.id}, token=admin_token)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body['source'] == 'computed'
    assert isinstance(body['insight'], str) and body['insight'].strip()
    assert '5 confirmed registration(s)' in body['insight']
    metrics = body['metricsUsed']
    assert metrics['attendance']['checkedIn'] == 3
    assert metrics['expenses']['actualMinor'] == 120000
    for group in METRIC_GROUPS:
        assert str(metrics[group].get('formula') or '').strip(), group
