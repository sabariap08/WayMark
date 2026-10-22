"""Camel-case JSON serialisers matching the frontend's expected shapes."""
from datetime import datetime

from utils.helpers import humanize


def iso(dt):
    return dt.isoformat() + 'Z' if dt else ''


def user_json(u):
    if not u:
        return None
    role_key = (u.role or 'user').lower()
    if role_key not in ('admin', 'user'):
        role_key = 'user'
    labels = {'admin': 'Admin', 'user': 'Normal User'}
    return {
        'id': u.id,
        'name': u.name,
        'email': u.email,
        'username': u.username or '',
        'role': labels.get(role_key, 'Normal User'),
        'roleKey': role_key,
        'isAdmin': role_key == 'admin',
        'status': u.status,
        'eventsCount': u.events_count or 0,
        'joinedDate': u.created_at.strftime('%b %d, %Y') if u.created_at else '',
        'phone': u.phone or '',
        'org': u.org or '',
        'bio': u.bio or '',
        'website': u.website or '',
        'location': u.location or '',
        'birthDate': u.birth_date or '',
        'pronouns': u.pronouns or '',
        'emailUpdates': bool(u.email_updates),
        'smsReminders': bool(u.sms_reminders),
        'publicProfile': bool(u.public_profile),
    }


def event_json(e, extra=None):
    if not e:
        return None
    data = {
        'id': e.id,
        'hostId': e.host_id or '',
        'hostName': e.host_name or '',
        'title': e.title,
        'category': e.category or '',
        'description': e.description or '',
        'date': e.date or '',
        'time': e.time or '',
        'location': e.location or '',
        'seats': e.seats or 0,
        'status': e.status or 'Draft',
        'approvalStatus': e.approval_status or '',
        'tone': e.tone or 'blue',
        'initials': e.initials or 'WM',
        'color': e.color or '#2B4BD8',
        'organizer': e.organizer or '',
        'capacityNum': e.capacity_num or e.seats or 0,
        'registeredNum': e.registered_num or 0,
        'waitlistNum': e.waitlist_num or 0,
        'regDeadline': e.reg_deadline or '',
        'contactEmail': e.contact_email or '',
        'website': e.website or '',
        'tags': e.tags or [],
        'certificatesEnabled': bool(e.certificates_enabled),
        'juryEnabled': bool(e.jury_enabled),
        'feedbackEnabled': bool(e.feedback_enabled),
        'attendanceRequired': bool(e.attendance_required),
        'agenda': e.agenda or [],
        'requirements': e.requirements or [],
        'resultsReleased': bool(e.results_released),
        'releasedAt': iso(e.released_at),
        'rejectionReason': e.rejection_reason or '',
        'eventType': getattr(e, 'event_type', '') or '',
        'parentEventId': getattr(e, 'parent_event_id', '') or '',
        'format': getattr(e, 'format', 'Offline') or 'Offline',
        'timezone': getattr(e, 'timezone', 'Asia/Kolkata') or 'Asia/Kolkata',
        'startDate': getattr(e, 'start_date', '') or '',
        'endDate': getattr(e, 'end_date', '') or '',
        'participation': getattr(e, 'participation', 'individual') or 'individual',
        'currency': getattr(e, 'currency', 'INR') or 'INR',
        'orgId': getattr(e, 'org_id', '') or '',
        'config': getattr(e, 'config', None) or {},
        'settings': getattr(e, 'settings', None) or {},
        'slug': getattr(e, 'slug', '') or '',
        'visibility': getattr(e, 'visibility', 'public') or 'public',
        'createdAt': iso(e.created_at),
        'submittedAt': iso(e.submitted_at),
        'updatedAt': iso(e.updated_at),
    }
    if extra:
        data.update(extra)
    return data


