"""Initial demo data. Runs only when the users table is empty."""
from datetime import datetime, timedelta

from extensions import db
from models import (AiLog, AttendanceLog, AuditLog, Certificate, CheckInException, Event,
                    EventType, Feedback, Job, JuryAssignment, MailMessage, Notification,
                    PlatformSetting, Registration, Rubric, Score, Submission, User)
from utils.helpers import credential_code, refresh_event_counts, ticket_code
from utils.security import hash_password

DEMO_PASSWORD = 'waymark123'


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

    # ---- users ------------------------------------------------------------
    pw = hash_password(DEMO_PASSWORD)
    users = {}
    specs = [
        ('admin@waymark.dev', 'Asha Menon', 'admin', 'Active', 'Platform operations'),
        ('host@waymark.dev', 'Devi Raman', 'host', 'Active', 'Community programs lead'),
        ('jury@waymark.dev', 'Prof. Arjun Iyer', 'jury', 'Active', 'Systems & AI'),
        ('meera.jury@waymark.dev', 'Meera Shah', 'jury', 'Active', 'Product design'),
        ('member@waymark.dev', 'Kiran Patel', 'participant', 'Active', 'Frontend engineer'),
        ('rhea@waymark.dev', 'Rhea Nair', 'participant', 'Active', 'Data analyst'),
        ('tomas@waymark.dev', 'Tomas Fernandes', 'participant', 'Active', 'Backend engineer'),
        ('alba@waymark.dev', 'Alba Cortes', 'participant', 'Active', 'Designer'),
        ('jin@waymark.dev', 'Jin Zhou', 'participant', 'Invited', 'ML engineer'),
        ('noor@waymark.dev', 'Noor Hassan', 'participant', 'Active', 'Robotics engineer'),
    ]
    for email, name, role, status, org in specs:
        u = User(name=name, email=email, role=role, status=status,
                 password_hash=pw, org=org, location='Bengaluru, India',
                 bio='Part of the WayMark community.', email_updates=True)
        if role == 'host':
            u.events_count = 7
        users[email.split('@')[0]] = u
        db.session.add(u)
    db.session.commit()

    # ---- events -----------------------------------------------------------
    def make_event(**kw):
        e = Event(**kw)
        db.session.add(e)
        return e

    ez = make_event(
        host_id=users['host'].id, host_name='Devi Raman', title='Zero Day Hackathon',
        category='Hackathon', description='A 24-hour build sprint for teams shipping bold ideas in AI, climate and open source.',
        date='Nov 14, 2026', time='09:00 - 21:00', location='Innovation Hub, Bengaluru',
        seats=200, status='Registration open', approval_status='Approved', tone='blue', color='#2B4BD8',
        initials='ZH', organizer='WayMark Labs', capacity_num=200, reg_deadline='Nov 10, 2026',
        contact_email='host@waymark.dev', website='https://waymark.dev/zero-day',
        tags=['AI', 'Climate', 'Open source'],
        agenda=[{'time': '09:00', 'title': 'Check-in & team formation'},
                {'time': '10:00', 'title': 'Build sprint begins'},
                {'time': '18:00', 'title': 'Demo jam'},
                {'time': '20:00', 'title': 'Judging & awards'}],
        requirements=['Team of 2-4', 'Laptop + charger', 'Valid student/work ID'],
    )
    aip = make_event(
        host_id=users['host'].id, host_name='Devi Raman', title='AI Product Sprint',
        category='Workshop', description='Ship an AI-assisted product slice in a weekend with mentor reviews.',
        date='Oct 24, 2026', time='10:00 - 18:00', location='T-Works Studio, Hyderabad',
        seats=60, status='Registration open', approval_status='Approved', tone='teal', color='#0E9384',
        initials='AP', organizer='WayMark Labs', capacity_num=60, reg_deadline='Oct 20, 2026',
        contact_email='host@waymark.dev', tags=['AI', 'Product'],
        agenda=[{'time': '10:00', 'title': 'Kickoff & API tour'}, {'time': '14:00', 'title': 'Build & mentor reviews'}],
        requirements=['Basic JavaScript', 'Laptop'],
    )
    cfs = make_event(
        host_id=users['host'].id, host_name='Devi Raman', title='Campus Founders Summit',
        category='Conference', description='Talks and panels for student founders, operators and investors.',
        date='Dec 05, 2026', time='09:30 - 17:30', location='Grand Hall, IIM Bangalore',
        seats=300, status='Registration open', approval_status='Approved', tone='purple', color='#6941C6',
        initials='CF', organizer='WayMark Labs', capacity_num=300, reg_deadline='Dec 01, 2026',
        contact_email='host@waymark.dev', tags=['Founders', 'Startups'],
        agenda=[{'time': '09:30', 'title': 'Opening keynote'}, {'time': '11:00', 'title': 'Founder panels'}],
        requirements=['Student or founder ID'],
    )
    rrf = make_event(
        host_id=users['host'].id, host_name='Devi Raman', title='Robotics Rumble Finals',
        category='Competition', description='The national finals for autonomous robot teams. Two arenas, one champion.',
        date='Oct 12, 2026', time='10:00 - 19:00', location='Robotics Arena, Pune',
        seats=40, status='Ongoing', approval_status='Approved', tone='orange', color='#E4780C',
        initials='RR', organizer='WayMark Labs', capacity_num=40, reg_deadline='Oct 01, 2026',
        contact_email='host@waymark.dev', tags=['Robotics', 'Autonomy'],
        agenda=[{'time': '10:00', 'title': 'Qualifiers'}, {'time': '16:00', 'title': 'Grand final'}],
        requirements=['Registered team', 'Safety gear'],
    )
    dsb = make_event(
        host_id=users['host'].id, host_name='Devi Raman', title='Design Systems Bootcamp',
        category='Workshop', description='Two days of hands-on design systems practice: tokens, docs and governance.',
        date='Sep 20, 2026', time='09:00 - 17:00', location='Design Loft, Mumbai',
        seats=40, status='Completed', approval_status='Approved', tone='teal', color='#0E9384',
        initials='DS', organizer='WayMark Labs', capacity_num=40, reg_deadline='Sep 15, 2026',
        contact_email='host@waymark.dev', tags=['Design', 'Systems'],
        agenda=[{'time': '09:00', 'title': 'Tokens & theming'}, {'time': '13:30', 'title': 'Docs & governance'}],
        requirements=['Figma account', 'Laptop'],
        results_released=True, released_at=now - timedelta(days=3),
    )
    epc = make_event(
        host_id=users['host'].id, host_name='Devi Raman', title='Evening Pitch Circle',
        category='Community', description='A relaxed pitch night: five minutes to pitch, five minutes of feedback.',
        date='Nov 02, 2026', time='18:30 - 21:00', location='Rooftop Cafe, Indiranagar',
        seats=30, status='Draft', approval_status='Draft', tone='green', color='#067647',
        initials='EP', organizer='WayMark Labs', capacity_num=30, tags=['Pitching', 'Community'],
    )
    brj = make_event(
        host_id=users['host'].id, host_name='Devi Raman', title='Biohack Review Jam',
        category='Hackathon', description='A review-focused jam where teams harden bio-tech prototypes with mentors.',
        date='Dec 18, 2026', time='09:00 - 20:00', location='Labs, IISc Bengaluru',
        seats=80, status='Pending', approval_status='Pending', tone='blue', color='#2B4BD8',
        initials='BR', organizer='WayMark Labs', capacity_num=80, reg_deadline='Dec 14, 2026',
        contact_email='host@waymark.dev', tags=['Bio-tech', 'Mentorship'],
        submitted_at=now - timedelta(hours=20),
    )
    ggc = make_event(
        host_id=users['host'].id, host_name='Devi Raman', title='Green Grid Challenge',
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
    regs['member_ez'] = make_reg(users['member'], ez)
    regs['member_aip'] = make_reg(users['member'], aip)
    regs['member_rrf'] = make_reg(users['member'], rrf, status='Waitlisted', pos=3)
    regs['member_dsb'] = make_reg(users['member'], dsb, attendance='Checked in')
    regs['member_epc'] = make_reg(users['member'], epc)
    regs['member_cfs'] = make_reg(users['member'], cfs, status='Offered', pos=1)
    regs['member_cfs'].offer_expires_at = now + timedelta(hours=36)
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

    log_attendance(regs['member_dsb'], hours_ago=200)
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

    # ---- jury, rubric, submissions, scores --------------------------------
    db.session.add_all([
        JuryAssignment(event_id=dsb.id, event_title=dsb.title, jury_member_id=users['jury'].id,
                       jury_name='Prof. Arjun Iyer', jury_email='jury@waymark.dev',
                       expertise='Systems & AI', assigned_tracks=['Design infra', 'Tooling'],
                       status='Completed', guest_token='jury-design-9f2a'),
        JuryAssignment(event_id=dsb.id, event_title=dsb.title, jury_member_id=users['meera.jury'].id,
                       jury_name='Meera Shah', jury_email='meera.jury@waymark.dev',
                       expertise='Product design', assigned_tracks=['Motion', 'Brand'],
                       status='Completed', guest_token='jury-design-4b7c'),
        JuryAssignment(event_id=dsb.id, event_title=dsb.title, jury_member_id='',
                       jury_name='Demo Judge', jury_email='demo.judge@waymark.dev',
                       expertise='Guest reviewer', assigned_tracks=[],
                       status='Active', guest_token='demo-jury'),
        JuryAssignment(event_id=rrf.id, event_title=rrf.title, jury_member_id=users['jury'].id,
                       jury_name='Prof. Arjun Iyer', jury_email='jury@waymark.dev',
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
        ('Team Lumen', 'Prof. Arjun Iyer', users['jury'].id, [9, 9, 10, 9], 9.2, 'Sharp, production-ready work.'),
        ('Team Lumen', 'Meera Shah', users['meera.jury'].id, [9, 10, 9, 9], 9.3, 'Beautiful motion polish.'),
        ('Foxtail', 'Prof. Arjun Iyer', users['jury'].id, [8, 9, 7, 8], 8.1, 'Strong accessibility coverage.'),
        ('Foxtail', 'Meera Shah', users['meera.jury'].id, [8, 8, 8, 8], 8.0, 'Clear documentation.'),
        ('Northstar', 'Prof. Arjun Iyer', users['jury'].id, [7, 8, 9, 8], 7.9, 'Great narrative, thin tests.'),
        ('Northstar', 'Meera Shah', users['meera.jury'].id, [8, 8, 8, 9], 8.2, 'Smooth handoff story.'),
        ('Bandwidth', 'Prof. Arjun Iyer', users['jury'].id, [7, 7, 7, 8], 7.1, 'Solid tooling direction.'),
        ('Bandwidth', 'Meera Shah', users['meera.jury'].id, [7, 7, 8, 7], 7.2, 'Needs more user testing.'),
        ('Kiln', 'Prof. Arjun Iyer', users['jury'].id, [6, 7, 7, 7], 6.7, 'Early but promising.'),
        ('Kiln', 'Meera Shah', users['meera.jury'].id, [7, 7, 6, 7], 6.8, 'Tighten the icon grid.'),
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

    # ---- feedback ---------------------------------------------------------
    db.session.add_all([
        Feedback(event_id=dsb.id, event_title=dsb.title, user_id=users['member'].id, user_name='Kiran Patel',
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
    for email, name in [('member', 'Kiran Patel'), ('rhea', 'Rhea Nair'),
                        ('tomas', 'Tomas Fernandes'), ('alba', 'Alba Cortes')]:
        cert = Certificate(
            recipient_name=name, recipient_id=users[email].id, event_id=dsb.id,
            event_title=dsb.title, issue_date='Sep 21, 2026',
            credential_id=credential_code(), issuer='WayMark Events',
            type='Participation', status='Valid',
        )
        db.session.add(cert)
        certs.append(cert)

    # ---- notifications ----------------------------------------------------
    db.session.add_all([
        Notification(user_id=users['member'].id, title='Results released',
                     message='Results for Design Systems Bootcamp are now live.',
                     type='certificate', created_at=now - timedelta(days=3)),
        Notification(user_id=users['member'].id, title='Certificate ready',
                     message='Your certificate for Design Systems Bootcamp is available.',
                     type='certificate', created_at=now - timedelta(days=3)),
        Notification(user_id=users['member'].id, title='Waitlist offer',
                     message='A seat opened up for Campus Founders Summit. Accept before the offer expires.',
                     type='reminder', created_at=now - timedelta(hours=12)),
        Notification(user_id=users['member'].id, title='Registration confirmed',
                     message='You are confirmed for Zero Day Hackathon. Ticket issued.',
                     type='reminder', read=True, created_at=now - timedelta(days=14)),
        Notification(user_id=users['host'].id, title='Event submitted for review',
                     message='Biohack Review Jam is awaiting approval.', type='approval',
                     created_at=now - timedelta(hours=20)),
        Notification(user_id=users['admin'].id, title='Event submitted for review',
                     message='Biohack Review Jam is awaiting approval.', type='approval',
                     created_at=now - timedelta(hours=20)),
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
        MailMessage(to_email='member@waymark.dev', subject='Your WayMark password reset code',
                    body='Hi Kiran Patel,\n\nYour password reset code is: 000000\n\nIt expires in 15 minutes.\n\n- WayMark',
                    kind='otp', status='Stored',
                    error='Email not configured - message kept in the in-app outbox.',
                    created_at=now - timedelta(hours=30)),
        MailMessage(to_email='member@waymark.dev', from_email='WayMark <no-reply@waymark.dev>',
                    subject='Registration confirmed: Zero Day Hackathon',
                    body='Hi Kiran Patel,\n\nYou are confirmed for Zero Day Hackathon.\nTicket: see your registrations.',
                    kind='message', status='Stored',
                    error='Email not configured - message kept in the in-app outbox.',
                    job_id=job1.id, created_at=now - timedelta(days=14)),
        MailMessage(to_email='member@waymark.dev', from_email='WayMark <no-reply@waymark.dev>',
                    subject='Results released: Design Systems Bootcamp',
                    body='Results for Design Systems Bootcamp have been released.',
                    kind='system', status='Stored',
                    error='Email not configured - message kept in the in-app outbox.',
                    job_id=job2.id, created_at=now - timedelta(days=3)),
        MailMessage(to_email='member@waymark.dev', from_email='WayMark <no-reply@waymark.dev>',
                    subject='Your certificate for Design Systems Bootcamp is ready',
                    body='Your certificate is ready. Credential ID: ' + certs[0].credential_id,
                    kind='certificate', status='Stored',
                    error='Email not configured - message kept in the in-app outbox.',
                    created_at=now - timedelta(days=3)),
        MailMessage(to_email='member@waymark.dev', from_email='WayMark <no-reply@waymark.dev>',
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
        'supportEmail': 'support@waymark.dev',
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