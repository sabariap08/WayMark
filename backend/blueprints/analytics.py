"""Historical analytics: per-event metrics, edition compare, natural-language
query (allow-listed intents only) and rule-based insights.

Every number in this module is computed from database rows and every metric
carries an explicit `formula` string. Nothing here calls an AI helper to
decide a value; the optional provider may only rephrase numbers that were
already computed deterministically.
"""
import json
import re
from datetime import datetime

from flask import Blueprint, jsonify, request

from models import (AttendanceLog, BudgetCategory, BudgetLine, Event, Feedback,
                    Registration, Score, Session, Sponsor, Submission, Task,
                    Volunteer)
from utils.money import fmt
from utils.security import can_manage_event, current_user, is_admin, require_auth

analytics_bp = Blueprint('analytics', __name__)

ACTIVE_STATUSES = ('Confirmed', 'Registered')
DATE_FORMATS = ('%Y-%m-%d', '%b %d, %Y', '%B %d, %Y', '%d %b %Y', '%d %B %Y',
                '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d')

FORMULAS = {
    'registrations': 'count of registration rows; overTime = rows grouped by date(registered_at)',
    'attendance.rate': 'checkedIn / confirmed * 100',
    'attendance.checkedIn': 'active registrations with >=1 attendance log or attendanceStatus in (Checked in, Exception)',
    'capacity.utilizationPercent': 'confirmed / seats * 100',
    'feedback.averageOverall': 'sum(overallRating) / responses',
    'feedback.wouldRecommendPercent': 'wouldRecommend / responses * 100',
    'sessions.attendedSessions': 'sessions with >=1 matching attendance log',
    'expenses.variancePercent': '(actual - planned) / planned * 100',
    'sponsors.deliverableCompletionPercent': 'doneDeliverables / totalDeliverables * 100',
    'volunteers.taskCompletionPercent': 'tasksCompleted / tasksTotal * 100',
    'competition.participationRatePercent': 'scoredSubmissions / submissions * 100',
    'retention.percent': 'returningParticipants / previousEditionParticipants * 100',
}


# --------------------------------------------------------------------------- #
# Small deterministic helpers                                                  #
# --------------------------------------------------------------------------- #

def _norm(value):
    return ' '.join(str(value or '').lower().split())


def _pct(numerator, denominator):
    """Percent of two ints; None when the denominator is zero (never fabricate)."""
    if not denominator:
        return None
    return round((numerator or 0) * 100.0 / denominator, 1)


def _session_matches(log_session, title):
    a, b = _norm(log_session), _norm(title)
    if not a or not b:
        return False
    return a == b or b in a or a in b


def _parse_event_date(event):
    text = str(event.date or '').strip()
    for fmt_str in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt_str)
        except (ValueError, TypeError):
            continue
    if isinstance(getattr(event, 'created_at', None), datetime):
        return event.created_at
    return datetime.min


def _base_title(title):
    """Strip a trailing year / edition / volume token so editions share a key."""
    text = ' '.join(str(title or '').split())
    text = re.sub(r'\s*\b(?:19|20)\d{2}\b\.?\s*$', '', text).strip()
    text = re.sub(r'\s+\d+(?:st|nd|rd|th)?\s+(?:edition|ed)\b\.?\s*$', '', text,
                  flags=re.IGNORECASE).strip()
    text = re.sub(r'\s+edition\s+\d+\b\.?\s*$', '', text, flags=re.IGNORECASE).strip()
    text = re.sub(r'\s+vol\.?\s*\d+\b\.?\s*$', '', text, flags=re.IGNORECASE).strip()
    return text or ' '.join(str(title or '').split())


def previous_edition(event, pool=None):
    """The latest earlier Event sharing the exact title or the base title."""
    if not event:
        return None
    candidates = pool if pool is not None else Event.query.all()
    this_title, this_key = _norm(event.title), _norm(_base_title(event.title))
    this_date = _parse_event_date(event)
    earlier = []
    for other in candidates:
        if other.id == event.id:
            continue
        same_title = _norm(other.title) == this_title
        same_base = bool(this_key) and _norm(_base_title(other.title)) == this_key
        if not (same_title or same_base):
            continue
        if _parse_event_date(other) < this_date:
            earlier.append(other)
    if not earlier:
        return None
    return max(earlier, key=_parse_event_date)


# --------------------------------------------------------------------------- #
# Per-event metrics                                                            #
# --------------------------------------------------------------------------- #

