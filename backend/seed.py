"""Initial demo data plus an idempotent account guarantee.

Only two application roles exist: `admin` and `user`. The exact development
accounts (admin/admin@123 and user@baymark.com/user@123) are ensured on every
boot via ensure_accounts(), so the credentials never drift.
"""
from datetime import datetime, timedelta

from extensions import db
from models import (AiLog, AttendanceLog, AuditLog, Certificate, CheckInException, Event,
                    EventType, Feedback, HostingRequest, Job, JuryAssignment, MailMessage,
                    Notification, PlatformSetting, Registration, Rubric, Score, Submission,
                    User, Volunteer)
from utils.helpers import credential_code, refresh_event_counts, ticket_code
from utils.security import hash_password

DOMAIN = 'baymark.com'

ACCOUNTS = [
    {'username': 'admin', 'email': 'admin@baymark.com', 'password': 'admin@123',
     'name': 'Asha Menon', 'role': 'admin'},
    {'username': 'user', 'email': 'user@baymark.com', 'password': 'user@123',
     'name': 'Kiran Patel', 'role': 'user'},
]


def ensure_accounts():
    """Create or repair the two required accounts. Safe to call on every boot."""
    changed = False
    for spec in ACCOUNTS:
        user = User.query.filter(
            db.or_(User.username == spec['username'], User.email == spec['email'])
        ).first()
        if not user:
            user = User(name=spec['name'], email=spec['email'], role=spec['role'])
            db.session.add(user)
            changed = True
        user.username = spec['username']
        user.email = spec['email']
        user.role = spec['role']
        user.status = 'Active'
        user.password_hash = hash_password(spec['password'])
    if changed:
        db.session.commit()
    else:
        db.session.commit()
    return changed


# --------------------------------------------------------------------------- #
# Data-driven event type defaults                                              #
# --------------------------------------------------------------------------- #
# `config` is the whole behaviour contract for an event type: what the form
# asks, whether people register individually or in teams, whether sessions /
# evaluation / certificates are required, which resources must be booked, the
# workflow steps and sensible default budget categories. Admins can edit any of
# it without a code change (PATCH /api/event-types/<id>).