def registration_json(r):
    if not r:
        return None
    data = {
        'id': r.id,
        'userId': r.user_id or '',
        'userName': r.user_name or '',
        'userEmail': r.user_email or '',
        'eventId': r.event_id or '',
        'eventTitle': r.event_title or '',
        'category': r.category or '',
        'date': r.date or '',
        'time': r.time or '',
        'location': r.location or '',
        'status': r.status or 'Confirmed',
        'attendanceStatus': r.attendance_status or 'Registered',
        'ticketCode': r.ticket_code or '',
        'qrCodeUrl': r.qr_code_url or '',
        'waitlistPosition': r.waitlist_position,
        'offerExpiresAt': iso(r.offer_expires_at),
        'registeredAt': r.registered_at.strftime('%b %d, %Y') if r.registered_at else '',
    }
    data['identitySnapshot'] = getattr(r, 'identity_snapshot', None) or {}
    data['answers'] = getattr(r, 'answers', None) or {}
    data['verificationState'] = getattr(r, 'verification_state', 'pending') or 'pending'
    data['verificationNote'] = getattr(r, 'verification_note', '') or ''
    data['qrRevoked'] = bool(getattr(r, 'qr_revoked_at', None))
    return data


def attendance_json(a):
    if not a:
        return None
    return {
        'id': a.id,
        'eventId': a.event_id or '',
        'registrationId': a.registration_id or '',
        'userId': a.user_id or '',
        'participantName': a.participant_name or '',
        'participantEmail': a.participant_email or '',
        'session': a.session or '',
        'method': a.method or 'scanner',
        'status': a.status or 'Checked in',
        'timestamp': iso(a.timestamp),
        'time': humanize(a.timestamp),
    }


def exception_json(x):
    if not x:
        return None
    return {
        'id': x.id,
        'eventId': x.event_id or '',
        'registrationId': x.registration_id or '',
        'userId': x.user_id or '',
        'participantName': x.participant_name or '',
        'type': x.type or '',
        'detail': x.detail or '',
        'status': x.status or 'Open',
        'detectedAt': iso(x.detected_at),
        'time': humanize(x.detected_at),
    }


def assignment_json(j):
    if not j:
        return None
    return {
        'id': j.id,
        'eventId': j.event_id or '',
        'eventTitle': j.event_title or '',
        'juryMemberId': j.jury_member_id or '',
        'juryName': j.jury_name or '',
        'juryEmail': j.jury_email or '',
        'expertise': j.expertise or '',
        'assignedTracks': j.assigned_tracks or [],
        'status': j.status or 'Active',
        'guestToken': j.guest_token or '',
        'createdAt': iso(j.created_at),
    }


def guest_access_json(g):
    if not g:
        return None
    return {
        'id': g.id,
        'eventId': g.event_id or '',
        'eventTitle': g.event_title or '',
        'kind': g.kind or 'judge',
        'name': g.name or '',
        'email': g.email or '',
        'mobile': g.mobile or '',
        'affiliation': g.affiliation or '',
        'panelRole': g.panel_role or '',
        'section': g.section or '',
        'accessFrom': iso(g.access_from),
        'accessTo': iso(g.access_to),
        'status': g.status or 'invited',
        'activatedAt': iso(g.activated_at),
        'conflictDeclaredAt': iso(g.conflict_declared_at),
        'revokedAt': iso(g.revoked_at),
        'createdAt': iso(g.created_at),
        'time': humanize(g.created_at),
    }


def approval_record_json(a):
    if not a:
        return None
    return {
        'id': a.id,
        'eventId': a.event_id or '',
        'action': a.action or '',
        'reason': a.reason or '',
        'actorId': a.actor_id or '',
        'actorName': a.actor_name or '',
        'createdAt': iso(a.created_at),
        'time': humanize(a.created_at),
    }


def rubric_json(r):
    if not r:
        return None
    return {
        'id': r.id,
        'eventId': r.event_id or '',
        'rubricName': r.rubric_name or '',
        'round': r.round or 'preliminary',
        'criteria': r.criteria or [],
    }


