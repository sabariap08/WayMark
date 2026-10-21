"""Integrations: webhooks, ICS calendar, import/export, public API, API keys."""
import csv
import hmac
import io
import re
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlparse

from flask import Blueprint, Response, jsonify, request, send_file
from openpyxl import Workbook, load_workbook

from extensions import db
from models import (BudgetLine, Event, PlatformSetting, Registration, Session, Sponsor,
                    Task, User, Venue, Webhook, WebhookDelivery)
from utils.helpers import audit, refresh_event_counts, ticket_code
from utils.security import (can_manage_event, current_claims, current_user, is_admin,
                           require_admin, require_auth, require_event_manager)
from utils.serializers import event_json, registration_json
from utils import webhooks

integrations_bp = Blueprint('integrations', __name__)

VALID_EVENT_STATUSES_PUBLIC = ('Published', 'Registration open', 'Ongoing')
TZ_OFFSET_KOLKATA = '+05:30'


def _settings_row():
    """The single platform-settings row (same convention as blueprints.admin)."""
    row = PlatformSetting.query.get(1)
    if not row:
        row = PlatformSetting(id=1, data={})
        db.session.add(row)
        db.session.commit()
    return row


def _stored_public_api_key():
    row = PlatformSetting.query.get(1)
    data = (row.data or {}) if row else {}
    key = data.get('publicApiKey')
    return key if isinstance(key, str) and key else ''


def _ensure_public_api_key():
    """Lazily mint the public API key on first admin access."""
    row = _settings_row()
    data = dict(row.data or {})
    key = data.get('publicApiKey')
    if isinstance(key, str) and key:
        return key
    key = 'wm_' + secrets.token_urlsafe(32)
    data['publicApiKey'] = key
    row.data = data
    row.updated_at = datetime.utcnow()
    db.session.commit()
    return key


@integrations_bp.route('/webhooks', methods=['GET'])
@require_admin
def list_webhooks():
    hooks = Webhook.query.order_by(Webhook.created_at.desc()).all()
    result = []
    for h in hooks:
        result.append({
            'id': h.id, 'eventId': h.event_id or '', 'url': h.url or '',
            'events': h.events or [], 'active': bool(h.active), 'secretSet': bool(h.secret),
            'createdBy': h.created_by or '',
            'createdAt': h.created_at.isoformat() + 'Z' if h.created_at else '',
        })
    return jsonify(result)


@integrations_bp.route('/webhooks', methods=['POST'])
@require_admin
def create_webhook():
    payload = request.get_json(silent=True) or {}
    url = str(payload.get('url') or '').strip()
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        return jsonify({'message': 'A valid http(s) URL is required.'}), 400
    events = payload.get('events') or []
    if not isinstance(events, list):
        events = []
    event_id = payload.get('eventId') or None
    secret = payload.get('secret') or secrets.token_urlsafe(32)
    hook = Webhook(url=url, secret=secret, events=events, event_id=event_id, active=True,
                   created_by=(current_user().id if current_user() else None))
    db.session.add(hook)
    db.session.commit()
    audit('Webhook created', current_user(), target=url)
    return jsonify({
        'id': hook.id, 'eventId': hook.event_id or '', 'url': hook.url or '',
        'events': hook.events or [], 'active': bool(hook.active), 'secretSet': True,
        'secretPlain': secret, 'createdAt': hook.created_at.isoformat() + 'Z' if hook.created_at else '',
    }), 201


@integrations_bp.route('/webhooks/<id>', methods=['DELETE'])
@require_admin
def delete_webhook(id):
    hook = Webhook.query.get(id)
    if not hook:
        return jsonify({'message': 'Webhook not found.'}), 404
    db.session.delete(hook)
    db.session.commit()
    audit('Webhook deleted', current_user(), target=hook.url)
    return jsonify({'ok': True})