DEFAULT_EVENT_TYPE_CONFIGS = {
    'Hackathon': {
        'participation': 'team',
        'teamSizeMin': 1, 'teamSizeMax': 5,
        'fields': [
            {'key': 'tracks', 'label': 'Project tracks', 'type': 'tags',
             'options': ['AI/ML', 'Web', 'IoT', 'Blockchain', 'Open innovation'], 'required': False},
            {'key': 'submissionDeadline', 'label': 'Submission deadline', 'type': 'datetime', 'required': True},
            {'key': 'mentors', 'label': 'Mentors required', 'type': 'boolean', 'required': False},
        ],
        'registrationQuestions': [
            {'key': 'github', 'label': 'GitHub or portfolio link', 'type': 'url', 'required': False},
            {'key': 'experience', 'label': 'Team experience level', 'type': 'select',
             'options': ['First hackathon', '1-2 events', 'Regular competitors'], 'required': True},
        ],
        'sessionsRequired': True,
        'sessionTypes': ['Registration', 'Keynote', 'Hackathon', 'Mentoring', 'Judging', 'Awards'],
        'evaluation': {'enabled': True, 'type': 'jury', 'rounds': ['preliminary', 'final'],
                       'criteria': ['Innovation', 'Technical execution', 'Impact', 'Presentation']},
        'certificates': {'enabled': True, 'rules': ['verified_attendance', 'submission']},
        'approval': 'admin',
        'requiredResources': ['Audio system', 'Projector'],
        'workflow': [
            {'key': 'description', 'label': 'Event brief'},
            {'key': 'schedule', 'label': 'Build schedule & tracks'},
            {'key': 'registration', 'label': 'Team registration questions'},
            {'key': 'resources', 'label': 'Venue, power & kit'},
            {'key': 'judging', 'label': 'Jury and rubric'},
            {'key': 'publish', 'label': 'Publish'},
        ],
        'defaultBudgetCategories': ['Venue & power', 'Prizes', 'Food & beverages', 'Kit & swag', 'Marketing'],
        'tracks': ['AI/ML', 'Web', 'IoT', 'Blockchain', 'Open innovation'],
    },
    'Academic conference': {
        'participation': 'individual',
        'fields': [
            {'key': 'callForPapers', 'label': 'Call for papers closes', 'type': 'date', 'required': True},
            {'key': 'reviewModel', 'label': 'Review model', 'type': 'select',
             'options': ['Single blind', 'Double blind', 'Open review'], 'required': True},
            {'key': 'presentation', 'label': 'Presentation format', 'type': 'select',
             'options': ['Oral', 'Poster', 'Both'], 'required': False},
        ],
        'registrationQuestions': [
            {'key': 'affiliation', 'label': 'Institution / affiliation', 'type': 'text', 'required': True},
            {'key': 'designation', 'label': 'Designation', 'type': 'text', 'required': False},
        ],
        'submissions': {'enabled': True, 'kind': 'paper', 'deadlineField': 'callForPapers',
                        'requiresReview': True, 'decisions': ['Accepted', 'Minor revision', 'Rejected']},
        'sessionsRequired': True,
        'sessionTypes': ['Keynote', 'Talk', 'Paper presentation', 'Panel', 'Networking'],
        'evaluation': {'enabled': True, 'type': 'reviewer', 'rounds': ['review', 'camera ready'],
                       'criteria': ['Relevance', 'Methodology', 'Novelty', 'Clarity']},
        'certificates': {'enabled': True, 'rules': ['verified_attendance', 'presentation']},
        'approval': 'admin',
        'requiredResources': ['Audio system', 'Projector'],
        'workflow': [
            {'key': 'description', 'label': 'Conference scope'},
            {'key': 'call', 'label': 'Call for papers'},
            {'key': 'review', 'label': 'Reviewer assignment'},
            {'key': 'schedule', 'label': 'Programme'},
            {'key': 'publish', 'label': 'Publish'},
        ],
        'defaultBudgetCategories': ['Venue', 'Catering', 'Speaker travel', 'Proceedings', 'Publication fees'],
    },
    'College symposium': {
        'participation': 'team',
        'teamSizeMin': 1, 'teamSizeMax': 4,
        'fields': [
            {'key': 'competitions', 'label': 'Competitions', 'type': 'tags',
             'options': ['Paper presentation', 'Coding', 'Quiz', 'Debugging', 'Poster'], 'required': False},
            {'key': 'workshops', 'label': 'Workshops offered', 'type': 'number', 'required': False},
            {'key': 'multiVenue', 'label': 'Multiple venues', 'type': 'boolean', 'required': False},
        ],
        'registrationQuestions': [
            {'key': 'college', 'label': 'College name', 'type': 'text', 'required': True},
            {'key': 'year', 'label': 'Year of study', 'type': 'select',
             'options': ['1st', '2nd', '3rd', '4th', 'PG'], 'required': True},
            {'key': 'studentId', 'label': 'Student ID', 'type': 'text', 'required': False},
        ],
        'sessionsRequired': True,
        'sessionTypes': ['Registration', 'Keynote', 'Contest', 'Workshop', 'Paper presentation', 'Awards'],
        'evaluation': {'enabled': True, 'type': 'jury', 'rounds': ['preliminary', 'final'],
                       'criteria': ['Content', 'Execution', 'Relevance', 'Q&A']},
        'certificates': {'enabled': True, 'rules': ['verified_attendance']},
        'approval': 'admin',
        'requiredResources': ['Audio system'],
        'workflow': [
            {'key': 'description', 'label': 'Symposium brief'},
            {'key': 'competitions', 'label': 'Competitions & workshops'},
            {'key': 'schedule', 'label': 'Multi-venue schedule'},
            {'key': 'volunteers', 'label': 'Volunteer assignments'},
            {'key': 'publish', 'label': 'Publish'},
        ],
        'defaultBudgetCategories': ['Venue', 'Prizes', 'Catering', 'Printing & branding', 'Logistics'],
    },
    'IT conference': {
        'participation': 'individual',
        'fields': [
            {'key': 'tracks', 'label': 'Tracks', 'type': 'tags',
             'options': ['Engineering', 'Product', 'Data', 'Security', 'Design'], 'required': False},
            {'key': 'sponsors', 'label': 'Sponsor packages', 'type': 'number', 'required': False},
            {'key': 'exhibitors', 'label': 'Exhibitor booths', 'type': 'number', 'required': False},
        ],
        'registrationQuestions': [
            {'key': 'company', 'label': 'Company', 'type': 'text', 'required': False},
            {'key': 'jobTitle', 'label': 'Job title', 'type': 'text', 'required': False},
        ],
        'sessionsRequired': True,
        'sessionTypes': ['Keynote', 'Talk', 'Workshop', 'Networking', 'Break'],
        'evaluation': {'enabled': False, 'type': 'none', 'rounds': [], 'criteria': []},
        'certificates': {'enabled': True, 'rules': ['verified_attendance']},
        'approval': 'admin',
        'requiredResources': ['Audio system', 'Projector'],
        'workflow': [
            {'key': 'description', 'label': 'Conference brief'},
            {'key': 'speakers', 'label': 'Speakers & sessions'},
            {'key': 'sponsors', 'label': 'Sponsors & exhibitors'},
            {'key': 'schedule', 'label': 'Tracks & schedule'},
            {'key': 'publish', 'label': 'Publish'},
        ],
        'defaultBudgetCategories': ['Venue', 'Speakers', 'Catering', 'Production', 'Sponsorship fulfilment'],
    },
    'Corporate event': {
        'participation': 'individual',
        'fields': [
            {'key': 'invitations', 'label': 'Invitation only', 'type': 'boolean', 'required': False},
            {'key': 'approvalRequired', 'label': 'Registration needs approval', 'type': 'boolean', 'required': False},
            {'key': 'budgetCode', 'label': 'Internal budget code', 'type': 'text', 'required': False},
        ],
        'registrationQuestions': [
            {'key': 'company', 'label': 'Company', 'type': 'text', 'required': True},
            {'key': 'dietary', 'label': 'Dietary requirements', 'type': 'text', 'required': False},
        ],
        'sessionsRequired': True,
        'sessionTypes': ['Registration', 'Talk', 'Break', 'Networking'],
        'evaluation': {'enabled': False, 'type': 'none', 'rounds': [], 'criteria': []},
        'certificates': {'enabled': False, 'rules': []},
        'approval': 'admin',
        'requiredResources': ['Audio system', 'Projector'],
        'workflow': [
            {'key': 'description', 'label': 'Event brief'},
            {'key': 'guests', 'label': 'Guest list & invitations'},
            {'key': 'schedule', 'label': 'Agenda'},
            {'key': 'budget', 'label': 'Budget & sponsors'},
            {'key': 'publish', 'label': 'Publish'},
        ],
        'defaultBudgetCategories': ['Venue', 'Catering', 'Production', 'Travel', 'Contingency'],
    },
    'Workshop': {
        'participation': 'individual',
        'fields': [{'key': 'level', 'label': 'Skill level', 'type': 'select',
                    'options': ['Beginner', 'Intermediate', 'Advanced'], 'required': True}],
        'registrationQuestions': [{'key': 'prerequisites', 'label': 'Prerequisites met?', 'type': 'boolean',
                                   'required': False}],
        'sessionsRequired': True,
        'sessionTypes': ['Registration', 'Workshop', 'Break'],
        'evaluation': {'enabled': False, 'type': 'none', 'rounds': [], 'criteria': []},
        'certificates': {'enabled': True, 'rules': ['verified_attendance']},
        'approval': 'admin',
        'requiredResources': ['Projector'],
        'workflow': [{'key': 'description', 'label': 'Workshop brief'},
                     {'key': 'schedule', 'label': 'Agenda'},
                     {'key': 'publish', 'label': 'Publish'}],
        'defaultBudgetCategories': ['Venue', 'Trainer', 'Materials', 'Catering'],
    },
    'Competition': {
        'participation': 'team',
        'teamSizeMin': 1, 'teamSizeMax': 3,
        'fields': [{'key': 'rounds', 'label': 'Number of rounds', 'type': 'number', 'required': True}],
        'registrationQuestions': [],
        'sessionsRequired': True,
        'sessionTypes': ['Registration', 'Contest', 'Judging', 'Awards'],
        'evaluation': {'enabled': True, 'type': 'jury', 'rounds': ['round 1', 'final'],
                       'criteria': ['Accuracy', 'Speed', 'Presentation']},
        'certificates': {'enabled': True, 'rules': ['verified_attendance', 'result_rank']},
        'approval': 'admin',
        'requiredResources': [],
        'workflow': [{'key': 'description', 'label': 'Rules & rounds'},
                     {'key': 'judging', 'label': 'Jury and rubric'},
                     {'key': 'publish', 'label': 'Publish'}],
        'defaultBudgetCategories': ['Prizes', 'Venue', 'Catering', 'Logistics'],
    },
    'Conference': {
        'participation': 'individual',
        'sessionsRequired': True,
        'sessionTypes': ['Keynote', 'Talk', 'Panel', 'Networking'],
        'evaluation': {'enabled': False, 'type': 'none', 'rounds': [], 'criteria': []},
        'certificates': {'enabled': True, 'rules': ['verified_attendance']},
        'approval': 'admin',
        'requiredResources': ['Audio system'],
        'workflow': [{'key': 'description', 'label': 'Event brief'},
                     {'key': 'schedule', 'label': 'Programme'},
                     {'key': 'publish', 'label': 'Publish'}],
        'defaultBudgetCategories': ['Venue', 'Speakers', 'Catering', 'Production'],
        'fields': [], 'registrationQuestions': [],
    },
    'Community': {
        'participation': 'individual',
        'sessionsRequired': False,
        'sessionTypes': ['Registration', 'Talk', 'Networking'],
        'evaluation': {'enabled': False, 'type': 'none', 'rounds': [], 'criteria': []},
        'certificates': {'enabled': True, 'rules': ['verified_attendance']},
        'approval': 'admin',
        'requiredResources': [],
        'workflow': [{'key': 'description', 'label': 'Event brief'},
                     {'key': 'publish', 'label': 'Publish'}],
        'defaultBudgetCategories': ['Venue', 'Catering', 'Miscellaneous'],
        'fields': [], 'registrationQuestions': [],
    },
}