def submission_json(s, score=None):
    if not s:
        return None
    data = {
        'id': s.id,
        'eventId': s.event_id or '',
        'teamName': s.team_name or '',
        'projectTitle': s.project_title or '',
        'track': s.track or '',
        'status': s.status or 'Submitted',
        'description': s.description or '',
        'submittedAt': iso(s.submitted_at),
        'submittedTime': humanize(s.submitted_at),
    }
    if score is not None:
        data['score'] = round(score, 1)
    return data


def score_json(s):
    if not s:
        return None
    return {
        'id': s.id,
        'eventId': s.event_id or '',
        'submissionId': s.submission_id or '',
        'juryMemberId': s.jury_member_id or '',
        'juryName': s.jury_name or '',
        'criteria': s.criteria or [],
        'total': round(s.total or 0, 1),
        'maxScore': round(s.max_score or 0, 1),
        'comment': s.comment or '',
        'status': s.status or 'Submitted',
        'submittedAt': iso(s.submitted_at),
        'time': humanize(s.submitted_at),
    }


def feedback_json(f):
    if not f:
        return None
    return {
        'id': f.id,
        'eventId': f.event_id or '',
        'eventTitle': f.event_title or '',
        'userId': f.user_id or '',
        'userName': 'Anonymous' if f.anonymous else (f.user_name or ''),
        'overallRating': f.overall_rating or 0,
        'contentRating': f.content_rating or 0,
        'organizationRating': f.organization_rating or 0,
        'venueRating': f.venue_rating or 0,
        'whatWorked': f.what_worked or '',
        'whatDidnt': f.what_didnt or '',
        'wouldRecommend': bool(f.would_recommend),
        'attendAgain': bool(f.attend_again),
        'anonymous': bool(f.anonymous),
        'submittedAt': iso(f.submitted_at),
        'time': humanize(f.submitted_at),
    }


def certificate_json(c):
    if not c:
        return None
    return {
        'id': c.id,
        'recipientName': c.recipient_name or '',
        'recipientId': c.recipient_id or '',
        'eventId': c.event_id or '',
        'eventTitle': c.event_title or '',
        'issueDate': c.issue_date or '',
        'credentialId': c.credential_id or '',
        'issuer': c.issuer or '',
        'type': c.type or 'Participation',
        'status': c.status or 'Valid',
        'withdrawnAt': iso(c.withdrawn_at),
    }


def notification_json(n):
    if not n:
        return None
    return {
        'id': n.id,
        'userId': n.user_id or '',
        'title': n.title or '',
        'message': n.message or '',
        'type': n.type or 'reminder',
        'read': bool(n.read),
        'time': humanize(n.created_at),
        'createdAt': iso(n.created_at),
    }


def audit_json(a):
    if not a:
        return None
    return {
        'id': a.id,
        'action': a.action or '',
        'user': a.user or '',
        'target': a.target or '',
        'ip': a.ip or '',
        'status': a.status or 'Success',
        'timestamp': iso(a.timestamp),
        'time': humanize(a.timestamp),
    }


def job_json(j):
    if not j:
        return None
    return {
        'id': j.id,
        'eventId': j.event_id or '',
        'eventTitle': j.event_title or '',
        'type': j.type or 'message',
        'label': j.label or j.subject or '',
        'subject': j.subject or '',
        'audience': j.audience or '',
        'recipients': j.recipients_count or 0,
        'recipientCount': j.recipients_count or 0,
        'status': j.status or 'Queued',
        'error': j.error or '',
        'time': humanize(j.created_at),
        'createdAt': iso(j.created_at),
        'updatedAt': iso(j.updated_at),
    }


def mail_json(m):
    if not m:
        return None
    return {
        'id': m.id,
        'to': m.to_email or '',
        'toEmail': m.to_email or '',
        'from': m.from_email or '',
        'subject': m.subject or '',
        'body': m.body or '',
        'kind': m.kind or 'message',
        'status': m.status or 'Stored',
        'error': m.error or '',
        'time': humanize(m.created_at),
        'createdAt': iso(m.created_at),
    }


