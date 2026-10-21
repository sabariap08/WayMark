"""Budget + sponsorship (finance): categories, lines, summary, scenarios, sponsors.

Money is stored as integer minor units (utils.money); floats only ever appear
in JSON as formatted echoes of the integer source of truth. Every route in this
module is manager-only - an admin or the event's host - so no budget or
sponsor figure is ever exposed to participants or anonymous callers.
"""
from datetime import datetime
from functools import wraps

from flask import Blueprint, jsonify, request

from extensions import db
from models import BudgetCategory, BudgetLine, Event, Sponsor
from utils.helpers import audit, parse_bool, parse_int
from utils.money import (clean_currency, fmt, money_json, parse_amount, to_major,
                         total_minor, utilisation_percent, variance_minor)
from utils.security import can_manage_event, resolve_user
from utils.serializers import budget_category_json, budget_line_json, sponsor_json

finance_bp = Blueprint('finance', __name__)


def _request_user():
    """Resolve the caller from this request's token on every call.

    Deliberately bypasses the request-cached security helper: a preserved
    test-client app context can outlive its SQLAlchemy session, which leaves
    any User cached on ``g`` detached and unable to refresh its attributes.
    """
    return resolve_user()[0]


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not _request_user():
            return jsonify({'message': 'Authentication required.'}), 401
        return fn(*args, **kwargs)
    return wrapper


def require_event_manager(event_id_arg='event_id'):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = _request_user()
            if not user:
                return jsonify({'message': 'Authentication required.'}), 401
            event_id = kwargs.get(event_id_arg) or (args[0] if args else None)
            event = Event.query.get(event_id) if event_id else None
            if not event:
                return jsonify({'message': 'Event not found.'}), 404
            if not can_manage_event(user, event):
                return jsonify({'message': 'You can only manage events you host.'}), 403
            kwargs['_event'] = event
            return fn(*args, **kwargs)
        return wrapper
    return decorator

LINE_KINDS = ('Expense', 'Sponsorship', 'Revenue', 'Adjustment')
SPONSOR_STATUSES = ('Prospect', 'Pledged', 'Confirmed', 'Paid', 'Declined')
MAX_SCENARIOS = 6
SCENARIOS_KEY = 'budgetScenarios'
ESTIMATE_NOTE = 'Estimate based on configured assumptions — not actual financial data.'
ROI_NOTE = 'Not calculated: WayMark has no defined outcome formula or conversion data.'
SPONSOR_REF_PREFIX = 'sponsor:'

SPONSOR_TEXT_FIELDS = {
    'contactName': ('contact_name', 160),
    'contactEmail': ('contact_email', 200),
    'contactPhone': ('contact_phone', 60),
    'package': ('package', 160),
    'booth': ('booth', 120),
    'logoUrl': ('logo_url', 400),
    'notes': ('notes', 5000),
}


def _forbid_unless_manager(event):
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if not can_manage_event(_request_user(), event):
        return jsonify({'message': 'You can only manage events you host.'}), 403
    return None


def _budget_currency(event):
    category = BudgetCategory.query.filter_by(event_id=event.id) \
        .order_by(BudgetCategory.created_at.asc()).first()
    if category and category.currency:
        return clean_currency(category.currency)
    line = BudgetLine.query.filter_by(event_id=event.id) \
        .order_by(BudgetLine.created_at.asc()).first()
    if line and line.currency:
        return clean_currency(line.currency)
    return clean_currency(getattr(event, 'currency', None) or 'INR')


def _currency_error(event, submitted):
    code = _budget_currency(event)
    if submitted is not None and clean_currency(submitted) != code:
        return jsonify({'message': 'All budget lines must use ' + code}), 400
    return None


def _valid_date(value):
    text = str(value or '').strip()
    if not text:
        return True
    try:
        return datetime.strptime(text, '%Y-%m-%d').strftime('%Y-%m-%d') == text
    except ValueError:
        return False


def _duplicate_category(event_id, name, exclude_id=None):
    needle = str(name or '').strip().lower()
    for row in BudgetCategory.query.filter_by(event_id=event_id).all():
        if row.id == exclude_id:
            continue
        if (row.name or '').strip().lower() == needle:
            return True
    return False


