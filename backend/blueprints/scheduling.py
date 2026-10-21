"""Scheduling engine: sessions, venues, resources, bookings, and deterministic
conflict detection. Conflicts are persisted with a stable fingerprint so a
re-run reuses rows instead of duplicating them, and cleared conditions are
auto-resolved."""
import hashlib
from datetime import datetime

from flask import Blueprint, jsonify, request

from extensions import db
from models import (Event, Resource, ResourceBooking, ScheduleConflict, Session,
                    Venue, Volunteer)
from utils.helpers import audit, parse_bool, parse_int
from utils.schedule_time import (day_window, overlaps, parse_day_time, to_minutes,
                                 valid_day, valid_time, window_label)
from utils.security import can_manage_event, current_user
from utils.serializers import (booking_json, conflict_json, resource_json, session_json,
                               venue_json)

scheduling_bp = Blueprint('scheduling', __name__)

ROOM_KINDS = ('Room', 'Auditorium', 'Laboratory')
BOOKABLE_KINDS = ('Equipment', 'Projector', 'Audio system', 'Vehicle', 'Staff')
RESOURCE_KINDS = ('Room', 'Auditorium', 'Laboratory', 'Equipment', 'Projector',
                  'Audio system', 'Vehicle', 'Staff', 'Speaker', 'Judge', 'Volunteer')
SESSION_STATUSES = ('Draft', 'Published', 'Completed', 'Cancelled')
BOOKING_STATUSES = ('Planned', 'Confirmed')
BOOKING_STATUSES_OPEN = ('Planned', 'Confirmed')
RESOURCE_STATUSES = ('Active', 'Maintenance', 'Unavailable')
TIME_STEP = 15
LATEST_SLOT_END = 22 * 60
MAX_SUGGESTIONS = 3


def _error(message, status):
    return jsonify({'message': message}), status


def _guard(event):
    user = current_user()
    if not user:
        return None, _error('Authentication required.', 401)
    if not can_manage_event(user, event):
        return None, _error('You can only manage events you host.', 403)
    return user, None


def _auth_user():
    user = current_user()
    if not user:
        return None, _error('Authentication required.', 401)
    return user, None


def _check_window(day, start, end, label='Session'):
    if not valid_day(day):
        return label + ' day must be a valid YYYY-MM-DD date.'
    if not valid_time(start):
        return label + ' start time must be a valid 24h HH:MM time.'
    if not valid_time(end):
        return label + ' end time must be a valid 24h HH:MM time.'
    if to_minutes(end) <= to_minutes(start):
        return label + ' end time must be after its start time.'
    return None


