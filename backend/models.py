"""WayMark data model (Supabase Postgres, SQLite-compatible for offline dev)."""
import uuid
from datetime import datetime

from extensions import db


def gen_id():
    return str(uuid.uuid4())


def utcnow():
    return datetime.utcnow()


class User(db.Model):
    __tablename__ = 'wm_users'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False, index=True)
    username = db.Column(db.String(80), unique=True, index=True, default=None)
    password_hash = db.Column(db.String(300), default='')
    role = db.Column(db.String(20), default='user')              # admin | user  (only two application roles)
    status = db.Column(db.String(20), default='Active')          # Active | Invited | Suspended
    events_count = db.Column(db.Integer, default=0)
    phone = db.Column(db.String(40), default='')
    org = db.Column(db.String(160), default='')
    bio = db.Column(db.Text, default='')
    website = db.Column(db.String(220), default='')
    location = db.Column(db.String(160), default='')
    birth_date = db.Column(db.String(30), default='')
    pronouns = db.Column(db.String(40), default='')
    email_updates = db.Column(db.Boolean, default=True)
    sms_reminders = db.Column(db.Boolean, default=False)
    public_profile = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)


class OtpCode(db.Model):
    __tablename__ = 'wm_otp_codes'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    email = db.Column(db.String(200), nullable=False, index=True)
    code = db.Column(db.String(10), nullable=False)
    purpose = db.Column(db.String(40), default='password_reset')  # signup | password_reset | login
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)


class EventType(db.Model):
    __tablename__ = 'wm_event_types'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    name = db.Column(db.String(80), unique=True, nullable=False)
    tagline = db.Column(db.String(240), default='')
    css_class = db.Column(db.String(40), default='')
    sort_order = db.Column(db.Integer, default=0)


class Event(db.Model):
    __tablename__ = 'wm_events'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    host_id = db.Column(db.String(36), default='')
    host_name = db.Column(db.String(160), default='')
    title = db.Column(db.String(220), nullable=False)
    category = db.Column(db.String(80), default='Hackathon')
    description = db.Column(db.Text, default='')
    date = db.Column(db.String(60), default='')
    time = db.Column(db.String(60), default='')
    location = db.Column(db.String(220), default='')
    seats = db.Column(db.Integer, default=100)
    status = db.Column(db.String(40), default='Draft')            # Draft | Pending | Changes requested | Published | Registration open | Registration closed | Ongoing | Completed | Cancelled | Rejected
    approval_status = db.Column(db.String(40), default='Draft')   # Draft | Pending | Approved | Changes requested | Rejected
    tone = db.Column(db.String(20), default='blue')
    initials = db.Column(db.String(6), default='WM')
    color = db.Column(db.String(20), default='#2B4BD8')
    organizer = db.Column(db.String(160), default='')
    capacity_num = db.Column(db.Integer, default=100)
    registered_num = db.Column(db.Integer, default=0)
    waitlist_num = db.Column(db.Integer, default=0)
    reg_deadline = db.Column(db.String(60), default='')
    contact_email = db.Column(db.String(200), default='')
    website = db.Column(db.String(220), default='')
    tags = db.Column(db.JSON, default=list)
    certificates_enabled = db.Column(db.Boolean, default=True)
    jury_enabled = db.Column(db.Boolean, default=True)
    feedback_enabled = db.Column(db.Boolean, default=True)
    attendance_required = db.Column(db.Boolean, default=True)
    agenda = db.Column(db.JSON, default=list)
    requirements = db.Column(db.JSON, default=list)
    results_released = db.Column(db.Boolean, default=False)
    released_at = db.Column(db.DateTime)
    rejection_reason = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=utcnow)
    submitted_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=utcnow)


class Registration(db.Model):
    __tablename__ = 'wm_registrations'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(36), index=True, default='')
    user_name = db.Column(db.String(160), default='')
    user_email = db.Column(db.String(200), default='')
    event_id = db.Column(db.String(36), index=True, default='')
    event_title = db.Column(db.String(220), default='')
    category = db.Column(db.String(80), default='')
    date = db.Column(db.String(60), default='')
    time = db.Column(db.String(60), default='')
    location = db.Column(db.String(220), default='')
    status = db.Column(db.String(40), default='Confirmed')        # Confirmed | Registered | Waitlisted | Offered | Declined | Cancelled
    attendance_status = db.Column(db.String(40), default='Registered')  # Registered | Checked in | No-show | Exception
    ticket_code = db.Column(db.String(40), unique=True, index=True, default=None)
    qr_code_url = db.Column(db.String(300), default='')
    waitlist_position = db.Column(db.Integer)
    offer_expires_at = db.Column(db.DateTime)
    registered_at = db.Column(db.DateTime, default=utcnow)


