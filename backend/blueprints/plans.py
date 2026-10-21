"""AI Event Co-Pilot: reviewable structured plans (AI never applies them itself)."""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import json

from flask import Blueprint, jsonify, request

from extensions import db
from models import AiLog, BudgetCategory, Event, EventPlan, Session, Task, Volunteer
from config import Config
from utils import ai_provider, plan_schema, webhooks
from utils.helpers import audit
from utils.security import current_user, is_admin, require_auth
from utils.serializers import event_plan_json

plans_bp = Blueprint("plans", __name__)


def _log_ai_call(feature: str, prompt: str, response: Any, user=None, status: str = "Success") -> AiLog:
    try:
        row = AiLog(
            feature=feature,
            user=(user.name if user else "system"),
            model=("waymark-local" if not ai_provider.is_configured() else (ai_provider.model() or ai_provider.name())),
            prompt=str(prompt)[:4000],
            response=str(response)[:8000],
            tokens=max(1, (len(str(prompt)) + len(str(response))) // 4),
            status=status,
        )
        db.session.add(row)
        db.session.commit()
        return row
    except Exception:
        return None


def _parse_rupee_budget(s: str) -> Optional[int]:
    """Extract a rupee amount from a free-text brief and return MINOR units.

    Only a figure that is explicitly tied to money is accepted: either it follows
    a currency marker (Rs./INR/rupee sign) or it follows the word 'budget'/'cost'.
    Bare numbers such as participant counts are ignored, so the caller can fall
    back to its default instead of misreading '800 participants' as 800 rupees.
    """
    import re
    if not s:
        return None
    text = str(s)
    lower = text.lower()
    scope, start_at = text, 0

    currency = re.search(r"(?:\u20b9|\b(?:rs|inr|rupees?)\.?)\s*(?:[.:,-]\s*)?", lower)
    money_word = re.search(r"\b(budget|cost|funding|funds|price|spend|allocation)\b", lower)
    if currency:
        start_at = currency.end()
    elif money_word:
        start_at = money_word.end()
    else:
        return None
    scope = text[start_at:]
    if currency is None and money_word is None:
        return None

    m = re.search(r"\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?", scope)
    if not m:
        return None
    try:
        value = float(m.group(0).replace(',', ''))
    except (TypeError, ValueError):
        return None
    tail = scope[m.end():m.end() + 16].lower()
    mult = 1
    if re.match(r"\s*(lakh|lac)", tail):
        mult = 100000
    elif re.match(r"\s*(crore|cr)\b", tail):
        mult = 10000000
    try:
        return int(round(value * mult * 100))
    except (TypeError, ValueError):
        return None


def _parse_participants(s: str) -> Optional[int]:
    if not s:
        return None
    import re

    nums = re.findall(r"\d+", s.replace(",", ""))
    if nums:
        try:
            return int(nums[0])
        except Exception:
            pass
    return None


def _extract_days(s: str) -> int:
    lower = s.lower()
    import re

    m = re.search(r"(\d+)\s*-?\s*day", lower)
    if m:
        try:
            return max(1, int(m.group(1)))
        except Exception:
            pass
    if "two" in lower and "day" in lower:
        return 2
    if "three" in lower and "day" in lower:
        return 3
    if "one" in lower and "day" in lower:
        return 1
    return 1


def _extract_location(s: str) -> Tuple[Optional[str], Optional[str]]:
    lower = s.lower()
    city = None
    if "coimbatore" in lower:
        city = "Coimbatore"
    elif "chennai" in lower:
        city = "Chennai"
    elif "bangalore" in lower or "bengaluru" in lower:
        city = "Bengaluru"
    return None, city


def _detect_category(s: str) -> str:
    lower = s.lower()
    if "hackathon" in lower:
        return "Hackathon"
    if "workshop" in lower:
        return "Workshop"
    if "symposium" in lower or "conference" in lower:
        return "Conference"
    if "competition" in lower or "contest" in lower:
        return "Competition"
    return "Community"


def _local_generate_plan(brief: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    title = payload.get("title") or " ".join(brief.split()[:8]).title()
    days = payload.get("days") or _extract_days(brief)
    participants = payload.get("participants") or _parse_participants(brief)
    budget_minor = payload.get("budget") if isinstance(payload.get("budget"), int) else _parse_rupee_budget(brief)
    if budget_minor is None:
        budget_minor = 20000000
    _, city = _extract_location(brief)
    city = payload.get("city") or city or "Coimbatore"
    loc = payload.get("location") or f"{city}, India"
    category = _detect_category(brief)
    start = datetime.now().date() + timedelta(days=7)
    end = start + timedelta(days=max(0, int(days) - 1))

    plan: Dict[str, Any] = {
        "title": title,
        "description": brief.strip(),
        "category": category,
        "format": "Offline",
        "location": loc,
        "city": city,
        "startDate": start.strftime("%Y-%m-%d"),
        "endDate": end.strftime("%Y-%m-%d"),
        "days": int(days),
        "participants": int(participants) if participants else 800,
        "budgetMinor": int(budget_minor),
        "currency": "INR",
        "registrationCategories": [{"name": "Student", "feeMinor": 0}, {"name": "Professional", "feeMinor": 50000}],
        "schedule": [],
        "activities": [],
        "expenses": [],
        "resources": [{"name": "Main Auditorium", "kind": "Room", "quantity": 1}, {"name": "Projector", "kind": "Equipment", "quantity": 2}],
        "volunteerRoles": [{"role": "Registration Desk", "count": 5, "skills": ["Communication"]}, {"role": "Technical Support", "count": 3, "skills": ["IT"]}],
        "tasks": [],
        "checklist": [],
        "communications": [
            {"type": "Invitation", "audience": "Students", "subject": f"Invitation to {title}", "body": "Join us!"},
            {"type": "Reminder", "audience": "All Registrants", "subject": f"Reminder: {title}", "body": "Don't forget!"},
        ],
        "sponsors": [{"package": "Title Sponsor", "askingMinor": 5000000}, {"package": "Gold Sponsor", "askingMinor": 2000000}],
    }

    dcount = int(days)
    for d in range(1, dcount + 1):
        plan["schedule"].append({"day": d, "startTime": "09:00", "endTime": "09:30", "title": "Registration", "type": "Registration"})
        plan["schedule"].append({"day": d, "startTime": "09:30", "endTime": "10:30", "title": "Keynote", "type": "Keynote"})
        plan["schedule"].append({"day": d, "startTime": "10:45", "endTime": "13:00", "title": "Tracks/Contests", "type": "Contest"})
        plan["schedule"].append({"day": d, "startTime": "13:00", "endTime": "14:00", "title": "Lunch", "type": "Break"})
        plan["schedule"].append({"day": d, "startTime": "14:00", "endTime": "16:00", "title": "Workshops/Activities", "type": "Workshop"})
        plan["schedule"].append({"day": d, "startTime": "16:15", "endTime": "17:30", "title": "Demos/Judging", "type": "Judging"})
        if d == dcount:
            plan["schedule"].append({"day": d, "startTime": "17:30", "endTime": "18:30", "title": "Awards & Closing", "type": "Awards"})

    lower = brief.lower()
    if "hackathon" in lower:
        plan["activities"].append({"title": "Hackathon", "type": "Hackathon", "day": 1, "startTime": "10:45", "endTime": "16:00", "expectedParticipants": plan["participants"]})
    if "paper presentation" in lower or "paper" in lower:
        plan["activities"].append({"title": "Paper Presentation", "type": "Presentation", "day": 1, "startTime": "14:00", "endTime": "16:00", "expectedParticipants": 100})
    if "coding competition" in lower or "coding" in lower or "contest" in lower:
        plan["activities"].append({"title": "Coding Competition", "type": "Contest", "day": 2 if dcount > 1 else 1, "startTime": "10:45", "endTime": "13:00", "expectedParticipants": 200})
    if "workshop" in lower:
        plan["activities"].append({"title": "Workshop", "type": "Workshop", "day": 1, "startTime": "14:00", "endTime": "16:00", "expectedParticipants": 150})
    if "sponsor" in lower:
        plan["activities"].append({"title": "Sponsor Activities", "type": "Networking", "day": 1, "startTime": "09:30", "endTime": "10:30", "expectedParticipants": 50})
    if not plan["activities"]:
        plan["activities"].append({"title": "Technical Sessions", "type": "Talk", "day": 1, "startTime": "10:45", "endTime": "16:00", "expectedParticipants": plan["participants"]})

    try:
        from seed import DEFAULT_EVENT_TYPE_CONFIGS

        cats = DEFAULT_EVENT_TYPE_CONFIGS.get(category, {}).get("defaultBudgetCategories", ["Miscellaneous"])
    except Exception:
        cats = ["Venue", "Food & Beverages", "Prizes", "Logistics", "Miscellaneous"]
    total = plan["budgetMinor"]
    per = total // max(1, len(cats))
    rem = total - per * len(cats)
    for i, c in enumerate(cats):
        amt = per + (rem if i == len(cats) - 1 else 0)
        plan["expenses"].append({"category": c, "amountMinor": amt})

    plan["tasks"] = [
        {"title": "Finalize Venue", "dueDay": 0},
        {"title": "Invite Speakers", "dueDay": 7},
        {"title": "Open Registration", "dueDay": 14},
        {"title": "Collect Submissions", "dueDay": 21},
        {"title": "Final Arrangements", "dueDay": 0},
    ]
    plan["checklist"] = [
        {"label": "Venue Booked", "dueDay": 0},
        {"label": "Speakers Confirmed", "dueDay": 7},
        {"label": "Volunteers Recruited", "dueDay": 14},
        {"label": "Marketing Done", "dueDay": 21},
        {"label": "All Set", "dueDay": 0},
    ]

    return plan



@plans_bp.route('/ai/status', methods=['GET'])
def ai_status():
    configured = ai_provider.is_configured()
    provider = 'local'
    model = ''
    if configured:
        provider = ai_provider.name()
        model = ai_provider.model() or ''
    note = 'Local generator in use  no AI provider configured.' if not configured else ''
    if not configured:
        provider = 'local'
    return jsonify({
        'provider': provider,
        'configured': bool(configured),
        'model': model,
        'features': {
            'planGeneration': True,
            'scheduleDraft': True,
            'taskDraft': True,
            'communicationDraft': True,
            'insights': True,
        },
        'note': note,
    })


@plans_bp.route('/plans/generate', methods=['POST'])
@require_auth
def generate_plan():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    brief = str(payload.get('brief') or '').strip()
    if not brief:
        return jsonify({'message': 'Brief is required.'}), 400

    plan = _local_generate_plan(brief, payload)
    validation = plan_schema.validate_plan(plan)

    provider_used = 'local'
    if ai_provider.is_configured():
        try:
            sys_p = 'You are an event planning assistant. Return ONLY valid JSON matching the event plan schema.'
            user_p = f'Brief: {brief}\nPayload: {json.dumps(payload)}'
            res = ai_provider.complete_json(sys_p, user_p)
            if isinstance(res, dict) and res.get('title'):
                v2 = plan_schema.validate_plan(res)
                if v2.get('valid'):
                    plan = res
                    validation = v2
                    provider_used = ai_provider.name()
        except Exception:
            pass

    ep = EventPlan(
        user_id=user.id if user else '',
        title=plan.get('title') or '',
        brief=brief,
        plan=plan,
        validation=validation,
        status='Draft',
        provider=provider_used,
    )
    db.session.add(ep)
    db.session.commit()
    _log_ai_call('plan-generate', brief, {'planId': ep.id}, user)
    return jsonify({'planId': ep.id, 'plan': plan, 'validation': validation, 'provider': provider_used})


@plans_bp.route('/plans', methods=['GET'])
@require_auth
def list_plans():
    user = current_user()
    allq = request.args.get('all')
    q = EventPlan.query
    if is_admin(user) and allq == '1':
        pass
    else:
        q = q.filter_by(user_id=user.id if user else '')
    rows = q.order_by(EventPlan.created_at.desc()).all()
    return jsonify([event_plan_json(r) for r in rows])


@plans_bp.route('/plans/<plan_id>', methods=['GET'])
@require_auth
def get_plan(plan_id):
    user = current_user()
    row = EventPlan.query.get(plan_id)
    if not row:
        return jsonify({'message': 'Plan not found.'}), 404
    if not (is_admin(user) or (user and row.user_id == user.id)):
        return jsonify({'message': 'You do not have permission for this action.'}), 403
    return jsonify(event_plan_json(row))


@plans_bp.route('/plans/<plan_id>', methods=['PUT', 'PATCH'])
@require_auth
def update_plan(plan_id):
    user = current_user()
    row = EventPlan.query.get(plan_id)
    if not row:
        return jsonify({'message': 'Plan not found.'}), 404
    if not (user and row.user_id == user.id):
        return jsonify({'message': 'You do not have permission for this action.'}), 403
    payload = request.get_json(silent=True) or {}
    plan = payload.get('plan') if isinstance(payload.get('plan'), dict) else row.plan
    if isinstance(plan, dict):
        row.plan = plan
    validation = plan_schema.validate_plan(row.plan if isinstance(row.plan, dict) else {})
    row.validation = validation
    if row.status != 'Applied':
        row.status = 'Draft'
    row.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(event_plan_json(row))


@plans_bp.route('/plans/<plan_id>/preview', methods=['POST'])
@require_auth
def preview_plan(plan_id):
    user = current_user()
    row = EventPlan.query.get(plan_id)
    if not row:
        return jsonify({'message': 'Plan not found.'}), 404
    if not (user and row.user_id == user.id):
        return jsonify({'message': 'You do not have permission for this action.'}), 403
    plan = row.plan if isinstance(row.plan, dict) else {}
    start = plan.get('startDate') or ''
    end = plan.get('endDate') or start
    event = {'title': plan.get('title') or row.title, 'description': plan.get('description') or row.brief, 'category': plan.get('category') or 'Community', 'location': plan.get('location') or '', 'startDate': start, 'endDate': end, 'date': start, 'time': '', 'seats': plan.get('participants') or 100, 'status': 'Draft', 'hostId': user.id, 'hostName': user.name}
    sessions = []
    for i, s in enumerate(plan.get('schedule') or []):
        if isinstance(s, dict):
            sessions.append({'title': s.get('title') or f'Session {i+1}', 'day': s.get('day'), 'startTime': s.get('startTime'), 'endTime': s.get('endTime'), 'type': s.get('type') or 'Talk'})
    tasks = []
    for i, t in enumerate(plan.get('tasks') or []):
        if isinstance(t, dict):
            tasks.append({'title': t.get('title') or f'Task {i+1}', 'dueDay': t.get('dueDay'), 'priority': t.get('priority') or 'Normal'})
    budget_cats = []
    for i, e in enumerate(plan.get('expenses') or []):
        if isinstance(e, dict):
            budget_cats.append({'name': e.get('category') or f'Category {i+1}', 'plannedMinor': e.get('amountMinor') or 0, 'currency': plan.get('currency') or 'INR'})
    volunteers = []
    for i, v in enumerate(plan.get('volunteerRoles') or []):
        if isinstance(v, dict):
            volunteers.append({'role': v.get('role') or f'Role {i+1}', 'count': v.get('count') or 1, 'skills': v.get('skills') or []})
    return jsonify({'event': event, 'sessions': sessions, 'tasks': tasks, 'budgetCategories': budget_cats, 'volunteers': volunteers})


@plans_bp.route('/plans/<plan_id>/approve', methods=['POST'])
@require_auth
def approve_plan(plan_id):
    user = current_user()
    row = EventPlan.query.get(plan_id)
    if not row:
        return jsonify({'message': 'Plan not found.'}), 404
    if not (user and row.user_id == user.id):
        return jsonify({'message': 'You do not have permission for this action.'}), 403
    if row.status == 'Applied':
        return jsonify({'message': 'Plan already applied.'}), 409
    validation = plan_schema.validate_plan(row.plan if isinstance(row.plan, dict) else {})
    row.validation = validation
    if not validation.get('valid'):
        db.session.commit()
        return jsonify({'message': 'Plan validation failed.', 'errors': validation.get('errors') or []}), 400

    plan = row.plan if isinstance(row.plan, dict) else {}
    try:
        event = Event(title=plan.get('title') or row.title or 'Event', description=plan.get('description') or row.brief or '', category=plan.get('category') or 'Community', host_id=user.id, host_name=user.name or '', location=plan.get('location') or '', status='Draft', approval_status='Draft', seats=plan.get('participants') or 100, capacity_num=plan.get('participants') or 100, start_date=plan.get('startDate') or '', end_date=plan.get('endDate') or plan.get('startDate') or '', date=plan.get('startDate') or '', event_type=plan.get('category') or '', format=plan.get('format') or 'Offline', currency=plan.get('currency') or 'INR')
        db.session.add(event)
        db.session.flush()

        sessions_created = 0
        for s in plan.get('schedule') or []:
            if isinstance(s, dict):
                day_str = plan.get('startDate') or ''
                if isinstance(s.get('day'), int) and plan.get('startDate'):
                    try:
                        d0 = datetime.strptime(plan['startDate'], '%Y-%m-%d').date()
                        day_str = (d0 + timedelta(days=s['day'] - 1)).strftime('%Y-%m-%d')
                    except Exception:
                        day_str = plan.get('startDate') or str(s.get('day'))
                sess = Session(event_id=event.id, title=s.get('title') or 'Session', description=s.get('description') or '', session_type=s.get('type') or 'Talk', day=day_str, start_time=s.get('startTime') or '', end_time=s.get('endTime') or '', status='Draft')
                db.session.add(sess)
                sessions_created += 1

        tasks_created = 0
        for t in plan.get('tasks') or []:
            if isinstance(t, dict):
                due_at = None
                if plan.get('startDate') and isinstance(t.get('dueDay'), int):
                    try:
                        d0 = datetime.strptime(plan['startDate'], '%Y-%m-%d')
                        due_at = d0 + timedelta(days=t['dueDay'])
                    except Exception:
                        pass
                task = Task(event_id=event.id, title=t.get('title') or 'Task', description=t.get('description') or '', priority=t.get('priority') or 'Normal', status='Open', due_at=due_at)
                db.session.add(task)
                tasks_created += 1

        bc_created = 0
        for e in plan.get('expenses') or []:
            if isinstance(e, dict):
                bc = BudgetCategory(event_id=event.id, name=e.get('category') or 'Category', planned_minor=int(e.get('amountMinor') or 0), currency=plan.get('currency') or 'INR', sort_order=bc_created)
                db.session.add(bc)
                bc_created += 1

        vol_created = 0
        for v in plan.get('volunteerRoles') or []:
            if isinstance(v, dict):
                role = v.get('role') or 'Volunteer'
                count = int(v.get('count') or 1)
                for _ in range(count):
                    vol = Volunteer(event_id=event.id, event_title=event.title, name='', email='', department=role, responsibility=role, skills=v.get('skills') or [], status='Invited')
                    db.session.add(vol)
                    vol_created += 1

        row.status = 'Applied'
        row.applied_at = datetime.utcnow()
        row.applied_ref = event.id
        row.updated_at = datetime.utcnow()
        db.session.commit()
        try:
            audit('Plan applied', user, target=event.title)
        except Exception:
            pass
        try:
            webhooks.emit('event.created', {'eventId': event.id, 'title': event.title})
        except Exception:
            pass
        return jsonify({'eventId': event.id, 'event': event.id, 'status': row.status, 'appliedRef': event.id, 'counts': {'sessions': sessions_created, 'tasks': tasks_created, 'budgetCategories': bc_created, 'volunteers': vol_created}})
    except Exception:
        db.session.rollback()
        return jsonify({'message': 'Failed to apply plan.'}), 400


@plans_bp.route('/plans/<plan_id>/reject', methods=['POST'])
@require_auth
def reject_plan(plan_id):
    user = current_user()
    row = EventPlan.query.get(plan_id)
    if not row:
        return jsonify({'message': 'Plan not found.'}), 404
    if not (user and row.user_id == user.id):
        return jsonify({'message': 'You do not have permission for this action.'}), 403
    payload = request.get_json(silent=True) or {}
    _ = payload.get('reason')
    row.status = 'Rejected'
    row.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(event_plan_json(row))


@plans_bp.route('/plans/<plan_id>', methods=['DELETE'])
@require_auth
def delete_plan(plan_id):
    user = current_user()
    row = EventPlan.query.get(plan_id)
    if not row:
        return jsonify({'message': 'Plan not found.'}), 404
    if not (is_admin(user) or (user and row.user_id == user.id)):
        return jsonify({'message': 'You do not have permission for this action.'}), 403
    db.session.delete(row)
    db.session.commit()
    return jsonify({'message': 'Plan deleted.'})


@plans_bp.route('/plans/draft-schedule', methods=['POST'])
@require_auth
def draft_schedule():
    payload = request.get_json(silent=True) or {}
    user = current_user()
    brief = str(payload.get('brief') or '')
    plan = _local_generate_plan(brief, payload)
    _log_ai_call('draft-schedule', brief, plan.get('schedule'), user)
    return jsonify(plan.get('schedule') or [])


@plans_bp.route('/plans/draft-tasks', methods=['POST'])
@require_auth
def draft_tasks():
    payload = request.get_json(silent=True) or {}
    user = current_user()
    brief = str(payload.get('brief') or '')
    plan = _local_generate_plan(brief, payload)
    _log_ai_call('draft-tasks', brief, plan.get('tasks'), user)
    return jsonify(plan.get('tasks') or [])


@plans_bp.route('/plans/draft-communication', methods=['POST'])
@require_auth
def draft_communication():
    payload = request.get_json(silent=True) or {}
    user = current_user()
    brief = str(payload.get('brief') or '')
    plan = _local_generate_plan(brief, payload)
    comms = plan.get('communications') or []
    _log_ai_call('draft-communication', str(payload), comms, user)
    return jsonify(comms)
