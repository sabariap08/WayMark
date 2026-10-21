"""Task management: event-scoped tasks with dependencies, filters, volunteer
recommendations, assignment guards, and hour tracking."""
import re
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, Resource, ResourceBooking, Session, Task, User, Venue, Volunteer
from utils.helpers import audit
from utils.schedule_time import (day_window, overlaps, parse_day_time, to_minutes,
                                 valid_day, valid_time)
from utils.security import can_manage_event, current_user, require_event_manager
from utils.serializers import task_json, volunteer_json

tasks_bp = Blueprint('tasks', __name__)

PRIORITIES = ('Low', 'Normal', 'High', 'Critical')
TASK_STATUSES = ('Open', 'In progress', 'Blocked', 'Done', 'Cancelled')
TERMINAL_STATUSES = ('Done', 'Cancelled')
ASSIGNEE_TYPES = ('user', 'volunteer')
DEFAULT_ESTIMATE_HOURS = 2.0
SHIFT_RE = re.compile(r'([01]\d|2[0-3]):([0-5]\d)\s*(?:-|to)\s*([01]\d|2[0-3]):([0-5]\d)',
                      re.IGNORECASE)


def _guard(event):
    user = current_user()
    if not user:
        return jsonify({'message': 'Authentication required.'}), 401
    if not can_manage_event(user, event):
        return jsonify({'message': 'You can only manage events you host.'}), 403
    return None


def _parse_due(value):
    if value is None or str(value).strip() == '':
        return None, False
    text = str(value).strip()
    try:
        parsed = datetime.fromisoformat(text.replace('Z', '+00:00'))
        return parsed.replace(tzinfo=None), True
    except ValueError:
        pass
    parsed = parse_day_time(text)
    if parsed:
        return parsed, True
    return None, True


def _resolve_assignee(event, assignee_id, assignee_type):
    assignee_id = str(assignee_id or '').strip()
    assignee_type = str(assignee_type or 'user').strip().lower()
    if not assignee_id:
        return '', 'unassigned', None
    if assignee_type not in ASSIGNEE_TYPES:
        return '', '', (jsonify({'message': 'Assignee type must be "user" or "volunteer".'}), 400)
    if assignee_type == 'volunteer':
        volunteer = Volunteer.query.filter_by(id=assignee_id, event_id=event.id).first()
        if not volunteer:
            return '', '', (jsonify({'message': 'Volunteer not found for this event.'}), 400)
        return volunteer.name or '', 'volunteer', None
    person = User.query.get(assignee_id)
    if not person:
        return '', '', (jsonify({'message': 'Assignee user not found.'}), 400)
    return person.name or '', 'user', None


def _resolve_session(event, session_id):
    session_id = str(session_id or '').strip()
    if not session_id:
        return '', None
    session = Session.query.get(session_id)
    if not session or session.event_id != event.id:
        return None, (jsonify({'message': 'Session not found for this event.'}), 400)
    return session_id, None


def _resolve_resource(event, resource_id):
    resource_id = str(resource_id or '').strip()
    if not resource_id:
        return '', None
    resource = Resource.query.get(resource_id)
    if not resource or resource.event_id != event.id:
        return None, (jsonify({'message': 'Resource not found for this event.'}), 400)
    return resource_id, None


def _resolve_dependencies(event, task_id, depends_on):
    if depends_on is None:
        return None, None
    if not isinstance(depends_on, list):
        return None, (jsonify({'message': 'dependsOn must be a list of task ids.'}), 400)
    ids = []
    for raw in depends_on:
        dep_id = str(raw or '').strip()
        if not dep_id or dep_id in ids:
            continue
        if dep_id == task_id:
            return None, (jsonify({'message': 'Circular dependency detected'}), 400)
        dep = Task.query.get(dep_id)
        if not dep or dep.event_id != event.id:
            return None, (jsonify({'message': 'Dependencies must belong to the same event.'}), 400)
        ids.append(dep_id)
    return ids, None