def _totals_for(category, lines):
    actual = total_minor(lines)
    return {
        'actualMinor': int(actual),
        'actual': to_major(actual, category.currency),
        'varianceMinor': int(variance_minor(category.planned_minor, actual)),
        'utilisationPercent': utilisation_percent(category.planned_minor, actual),
    }


def _lines_by_category(event_id):
    grouped = {}
    for line in BudgetLine.query.filter_by(event_id=event_id).all():
        if line.category_id:
            grouped.setdefault(line.category_id, []).append(line)
    return grouped


def _clean_deliverables(value):
    if not isinstance(value, list):
        return None, (jsonify({'message': 'deliverables must be a list.'}), 400)
    cleaned = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return None, (jsonify({'message': 'Deliverable ' + str(index)
                                   + ' must be an object.'}), 400)
        title = str(item.get('title') or '').strip()
        if not title:
            return None, (jsonify({'message': 'Deliverable ' + str(index)
                                   + ' needs a title.'}), 400)
        due = str(item.get('due') or '').strip()
        if due and not _valid_date(due):
            return None, (jsonify({'message': 'Deliverable ' + str(index)
                                   + ': due must be a YYYY-MM-DD date.'}), 400)
        cleaned.append({'title': title[:200], 'due': due,
                        'done': parse_bool(item.get('done'))})
    return cleaned, None


def _record_sponsor_revenue(event, sponsor):
    """Idempotent: one Sponsorship budget line per sponsor, same transaction."""
    amount = int(sponsor.received_minor or 0)
    if amount <= 0:
        amount = int(sponsor.promised_minor or 0)
    if amount <= 0:
        return None
    ref = SPONSOR_REF_PREFIX + str(sponsor.id)
    if BudgetLine.query.filter_by(document_ref=ref).first():
        return None
    currency = clean_currency(sponsor.currency or _budget_currency(event))
    category = None
    for row in BudgetCategory.query.filter_by(event_id=event.id).all():
        if (row.name or '').strip().lower() == 'sponsorship':
            category = row
            break
    if category is None:
        category = BudgetCategory(event_id=event.id, name='Sponsorship',
                                  planned_minor=0, currency=currency, sort_order=0)
        db.session.add(category)
        db.session.flush()
    user = _request_user()
    line = BudgetLine(
        event_id=event.id, category_id=category.id,
        description='Sponsorship: ' + (sponsor.name or ''),
        kind='Sponsorship', amount_minor=amount, currency=currency,
        date=datetime.utcnow().strftime('%Y-%m-%d'), document_ref=ref,
        created_by=(user.name if user else ''),
    )
    db.session.add(line)
    return line


def _wants_revenue(payload, sponsor):
    if str(payload.get('status') or '') == 'Paid':
        return True
    if parse_bool(payload.get('addToBudget')) and int(sponsor.received_minor or 0) > 0:
        return True
    return False


# --------------------------------------------------------------------------- #
# Budget categories                                                            #
# --------------------------------------------------------------------------- #

@finance_bp.route('/events/<event_id>/budget/categories', methods=['GET'])
@require_event_manager('event_id')
def list_budget_categories(event_id, _event):
    grouped = _lines_by_category(_event.id)
    rows = BudgetCategory.query.filter_by(event_id=_event.id) \
        .order_by(BudgetCategory.sort_order.asc(),
                  BudgetCategory.created_at.asc()).all()
    result = [budget_category_json(c, _totals_for(c, grouped.get(c.id, [])))
              for c in rows]
    return jsonify(result)


@finance_bp.route('/events/<event_id>/budget/categories', methods=['POST'])
@require_event_manager('event_id')
def create_budget_category(event_id, _event):
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Category name is required.'}), 400
    denied = _currency_error(_event, payload.get('currency'))
    if denied:
        return denied
    currency = clean_currency(payload.get('currency') or _budget_currency(_event))
    planned = parse_amount(payload.get('planned'), currency)
    if planned < 0:
        return jsonify({'message': 'Planned amount cannot be negative.'}), 400
    if _duplicate_category(_event.id, name):
        return jsonify({'message': 'A budget category with this name already exists.'}), 409
    row = BudgetCategory(event_id=_event.id, name=name[:160],
                         planned_minor=int(planned), currency=currency,
                         sort_order=parse_int(payload.get('sortOrder'), 0))
    db.session.add(row)
    db.session.commit()
    audit('Budget category created', _request_user(), target=name)
    return jsonify(budget_category_json(row)), 201


