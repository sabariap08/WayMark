"""Certificate eligibility, batch issuing, achievement sync and the profile
achievement list.

Eligibility is ALWAYS computed in the backend from authoritative rows
(AttendanceLog, Session, Score/Submission, Volunteer, Registration). No AI
helper is consulted anywhere in this module.
"""
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import (Achievement, AttendanceLog, Certificate, EventType,
                    PlatformSetting, Registration, Score, Session, Submission,
                    User, Volunteer)
from utils.helpers import audit, credential_code, notify, parse_bool
from utils.security import current_user, require_auth, require_event_manager
from utils.serializers import achievement_json, certificate_json

achievements_bp = Blueprint('achievements', __name__)

ACTIVE_STATUSES = ('Confirmed', 'Registered')
VOLUNTEER_ACTIVE_STATUSES = ('Confirmed', 'Active')
REQUIRED_SESSION_TYPES = ('Workshop', 'Contest', 'Paper presentation')

ALLOWED_RULES = (
    'verified_attendance',
    'session_attendance',
    'workshop_completion',
    'result_rank',
    'presentation',
    'volunteer_service',
)
DEFAULT_RULES = ['verified_attendance']


def _norm(value):
    return ' '.join(str(value or '').lower().split())


def _logs_for(reg, ctx):
    rows, seen = [], set()
    for key in (reg.user_id, reg.id):
        if not key:
            continue
        for log in ctx['logs_by_key'].get(key, []):
            if log.id not in seen:
                seen.add(log.id)
                rows.append(log)
    return rows


def _session_matches(log_session, session_row):
    a, b = _norm(log_session), _norm(session_row.title)
    if not a or not b:
        return False
    return a == b or b in a or a in b


def _name_matches(text, name):
    a, b = _norm(text), _norm(name)
    if not a or not b:
        return False
    if a == b:
        return True
    return len(a) >= 3 and len(b) >= 3 and (b in a or a in b)


def resolve_rules(event):
    """event.config -> event type config -> ['verified_attendance']."""
    cfg = event.config if isinstance(getattr(event, 'config', None), dict) else {}
    cert_cfg = cfg.get('certificates')
    if isinstance(cert_cfg, dict) and isinstance(cert_cfg.get('rules'), list):
        return [str(r) for r in cert_cfg['rules']]
    if event.event_type:
        row = EventType.query.filter_by(name=event.event_type).first()
        type_cfg = getattr(row, 'config', None) if row else None
        if isinstance(type_cfg, dict):
            type_cert = type_cfg.get('certificates')
            if isinstance(type_cert, dict) and isinstance(type_cert.get('rules'), list):
                return [str(r) for r in type_cert['rules']]
    return list(DEFAULT_RULES)


def _platform_issuer():
    try:
        row = PlatformSetting.query.get(1)
        data = getattr(row, 'data', None) if row else None
        if isinstance(data, dict) and data.get('certificateIssuer'):
            return str(data['certificateIssuer'])
    except Exception:
        pass
    return 'WayMark Events'


def _event_context(event):
    regs = Registration.query.filter(
        Registration.event_id == event.id,
        Registration.status.in_(list(ACTIVE_STATUSES)),
    ).order_by(Registration.registered_at.asc()).all()
    logs = AttendanceLog.query.filter_by(event_id=event.id).all()
    logs_by_key = {}
    for log in logs:
        if log.user_id:
            logs_by_key.setdefault(log.user_id, []).append(log)
        if log.registration_id:
            logs_by_key.setdefault(log.registration_id, []).append(log)
    sessions = Session.query.filter_by(event_id=event.id).all()
    submissions = Submission.query.filter_by(event_id=event.id).all()
    scores = Score.query.filter_by(event_id=event.id).all()
    volunteers = Volunteer.query.filter_by(event_id=event.id).all()

    totals = {}
    for score in scores:
        totals[score.submission_id] = totals.get(score.submission_id, 0) + (score.total or 0)
    ranked_subs = sorted(submissions, key=lambda s: totals.get(s.id, 0), reverse=True)
    ranked = {sub.id: index + 1 for index, sub in enumerate(ranked_subs)}

    return {
        'registrations': regs,
        'logs_by_key': logs_by_key,
        'sessions': sessions,
        'required_sessions': [s for s in sessions if (s.session_type or '') in REQUIRED_SESSION_TYPES],
        'submissions': submissions,
        'ranked': ranked,
        'volunteers': volunteers,
    }