def _creates_cycle(event_id, task_id, deps):
    mapping = {}
    for row in Task.query.filter_by(event_id=event_id).all():
        mapping[row.id] = list(row.depends_on or [])
    mapping[task_id] = list(deps or [])
    seen = set()
    stack = list(deps or [])
    while stack:
        node = stack.pop()
        if node == task_id:
            return True
        if node in seen:
            continue
        seen.add(node)
        stack.extend(mapping.get(node, []))
    return False


def _blocking_tasks(task):
    rows = []
    for dep_id in (task.depends_on or []):
        dep = Task.query.get(dep_id)
        if dep and (dep.status or '') != 'Done':
            rows.append(dep)
    return rows


def _dependents(task, only_open):
    rows = []
    for row in Task.query.filter_by(event_id=task.event_id).all():
        if row.id == task.id:
            continue
        if task.id not in (row.depends_on or []):
            continue
        if only_open and (row.status or '') in TERMINAL_STATUSES:
            continue
        rows.append(row)
    return rows


def _estimate_hours(session):
    if session and valid_time(session.start_time) and valid_time(session.end_time):
        minutes = to_minutes(session.end_time) - to_minutes(session.start_time)
        if minutes > 0:
            return round(minutes / 60.0, 2)
    return DEFAULT_ESTIMATE_HOURS


def _volunteer_issues(event, volunteer, session, task, estimate):
    reasons = []
    blockers = []
    score = 0
    window = None
    if session and valid_day(session.day) and valid_time(session.start_time) \
            and valid_time(session.end_time):
        window = (session.day, to_minutes(session.start_time), to_minutes(session.end_time))

    if window:
        availability = volunteer.availability or []
        covered = False
        source_seen = False
        if isinstance(availability, list) and availability:
            source_seen = True
            weekday = datetime.strptime(window[0], '%Y-%m-%d').strftime('%A')
            for entry in availability:
                if not isinstance(entry, dict):
                    continue
                day_value = str(entry.get('day') or '').strip()
                day_ok = (day_value == window[0]
                          or day_value.lower() == weekday.lower()
                          or day_value.lower() in ('', '*', 'any', 'all'))
                if not day_ok:
                    continue
                from_m = to_minutes(entry.get('from'))
                to_m = to_minutes(entry.get('to'))
                if from_m is None or to_m is None:
                    continue
                if from_m <= window[1] and window[2] <= to_m:
                    covered = True
                    reasons.append('Available during the session window')
                    break
        if not covered:
            shift_date = (volunteer.shift_date or '').strip()
            shift_time = (volunteer.shift_time or '').strip()
            if shift_date or shift_time:
                source_seen = True
                day_ok = (not shift_date) or shift_date == window[0]
                time_ok = True
                match = SHIFT_RE.search(shift_time)
                if match:
                    from_m = int(match.group(1)) * 60 + int(match.group(2))
                    to_m = int(match.group(3)) * 60 + int(match.group(4))
                    time_ok = from_m <= window[1] and window[2] <= to_m
                if day_ok and time_ok:
                    covered = True
                    reasons.append('Shift covers the session window')
        if not covered and source_seen:
            blockers.append('Outside stated availability for the session window')

    skills = [str(s).strip().lower() for s in (volunteer.skills or []) if str(s).strip()]
    targets = []
    if session:
        if session.track:
            targets.append(session.track)
        if session.session_type:
            targets.append(session.session_type)
    if task:
        targets.append(task.title or '')
    keywords = set()
    for target in targets:
        for word in re.split(r'[^a-z0-9]+', str(target).lower()):
            if len(word) >= 3:
                keywords.add(word)
    matched = []
    for skill in skills:
        for keyword in keywords:
            if keyword in skill or skill in keyword:
                matched.append(skill)
                break
    if matched:
        unique = sorted(set(matched))
        score += 10 * min(len(unique), 2)
        reasons.append('Skill match: ' + ', '.join(unique[:3]))

    if session:
        target_window = day_window(session.day, session.start_time, session.end_time,
                                   session.setup_minutes, session.teardown_minutes)
        if target_window:
            conflicts = []
            others = Task.query.filter(Task.assignee_id == volunteer.id,
                                       Task.assignee_type == 'volunteer',
                                       Task.status.notin_(list(TERMINAL_STATUSES))).all()
            for other in others:
                if task and other.id == task.id:
                    continue
                if not other.session_id or other.session_id == session.id:
                    continue
                other_session = Session.query.get(other.session_id)
                if not other_session:
                    continue
                other_window = day_window(other_session.day, other_session.start_time,
                                          other_session.end_time,
                                          other_session.setup_minutes,
                                          other_session.teardown_minutes)
                if overlaps(target_window, other_window):
                    conflicts.append('Overlapping assignment: ' + (other.title or other.id))
            resource = Resource.query.filter(Resource.event_id == event.id,
                                             Resource.kind.in_(['Volunteer', 'Staff']),
                                             Resource.name == volunteer.name).first()
            if resource:
                bookings = ResourceBooking.query.filter_by(resource_id=resource.id) \
                    .filter(ResourceBooking.status != 'Released').all()
                for booking in bookings:
                    booking_window = day_window(booking.day, booking.start_time,
                                                booking.end_time, booking.setup_minutes,
                                                booking.teardown_minutes)
                    if overlaps(target_window, booking_window):
                        conflicts.append('Booked during the session window')
                        break
            if conflicts:
                blockers.extend(conflicts[:1])
            else:
                reasons.append('No scheduling conflicts')

        venue_label = ''
        if session.venue_id:
            venue = Venue.query.get(session.venue_id)
            venue_label = (venue.name if venue else '') or session.room_name or ''
        else:
            venue_label = session.room_name or ''
        volunteer_venue = (volunteer.venue or '').strip()
        if venue_label and volunteer_venue:
            haystack = venue_label.lower()
            needle = volunteer_venue.lower()
            if needle in haystack or haystack in needle:
                score += 15
                reasons.append('Venue match: ' + venue_label)

    cap = volunteer.max_hours or 0
    assigned = volunteer.assigned_hours or 0
    if cap > 0:
        if assigned + estimate > cap:
            blockers.append('Hour cap exceeded: ' + str(round(assigned, 2)) + ' of '
                            + str(cap) + 'h assigned, estimate '
                            + str(round(estimate, 2)) + 'h.')
        else:
            score += 10
            reasons.append('Within hour cap (' + str(round(assigned, 2)) + ' of '
                           + str(cap) + 'h used)')

    return score, reasons, blockers


