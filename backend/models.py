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

    # ---- notification consent (added by migration 0001) ----
    notify_prefs = db.Column(db.JSON, default=dict)  # {schedule, reminders, certificates, ...}


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
    is_system = db.Column(db.Boolean, default=False)
    config = db.Column(db.JSON, default=dict)   # data-driven behaviour: fields, questions,
    # participation mode, workflow steps, certificate rules, required resources
    updated_at = db.Column(db.DateTime, default=utcnow)


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

    # ---- universal event engine (added by migration 0002) ----
    event_type = db.Column(db.String(80), default='')        # Event.name / EventType.name
    parent_event_id = db.Column(db.String(36), index=True, default='')
    format = db.Column(db.String(20), default='Offline')     # Online | Offline | Hybrid
    timezone = db.Column(db.String(60), default='Asia/Kolkata')
    start_date = db.Column(db.String(20), default='')        # YYYY-MM-DD
    end_date = db.Column(db.String(20), default='')          # YYYY-MM-DD
    participation = db.Column(db.String(20), default='individual')  # individual | team
    currency = db.Column(db.String(3), default='INR')
    org_id = db.Column(db.String(36), index=True, default='')
    config = db.Column(db.JSON, default=dict)                # per-event override of event-type config
    settings = db.Column(db.JSON, default=dict)              # registration questions, workflow state

    # ---- discovery identity (added by migration 0005) ----
    slug = db.Column(db.String(160), unique=True, index=True, default=None)
    visibility = db.Column(db.String(20), default='public')  # public | unlisted


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

    # ---- registration integrity (added by migration 0005) ----
    identity_snapshot = db.Column(db.JSON, default=dict)        # name/email/phone/institution at registration time
    answers = db.Column(db.JSON, default=dict)                  # this event's question answers
    verification_state = db.Column(db.String(20), default='pending')  # pending | verified | exception | overridden
    verification_note = db.Column(db.Text, default='')
    qr_revoked_at = db.Column(db.DateTime)


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


class GuestAccess(db.Model):
    """A scoped, revocable guest link (judge or scanner) for one event.

    Replaces the ad-hoc jury guest_token/volunteer invite_token pattern with a
    single table so judge links and door-staff scanner links share one model.
    Tokens are stored hashed; the raw token is shown once at creation. A guest
    link never grants an application role and never creates a user account."""
    __tablename__ = 'wm_guest_access'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    event_title = db.Column(db.String(220), default='')
    kind = db.Column(db.String(20), default='judge')          # judge | scanner
    name = db.Column(db.String(160), default='')
    email = db.Column(db.String(200), default='')
    mobile = db.Column(db.String(60), default='')
    affiliation = db.Column(db.String(200), default='')
    panel_role = db.Column(db.String(80), default='')         # e.g. Head judge
    section = db.Column(db.String(120), default='')           # judge section/track/team scope
    access_from = db.Column(db.DateTime)
    access_to = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='invited')      # invited | active | locked | revoked
    token_hash = db.Column(db.String(128), unique=True, index=True, default=None)
    activated_at = db.Column(db.DateTime)
    conflict_declared_at = db.Column(db.DateTime)
    revoked_at = db.Column(db.DateTime)
    created_by = db.Column(db.String(36), default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class EventApprovalRecord(db.Model):
    """Insert-only approval trail. One row per submitted/approved/changes/
    rejected/resubmitted action, so the review history can never be rewritten."""
    __tablename__ = 'wm_event_approval_records'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    action = db.Column(db.String(40), default='')             # submitted | approved | changes_requested | rejected | resubmitted
    reason = db.Column(db.Text, default='')
    actor_id = db.Column(db.String(36), default='')
    actor_name = db.Column(db.String(160), default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class ResultRelease(db.Model):
    """One row per (event, round) release. Insert-only; rubric edits stop once
    a round is released."""
    __tablename__ = 'wm_result_releases'
    __table_args__ = (db.UniqueConstraint('event_id', 'round', name='uq_result_release'),)

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    round = db.Column(db.String(60), default='final')
    released_at = db.Column(db.DateTime, default=utcnow)
    released_by = db.Column(db.String(160), default='')


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
    invite_token = db.Column(db.String(60), unique=True,
                             default=lambda: 'vol_' + uuid.uuid4().hex[:24])
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=utcnow)

    # ---- coordination profile (added by migration 0003) ----
    skills = db.Column(db.JSON, default=list)
    availability = db.Column(db.JSON, default=list)   # [{day, from, to}]
    venue = db.Column(db.String(200), default='')
    max_hours = db.Column(db.Integer, default=0)      # 0 = no configured cap
    assigned_hours = db.Column(db.Float, default=0)
    completed_tasks = db.Column(db.Integer, default=0)


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


# --------------------------------------------------------------------------- #
# Universal event engine: configurable types, parent/sub events, structure     #
# --------------------------------------------------------------------------- #

class Venue(db.Model):
    """A physical location inside an event. Rooms hang off venues as Resources."""
    __tablename__ = 'wm_venues'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    name = db.Column(db.String(200), nullable=False)
    address = db.Column(db.String(300), default='')
    city = db.Column(db.String(120), default='')
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    map_url = db.Column(db.String(400), default='')
    directions = db.Column(db.String(400), default='')
    capacity = db.Column(db.Integer, default=0)
    accessibility = db.Column(db.Text, default='')     # only meaningful when supplied
    is_primary = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)