SYSTEM_EVENT_TYPES = [
    ('Hackathon', 'Multi-day building sprints judged on demo', 'hackathon'),
    ('Workshop', 'Hands-on learning with mentors', 'workshop'),
    ('Conference', 'Talks, panels and networking', 'conference'),
    ('Competition', 'Judged contests with rounds and prizes', 'competition'),
    ('Community', 'Meetups and open gatherings', 'community'),
    ('Academic conference', 'Papers, reviews and presentations', 'conference'),
    ('College symposium', 'Multi-competition campus festival', 'community'),
    ('IT conference', 'Speakers, tracks, sponsors and exhibits', 'conference'),
    ('Corporate event', 'Invited audiences and internal agendas', 'community'),
]


def ensure_event_types():
    """Idempotently create system event types and back-fill missing configs.
    Existing admin customisations are never overwritten."""
    changed = False
    for order, (name, tagline, css) in enumerate(SYSTEM_EVENT_TYPES):
        row = EventType.query.filter_by(name=name).first()
        if not row:
            row = EventType(name=name, tagline=tagline, css_class=css,
                            sort_order=order, is_system=True, config={})
            db.session.add(row)
            changed = True
        if not getattr(row, 'config', None):
            row.config = dict(DEFAULT_EVENT_TYPE_CONFIGS.get(name) or
                              DEFAULT_EVENT_TYPE_CONFIGS['Community'])
            changed = True
        if getattr(row, 'is_system', None) is None:
            row.is_system = True
            changed = True
    db.session.commit()
    return changed