def hosting_json(r):
    if not r:
        return None
    return {
        'id': r.id,
        'userId': r.user_id or '',
        'requesterName': r.requester_name or '',
        'requesterEmail': r.requester_email or '',
        'title': r.title or '',
        'category': r.category or '',
        'description': r.description or '',
        'bannerUrl': r.banner_url or '',
        'date': r.date or '',
        'endDate': r.end_date or '',
        'time': r.time or '',
        'location': r.location or '',
        'venue': r.venue or '',
        'onlineUrl': r.online_url or '',
        'organizer': r.organizer or '',
        'contactEmail': r.contact_email or '',
        'contactPhone': r.contact_phone or '',
        'website': r.website or '',
        'seats': r.seats or 0,
        'regOpen': r.reg_open or '',
        'regDeadline': r.reg_deadline or '',
        'eligibility': r.eligibility or '',
        'fee': r.fee or 'Free',
        'rules': r.rules or '',
        'staffing': r.staffing or '',
        'documents': r.documents or '',
        'tags': r.tags or [],
        'agenda': r.agenda or [],
        'requirements': r.requirements or [],
        'status': r.status or 'Pending',
        'decisionReason': r.decision_reason or '',
        'decidedBy': r.decided_by or '',
        'eventId': r.event_id or '',
        'submittedAt': iso(r.submitted_at),
        'decidedAt': iso(r.decided_at),
        'createdAt': iso(r.created_at),
        'updatedAt': iso(r.updated_at),
        'time': humanize(r.submitted_at or r.created_at),
    }


def volunteer_json(v):
    if not v:
        return None
    return {
        'id': v.id,
        'eventId': v.event_id or '',
        'eventTitle': v.event_title or '',
        'name': v.name or '',
        'email': v.email or '',
        'phone': v.phone or '',
        'department': v.department or '',
        'responsibility': v.responsibility or '',
        'shiftDate': v.shift_date or '',
        'shiftTime': v.shift_time or '',
        'status': v.status or 'Invited',
        'inviteToken': v.invite_token or '',
        'notes': v.notes or '',
        'skills': getattr(v, 'skills', None) or [],
        'availability': getattr(v, 'availability', None) or [],
        'venue': getattr(v, 'venue', '') or '',
        'maxHours': getattr(v, 'max_hours', 0) or 0,
        'assignedHours': getattr(v, 'assigned_hours', 0) or 0,
        'completedTasks': getattr(v, 'completed_tasks', 0) or 0,
        'createdAt': iso(v.created_at),
        'time': humanize(v.created_at),
    }


def ai_log_json(a):
    if not a:
        return None
    return {
        'id': a.id,
        'feature': a.feature or '',
        'user': a.user or '',
        'model': a.model or '',
        'prompt': a.prompt or '',
        'response': a.response or '',
        'tokens': a.tokens or 0,
        'status': a.status or 'Success',
        'time': humanize(a.created_at),
        'createdAt': iso(a.created_at),
    }

# --------------------------------------------------------------------------- #
# Universal event engine                                                       #
# --------------------------------------------------------------------------- #

def event_type_json(t):
    if not t:
        return None
    return {
        'id': t.id,
        'name': t.name or '',
        'tagline': t.tagline or '',
        'cssClass': t.css_class or '',
        'sortOrder': t.sort_order or 0,
        'isSystem': bool(getattr(t, 'is_system', False)),
        'config': getattr(t, 'config', None) or {},
        'updatedAt': iso(getattr(t, 'updated_at', None)),
    }


def venue_json(v):
    if not v:
        return None
    return {
        'id': v.id,
        'eventId': v.event_id or '',
        'name': v.name or '',
        'address': v.address or '',
        'city': v.city or '',
        'latitude': v.latitude,
        'longitude': v.longitude,
        'mapUrl': v.map_url or '',
        'directions': v.directions or '',
        'capacity': v.capacity or 0,
        'accessibility': v.accessibility or '',
        'isPrimary': bool(v.is_primary),
        'createdAt': iso(v.created_at),
    }