class Session(db.Model):
    """A schedulable activity. `day` is YYYY-MM-DD and start/end are 24h HH:MM
    so the backend can do deterministic overlap maths."""
    __tablename__ = 'wm_sessions'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    parent_event_id = db.Column(db.String(36), index=True, default='')
    title = db.Column(db.String(220), nullable=False)
    description = db.Column(db.Text, default='')
    session_type = db.Column(db.String(40), default='Talk')  # Talk|Keynote|Workshop|Hackathon|Contest|Break|Registration|Networking|Other
    day = db.Column(db.String(20), default='')               # YYYY-MM-DD
    start_time = db.Column(db.String(10), default='')        # HH:MM
    end_time = db.Column(db.String(10), default='')          # HH:MM
    venue_id = db.Column(db.String(36), index=True, default='')
    room_name = db.Column(db.String(200), default='')
    capacity = db.Column(db.Integer, default=0)
    speakers = db.Column(db.JSON, default=list)              # [{name, email, resourceId}]
    track = db.Column(db.String(120), default='')
    status = db.Column(db.String(30), default='Draft')       # Draft | Published | Completed | Cancelled
    order_index = db.Column(db.Integer, default=0)
    setup_minutes = db.Column(db.Integer, default=0)
    teardown_minutes = db.Column(db.Integer, default=0)
    required_resource_ids = db.Column(db.JSON, default=list) # dependency tracking
    resource_deadline = db.Column(db.String(20), default='') # YYYY-MM-DD HH:MM
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow)