def _rule_verified_attendance(event, reg, ctx):
    logs = _logs_for(reg, ctx)
    if logs:
        return True, 'Attendance recorded (' + str(len(logs)) + ' check-in log(s)).'
    status = reg.attendance_status or 'Registered'
    if status in ('Checked in', 'Exception'):
        return True, 'Registration attendance status is "' + status + '".'
    return False, 'No attendance log and registration status is "' + status + '".'


def _rule_session_attendance(event, reg, ctx):
    required = ctx['required_sessions']
    if not required:
        ok, detail = _rule_verified_attendance(event, reg, ctx)
        return ok, ('No required sessions scheduled; ' + detail if ok
                    else 'No required sessions scheduled and ' + detail)
    logs = _logs_for(reg, ctx)
    missing = [s.title for s in required
               if not any(_session_matches(log.session, s) for log in logs)]
    if not missing:
        return True, 'Attended all ' + str(len(required)) + ' required sessions.'
    return False, 'Missing required session(s): ' + ', '.join(missing) + '.'


def _rule_workshop_completion(event, reg, ctx):
    logs = _logs_for(reg, ctx)
    for log in logs:
        if 'workshop' in _norm(log.session):
            return True, 'Workshop check-in "' + (log.session or '') + '".'
    for session_row in ctx['sessions']:
        if 'workshop' in _norm(session_row.session_type) and any(
                _session_matches(log.session, session_row) for log in logs):
            return True, 'Attended workshop session "' + session_row.title + '".'
    has_workshops = any('workshop' in _norm(s.session_type) for s in ctx['sessions'])
    if not has_workshops:
        return False, 'No workshop sessions are scheduled for this event.'
    return False, 'No workshop attendance recorded for this registrant.'


def _rule_result_rank(event, reg, ctx):
    if not event.results_released:
        return False, 'Results have not been released yet.'
    matches = [sub for sub in ctx['submissions'] if _name_matches(sub.team_name, reg.user_name)]
    if not matches:
        return False, 'No submission matches this registrant, so they are not in the results.'
    best = min(ctx['ranked'].get(sub.id, 10 ** 6) for sub in matches)
    if best <= 3:
        return True, 'Ranked #' + str(best) + ' in the released results.'
    return False, 'Finished ranked #' + str(best) + ' (top 3 required).'


def _rule_presentation(event, reg, ctx):
    for sub in ctx['submissions']:
        if _name_matches(sub.team_name, reg.user_name):
            return True, 'Submission "' + (sub.team_name or sub.project_title) + '" matches this registrant.'
    category = _norm(reg.category)
    if 'paper' in category or 'presentation' in category:
        return True, 'Registration category "' + (reg.category or '') + '" is a presentation entry.'
    return False, 'No matching submission and registration category is "' + (reg.category or 'none') + '".'


def _rule_volunteer_service(event, reg, ctx):
    for vol in ctx['volunteers']:
        if (vol.status or '') not in VOLUNTEER_ACTIVE_STATUSES:
            continue
        same_email = _norm(vol.email) and _norm(vol.email) == _norm(reg.user_email)
        same_name = _name_matches(vol.name, reg.user_name)
        if same_email or same_name:
            return True, 'Confirmed volunteer record (' + (vol.status or '') + ') for "' + (vol.name or '') + '".'
    return False, 'No confirmed/active volunteer record for this registrant.'


RULE_EVALUATORS = {
    'verified_attendance': _rule_verified_attendance,
    'session_attendance': _rule_session_attendance,
    'workshop_completion': _rule_workshop_completion,
    'result_rank': _rule_result_rank,
    'presentation': _rule_presentation,
    'volunteer_service': _rule_volunteer_service,
}