def _budget_rows(event_ids):
    categories = BudgetCategory.query.filter(BudgetCategory.event_id.in_(event_ids)).all()
    lines = [l for l in BudgetLine.query.filter(BudgetLine.event_id.in_(event_ids)).all()
             if (l.kind or 'Expense') == 'Expense']
    rows = []
    for cat in categories:
        planned = int(cat.planned_minor or 0)
        actual = sum(int(l.amount_minor or 0) for l in lines if l.category_id == cat.id)
        rows.append({
            'categoryId': cat.id,
            'name': cat.name or '',
            'plannedMinor': planned,
            'actualMinor': actual,
            'varianceMinor': actual - planned,
            'variancePercent': _pct(actual - planned, planned),
            'currency': cat.currency or 'INR',
        })
    return rows


def _metrics_for_event(event):
    regs = Registration.query.filter_by(event_id=event.id).all()
    logs = AttendanceLog.query.filter_by(event_id=event.id).all()
    feedbacks = Feedback.query.filter_by(event_id=event.id).all()
    sessions = Session.query.filter_by(event_id=event.id).all()
    sponsors = Sponsor.query.filter_by(event_id=event.id).all()
    volunteers = Volunteer.query.filter_by(event_id=event.id).all()
    tasks = Task.query.filter_by(event_id=event.id).all()
    submissions = Submission.query.filter_by(event_id=event.id).all()
    scores = Score.query.filter_by(event_id=event.id).all()
    budget_rows = _budget_rows([event.id])

    confirmed_rows = [r for r in regs if (r.status or '') in ACTIVE_STATUSES]
    confirmed = len(confirmed_rows)
    waitlisted = sum(1 for r in regs if (r.status or '') in ('Waitlisted', 'Offered'))
    cancelled = sum(1 for r in regs if (r.status or '') == 'Cancelled')

    by_date = {}
    for row in regs:
        stamp = row.registered_at
        key = stamp.strftime('%Y-%m-%d') if stamp else 'unknown'
        by_date[key] = by_date.get(key, 0) + 1
    over_time = [{'date': k, 'count': v} for k, v in sorted(by_date.items())]

    log_reg_ids = {l.registration_id for l in logs if l.registration_id}
    log_user_ids = {l.user_id for l in logs if l.user_id}
    checked_in = 0
    for row in confirmed_rows:
        if (row.id in log_reg_ids or row.user_id in log_user_ids
                or (row.attendance_status or '') in ('Checked in', 'Exception')):
            checked_in += 1
    no_shows = max(0, confirmed - checked_in)

    seats = int(event.seats or event.capacity_num or 0)
    responses = len(feedbacks)
    average_overall = (round(sum((f.overall_rating or 0) for f in feedbacks) / responses, 1)
                       if responses else None)
    recommend = sum(1 for f in feedbacks if f.would_recommend)

    attended_sessions = 0
    for session_row in sessions:
        if any(_session_matches(log.session, session_row.title) for log in logs):
            attended_sessions += 1
    completed_sessions = sum(1 for s in sessions if (s.status or '') == 'Completed')

    planned_minor = sum(int(row['plannedMinor']) for row in budget_rows)
    actual_minor = sum(int(row['actualMinor']) for row in budget_rows)
    currency = event.currency or 'INR'

    deliverables_total = sum(len(s.deliverables or []) for s in sponsors)
    deliverables_done = sum(1 for s in sponsors for d in (s.deliverables or []) if d.get('done'))

    tasks_total = len(tasks)
    tasks_done = sum(1 for t in tasks if (t.status or '') == 'Done')

    submission_ids = {s.id for s in submissions}
    scored_ids = {s.submission_id for s in scores if s.submission_id in submission_ids}

    retention = _retention_for(event)

    return {
        'event': {
            'id': event.id,
            'title': event.title or '',
            'date': event.date or '',
            'category': event.category or '',
            'status': event.status or '',
            'formula': 'event row fields: id, title, date, category, status',
        },
        'registrations': {
            'total': len(regs),
            'confirmed': confirmed,
            'waitlisted': waitlisted,
            'cancelled': cancelled,
            'overTime': over_time,
            'formula': FORMULAS['registrations'],
        },
        'attendance': {
            'checkedIn': checked_in,
            'noShows': no_shows,
            'rate': _pct(checked_in, confirmed),
            'formula': FORMULAS['attendance.rate'],
        },
        'capacity': {
            'seats': seats,
            'utilizationPercent': _pct(confirmed, seats),
            'formula': FORMULAS['capacity.utilizationPercent'],
        },
        'feedback': {
            'responses': responses,
            'averageOverall': average_overall,
            'wouldRecommendPercent': _pct(recommend, responses),
            'formula': 'averageOverall = sum(overallRating) / responses; '
                       'wouldRecommendPercent = wouldRecommend / responses * 100',
        },
        'sessions': {
            'total': len(sessions),
            'completed': completed_sessions,
            'attendedSessions': attended_sessions,
            'formula': FORMULAS['sessions.attendedSessions'],
        },
        'expenses': {
            'plannedMinor': planned_minor,
            'actualMinor': actual_minor,
            'varianceMinor': actual_minor - planned_minor,
            'variancePercent': _pct(actual_minor - planned_minor, planned_minor),
            'currency': currency,
            'byCategory': budget_rows,
            'formula': FORMULAS['expenses.variancePercent'],
        },
        'sponsors': {
            'count': len(sponsors),
            'promisedMinor': sum(int(s.promised_minor or 0) for s in sponsors),
            'receivedMinor': sum(int(s.received_minor or 0) for s in sponsors),
            'deliverablesTotal': deliverables_total,
            'deliverablesDone': deliverables_done,
            'deliverableCompletionPercent': _pct(deliverables_done, deliverables_total),
            'formula': FORMULAS['sponsors.deliverableCompletionPercent'],
        },
        'volunteers': {
            'total': len(volunteers),
            'tasksTotal': tasks_total,
            'tasksCompleted': tasks_done,
            'taskCompletionPercent': _pct(tasks_done, tasks_total),
            'formula': FORMULAS['volunteers.taskCompletionPercent'],
        },
        'competition': {
            'submissions': len(submissions),
            'scored': len(scored_ids),
            'participationRatePercent': _pct(len(scored_ids), len(submissions)),
            'formula': FORMULAS['competition.participationRatePercent'],
        },
        'retention': retention,
        'formulas': dict(FORMULAS),
    }