def seed_all():
    if User.query.count() > 0:
        return False

    now = datetime.utcnow()

    # ---- event types ------------------------------------------------------
    for i, (name, tagline, css) in enumerate([
        ('Hackathon', 'Multi-day building sprints judged on demo', 'hackathon'),
        ('Workshop', 'Hands-on learning with mentors', 'workshop'),
        ('Conference', 'Talks, panels and networking', 'conference'),
        ('Competition', 'Head-to-head judged contests', 'competition'),
        ('Community', 'Casual meetups for the community', 'community'),
    ]):
        db.session.add(EventType(name=name, tagline=tagline, css_class=css, sort_order=i))

    # ---- users (exactly two roles: admin + user) --------------------------
    def make_user(username, name, role, password, status='Active', org=''):
        u = User(username=username, name=name, email=username + '@' + DOMAIN, role=role,
                 status=status, password_hash=hash_password(password), org=org,
                 location='Bengaluru, India', bio='Part of the WayMark community.', email_updates=True)
        db.session.add(u)
        return u

    users = {}
    users['admin'] = make_user('admin', 'Asha Menon', 'admin', 'admin@123', org='Platform operations')
    users['user'] = make_user('user', 'Kiran Patel', 'user', 'user@123', org='Frontend engineer')
    users['devi'] = make_user('devi', 'Devi Raman', 'user', 'demo@1234', org='Community programs lead')
    users['rhea'] = make_user('rhea', 'Rhea Nair', 'user', 'demo@1234', org='Data analyst')
    users['tomas'] = make_user('tomas', 'Tomas Fernandes', 'user', 'demo@1234', org='Backend engineer')
    users['alba'] = make_user('alba', 'Alba Cortes', 'user', 'demo@1234', org='Designer')
    users['jin'] = make_user('jin', 'Jin Zhou', 'user', 'demo@1234', status='Invited', org='ML engineer')
    users['noor'] = make_user('noor', 'Noor Hassan', 'user', 'demo@1234', org='Robotics engineer')
    db.session.commit()

    # ---- events (owned by the Normal User "Devi Raman") -------------------
    def make_event(**kw):
        e = Event(**kw)
        db.session.add(e)
        return e

    devi = users['devi']
    ez = make_event(
        host_id=devi.id, host_name='Devi Raman', title='Zero Day Hackathon',
        category='Hackathon', description='A 24-hour build sprint for teams shipping bold ideas in AI, climate and open source.',
        date='Nov 14, 2026', time='09:00 - 21:00', location='Innovation Hub, Bengaluru',
        seats=200, status='Registration open', approval_status='Approved', tone='blue', color='#2B4BD8',
        initials='ZH', organizer='WayMark Labs', capacity_num=200, reg_deadline='Nov 10, 2026',
        contact_email='devi@baymark.com', website='https://waymark.dev/zero-day',
        tags=['AI', 'Climate', 'Open source'],
        agenda=[{'time': '09:00', 'title': 'Check-in & team formation'},
                {'time': '10:00', 'title': 'Build sprint begins'},
                {'time': '18:00', 'title': 'Demo jam'},
                {'time': '20:00', 'title': 'Judging & awards'}],
        requirements=['Team of 2-4', 'Laptop + charger', 'Valid student/work ID'],
    )
    aip = make_event(
        host_id=devi.id, host_name='Devi Raman', title='AI Product Sprint',
        category='Workshop', description='Ship an AI-assisted product slice in a weekend with mentor reviews.',
        date='Oct 24, 2026', time='10:00 - 18:00', location='T-Works Studio, Hyderabad',
        seats=60, status='Registration open', approval_status='Approved', tone='teal', color='#0E9384',
        initials='AP', organizer='WayMark Labs', capacity_num=60, reg_deadline='Oct 20, 2026',
        contact_email='devi@baymark.com', tags=['AI', 'Product'],
        agenda=[{'time': '10:00', 'title': 'Kickoff & API tour'}, {'time': '14:00', 'title': 'Build & mentor reviews'}],
        requirements=['Basic JavaScript', 'Laptop'],
    )
    cfs = make_event(
        host_id=devi.id, host_name='Devi Raman', title='Campus Founders Summit',
        category='Conference', description='Talks and panels for student founders, operators and investors.',
        date='Dec 05, 2026', time='09:30 - 17:30', location='Grand Hall, IIM Bangalore',
        seats=300, status='Registration open', approval_status='Approved', tone='purple', color='#6941C6',
        initials='CF', organizer='WayMark Labs', capacity_num=300, reg_deadline='Dec 01, 2026',
        contact_email='devi@baymark.com', tags=['Founders', 'Startups'],
        agenda=[{'time': '09:30', 'title': 'Opening keynote'}, {'time': '11:00', 'title': 'Founder panels'}],
        requirements=['Student or founder ID'],
    )
    rrf = make_event(
        host_id=devi.id, host_name='Devi Raman', title='Robotics Rumble Finals',
        category='Competition', description='The national finals for autonomous robot teams. Two arenas, one champion.',
        date='Oct 12, 2026', time='10:00 - 19:00', location='Robotics Arena, Pune',
        seats=40, status='Ongoing', approval_status='Approved', tone='orange', color='#E4780C',
        initials='RR', organizer='WayMark Labs', capacity_num=40, reg_deadline='Oct 01, 2026',
        contact_email='devi@baymark.com', tags=['Robotics', 'Autonomy'],
        agenda=[{'time': '10:00', 'title': 'Qualifiers'}, {'time': '16:00', 'title': 'Grand final'}],
        requirements=['Registered team', 'Safety gear'],
    )
    dsb = make_event(
        host_id=devi.id, host_name='Devi Raman', title='Design Systems Bootcamp',
        category='Workshop', description='Two days of hands-on design systems practice: tokens, docs and governance.',
        date='Sep 20, 2026', time='09:00 - 17:00', location='Design Loft, Mumbai',
        seats=40, status='Completed', approval_status='Approved', tone='teal', color='#0E9384',
        initials='DS', organizer='WayMark Labs', capacity_num=40, reg_deadline='Sep 15, 2026',
        contact_email='devi@baymark.com', tags=['Design', 'Systems'],
        agenda=[{'time': '09:00', 'title': 'Tokens & theming'}, {'time': '13:30', 'title': 'Docs & governance'}],
        requirements=['Figma account', 'Laptop'],
        results_released=True, released_at=now - timedelta(days=3),
    )
    epc = make_event(
        host_id=devi.id, host_name='Devi Raman', title='Evening Pitch Circle',
        category='Community', description='A relaxed pitch night: five minutes to pitch, five minutes of feedback.',
        date='Nov 02, 2026', time='18:30 - 21:00', location='Rooftop Cafe, Indiranagar',
        seats=30, status='Draft', approval_status='Draft', tone='green', color='#067647',
        initials='EP', organizer='WayMark Labs', capacity_num=30, tags=['Pitching', 'Community'],
    )
    brj = make_event(
        host_id=devi.id, host_name='Devi Raman', title='Biohack Review Jam',
        category='Hackathon', description='A review-focused jam where teams harden bio-tech prototypes with mentors.',
        date='Dec 18, 2026', time='09:00 - 20:00', location='Labs, IISc Bengaluru',
        seats=80, status='Pending', approval_status='Pending', tone='blue', color='#2B4BD8',
        initials='BR', organizer='WayMark Labs', capacity_num=80, reg_deadline='Dec 14, 2026',
        contact_email='devi@baymark.com', tags=['Bio-tech', 'Mentorship'],
        submitted_at=now - timedelta(hours=20),
    )
    ggc = make_event(
        host_id=devi.id, host_name='Devi Raman', title='Green Grid Challenge',
        category='Competition', description='A virtual challenge to optimise energy grids with data.',
        date='Jan 10, 2027', time='All day', location='Virtual',
        seats=150, status='Changes requested', approval_status='Changes requested', tone='orange', color='#E4780C',
        initials='GG', organizer='WayMark Labs', capacity_num=150,
        rejection_reason='Please add judging criteria and confirm the venue capacity.',
        submitted_at=now - timedelta(days=2),
    )
    db.session.commit()

    # ---- registrations ----------------------------------------------------
    def make_reg(user, event, status='Confirmed', attendance='Registered', pos=None):
        reg = Registration(
            user_id=user.id, user_name=user.name, user_email=user.email,
            event_id=event.id, event_title=event.title, category=event.category,
            date=event.date, time=event.time, location=event.location,
            status=status, attendance_status=attendance,
            ticket_code=ticket_code() if status in ('Confirmed', 'Registered') else None,
            waitlist_position=pos, registered_at=now - timedelta(days=14),
        )
        db.session.add(reg)
        return reg

    regs = {}
    regs['user_ez'] = make_reg(users['user'], ez)
    regs['user_aip'] = make_reg(users['user'], aip)
    regs['user_rrf'] = make_reg(users['user'], rrf, status='Waitlisted', pos=3)
    regs['user_dsb'] = make_reg(users['user'], dsb, attendance='Checked in')
    regs['user_epc'] = make_reg(users['user'], epc)
    regs['user_cfs'] = make_reg(users['user'], cfs, status='Offered', pos=1)
    regs['user_cfs'].offer_expires_at = now + timedelta(hours=36)
    regs['rhea_ez'] = make_reg(users['rhea'], ez)
    regs['rhea_rrf'] = make_reg(users['rhea'], rrf, attendance='Checked in')
    regs['rhea_dsb'] = make_reg(users['rhea'], dsb, attendance='Checked in')
    regs['tomas_ez'] = make_reg(users['tomas'], ez)
    regs['tomas_dsb'] = make_reg(users['tomas'], dsb, attendance='Checked in')
    regs['alba_ez'] = make_reg(users['alba'], ez)
    regs['alba_aip'] = make_reg(users['alba'], aip, status='Waitlisted', pos=1)
    regs['alba_dsb'] = make_reg(users['alba'], dsb, attendance='Checked in')
    regs['jin_ez'] = make_reg(users['jin'], ez, status='Waitlisted', pos=4)
    regs['jin_dsb'] = make_reg(users['jin'], dsb, attendance='Registered')
    regs['noor_ez'] = make_reg(users['noor'], ez, attendance='Checked in')
    regs['noor_rrf'] = make_reg(users['noor'], rrf, attendance='Checked in')
    db.session.commit()
    for event in (ez, aip, cfs, rrf, dsb, epc):
        refresh_event_counts(event)

    # ---- attendance -------------------------------------------------------
    def log_attendance(reg, session='Day 1 - Morning', method='scanner', hours_ago=72):
        db.session.add(AttendanceLog(
            event_id=reg.event_id, registration_id=reg.id, user_id=reg.user_id,
            participant_name=reg.user_name, participant_email=reg.user_email,
            session=session, method=method, status='Checked in',
            timestamp=now - timedelta(hours=hours_ago),
        ))

    log_attendance(regs['user_dsb'], hours_ago=200)
    log_attendance(regs['rhea_dsb'], hours_ago=199)
    log_attendance(regs['tomas_dsb'], hours_ago=198)
    log_attendance(regs['alba_dsb'], hours_ago=197)
    log_attendance(regs['rhea_rrf'], session='Finals', hours_ago=6)
    log_attendance(regs['noor_rrf'], session='Finals', hours_ago=5, method='manual')
    log_attendance(regs['noor_ez'], session='Day 0 - Check-in', hours_ago=2)
    db.session.commit()

    db.session.add(CheckInException(
        event_id=rrf.id, participant_name='Unknown pass', type='Pass not recognised',
        detail='Ticket WM-RR99-0000 scanned at gate 2 did not match any registration.',
        status='Open', detected_at=now - timedelta(hours=4),
    ))

    # ---- jury (event-scoped guests, no user accounts) ---------------------
    db.session.add_all([
        JuryAssignment(event_id=dsb.id, event_title=dsb.title, jury_member_id='',
                       jury_name='Prof. Arjun Iyer', jury_email='arjun@baymark.com',
                       expertise='Systems & AI', assigned_tracks=['Design infra', 'Tooling'],
                       status='Completed', guest_token='jury-design-9f2a'),
        JuryAssignment(event_id=dsb.id, event_title=dsb.title, jury_member_id='',
                       jury_name='Meera Shah', jury_email='meera@baymark.com',
                       expertise='Product design', assigned_tracks=['Motion', 'Brand'],
                       status='Completed', guest_token='jury-design-4b7c'),
        JuryAssignment(event_id=dsb.id, event_title=dsb.title, jury_member_id='',
                       jury_name='Demo Judge', jury_email='demo.judge@baymark.com',
                       expertise='Guest reviewer', assigned_tracks=[],
                       status='Active', guest_token='demo-jury'),
        JuryAssignment(event_id=rrf.id, event_title=rrf.title, jury_member_id='',
                       jury_name='Prof. Arjun Iyer', jury_email='arjun@baymark.com',
                       expertise='Robotics', assigned_tracks=['Autonomy'],
                       status='Active', guest_token='jury-robotics-4c1b'),
    ])

    criteria = [
        {'id': 'c1', 'name': 'Problem relevance', 'description': 'How well the solution addresses the brief', 'weight': 30, 'maxScore': 10},
        {'id': 'c2', 'name': 'Solution quality', 'description': 'Depth, craft and feasibility of the work', 'weight': 30, 'maxScore': 10},
        {'id': 'c3', 'name': 'Demo & storytelling', 'description': 'Clarity of the walkthrough and narrative', 'weight': 20, 'maxScore': 10},
        {'id': 'c4', 'name': 'Technical depth', 'description': 'Engineering choices and originality', 'weight': 20, 'maxScore': 10},
    ]
    db.session.add(Rubric(event_id=dsb.id, rubric_name='Standard judging rubric', round='final', criteria=criteria))
    db.session.add(Rubric(event_id=rrf.id, rubric_name='Robotics finals rubric', round='final', criteria=criteria))

    teams = [
        ('Team Lumen', 'Prism Design Tokens', 'Design infra'),
        ('Foxtail', 'A11y Audit Kit', 'Accessibility'),
        ('Northstar', 'Motion Spec', 'Motion'),
        ('Bandwidth', 'Grid Studio', 'Tooling'),
        ('Kiln', 'Icon Foundry', 'Brand'),
    ]
    sub_rows = {}
    for i, (team, project, track) in enumerate(teams):
        s = Submission(event_id=dsb.id, team_name=team, project_title=project, track=track,
                       status='Submitted', submitted_at=now - timedelta(days=20) + timedelta(hours=i))
        db.session.add(s)
        sub_rows[team] = s
    db.session.commit()

    score_sets = [
        ('Team Lumen', 'Prof. Arjun Iyer', 'seed-juror-1', [9, 9, 10, 9], 9.2, 'Sharp, production-ready work.'),
        ('Team Lumen', 'Meera Shah', 'seed-juror-2', [9, 10, 9, 9], 9.3, 'Beautiful motion polish.'),
        ('Foxtail', 'Prof. Arjun Iyer', 'seed-juror-1', [8, 9, 7, 8], 8.1, 'Strong accessibility coverage.'),
        ('Foxtail', 'Meera Shah', 'seed-juror-2', [8, 8, 8, 8], 8.0, 'Clear documentation.'),
        ('Northstar', 'Prof. Arjun Iyer', 'seed-juror-1', [7, 8, 9, 8], 7.9, 'Great narrative, thin tests.'),
        ('Northstar', 'Meera Shah', 'seed-juror-2', [8, 8, 8, 9], 8.2, 'Smooth handoff story.'),
        ('Bandwidth', 'Prof. Arjun Iyer', 'seed-juror-1', [7, 7, 7, 8], 7.1, 'Solid tooling direction.'),
        ('Bandwidth', 'Meera Shah', 'seed-juror-2', [7, 7, 8, 7], 7.2, 'Needs more user testing.'),
        ('Kiln', 'Prof. Arjun Iyer', 'seed-juror-1', [6, 7, 7, 7], 6.7, 'Early but promising.'),
        ('Kiln', 'Meera Shah', 'seed-juror-2', [7, 7, 6, 7], 6.8, 'Tighten the icon grid.'),
    ]
    for team, juror, juror_id, values, total, comment in score_sets:
        db.session.add(Score(
            event_id=dsb.id, submission_id=sub_rows[team].id, jury_member_id=juror_id,
            jury_name=juror,
            criteria=[{'id': 'c' + str(i + 1), 'value': v} for i, v in enumerate(values)],
            total=total, max_score=10, comment=comment, status='Submitted',
            submitted_at=now - timedelta(days=5),
        ))
        sub_rows[team].status = 'Scored'

    # ---- hosting requests (Host an Event workflow) ------------------------
    db.session.add_all([
        HostingRequest(
            user_id=users['user'].id, requester_name='Kiran Patel', requester_email='user@baymark.com',
            title='Open Source Maintainers Meetup', category='Community',
            description='A casual evening for maintainers to swap war stories and grow contributor communities.',
            date='Jan 22, 2027', time='18:00 - 21:00', location='Cubbon Pavilion, Bengaluru',
            organizer='Kiran Patel', contact_email='user@baymark.com', seats=60, fee='Free',
            tags=['Open source', 'Community'], status='Pending', submitted_at=now - timedelta(hours=6),
        ),
        HostingRequest(
            user_id=users['devi'].id, requester_name='Devi Raman', requester_email='devi@baymark.com',
            title='Cloud Native Deep Dive', category='Workshop',
            description='Hands-on Kubernetes and observability lab for platform engineers.',
            date='Feb 08, 2027', time='09:30 - 17:00', location='Tech Park, Bengaluru',
            organizer='Devi Raman', contact_email='devi@baymark.com', seats=80, fee='Free',
            tags=['Cloud', 'Platform'], status='Changes requested',
            decision_reason='Please share the lab prerequisites and a rough run-sheet.',
            decided_by='Asha Menon', decided_at=now - timedelta(days=1),
            submitted_at=now - timedelta(days=3),
        ),
        HostingRequest(
            user_id=users['rhea'].id, requester_name='Rhea Nair', requester_email='rhea@baymark.com',
            title='Data Storytelling Night', category='Community',
            description='Short talks on turning dashboards into decisions.',
            date='Mar 02, 2027', time='19:00 - 21:00', location='Rooftop Cafe, Indiranagar',
            organizer='Rhea Nair', contact_email='rhea@baymark.com', seats=40, fee='Free',
            tags=['Data', 'Talks'], status='Approved', decided_by='Asha Menon',
            decided_at=now - timedelta(days=1), submitted_at=now - timedelta(days=4),
        ),
    ])

    # ---- volunteers (event-scoped, invite links) --------------------------
    db.session.add_all([
        Volunteer(event_id=ez.id, event_title=ez.title, name='Sana Kapoor',
                  email='sana@baymark.com', phone='+91 90000 11111', department='Registration desk',
                  responsibility='Check-in scanner & badge printing', shift_date='Nov 14, 2026',
                  shift_time='08:00 - 12:00', status='Confirmed', invite_token='vol-zero-11aa'),
        Volunteer(event_id=ez.id, event_title=ez.title, name='Rahul Verma',
                  email='rahul@baymark.com', department='Logistics',
                  responsibility='Manage refreshments and booth supplies', shift_date='Nov 14, 2026',
                  shift_time='12:00 - 18:00', status='Invited', invite_token='vol-zero-22bb'),
        Volunteer(event_id=rrf.id, event_title=rrf.title, name='Ishita Roy',
                  email='ishita@baymark.com', department='Arena crew',
                  responsibility='Robot safety checks and pit coordination', shift_date='Oct 12, 2026',
                  shift_time='09:00 - 19:00', status='Active', invite_token='vol-rr-33cc'),
    ])

    # ---- feedback ---------------------------------------------------------
    db.session.add_all([
        Feedback(event_id=dsb.id, event_title=dsb.title, user_id=users['user'].id, user_name='Kiran Patel',
                 overall_rating=5, content_rating=5, organization_rating=4, venue_rating=4,
                 what_worked='Hands-on token exercises and the mentor feedback loops.',
                 what_didnt='Afternoon sessions felt rushed.', would_recommend=True, attend_again=True,
                 submitted_at=now - timedelta(days=10)),
        Feedback(event_id=dsb.id, event_title=dsb.title, user_id=users['rhea'].id, user_name='Rhea Nair',
                 overall_rating=4, content_rating=5, organization_rating=4, venue_rating=3,
                 what_worked='Real codebase examples.', what_didnt='Wifi dropped during the live demo.',
                 anonymous=True, submitted_at=now - timedelta(days=9)),
        Feedback(event_id=dsb.id, event_title=dsb.title, user_id=users['tomas'].id, user_name='Tomas Fernandes',
                 overall_rating=5, content_rating=4, organization_rating=5, venue_rating=4,
                 what_worked='Governance playbook was excellent.', what_didnt='More breaks please.',
                 submitted_at=now - timedelta(days=8)),
    ])

    # ---- certificates -----------------------------------------------------
    certs = []
    for key, name in [('user', 'Kiran Patel'), ('rhea', 'Rhea Nair'),
                      ('tomas', 'Tomas Fernandes'), ('alba', 'Alba Cortes')]:
        cert = Certificate(
            recipient_name=name, recipient_id=users[key].id, event_id=dsb.id,
            event_title=dsb.title, issue_date='Sep 21, 2026',
            credential_id=credential_code(), issuer='WayMark Events',
            type='Participation', status='Valid',
        )
        db.session.add(cert)
        certs.append(cert)

    # ---- notifications ----------------------------------------------------
    db.session.add_all([
        Notification(user_id=users['user'].id, title='Results released',
                     message='Results for Design Systems Bootcamp are now live.',
                     type='certificate', created_at=now - timedelta(days=3)),
        Notification(user_id=users['user'].id, title='Certificate ready',
                     message='Your certificate for Design Systems Bootcamp is available.',
                     type='certificate', created_at=now - timedelta(days=3)),
        Notification(user_id=users['user'].id, title='Waitlist offer',
                     message='A seat opened up for Campus Founders Summit. Accept before the offer expires.',
                     type='reminder', created_at=now - timedelta(hours=12)),
        Notification(user_id=users['user'].id, title='Registration confirmed',
                     message='You are confirmed for Zero Day Hackathon. Ticket issued.',
                     type='reminder', read=True, created_at=now - timedelta(days=14)),
        Notification(user_id=users['devi'].id, title='Event submitted for review',
                     message='Biohack Review Jam is awaiting approval.', type='approval',
                     created_at=now - timedelta(hours=20)),
        Notification(user_id=users['admin'].id, title='Event submitted for review',
                     message='Biohack Review Jam is awaiting approval.', type='approval',
                     created_at=now - timedelta(hours=20)),
        Notification(user_id=users['admin'].id, title='New hosting request',
                     message='Kiran Patel requested to host Open Source Maintainers Meetup.',
                     type='approval', created_at=now - timedelta(hours=6)),
    ])

    # ---- jobs & mail outbox -----------------------------------------------
    job1 = Job(event_id=ez.id, event_title=ez.title, type='message',
               label='Registration confirmation', subject='Registration confirmed: Zero Day Hackathon',
               audience='Confirmed only', recipients_count=5, status='Sent',
               created_at=now - timedelta(days=14))
    job2 = Job(event_id=dsb.id, event_title=dsb.title, type='results',
               label='Results released', subject='Results released: Design Systems Bootcamp',
               audience='All registrants', recipients_count=4, status='Sent',
               created_at=now - timedelta(days=3))
    job3 = Job(event_id=aip.id, event_title=aip.title, type='message',
               label='Reminder', subject='Reminder: AI Product Sprint is coming up',
               audience='Confirmed only', recipients_count=1, status='Failed',
               error='SMTP error: connection refused',
               created_at=now - timedelta(days=1))
    db.session.add_all([job1, job2, job3])
    db.session.commit()

    db.session.add_all([
        MailMessage(to_email='user@baymark.com', subject='Your WayMark password reset code',
                    body='Hi Kiran Patel,\n\nYour password reset code is: 000000\n\nIt expires in 15 minutes.\n\n- WayMark',
                    kind='otp', status='Stored',
                    error='Email not configured - message kept in the in-app outbox.',
                    created_at=now - timedelta(hours=30)),
        MailMessage(to_email='user@baymark.com', from_email='WayMark <no-reply@baymark.com>',
                    subject='Registration confirmed: Zero Day Hackathon',
                    body='Hi Kiran Patel,\n\nYou are confirmed for Zero Day Hackathon.\nTicket: see your registrations.',
                    kind='message', status='Stored',
                    error='Email not configured - message kept in the in-app outbox.',
                    job_id=job1.id, created_at=now - timedelta(days=14)),
        MailMessage(to_email='user@baymark.com', from_email='WayMark <no-reply@baymark.com>',
                    subject='Results released: Design Systems Bootcamp',
                    body='Results for Design Systems Bootcamp have been released.',
                    kind='system', status='Stored',
                    error='Email not configured - message kept in the in-app outbox.',
                    job_id=job2.id, created_at=now - timedelta(days=3)),
        MailMessage(to_email='user@baymark.com', from_email='WayMark <no-reply@baymark.com>',
                    subject='Your certificate for Design Systems Bootcamp is ready',
                    body='Your certificate is ready. Credential ID: ' + certs[0].credential_id,
                    kind='certificate', status='Stored',
                    error='Email not configured - message kept in the in-app outbox.',
                    created_at=now - timedelta(days=3)),
        MailMessage(to_email='user@baymark.com', from_email='WayMark <no-reply@baymark.com>',
                    subject='A seat opened up for Campus Founders Summit',
                    body='A spot just opened for Campus Founders Summit. Accept your waitlist offer before it expires.',
                    kind='reminder', status='Stored',
                    error='Email not configured - message kept in the in-app outbox.',
                    created_at=now - timedelta(hours=12)),
    ])

    # ---- audit log ---------------------------------------------------------
    audit_specs = [
        ('Event approved', 'Asha Menon', ez.title, 'Success', 30),
        ('Event submitted', 'Devi Raman', brj.title, 'Success', 20),
        ('Changes requested', 'Asha Menon', ggc.title, 'Warning', 48),
        ('Score submitted', 'Prof. Arjun Iyer', 'Team Lumen (9.2)', 'Success', 120),
        ('Results released', 'Devi Raman', dsb.title, 'Success', 72),
        ('Certificates generated', 'Devi Raman', dsb.title + ' (4)', 'Success', 71),
        ('Checked in', 'Devi Raman', 'Noor Hassan @ Zero Day Hackathon', 'Success', 2),
        ('Job retry failed', 'Asha Menon', 'Reminder - AI Product Sprint', 'Failed', 5),
        ('Waitlist offer accepted', 'Kiran Patel', 'Campus Founders Summit', 'Success', 12),
        ('Hosting request submitted', 'Kiran Patel', 'Open Source Maintainers Meetup', 'Success', 6),
    ]
    for action, user, target, status, hours in audit_specs:
        db.session.add(AuditLog(action=action, user=user, target=target, status=status,
                                ip='10.4.0.' + str(10 + hours % 40),
                                timestamp=now - timedelta(hours=hours)))

    # ---- AI logs ------------------------------------------------------------
    db.session.add_all([
        AiLog(feature='draft-event', user='Devi Raman', model='waymark-local',
              prompt='A weekend AI product sprint with mentors',
              response='{"title": "AI Product Sprint", "category": "Workshop"}',
              tokens=64, status='Success', created_at=now - timedelta(days=6)),
        AiLog(feature='draft-message', user='Devi Raman', model='waymark-local',
              prompt='Reminder for Zero Day Hackathon',
              response='{"subject": "Reminder: Zero Day Hackathon is coming up"}',
              tokens=42, status='Success', created_at=now - timedelta(days=4)),
        AiLog(feature='summarise-feedback', user='Devi Raman', model='waymark-local',
              prompt='Design Systems Bootcamp',
              response='{"summary": "3 responses. Overall 4.7/5..."}',
              tokens=88, status='Success', created_at=now - timedelta(days=2)),
    ])

    # ---- platform settings --------------------------------------------------
    db.session.add(PlatformSetting(id=1, data={
        'platformName': 'WayMark',
        'supportEmail': 'support@baymark.com',
        'timezone': 'Asia/Kolkata (GMT+5:30)',
        'defaultRubricName': 'Standard judging rubric',
        'certificateIssuer': 'WayMark Events',
        'maintenanceMode': False,
        'allowSelfSignup': True,
        'autoApproveEvents': False,
        'emailNotifications': True,
        'smsReminders': False,
    }))

    db.session.commit()
    return True