def _evaluate(event, reg, ctx, rules):
    reasons, missing, evaluations = [], [], {}
    for rule in rules:
        fn = RULE_EVALUATORS.get(rule)
        if fn is None:
            evaluations[rule] = {'supported': False, 'passed': None,
                                 'detail': 'Unsupported rule key - ignored.'}
            continue
        passed, detail = fn(event, reg, ctx)
        evaluations[rule] = {'supported': True, 'passed': bool(passed), 'detail': detail}
        (reasons if passed else missing).append(rule)

    note = ''
    applicable = [r for r in rules if r in RULE_EVALUATORS]
    if not rules:
        eligible = False
        note = 'No certificate rules are configured for this event.'
    elif not applicable:
        eligible = False
        note = 'None of the configured certificate rules are supported.'
    else:
        eligible = not missing
    return {'eligible': eligible, 'reasons': reasons, 'missing': missing,
            'evaluations': evaluations, 'note': note}


@achievements_bp.route('/events/<event_id>/certificates/eligibility', methods=['GET'])
@require_event_manager('event_id')
def certificate_eligibility(event_id, _event=None):
    event = _event
    rules = resolve_rules(event)
    ctx = _event_context(event)
    rows = []
    for reg in ctx['registrations']:
        result = _evaluate(event, reg, ctx, rules)
        row = {
            'userId': reg.user_id or '',
            'name': reg.user_name or '',
            'email': reg.user_email or '',
            'registrationId': reg.id,
            'status': reg.status or '',
            'eligible': result['eligible'],
            'reasons': result['reasons'],
            'missing': result['missing'],
            'rules': rules,
            'evaluations': result['evaluations'],
        }
        if result['note']:
            row['note'] = result['note']
        rows.append(row)
    return jsonify(rows)


@achievements_bp.route('/events/<event_id>/certificates/issue-eligible', methods=['POST'])
@require_event_manager('event_id')
def issue_eligible(event_id, _event=None):
    event = _event
    payload = request.get_json(silent=True) or {}
    cert_type = str(payload.get('type') or 'Participation')
    issuer = str(payload.get('issuer') or _platform_issuer())
    rules = resolve_rules(event)
    ctx = _event_context(event)

    issued_rows, skipped = [], []
    for reg in ctx['registrations']:
        if not reg.user_id:
            skipped.append({'userId': '', 'reason': 'Registration has no linked user.'})
            continue
        result = _evaluate(event, reg, ctx, rules)
        if not result['eligible']:
            reason = ('Not eligible; missing: ' + ', '.join(result['missing'])) if result['missing'] \
                else ('Not eligible; ' + result['note'])
            skipped.append({'userId': reg.user_id, 'reason': reason})
            continue
        existing = Certificate.query.filter_by(event_id=event.id,
                                               recipient_id=reg.user_id).first()
        if existing:
            skipped.append({'userId': reg.user_id,
                            'reason': 'Certificate already issued (' + existing.credential_id + ').'})
            continue

        cert = Certificate(
            recipient_name=reg.user_name or '', recipient_id=reg.user_id,
            event_id=event.id, event_title=event.title or '',
            issue_date=datetime.utcnow().strftime('%b %d, %Y'),
            credential_id=credential_code(), issuer=issuer,
            type=cert_type, status='Valid',
        )
        db.session.add(cert)
        db.session.flush()          # one transaction: id is needed for dedupe_key
        achievement = Achievement(
            user_id=reg.user_id, event_id=event.id, event_title=event.title or '',
            kind=cert_type, title=cert_type + ' - ' + (event.title or ''),
            detail='Certificate ' + cert.credential_id + ' issued for ' + (event.title or 'the event') + '.',
            source='certificate', credential_id=cert.credential_id, shared=True,
            dedupe_key='cert:' + cert.id,
        )
        db.session.add(achievement)
        issued_rows.append((reg, cert))

    db.session.commit()

    for reg, cert in issued_rows:
        notify(reg.user_id, 'Certificate issued',
               'Your certificate for ' + (event.title or 'the event') + ' is ready.',
               'certificate')
    audit('Certificates issued (eligible batch)', current_user(),
          target=(event.title or '') + ' (' + str(len(issued_rows)) + ' issued, '
                  + str(len(skipped)) + ' skipped)')
    return jsonify({
        'issued': len(issued_rows),
        'skipped': skipped,
        'certificates': [certificate_json(cert) for _, cert in issued_rows],
    })