@integrations_bp.route('/webhooks/<id>/test', methods=['POST'])
@require_admin
def test_webhook(id):
    hook = Webhook.query.get(id)
    if not hook:
        return jsonify({'message': 'Webhook not found.'}), 404
    webhooks.emit('webhook.test', {'message': 'WayMark webhook test'}, event_id=hook.event_id)
    audit('Webhook test triggered', current_user(), target=hook.url)
    return jsonify({'ok': True})


@integrations_bp.route('/webhooks/<id>/deliveries', methods=['GET'])
@require_admin
def list_webhook_deliveries(id):
    hook = Webhook.query.get(id)
    if not hook:
        return jsonify({'message': 'Webhook not found.'}), 404
    deliveries = WebhookDelivery.query.filter_by(webhook_id=id).order_by(WebhookDelivery.created_at.desc()).limit(100).all()
    result = []
    for d in deliveries:
        result.append({
            'id': d.id, 'webhookId': d.webhook_id, 'eventType': d.event_type, 'status': d.status,
            'attempts': d.attempts or 0, 'responseCode': d.response_code, 'error': d.error or '',
            'createdAt': d.created_at.isoformat() + 'Z' if d.created_at else '',
            'deliveredAt': d.delivered_at.isoformat() + 'Z' if d.delivered_at else '',
        })
    return jsonify(result)


@integrations_bp.route('/webhooks/deliveries/<delivery_id>/retry', methods=['POST'])
@require_admin
def retry_webhook_delivery(delivery_id):
    delivery = webhooks.deliver(delivery_id, force=True)
    if not delivery:
        return jsonify({'message': 'Delivery not found.'}), 404
    return jsonify({
        'id': delivery.id, 'status': delivery.status, 'attempts': delivery.attempts or 0,
        'responseCode': delivery.response_code, 'error': delivery.error or '',
    })


# --------------------------------------------------------------------------- #
# ICS calendars (RFC 5545)                                                     #
# --------------------------------------------------------------------------- #

ICS_PRODID = '-//WayMark//Event Calendar 1.0//EN'


def _ics_escape(value):
    text = str(value or '')
    text = text.replace('\\', '\\\\')
    text = text.replace('\r\n', '\\n').replace('\r', '\\n').replace('\n', '\\n')
    text = text.replace(';', '\\;').replace(',', '\\,')
    return text


def _fold_ics_line(line):
    """RFC 5545 content-line folding: keep every line <= 75 octets; continuation
    lines begin with a single space. Splits on character boundaries so multi-byte
    UTF-8 sequences are never torn apart."""
    if len(line.encode('utf-8')) <= 75:
        return line
    parts = []
    current = ''
    current_len = 0
    for ch in line:
        ch_len = len(ch.encode('utf-8'))
        if current and current_len + ch_len > 75:
            parts.append(current)
            current = ' ' + ch
            current_len = 1 + ch_len
        else:
            current += ch
            current_len += ch_len
    if current:
        parts.append(current)
    return '\r\n'.join(parts)


def _ics_local_to_utc(day, hhmm):
    """Session day + HH:MM is wall-clock time in Asia/Kolkata (UTC+05:30, the
    WayMark platform default). Converted to UTC so the feed is unambiguous
    without shipping a VTIMEZONE block."""
    try:
        dt = datetime.strptime((day or '') + ' ' + (hhmm or ''), '%Y-%m-%d %H:%M')
    except ValueError:
        return None
    return (dt - timedelta(hours=5, minutes=30)).strftime('%Y%m%dT%H%M%SZ')


def _first_hhmm(text):
    match = re.search(r'(\d{1,2}):(\d{2})', str(text or ''))
    if not match:
        return ''
    return match.group(1).zfill(2) + ':' + match.group(2)


