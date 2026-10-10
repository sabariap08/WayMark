import { useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  FileCheck2,
  Filter,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyView, EventRow, SectionHeading, StatCard } from '@/components/ui';
import {
  events,
  sampleAuditLogs,
  sampleLeaderboard,
  sampleNotifications,
  sampleRegistrations,
  sampleUsers,
} from '@/data/events';
import type { AuditLogEntry, BadgeTone, EventItem, NotificationItem, RegistrationRecord, UserItem } from '@/types';

// =================== Overview Page ===================

export function OverviewPage() {
  const navigate = useNavigate();
  return (
    <div className="page-stack">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">Tuesday, October 6, 2026</div>
          <h1>Good morning, Maya.</h1>
          <p className="lede">Keep your event journey moving forward.</p>
        </div>
        <Button icon={<Plus size={17} />} onClick={() => navigate('/forms/host-event')}>
          Create event
        </Button>
      </div>
      <div className="stat-grid">
        <StatCard label="Upcoming registrations" value="3" detail="Next one in 12 days" icon={CalendarDays} accent="blue" />
        <StatCard label="Certificates available" value="2" detail="Ready to download" icon={FileCheck2} accent="teal" />
        <StatCard label="Events you host" value="4" detail="1 needs your attention" icon={ClipboardList} accent="amber" />
        <StatCard label="Unread notifications" value="3" detail="Across 2 events" icon={Bell} accent="rose" />
      </div>
      <div className="content-grid">
        <section className="panel panel-wide">
          <SectionHeading
            eyebrow="Your calendar"
            title="Upcoming registrations"
            action={
              <Button variant="ghost" onClick={() => navigate('/registrations')}>
                View all <ChevronRight size={16} />
              </Button>
            }
          />
          <div className="event-list">
            {events.slice(0, 3).map((event) => (
              <EventRow key={event.title} event={event} onOpen={() => navigate('/registrations')} />
            ))}
          </div>
        </section>
        <section className="panel notification-panel">
          <SectionHeading
            eyebrow="Stay in the loop"
            title="Recent activity"
            action={
              <button className="icon-button" onClick={() => navigate('/notifications')}>
                <Activity size={19} />
              </button>
            }
          />
          <div className="activity-list">
            <ActivityItem icon={<Check size={16} />} tone="green" title="Registration confirmed" detail="Zero Origin Hackathon" time="2h ago" />
            <ActivityItem icon={<FileCheck2 size={16} />} tone="blue" title="Certificate ready" detail="Impact Lab · 2026" time="Yesterday" />
            <ActivityItem icon={<Clock3 size={16} />} tone="amber" title="Event starts soon" detail="Designing for Civic Impact" time="2d ago" />
            <ActivityItem icon={<Sparkles size={16} />} tone="slate" title="Profile updated" detail="Your changes were saved" time="4d ago" />
          </div>
          <Button variant="secondary" className="full-button" onClick={() => navigate('/notifications')}>
            Open notification inbox
          </Button>
        </section>
      </div>
      <section className="discover-banner">
        <div className="banner-mark">
          <Sparkles size={23} />
        </div>
        <div>
          <strong>Find your next meaningful room.</strong>
          <span>Discover workshops, competitions, and communities built around shared momentum.</span>
        </div>
        <Button variant="secondary" onClick={() => navigate('/discover')}>
          Explore events <ChevronRight size={16} />
        </Button>
      </section>
    </div>
  );
}