@tasks_bp.route('/events/<event_id>/tasks', methods=['GET'])
@require_event_manager('event_id')
def list_tasks(event_id, _event=None):
    task_filter = (request.args.get('filter') or 'all').strip().lower()
    assignee_id = (request.args.get('assigneeId') or '').strip()
    query = Task.query.filter_by(event_id=event_id)
    if assignee_id:
        query = query.filter_by(assignee_id=assignee_id)
    rows = query.all()
    now = datetime.utcnow()
    if task_filter == 'overdue':
        rows = [t for t in rows if t.due_at and t.due_at < now
                and (t.status or '') not in TERMINAL_STATUSES]
    elif task_filter == 'blocked':
        rows = [t for t in rows if t.status == 'Blocked']
    elif task_filter == 'unassigned':
        rows = [t for t in rows if not t.assignee_id
                and (t.status or '') not in TERMINAL_STATUSES]
    elif task_filter == 'completed':
        rows = [t for t in rows if t.status == 'Done']
    rows.sort(key=lambda t: t.created_at or datetime.min, reverse=True)
    return jsonify([task_json(t) for t in rows])


@tasks_bp.route('/events/<event_id>/tasks', methods=['POST'])
@require_event_manager('event_id')
def create_task(event_id, _event=None):
    event = _event
    payload = request.get_json(silent=True) or {}
    user = current_user()
    title = str(payload.get('title') or '').strip()
    if not title:
        return jsonify({'message': 'Task title is required.'}), 400
    priority = str(payload.get('priority') or 'Normal').strip()
    if priority not in PRIORITIES:
        return jsonify({'message': 'Priority must be one of Low, Normal, High, Critical.'}), 400
    due_at, due_error = _parse_due(payload.get('dueAt'))
    if due_error and due_at is None:
        return jsonify({'message': 'dueAt must be a valid ISO date/time.'}), 400

    session_id, session_error = _resolve_session(event, payload.get('sessionId'))
    if session_error:
        return session_error
    resource_id, resource_error = _resolve_resource(event, payload.get('resourceId'))
    if resource_error:
        return resource_error
    name, assignee_type, assignee_error = _resolve_assignee(
        event, payload.get('assigneeId'), payload.get('assigneeType'))
    if assignee_error:
        return assignee_error
    assignee_id = str(payload.get('assigneeId') or '').strip()
    if not assignee_id:
        assignee_type = 'unassigned'
    deps, dep_error = _resolve_dependencies(event, '', payload.get('dependsOn'))
    if dep_error:
        return dep_error

    row = Task(event_id=event.id, title=title,
               description=str(payload.get('description') or ''),
               assignee_id=assignee_id, assignee_name=name, assignee_type=assignee_type,
               priority=priority, due_at=due_at, status='Open',
               depends_on=deps or [], session_id=session_id or '',
               resource_id=resource_id or '',
               created_by=(user.name if user else ''))
    db.session.add(row)
    db.session.commit()
    if _creates_cycle(event.id, row.id, row.depends_on or []):
        db.session.delete(row)
        db.session.commit()
        return jsonify({'message': 'Circular dependency detected'}), 400
    audit('Task created', user, target=title + ' @ ' + (event.title or ''))
    return jsonify(task_json(row)), 201