def _retention_for(event):
    previous = previous_edition(event)
    formula = FORMULAS['retention.percent']
    if not previous:
        return {'participantsFromPreviousEdition': None, 'percent': None,
                'note': 'No earlier edition recorded', 'previousEventId': '',
                'previousEventTitle': '', 'formula': formula}
    prev_users = {r.user_id for r in Registration.query.filter_by(event_id=previous.id).all()
                  if r.user_id and (r.status or '') in ACTIVE_STATUSES}
    this_users = {r.user_id for r in Registration.query.filter_by(event_id=event.id).all()
                  if r.user_id and (r.status or '') in ACTIVE_STATUSES}
    overlap = prev_users & this_users
    percent = _pct(len(overlap), len(prev_users))
    note = ('Returning participants from "' + (previous.title or '') + '" ('
            + str(len(prev_users)) + ' participants in that edition).')
    if not prev_users:
        note = 'Earlier edition "' + (previous.title or '') + '" has no recorded participants.'
    return {'participantsFromPreviousEdition': len(overlap), 'percent': percent,
            'note': note, 'previousEventId': previous.id,
            'previousEventTitle': previous.title or '', 'formula': formula}


# --------------------------------------------------------------------------- #
# Routes                                                                       #
# --------------------------------------------------------------------------- #

@analytics_bp.route('/analytics/events/<event_id>', methods=['GET'])
def event_analytics(event_id):
    user = current_user()
    if not user:
        return jsonify({'message': 'Authentication required.'}), 401
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if not can_manage_event(user, event):
        return jsonify({'message': 'You can only manage events you host.'}), 403
    return jsonify(_metrics_for_event(event))


COMPARE_SPECS = [
    ('registrations.total', 'registrations'),
    ('registrations.confirmed', 'registrations'),
    ('attendance.checkedIn', 'attendance'),
    ('attendance.rate', 'attendance rate'),
    ('capacity.utilizationPercent', 'capacity utilisation'),
    ('feedback.responses', 'feedback'),
    ('feedback.averageOverall', 'feedback rating'),
    ('feedback.wouldRecommendPercent', 'feedback recommendations'),
    ('sessions.total', 'sessions'),
    ('expenses.plannedMinor', 'budget'),
    ('expenses.actualMinor', 'expenses'),
    ('sponsors.receivedMinor', 'sponsor funding'),
    ('volunteers.taskCompletionPercent', 'task completion'),
    ('competition.submissions', 'submissions'),
]
DELTA_FORMULA = 'delta = valueB - valueA; deltaPercent = delta / valueA * 100'


def _dig(data, path):
    current = data
    for part in path.split('.'):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _deltas(metrics_a, metrics_b):
    deltas = []
    for path, noun in COMPARE_SPECS:
        value_a = _dig(metrics_a, path)
        value_b = _dig(metrics_b, path)
        if value_a is None or value_b is None:
            side = 'B' if value_b is None else 'A'
            deltas.append({
                'metric': path, 'valueA': value_a, 'valueB': value_b,
                'delta': None, 'deltaPercent': None, 'comparable': False,
                'reason': 'No ' + noun + ' recorded for edition ' + side,
                'formula': DELTA_FORMULA,
            })
            continue
        delta = value_b - value_a
        delta_percent = (round(delta * 100.0 / value_a, 1) if value_a else None)
        deltas.append({
            'metric': path, 'valueA': value_a, 'valueB': value_b,
            'delta': delta, 'deltaPercent': delta_percent, 'comparable': True,
            'formula': DELTA_FORMULA,
        })
    return deltas


