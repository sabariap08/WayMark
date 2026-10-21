"""Offline check-in sync."""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from extensions import db
from models import (AttendanceLog, Event, JuryAssignment, OfflineScan, Registration,
                    Volunteer)
from utils.helpers import audit
from utils.security import can_manage_event, current_claims, current_user, is_admin, require_auth
from utils.serializers import attendance_json

offline_bp = Blueprint('offline', __name__)

VALID_REG_STATUSES = ('Confirmed', 'Registered')


@offline_bp.route('/attendance/sync', methods=['POST'])
@require_auth
def sync_attendance():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    device_id = str(payload.get('deviceId') or payload.get('device_id') or '')
    scans = payload.get('scans') or []
    if not isinstance(scans, list):
        scans = []

    accepted = 0
    duplicates = 0
    rejected = 0
    conflicts = []

    for scan in scans:
        if not isinstance(scan, dict):
            rejected += 1
            continue
        client_scan_id = str(scan.get('clientScanId') or scan.get('client_scan_id') or '')
        ticket_code = str(scan.get('ticketCode') or scan.get('ticket_code') or scan.get('code') or '')
        scanned_at = scan.get('scannedAt') or scan.get('scanned_at')
        event_id = str(scan.get('eventId') or scan.get('event_id') or '')

        if not client_scan_id or not ticket_code:
            rejected += 1
            continue

        existing_scan = None
        if event_id:
            existing_scan = OfflineScan.query.filter_by(event_id=event_id, client_scan_id=client_scan_id).first()
        if not existing_scan:
            existing_scan = OfflineScan.query.filter_by(client_scan_id=client_scan_id).first()
        if existing_scan:
            duplicates += 1
            continue

        reg = Registration.query.filter_by(ticket_code=ticket_code).first()
        if not reg:
            rejected += 1
            oscan = OfflineScan(event_id=event_id or '', client_scan_id=client_scan_id,
                                device_id=device_id, scanned_at=scanned_at,
                                ticket_code=ticket_code, status='Rejected', detail='Unknown ticket', online=False)
            db.session.add(oscan)
            db.session.commit()
            continue

        if event_id and reg.event_id != event_id:
            rejected += 1
            oscan = OfflineScan(event_id=event_id, client_scan_id=client_scan_id,
                                device_id=device_id, scanned_at=scanned_at,
                                registration_id=reg.id, ticket_code=ticket_code,
                                participant_name=reg.user_name, status='Rejected', detail='Wrong event', online=False)
            db.session.add(oscan)
            db.session.commit()
            continue

        if reg.status not in VALID_REG_STATUSES:
            rejected += 1
            oscan = OfflineScan(event_id=reg.event_id, client_scan_id=client_scan_id,
                                device_id=device_id, scanned_at=scanned_at,
                                registration_id=reg.id, ticket_code=ticket_code,
                                participant_name=reg.user_name, status='Rejected', detail='Inactive registration', online=False)
            db.session.add(oscan)
            db.session.commit()
            continue

        existing_log = AttendanceLog.query.filter_by(registration_id=reg.id).first()
        if existing_log:
            conflicts.append({'clientScanId': client_scan_id, 'reason': 'Already checked in'})
            oscan = OfflineScan(event_id=reg.event_id, client_scan_id=client_scan_id,
                                device_id=device_id, scanned_at=scanned_at,
                                registration_id=reg.id, ticket_code=ticket_code,
                                participant_name=reg.user_name, status='Conflict', detail='Already checked in', online=False)
            db.session.add(oscan)
            db.session.commit()
            continue

        oscan = OfflineScan(event_id=reg.event_id, client_scan_id=client_scan_id,
                            device_id=device_id, scanned_at=scanned_at,
                            registration_id=reg.id, ticket_code=ticket_code,
                            participant_name=reg.user_name, status='Accepted', online=False)
        db.session.add(oscan)
        log = AttendanceLog(event_id=reg.event_id, registration_id=reg.id,
                            user_id=reg.user_id, participant_name=reg.user_name,
                            participant_email=reg.user_email,
                            session=scan.get('session') or 'Day 1 - Morning',
                            method='scanner', status='Checked in')
        reg.attendance_status = 'Checked in'
        db.session.add(log)
        db.session.commit()
        audit('Checked in (offline sync)', user, target=reg.user_name + ' @ ' + (reg.event_title or ''))
        accepted += 1

    last_sync_at = datetime.utcnow().isoformat() + 'Z'
    resp = {
        'accepted': accepted, 'duplicates': duplicates, 'rejected': rejected, 'conflicts': conflicts,
        'syncStatus': {'accepted': accepted, 'duplicates': duplicates, 'rejected': rejected,
                       'conflicts': len(conflicts), 'lastSyncAt': last_sync_at}
    }
    return jsonify(resp)