@tasks_bp.route('/tasks/<task_id>', methods=['PUT', 'PATCH'])
def update_task(task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'message': 'Task not found.'}), 404
    event = Event.query.get(task.event_id) if task.event_id else None
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    denied = _guard(event)
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    user = current_user()

    if 'title' in payload and payload['title'] is not None:
        title = str(payload['title']).strip()
        if not title:
            return jsonify({'message': 'Task title is required.'}), 400
        task.title = title
    if 'description' in payload and payload['description'] is not None:
        task.description = str(payload['description'])
    if 'completionNotes' in payload and payload['completionNotes'] is not None:
        task.completion_notes = str(payload['completionNotes'])
    if 'priority' in payload and payload['priority'] is not None:
        priority = str(payload['priority']).strip()
        if priority not in PRIORITIES:
            return jsonify({'message': 'Priority must be one of Low, Normal, High, Critical.'}), 400
        task.priority = priority
    if 'dueAt' in payload:
        due_at, due_error = _parse_due(payload.get('dueAt'))
        if due_error and due_at is None:
            return jsonify({'message': 'dueAt must be a valid ISO date/time.'}), 400
        task.due_at = due_at
    if 'sessionId' in payload:
        session_id, session_error = _resolve_session(event, payload.get('sessionId'))
        if session_error:
            return session_error
        task.session_id = session_id or ''
    if 'resourceId' in payload:
        resource_id, resource_error = _resolve_resource(event, payload.get('resourceId'))
        if resource_error:
            return resource_error
        task.resource_id = resource_id or ''
    if 'assigneeId' in payload:
        assignee_id = str(payload.get('assigneeId') or '').strip()
        if not assignee_id:
            task.assignee_id = ''
            task.assignee_name = ''
            task.assignee_type = 'unassigned'
        else:
            assignee_type = payload.get('assigneeType')
            if not assignee_type:
                assignee_type = task.assignee_type if task.assignee_type in ASSIGNEE_TYPES else 'user'
            name, assignee_type, assignee_error = _resolve_assignee(event, assignee_id,
                                                                    assignee_type)
            if assignee_error:
                return assignee_error
            task.assignee_id = assignee_id
            task.assignee_name = name
            task.assignee_type = assignee_type
    if 'dependsOn' in payload:
        deps, dep_error = _resolve_dependencies(event, task.id, payload.get('dependsOn'))
        if dep_error:
            return dep_error
        if deps is not None:
            if _creates_cycle(event.id, task.id, deps):
                return jsonify({'message': 'Circular dependency detected'}), 400
            task.depends_on = deps

    new_status = None
    if 'status' in payload and payload['status'] is not None:
        new_status = str(payload['status']).strip()
        if new_status not in TASK_STATUSES:
            return jsonify({'message': 'Status must be one of Open, In progress, Blocked, '
                                       'Done, Cancelled.'}), 400
    old_status = task.status or 'Open'
    completed_now = False
    uncompleted_now = False
    if new_status and new_status != old_status:
        if new_status == 'Done':
            blocking = _blocking_tasks(task)
            if blocking:
                titles = ', '.join('"' + (t.title or t.id) + '"' for t in blocking)
                return jsonify({'message': 'Dependencies are not done yet: ' + titles + '.'}), 409
        if new_status == 'Cancelled':
            dependents = _dependents(task, only_open=True)
            if dependents:
                titles = ', '.join('"' + (t.title or t.id) + '"' for t in dependents)
                return jsonify({'message': 'Cannot cancel a task other open tasks depend on: '
                                           + titles + '.'}), 409
        task.status = new_status
        if new_status == 'Done':
            task.completed_at = datetime.utcnow()
            completed_now = True
        elif old_status == 'Done':
            task.completed_at = None
            uncompleted_now = True

    volunteer = None
    if (task.assignee_type or '') == 'volunteer' and task.assignee_id:
        volunteer = Volunteer.query.filter_by(id=task.assignee_id, event_id=event.id).first()
    if completed_now and volunteer:
        volunteer.completed_tasks = (volunteer.completed_tasks or 0) + 1
    if uncompleted_now and volunteer:
        volunteer.completed_tasks = max(0, (volunteer.completed_tasks or 0) - 1)
    task.updated_at = datetime.utcnow()
    db.session.commit()
    if completed_now:
        audit('Task completed', user, target=task.title)
    elif new_status == 'Cancelled':
        audit('Task cancelled', user, target=task.title)
    else:
        audit('Task updated', user, target=task.title)
    return jsonify(task_json(task))