@analytics_bp.route('/analytics/compare', methods=['GET'])
def compare_events():
    user = current_user()
    if not user:
        return jsonify({'message': 'Authentication required.'}), 401
    id_a = str(request.args.get('eventIdA') or '').strip()
    id_b = str(request.args.get('eventIdB') or '').strip()
    if not id_a or not id_b:
        return jsonify({'message': 'eventIdA and eventIdB are required.'}), 400
    event_a = Event.query.get(id_a)
    event_b = Event.query.get(id_b)
    if not event_a or not event_b:
        return jsonify({'message': 'Event not found.'}), 404
    if not can_manage_event(user, event_a) or not can_manage_event(user, event_b):
        return jsonify({'message': 'You can only compare events you host.'}), 403
    metrics_a = _metrics_for_event(event_a)
    metrics_b = _metrics_for_event(event_b)
    return jsonify({'a': metrics_a, 'b': metrics_b, 'deltas': _deltas(metrics_a, metrics_b)})


# --------------------------------------------------------------------------- #
# Natural-language query (allow-list only)                                     #
# --------------------------------------------------------------------------- #

INTENT_RULES = [
    ('registrations_over_time', ('registration over time', 'registrations over time',
                                 'registrations by day', 'registrations by date',
                                 'registration trend', 'signups over time',
                                 'when did people register', 'total registrations',
                                 'how many registrations', 'registration count')),
    ('top_sessions_by_attendance', ('top session', 'sessions by attendance', 'most attended',
                                    'best attended', 'session attendance')),
    ('compare_editions', ('compare edition', 'compare event', ' vs ', 'versus',
                          'previous edition', 'earlier edition', 'compare with last',
                          'edition comparison')),
    ('incomplete_volunteer_tasks', ('incomplete task', 'pending task', 'tasks left',
                                    'tasks remaining', 'volunteer task', 'open tasks',
                                    'unfinished task', 'tasks not done')),
    ('sponsor_deliverables_pending', ('sponsor deliverable', 'sponsorship deliverable',
                                      'deliverables pending', 'sponsor pending',
                                      'sponsor obligations', 'deliverable completion')),
    ('over_budget_activities', ('over budget', 'over-budget', 'budget overrun',
                                'budget variance', 'activities over budget',
                                'categories over budget', 'expenses over budget')),
    ('no_show_rate', ('no show', 'no-show', 'noshow', 'attendance rate', 'absent',
                      'did not attend')),
    ('feedback_averages', ('feedback', 'average rating', 'ratings', 'how did attendees',
                           'would recommend')),
    ('capacity_utilization', ('capacity', 'utilisation', 'utilization', 'seats full',
                              'how full', 'occupancy')),
]
SUPPORTED_INTENTS = [key for key, _ in INTENT_RULES]


def _detect_intent(question):
    text = _norm(question)
    if not text:
        return None
    for intent, keywords in INTENT_RULES:
        for keyword in keywords:
            if keyword in text:
                return intent
    return None


def _scope_events(user, event_id):
    """Event(s) this caller may read: the given one (manager) or their own."""
    if event_id:
        event = Event.query.get(str(event_id))
        if not event:
            return None, (jsonify({'message': 'Event not found.'}), 404)
        if not can_manage_event(user, event):
            return None, (jsonify({'message': 'You can only manage events you host.'}), 403)
        return [event], None
    if is_admin(user):
        return Event.query.order_by(Event.created_at.desc()).all(), None
    return Event.query.filter_by(host_id=user.id).all(), None


def _answer_registrations_over_time(event_ids):
    regs = Registration.query.filter(Registration.event_id.in_(event_ids)).all() if event_ids else []
    by_date = {}
    for row in regs:
        stamp = row.registered_at
        key = stamp.strftime('%Y-%m-%d') if stamp else 'unknown'
        by_date[key] = by_date.get(key, 0) + 1
    over = [{'date': k, 'count': v} for k, v in sorted(by_date.items())]
    confirmed = sum(1 for r in regs if (r.status or '') in ACTIVE_STATUSES)
    metrics = {'total': len(regs), 'confirmed': confirmed, 'byDate': over}
    formulae = {'byDate': 'count of registration rows grouped by date(registered_at)',
                'confirmed': "registration status in ('Confirmed', 'Registered')"}
    if not regs:
        return 'No registrations recorded yet.', metrics, formulae
    peak = max(over, key=lambda item: item['count'])
    answer = (str(len(regs)) + ' registration(s) across ' + str(len(over)) + ' day(s); peak '
              + peak['date'] + ' with ' + str(peak['count']) + '.')
    return answer, metrics, formulae