def _iso(dt):
    return dt.isoformat() + 'Z' if dt else ''


@offline_bp.route('/attendance/sync-status', methods=['GET'])
@require_auth
def sync_status():
    user = current_user()
    event_id = str(request.args.get('eventId') or request.args.get('event_id') or '').strip()
    if not event_id:
        return jsonify({'message': 'eventId is required.'}), 400
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if not can_manage_event(user, event):
        return jsonify({'message': 'You can only view sync status for events you host.'}), 403

    scans = OfflineScan.query.filter_by(event_id=event_id) \
        .order_by(OfflineScan.received_at.asc()).all()
    accepted = sum(1 for s in scans if s.status == 'Accepted')
    duplicates = sum(1 for s in scans if s.status == 'Duplicate')
    rejected = sum(1 for s in scans if s.status == 'Rejected')
    conflicts = sum(1 for s in scans if s.status == 'Conflict')
    pending = sum(1 for s in scans if not s.online)

    devices = {}
    last_sync = None
    for scan in scans:
        device_id = scan.device_id or 'unknown'
        entry = devices.setdefault(device_id, {'deviceId': device_id, 'scans': 0,
                                               'lastSeen': None, '_last': None})
        entry['scans'] += 1
        if scan.received_at and (entry['_last'] is None or scan.received_at > entry['_last']):
            entry['_last'] = scan.received_at
        if scan.received_at and (last_sync is None or scan.received_at > last_sync):
            last_sync = scan.received_at
    device_rows = [{'deviceId': d['deviceId'], 'scans': d['scans'],
                    'lastSeen': _iso(d['_last'])} for d in devices.values()]

    return jsonify({
        'accepted': accepted,
        'duplicates': duplicates,
        'rejected': rejected,
        'conflicts': conflicts,
        'pending': pending,
        'lastSyncAt': _iso(last_sync),
        'devices': device_rows,
    })


def _guest_may_access_manifest(claims, event_id):
    """An active guest/volunteer scoped token for this exact event."""
    if not claims or claims.get('scope') != 'guest':
        return False
    if str(claims.get('eventId') or '') != str(event_id or ''):
        return False
    kind = claims.get('kind')
    if kind == 'volunteer':
        volunteer = Volunteer.query.get(claims.get('volunteerId'))
        return bool(volunteer) and (volunteer.status or '') in ('Confirmed', 'Active')
    if kind == 'jury':
        assignment = JuryAssignment.query.get(claims.get('assignmentId'))
        return bool(assignment) and (assignment.status or 'Active') == 'Active'
    return False


@offline_bp.route('/attendance/offline-manifest', methods=['GET'])
def offline_manifest():
    """A deliberately limited manifest: ticket codes + registration ids only.
    No emails or other personal data are ever included."""
    event_id = str(request.args.get('eventId') or request.args.get('event_id') or '').strip()
    if not event_id:
        return jsonify({'message': 'eventId is required.'}), 400
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404

    user = current_user()
    claims = current_claims()
    if not user:
        if not _guest_may_access_manifest(claims, event_id):
            return jsonify({'message': 'Authentication required.'}), 401
    elif not can_manage_event(user, event):
        return jsonify({'message': 'You can only download the manifest for events you host.'}), 403

    regs = Registration.query.filter(
        Registration.event_id == event.id,
        Registration.status.in_(list(VALID_REG_STATUSES)),
    ).all()
    items = [{'ticketCode': r.ticket_code, 'registrationId': r.id}
             for r in regs if r.ticket_code]

    return jsonify({
        'eventId': event.id,
        'title': event.title or '',
        'date': event.date or '',
        'venue': event.location or '',
        'items': items,
        'expiresAt': (datetime.utcnow() + timedelta(hours=24)).isoformat() + 'Z',
        'offlineNote': 'Offline scanning cannot confirm revocations or last-minute cancellations; conflicts are queued for review when the device reconnects.',
    })
