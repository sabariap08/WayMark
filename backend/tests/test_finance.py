"""Finance module tests: budget categories, lines, summary, scenarios, sponsors.

Money assertions are exact integer minor-unit arithmetic (never float sums),
every route is checked for manager-only authorization, and estimate/ROI
honesty rules are asserted verbatim.
"""
import pytest

from conftest import delete, get, patch, post

ROI_NOTE = 'Not calculated: WayMark has no defined outcome formula or conversion data.'
ESTIMATE_NOTE = 'Estimate based on configured assumptions — not actual financial data.'


def _call(client, method, url, token=None, payload=None):
    headers = {'Authorization': 'Bearer ' + token} if token else {}
    name = method.lower()
    fn = getattr(client, name)
    if name in ('get', 'delete'):
        return fn(url, headers=headers)
    return fn(url, json=payload if payload is not None else {}, headers=headers)


def _line(event_id, admin_token, client, **extra):
    payload = {'description': 'Ops cost', 'amount': '10.01', 'kind': 'Expense'}
    payload.update(extra)
    return post(client, '/api/events/%s/budget/lines' % event_id, payload,
                token=admin_token)


EVENT_ROUTES = [
    ('GET', '/api/events/{event_id}/budget/categories'),
    ('POST', '/api/events/{event_id}/budget/categories'),
    ('GET', '/api/events/{event_id}/budget/lines'),
    ('POST', '/api/events/{event_id}/budget/lines'),
    ('GET', '/api/events/{event_id}/budget/summary'),
    ('POST', '/api/events/{event_id}/budget/scenarios'),
    ('GET', '/api/events/{event_id}/budget/scenarios'),
    ('GET', '/api/events/{event_id}/sponsors'),
    ('POST', '/api/events/{event_id}/sponsors'),
    ('GET', '/api/events/{event_id}/sponsor-report'),
]

ENTITY_ROUTES = [
    ('PATCH', '/api/budget/categories/{category_id}'),
    ('PUT', '/api/budget/categories/{category_id}'),
    ('DELETE', '/api/budget/categories/{category_id}'),
    ('PATCH', '/api/budget/lines/{line_id}'),
    ('PUT', '/api/budget/lines/{line_id}'),
    ('DELETE', '/api/budget/lines/{line_id}'),
    ('PATCH', '/api/sponsors/{sponsor_id}'),
    ('PUT', '/api/sponsors/{sponsor_id}'),
    ('PUT', '/api/sponsors/{sponsor_id}/deliverables'),
    ('DELETE', '/api/sponsors/{sponsor_id}'),
]


@pytest.fixture()
def finance_ids(client, admin_token, sample_event):
    event_id = sample_event['id']
    cat = post(client, '/api/events/%s/budget/categories' % event_id,
               {'name': 'Venue', 'planned': '100.00'}, token=admin_token)
    assert cat.status_code == 201, cat.get_json()
    line = post(client, '/api/events/%s/budget/lines' % event_id,
                {'categoryId': cat.get_json()['id'], 'description': 'Hall rent',
                 'amount': '10.01', 'kind': 'Expense', 'date': '2026-11-05'},
                token=admin_token)
    assert line.status_code == 201, line.get_json()
    sponsor = post(client, '/api/events/%s/sponsors' % event_id,
                   {'name': 'Acme Corp', 'package': 'Gold', 'promised': '5000.00',
                    'status': 'Pledged'}, token=admin_token)
    assert sponsor.status_code == 201, sponsor.get_json()
    return {'event_id': event_id,
            'category_id': cat.get_json()['id'],
            'line_id': line.get_json()['id'],
            'sponsor_id': sponsor.get_json()['id']}


def test_finance_blueprint_is_registered(app):
    missing = [m.split(':')[0] for m in app.extensions.get('wm_missing_blueprints', [])]
    assert 'finance' not in missing, missing


# --------------------------------------------------------------------------- #
# Authorization: money is never exposed to participants or anonymous callers   #
# --------------------------------------------------------------------------- #