class AttendanceLog(db.Model):
    __tablename__ = 'wm_attendance_logs'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    registration_id = db.Column(db.String(36), default='')
    user_id = db.Column(db.String(36), default='')
    participant_name = db.Column(db.String(160), default='')
    participant_email = db.Column(db.String(200), default='')
    session = db.Column(db.String(80), default='Day 1 - Morning')
    method = db.Column(db.String(40), default='scanner')          # scanner | manual
    status = db.Column(db.String(40), default='Checked in')
    timestamp = db.Column(db.DateTime, default=utcnow)


class CheckInException(db.Model):
    __tablename__ = 'wm_checkin_exceptions'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    registration_id = db.Column(db.String(36), default='')
    user_id = db.Column(db.String(36), default='')
    participant_name = db.Column(db.String(160), default='')
    type = db.Column(db.String(80), default='Pass mismatch')
    detail = db.Column(db.Text, default='')
    status = db.Column(db.String(30), default='Open')             # Open | Resolved
    detected_at = db.Column(db.DateTime, default=utcnow)


class JuryAssignment(db.Model):
    __tablename__ = 'wm_jury_assignments'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    event_title = db.Column(db.String(220), default='')
    jury_member_id = db.Column(db.String(36), default='')
    jury_name = db.Column(db.String(160), default='')
    jury_email = db.Column(db.String(200), default='')
    expertise = db.Column(db.String(160), default='')
    assigned_tracks = db.Column(db.JSON, default=list)
    status = db.Column(db.String(30), default='Active')           # Active | Completed | Invited
    guest_token = db.Column(db.String(60), unique=True, default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class HostingRequest(db.Model):
    """A Normal User's request to host an event. Admin must approve before it
    becomes a real Event. This is the 'Host an Event' workflow - not a role."""
    __tablename__ = 'wm_hosting_requests'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(36), index=True, default='')
    requester_name = db.Column(db.String(160), default='')
    requester_email = db.Column(db.String(200), default='')

    title = db.Column(db.String(220), nullable=False)
    category = db.Column(db.String(80), default='Community')
    description = db.Column(db.Text, default='')
    banner_url = db.Column(db.String(400), default='')
    date = db.Column(db.String(60), default='')
    end_date = db.Column(db.String(60), default='')
    time = db.Column(db.String(60), default='')
    location = db.Column(db.String(220), default='')
    venue = db.Column(db.String(220), default='')
    online_url = db.Column(db.String(300), default='')
    organizer = db.Column(db.String(160), default='')
    contact_email = db.Column(db.String(200), default='')
    contact_phone = db.Column(db.String(60), default='')
    website = db.Column(db.String(220), default='')
    seats = db.Column(db.Integer, default=100)
    reg_open = db.Column(db.String(60), default='')
    reg_deadline = db.Column(db.String(60), default='')
    eligibility = db.Column(db.Text, default='')
    fee = db.Column(db.String(80), default='Free')
    rules = db.Column(db.Text, default='')
    staffing = db.Column(db.Text, default='')
    documents = db.Column(db.String(400), default='')
    tags = db.Column(db.JSON, default=list)
    agenda = db.Column(db.JSON, default=list)
    requirements = db.Column(db.JSON, default=list)

    status = db.Column(db.String(30), default='Pending')          # Pending | Approved | Rejected | Changes requested | Cancelled
    decision_reason = db.Column(db.Text, default='')
    decided_by = db.Column(db.String(160), default='')
    event_id = db.Column(db.String(36), default='')              # set once approved -> real Event
    submitted_at = db.Column(db.DateTime, default=utcnow)
    decided_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow)


class Volunteer(db.Model):
    """Volunteer records are event-scoped assignments, not an application role.
    Only an admin or the event's host may manage them."""
    __tablename__ = 'wm_volunteers'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    event_title = db.Column(db.String(220), default='')
    name = db.Column(db.String(160), default='')
    email = db.Column(db.String(200), default='')
    phone = db.Column(db.String(60), default='')
    department = db.Column(db.String(120), default='')
    responsibility = db.Column(db.String(200), default='')
    shift_date = db.Column(db.String(60), default='')
    shift_time = db.Column(db.String(60), default='')
    status = db.Column(db.String(30), default='Invited')         # Invited | Confirmed | Active | Removed
    invite_token = db.Column(db.String(60), unique=True, default='')
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class Rubric(db.Model):
    __tablename__ = 'wm_rubrics'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    rubric_name = db.Column(db.String(200), default='Standard judging rubric')
    round = db.Column(db.String(60), default='preliminary')
    criteria = db.Column(db.JSON, default=list)
    created_at = db.Column(db.DateTime, default=utcnow)