def _render_ics(vevent_lines):
    lines = ['BEGIN:VCALENDAR',
             'VERSION:2.0',
             'PRODID:' + ICS_PRODID,
             'CALSCALE:GREGORIAN',
             'METHOD:PUBLISH',
             'X-WR-CALNAME:WayMark',
             'X-WAYMARK-TIMEZONE:Asia/Kolkata (UTC+05:30) assumed for all local times']
    for props in vevent_lines:
        lines.extend(props)
    lines.append('END:VCALENDAR')
    return '\r\n'.join(_fold_ics_line(line) for line in lines) + '\r\n'


def _ics_dtstamp():
    return datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')


def _safe_name(title):
    return (''.join(ch if ch.isalnum() or ch in '-_' else '-' for ch in (title or 'event')).strip('-').lower()) or 'event'


@integrations_bp.route('/events/<event_id>/calendar.ics', methods=['GET'])
def event_calendar_ics(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if (event.status or '') not in VALID_EVENT_STATUSES_PUBLIC:
        user = current_user()
        if not user:
            return jsonify({'message': 'Authentication required.'}), 401
        if not can_manage_event(user, event):
            return jsonify({'message': 'This calendar is only available for published events.'}), 403
    sessions = Session.query.filter_by(event_id=event.id, status='Published') \
        .order_by(Session.day.asc(), Session.start_time.asc(), Session.order_index.asc()).all()
    stamp = _ics_dtstamp()
    base_url = (event.website or '').strip() or (request.host_url.rstrip('/') + '/events/' + event.id)
    vevents = []
    for s in sessions:
        props = ['BEGIN:VEVENT',
                 'UID:' + ((s.id or secrets.token_hex(8)) + '@waymark'),
                 'DTSTAMP:' + stamp]
        start = _ics_local_to_utc(s.day, s.start_time)
        end = _ics_local_to_utc(s.day, s.end_time)
        if start:
            props.append('DTSTART:' + start)
        if end and end > start:
            props.append('DTEND:' + end)
        props.append('SUMMARY:' + _ics_escape(s.title))
        props.append('LOCATION:' + _ics_escape(s.room_name or event.location or ''))
        description = (s.description or '').strip()
        extras = []
        if s.session_type:
            extras.append(s.session_type)
        if s.track:
            extras.append('Track: ' + s.track)
        if extras:
            description = description + ('\n' if description else '') + ' | '.join(extras)
        props.append('DESCRIPTION:' + _ics_escape(description))
        props.append('URL:' + _ics_escape(base_url))
        props.append('END:VEVENT')
        vevents.append(props)
    body = _render_ics(vevents)
    return Response(body, content_type='text/calendar; charset=utf-8',
                    headers={'Content-Disposition': 'attachment; filename="'
                             + _safe_name(event.title) + '-calendar.ics"'})


@integrations_bp.route('/me/calendar.ics', methods=['GET'])
@require_auth
def my_calendar_ics():
    user = current_user()
    regs = Registration.query.filter(Registration.user_id == user.id,
                                     Registration.status.in_(['Confirmed', 'Registered'])).all()
    stamp = _ics_dtstamp()
    vevents = []
    for reg in regs:
        event = Event.query.get(reg.event_id) if reg.event_id else None
        title = (event.title if event else reg.event_title) or 'WayMark event'
        date_text = ((event.date if event else reg.date) or '')[:10]
        time_text = (event.time if event else reg.time) or ''
        props = ['BEGIN:VEVENT',
                 'UID:' + ((reg.id or secrets.token_hex(8)) + '@waymark'),
                 'DTSTAMP:' + stamp]
        start_hhmm = _first_hhmm(time_text)
        start = _ics_local_to_utc(date_text, start_hhmm) if start_hhmm else None
        if start:
            props.append('DTSTART:' + start)
            later = re.findall(r'(\d{1,2}):(\d{2})', str(time_text))
            end_hhmm = (later[1][0].zfill(2) + ':' + later[1][1]) if len(later) > 1 else ''
            end = _ics_local_to_utc(date_text, end_hhmm) if end_hhmm else None
            if end and end > start:
                props.append('DTEND:' + end)
        props.append('SUMMARY:' + _ics_escape(title))
        props.append('LOCATION:' + _ics_escape((event.location if event else reg.location) or ''))
        props.append('DESCRIPTION:' + _ics_escape('Ticket: ' + (reg.ticket_code or '')))
        props.append('URL:' + _ics_escape(request.host_url.rstrip('/') + '/events/' + (reg.event_id or '')))
        props.append('END:VEVENT')
        vevents.append(props)
    body = _render_ics(vevents)
    return Response(body, content_type='text/calendar; charset=utf-8',
                    headers={'Content-Disposition': 'attachment; filename="my-waymark-calendar.ics"'})


# --------------------------------------------------------------------------- #
# Bulk registration import                                                     #
# --------------------------------------------------------------------------- #

IMPORT_COLUMN_ALIASES = {
    'name': 'name', 'full name': 'name', 'fullname': 'name', 'participant name': 'name',
    'email': 'email', 'email address': 'email', 'e-mail': 'email',
    'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone', 'contact number': 'phone',
    'college': 'college', 'company': 'college', 'organisation': 'college',
    'organization': 'college', 'institution': 'college', 'school': 'college',
    'category': 'category', 'track': 'category', 'pass type': 'category',
    'team': 'team', 'team name': 'team', 'teamname': 'team',
    'notes': 'notes', 'note': 'notes', 'comments': 'notes', 'remarks': 'notes',
}
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _rows_from_import():
    """Returns (headers_canonical_list, rows_list) where each row is a list of
    cell strings aligned with the canonical headers. Raises ValueError."""
    upload = request.files.get('file')
    if upload is not None:
        filename = (upload.filename or '').lower()
        raw = upload.read()
        if filename.endswith('.xlsx') or filename.endswith('.xlsm'):
            workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
            sheet = workbook.active
            grid = [[('' if cell is None else str(cell)) for cell in row]
                    for row in sheet.iter_rows(values_only=True)]
        else:
            text = raw.decode('utf-8-sig', errors='replace')
            grid = [list(row) for row in csv.reader(io.StringIO(text))]
    else:
        payload = request.get_json(silent=True) or {}
        grid = payload.get('rows')
        if not isinstance(grid, list) or not grid:
            raise ValueError('Upload a CSV/XLSX file in the "file" field or provide JSON rows.')
        grid = [[('' if cell is None else str(cell)) for cell in row] for row in grid
                if isinstance(row, (list, tuple))]
        if not grid:
            raise ValueError('No rows were provided.')

    header_row = grid[0] or []
    canonical = [IMPORT_COLUMN_ALIASES.get(str(h or '').strip().lower(), '') for h in header_row]
    data_rows = []
    for row in grid[1:]:
        cells = [('' if c is None else str(c).strip()) for c in (row or [])]
        if not any(cells):
            continue  # skip blank spacer rows entirely
        data_rows.append(cells)
    return canonical, data_rows


def _validate_import_rows(canonical, data_rows, event):
    """Returns (prepared, errors, skipped_duplicates).
    prepared: [{'row': n, 'name', 'email', 'phone', 'college', 'category', 'team', 'notes'}]
    Row numbers are spreadsheet-style (header = row 1, first data row = row 2)."""
    prepared = []
    errors = []
    skipped_duplicates = 0
    seen_emails = set()
    index = {name: i for i, name in enumerate(canonical) if name}

    def cell(row, field):
        i = index.get(field)
        return (row[i] or '').strip() if i is not None and i < len(row) else ''

    for offset, row in enumerate(data_rows):
        row_number = offset + 2
        name = cell(row, 'name')
        email = cell(row, 'email').lower()
        if not name:
            errors.append({'row': row_number, 'column': 'name', 'message': 'Name is required.'})
        if not email:
            errors.append({'row': row_number, 'column': 'email', 'message': 'Email is required.'})
        elif not EMAIL_RE.match(email):
            errors.append({'row': row_number, 'column': 'email', 'message': 'Enter a valid email address.'})
        elif email in seen_emails:
            skipped_duplicates += 1
            continue
        else:
            seen_emails.add(email)
        if errors and any(e['row'] == row_number for e in errors):
            continue
        already = Registration.query.filter_by(event_id=event.id, user_email=email) \
            .filter(Registration.status.notin_(['Cancelled', 'Declined'])).first()
        if already:
            skipped_duplicates += 1
            prepared.append({'row': row_number, 'name': name, 'email': email, 'duplicate': True})
            continue
        prepared.append({
            'row': row_number, 'name': name, 'email': email,
            'phone': cell(row, 'phone'), 'college': cell(row, 'college'),
            'category': cell(row, 'category') or (event.category or ''),
            'team': cell(row, 'team'), 'notes': cell(row, 'notes'), 'duplicate': False,
        })
    valid = len([p for p in prepared if not p.get('duplicate')])
    return prepared, errors, skipped_duplicates, valid


@integrations_bp.route('/events/<event_id>/import/registrations', methods=['POST'])
@require_event_manager('event_id')
def import_registrations(event_id, _event=None):
    event = _event
    payload_mode = ''
    if request.files.get('file') is not None or request.form.get('file') is not None:
        payload_mode = str(request.form.get('mode') or '')
    else:
        payload_mode = str((request.get_json(silent=True) or {}).get('mode') or '')
    mode = payload_mode.strip().lower() or 'validate'
    if mode not in ('validate', 'commit'):
        mode = 'validate'

    try:
        canonical, data_rows = _rows_from_import()
    except ValueError as exc:
        return jsonify({'message': str(exc)}), 400
    except Exception:
        return jsonify({'message': 'Could not read the uploaded file. Use CSV or XLSX.'}), 400

    prepared, errors, skipped_duplicates, valid = _validate_import_rows(canonical, data_rows, event)

    created = 0
    if mode == 'commit':
        for item in prepared:
            if item.get('duplicate'):
                continue
            user = User.query.filter_by(email=item['email']).first()
            reg = Registration(
                user_id=(user.id if user else ''),
                user_name=(user.name if user else item['name']),
                user_email=item['email'],
                event_id=event.id, event_title=event.title,
                category=item['category'] or event.category,
                date=event.date, time=event.time, location=event.location,
                status='Confirmed', ticket_code=ticket_code(),
            )
            db.session.add(reg)
            created += 1
        db.session.commit()
        refresh_event_counts(event)
        audit('Registrations imported', current_user(),
              target=event.title + ' (' + str(created) + ' created)')

    return jsonify({
        'total': len(data_rows),
        'valid': valid,
        'errors': errors,
        'created': created,
        'skippedDuplicates': skipped_duplicates,
        'mode': mode,
    })


# --------------------------------------------------------------------------- #
# Per-event exports (distinct from /reports)                                   #
# --------------------------------------------------------------------------- #

def _export_registrations(event):
    rows = Registration.query.filter_by(event_id=event.id) \
        .order_by(Registration.registered_at.asc()).all()
    headers = ['Ticket', 'Name', 'Email', 'Category', 'Status', 'Attendance', 'Registered on']
    data = [[r.ticket_code or '', r.user_name or '', r.user_email or '', r.category or '',
             r.status or '', r.attendance_status or '',
             r.registered_at.strftime('%Y-%m-%d') if r.registered_at else ''] for r in rows]
    return headers, data


def _export_schedule(event):
    rows = Session.query.filter_by(event_id=event.id) \
        .order_by(Session.day.asc(), Session.start_time.asc(), Session.order_index.asc()).all()
    headers = ['Title', 'Type', 'Day', 'Start', 'End', 'Room', 'Track', 'Capacity', 'Status']
    data = [[s.title or '', s.session_type or '', s.day or '', s.start_time or '',
             s.end_time or '', s.room_name or '', s.track or '', str(s.capacity or 0),
             s.status or ''] for s in rows]
    return headers, data


def _export_tasks(event):
    rows = Task.query.filter_by(event_id=event.id).order_by(Task.created_at.asc()).all()
    headers = ['Title', 'Assignee', 'Priority', 'Due', 'Status', 'Description']
    data = [[t.title or '', t.assignee_name or '', t.priority or '',
             t.due_at.strftime('%Y-%m-%d %H:%M') if t.due_at else '', t.status or '',
             (t.description or '')[:200]] for t in rows]
    return headers, data


def _export_budget(event):
    rows = BudgetLine.query.filter_by(event_id=event.id).order_by(BudgetLine.created_at.asc()).all()
    headers = ['Description', 'Kind', 'Amount', 'Currency', 'Date', 'Created by']
    data = [[r.description or '', r.kind or '', str((r.amount_minor or 0) / 100.0),
             r.currency or 'INR', r.date or '', r.created_by or ''] for r in rows]
    return headers, data


def _export_sponsors(event):
    rows = Sponsor.query.filter_by(event_id=event.id).order_by(Sponsor.created_at.asc()).all()
    headers = ['Name', 'Contact', 'Email', 'Phone', 'Package', 'Promised', 'Received', 'Status']
    data = [[s.name or '', s.contact_name or '', s.contact_email or '', s.contact_phone or '',
             s.package or '', str((s.promised_minor or 0) / 100.0),
             str((s.received_minor or 0) / 100.0), s.status or ''] for s in rows]
    return headers, data


EXPORT_BUILDERS = {
    'registrations': _export_registrations,
    'schedule': _export_schedule,
    'tasks': _export_tasks,
    'budget': _export_budget,
    'sponsors': _export_sponsors,
}


@integrations_bp.route('/events/<event_id>/exports/<kind>', methods=['GET'])
@require_event_manager('event_id')
def export_event_data(event_id, kind, _event=None):
    builder = EXPORT_BUILDERS.get(kind)
    if not builder:
        return jsonify({'message': 'Unknown export type: ' + kind}), 404
    fmt = (request.args.get('format') or 'csv').lower()
    if fmt not in ('csv', 'xlsx'):
        return jsonify({'message': 'Format must be csv or xlsx.'}), 400
    headers, data = builder(_event)
    filename = _safe_name(_event.title or 'event') + '-' + kind
    if fmt == 'xlsx':
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = kind.title()
        sheet.append(headers)
        for row in data:
            sheet.append(row)
        buf = io.BytesIO()
        workbook.save(buf)
        buf.seek(0)
        return send_file(buf, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                         as_attachment=True, download_name=filename + '.xlsx')
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(data)
    return send_file(io.BytesIO(buf.getvalue().encode('utf-8-sig')), mimetype='text/csv',
                     as_attachment=True, download_name=filename + '.csv')


# --------------------------------------------------------------------------- #
# Public read-only API (v1) - no participant PII, no money                     #
# --------------------------------------------------------------------------- #

def _require_v1_access():
    """Valid user token OR X-WayMark-Key matching the stored public API key.
    Returns an error response, or None when authorized."""
    key = request.headers.get('X-WayMark-Key') or ''
    if key:
        stored = _stored_public_api_key()
        if stored and hmac.compare_digest(key.strip(), stored):
            return None
        return jsonify({'message': 'Invalid WayMark API key.'}), 401
    if current_user():
        return None
    return jsonify({'message': 'Authentication required.'}), 401


def _public_event_json(event):
    venues = Venue.query.filter_by(event_id=event.id).all()
    session_count = Session.query.filter_by(event_id=event.id, status='Published').count()
    return {
        'id': event.id,
        'title': event.title,
        'category': event.category or '',
        'description': event.description or '',
        'date': event.date or '',
        'time': event.time or '',
        'location': event.location or '',
        'seats': event.seats or 0,
        'status': event.status or '',
        'format': getattr(event, 'format', 'Offline') or 'Offline',
        'timezone': getattr(event, 'timezone', 'Asia/Kolkata') or 'Asia/Kolkata',
        'startDate': getattr(event, 'start_date', '') or '',
        'endDate': getattr(event, 'end_date', '') or '',
        'participation': getattr(event, 'participation', 'individual') or 'individual',
        'regDeadline': event.reg_deadline or '',
        'organizer': event.organizer or '',
        'tags': event.tags or [],
        'capacityNum': event.capacity_num or event.seats or 0,
        'registeredNum': event.registered_num or 0,
        'waitlistNum': event.waitlist_num or 0,
        'sessionCount': session_count,
        'venues': [{'id': v.id, 'name': v.name or '', 'city': v.city or '',
                    'address': v.address or '', 'capacity': v.capacity or 0,
                    'mapUrl': v.map_url or ''} for v in venues],
        'url': request.host_url.rstrip('/') + '/events/' + event.id,
    }


@integrations_bp.route('/v1/events', methods=['GET'])
def public_list_events():
    denied = _require_v1_access()
    if denied:
        return denied
    rows = Event.query.filter(Event.status.in_(list(VALID_EVENT_STATUSES_PUBLIC) + ['Completed'])) \
        .order_by(Event.created_at.desc()).all()
    return jsonify([_public_event_json(e) for e in rows])


@integrations_bp.route('/v1/events/<event_id>', methods=['GET'])
def public_get_event(event_id):
    denied = _require_v1_access()
    if denied:
        return denied
    event = Event.query.get(event_id)
    if not event or (event.status or '') not in tuple(VALID_EVENT_STATUSES_PUBLIC) + ('Completed',):
        return jsonify({'message': 'Event not found.'}), 404
    return jsonify(_public_event_json(event))


@integrations_bp.route('/v1/events/<event_id>/schedule', methods=['GET'])
def public_get_schedule(event_id):
    denied = _require_v1_access()
    if denied:
        return denied
    event = Event.query.get(event_id)
    if not event or (event.status or '') not in tuple(VALID_EVENT_STATUSES_PUBLIC) + ('Completed',):
        return jsonify({'message': 'Event not found.'}), 404
    sessions = Session.query.filter_by(event_id=event.id, status='Published') \
        .order_by(Session.day.asc(), Session.start_time.asc(), Session.order_index.asc()).all()
    return jsonify({
        'eventId': event.id,
        'title': event.title,
        'date': event.date or '',
        'timezone': getattr(event, 'timezone', 'Asia/Kolkata') or 'Asia/Kolkata',
        'location': event.location or '',
        'sessionCount': len(sessions),
        'sessions': [{
            'id': s.id,
            'title': s.title or '',
            'description': s.description or '',
            'sessionType': s.session_type or '',
            'day': s.day or '',
            'startTime': s.start_time or '',
            'endTime': s.end_time or '',
            'roomName': s.room_name or '',
            'track': s.track or '',
            'capacity': s.capacity or 0,
            'speakers': [{'name': sp.get('name', '')} for sp in (s.speakers or [])
                         if isinstance(sp, dict)],
        } for s in sessions],
    })


@integrations_bp.route('/integrations/keys', methods=['GET'])
@require_admin
def get_public_api_key():
    return jsonify({'publicApiKey': _ensure_public_api_key()})


@integrations_bp.route('/integrations/keys', methods=['PATCH'])
@require_admin
def rotate_public_api_key():
    payload = request.get_json(silent=True) or {}
    if not payload.get('rotate'):
        return jsonify({'message': 'Send {"rotate": true} to rotate the public API key.'}), 400
    row = _settings_row()
    data = dict(row.data or {})
    key = 'wm_' + secrets.token_urlsafe(32)
    data['publicApiKey'] = key
    row.data = data
    row.updated_at = datetime.utcnow()
    db.session.commit()
    audit('Public API key rotated', current_user(), target='publicApiKey')
    return jsonify({'publicApiKey': key, 'rotated': True})