def session_json(s, extra=None):
    if not s:
        return None
    data = {
        'id': s.id,
        'eventId': s.event_id or '',
        'parentEventId': s.parent_event_id or '',
        'title': s.title or '',
        'description': s.description or '',
        'sessionType': s.session_type or 'Talk',
        'day': s.day or '',
        'startTime': s.start_time or '',
        'endTime': s.end_time or '',
        'venueId': s.venue_id or '',
        'roomName': s.room_name or '',
        'capacity': s.capacity or 0,
        'speakers': s.speakers or [],
        'track': s.track or '',
        'status': s.status or 'Draft',
        'orderIndex': s.order_index or 0,
        'setupMinutes': s.setup_minutes or 0,
        'teardownMinutes': s.teardown_minutes or 0,
        'requiredResourceIds': s.required_resource_ids or [],
        'resourceDeadline': s.resource_deadline or '',
        'createdAt': iso(s.created_at),
        'updatedAt': iso(s.updated_at),
    }
    if extra:
        data.update(extra)
    return data


def resource_json(r):
    if not r:
        return None
    return {
        'id': r.id,
        'eventId': r.event_id or '',
        'name': r.name or '',
        'kind': r.kind or 'Room',
        'venueId': r.venue_id or '',
        'capacity': r.capacity or 0,
        'location': r.location or '',
        'availableDays': r.available_days or [],
        'availableFrom': r.available_from or '',
        'availableTo': r.available_to or '',
        'setupMinutes': r.setup_minutes or 0,
        'teardownMinutes': r.teardown_minutes or 0,
        'status': r.status or 'Active',
        'notes': r.notes or '',
        'createdAt': iso(r.created_at),
    }


def booking_json(b):
    if not b:
        return None
    return {
        'id': b.id,
        'eventId': b.event_id or '',
        'sessionId': b.session_id or '',
        'resourceId': b.resource_id or '',
        'day': b.day or '',
        'startTime': b.start_time or '',
        'endTime': b.end_time or '',
        'setupMinutes': b.setup_minutes or 0,
        'teardownMinutes': b.teardown_minutes or 0,
        'status': b.status or 'Planned',
        'notes': b.notes or '',
        'createdAt': iso(b.created_at),
    }


def conflict_json(c):
    if not c:
        return None
    return {
        'id': c.id,
        'eventId': c.event_id or '',
        'conflictType': c.conflict_type or '',
        'severity': c.severity or 'Warning',
        'resourceId': c.resource_id or '',
        'resourceName': c.resource_name or '',
        'sessionIds': c.session_ids or [],
        'sessionTitles': c.session_titles or [],
        'person': c.person or '',
        'day': c.day or '',
        'startTime': c.start_time or '',
        'endTime': c.end_time or '',
        'message': c.message or '',
        'detail': c.detail if isinstance(c.detail, dict) else {},
        'status': c.status or 'Open',
        'resolution': c.resolution or '',
        'detectedAt': iso(c.detected_at),
        'resolvedAt': iso(c.resolved_at),
        'resolvedBy': c.resolved_by or '',
        'time': humanize(c.detected_at),
    }


# --------------------------------------------------------------------------- #
# Operations: tasks and incidents                                              #
# --------------------------------------------------------------------------- #

def task_json(t):
    if not t:
        return None
    return {
        'id': t.id,
        'eventId': t.event_id or '',
        'title': t.title or '',
        'description': t.description or '',
        'assigneeId': t.assignee_id or '',
        'assigneeName': t.assignee_name or '',
        'assigneeType': t.assignee_type or 'user',
        'priority': t.priority or 'Normal',
        'dueAt': iso(t.due_at),
        'dueLabel': humanize(t.due_at) if t.due_at else '',
        'status': t.status or 'Open',
        'dependsOn': t.depends_on or [],
        'sessionId': t.session_id or '',
        'resourceId': t.resource_id or '',
        'completionNotes': t.completion_notes or '',
        'createdBy': t.created_by or '',
        'createdAt': iso(t.created_at),
        'updatedAt': iso(t.updated_at),
        'completedAt': iso(t.completed_at),
        'isOverdue': bool(t.due_at and t.status not in ('Done', 'Cancelled')
                          and t.due_at < datetime.utcnow()),
    }