def _answer_top_sessions(event_ids):
    logs = AttendanceLog.query.filter(AttendanceLog.event_id.in_(event_ids)).all() if event_ids else []
    counts = {}
    for log in logs:
        key = (log.session or '').strip() or 'Unassigned'
        counts[key] = counts.get(key, 0) + 1
    top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
    metrics = {
        'totalCheckIns': len(logs),
        'sessions': [{'session': k, 'count': v} for k, v in top],
        'topSession': top[0][0] if top else None,
        'topSessionCount': top[0][1] if top else 0,
    }
    formulae = {'sessions': 'count of attendance logs grouped by session label',
                'topSession': 'session with the highest check-in count'}
    if not top:
        return 'No attendance has been logged yet.', metrics, formulae
    answer = ('Most attended session: "' + top[0][0] + '" with ' + str(top[0][1])
              + ' check-in(s). Top ' + str(len(top)) + ': '
              + ', '.join(name + ' (' + str(count) + ')' for name, count in top) + '.')
    return answer, metrics, formulae


def _answer_over_budget(event_ids):
    rows = _budget_rows(event_ids) if event_ids else []
    over = [r for r in rows if r['actualMinor'] > r['plannedMinor']]
    metrics = {
        'categories': rows,
        'categoryCount': len(rows),
        'overBudgetCount': len(over),
        'totalPlannedMinor': sum(r['plannedMinor'] for r in rows),
        'totalActualMinor': sum(r['actualMinor'] for r in rows),
        'currency': rows[0]['currency'] if rows else 'INR',
    }
    formulae = {'variancePercent': FORMULAS['expenses.variancePercent'],
                'overBudgetCount': 'categories where actualMinor > plannedMinor'}
    if not rows:
        return 'No budget categories have been recorded yet.', metrics, formulae
    if not over:
        return ('All ' + str(len(rows)) + ' budget categories are within plan ('
                + fmt(metrics['totalActualMinor'], metrics['currency']) + ' of '
                + fmt(metrics['totalPlannedMinor'], metrics['currency']) + ' planned).'), metrics, formulae
    worst = max(over, key=lambda r: r['actualMinor'] - r['plannedMinor'])
    answer = (str(len(over)) + ' of ' + str(len(rows)) + ' categories are over budget. Biggest: '
              + worst['name'] + ' at ' + fmt(worst['actualMinor'], worst['currency']) + ' vs '
              + fmt(worst['plannedMinor'], worst['currency']) + ' planned ('
              + str(worst['variancePercent']) + '%).')
    return answer, metrics, formulae


def _answer_incomplete_tasks(event_ids):
    tasks = Task.query.filter(Task.event_id.in_(event_ids)).all() if event_ids else []
    open_tasks = [t for t in tasks if (t.status or '') not in ('Done', 'Cancelled')]
    volunteer_open = [t for t in open_tasks if (t.assignee_type or '') == 'volunteer']
    metrics = {
        'total': len(tasks),
        'incomplete': len(open_tasks),
        'volunteerIncomplete': len(volunteer_open),
        'tasks': [{'id': t.id, 'title': t.title or '', 'status': t.status or '',
                   'assigneeName': t.assignee_name or '', 'assigneeType': t.assignee_type or ''}
                  for t in open_tasks[:20]],
    }
    formulae = {'incomplete': "tasks with status not in ('Done', 'Cancelled')",
                'volunteerIncomplete': "incomplete tasks with assignee_type = 'volunteer'"}
    if not tasks:
        return 'No tasks have been created yet.', metrics, formulae
    answer = (str(len(open_tasks)) + ' of ' + str(len(tasks)) + ' tasks are incomplete ('
              + str(len(volunteer_open)) + ' assigned to volunteers).')
    return answer, metrics, formulae