def test_normal_user_is_forbidden_on_every_finance_route(client, user_token, finance_ids):
    payload = {'name': 'Nope', 'planned': '1.00', 'description': 'Nope',
               'amount': '1.00', 'scenarios': [], 'deliverables': [],
               'promised': '1.00'}
    for method, template in EVENT_ROUTES + ENTITY_ROUTES:
        url = template.format(**finance_ids)
        res = _call(client, method, url, token=user_token, payload=payload)
        assert res.status_code == 403, (method, url, res.status_code, res.get_json())
        assert 'message' in res.get_json()


def test_anonymous_is_unauthenticated_on_every_finance_route(client, finance_ids):
    payload = {'name': 'Nope', 'planned': '1.00', 'description': 'Nope',
               'amount': '1.00', 'scenarios': [], 'deliverables': [],
               'promised': '1.00'}
    for method, template in EVENT_ROUTES + ENTITY_ROUTES:
        url = template.format(**finance_ids)
        res = _call(client, method, url, token=None, payload=payload)
        assert res.status_code == 401, (method, url, res.status_code, res.get_json())


def test_event_host_can_manage_finance(client, admin_token, user_token, sample_event, db):
    from models import Event, User
    user = User.query.filter_by(email='user@baymark.com').first()
    assert user is not None
    event = Event.query.get(sample_event['id'])
    event.host_id = user.id
    db.session.commit()
    res = get(client, '/api/events/%s/budget/summary' % sample_event['id'],
              token=user_token)
    assert res.status_code == 200
    res = post(client, '/api/events/%s/budget/categories' % sample_event['id'],
               {'name': 'Host made', 'planned': '10.00'}, token=user_token)
    assert res.status_code == 201, res.get_json()


# --------------------------------------------------------------------------- #
# Categories                                                                   #
# --------------------------------------------------------------------------- #

def test_category_stores_planned_as_integer_minor_units(client, admin_token, sample_event, db):
    from models import BudgetCategory
    res = post(client, '/api/events/%s/budget/categories' % sample_event['id'],
               {'name': 'Venue', 'planned': '1234.56'}, token=admin_token)
    assert res.status_code == 201, res.get_json()
    data = res.get_json()
    assert data['plannedMinor'] == 123456
    assert data['planned'] == 1234.56
    assert data['plannedFormatted'] == '₹1,234.56'
    assert type(data['plannedMinor']) is int
    row = BudgetCategory.query.get(data['id'])
    assert type(row.planned_minor) is int
    assert row.planned_minor == 123456
    assert row.currency == 'INR'


def test_category_duplicate_name_conflicts(client, admin_token, sample_event):
    url = '/api/events/%s/budget/categories' % sample_event['id']
    assert post(client, url, {'name': 'Catering', 'planned': '10'}, token=admin_token).status_code == 201
    res = post(client, url, {'name': 'catering', 'planned': '20'}, token=admin_token)
    assert res.status_code == 409
    assert 'message' in res.get_json()


def test_category_validation(client, admin_token, sample_event):
    url = '/api/events/%s/budget/categories' % sample_event['id']
    assert post(client, url, {'planned': '10'}, token=admin_token).status_code == 400
    res = post(client, url, {'name': 'Bad', 'planned': '-5.00'}, token=admin_token)
    assert res.status_code == 400
    assert 'negative' in res.get_json()['message'].lower()