def incident_json(i):
    if not i:
        return None
    return {
        'id': i.id,
        'eventId': i.event_id or '',
        'title': i.title or '',
        'description': i.description or '',
        'severity': i.severity or 'Medium',
        'status': i.status or 'Open',
        'assigneeId': i.assignee_id or '',
        'assigneeName': i.assignee_name or '',
        'location': i.location or '',
        'resolution': i.resolution or '',
        'createdBy': i.created_by or '',
        'createdAt': iso(i.created_at),
        'updatedAt': iso(i.updated_at),
        'resolvedAt': iso(i.resolved_at),
        'time': humanize(i.created_at),
        'isOpen': (i.status or 'Open') in ('Open', 'Investigating'),
    }


# --------------------------------------------------------------------------- #
# Finance                                                                      #
# --------------------------------------------------------------------------- #

def budget_category_json(c, totals=None):
    if not c:
        return None
    from utils.money import fmt, to_major
    currency = c.currency or 'INR'
    data = {
        'id': c.id,
        'eventId': c.event_id or '',
        'name': c.name or '',
        'currency': currency,
        'sortOrder': c.sort_order or 0,
        'plannedMinor': c.planned_minor or 0,
        'planned': to_major(c.planned_minor, currency),
        'plannedFormatted': fmt(c.planned_minor, currency),
        'createdAt': iso(c.created_at),
    }
    if totals:
        data.update(totals)
    return data


def budget_line_json(row):
    if not row:
        return None
    from utils.money import fmt, to_major
    currency = row.currency or 'INR'
    return {
        'id': row.id,
        'eventId': row.event_id or '',
        'categoryId': row.category_id or '',
        'description': row.description or '',
        'kind': row.kind or 'Expense',
        'currency': currency,
        'amountMinor': row.amount_minor or 0,
        'amount': to_major(row.amount_minor, currency),
        'amountFormatted': fmt(row.amount_minor, currency),
        'date': row.date or '',
        'documentRef': row.document_ref or '',
        'createdBy': row.created_by or '',
        'createdAt': iso(row.created_at),
    }


def sponsor_json(s):
    if not s:
        return None
    from utils.money import fmt, to_major
    currency = s.currency or 'INR'
    return {
        'id': s.id,
        'eventId': s.event_id or '',
        'name': s.name or '',
        'contactName': s.contact_name or '',
        'contactEmail': s.contact_email or '',
        'contactPhone': s.contact_phone or '',
        'package': s.package or '',
        'currency': currency,
        'promisedMinor': s.promised_minor or 0,
        'promised': to_major(s.promised_minor, currency),
        'promisedFormatted': fmt(s.promised_minor, currency),
        'receivedMinor': s.received_minor or 0,
        'received': to_major(s.received_minor, currency),
        'receivedFormatted': fmt(s.received_minor, currency),
        'status': s.status or 'Prospect',
        'logoUrl': s.logo_url or '',
        'booth': s.booth or '',
        'deliverables': s.deliverables or [],
        'deliverablesTotal': len(s.deliverables or []),
        'deliverablesDone': len([d for d in (s.deliverables or []) if d.get('done')]),
        'notes': s.notes or '',
        'createdAt': iso(s.created_at),
        'updatedAt': iso(s.updated_at),
    }


# --------------------------------------------------------------------------- #
# Organisations                                                                #
# --------------------------------------------------------------------------- #

def organization_json(o, extra=None):
    if not o:
        return None
    data = {
        'id': o.id,
        'name': o.name or '',
        'slug': o.slug or '',
        'description': o.description or '',
        'website': o.website or '',
        'contactEmail': o.contact_email or '',
        'status': o.status or 'Active',
        'createdBy': o.created_by or '',
        'createdAt': iso(o.created_at),
    }
    if extra:
        data.update(extra)
    return data