class Resource(db.Model):
    """Bookable resource: rooms, kit, and people (staff/speakers/judges/volunteers)."""
    __tablename__ = 'wm_resources'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    name = db.Column(db.String(200), nullable=False)
    kind = db.Column(db.String(40), default='Room')  # Room|Auditorium|Laboratory|Equipment|Projector|Audio system|Vehicle|Staff|Speaker|Judge|Volunteer
    venue_id = db.Column(db.String(36), index=True, default='')
    capacity = db.Column(db.Integer, default=0)
    location = db.Column(db.String(200), default='')
    available_days = db.Column(db.JSON, default=list)   # ['YYYY-MM-DD', ...] empty = all days
    available_from = db.Column(db.String(10), default='')
    available_to = db.Column(db.String(10), default='')
    setup_minutes = db.Column(db.Integer, default=0)
    teardown_minutes = db.Column(db.Integer, default=0)
    status = db.Column(db.String(30), default='Active')  # Active | Maintenance | Unavailable
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class ResourceBooking(db.Model):
    __tablename__ = 'wm_resource_bookings'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    session_id = db.Column(db.String(36), index=True, default='')
    resource_id = db.Column(db.String(36), index=True, default='')
    day = db.Column(db.String(20), default='')
    start_time = db.Column(db.String(10), default='')
    end_time = db.Column(db.String(10), default='')
    setup_minutes = db.Column(db.Integer, default=0)
    teardown_minutes = db.Column(db.Integer, default=0)
    status = db.Column(db.String(30), default='Planned')  # Planned | Confirmed | Released
    notes = db.Column(db.String(300), default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class ScheduleConflict(db.Model):
    """Persisted, deterministic scheduling problem. Never written by AI."""
    __tablename__ = 'wm_schedule_conflicts'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    conflict_type = db.Column(db.String(60), default='')
    # Room overlap | Speaker overlap | Judge overlap | Volunteer conflict |
    # Resource overlap | Capacity exceeded | Outside availability | Impossible deadline | Missing resource
    severity = db.Column(db.String(20), default='Warning')   # Critical | Warning
    resource_id = db.Column(db.String(36), index=True, default='')
    resource_name = db.Column(db.String(200), default='')
    session_ids = db.Column(db.JSON, default=list)
    session_titles = db.Column(db.JSON, default=list)
    person = db.Column(db.String(200), default='')
    day = db.Column(db.String(20), default='')
    start_time = db.Column(db.String(10), default='')
    end_time = db.Column(db.String(10), default='')
    message = db.Column(db.Text, default='')
    detail = db.Column(db.JSON, default=dict)
    status = db.Column(db.String(20), default='Open')        # Open | Resolved | Dismissed
    resolution = db.Column(db.Text, default='')
    detected_at = db.Column(db.DateTime, default=utcnow)
    resolved_at = db.Column(db.DateTime)
    resolved_by = db.Column(db.String(160), default='')
    # A conflict row is re-used across runs when the fingerprint matches.
    fingerprint = db.Column(db.String(120), index=True, default='')


# --------------------------------------------------------------------------- #
# Operations: tasks, incidents                                                 #
# --------------------------------------------------------------------------- #

class Task(db.Model):
    __tablename__ = 'wm_tasks'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    title = db.Column(db.String(220), nullable=False)
    description = db.Column(db.Text, default='')
    assignee_id = db.Column(db.String(36), index=True, default='')
    assignee_name = db.Column(db.String(160), default='')
    assignee_type = db.Column(db.String(20), default='user')  # user | volunteer | jury | unassigned
    priority = db.Column(db.String(20), default='Normal')     # Low | Normal | High | Critical
    due_at = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='Open')         # Open | In progress | Blocked | Done | Cancelled
    depends_on = db.Column(db.JSON, default=list)             # [task_id, ...]
    session_id = db.Column(db.String(36), index=True, default='')
    resource_id = db.Column(db.String(36), default='')
    completion_notes = db.Column(db.Text, default='')
    created_by = db.Column(db.String(160), default='')
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow)
    completed_at = db.Column(db.DateTime)


class Incident(db.Model):
    __tablename__ = 'wm_incidents'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    title = db.Column(db.String(220), nullable=False)
    description = db.Column(db.Text, default='')
    severity = db.Column(db.String(20), default='Medium')     # Low | Medium | High | Critical
    status = db.Column(db.String(20), default='Open')         # Open | Investigating | Resolved | Closed
    assignee_id = db.Column(db.String(36), default='')
    assignee_name = db.Column(db.String(160), default='')
    location = db.Column(db.String(200), default='')
    resolution = db.Column(db.Text, default='')
    created_by = db.Column(db.String(160), default='')
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow)
    resolved_at = db.Column(db.DateTime)


# --------------------------------------------------------------------------- #
# Finance: budget + sponsors (money stored as integer minor units)             #
# --------------------------------------------------------------------------- #