def _answer_sponsor_deliverables(event_ids):
    sponsors = Sponsor.query.filter(Sponsor.event_id.in_(event_ids)).all() if event_ids else []
    pending, total, done = [], 0, 0
    for sponsor in sponsors:
        for item in (sponsor.deliverables or []):
            total += 1
            if item.get('done'):
                done += 1
            else:
                pending.append({'sponsor': sponsor.name or '',
                                'title': str(item.get('title') or item.get('name') or ''),
                                'due': str(item.get('due') or '')})
    metrics = {'sponsors': len(sponsors), 'deliverablesTotal': total,
               'deliverablesDone': done, 'deliverablesPending': len(pending),
               'pending': pending[:20],
               'completionPercent': _pct(done, total)}
    formulae = {'completionPercent': FORMULAS['sponsors.deliverableCompletionPercent'],
                'deliverablesPending': 'deliverables where done is falsy'}
    if not sponsors:
        return 'No sponsors recorded yet.', metrics, formulae
    if not total:
        return str(len(sponsors)) + ' sponsor(s) recorded with no deliverables tracked.', metrics, formulae
    answer = (str(done) + ' of ' + str(total) + ' sponsor deliverables complete; '
              + str(len(pending)) + ' still pending.')
    return answer, metrics, formulae


def _answer_no_show_rate(event_ids):
    regs = Registration.query.filter(Registration.event_id.in_(event_ids)).all() if event_ids else []
    logs = AttendanceLog.query.filter(AttendanceLog.event_id.in_(event_ids)).all() if event_ids else []
    confirmed_rows = [r for r in regs if (r.status or '') in ACTIVE_STATUSES]
    log_reg_ids = {l.registration_id for l in logs if l.registration_id}
    log_user_ids = {l.user_id for l in logs if l.user_id}
    checked_in = sum(1 for r in confirmed_rows
                     if r.id in log_reg_ids or r.user_id in log_user_ids
                     or (r.attendance_status or '') in ('Checked in', 'Exception'))
    confirmed = len(confirmed_rows)
    no_shows = max(0, confirmed - checked_in)
    metrics = {'confirmed': confirmed, 'checkedIn': checked_in, 'noShows': no_shows,
               'attendanceRate': _pct(checked_in, confirmed),
               'noShowRate': _pct(no_shows, confirmed)}
    formulae = {'attendanceRate': FORMULAS['attendance.rate'],
                'noShowRate': 'noShows / confirmed * 100'}
    if not confirmed:
        return 'No confirmed registrations to measure.', metrics, formulae
    answer = (str(no_shows) + ' of ' + str(confirmed) + ' confirmed registrants did not check in ('
              + str(metrics['noShowRate']) + '% no-show; ' + str(metrics['attendanceRate'])
              + '% attendance).')
    return answer, metrics, formulae


def _answer_feedback_averages(event_ids):
    rows = Feedback.query.filter(Feedback.event_id.in_(event_ids)).all() if event_ids else []
    count = len(rows)
    def average(key):
        return round(sum((getattr(f, key) or 0) for f in rows) / count, 1) if count else None
    recommend = sum(1 for f in rows if f.would_recommend)
    metrics = {'responses': count, 'averageOverall': average('overall_rating'),
               'averageContent': average('content_rating'),
               'averageOrganization': average('organization_rating'),
               'averageVenue': average('venue_rating'),
               'wouldRecommendPercent': _pct(recommend, count)}
    formulae = {'averageOverall': FORMULAS['feedback.averageOverall'],
                'wouldRecommendPercent': FORMULAS['feedback.wouldRecommendPercent']}
    if not count:
        return 'No feedback has been recorded yet.', metrics, formulae
    answer = (str(count) + ' feedback response(s); overall ' + str(metrics['averageOverall'])
              + '/5, content ' + str(metrics['averageContent']) + '/5, organisation '
              + str(metrics['averageOrganization']) + '/5, venue ' + str(metrics['averageVenue'])
              + '/5; ' + str(metrics['wouldRecommendPercent']) + '% would recommend.')
    return answer, metrics, formulae


def _answer_capacity_utilization(events):
    per_event = []
    for event in events:
        regs = Registration.query.filter(
            Registration.event_id == event.id,
            Registration.status.in_(list(ACTIVE_STATUSES))).count()
        seats = int(event.seats or event.capacity_num or 0)
        per_event.append({'eventId': event.id, 'title': event.title or '', 'seats': seats,
                          'confirmed': regs, 'utilizationPercent': _pct(regs, seats)})
    seats = sum(row['seats'] for row in per_event)
    confirmed = sum(row['confirmed'] for row in per_event)
    metrics = {'seats': seats, 'confirmed': confirmed,
               'utilizationPercent': _pct(confirmed, seats), 'events': per_event}
    formulae = {'utilizationPercent': FORMULAS['capacity.utilizationPercent']}
    if not per_event:
        return 'No events to measure capacity for.', metrics, formulae
    answer = (str(confirmed) + ' of ' + str(seats) + ' seats filled ('
              + str(metrics['utilizationPercent']) + '%).')
    return answer, metrics, formulae