@tasks_bp.route('/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'message': 'Task not found.'}), 404
    event = Event.query.get(task.event_id) if task.event_id else None
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    denied = _guard(event)
    if denied:
        return denied
    dependents = _dependents(task, only_open=False)
    if dependents:
        titles = ', '.join('"' + (t.title or t.id) + '"' for t in dependents)
        return jsonify({'message': 'Cannot delete: other tasks depend on this one: '
                                   + titles + '.'}), 409
    title = task.title or task.id
    db.session.delete(task)
    db.session.commit()
    audit('Task deleted', current_user(), target=title)
    return jsonify({'ok': True})


@tasks_bp.route('/tasks/<task_id>/assign', methods=['POST'])
def assign_task(task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'message': 'Task not found.'}), 404
    event = Event.query.get(task.event_id) if task.event_id else None
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    denied = _guard(event)
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    assignee_id = str(payload.get('assigneeId') or '').strip()
    if not assignee_id:
        return jsonify({'message': 'Assignee id is required.'}), 400
    assignee_type = str(payload.get('assigneeType') or '').strip().lower()
    if not assignee_type:
        if Volunteer.query.filter_by(id=assignee_id, event_id=event.id).first():
            assignee_type = 'volunteer'
        else:
            assignee_type = 'user'
    name, assignee_type, assignee_error = _resolve_assignee(event, assignee_id, assignee_type)
    if assignee_error:
        return assignee_error

    if assignee_type == 'volunteer':
        volunteer = Volunteer.query.filter_by(id=assignee_id, event_id=event.id).first()
        session = Session.query.get(task.session_id) if task.session_id else None
        estimate = _estimate_hours(session)
        _score, _reasons, blockers = _volunteer_issues(event, volunteer, session, task, estimate)
        hard = [b for b in blockers if b.startswith('Hour cap exceeded')
                or b.startswith('Overlapping assignment') or b.startswith('Booked during')]
        if hard:
            return jsonify({'message': 'Assignment blocked: ' + ' '.join(hard)}), 409

    task.assignee_id = assignee_id
    task.assignee_name = name
    task.assignee_type = assignee_type
    task.updated_at = datetime.utcnow()
    db.session.commit()
    audit('Task assigned', current_user(), target=task.title + ' → ' + name)
    return jsonify(task_json(task))