@finance_bp.route('/budget/categories/<category_id>', methods=['PUT', 'PATCH'])
@require_auth
def update_budget_category(category_id):
    row = BudgetCategory.query.get(category_id)
    if not row:
        return jsonify({'message': 'Budget category not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event)
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    updates = {}
    if 'name' in payload:
        name = str(payload.get('name') or '').strip()
        if not name:
            return jsonify({'message': 'Category name is required.'}), 400
        if _duplicate_category(event.id, name, exclude_id=row.id):
            return jsonify({'message': 'A budget category with this name already exists.'}), 409
        updates['name'] = name[:160]
    if 'planned' in payload:
        planned = parse_amount(payload.get('planned'), row.currency)
        if planned < 0:
            return jsonify({'message': 'Planned amount cannot be negative.'}), 400
        updates['planned_minor'] = int(planned)
    if 'currency' in payload:
        denied = _currency_error(event, payload.get('currency'))
        if denied:
            return denied
    if 'sortOrder' in payload:
        order = parse_int(payload.get('sortOrder'), None)
        if order is None:
            return jsonify({'message': 'sortOrder must be an integer.'}), 400
        updates['sort_order'] = order
    for key, value in updates.items():
        setattr(row, key, value)
    db.session.commit()
    audit('Budget category updated', _request_user(), target=row.name)
    grouped = _lines_by_category(event.id)
    return jsonify(budget_category_json(row, _totals_for(row, grouped.get(row.id, []))))


@finance_bp.route('/budget/categories/<category_id>', methods=['DELETE'])
@require_auth
def delete_budget_category(category_id):
    row = BudgetCategory.query.get(category_id)
    if not row:
        return jsonify({'message': 'Budget category not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event)
    if denied:
        return denied
    if BudgetLine.query.filter_by(category_id=row.id).count():
        return jsonify({'message': 'This category still has budget lines.'}), 409
    name = row.name
    db.session.delete(row)
    db.session.commit()
    audit('Budget category deleted', _request_user(), target=name)
    return jsonify({'ok': True})


# --------------------------------------------------------------------------- #
# Budget lines                                                                 #
# --------------------------------------------------------------------------- #

@finance_bp.route('/events/<event_id>/budget/lines', methods=['GET'])
@require_event_manager('event_id')
def list_budget_lines(event_id, _event):
    query = BudgetLine.query.filter_by(event_id=_event.id)
    kind = request.args.get('kind')
    if kind:
        query = query.filter_by(kind=kind)
    category_id = request.args.get('categoryId')
    if category_id:
        query = query.filter_by(category_id=category_id)
    rows = query.order_by(BudgetLine.created_at.asc()).all()
    return jsonify([budget_line_json(r) for r in rows])


@finance_bp.route('/events/<event_id>/budget/lines', methods=['POST'])
@require_event_manager('event_id')
def create_budget_line(event_id, _event):
    payload = request.get_json(silent=True) or {}
    currency = _budget_currency(_event)
    denied = _currency_error(_event, payload.get('currency'))
    if denied:
        return denied
    kind = str(payload.get('kind') or 'Expense')
    if kind not in LINE_KINDS:
        return jsonify({'message': 'Unknown budget line kind.'}), 400
    description = str(payload.get('description') or '').strip()
    if not description:
        return jsonify({'message': 'Description is required.'}), 400
    date = str(payload.get('date') or '').strip()
    if date and not _valid_date(date):
        return jsonify({'message': 'Date must be in YYYY-MM-DD format.'}), 400
    category_id = str(payload.get('categoryId') or '')
    if category_id:
        category = BudgetCategory.query.get(category_id)
        if not category:
            return jsonify({'message': 'Budget category not found.'}), 400
        if category.event_id != _event.id:
            return jsonify({'message': 'Budget category does not belong to this event.'}), 400
    amount = parse_amount(payload.get('amount'), currency)
    if kind != 'Adjustment' and amount <= 0:
        return jsonify({'message': 'Amount must be greater than zero.'}), 400
    user = _request_user()
    row = BudgetLine(event_id=_event.id, category_id=category_id,
                     description=description[:240], kind=kind,
                     amount_minor=int(amount), currency=currency, date=date,
                     document_ref=str(payload.get('documentRef') or '')[:400],
                     created_by=(user.name if user else ''))
    db.session.add(row)
    db.session.commit()
    audit('Budget line created', _request_user(), target=description)
    return jsonify(budget_line_json(row)), 201


@finance_bp.route('/budget/lines/<line_id>', methods=['PUT', 'PATCH'])
@require_auth
def update_budget_line(line_id):
    row = BudgetLine.query.get(line_id)
    if not row:
        return jsonify({'message': 'Budget line not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event)
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    updates = {}
    if 'description' in payload:
        description = str(payload.get('description') or '').strip()
        if not description:
            return jsonify({'message': 'Description is required.'}), 400
        updates['description'] = description[:240]
    if 'kind' in payload:
        kind = str(payload.get('kind') or '')
        if kind not in LINE_KINDS:
            return jsonify({'message': 'Unknown budget line kind.'}), 400
        updates['kind'] = kind
    if 'amount' in payload:
        updates['amount_minor'] = int(parse_amount(payload.get('amount'), row.currency))
    if 'currency' in payload:
        denied = _currency_error(event, payload.get('currency'))
        if denied:
            return denied
    if 'date' in payload:
        date = str(payload.get('date') or '').strip()
        if date and not _valid_date(date):
            return jsonify({'message': 'Date must be in YYYY-MM-DD format.'}), 400
        updates['date'] = date
    if 'categoryId' in payload:
        category_id = str(payload.get('categoryId') or '')
        if category_id:
            category = BudgetCategory.query.get(category_id)
            if not category:
                return jsonify({'message': 'Budget category not found.'}), 400
            if category.event_id != event.id:
                return jsonify({'message': 'Budget category does not belong to this event.'}), 400
        updates['category_id'] = category_id
    if 'documentRef' in payload:
        updates['document_ref'] = str(payload.get('documentRef') or '')[:400]
    final_kind = updates.get('kind', row.kind or 'Expense')
    final_amount = updates.get('amount_minor', row.amount_minor or 0)
    if final_kind != 'Adjustment' and int(final_amount) <= 0:
        return jsonify({'message': 'Amount must be greater than zero.'}), 400
    for key, value in updates.items():
        setattr(row, key, value)
    db.session.commit()
    audit('Budget line updated', _request_user(), target=row.description)
    return jsonify(budget_line_json(row))


@finance_bp.route('/budget/lines/<line_id>', methods=['DELETE'])
@require_auth
def delete_budget_line(line_id):
    row = BudgetLine.query.get(line_id)
    if not row:
        return jsonify({'message': 'Budget line not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event)
    if denied:
        return denied
    description = row.description
    db.session.delete(row)
    db.session.commit()
    audit('Budget line deleted', _request_user(), target=description)
    return jsonify({'ok': True})


# --------------------------------------------------------------------------- #
# Budget summary                                                               #
# --------------------------------------------------------------------------- #

@finance_bp.route('/events/<event_id>/budget/summary', methods=['GET'])
@require_event_manager('event_id')
def budget_summary(event_id, _event):
    currency = _budget_currency(_event)
    categories = BudgetCategory.query.filter_by(event_id=_event.id) \
        .order_by(BudgetCategory.sort_order.asc(),
                  BudgetCategory.created_at.asc()).all()
    lines = BudgetLine.query.filter_by(event_id=_event.id).all()
    grouped = {}
    for line in lines:
        if line.category_id:
            grouped.setdefault(line.category_id, []).append(line)

    planned_total = int(total_minor(categories, 'planned_minor'))
    actual_total = int(total_minor(lines))
    remaining = planned_total - actual_total
    variance = int(variance_minor(planned_total, actual_total))
    if planned_total > 0:
        variance_percent = round(variance * 100.0 / planned_total, 1)
    else:
        variance_percent = 0
    utilisation = utilisation_percent(planned_total, actual_total)

    by_category = []
    for category in categories:
        actual = total_minor(grouped.get(category.id, []))
        by_category.append({
            'id': category.id,
            'name': category.name or '',
            'currency': currency,
            'planned': money_json(category.planned_minor, currency),
            'actual': money_json(actual, currency),
            'variance': money_json(variance_minor(category.planned_minor, actual), currency),
            'varianceMinor': int(variance_minor(category.planned_minor, actual)),
            'utilisationPercent': utilisation_percent(category.planned_minor, actual),
        })

    sponsorship_total = total_minor([l for l in lines if l.kind == 'Sponsorship'])
    other_total = total_minor([l for l in lines if l.kind in ('Revenue', 'Adjustment')])
    kind_totals = {kind: total_minor([l for l in lines if l.kind == kind])
                   for kind in LINE_KINDS}

    stored = ((_event.settings or {}).get(SCENARIOS_KEY) or {})
    assumptions = stored.get('assumptions') or {}
    per_participant = parse_int(assumptions.get('perParticipant'), 0)
    counts = [parse_int(c, 0) for c in (assumptions.get('participantCounts') or [])]
    participant_count = parse_int(getattr(_event, 'registered_num', 0), 0)
    if participant_count <= 0:
        participant_count = max(counts) if counts else 0
    estimated = int(per_participant) * int(participant_count)

    return jsonify({
        'currency': currency,
        'plannedTotal': money_json(planned_total, currency),
        'actualTotal': money_json(actual_total, currency),
        'remaining': money_json(remaining, currency),
        'variance': money_json(variance, currency),
        'variancePercent': variance_percent,
        'utilisationPercent': utilisation,
        'plannedMinor': planned_total,
        'actualMinor': actual_total,
        'remainingMinor': remaining,
        'varianceMinor': variance,
        'byCategory': by_category,
        'revenue': {
            'sponsorship': money_json(sponsorship_total, currency),
            'other': money_json(other_total, currency),
            'total': money_json(sponsorship_total + other_total, currency),
        },
        'expenseByKind': {kind: money_json(kind_totals[kind], currency)
                          for kind in LINE_KINDS},
        'forecast': {
            'participantCount': participant_count,
            'estimatedTotal': money_json(estimated, currency),
            'variance': money_json(estimated - planned_total, currency),
            'note': ESTIMATE_NOTE,
        },
    })


# --------------------------------------------------------------------------- #
# Budget scenarios (estimates, never actuals)                                  #
# --------------------------------------------------------------------------- #

def _scenarios_payload(event):
    stored = ((event.settings or {}).get(SCENARIOS_KEY) or {})
    currency = clean_currency((stored.get('assumptions') or {}).get('currency')
                              or _budget_currency(event))
    per_participant = parse_int((stored.get('assumptions') or {}).get('perParticipant'), 0)
    raw = stored.get('scenarios')
    if not isinstance(raw, list):
        raw = []
    items = []
    counts = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        participants = parse_int(entry.get('participants'), 0)
        counts.append(participants)
        items.append({
            'label': str(entry.get('label') or ''),
            'participants': participants,
            'estimated': money_json(per_participant * participants, currency),
        })
    configured = (stored.get('assumptions') or {}).get('participantCounts')
    if not isinstance(configured, list) or not configured:
        configured = counts
    return {
        'scenarios': items,
        'isEstimate': True,
        'assumptions': {
            'perParticipant': int(per_participant),
            'currency': currency,
            'participantCounts': [parse_int(c, 0) for c in configured],
        },
        'note': ESTIMATE_NOTE,
    }


@finance_bp.route('/events/<event_id>/budget/scenarios', methods=['POST'])
@require_event_manager('event_id')
def save_budget_scenarios(event_id, _event):
    payload = request.get_json(silent=True) or {}
    scenarios = payload.get('scenarios')
    if not isinstance(scenarios, list):
        return jsonify({'message': 'scenarios must be a list.'}), 400
    if len(scenarios) > MAX_SCENARIOS:
        return jsonify({'message': 'A budget can hold at most '
                                   + str(MAX_SCENARIOS) + ' scenarios.'}), 400
    currency = _budget_currency(_event)
    if payload.get('perParticipantMinor') is not None:
        per_participant = parse_int(payload.get('perParticipantMinor'), None)
        if per_participant is None:
            return jsonify({'message': 'perParticipant must be an amount.'}), 400
        per_participant = int(per_participant)
    else:
        per_participant = parse_amount(payload.get('perParticipant'), currency)
    if per_participant < 0:
        return jsonify({'message': 'perParticipant cannot be negative.'}), 400

    cleaned = []
    for index, entry in enumerate(scenarios):
        if not isinstance(entry, dict):
            return jsonify({'message': 'Scenario ' + str(index)
                                       + ' must be an object.'}), 400
        participants = parse_int(entry.get('participants'), None)
        if participants is None or participants <= 0:
            return jsonify({'message': 'Scenario ' + str(index)
                                       + ' needs a positive participant count.'}), 400
        label = str(entry.get('label') or '').strip() or ('Scenario ' + str(index + 1))
        cleaned.append({'label': label[:80], 'participants': participants})

    settings = dict(_event.settings or {})
    settings[SCENARIOS_KEY] = {
        'scenarios': cleaned,
        'assumptions': {
            'perParticipant': int(per_participant),
            'currency': currency,
            'participantCounts': [s['participants'] for s in cleaned],
        },
    }
    _event.settings = settings
    db.session.commit()
    audit('Budget scenarios saved', _request_user(), target=_event.title)
    return jsonify(_scenarios_payload(_event))


@finance_bp.route('/events/<event_id>/budget/scenarios', methods=['GET'])
@require_event_manager('event_id')
def get_budget_scenarios(event_id, _event):
    return jsonify(_scenarios_payload(_event))


# --------------------------------------------------------------------------- #
# Sponsors                                                                     #
# --------------------------------------------------------------------------- #

@finance_bp.route('/events/<event_id>/sponsors', methods=['GET'])
@require_event_manager('event_id')
def list_sponsors(event_id, _event):
    rows = Sponsor.query.filter_by(event_id=_event.id) \
        .order_by(Sponsor.created_at.asc()).all()
    return jsonify([sponsor_json(s) for s in rows])


@finance_bp.route('/events/<event_id>/sponsors', methods=['POST'])
@require_event_manager('event_id')
def create_sponsor(event_id, _event):
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Sponsor name is required.'}), 400
    status = str(payload.get('status') or 'Prospect')
    if status not in SPONSOR_STATUSES:
        return jsonify({'message': 'Unknown sponsor status.'}), 400
    deliverables = []
    if 'deliverables' in payload:
        deliverables, error = _clean_deliverables(payload.get('deliverables'))
        if error:
            return error
    currency = _budget_currency(_event)
    promised = parse_amount(payload.get('promised'), currency)
    if promised < 0:
        return jsonify({'message': 'Promised amount cannot be negative.'}), 400
    received = parse_amount(payload.get('received'), currency)
    if received < 0:
        return jsonify({'message': 'Received amount cannot be negative.'}), 400

    row = Sponsor(event_id=_event.id, name=name[:200], package=str(payload.get('package') or '')[:160],
                  promised_minor=int(promised), received_minor=int(received),
                  currency=currency, status=status, booth=str(payload.get('booth') or '')[:120],
                  deliverables=deliverables)
    for key, (attr, limit) in SPONSOR_TEXT_FIELDS.items():
        if payload.get(key) is not None:
            setattr(row, attr, str(payload[key])[:limit])
    db.session.add(row)
    db.session.flush()
    if _wants_revenue(payload, row):
        _record_sponsor_revenue(_event, row)
    db.session.commit()
    audit('Sponsor added', _request_user(), target=name + ' @ ' + (_event.title or ''))
    return jsonify(sponsor_json(row)), 201


@finance_bp.route('/sponsors/<sponsor_id>', methods=['PUT', 'PATCH'])
@require_auth
def update_sponsor(sponsor_id):
    row = Sponsor.query.get(sponsor_id)
    if not row:
        return jsonify({'message': 'Sponsor not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event)
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    updates = {}
    if 'name' in payload:
        name = str(payload.get('name') or '').strip()
        if not name:
            return jsonify({'message': 'Sponsor name is required.'}), 400
        updates['name'] = name[:200]
    if 'status' in payload:
        status = str(payload.get('status') or '')
        if status not in SPONSOR_STATUSES:
            return jsonify({'message': 'Unknown sponsor status.'}), 400
        updates['status'] = status
    if 'promised' in payload:
        promised = parse_amount(payload.get('promised'), row.currency)
        if promised < 0:
            return jsonify({'message': 'Promised amount cannot be negative.'}), 400
        updates['promised_minor'] = int(promised)
    if 'received' in payload:
        received = parse_amount(payload.get('received'), row.currency)
        if received < 0:
            return jsonify({'message': 'Received amount cannot be negative.'}), 400
        updates['received_minor'] = int(received)
    if 'deliverables' in payload:
        deliverables, error = _clean_deliverables(payload.get('deliverables'))
        if error:
            return error
        updates['deliverables'] = deliverables
    for key, (attr, limit) in SPONSOR_TEXT_FIELDS.items():
        if payload.get(key) is not None:
            updates[attr] = str(payload[key])[:limit]
    for key, value in updates.items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    if _wants_revenue(payload, row):
        _record_sponsor_revenue(event, row)
    db.session.commit()
    audit('Sponsor updated', _request_user(), target=row.name)
    return jsonify(sponsor_json(row))


@finance_bp.route('/sponsors/<sponsor_id>', methods=['DELETE'])
@require_auth
def delete_sponsor(sponsor_id):
    row = Sponsor.query.get(sponsor_id)
    if not row:
        return jsonify({'message': 'Sponsor not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event)
    if denied:
        return denied
    name = row.name
    db.session.delete(row)
    db.session.commit()
    audit('Sponsor removed', _request_user(), target=name)
    return jsonify({'ok': True})


@finance_bp.route('/sponsors/<sponsor_id>/deliverables', methods=['PUT'])
@require_auth
def put_sponsor_deliverables(sponsor_id):
    row = Sponsor.query.get(sponsor_id)
    if not row:
        return jsonify({'message': 'Sponsor not found.'}), 404
    event = Event.query.get(row.event_id)
    denied = _forbid_unless_manager(event)
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    deliverables, error = _clean_deliverables(payload.get('deliverables'))
    if error:
        return error
    row.deliverables = deliverables
    row.updated_at = datetime.utcnow()
    db.session.commit()
    audit('Sponsor deliverables updated', _request_user(), target=row.name)
    return jsonify(sponsor_json(row))


# --------------------------------------------------------------------------- #
# Sponsor report                                                               #
# --------------------------------------------------------------------------- #

@finance_bp.route('/events/<event_id>/sponsor-report', methods=['GET'])
@require_event_manager('event_id')
def sponsor_report(event_id, _event):
    currency = _budget_currency(_event)
    rows = Sponsor.query.filter_by(event_id=_event.id) \
        .order_by(Sponsor.created_at.asc()).all()
    today = datetime.utcnow().strftime('%Y-%m-%d')

    promised_total = int(total_minor(rows, 'promised_minor'))
    received_total = int(total_minor(rows, 'received_minor'))
    deliverables_total = 0
    deliverables_done = 0
    deliverables_overdue = 0
    entries = []
    packages = {}

    for sponsor in rows:
        items = sponsor.deliverables if isinstance(sponsor.deliverables, list) else []
        done = len([d for d in items if isinstance(d, dict) and d.get('done')])
        overdue_items = [d for d in items
                         if isinstance(d, dict) and not d.get('done')
                         and str(d.get('due') or '') and str(d.get('due')) < today]
        total = len(items)
        deliverables_total += total
        deliverables_done += done
        deliverables_overdue += len(overdue_items)
        completion = round(done * 100.0 / total, 1) if total else 0
        entries.append({
            'id': sponsor.id,
            'name': sponsor.name or '',
            'package': sponsor.package or '',
            'status': sponsor.status or 'Prospect',
            'promisedFormatted': fmt(sponsor.promised_minor, sponsor.currency),
            'receivedFormatted': fmt(sponsor.received_minor, sponsor.currency),
            'deliverablesDone': done,
            'deliverablesTotal': total,
            'completionPercent': completion,
            'overdue': bool(overdue_items),
        })
        key = sponsor.package or ''
        bucket = packages.setdefault(key, {'package': key, 'count': 0, 'promised': 0})
        bucket['count'] += 1
        bucket['promised'] = int(bucket['promised']) + int(sponsor.promised_minor or 0)

    by_package = [{'package': key, 'count': bucket['count'],
                   'promised': money_json(bucket['promised'], currency)}
                  for key, bucket in packages.items()]

    return jsonify({
        'summary': {
            'sponsors': len(rows),
            'promisedTotal': money_json(promised_total, currency),
            'receivedTotal': money_json(received_total, currency),
            'outstanding': money_json(promised_total - received_total, currency),
            'deliverablesTotal': deliverables_total,
            'deliverablesDone': deliverables_done,
            'deliverablesPending': deliverables_total - deliverables_done,
            'deliverablesOverdue': deliverables_overdue,
        },
        'sponsors': entries,
        'byPackage': by_package,
        'roi': None,
        'roiNote': ROI_NOTE,
    })