function ActivityItem({ icon, tone, title, detail, time }: { icon: React.ReactNode; tone: string; title: string; detail: string; time: string }) {
  return (
    <div className="activity-item">
      <span className={`activity-icon activity-${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <time>{time}</time>
    </div>
  );
}

// =================== Discover Page & Event Details Modal ===================

export function DiscoverPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  const filtered = useMemo(
    () =>
      events.filter(
        (event) =>
          `${event.title} ${event.category} ${event.location}`.toLowerCase().includes(query.toLowerCase()) &&
          (category === 'All categories' || event.category === category)
      ),
    [query, category]
  );

  return (
    <div className="page-stack">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">Open doors</div>
          <h1>Discover events</h1>
          <p className="lede">Find the spaces, people, and ideas worth showing up for.</p>
        </div>
        <Button icon={<Plus size={17} />} onClick={() => navigate('/forms/host-event')}>
          Create event
        </Button>
      </div>
      <div className="search-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, topics, or keywords" />
        </label>
        <label className="select-field">
          <Filter size={17} />
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>All categories</option>
            <option>Hackathon</option>
            <option>Workshop</option>
            <option>Conference</option>
            <option>Community</option>
          </select>
          <ChevronDown size={16} />
        </label>
        <Button variant="secondary">Date range <ChevronDown size={15} /></Button>
      </div>
      <div className="result-meta">
        <span>{filtered.length} events available</span>
        <button>Sort by <strong>Recently added</strong> <ChevronDown size={14} /></button>
      </div>
      {filtered.length ? (
        <div className="event-grid">
          {filtered.map((event) => (
            <article className="event-card" key={event.title} onClick={() => setSelectedEvent(event)}>
              <div className={`card-art ${event.color}`}>
                <span>{event.initials}</span>
                <Badge tone={event.tone}>{event.status}</Badge>
              </div>
              <div className="event-card-body">
                <div className="eyebrow">{event.category}</div>
                <h3>{event.title}</h3>
                <p>
                  <CalendarDays size={15} />
                  {event.date} · {event.time}
                </p>
                <p>
                  <Users size={15} />
                  {event.location}
                </p>
                <div className="card-footer">
                  <span>{event.seats}</span>
                  <span className="text-link">
                    View details <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyView
          title="No events found"
          description="Try a different keyword or reset your filters."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setCategory('All categories');
              }}
            >
              Reset filters
            </Button>
          }
        />
      )}

      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onRegister={() => navigate('/forms/event-registration')} />
      )}
    </div>
  );
}

function EventDetailModal({ event, onClose, onRegister }: { event: EventItem; onClose: () => void; onRegister: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card modal-card-wide" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={19} />
        </button>
        <div className={`event-detail-banner ${event.color}`}>
          <span className="banner-initials">{event.initials}</span>
          <Badge tone={event.tone}>{event.status}</Badge>
        </div>
        <div className="eyebrow">{event.category}</div>
        <h2>{event.title}</h2>
        <p className="lede">{event.description}</p>
        <div className="event-detail-grid">
          <div>
            <span className="eyebrow">Date & Time</span>
            <strong>{event.date}</strong>
            <small>{event.time}</small>
          </div>
          <div>
            <span className="eyebrow">Location</span>
            <strong>{event.location}</strong>
          </div>
          <div>
            <span className="eyebrow">Host</span>
            <strong>{event.organizer || 'WayMark Platform'}</strong>
          </div>
          <div>
            <span className="eyebrow">Availability</span>
            <strong>{event.seats}</strong>
          </div>
        </div>
        {event.agenda && (
          <div className="event-agenda-section">
            <span className="eyebrow">Event Schedule</span>
            <ul className="agenda-list">
              {event.agenda.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onRegister} icon={<ArrowRightIcon size={16} />}>
            Register for event
          </Button>
        </div>
      </section>
    </div>
  );
}

function ArrowRightIcon({ size }: { size: number }) {
  return <ChevronRight size={size} />;
}

// =================== Registrations Page & Ticket Modal ===================

export function RegistrationsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'upcoming' | 'completed'>('all');
  const [selectedTicket, setSelectedTicket] = useState<RegistrationRecord | null>(null);

  const filteredRegistrations = useMemo(() => {
    if (activeTab === 'upcoming') return sampleRegistrations.filter((r) => r.status === 'Confirmed');
    if (activeTab === 'completed') return sampleRegistrations.filter((r) => r.status === 'Completed');
    return sampleRegistrations;
  }, [activeTab]);

  const handleDownloadList = () => {
    const csvContent = 'Event Title,Category,Date,Time,Location,Status,Ticket Code\n' +
      sampleRegistrations.map(r => `"${r.eventTitle}","${r.category}","${r.date}","${r.time}","${r.location}","${r.status}","${r.ticketCode}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'waymark-registrations.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="Your journey"
        title="My registrations"
        action={
          <Button variant="secondary" icon={<Download size={15} />} onClick={handleDownloadList}>
            Download list
          </Button>
        }
      />
      <div className="filter-tabs">
        <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>
          All <span>{sampleRegistrations.length}</span>
        </button>
        <button className={activeTab === 'upcoming' ? 'active' : ''} onClick={() => setActiveTab('upcoming')}>
          Upcoming <span>{sampleRegistrations.filter((r) => r.status === 'Confirmed').length}</span>
        </button>
        <button className={activeTab === 'completed' ? 'active' : ''} onClick={() => setActiveTab('completed')}>
          Completed <span>{sampleRegistrations.filter((r) => r.status === 'Completed').length}</span>
        </button>
      </div>

      <section className="panel table-panel">
        <TableHead labels={['Event', 'Date', 'Registration', 'Attendance', 'Ticket']} />
        {filteredRegistrations.map((reg) => (
          <div className="table-row" key={reg.id}>
            <TableEvent event={{ title: reg.eventTitle, category: reg.category, initials: reg.eventTitle.split(' ').map((w) => w[0]).join('').slice(0, 2), color: 'bg-cyan-700' }} />
            <span>{reg.date}</span>
            <Badge tone={reg.status === 'Completed' ? 'slate' : 'green'}>{reg.status}</Badge>
            <span>{reg.attendanceStatus}</span>
            <button className="row-action" onClick={() => setSelectedTicket(reg)}>
              View Ticket <ChevronRight size={15} />
            </button>
          </div>
        ))}
      </section>

      {/* Leaderboard Results Section */}
      <FormLeaderboardSection />

      {selectedTicket && <TicketModal registration={selectedTicket} onClose={() => setSelectedTicket(null)} />}
    </div>
  );
}

function TicketModal({ registration, onClose }: { registration: RegistrationRecord; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={19} />
        </button>
        <div className="ticket-modal-head">
          <div className="modal-icon">
            <QrCode size={24} />
          </div>
          <span className="eyebrow">Official Event Pass</span>
          <h2>{registration.eventTitle}</h2>
          <Badge tone={registration.status === 'Completed' ? 'slate' : 'green'}>{registration.status}</Badge>
        </div>
        <div className="ticket-card-body">
          <div className="ticket-qr-wrap">
            <QrCode size={120} strokeWidth={1.5} />
            <code className="ticket-code">{registration.ticketCode}</code>
          </div>
          <div className="ticket-meta-grid">
            <div>
              <span>Date</span>
              <strong>{registration.date}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>{registration.time}</strong>
            </div>
            <div>
              <span>Venue</span>
              <strong>{registration.location}</strong>
            </div>
            <div>
              <span>Attendance</span>
              <strong>{registration.attendanceStatus}</strong>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button icon={<Download size={15} />} onClick={() => alert(`Downloaded ticket pass ${registration.ticketCode}`)}>
            Download Ticket Pass
          </Button>
        </div>
      </section>
    </div>
  );
}

function FormLeaderboardSection() {
  return (
    <section className="panel leaderboard-panel">
      <SectionHeading eyebrow="Rankings & Results" title="Event Winners & Leaderboard" />
      <div className="leaderboard-list">
        {sampleLeaderboard.map((item) => (
          <div className="leaderboard-row" key={item.rank}>
            <div className={`rank-badge rank-${item.rank}`}>{item.rank}</div>
            <div className="leaderboard-main">
              <strong>{item.teamName} — {item.projectTitle}</strong>
              <small>Track: {item.track}</small>
            </div>
            <div className="leaderboard-score">
              <strong>{item.score} / {item.maxScore} pts</strong>
            </div>
            <Badge tone={item.tone}>{item.award}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}

// =================== Events Page (Host Workspace) ===================

export function EventsPage() {
  const navigate = useNavigate();
  const [selectedHostEvent, setSelectedHostEvent] = useState<string | null>(null);

  const handleExportEvents = () => {
    const csvContent = 'Title,Category,Created Date,Status,Registrations\n' +
      'Community Research Sprint,Workshop,Sep 28 2026,Changes requested,0\n' +
      'Zero Origin Hackathon,Hackathon,Sep 20 2026,Published,86\n' +
      'Climate Voices Forum,Conference,Aug 14 2026,Approved,124\n';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-hosted-events.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="Host workspace"
        title="My events"
        action={
          <div className="heading-actions">
            <Button variant="secondary" icon={<Download size={15} />} onClick={handleExportEvents}>Export</Button>
            <Button icon={<Plus size={17} />} onClick={() => navigate('/forms/host-event')}>Create event</Button>
          </div>
        }
      />
      <div className="stat-grid compact">
        <StatCard label="All events" value="4" detail="Across 3 categories" icon={ClipboardList} accent="blue" />
        <StatCard label="Published" value="2" detail="Currently discoverable" icon={Zap} accent="teal" />
        <StatCard label="Needs attention" value="1" detail="Changes requested" icon={Clock3} accent="amber" />
      </div>
      <section className="panel table-panel">
        <TableHead labels={['Event', 'Created', 'Status', 'Registrations', '']} />
        {['Community Research Sprint', 'Zero Origin Hackathon', 'Climate Voices Forum'].map((title, index) => (
          <div className="table-row" key={title}>
            <TableEvent event={{ ...events[index], title, category: ['Workshop', 'Hackathon', 'Conference'][index] }} />
            <span>{['Sep 28, 2026', 'Sep 20, 2026', 'Aug 14, 2026'][index]}</span>
            <Badge tone={['amber', 'green', 'blue'][index] as BadgeTone}>
              {['Changes requested', 'Published', 'Approved'][index]}
            </Badge>
            <span>{[0, 86, 124][index]}</span>
            <button className="row-action" onClick={() => setSelectedHostEvent(title)}>
              Manage <ChevronRight size={15} />
            </button>
          </div>
        ))}
      </section>

      {selectedHostEvent && (
        <HostEventManageModal eventTitle={selectedHostEvent} onClose={() => setSelectedHostEvent(null)} navigate={navigate} />
      )}
    </div>
  );
}

function HostEventManageModal({ eventTitle, onClose, navigate }: { eventTitle: string; onClose: () => void; navigate: (path: string) => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={19} />
        </button>
        <span className="eyebrow">Host Event Manager</span>
        <h2>{eventTitle}</h2>
        <p>Quick operations for managing event lifecycle, registrations, evaluation, and feedback.</p>
        <div className="quick-action-list">
          <button className="quick-action-item" onClick={() => { onClose(); navigate('/forms/host-event'); }}>
            <div><strong>Edit event draft</strong><small>Modify title, dates, or location</small></div>
            <ChevronRight size={16} />
          </button>
          <button className="quick-action-item" onClick={() => { onClose(); navigate('/forms/attendance'); }}>
            <div><strong>Attendance & Check-in</strong><small>Scan participant QR codes or roster</small></div>
            <ChevronRight size={16} />
          </button>
          <button className="quick-action-item" onClick={() => { onClose(); navigate('/forms/rubric'); }}>
            <div><strong>Scoring Rubric Builder</strong><small>Configure criteria weights and scores</small></div>
            <ChevronRight size={16} />
          </button>
          <button className="quick-action-item" onClick={() => { onClose(); navigate('/forms/certificates'); }}>
            <div><strong>Issue Certificates</strong><small>Generate credentials for participants</small></div>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </section>
    </div>
  );
}

function TableHead({ labels }: { labels: string[] }) {
  return (
    <div className="table-head">
      {labels.map((label, index) => (
        <span key={`${label}-${index}`}>{label}</span>
      ))}
    </div>
  );
}

function TableEvent({ event }: { event: { title: string; category: string; initials: string; color: string } }) {
  return (
    <div className="table-event">
      <div className={`mini-thumb ${event.color}`}>{event.initials}</div>
      <div>
        <strong>{event.title}</strong>
        <small>{event.category}</small>
      </div>
    </div>
  );
}

// =================== Approvals Page (Admin Workspace) ===================

export function ApprovalsPage() {
  const navigate = useNavigate();
  const rows = ['Campus Sustainability Summit', 'Intro to Ethical AI', 'Open Source Office Hours', 'Student Founder Showcase'];

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="Admin workspace"
        title="Approval queue"
        action={
          <Button variant="secondary" onClick={() => navigate('/forms/approval')}>
            Review form <ChevronRight size={15} />
          </Button>
        }
      />
      <div className="queue-callout">
        <div className="callout-icon">
          <ShieldCheck size={20} />
        </div>
        <div>
          <strong>8 events need your review</strong>
          <span>Review content, eligibility, and certificate settings before publishing.</span>
        </div>
        <Button variant="secondary" onClick={() => navigate('/forms/approval')}>
          View guidelines
        </Button>
      </div>
      <div className="search-toolbar compact-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input placeholder="Search by title, host, or event type" />
        </label>
        <Button variant="secondary">
          All statuses <ChevronDown size={15} />
        </Button>
      </div>
      <section className="panel table-panel">
        <TableHead labels={['Event', 'Host', 'Submitted', 'Status', '']} />
        {rows.map((title, index) => (
          <div className="table-row" key={title}>
            <TableEvent event={{ ...events[index], title, category: ['Conference', 'Workshop', 'Community', 'Competition'][index] }} />
            <span>{['Jordan Lee', 'Samira Okafor', 'Theo Martin', 'Ari Kim'][index]}</span>
            <span>{index + 1}h ago</span>
            <Badge tone={index === 3 ? 'red' : 'amber'}>{index === 3 ? 'Rejected' : 'Pending review'}</Badge>
            <button className="row-action" onClick={() => navigate('/forms/approval')}>
              Review <ChevronRight size={15} />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

// =================== SimplePage (Notifications, Profile, Users, Audit) ===================

export function SimplePage({ view }: { view: 'notifications' | 'profile' | 'users' | 'audit' }) {
  const navigate = useNavigate();

  if (view === 'notifications') {
    return <NotificationsView />;
  }
  if (view === 'users') {
    return <UserManagementView />;
  }
  if (view === 'audit') {
    return <AuditLogView />;
  }

  const content = {
    notifications: ['Your inbox', 'Notifications', 'Confirmation, reminders, invitations, and lifecycle updates will appear here.'],
    profile: ['Your account', 'Profile', 'Keep your reusable identity details ready for every registration.'],
    users: ['Admin workspace', 'Users', 'Search users and review platform administration activity.'],
    audit: ['Admin workspace', 'Activity & audit', 'A clear history of approvals, changes, exports, and other administrative actions.'],
  }[view];

  return (
    <div className="page-stack">
      <SectionHeading eyebrow={content[0]} title={content[1]} />
      <EmptyView title="This space is ready for your data" description={content[2]} action={<Button variant="secondary" onClick={() => navigate('/forms/profile')}>Configure view</Button>} />
    </div>
  );
}

function NotificationsView() {
  const [notifs, setNotifs] = useState<NotificationItem[]>(sampleNotifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = notifs.filter((n) => filter === 'all' || !n.read);

  const markAllRead = () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="Your inbox"
        title="Notifications & Activity"
        action={
          <Button variant="secondary" onClick={markAllRead}>
            Mark all read
          </Button>
        }
      />
      <div className="filter-tabs">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          All <span>{notifs.length}</span>
        </button>
        <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>
          Unread <span>{notifs.filter((n) => !n.read).length}</span>
        </button>
      </div>
      <section className="panel notification-panel">
        <div className="activity-list">
          {filtered.map((item) => (
            <div className={`activity-item ${item.read ? '' : 'unread-item'}`} key={item.id}>
              <span className={`activity-icon activity-${item.type === 'certificate' ? 'blue' : item.type === 'approval' ? 'green' : 'amber'}`}>
                {item.type === 'certificate' ? <FileCheck2 size={16} /> : item.type === 'approval' ? <Check size={16} /> : <Bell size={16} />}
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.message}</span>
              </div>
              <time>{item.time}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function UserManagementView() {
  const [userList] = useState<UserItem[]>(sampleUsers);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');

  const filtered = userList.filter(
    (u) =>
      `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()) &&
      (roleFilter === 'All roles' || u.role === roleFilter)
  );

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="Admin workspace"
        title="User & Access Management"
        action={
          <Button icon={<UserPlus size={16} />} onClick={() => alert('Add user modal ready.')}>
            Add user
          </Button>
        }
      />
      <div className="search-toolbar compact-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users by name or email..." />
        </label>
        <label className="select-field">
          <Filter size={17} />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option>All roles</option>
            <option>Participant</option>
            <option>Host</option>
            <option>Jury</option>
            <option>Administrator</option>
          </select>
          <ChevronDown size={16} />
        </label>
      </div>

      <section className="panel table-panel">
        <TableHead labels={['User', 'Role', 'Status', 'Events', 'Joined']} />
        {filtered.map((user) => (
          <div className="table-row" key={user.id}>
            <div className="table-event">
              <div className="avatar avatar-cream">{user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
            </div>
            <span>{user.role}</span>
            <Badge tone={user.status === 'Active' ? 'green' : 'amber'}>{user.status}</Badge>
            <span>{user.eventsCount} events</span>
            <span>{user.joinedDate}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function AuditLogView() {
  const [logs] = useState<AuditLogEntry[]>(sampleAuditLogs);
  const [search, setSearch] = useState('');

  const filtered = logs.filter((log) => `${log.action} ${log.user} ${log.target}`.toLowerCase().includes(search.toLowerCase()));

  const handleExportAudit = () => {
    const csvContent = 'Action,User,Target,Timestamp,IP,Status\n' +
      sampleAuditLogs.map(l => `"${l.action}","${l.user}","${l.target}","${l.timestamp}","${l.ip}","${l.status}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'waymark-audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="Admin workspace"
        title="Activity & Audit Logs"
        action={
          <Button variant="secondary" icon={<Download size={15} />} onClick={handleExportAudit}>
            Export CSV
          </Button>
        }
      />
      <div className="search-toolbar compact-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search audit logs by action, user, or target..." />
        </label>
      </div>
      <section className="panel table-panel">
        <TableHead labels={['Action', 'User', 'Target', 'Timestamp', 'Status']} />
        {filtered.map((log) => (
          <div className="table-row" key={log.id}>
            <div>
              <strong>{log.action}</strong>
              <small>IP: {log.ip}</small>
            </div>
            <span>{log.user}</span>
            <span>{log.target}</span>
            <span>{log.timestamp}</span>
            <Badge tone={log.status === 'Success' ? 'green' : 'red'}>{log.status}</Badge>
          </div>
        ))}
      </section>
    </div>
  );
}