class BudgetCategory(db.Model):
    __tablename__ = 'wm_budget_categories'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    name = db.Column(db.String(160), nullable=False)
    planned_minor = db.Column(db.Integer, default=0)
    currency = db.Column(db.String(3), default='INR')
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=utcnow)


class BudgetLine(db.Model):
    """Actual expense, sponsorship received or other recorded revenue."""
    __tablename__ = 'wm_budget_lines'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    category_id = db.Column(db.String(36), index=True, default='')
    description = db.Column(db.String(240), default='')
    kind = db.Column(db.String(30), default='Expense')        # Expense | Sponsorship | Revenue | Adjustment
    amount_minor = db.Column(db.Integer, default=0)
    currency = db.Column(db.String(3), default='INR')
    date = db.Column(db.String(20), default='')               # YYYY-MM-DD
    document_ref = db.Column(db.String(400), default='')
    created_by = db.Column(db.String(160), default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class Sponsor(db.Model):
    __tablename__ = 'wm_sponsors'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    name = db.Column(db.String(200), nullable=False)
    contact_name = db.Column(db.String(160), default='')
    contact_email = db.Column(db.String(200), default='')
    contact_phone = db.Column(db.String(60), default='')
    package = db.Column(db.String(160), default='')
    promised_minor = db.Column(db.Integer, default=0)
    received_minor = db.Column(db.Integer, default=0)
    currency = db.Column(db.String(3), default='INR')
    status = db.Column(db.String(30), default='Prospect')     # Prospect | Pledged | Confirmed | Paid | Declined
    logo_url = db.Column(db.String(400), default='')
    booth = db.Column(db.String(120), default='')
    deliverables = db.Column(db.JSON, default=list)           # [{title, due, done}]
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow)


# --------------------------------------------------------------------------- #
# Identity: organisations (multi-tenant readiness)                             #
# --------------------------------------------------------------------------- #

class Organization(db.Model):
    __tablename__ = 'wm_organizations'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    name = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(120), unique=True, index=True)
    description = db.Column(db.Text, default='')
    website = db.Column(db.String(220), default='')
    contact_email = db.Column(db.String(200), default='')
    status = db.Column(db.String(20), default='Active')      # Active | Suspended
    created_by = db.Column(db.String(36), default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class OrganizationMember(db.Model):
    __tablename__ = 'wm_org_members'
    __table_args__ = (db.UniqueConstraint('org_id', 'user_id', name='uq_org_user'),)

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    org_id = db.Column(db.String(36), index=True, default='')
    user_id = db.Column(db.String(36), index=True, default='')
    org_role = db.Column(db.String(20), default='Member')     # Owner | Manager | Member
    permissions = db.Column(db.JSON, default=list)            # ['events','budget','sponsors','reports']
    status = db.Column(db.String(20), default='Active')
    created_at = db.Column(db.DateTime, default=utcnow)


# --------------------------------------------------------------------------- #
# Integrations: webhooks, payments (optional), offline check-in sync           #
# --------------------------------------------------------------------------- #

class Webhook(db.Model):
    __tablename__ = 'wm_webhooks'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    url = db.Column(db.String(500), nullable=False)
    secret = db.Column(db.String(120), default='')
    events = db.Column(db.JSON, default=list)                # ['event.published', ...]
    active = db.Column(db.Boolean, default=True)
    created_by = db.Column(db.String(36), default='')
    created_at = db.Column(db.DateTime, default=utcnow)


class WebhookDelivery(db.Model):
    __tablename__ = 'wm_webhook_deliveries'
    __table_args__ = (db.UniqueConstraint('webhook_id', 'idempotency_key', name='uq_hook_key'),)

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    webhook_id = db.Column(db.String(36), index=True, default='')
    event_type = db.Column(db.String(80), default='')
    payload = db.Column(db.JSON, default=dict)
    idempotency_key = db.Column(db.String(120), default='')
    status = db.Column(db.String(20), default='Pending')      # Pending | Delivered | Failed | Skipped
    attempts = db.Column(db.Integer, default=0)
    response_code = db.Column(db.Integer)
    error = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=utcnow)
    delivered_at = db.Column(db.DateTime)