@achievements_bp.route('/events/<event_id>/achievements/sync', methods=['POST'])
@require_event_manager('event_id')
def sync_achievements(event_id, _event=None):
    event = _event
    created, existing = 0, 0

    regs = Registration.query.filter(
        Registration.event_id == event.id,
        Registration.status.in_(list(ACTIVE_STATUSES)),
    ).all()
    for reg in regs:
        if not reg.user_id:
            continue
        key = 'participation:' + event.id + ':' + reg.user_id
        found = Achievement.query.filter_by(dedupe_key=key).first()
        if found:
            existing += 1
            continue
        db.session.add(Achievement(
            user_id=reg.user_id, event_id=event.id, event_title=event.title or '',
            kind='Participation', title='Participated in ' + (event.title or 'the event'),
            detail=(reg.user_name or 'A participant') + ' took part in '
                   + (event.title or 'the event') + ' (' + (reg.status or 'Confirmed') + ').',
            source='attendance', shared=True, dedupe_key=key,
        ))
        created += 1

    volunteers = Volunteer.query.filter_by(event_id=event.id).all()
    for vol in volunteers:
        if (vol.status or '') not in VOLUNTEER_ACTIVE_STATUSES:
            continue
        key = 'volunteer:' + vol.id
        found = Achievement.query.filter_by(dedupe_key=key).first()
        if found:
            existing += 1
            continue
        volunteer_user = None
        if vol.email:
            volunteer_user = User.query.filter(db.func.lower(User.email) == _norm(vol.email)).first()
        if not volunteer_user and vol.name:
            volunteer_user = User.query.filter(db.func.lower(User.name) == _norm(vol.name)).first()
        db.session.add(Achievement(
            user_id=volunteer_user.id if volunteer_user else '',
            event_id=event.id, event_title=(vol.event_title or event.title or ''),
            kind='Volunteer service',
            title='Volunteer service - ' + (vol.event_title or event.title or ''),
            detail=(vol.name or 'Volunteer') + ' volunteered'
                   + ((' (' + vol.responsibility + ')') if vol.responsibility else '')
                   + ' at ' + (vol.event_title or event.title or 'the event') + '.',
            source='volunteer', shared=True, dedupe_key=key,
        ))
        created += 1

    db.session.commit()
    audit('Achievements synced', current_user(),
          target=(event.title or '') + ' (+' + str(created) + ', ' + str(existing) + ' existing)')
    return jsonify({'created': created, 'existing': existing})


@achievements_bp.route('/me/achievements', methods=['GET'])
@require_auth
def my_achievements():
    user = current_user()
    show_all = parse_bool(request.args.get('all'))
    rows = Achievement.query.filter_by(user_id=user.id) \
        .order_by(Achievement.issued_at.desc()).all()
    if not show_all:
        rows = [r for r in rows if r.shared]
    counts = {}
    for row in rows:
        counts[row.kind] = counts.get(row.kind, 0) + 1
    return jsonify({
        'achievements': [achievement_json(r) for r in rows],
        'counts': counts,
        'total': len(rows),
        'shared': sum(1 for r in rows if r.shared),
        'all': show_all,
    })


@achievements_bp.route('/achievements/summary', methods=['GET'])
@require_auth
def achievements_summary():
    user = current_user()
    rows = Achievement.query.filter_by(user_id=user.id).all()
    by_kind = {}
    for row in rows:
        by_kind[row.kind] = by_kind.get(row.kind, 0) + 1
    return jsonify({
        'total': len(rows),
        'shared': sum(1 for r in rows if r.shared),
        'byKind': by_kind,
    })


@achievements_bp.route('/achievements/<achievement_id>/share', methods=['PATCH'])
@require_auth
def share_achievement(achievement_id):
    user = current_user()
    row = Achievement.query.get(achievement_id)
    if not row:
        return jsonify({'message': 'Achievement not found.'}), 404
    if (row.user_id or '') != user.id:
        return jsonify({'message': 'You can only change sharing on your own achievements.'}), 403
    payload = request.get_json(silent=True) or {}
    if 'shared' in payload:
        row.shared = parse_bool(payload.get('shared'))
    else:
        row.shared = not row.shared
    db.session.commit()
    audit('Achievement sharing updated', user,
          target=row.title + ' (' + ('shared' if row.shared else 'private') + ')')
    return jsonify(achievement_json(row))