def org_member_json(m, user=None):
    if not m:
        return None
    return {
        'id': m.id,
        'orgId': m.org_id or '',
        'userId': m.user_id or '',
        'name': (user.name if user else ''),
        'email': (user.email if user else ''),
        'orgRole': m.org_role or 'Member',
        'permissions': m.permissions or [],
        'status': m.status or 'Active',
        'createdAt': iso(m.created_at),
    }


# --------------------------------------------------------------------------- #
# Integrations                                                                 #
# --------------------------------------------------------------------------- #

def webhook_json(h):
    if not h:
        return None
    return {
        'id': h.id,
        'eventId': h.event_id or '',
        'url': h.url or '',
        'secretSet': bool(h.secret),
        'events': h.events or [],
        'active': bool(h.active),
        'createdBy': h.created_by or '',
        'createdAt': iso(h.created_at),
    }


def webhook_delivery_json(d):
    if not d:
        return None
    return {
        'id': d.id,
        'webhookId': d.webhook_id or '',
        'eventType': d.event_type or '',
        'payload': d.payload if isinstance(d.payload, dict) else {},
        'idempotencyKey': d.idempotency_key or '',
        'status': d.status or 'Pending',
        'attempts': d.attempts or 0,
        'responseCode': d.response_code,
        'error': d.error or '',
        'createdAt': iso(d.created_at),
        'deliveredAt': iso(d.delivered_at),
        'time': humanize(d.created_at),
    }


def payment_json(p):
    if not p:
        return None
    from utils.money import fmt, to_major
    currency = p.currency or 'INR'
    return {
        'id': p.id,
        'eventId': p.event_id or '',
        'registrationId': p.registration_id or '',
        'userId': p.user_id or '',
        'provider': p.provider or 'sandbox',
        'providerRef': p.provider_ref or '',
        'currency': currency,
        'amountMinor': p.amount_minor or 0,
        'amount': to_major(p.amount_minor, currency),
        'amountFormatted': fmt(p.amount_minor, currency),
        'status': p.status or 'Created',
        'failureReason': p.failure_reason or '',
        'createdAt': iso(p.created_at),
        'updatedAt': iso(p.updated_at),
    }


def offline_scan_json(s):
    if not s:
        return None
    return {
        'id': s.id,
        'eventId': s.event_id or '',
        'clientScanId': s.client_scan_id or '',
        'deviceId': s.device_id or '',
        'scannedAt': s.scanned_at or '',
        'registrationId': s.registration_id or '',
        'ticketCode': s.ticket_code or '',
        'participantName': s.participant_name or '',
        'status': s.status or 'Accepted',
        'detail': s.detail or '',
        'online': bool(s.online),
        'receivedAt': iso(s.received_at),
        'time': humanize(s.received_at),
    }


# --------------------------------------------------------------------------- #
# Achievements and AI plans                                                    #
# --------------------------------------------------------------------------- #

def achievement_json(a):
    if not a:
        return None
    return {
        'id': a.id,
        'userId': a.user_id or '',
        'eventId': a.event_id or '',
        'eventTitle': a.event_title or '',
        'kind': a.kind or 'Participation',
        'title': a.title or '',
        'detail': a.detail or '',
        'source': a.source or '',
        'credentialId': a.credential_id or '',
        'shared': bool(a.shared),
        'issuedAt': iso(a.issued_at),
        'time': humanize(a.issued_at),
    }


def event_plan_json(p):
    if not p:
        return None
    return {
        'id': p.id,
        'userId': p.user_id or '',
        'title': p.title or '',
        'brief': p.brief or '',
        'plan': p.plan if isinstance(p.plan, dict) else {},
        'validation': p.validation if isinstance(p.validation, dict) else {},
        'status': p.status or 'Draft',
        'appliedAt': iso(p.applied_at),
        'appliedRef': p.applied_ref or '',
        'provider': p.provider or 'local',
        'createdAt': iso(p.created_at),
        'updatedAt': iso(p.updated_at),
        'time': humanize(p.created_at),
    }