def _answer_compare_editions(events, primary=None):
    pair = None
    if primary is not None:
        prev = previous_edition(primary, pool=Event.query.all())
        pair = (primary, prev) if prev else None
    if pair is None:
        for candidate in events:
            prev = previous_edition(candidate, pool=Event.query.all())
            if prev:
                pair = (candidate, prev)
                break
    if pair is None:
        return 'No earlier edition recorded for these events yet.', {}, {}
    current, previous = pair
    metrics_current = _metrics_for_event(current)
    metrics_previous = _metrics_for_event(previous)
    deltas = _deltas(metrics_current, metrics_previous)
    metrics = {'current': metrics_current, 'previous': metrics_previous,
               'deltas': deltas}
    formulae = dict(FORMULAS)
    comparable = [d for d in deltas if d['comparable']]
    highlights = []
    for delta in comparable[:3]:
        highlights.append(delta['metric'] + ' ' + str(delta['valueA']) + ' -> '
                          + str(delta['valueB']))
    answer = ('Compared "' + (current.title or '') + '" with earlier edition "'
              + (previous.title or '') + '": ' + ('; '.join(highlights) if highlights else 'no comparable metrics')
              + '.')
    return answer, metrics, formulae


INTENT_HANDLERS = {
    'registrations_over_time': lambda events, primary: _answer_registrations_over_time([e.id for e in events]),
    'top_sessions_by_attendance': lambda events, primary: _answer_top_sessions([e.id for e in events]),
    'compare_editions': lambda events, primary: _answer_compare_editions(events, primary),
    'incomplete_volunteer_tasks': lambda events, primary: _answer_incomplete_tasks([e.id for e in events]),
    'sponsor_deliverables_pending': lambda events, primary: _answer_sponsor_deliverables([e.id for e in events]),
    'over_budget_activities': lambda events, primary: _answer_over_budget([e.id for e in events]),
    'no_show_rate': lambda events, primary: _answer_no_show_rate([e.id for e in events]),
    'feedback_averages': lambda events, primary: _answer_feedback_averages([e.id for e in events]),
    'capacity_utilization': lambda events, primary: _answer_capacity_utilization(events),
}


@analytics_bp.route('/analytics/query', methods=['POST'])
@require_auth
def analytics_query():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    question = str(payload.get('question') or payload.get('prompt') or '').strip()
    event_id = str(payload.get('eventId') or '').strip()

    events, denied = _scope_events(user, event_id)
    if denied:
        return denied
    if not question:
        return jsonify({'message': 'Ask a question first.',
                        'supported': SUPPORTED_INTENTS}), 400

    intent = _detect_intent(question)
    if not intent:
        return jsonify({
            'message': 'That question is not in the supported analytics set.',
            'supported': SUPPORTED_INTENTS,
        }), 400

    primary = events[0] if (event_id and events) else None
    if not events:
        return jsonify({'intent': intent,
                        'answer': 'No events are available to you to analyse yet.',
                        'metrics': {}, 'formulae': {}})
    answer, metrics, formulae = INTENT_HANDLERS[intent](events, primary)
    return jsonify({'intent': intent, 'answer': answer,
                    'metrics': metrics, 'formulae': formulae})


# --------------------------------------------------------------------------- #
# Insights                                                                     #
# --------------------------------------------------------------------------- #

def _provider_configured():
    try:
        from utils import ai_provider
        return bool(ai_provider.is_configured())
    except Exception:
        return False


def _phrase_with_provider(metrics, fallback):
    """Optional: rephrase ALREADY computed numbers. Any failure keeps the
    deterministic text. The provider only ever sees the scalar numbers."""
    if not _provider_configured():
        return None
    try:
        from utils import ai_provider
        numbers = {}
        for group, value in metrics.items():
            if isinstance(value, dict):
                for key, item in value.items():
                    if isinstance(item, (int, float, bool)) or item is None:
                        numbers[group + '.' + key] = item
        prompt = ('Rewrite these event metrics as one short paragraph. Use only '
                  'these numbers: ' + json.dumps(numbers, sort_keys=True, default=str))
        for name in ('phrase', 'complete', 'generate', 'respond', 'ask'):
            fn = getattr(ai_provider, name, None)
            if callable(fn):
                text = fn(prompt)
                if isinstance(text, dict):
                    text = (text.get('text') or text.get('answer')
                            or text.get('response') or text.get('result'))
                if isinstance(text, str) and text.strip():
                    return text.strip()
    except Exception:
        return None
    return None


