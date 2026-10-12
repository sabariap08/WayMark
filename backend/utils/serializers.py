"""Camel-case JSON serialisers matching the frontend's expected shapes."""
from utils.helpers import humanize


def iso(dt):
    return dt.isoformat() + 'Z' if dt else ''


def user_json(u):
    if not u:
        return None
    role_key = (u.role or 'participant').lower()
    labels = {'participant': 'Participant', 'host': 'Host', 'jury': 'Jury', 'admin': 'Admin'}
    return {
        'id': u.id,
        'name': u.name,
        'email': u.email,
        'role': labels.get(role_key, u.role),
        'roleKey': role_key,
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
    return {
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