def test_category_patch_and_delete_with_lines(client, admin_token, sample_event):
    event_id = sample_event['id']
    cat = post(client, '/api/events/%s/budget/categories' % event_id,
               {'name': 'Production', 'planned': '200.00'}, token=admin_token)
    assert cat.status_code == 201
    cat_id = cat.get_json()['id']

    res = patch(client, '/api/budget/categories/%s' % cat_id,
                {'planned': '250.50', 'sortOrder': 4}, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['plannedMinor'] == 25050
    assert res.get_json()['sortOrder'] == 4

    res = patch(client, '/api/budget/categories/%s' % cat_id,
                {'name': ''}, token=admin_token)
    assert res.status_code == 400

    line = _line(event_id, admin_token, client, categoryId=cat_id, amount='5.00')
    assert line.status_code == 201

    res = delete(client, '/api/budget/categories/%s' % cat_id, token=admin_token)
    assert res.status_code == 409
    assert 'budget lines' in res.get_json()['message']

    assert delete(client, '/api/budget/lines/%s' % line.get_json()['id'],
                  token=admin_token).status_code == 200
    res = delete(client, '/api/budget/categories/%s' % cat_id, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['ok'] is True


def test_currency_mismatch_is_rejected(client, admin_token, sample_event):
    event_id = sample_event['id']
    res = post(client, '/api/events/%s/budget/categories' % event_id,
               {'name': 'Dollars', 'planned': '100', 'currency': 'USD'},
               token=admin_token)
    assert res.status_code == 400
    assert res.get_json()['message'] == 'All budget lines must use INR'

    res = _line(event_id, admin_token, client, currency='USD')
    assert res.status_code == 400
    assert res.get_json()['message'] == 'All budget lines must use INR'

    ok = post(client, '/api/events/%s/budget/categories' % event_id,
              {'name': 'Rupees', 'planned': '100', 'currency': 'INR'},
              token=admin_token)
    assert ok.status_code == 201


# --------------------------------------------------------------------------- #
# Lines + exact arithmetic                                                     #
# --------------------------------------------------------------------------- #

def test_summary_exact_arithmetic_and_utilisation(client, admin_token, sample_event, db):
    from models import BudgetLine
    event_id = sample_event['id']
    cat = post(client, '/api/events/%s/budget/categories' % event_id,
               {'name': 'Ops', 'planned': '100.00'}, token=admin_token)
    assert cat.status_code == 201
    cat_id = cat.get_json()['id']
    for amount in ('10.01', '20.02', '5.00'):
        res = _line(event_id, admin_token, client, categoryId=cat_id, amount=amount)
        assert res.status_code == 201, res.get_json()

    rows = BudgetLine.query.filter_by(event_id=event_id).all()
    assert [r.amount_minor for r in rows] == [1001, 2002, 500]
    assert all(type(r.amount_minor) is int for r in rows)

    res = get(client, '/api/events/%s/budget/summary' % event_id, token=admin_token)
    assert res.status_code == 200
    data = res.get_json()
    assert data['currency'] == 'INR'
    assert data['plannedTotal']['minor'] == 10000
    assert data['plannedTotal']['formatted'] == '₹100.00'
    assert data['actualTotal']['minor'] == 1001 + 2002 + 500
    assert data['actualTotal']['minor'] == 3503
    assert data['remaining']['minor'] == 6497
    assert data['variance']['minor'] == -6497
    assert data['varianceMinor'] == -6497
    assert data['utilisationPercent'] == 35.0
    assert data['variancePercent'] == -65.0
    assert data['byCategory'][0]['name'] == 'Ops'
    assert data['byCategory'][0]['planned']['minor'] == 10000
    assert data['byCategory'][0]['actual']['minor'] == 3503
    assert data['byCategory'][0]['variance']['minor'] == -6497
    assert data['byCategory'][0]['utilisationPercent'] == 35.0


def test_summary_revenue_and_expense_by_kind(client, admin_token, sample_event):
    event_id = sample_event['id']
    cat = post(client, '/api/events/%s/budget/categories' % event_id,
               {'name': 'Ledger', 'planned': '250.00'}, token=admin_token)
    assert cat.status_code == 201
    cid = cat.get_json()['id']
    assert _line(event_id, admin_token, client, categoryId=cid,
                 amount='10.00', kind='Expense').status_code == 201
    assert _line(event_id, admin_token, client, categoryId=cid,
                 amount='50.00', kind='Sponsorship', description='Acme cash').status_code == 201
    assert _line(event_id, admin_token, client, categoryId=cid,
                 amount='20.00', kind='Revenue', description='Ticket sales').status_code == 201
    assert _line(event_id, admin_token, client, categoryId=cid,
                 amount='-5.00', kind='Adjustment', description='Refund').status_code == 201

    data = get(client, '/api/events/%s/budget/summary' % event_id,
               token=admin_token).get_json()
    assert data['actualTotal']['minor'] == 7500
    assert data['revenue']['sponsorship']['minor'] == 5000
    assert data['revenue']['other']['minor'] == 1500
    assert data['revenue']['total']['minor'] == 6500
    assert data['expenseByKind']['Expense']['minor'] == 1000
    assert data['expenseByKind']['Sponsorship']['minor'] == 5000
    assert data['expenseByKind']['Revenue']['minor'] == 2000
    assert data['expenseByKind']['Adjustment']['minor'] == -500
    assert data['utilisationPercent'] == 30.0


def test_zero_amount_only_allowed_for_adjustment(client, admin_token, sample_event):
    event_id = sample_event['id']
    assert _line(event_id, admin_token, client, amount=0,
                 kind='Expense', description='Zero expense').status_code == 400
    assert _line(event_id, admin_token, client, amount=0,
                 kind='Sponsorship', description='Zero sponsor').status_code == 400
    res = _line(event_id, admin_token, client, amount=0, kind='Adjustment',
                description='Correction')
    assert res.status_code == 201
    assert res.get_json()['amountMinor'] == 0
    assert type(res.get_json()['amountMinor']) is int


def test_line_date_and_kind_validation(client, admin_token, sample_event):
    event_id = sample_event['id']
    res = _line(event_id, admin_token, client, date='11/05/2026')
    assert res.status_code == 400
    assert 'YYYY-MM-DD' in res.get_json()['message']
    res = _line(event_id, admin_token, client, date='2026-11-05')
    assert res.status_code == 201
    assert res.get_json()['date'] == '2026-11-05'
    res = _line(event_id, admin_token, client, kind='Bribe')
    assert res.status_code == 400
    res = _line(event_id, admin_token, client, description='')
    assert res.status_code == 400


def test_line_must_reference_own_event_category(client, admin_token):
    first = post(client, '/api/events', {'title': 'Finance First Event',
                                         'seats': 10, 'date': '2026-11-05'},
                 token=admin_token)
    assert first.status_code in (200, 201), first.get_json()
    first_id = (first.get_json().get('event') or first.get_json())['id']
    second = post(client, '/api/events', {'title': 'Finance Second Event',
                                          'seats': 10, 'date': '2026-11-05'},
                  token=admin_token)
    assert second.status_code in (200, 201), second.get_json()
    second_id = (second.get_json().get('event') or second.get_json())['id']
    cat = post(client, '/api/events/%s/budget/categories' % first_id,
               {'name': 'Mine', 'planned': '10'}, token=admin_token)
    assert cat.status_code == 201
    res = _line(second_id, admin_token, client, categoryId=cat.get_json()['id'])
    assert res.status_code == 400
    assert 'belong' in res.get_json()['message']
    res = _line(second_id, admin_token, client, categoryId='does-not-exist')
    assert res.status_code == 400


def test_line_list_filters(client, admin_token, sample_event):
    event_id = sample_event['id']
    cat = post(client, '/api/events/%s/budget/categories' % event_id,
               {'name': 'Filtered', 'planned': '80.00'}, token=admin_token)
    cid = cat.get_json()['id']
    assert _line(event_id, admin_token, client, categoryId=cid,
                 amount='5.00', kind='Expense').status_code == 201
    assert _line(event_id, admin_token, client, amount='7.00',
                 kind='Sponsorship', description='In-kind cash').status_code == 201

    rows = get(client, '/api/events/%s/budget/lines?kind=Sponsorship' % event_id,
               token=admin_token).get_json()
    assert len(rows) == 1
    assert rows[0]['kind'] == 'Sponsorship'
    assert rows[0]['amountMinor'] == 700

    rows = get(client, '/api/events/%s/budget/lines?categoryId=%s' % (event_id, cid),
               token=admin_token).get_json()
    assert len(rows) == 1
    assert rows[0]['categoryId'] == cid
    assert rows[0]['amountMinor'] == 500


def test_line_patch_and_delete(client, admin_token, sample_event, db):
    from models import BudgetLine
    event_id = sample_event['id']
    cat = post(client, '/api/events/%s/budget/categories' % event_id,
               {'name': 'Patchable', 'planned': '50.00'}, token=admin_token)
    cid = cat.get_json()['id']
    line = _line(event_id, admin_token, client, categoryId=cid, amount='10.00')
    line_id = line.get_json()['id']

    res = patch(client, '/api/budget/lines/%s' % line_id,
                {'amount': '12.50'}, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['amountMinor'] == 1250
    assert type(res.get_json()['amountMinor']) is int

    res = patch(client, '/api/budget/lines/%s' % line_id,
                {'amount': 0, 'kind': 'Adjustment'}, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['amountMinor'] == 0

    res = patch(client, '/api/budget/lines/%s' % line_id,
                {'kind': 'Expense'}, token=admin_token)
    assert res.status_code == 400

    summary = get(client, '/api/events/%s/budget/summary' % event_id,
                  token=admin_token).get_json()
    assert summary['actualTotal']['minor'] == 0

    assert delete(client, '/api/budget/lines/%s' % line_id,
                  token=admin_token).status_code == 200
    assert BudgetLine.query.get(line_id) is None


def test_every_created_money_row_is_integer(client, admin_token, sample_event, db):
    from models import BudgetCategory, BudgetLine, Sponsor
    event_id = sample_event['id']
    cat = post(client, '/api/events/%s/budget/categories' % event_id,
               {'name': 'Ints', 'planned': '999.99'}, token=admin_token)
    assert cat.status_code == 201
    for amount in ('0.01', '1234.56', '7'):
        assert _line(event_id, admin_token, client, amount=amount).status_code == 201
    assert _line(event_id, admin_token, client, amount='0',
                 kind='Adjustment', description='Zero adjust').status_code == 201
    sponsor = post(client, '/api/events/%s/sponsors' % event_id,
                   {'name': 'Int Sponsor', 'promised': '12.34', 'received': '0.01'},
                   token=admin_token)
    assert sponsor.status_code == 201

    for row in BudgetCategory.query.filter_by(event_id=event_id).all():
        assert type(row.planned_minor) is int, row.name
        assert row.planned_minor == 99999
    lines = BudgetLine.query.filter_by(event_id=event_id).all()
    assert len(lines) == 4
    assert all(type(r.amount_minor) is int for r in lines)
    assert sorted(r.amount_minor for r in lines) == [0, 1, 700, 123456]
    sponsor_row = Sponsor.query.get(sponsor.get_json()['id'])
    assert type(sponsor_row.promised_minor) is int
    assert sponsor_row.promised_minor == 1234
    assert type(sponsor_row.received_minor) is int
    assert sponsor_row.received_minor == 1


# --------------------------------------------------------------------------- #
# Scenarios                                                                    #
# --------------------------------------------------------------------------- #

def test_scenarios_are_marked_as_estimates(client, admin_token, sample_event, db):
    from models import Event
    event_id = sample_event['id']
    url = '/api/events/%s/budget/scenarios' % event_id

    res = post(client, url, {'scenarios': [{'label': 'Too many',
                                            'participants': 1}] * 7,
                             'perParticipant': '10'}, token=admin_token)
    assert res.status_code == 400
    res = post(client, url, {'scenarios': [{'label': 'Zero', 'participants': 0}],
                             'perParticipant': '10'}, token=admin_token)
    assert res.status_code == 400
    assert 'Scenario 0' in res.get_json()['message']

    payload = {'scenarios': [{'label': 'Base', 'participants': 50},
                             {'label': 'Busy', 'participants': 100},
                             {'label': 'Peak', 'participants': 200}],
               'perParticipant': '25.50'}
    res = post(client, url, payload, token=admin_token)
    assert res.status_code == 200, res.get_json()
    data = res.get_json()
    assert data['isEstimate'] is True
    assert data['note'] == ESTIMATE_NOTE
    assert data['assumptions']['perParticipant'] == 2550
    assert data['assumptions']['currency'] == 'INR'
    assert data['assumptions']['participantCounts'] == [50, 100, 200]
    assert data['scenarios'][0]['estimated']['minor'] == 50 * 2550
    assert len(data['scenarios']) == 3

    event = Event.query.get(event_id)
    stored = (event.settings or {}).get('budgetScenarios')
    assert stored['assumptions']['perParticipant'] == 2550
    assert stored['scenarios'][1] == {'label': 'Busy', 'participants': 100}

    res = get(client, url, token=admin_token)
    assert res.status_code == 200
    fetched = res.get_json()
    assert fetched['isEstimate'] is True
    assert fetched['assumptions']['participantCounts'] == [50, 100, 200]
    assert len(fetched['scenarios']) == 3

    summary = get(client, '/api/events/%s/budget/summary' % event_id,
                  token=admin_token).get_json()
    forecast = summary['forecast']
    assert forecast['participantCount'] == 200
    assert forecast['estimatedTotal']['minor'] == 200 * 2550
    assert forecast['estimatedTotal']['minor'] == 510000
    assert forecast['variance']['minor'] == 510000
    assert forecast['note'] == ESTIMATE_NOTE


def test_scenarios_default_to_empty_estimate(client, admin_token):
    created = post(client, '/api/events', {'title': 'Empty Scenarios Event'},
                   token=admin_token)
    assert created.status_code in (200, 201), created.get_json()
    event_id = (created.get_json().get('event') or created.get_json())['id']
    res = get(client, '/api/events/%s/budget/scenarios' % event_id,
              token=admin_token)
    assert res.status_code == 200
    data = res.get_json()
    assert data['scenarios'] == []
    assert data['isEstimate'] is True
    assert data['assumptions']['perParticipant'] == 0
    assert data['note'] == ESTIMATE_NOTE


# --------------------------------------------------------------------------- #
# Sponsors                                                                     #
# --------------------------------------------------------------------------- #

def test_sponsor_crud_and_report(client, admin_token, sample_event, db):
    from models import Sponsor
    event_id = sample_event['id']
    url = '/api/events/%s/sponsors' % event_id

    res = post(client, url, {'name': 'Acme', 'package': 'Gold', 'promised': '50000.00',
                             'status': 'Pledged',
                             'deliverables': [{'title': 'Logo on site',
                                               'due': '2026-11-01', 'done': True},
                                              {'title': 'Banner stand',
                                               'due': '2026-01-15', 'done': False}]},
               token=admin_token)
    assert res.status_code == 201, res.get_json()
    acme = res.get_json()
    assert acme['promisedMinor'] == 5000000
    assert type(acme['promisedMinor']) is int
    assert acme['deliverablesTotal'] == 2
    assert acme['deliverablesDone'] == 1

    assert post(client, url, {'name': 'Beta LLC', 'package': 'Gold',
                              'promised': '25000'}, token=admin_token).status_code == 201
    assert post(client, url, {'name': 'Gamma', 'package': 'Silver',
                              'promised': '0.00'}, token=admin_token).status_code == 201
    assert post(client, url, {'planned': '1'}, token=admin_token).status_code == 400
    assert post(client, url, {'name': 'Bad status', 'status': 'Rich'},
                token=admin_token).status_code == 400

    rows = get(client, url, token=admin_token).get_json()
    assert len(rows) == 3
    assert Sponsor.query.get(acme['id']).promised_minor == 5000000

    res = patch(client, '/api/sponsors/%s' % acme['id'],
                {'package': 'Platinum', 'promised': '75000.00'}, token=admin_token)
    assert res.status_code == 200
    assert res.get_json()['promisedMinor'] == 7500000

    report = get(client, '/api/events/%s/sponsor-report' % event_id,
                 token=admin_token).get_json()
    summary = report['summary']
    assert summary['sponsors'] == 3
    assert summary['promisedTotal']['minor'] == 7500000 + 2500000 + 0
    assert summary['receivedTotal']['minor'] == 0
    assert summary['outstanding']['minor'] == 10000000
    assert summary['deliverablesTotal'] == 2
    assert summary['deliverablesDone'] == 1
    assert summary['deliverablesPending'] == 1
    assert summary['deliverablesOverdue'] == 1

    first = report['sponsors'][0]
    assert first['name'] == 'Acme'
    assert first['package'] == 'Platinum'
    assert first['promisedFormatted'] == '₹75,000.00'
    assert first['deliverablesDone'] == 1
    assert first['deliverablesTotal'] == 2
    assert first['completionPercent'] == 50.0
    assert first['overdue'] is True

    packages = report['byPackage']
    assert [(p['package'], p['count']) for p in packages] == [('Platinum', 1),
                                                              ('Gold', 1),
                                                              ('Silver', 1)]
    assert packages[1]['promised']['minor'] == 2500000
    assert report['roi'] is None
    assert report['roiNote'] == ROI_NOTE

    assert delete(client, '/api/sponsors/%s' % acme['id'],
                  token=admin_token).status_code == 200
    assert get(client, '/api/events/%s/sponsor-report' % event_id,
               token=admin_token).get_json()['summary']['sponsors'] == 2


def test_sponsor_paid_status_budget_line_is_idempotent(client, admin_token, sample_event, db):
    from models import BudgetCategory, BudgetLine
    event_id = sample_event['id']
    res = post(client, '/api/events/%s/sponsors' % event_id,
               {'name': 'Cash Co', 'promised': '10000.00', 'status': 'Paid'},
               token=admin_token)
    assert res.status_code == 201, res.get_json()
    sponsor_id = res.get_json()['id']
    ref = 'sponsor:' + sponsor_id

    lines = BudgetLine.query.filter_by(document_ref=ref).all()
    assert len(lines) == 1
    assert lines[0].kind == 'Sponsorship'
    assert type(lines[0].amount_minor) is int
    assert lines[0].amount_minor == 1000000
    category = BudgetCategory.query.get(lines[0].category_id)
    assert category.name == 'Sponsorship'
    assert category.event_id == event_id

    assert patch(client, '/api/sponsors/%s' % sponsor_id,
                 {'status': 'Paid'}, token=admin_token).status_code == 200
    assert BudgetLine.query.filter_by(document_ref=ref).count() == 1

    assert patch(client, '/api/sponsors/%s' % sponsor_id,
                 {'received': '2500.00', 'addToBudget': True},
                 token=admin_token).status_code == 200
    assert BudgetLine.query.filter_by(document_ref=ref).count() == 1


def test_sponsor_add_to_budget_runs_exactly_once(client, admin_token, sample_event, db):
    from models import BudgetLine
    event_id = sample_event['id']
    res = post(client, '/api/events/%s/sponsors' % event_id,
               {'name': 'Later Co', 'promised': '5000.00', 'status': 'Pledged'},
               token=admin_token)
    assert res.status_code == 201
    sponsor_id = res.get_json()['id']
    ref = 'sponsor:' + sponsor_id
    assert BudgetLine.query.filter_by(document_ref=ref).count() == 0

    assert patch(client, '/api/sponsors/%s' % sponsor_id,
                 {'received': '999.99'}, token=admin_token).status_code == 200
    assert BudgetLine.query.filter_by(document_ref=ref).count() == 0

    payload = {'received': '1200.50', 'addToBudget': True}
    assert patch(client, '/api/sponsors/%s' % sponsor_id, payload,
                 token=admin_token).status_code == 200
    lines = BudgetLine.query.filter_by(document_ref=ref).all()
    assert len(lines) == 1
    assert lines[0].amount_minor == 120050
    assert type(lines[0].amount_minor) is int

    assert patch(client, '/api/sponsors/%s' % sponsor_id, payload,
                 token=admin_token).status_code == 200
    assert BudgetLine.query.filter_by(document_ref=ref).count() == 1


def test_sponsor_deliverables_validation(client, admin_token, sample_event):
    res = post(client, '/api/events/%s/sponsors' % sample_event['id'],
               {'name': 'Deliveries Inc'}, token=admin_token)
    assert res.status_code == 201
    sponsor_id = res.get_json()['id']
    url = '/api/sponsors/%s/deliverables' % sponsor_id

    res = _call(client, 'PUT', url, token=admin_token,
                payload={'deliverables': [{'due': '2026-11-01', 'done': True}]})
    assert res.status_code == 400
    assert 'Deliverable 0' in res.get_json()['message']

    res = _call(client, 'PUT', url, token=admin_token,
                payload={'deliverables': [{'title': 'One'},
                                          {'title': 'Two', 'due': 'soon'}]})
    assert res.status_code == 400
    assert 'Deliverable 1' in res.get_json()['message']

    res = _call(client, 'PUT', url, token=admin_token, payload={'deliverables': 'nope'})
    assert res.status_code == 400
    assert 'list' in res.get_json()['message']

    res = _call(client, 'PUT', url, token=admin_token,
                payload={'deliverables': [{'title': 'Logo wall',
                                           'due': '2026-11-01', 'done': 'yes'},
                                          {'title': 'Lanyards'}]})
    assert res.status_code == 200, res.get_json()
    items = res.get_json()['deliverables']
    assert len(items) == 2
    assert items[0]['done'] is True
    assert items[0]['due'] == '2026-11-01'
    assert items[1]['done'] is False
    assert items[1]['due'] == ''