def _has_any_data(metrics):
    checks = [
        metrics['registrations']['total'],
        metrics['attendance']['checkedIn'],
        metrics['sessions']['total'],
        metrics['feedback']['responses'],
        metrics['expenses']['plannedMinor'],
        metrics['expenses']['actualMinor'],
        metrics['sponsors']['count'],
        metrics['volunteers']['total'],
        metrics['volunteers']['tasksTotal'],
        metrics['competition']['submissions'],
    ]
    return any(bool(value) for value in checks)


def _deterministic_insight(event, metrics):
    regs = metrics['registrations']
    att = metrics['attendance']
    cap = metrics['capacity']
    fb = metrics['feedback']
    exp = metrics['expenses']
    vol = metrics['volunteers']
    sp = metrics['sponsors']
    comp = metrics['competition']

    confirmed = regs['confirmed']
    parts = [str(confirmed) + ' confirmed registration(s)']
    if att['rate'] is not None:
        parts.append(str(att['checkedIn']) + ' checked in (' + str(att['rate']) + '%)')
    parts.append(str(fb['responses']) + ' feedback response(s)')
    lines = [(event.title or 'Event') + ': ' + ', '.join(parts) + '.']

    if confirmed and att['rate'] is not None and att['rate'] < 70:
        lines.append('Attendance vs registration gap: ' + str(confirmed - att['checkedIn'])
                     + ' confirmed registrant(s) never checked in ('
                     + str(att['rate']) + '% attendance, below the 70% mark).')
    if cap['utilizationPercent'] is not None and cap['utilizationPercent'] >= 90:
        lines.append('Capacity is nearly exhausted at ' + str(cap['utilizationPercent'])
                     + '% of ' + str(cap['seats']) + ' seats.')

    over = [row for row in exp['byCategory']
            if row['actualMinor'] > row['plannedMinor']]
    if over:
        worst = max(over, key=lambda row: row['actualMinor'] - row['plannedMinor'])
        lines.append(str(len(over)) + ' budget category(ies) are over plan; the largest is '
                     + worst['name'] + ' at ' + fmt(worst['actualMinor'], exp['currency'])
                     + ' against ' + fmt(worst['plannedMinor'], exp['currency']) + ' planned.')
    elif exp['variancePercent'] is not None and exp['variancePercent'] > 0:
        lines.append('Spending is ' + str(exp['variancePercent'])
                     + '% above the planned budget overall.')

    if fb['responses'] == 0:
        lines.append('No feedback has been recorded yet, so satisfaction is unknown.')
    else:
        if fb['averageOverall'] is not None and fb['averageOverall'] < 3.5:
            lines.append('Feedback is soft: ' + str(fb['averageOverall'])
                         + '/5 average across ' + str(fb['responses']) + ' response(s).')
        if (fb['wouldRecommendPercent'] is not None
                and fb['wouldRecommendPercent'] < 60):
            lines.append('Only ' + str(fb['wouldRecommendPercent'])
                         + '% of respondents would recommend the event.')

    if vol['tasksTotal']:
        if vol['tasksCompleted'] < vol['tasksTotal']:
            lines.append(str(vol['tasksTotal'] - vol['tasksCompleted']) + ' of '
                         + str(vol['tasksTotal']) + ' operational tasks are still open ('
                         + str(vol['taskCompletionPercent']) + '% complete).')
        else:
            lines.append('All ' + str(vol['tasksTotal']) + ' operational tasks are complete.')

    if sp['deliverablesTotal'] and (sp['deliverablesDone'] or 0) < sp['deliverablesTotal']:
        lines.append(str(sp['deliverablesTotal'] - sp['deliverablesDone'])
                     + ' sponsor deliverable(s) are still outstanding ('
                     + str(sp['deliverableCompletionPercent']) + '% delivered).')

    if comp['submissions'] and comp['scored'] < comp['submissions']:
        lines.append(str(comp['submissions'] - comp['scored']) + ' of '
                     + str(comp['submissions']) + ' submissions are still unscored.')

    if len(lines) == 1:
        lines.append('No attendance, budget, feedback, task or sponsor exceptions were detected.')

    return ' '.join(lines)


@analytics_bp.route('/ai/insights', methods=['POST'])
def event_insights():
    user = current_user()
    if not user:
        return jsonify({'message': 'Authentication required.'}), 401
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '').strip()
    if not event_id:
        return jsonify({'message': 'eventId is required.'}), 400
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if not can_manage_event(user, event):
        return jsonify({'message': 'You can only manage events you host.'}), 403

    metrics = _metrics_for_event(event)
    if not _has_any_data(metrics):
        return jsonify({'message': 'No event data to summarise yet.'}), 404

    insight = _deterministic_insight(event, metrics)
    phrased = _phrase_with_provider(metrics, insight)
    if phrased:
        insight = phrased
    return jsonify({'insight': insight, 'metricsUsed': metrics, 'source': 'computed'})