class Submission(db.Model):
    __tablename__ = 'wm_submissions'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    team_name = db.Column(db.String(160), default='')
    project_title = db.Column(db.String(220), default='')
    track = db.Column(db.String(120), default='')
    status = db.Column(db.String(40), default='Submitted')        # Submitted | Scored | Shortlisted
    description = db.Column(db.Text, default='')
    submitted_at = db.Column(db.DateTime, default=utcnow)


class Score(db.Model):
    __tablename__ = 'wm_scores'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    submission_id = db.Column(db.String(36), index=True, default='')
    jury_member_id = db.Column(db.String(36), default='')
    jury_name = db.Column(db.String(160), default='')
    criteria = db.Column(db.JSON, default=list)
    total = db.Column(db.Float, default=0)
    max_score = db.Column(db.Float, default=0)
    comment = db.Column(db.Text, default='')
    status = db.Column(db.String(30), default='Submitted')        # Submitted | Reopened
    submitted_at = db.Column(db.DateTime, default=utcnow)


class Feedback(db.Model):
    __tablename__ = 'wm_feedback'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    event_title = db.Column(db.String(220), default='')
    user_id = db.Column(db.String(36), default='')
    user_name = db.Column(db.String(160), default='')
    overall_rating = db.Column(db.Integer, default=0)
    content_rating = db.Column(db.Integer, default=0)
    organization_rating = db.Column(db.Integer, default=0)
    venue_rating = db.Column(db.Integer, default=0)
    what_worked = db.Column(db.Text, default='')
    what_didnt = db.Column(db.Text, default='')
    would_recommend = db.Column(db.Boolean, default=True)
    attend_again = db.Column(db.Boolean, default=True)
    anonymous = db.Column(db.Boolean, default=False)
    submitted_at = db.Column(db.DateTime, default=utcnow)


class Certificate(db.Model):
    __tablename__ = 'wm_certificates'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    recipient_name = db.Column(db.String(160), default='')
    recipient_id = db.Column(db.String(36), default='')
    event_id = db.Column(db.String(36), index=True, default='')
    event_title = db.Column(db.String(220), default='')
    issue_date = db.Column(db.String(60), default='')
    credential_id = db.Column(db.String(60), unique=True, index=True, default='')
    issuer = db.Column(db.String(200), default='WayMark Events')
    type = db.Column(db.String(80), default='Participation')
    status = db.Column(db.String(30), default='Valid')            # Valid | Withdrawn
    withdrawn_at = db.Column(db.DateTime)


class Notification(db.Model):
    __tablename__ = 'wm_notifications'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(36), index=True, default='')
    title = db.Column(db.String(200), default='')
    message = db.Column(db.Text, default='')
    type = db.Column(db.String(40), default='reminder')           # reminder | certificate | approval | alert
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)


class AuditLog(db.Model):
    __tablename__ = 'wm_audit_logs'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    action = db.Column(db.String(200), default='')
    user = db.Column(db.String(160), default='')
    target = db.Column(db.String(220), default='')
    ip = db.Column(db.String(60), default='')
    status = db.Column(db.String(30), default='Success')          # Success | Failed | Warning
    timestamp = db.Column(db.DateTime, default=utcnow)


class Job(db.Model):
    __tablename__ = 'wm_jobs'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    event_title = db.Column(db.String(220), default='')
    type = db.Column(db.String(60), default='message')
    label = db.Column(db.String(220), default='')
    subject = db.Column(db.String(220), default='')
    audience = db.Column(db.String(80), default='All registrants')
    recipients_count = db.Column(db.Integer, default=0)
    status = db.Column(db.String(30), default='Queued')           # Queued | Sent | Failed
    error = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow)


class MailMessage(db.Model):
    __tablename__ = 'wm_mail_messages'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    to_email = db.Column(db.String(200), index=True, default='')
    from_email = db.Column(db.String(200), default='')
    subject = db.Column(db.String(220), default='')
    body = db.Column(db.Text, default='')
    kind = db.Column(db.String(40), default='message')            # otp | message | reminder | certificate | system
    status = db.Column(db.String(30), default='Stored')           # Sent | Stored | Failed
    error = db.Column(db.Text, default='')
    job_id = db.Column(db.String(36), default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class PlatformSetting(db.Model):
    __tablename__ = 'wm_settings'

    id = db.Column(db.Integer, primary_key=True, default=1)
    data = db.Column(db.JSON, default=dict)
    updated_at = db.Column(db.DateTime, default=utcnow)


class AiLog(db.Model):
    __tablename__ = 'wm_ai_logs'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    feature = db.Column(db.String(60), default='')
    user = db.Column(db.String(160), default='')
    model = db.Column(db.String(60), default='waymark-local')
    prompt = db.Column(db.Text, default='')
    response = db.Column(db.Text, default='')
    tokens = db.Column(db.Integer, default=0)
    status = db.Column(db.String(30), default='Success')
    created_at = db.Column(db.DateTime, default=utcnow)