def _fmt_minutes(minute):
    minute = int(minute)
    return '%02d:%02d' % ((minute // 60) % 24, minute % 60)


def _session_window(s, with_buffers=True):
    if not with_buffers:
        return day_window(s.day, s.start_time, s.end_time)
    return day_window(s.day, s.start_time, s.end_time,
                      s.setup_minutes or 0, s.teardown_minutes or 0)


def _booking_window(b):
    return day_window(b.day, b.start_time, b.end_time,
                      b.setup_minutes or 0, b.teardown_minutes or 0)


def _norm_speakers(value):
    if not isinstance(value, list):
        return None
    cleaned = []
    for entry in value[:20]:
        if isinstance(entry, dict):
            cleaned.append({'name': str(entry.get('name') or '')[:160],
                            'email': str(entry.get('email') or '')[:200]})
        else:
            cleaned.append({'name': str(entry)[:160], 'email': ''})
    return cleaned


def _apply_session_payload(row, payload, event, creating=False):
    if creating:
        title = str(payload.get('title') or '').strip()
        if not title:
            return _error('Session title is required.', 400)
        row.title = title
    elif 'title' in payload:
        title = str(payload.get('title') or '').strip()
        if not title:
            return _error('Session title is required.', 400)
        row.title = title
    for key, (attr, limit) in {
            'description': ('description', 6000), 'sessionType': ('session_type', 40),
            'roomName': ('room_name', 200), 'track': ('track', 120)}.items():
        if key in payload and payload[key] is not None:
            setattr(row, attr, str(payload[key])[:limit])
    for key, attr in {'capacity': 'capacity', 'orderIndex': 'order_index',
                      'setupMinutes': 'setup_minutes', 'teardownMinutes': 'teardown_minutes'}.items():
        if key in payload:
            setattr(row, attr, max(0, parse_int(payload.get(key), getattr(row, attr) or 0)))
    if 'status' in payload:
        status = str(payload.get('status') or '').strip()
        if status not in SESSION_STATUSES:
            return _error('Session status must be one of: ' + ', '.join(SESSION_STATUSES) + '.', 400)
        row.status = status
    if 'venueId' in payload:
        venue_id = str(payload.get('venueId') or '').strip()
        if venue_id:
            venue = Venue.query.get(venue_id)
            if not venue or venue.event_id != event.id:
                return _error('Venue must belong to the same event.', 400)
        row.venue_id = venue_id
    if 'speakers' in payload:
        speakers = _norm_speakers(payload.get('speakers'))
        if speakers is None:
            return _error('Speakers must be a list.', 400)
        row.speakers = speakers
    if 'requiredResourceIds' in payload:
        value = payload.get('requiredResourceIds')
        if not isinstance(value, list):
            return _error('requiredResourceIds must be a list.', 400)
        ids = []
        for rid in value[:50]:
            rid = str(rid or '').strip()
            if not rid:
                continue
            resource = Resource.query.get(rid)
            if not resource or resource.event_id != event.id:
                return _error('Resource must belong to the same event.', 400)
            ids.append(rid)
        row.required_resource_ids = ids
    if 'resourceDeadline' in payload:
        deadline = str(payload.get('resourceDeadline') or '').strip()
        if deadline and not parse_day_time(deadline):
            return _error('resourceDeadline must be a valid date and time.', 400)
        row.resource_deadline = deadline
    day = str(payload.get('day') if 'day' in payload else row.day or '').strip()
    start = str(payload.get('startTime') if 'startTime' in payload else row.start_time or '').strip()
    end = str(payload.get('endTime') if 'endTime' in payload else row.end_time or '').strip()
    if creating:
        problem = _check_window(day, start, end)
        if problem:
            return _error(problem, 400)
    else:
        if 'day' in payload and day and not valid_day(day):
            return _error('Session day must be a valid YYYY-MM-DD date.', 400)
        if 'startTime' in payload and start and not valid_time(start):
            return _error('Session start time must be a valid 24h HH:MM time.', 400)
        if 'endTime' in payload and end and not valid_time(end):
            return _error('Session end time must be a valid 24h HH:MM time.', 400)
        if start and end and to_minutes(end) <= to_minutes(start):
            return _error('Session end time must be after its start time.', 400)
    row.day = day
    row.start_time = start
    row.end_time = end
    row.updated_at = datetime.utcnow()
    return None


def _sort_sessions(rows):
    rows.sort(key=lambda s: ((s.day or ''), (s.start_time or ''), (s.order_index or 0),
                             (s.title or ''), s.id or ''))
    return rows


def _fingerprint(conflict_type, event_id, resource_id, session_ids, day, start):
    raw = '|'.join([str(conflict_type), str(event_id), str(resource_id or ''),
                    ','.join(sorted(str(s) for s in (session_ids or []))),
                    str(day or ''), str(start or '')])
    return hashlib.sha1(raw.encode('utf-8')).hexdigest()


def _open_bookings(event_id):
    return [b for b in ResourceBooking.query.filter_by(event_id=event_id).all()
            if (b.status or '') in BOOKING_STATUSES_OPEN]


def _speaker_identity(speaker):
    email = str((speaker or {}).get('email') or '').strip().lower()
    name = str((speaker or {}).get('name') or '').strip()
    key = 'email:' + email if email else ('name:' + name.lower() if name else '')
    return email, name, key


def _speakers_match(a, b):
    email_a, name_a, _ = _speaker_identity(a)
    email_b, name_b, _ = _speaker_identity(b)
    if email_a and email_b and email_a == email_b:
        return True
    return bool(name_a and name_b and name_a.lower() == name_b.lower())


def _resource_available(resource, day, window):
    days = resource.available_days or []
    if days and day not in [str(d) for d in days]:
        return False
    from_t, to_t = resource.available_from or '', resource.available_to or ''
    if valid_time(from_t) and valid_time(to_t):
        allowed = day_window(day, from_t, to_t)
        if not allowed or not window:
            return False
        if window[0] < allowed[0] or window[1] > allowed[1]:
            return False
    return True


def _free_resource_alternatives(event, kind, day, window, exclude_resource_id, bookings):
    alternatives = []
    for r in Resource.query.filter_by(event_id=event.id).all():
        if r.id == exclude_resource_id:
            continue
        if (r.kind or '') != kind:
            continue
        if not _resource_available(r, day, window):
            continue
        busy = any(b.resource_id == r.id and b.day == day
                   and (b.status or '') in BOOKING_STATUSES_OPEN
                   and overlaps(_booking_window(b), window) for b in bookings)
        if not busy:
            alternatives.append({'resourceId': r.id, 'name': r.name or '', 'kind': r.kind or ''})
    return alternatives[:MAX_SUGGESTIONS]


def _free_venue_alternatives(event, day, window, exclude_venue_id, sessions, bookings):
    room_resources = [r for r in Resource.query.filter_by(event_id=event.id).all()
                      if (r.kind or '') in ROOM_KINDS]
    alternatives = []
    for v in Venue.query.filter_by(event_id=event.id).all():
        if v.id == exclude_venue_id:
            continue
        busy = any(s.venue_id == v.id and s.day == day and overlaps(_session_window(s), window)
                   for s in sessions)
        if not busy:
            for r in room_resources:
                if r.venue_id != v.id:
                    continue
                for b in bookings:
                    if b.resource_id == r.id and b.day == day \
                            and (b.status or '') in BOOKING_STATUSES_OPEN \
                            and overlaps(_booking_window(b), window):
                        busy = True
                        break
                if busy:
                    break
        if not busy:
            alternatives.append({'venueId': v.id, 'name': v.name or ''})
    return alternatives[:MAX_SUGGESTIONS]


def _time_suggestions(pair, sessions, count=MAX_SUGGESTIONS):
    a, b = pair
    day = a.day
    duration = to_minutes(a.end_time) - to_minutes(a.start_time)
    if not day or duration <= 0:
        return []
    room_key = (a.venue_id or '', (a.room_name or '').strip().lower())
    busy = []
    for s in sessions:
        if s.day != day or s.id in (a.id, b.id):
            continue
        same = (s.venue_id and s.venue_id == room_key[0]) or \
               ((s.room_name or '').strip().lower() and
                (s.room_name or '').strip().lower() == room_key[1])
        if not same:
            continue
        window = day_window(s.day, s.start_time, s.end_time)
        if window:
            busy.append(window)
    busy.sort()
    cursor = max(to_minutes(a.end_time) or 0, to_minutes(b.end_time) or 0)
    slots = []
    while cursor + duration <= LATEST_SLOT_END and len(slots) < count:
        window = (cursor, cursor + duration)
        blockers = [w for w in busy if overlaps(window, w)]
        if not blockers:
            slots.append({'day': day, 'startTime': _fmt_minutes(cursor),
                          'endTime': _fmt_minutes(cursor + duration)})
            cursor += duration
        else:
            cursor = min(w[1] for w in blockers)
    return slots


def _detect_conflicts(event):
    sessions = _sort_sessions([s for s in Session.query.filter_by(event_id=event.id).all()
                               if (s.status or '') != 'Cancelled'])
    venues = {v.id: v for v in Venue.query.filter_by(event_id=event.id).all()}
    resources = {r.id: r for r in Resource.query.filter_by(event_id=event.id).all()}
    bookings = _open_bookings(event.id)
    volunteers = Volunteer.query.filter_by(event_id=event.id).all()
    found = []

    def add(conflict_type, severity, resource_id, resource_name, session_ids,
            session_titles, person, day, start, end, message, detail=None):
        found.append({
            'conflict_type': conflict_type, 'severity': severity,
            'resource_id': (resource_id or '')[:36], 'resource_name': (resource_name or '')[:200],
            'session_ids': list(session_ids or []), 'session_titles': list(session_titles or []),
            'person': (person or '')[:200], 'day': day or '', 'start_time': start or '',
            'end_time': end or '', 'message': message,
            'detail': detail if isinstance(detail, dict) else {},
            'fingerprint': _fingerprint(conflict_type, event.id, (resource_id or '')[:36],
                                        session_ids, day, start),
        })

    for i, a in enumerate(sessions):
        for b in sessions[i + 1:]:
            window_a, window_b = _session_window(a), _session_window(b)
            if a.day != b.day or not window_a or not window_b:
                continue
            same_venue = bool(a.venue_id) and a.venue_id == b.venue_id
            room_a = (a.room_name or '').strip().lower()
            room_b = (b.room_name or '').strip().lower()
            same_room = bool(room_a) and room_a == room_b
            if same_venue or same_room:
                if overlaps(window_a, window_b):
                    venue = venues.get(a.venue_id) if same_venue else None
                    room_label = (venue.name if venue else (a.room_name or b.room_name or 'the room'))
                    start = min(a.start_time, b.start_time)
                    end = max(a.end_time, b.end_time)
                    pair_window = day_window(a.day, start, end)
                    time_slots = _time_suggestions((a, b), sessions)
                    suggestions = _free_venue_alternatives(
                        event, a.day, pair_window,
                        a.venue_id if same_venue else '', sessions, bookings)
                    suggestion = None
                    if time_slots:
                        suggestion = {'sessionId': b.id, 'day': a.day,
                                      'startTime': time_slots[0]['startTime'],
                                      'endTime': time_slots[0]['endTime']}
                    add('Room overlap', 'Warning', a.venue_id if same_venue else '',
                        room_label, [a.id, b.id], [a.title or '', b.title or ''],
                        '', a.day, start, end,
                        'Sessions "' + (a.title or '') + '" and "' + (b.title or '')
                        + '" overlap in ' + room_label + ' on ' + str(a.day)
                        + ' (' + window_label(day_window(a.day, start, end)) + '), including setup and teardown buffers.',
                        {'suggestions': suggestions, 'timeSuggestions': time_slots,
                         'suggestion': suggestion})
            if overlaps(day_window(a.day, a.start_time, a.end_time),
                        day_window(b.day, b.start_time, b.end_time)):
                seen_speakers = set()
                for speaker_a in (a.speakers or []):
                    for speaker_b in (b.speakers or []):
                        if not _speakers_match(speaker_a, speaker_b):
                            continue
                        email, name, key = _speaker_identity(speaker_a)
                        if not key:
                            email, name, key = _speaker_identity(speaker_b)
                        if key in seen_speakers:
                            continue
                        seen_speakers.add(key)
                        person = name or email or key
                        time_slots = _time_suggestions((a, b), sessions)
                        suggestion = None
                        if time_slots:
                            suggestion = {'sessionId': b.id, 'day': a.day,
                                          'startTime': time_slots[0]['startTime'],
                                          'endTime': time_slots[0]['endTime']}
                        add('Speaker overlap', 'Warning', key[:36], person, [a.id, b.id],
                            [a.title or '', b.title or ''], person, a.day,
                            min(a.start_time, b.start_time), max(a.end_time, b.end_time),
                            person + ' is scheduled for both "' + (a.title or '') + '" and "'
                            + (b.title or '') + '" in overlapping times on ' + str(a.day) + '.',
                            {'suggestions': [], 'timeSuggestions': time_slots,
                             'suggestion': suggestion})
            shared = set((a.required_resource_ids or [])) & set((b.required_resource_ids or []))
            for rid in sorted(shared):
                if not overlaps(window_a, window_b):
                    continue
                resource = resources.get(rid)
                if not resource or (resource.kind or '') not in BOOKABLE_KINDS:
                    continue
                add('Resource overlap', 'Warning', rid, resource.name or '',
                    [a.id, b.id], [a.title or '', b.title or ''], '', a.day,
                    min(a.start_time, b.start_time), max(a.end_time, b.end_time),
                    'Resource "' + (resource.name or rid) + '" is required by overlapping sessions "'
                    + (a.title or '') + '" and "' + (b.title or '') + '".',
                    {'suggestions': _free_resource_alternatives(
                        event, resource.kind or '', a.day, pair_window_safe(a, b), rid, bookings),
                     'timeSuggestions': _time_suggestions((a, b), sessions),
                     'suggestion': None})

    for rid, bookings_of_resource in _group_by(bookings, lambda b: b.resource_id).items():
        resource = resources.get(rid)
        if not resource:
            continue
        kind = resource.kind or ''
        if kind == 'Volunteer':
            conflict_type = 'Volunteer conflict'
        elif kind in BOOKABLE_KINDS:
            conflict_type = 'Resource overlap'
        else:
            continue
        ordered = sorted(bookings_of_resource, key=lambda b: ((b.day or ''), (b.start_time or ''), b.id or ''))
        for i, ba in enumerate(ordered):
            for bb in ordered[i + 1:]:
                if ba.day != bb.day:
                    continue
                wa, wb = _booking_window(ba), _booking_window(bb)
                if not wa or not wb or not overlaps(wa, wb):
                    continue
                sa = Session.query.get(ba.session_id)
                sb = Session.query.get(bb.session_id)
                title_a = (sa.title if sa else '') or 'another session'
                title_b = (sb.title if sb else '') or 'another session'
                time_slots = []
                if sa and sb:
                    time_slots = _time_suggestions((sa, sb), sessions)
                suggestion = None
                if time_slots and sa:
                    suggestion = {'sessionId': sa.id, 'day': ba.day,
                                  'startTime': time_slots[0]['startTime'],
                                  'endTime': time_slots[0]['endTime']}
                else:
                    alternatives = _free_resource_alternatives(
                        event, kind, ba.day, wa, rid, bookings)
                    if alternatives and sa:
                        suggestion = {'sessionId': sa.id, 'resourceId': alternatives[0]['resourceId']}
                add(conflict_type, 'Warning', rid, resource.name or '',
                    [x for x in [ba.session_id, bb.session_id] if x],
                    [title_a if ba.session_id else '', title_b if bb.session_id else ''],
                    resource.name if kind == 'Volunteer' else '', ba.day,
                    min(ba.start_time, bb.start_time), max(ba.end_time, bb.end_time),
                    'Resource "' + (resource.name or rid) + '" has overlapping bookings on '
                    + str(ba.day) + ' between "' + title_a + '" and "' + title_b + '".',
                    {'suggestions': _free_resource_alternatives(
                        event, kind, ba.day, wa, rid, bookings),
                     'timeSuggestions': time_slots, 'suggestion': suggestion})

    for volunteer in volunteers:
        windows = []
        for entry in (volunteer.availability or []):
            if not isinstance(entry, dict):
                continue
            day = str(entry.get('day') or '').strip()
            start = str(entry.get('from') or entry.get('startTime') or '').strip()
            end = str(entry.get('to') or entry.get('endTime') or '').strip()
            window = day_window(day, start, end)
            if window:
                windows.append((day, start, end, window))
        for i, wa in enumerate(windows):
            for wb in windows[i + 1:]:
                if wa[0] != wb[0] or not overlaps(wa[3], wb[3]):
                    continue
                add('Volunteer conflict', 'Warning', volunteer.id or '',
                    volunteer.name or '', [], [], volunteer.name or '', wa[0],
                    min(wa[1], wb[1]), max(wa[2], wb[2]),
                    'Volunteer "' + (volunteer.name or '') + '" has overlapping availability windows on '
                    + wa[0] + '.', {'suggestions': [], 'timeSuggestions': [], 'suggestion': None})

    for s in sessions:
        capacity = s.capacity or 0
        registered = event.registered_num or 0
        if capacity > 0 and registered > capacity:
            add('Capacity exceeded', 'Warning', '', '', [s.id], [s.title or ''], '',
                s.day, s.start_time, s.end_time,
                'Session "' + (s.title or '') + '" has capacity ' + str(capacity)
                + ' but the event already has ' + str(registered) + ' registered participants.',
                {'suggestions': [], 'timeSuggestions': [], 'suggestion': None})
        bookings_by_session = [b for b in bookings if b.session_id == s.id]
        for rid in (s.required_resource_ids or []):
            resource = resources.get(rid)
            name = resource.name if resource else rid
            booked = any(b.resource_id == rid for b in bookings_by_session)
            if booked:
                continue
            add('Missing resource', 'Critical', rid, name, [s.id], [s.title or ''], '',
                s.day, s.start_time, s.end_time,
                'Session "' + (s.title or '') + '" requires resource "' + str(name)
                + '" but it has not been booked.',
                {'suggestions': _free_resource_alternatives(
                    event, resource.kind if resource else '', s.day,
                    _session_window(s) or (0, 0), rid, bookings),
                 'timeSuggestions': [], 'suggestion': None})
        for b in bookings_by_session:
            resource = resources.get(b.resource_id)
            if not resource:
                continue
            window = _booking_window(b)
            if not window or not valid_day(b.day or ''):
                continue
            problems = []
            days = resource.available_days or []
            if days and b.day not in [str(d) for d in days]:
                problems.append('day ' + str(b.day) + ' is not in its available days')
            from_t, to_t = resource.available_from or '', resource.available_to or ''
            if valid_time(from_t) and valid_time(to_t):
                allowed = day_window(b.day, from_t, to_t)
                if not allowed or window[0] < allowed[0] or window[1] > allowed[1]:
                    problems.append('booking ' + window_label(window) + ' sits outside '
                                    + window_label(allowed or (0, 0)))
            if problems:
                add('Outside availability', 'Warning', resource.id, resource.name or '',
                    [b.session_id] if b.session_id else [], [s.title or ''], '', b.day,
                    b.start_time, b.end_time,
                    'Booking of "' + (resource.name or '') + '" for "' + (s.title or '')
                    + '" is outside its availability: ' + '; '.join(problems) + '.',
                    {'suggestions': _free_resource_alternatives(
                        event, resource.kind or '', b.day, window, resource.id, bookings),
                     'timeSuggestions': [], 'suggestion': None})
        deadline = parse_day_time(s.resource_deadline or '')
        if deadline and deadline < datetime.utcnow():
            unbooked = [rid for rid in (s.required_resource_ids or [])
                        if not any(b.resource_id == rid for b in bookings_by_session)]
            if unbooked:
                names = [resources[rid].name if rid in resources else rid for rid in unbooked]
                add('Impossible deadline', 'Critical', '', '', [s.id], [s.title or ''], '',
                    s.day, s.start_time, s.end_time,
                    'Resource deadline for "' + (s.title or '') + '" ('
                    + str(s.resource_deadline) + ') has passed and '
                    + str(len(unbooked)) + ' required resource(s) are still unbooked: '
                    + ', '.join(names) + '.',
                    {'suggestions': [], 'timeSuggestions': [], 'suggestion': None})
    return found


def _group_by(rows, key_fn):
    grouped = {}
    for row in rows:
        grouped.setdefault(key_fn(row), []).append(row)
    return grouped


def pair_window_safe(a, b):
    start = min(a.start_time, b.start_time)
    end = max(a.end_time, b.end_time)
    return day_window(a.day, start, end) or (0, 0)


def _run_validation(event):
    detected = _detect_conflicts(event)
    seen = set()
    now = datetime.utcnow()
    severity_rank = {'Critical': 0, 'Warning': 1}
    for spec in sorted(detected, key=lambda c: (c['fingerprint'],)):
        fingerprint = spec['fingerprint']
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        row = ScheduleConflict.query.filter_by(event_id=event.id, fingerprint=fingerprint).first()
        created = row is None
        if created:
            row = ScheduleConflict(event_id=event.id, fingerprint=fingerprint,
                                   detected_at=now)
            db.session.add(row)
        row.conflict_type = spec['conflict_type']
        row.severity = spec['severity']
        row.resource_id = spec['resource_id']
        row.resource_name = spec['resource_name']
        row.session_ids = spec['session_ids']
        row.session_titles = spec['session_titles']
        row.person = spec['person']
        row.day = spec['day']
        row.start_time = spec['start_time']
        row.end_time = spec['end_time']
        row.message = spec['message']
        row.detail = spec['detail']
        row.status = 'Open'
        row.resolution = ''
        row.resolved_at = None
        row.resolved_by = ''
        if created:
            row.detected_at = now
    db.session.flush()
    for row in ScheduleConflict.query.filter_by(event_id=event.id, status='Open').all():
        if (row.fingerprint or '') not in seen:
            row.status = 'Resolved'
            row.resolution = 'Auto: condition cleared'
            row.resolved_at = now
    db.session.commit()
    rows = ScheduleConflict.query.filter_by(event_id=event.id, status='Open').all()
    rows.sort(key=lambda c: (severity_rank.get(c.severity, 2), c.conflict_type or '',
                             c.day or '', c.start_time or '', c.id or ''))
    return rows


@scheduling_bp.route('/events/<event_id>/sessions', methods=['GET'])
def list_sessions(event_id):
    event = Event.query.get(event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _auth_user()
    if err:
        return err
    manager = can_manage_event(user, event)
    rows = Session.query.filter_by(event_id=event.id).all()
    if not manager:
        rows = [s for s in rows if (s.status or '') == 'Published']
    return jsonify([session_json(s) for s in _sort_sessions(rows)])


@scheduling_bp.route('/events/<event_id>/sessions', methods=['POST'])
def create_session(event_id):
    event = Event.query.get(event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    row = Session(event_id=event.id, status='Draft')
    problem = _apply_session_payload(row, payload, event, creating=True)
    if problem:
        return problem
    db.session.add(row)
    db.session.commit()
    audit('Session created', user, target=(event.title or '') + ' / ' + row.title)
    return jsonify(session_json(row)), 201


@scheduling_bp.route('/sessions/<session_id>', methods=['GET'])
def get_session(session_id):
    row = Session.query.get(session_id)
    if not row:
        return _error('Session not found.', 404)
    user, err = _auth_user()
    if err:
        return err
    event = Event.query.get(row.event_id)
    if not event or not can_manage_event(user, event):
        if (row.status or '') != 'Published':
            return _error('Session not found.', 404)
    return jsonify(session_json(row))


@scheduling_bp.route('/sessions/<session_id>', methods=['PUT', 'PATCH'])
def update_session(session_id):
    row = Session.query.get(session_id)
    if not row:
        return _error('Session not found.', 404)
    event = Event.query.get(row.event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    problem = _apply_session_payload(row, payload, event)
    if problem:
        return problem
    db.session.commit()
    audit('Session updated', user, target=(event.title or '') + ' / ' + row.title)
    return jsonify(session_json(row))


@scheduling_bp.route('/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    row = Session.query.get(session_id)
    if not row:
        return _error('Session not found.', 404)
    event = Event.query.get(row.event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    title = row.title or ''
    ResourceBooking.query.filter_by(session_id=row.id).delete()
    db.session.delete(row)
    db.session.commit()
    audit('Session deleted', user, target=(event.title or '') + ' / ' + title)
    return jsonify({'ok': True})


@scheduling_bp.route('/events/<event_id>/venues', methods=['GET'])
def list_venues(event_id):
    event = Event.query.get(event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _auth_user()
    if err:
        return err
    rows = Venue.query.filter_by(event_id=event.id).order_by(Venue.name.asc()).all()
    return jsonify([venue_json(v) for v in rows])


def _apply_venue_payload(row, payload, event, creating=False):
    if creating or 'name' in payload:
        name = str(payload.get('name') or '').strip()
        if not name:
            return _error('Venue name is required.', 400)
        row.name = name[:200]
    for key, (attr, limit) in {'address': ('address', 300), 'city': ('city', 120),
                               'mapUrl': ('map_url', 400), 'directions': ('directions', 400),
                               'accessibility': ('accessibility', 2000)}.items():
        if key in payload and payload[key] is not None:
            setattr(row, attr, str(payload[key])[:limit])
    if 'capacity' in payload:
        row.capacity = max(0, parse_int(payload.get('capacity'), row.capacity or 0))
    for key, attr in (('latitude', 'latitude'), ('longitude', 'longitude')):
        if key in payload:
            value = payload.get(key)
            try:
                setattr(row, attr, float(value) if value is not None and value != '' else None)
            except (TypeError, ValueError):
                return _error(key + ' must be a number.', 400)
    if 'isPrimary' in payload:
        row.is_primary = parse_bool(payload.get('isPrimary'))
    return None


@scheduling_bp.route('/events/<event_id>/venues', methods=['POST'])
def create_venue(event_id):
    event = Event.query.get(event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    row = Venue(event_id=event.id)
    problem = _apply_venue_payload(row, payload, event, creating=True)
    if problem:
        return problem
    db.session.add(row)
    db.session.commit()
    audit('Venue created', user, target=(event.title or '') + ' / ' + row.name)
    return jsonify(venue_json(row)), 201


@scheduling_bp.route('/venues/<venue_id>', methods=['PUT', 'PATCH'])
def update_venue(venue_id):
    row = Venue.query.get(venue_id)
    if not row:
        return _error('Venue not found.', 404)
    event = Event.query.get(row.event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    problem = _apply_venue_payload(row, payload, event)
    if problem:
        return problem
    db.session.commit()
    audit('Venue updated', user, target=(event.title or '') + ' / ' + row.name)
    return jsonify(venue_json(row))


@scheduling_bp.route('/venues/<venue_id>', methods=['DELETE'])
def delete_venue(venue_id):
    row = Venue.query.get(venue_id)
    if not row:
        return _error('Venue not found.', 404)
    event = Event.query.get(row.event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    name = row.name or ''
    db.session.delete(row)
    db.session.commit()
    audit('Venue deleted', user, target=(event.title or '') + ' / ' + name)
    return jsonify({'ok': True})


def _apply_resource_payload(row, payload, event, creating=False):
    if creating or 'name' in payload:
        name = str(payload.get('name') or '').strip()
        if not name:
            return _error('Resource name is required.', 400)
        row.name = name[:200]
    if 'kind' in payload:
        kind = str(payload.get('kind') or '').strip()
        if kind not in RESOURCE_KINDS:
            return _error('Resource kind must be one of: ' + ', '.join(RESOURCE_KINDS) + '.', 400)
        row.kind = kind
    if 'venueId' in payload:
        venue_id = str(payload.get('venueId') or '').strip()
        if venue_id:
            venue = Venue.query.get(venue_id)
            if not venue or venue.event_id != event.id:
                return _error('Venue must belong to the same event.', 400)
        row.venue_id = venue_id
    if 'capacity' in payload:
        row.capacity = max(0, parse_int(payload.get('capacity'), row.capacity or 0))
    if 'location' in payload and payload.get('location') is not None:
        row.location = str(payload.get('location'))[:200]
    if 'availableDays' in payload:
        value = payload.get('availableDays')
        if not isinstance(value, list):
            return _error('availableDays must be a list of YYYY-MM-DD dates.', 400)
        days = []
        for day in value[:60]:
            day = str(day or '').strip()
            if not day:
                continue
            if not valid_day(day):
                return _error('availableDays entries must be valid YYYY-MM-DD dates.', 400)
            days.append(day)
        row.available_days = days
    for key, attr in (('availableFrom', 'available_from'), ('availableTo', 'available_to')):
        if key in payload:
            value = str(payload.get(key) or '').strip()
            if value and not valid_time(value):
                return _error(key + ' must be a valid 24h HH:MM time.', 400)
            setattr(row, attr, value)
    if row.available_from and row.available_to and valid_time(row.available_from) \
            and valid_time(row.available_to) and to_minutes(row.available_to) <= to_minutes(row.available_from):
        return _error('availableTo must be after availableFrom.', 400)
    for key, attr in (('setupMinutes', 'setup_minutes'), ('teardownMinutes', 'teardown_minutes')):
        if key in payload:
            setattr(row, attr, max(0, parse_int(payload.get(key), getattr(row, attr) or 0)))
    if 'status' in payload:
        status = str(payload.get('status') or '').strip()
        if status not in RESOURCE_STATUSES:
            return _error('Resource status must be one of: ' + ', '.join(RESOURCE_STATUSES) + '.', 400)
        row.status = status
    if 'notes' in payload and payload.get('notes') is not None:
        row.notes = str(payload.get('notes'))[:2000]
    return None


@scheduling_bp.route('/events/<event_id>/resources', methods=['GET'])
def list_resources(event_id):
    event = Event.query.get(event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _auth_user()
    if err:
        return err
    rows = Resource.query.filter_by(event_id=event.id).order_by(Resource.name.asc()).all()
    return jsonify([resource_json(r) for r in rows])


@scheduling_bp.route('/events/<event_id>/resources', methods=['POST'])
def create_resource(event_id):
    event = Event.query.get(event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    row = Resource(event_id=event.id, status='Active')
    problem = _apply_resource_payload(row, payload, event, creating=True)
    if problem:
        return problem
    db.session.add(row)
    db.session.commit()
    audit('Resource created', user, target=(event.title or '') + ' / ' + row.name)
    return jsonify(resource_json(row)), 201


@scheduling_bp.route('/resources/<resource_id>', methods=['PUT', 'PATCH'])
def update_resource(resource_id):
    row = Resource.query.get(resource_id)
    if not row:
        return _error('Resource not found.', 404)
    event = Event.query.get(row.event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    problem = _apply_resource_payload(row, payload, event)
    if problem:
        return problem
    db.session.commit()
    audit('Resource updated', user, target=(event.title or '') + ' / ' + row.name)
    return jsonify(resource_json(row))


@scheduling_bp.route('/resources/<resource_id>', methods=['DELETE'])
def delete_resource(resource_id):
    row = Resource.query.get(resource_id)
    if not row:
        return _error('Resource not found.', 404)
    event = Event.query.get(row.event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    name = row.name or ''
    ResourceBooking.query.filter_by(resource_id=row.id).delete()
    db.session.delete(row)
    db.session.commit()
    audit('Resource deleted', user, target=(event.title or '') + ' / ' + name)
    return jsonify({'ok': True})


@scheduling_bp.route('/events/<event_id>/schedule', methods=['GET'])
def event_schedule(event_id):
    event = Event.query.get(event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _auth_user()
    if err:
        return err
    manager = can_manage_event(user, event)
    sessions = Session.query.filter_by(event_id=event.id).all()
    if not manager:
        sessions = [s for s in sessions if (s.status or '') == 'Published']
    sessions = _sort_sessions(sessions)
    venues = Venue.query.filter_by(event_id=event.id).order_by(Venue.name.asc()).all()
    resources = Resource.query.filter_by(event_id=event.id).order_by(Resource.name.asc()).all()
    bookings = _open_bookings(event.id) if manager else []
    bookings.sort(key=lambda b: ((b.day or ''), (b.start_time or ''), b.id or ''))
    days = sorted({s.day for s in sessions if s.day})
    return jsonify({'days': days,
                    'sessions': [session_json(s) for s in sessions],
                    'venues': [venue_json(v) for v in venues],
                    'resources': [resource_json(r) for r in resources],
                    'bookings': [booking_json(b) for b in bookings]})


@scheduling_bp.route('/events/<event_id>/schedule/validate', methods=['POST'])
def validate_schedule(event_id):
    event = Event.query.get(event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    rows = _run_validation(event)
    audit('Schedule validated', user, target=event.title)
    return jsonify([conflict_json(c) for c in rows])


@scheduling_bp.route('/events/<event_id>/conflicts', methods=['GET'])
def list_conflicts(event_id):
    event = Event.query.get(event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    query = ScheduleConflict.query.filter_by(event_id=event.id)
    status = (request.args.get('status') or '').strip()
    if status:
        query = query.filter_by(status=status)
    rows = query.order_by(ScheduleConflict.detected_at.asc()).all()
    return jsonify([conflict_json(c) for c in rows])


def _conflict_or_404(conflict_id):
    conflict = ScheduleConflict.query.get(conflict_id)
    if not conflict:
        return None, None, _error('Conflict not found.', 404)
    event = Event.query.get(conflict.event_id)
    if not event:
        return None, None, _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return None, None, err
    return conflict, user, None


@scheduling_bp.route('/conflicts/<conflict_id>/resolve', methods=['POST'])
def resolve_conflict(conflict_id):
    conflict, user, err = _conflict_or_404(conflict_id)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    resolution = str(payload.get('resolution') or payload.get('message') or '').strip()
    if not resolution:
        return _error('A resolution note is required.', 400)
    conflict.status = 'Resolved'
    conflict.resolution = resolution[:500]
    conflict.resolved_by = user.name or ''
    conflict.resolved_at = datetime.utcnow()
    db.session.commit()
    audit('Schedule conflict resolved', user, target=conflict.conflict_type)
    return jsonify(conflict_json(conflict))


@scheduling_bp.route('/conflicts/<conflict_id>/dismiss', methods=['POST'])
def dismiss_conflict(conflict_id):
    conflict, user, err = _conflict_or_404(conflict_id)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    note = str(payload.get('resolution') or payload.get('reason') or '').strip()
    conflict.status = 'Dismissed'
    conflict.resolution = note[:500] or 'Dismissed'
    conflict.resolved_by = user.name or ''
    conflict.resolved_at = datetime.utcnow()
    db.session.commit()
    audit('Schedule conflict dismissed', user, target=conflict.conflict_type)
    return jsonify(conflict_json(conflict))


@scheduling_bp.route('/conflicts/<conflict_id>/apply', methods=['POST'])
def apply_conflict(conflict_id):
    conflict, user, err = _conflict_or_404(conflict_id)
    if err:
        return err
    event = Event.query.get(conflict.event_id)
    payload = request.get_json(silent=True) or {}
    suggestion = payload.get('suggestion')
    if not isinstance(suggestion, dict):
        picked = {key: payload.get(key) for key in
                  ('sessionId', 'day', 'startTime', 'endTime', 'resourceId', 'venueId')
                  if key in payload}
        suggestion = picked
    if not suggestion:
        detail = conflict.detail if isinstance(conflict.detail, dict) else {}
        stored = detail.get('suggestion')
        suggestion = stored if isinstance(stored, dict) else {}
    if not suggestion:
        return _error('This conflict has no suggestion to apply.', 400)
    session_id = str(suggestion.get('sessionId') or '').strip()
    resource_id = str(suggestion.get('resourceId') or '').strip()
    if not session_id and not resource_id:
        return _error('A suggestion must include a sessionId or a resourceId.', 400)
    confirm = parse_bool(payload.get('confirmPublished'))
    target = None
    if session_id:
        target = Session.query.get(session_id)
        if not target or target.event_id != event.id:
            return _error('Session not found for this event.', 404)
        if (target.status or '') == 'Published' and not confirm:
            return _error('Session "' + (target.title or '') + '" is Published. '
                          'Resend with confirmPublished:true to move a published session.', 409)
        day = str(suggestion.get('day') or target.day or '').strip()
        start = str(suggestion.get('startTime') or target.start_time or '').strip()
        end = str(suggestion.get('endTime') or target.end_time or '').strip()
        problem = _check_window(day, start, end, label='Session')
        if problem:
            return _error(problem, 400)
        target.day = day
        target.start_time = start
        target.end_time = end
        target.updated_at = datetime.utcnow()
        for booking in ResourceBooking.query.filter_by(session_id=target.id).all():
            if (booking.status or '') in BOOKING_STATUSES_OPEN:
                booking.day = day
                booking.start_time = start
                booking.end_time = end
    if resource_id:
        new_resource = Resource.query.get(resource_id)
        if not new_resource or new_resource.event_id != event.id:
            return _error('Resource must belong to the same event.', 400)
        old_resource_id = conflict.resource_id or ''
        moved = 0
        for sid in (conflict.session_ids or []):
            for booking in ResourceBooking.query.filter_by(session_id=sid,
                                                           resource_id=old_resource_id).all():
                if (booking.status or '') in BOOKING_STATUSES_OPEN:
                    booking.resource_id = new_resource.id
                    moved += 1
        if moved == 0:
            first_session_id = (conflict.session_ids or [session_id] or [''])[0]
            source = Session.query.get(first_session_id) if first_session_id else None
            if source:
                db.session.add(ResourceBooking(
                    event_id=event.id, session_id=source.id, resource_id=new_resource.id,
                    day=conflict.day or source.day, start_time=conflict.start_time or source.start_time,
                    end_time=conflict.end_time or source.end_time,
                    setup_minutes=source.setup_minutes or 0,
                    teardown_minutes=source.teardown_minutes or 0, status='Planned'))
    conflict.status = 'Resolved'
    conflict.resolution = 'Applied suggestion'
    conflict.resolved_by = user.name or ''
    conflict.resolved_at = datetime.utcnow()
    db.session.commit()
    open_rows = _run_validation(event)
    audit('Conflict suggestion applied', user, target=event.title)
    return jsonify({'ok': True,
                    'session': session_json(target) if target else None,
                    'conflicts': [conflict_json(c) for c in open_rows]})


@scheduling_bp.route('/sessions/<session_id>/bookings', methods=['GET'])
def list_bookings(session_id):
    session = Session.query.get(session_id)
    if not session:
        return _error('Session not found.', 404)
    event = Event.query.get(session.event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    rows = ResourceBooking.query.filter_by(session_id=session.id) \
        .order_by(ResourceBooking.day.asc(), ResourceBooking.start_time.asc()).all()
    return jsonify([booking_json(b) for b in rows])


@scheduling_bp.route('/sessions/<session_id>/bookings', methods=['POST'])
def create_booking(session_id):
    session = Session.query.get(session_id)
    if not session:
        return _error('Session not found.', 404)
    event = Event.query.get(session.event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    resource_id = str(payload.get('resourceId') or '').strip()
    if not resource_id:
        return _error('A resourceId is required.', 400)
    resource = Resource.query.get(resource_id)
    if not resource or resource.event_id != event.id:
        return _error('Resource must belong to the same event.', 400)
    day = str(payload.get('day') or session.day or '').strip()
    start = str(payload.get('startTime') or session.start_time or '').strip()
    end = str(payload.get('endTime') or session.end_time or '').strip()
    problem = _check_window(day, start, end, label='Booking')
    if problem:
        return _error(problem, 400)
    setup = parse_int(payload.get('setupMinutes'), session.setup_minutes or 0)
    teardown = parse_int(payload.get('teardownMinutes'), session.teardown_minutes or 0)
    window = day_window(day, start, end, setup, teardown)
    for existing in ResourceBooking.query.filter_by(resource_id=resource.id, day=day).all():
        if (existing.status or '') not in BOOKING_STATUSES_OPEN:
            continue
        if not overlaps(_booking_window(existing), window):
            continue
        other = Session.query.get(existing.session_id)
        other_title = (other.title if other else '') or 'another session'
        return _error('Resource "' + (resource.name or resource.id) + '" is already booked by "'
                      + other_title + '" from ' + (existing.start_time or '') + ' to '
                      + (existing.end_time or '') + ' on ' + day
                      + ' (including setup and teardown buffers).', 409)
    status = str(payload.get('status') or 'Planned').strip()
    if status not in BOOKING_STATUSES:
        status = 'Planned'
    row = ResourceBooking(event_id=event.id, session_id=session.id, resource_id=resource.id,
                          day=day, start_time=start, end_time=end,
                          setup_minutes=max(0, setup), teardown_minutes=max(0, teardown),
                          status=status, notes=str(payload.get('notes') or '')[:300])
    db.session.add(row)
    db.session.commit()
    audit('Resource booked', user,
          target=(event.title or '') + ' / ' + (resource.name or '') + ' / ' + (session.title or ''))
    return jsonify(booking_json(row)), 201


@scheduling_bp.route('/bookings/<booking_id>', methods=['DELETE'])
def delete_booking(booking_id):
    row = ResourceBooking.query.get(booking_id)
    if not row:
        return _error('Booking not found.', 404)
    event = Event.query.get(row.event_id)
    if not event:
        return _error('Event not found.', 404)
    user, err = _guard(event)
    if err:
        return err
    db.session.delete(row)
    db.session.commit()
    audit('Booking released', user, target=(event.title or ''))
    return jsonify({'ok': True})