@tasks_bp.route('/events/<event_id>/tasks/dependencies', methods=['GET'])
@require_event_manager('event_id')
def task_dependencies(event_id, _event=None):
    rows = Task.query.filter_by(event_id=event_id).all()
    sessions = {s.id: s for s in Session.query.filter_by(event_id=event_id).all()}
    resources = {r.id: r for r in Resource.query.filter_by(event_id=event_id).all()}
    booking_rows = ResourceBooking.query.filter_by(event_id=event_id) \
        .filter(ResourceBooking.status != 'Released').all()
    booked_pairs = {(b.resource_id, b.session_id) for b in booking_rows}
    booked_resources = {b.resource_id for b in booking_rows}

    nodes = []
    for task in rows:
        session = sessions.get(task.session_id) if task.session_id else None
        resource_title = ''
        allocated = None
        if task.resource_id:
            resource = resources.get(task.resource_id)
            resource_title = (resource.name if resource else '') or ''
            if task.session_id:
                allocated = (task.resource_id, task.session_id) in booked_pairs
            else:
                allocated = task.resource_id in booked_resources
        elif session and (session.required_resource_ids or []):
            required = [rid for rid in (session.required_resource_ids or []) if rid]
            names = [resources[rid].name for rid in required if rid in resources]
            resource_title = ', '.join(names)
            if required:
                allocated = all((rid, session.id) in booked_pairs for rid in required)
        nodes.append({
            'id': task.id,
            'title': task.title or '',
            'status': task.status or 'Open',
            'type': task.assignee_type or 'unassigned',
            'sessionTitle': (session.title if session else '') or '',
            'resourceTitle': resource_title,
            'resourceAllocated': allocated,
        })
    edges = [{'from': dep_id, 'to': task.id}
             for task in rows for dep_id in (task.depends_on or [])]
    return jsonify({'nodes': nodes, 'edges': edges})


@tasks_bp.route('/events/<event_id>/volunteers/recommendations', methods=['GET'])
@require_event_manager('event_id')
def volunteer_recommendations(event_id, _event=None):
    session_id = (request.args.get('sessionId') or '').strip()
    task_id = (request.args.get('taskId') or '').strip()
    session = None
    if session_id:
        session = Session.query.get(session_id)
        if not session or session.event_id != event_id:
            return jsonify({'message': 'Session not found for this event.'}), 400
    task = None
    if task_id:
        task = Task.query.get(task_id)
        if not task or task.event_id != event_id:
            return jsonify({'message': 'Task not found for this event.'}), 400
    if not session and task and task.session_id:
        session = Session.query.get(task.session_id)
    estimate = _estimate_hours(session)

    volunteers = Volunteer.query.filter_by(event_id=event_id) \
        .filter(Volunteer.status != 'Removed').all()
    results = []
    for volunteer in volunteers:
        score, reasons, blockers = _volunteer_issues(_event, volunteer, session, task, estimate)
        results.append({
            'volunteerId': volunteer.id,
            'name': volunteer.name or '',
            'score': score,
            'reasons': reasons,
            'blockers': blockers,
        })
    results.sort(key=lambda r: (-r['score'], r['name'].lower(), r['volunteerId']))
    return jsonify({
        'recommendations': results,
        'estimateHours': estimate,
        'sessionId': session_id,
        'taskId': task_id,
    })


@tasks_bp.route('/events/<event_id>/volunteers/<volunteer_id>/hours', methods=['POST'])
@require_event_manager('event_id')
def record_hours(event_id, volunteer_id, _event=None):
    volunteer = Volunteer.query.filter_by(id=volunteer_id, event_id=event_id).first()
    if not volunteer:
        return jsonify({'message': 'Volunteer not found.'}), 404
    payload = request.get_json(silent=True) or {}
    try:
        hours = float(payload.get('hours'))
    except (TypeError, ValueError):
        return jsonify({'message': 'Hours must be a positive number.'}), 400
    if hours <= 0:
        return jsonify({'message': 'Hours must be a positive number.'}), 400
    volunteer.assigned_hours = round((volunteer.assigned_hours or 0) + hours, 2)
    db.session.commit()
    audit('Volunteer hours recorded', current_user(),
          target=(volunteer.name or volunteer.id) + ' + ' + str(hours) + 'h @ '
                 + (_event.title or ''))
    return jsonify(volunteer_json(volunteer))