class Payment(db.Model):
    """Optional provider boundary. Amounts are integer minor units; raw card data
    is never stored. A provider ref must be verified server-side before Paid."""
    __tablename__ = 'wm_payments'
    __table_args__ = (db.UniqueConstraint('provider', 'provider_ref', name='uq_provider_ref'),)

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    registration_id = db.Column(db.String(36), index=True, default='')
    user_id = db.Column(db.String(36), index=True, default='')
    provider = db.Column(db.String(40), default='sandbox')
    provider_ref = db.Column(db.String(160), default='')
    idempotency_key = db.Column(db.String(160), unique=True, default='')
    amount_minor = db.Column(db.Integer, default=0)
    currency = db.Column(db.String(3), default='INR')
    status = db.Column(db.String(20), default='Created')      # Created | Pending | Paid | Failed | Refunded | Cancelled
    failure_reason = db.Column(db.String(300), default='')
    meta = db.Column(db.JSON, default=dict)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow)


class OfflineScan(db.Model):
    """A scan that arrived from a device. `client_scan_id` makes retries and
    replays idempotent; conflicts are surfaced rather than silently accepted."""
    __tablename__ = 'wm_offline_scans'
    __table_args__ = (db.UniqueConstraint('event_id', 'client_scan_id', name='uq_scan_client'),)

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    event_id = db.Column(db.String(36), index=True, default='')
    client_scan_id = db.Column(db.String(80), default='')
    device_id = db.Column(db.String(80), default='')
    scanned_at = db.Column(db.String(40), default='')         # device clock, ISO
    registration_id = db.Column(db.String(36), default='')
    ticket_code = db.Column(db.String(60), default='')
    participant_name = db.Column(db.String(160), default='')
    status = db.Column(db.String(20), default='Accepted')     # Accepted | Duplicate | Rejected | Conflict
    detail = db.Column(db.Text, default='')
    online = db.Column(db.Boolean, default=True)
    received_at = db.Column(db.DateTime, default=utcnow)


# --------------------------------------------------------------------------- #
# Certificates + achievements                                                  #
# --------------------------------------------------------------------------- #

class Achievement(db.Model):
    __tablename__ = 'wm_achievements'
    __table_args__ = (db.UniqueConstraint('user_id', 'dedupe_key', name='uq_user_achievement'),)

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(36), index=True, default='')
    event_id = db.Column(db.String(36), index=True, default='')
    event_title = db.Column(db.String(220), default='')
    kind = db.Column(db.String(40), default='Participation')  # Participation | Workshop | Presentation | Award | Volunteer service
    title = db.Column(db.String(220), default='')
    detail = db.Column(db.Text, default='')
    source = db.Column(db.String(40), default='')             # attendance | result | volunteer | certificate
    credential_id = db.Column(db.String(60), default='')
    shared = db.Column(db.Boolean, default=True)
    issued_at = db.Column(db.DateTime, default=utcnow)
    dedupe_key = db.Column(db.String(160), default='')


# --------------------------------------------------------------------------- #
# AI co-pilot: reviewable structured plans (AI never applies them itself)       #
# --------------------------------------------------------------------------- #

class EventPlan(db.Model):
    __tablename__ = 'wm_event_plans'

    id = db.Column(db.String(36), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(36), index=True, default='')
    title = db.Column(db.String(220), default='')
    brief = db.Column(db.Text, default='')
    plan = db.Column(db.JSON, default=dict)                   # structured, schema-validated
    validation = db.Column(db.JSON, default=dict)             # {valid, errors:[...]}
    status = db.Column(db.String(20), default='Draft')        # Draft | Approved | Rejected | Applied
    applied_at = db.Column(db.DateTime)
    applied_ref = db.Column(db.String(36), default='')        # created event id
    provider = db.Column(db.String(40), default='local')      # local | openai | anthropic | gemini
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow)