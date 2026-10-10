import { useMemo, useState } from 'react';
import {
  Activity as ActivityIcon,
  Award,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileCheck2,
  Filter,
  LayoutDashboard,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  TicketCheck,
  TrendingUp,
  TrendingDown,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BarChart, DonutChart, LineChart } from '@/components/Charts';
import { Badge, Button, SectionHeading } from '@/components/ui';
import {
  attendanceData,
  categoryBreakdown,
  dashboardEvents,
  eventCategories,
  eventStatuses,
  quickActions,
  recentActivities,
  registrationTrend,
  summaryStats,
} from '@/data/dashboard';
import type { ActivityEntry } from '@/data/dashboard';

const iconMap: Record<string, LucideIcon> = {
  calendar: CalendarDays,
  ticket: TicketCheck,
  users: Users,
  award: Award,
};

const activityIconMap: Record<ActivityEntry['icon'], LucideIcon> = {
  check: Check,
  certificate: FileCheck2,
  clock: Clock3,
  sparkles: Sparkles,
  user: Users,
  alert: ShieldAlert,
};

export function DashboardPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(eventCategories[0]);
  const [status, setStatus] = useState<string>(eventStatuses[0]);

  const filteredEvents = useMemo(() => {
    return dashboardEvents.filter((event) => {
      const matchesQuery = `${event.title} ${event.category} ${event.location}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = category === eventCategories[0] || event.category === category;
      const matchesStatus = status === eventStatuses[0] || event.status === status;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [query, category, status]);

  return (
    <div className="page-stack">
      {/* Welcome header with quick action */}
      <div className="welcome-row">
        <div>
          <div className="eyebrow">Saturday, October 10, 2026</div>
          <h1>Good morning, Maya.</h1>
          <p className="lede">Here's what's happening across your events today.</p>
        </div>
        <Button icon={<Plus size={17} />}>Create event</Button>
      </div>

      {/* Summary stat cards */}
      <div className="stat-grid">
        {summaryStats.map((stat) => {
          const Icon = iconMap[stat.icon];
          return (
            <div className="stat-card dashboard-stat" key={stat.label}>
              <div className={`stat-icon stat-${stat.accent}`}><Icon size={19} strokeWidth={2} /></div>
              <div className="stat-copy">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <small>{stat.detail}</small>
                <span className={`stat-delta ${stat.deltaUp ? 'delta-up' : 'delta-down'}`}>
                  {stat.deltaUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {stat.delta} vs last month
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts row: registration trend + category breakdown */}
      <div className="dashboard-chart-row">
        <section className="panel panel-wide">
          <SectionHeading
            eyebrow="Growth"
            title="Registration trend"
            action={<div className="chart-period-tabs"><button className="active">6 months</button><button>Year</button></div>}
          />
          <LineChart data={registrationTrend} />
        </section>
        <section className="panel">
          <SectionHeading eyebrow="Distribution" title="Events by category" />
          <DonutChart data={categoryBreakdown} />
        </section>
      </div>

      {/* Attendance + Quick actions */}
      <div className="dashboard-chart-row">
        <section className="panel panel-wide">
          <SectionHeading eyebrow="This week" title="Attendance overview" />
          <BarChart data={attendanceData} />
        </section>
        <section className="panel">
          <SectionHeading eyebrow="Shortcuts" title="Quick actions" />
          <div className="quick-action-list">
            {quickActions.map((action) => (
              <button className="quick-action-item" key={action.label}>
                <div>
                  <strong>{action.label}</strong>
                  <small>{action.detail}</small>
                </div>
                <ChevronRight size={16} className="row-chevron" />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Events table with search + filters */}
      <section className="panel table-panel dashboard-table-panel">
        <div className="dashboard-table-header">
          <SectionHeading eyebrow="Manage" title="Events overview" />
          <div className="search-toolbar dashboard-toolbar">
            <label className="search-field">
              <Search size={18} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events..." />
            </label>
            <label className="select-field">
              <Filter size={17} />
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {eventCategories.map((cat) => <option key={cat}>{cat}</option>)}
              </select>
              <ChevronDown size={16} />
            </label>
            <label className="select-field">
              <LayoutDashboard size={17} />
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {eventStatuses.map((s) => <option key={s}>{s}</option>)}
              </select>
              <ChevronDown size={16} />
            </label>
          </div>
        </div>
        <div className="result-meta dashboard-result-meta">
          <span>{filteredEvents.length} of {dashboardEvents.length} events</span>
          {(query || category !== eventCategories[0] || status !== eventStatuses[0]) && (
            <button onClick={() => { setQuery(''); setCategory(eventCategories[0]); setStatus(eventStatuses[0]); }}>Reset filters</button>
          )}
        </div>
        {filteredEvents.length > 0 ? (
          <div className="dashboard-table-wrap">
            <div className="dashboard-table-head">
              <span>Event</span>
              <span>Date</span>
              <span>Registrations</span>
              <span>Status</span>
              <span />
            </div>
            {filteredEvents.map((event) => (
              <div className="dashboard-table-row" key={event.id}>
                <div className="table-event">
                  <div className={`mini-thumb ${event.color}`}>{event.initials}</div>
                  <div>
                    <strong>{event.title}</strong>
                    <small>{event.category}</small>
                  </div>
                </div>
                <span className="dashboard-cell-date">{event.date}</span>
                <div className="dashboard-reg-cell">
                  <span className="dashboard-reg-num">{event.registrations}/{event.capacity}</span>
                  <div className="capacity-bar">
                    <div
                      className="capacity-fill"
                      style={{
                        width: `${Math.round((event.registrations / event.capacity) * 100)}%`,
                        background: event.registrations / event.capacity > 0.9 ? '#d97f4f' : '#3a8d72',
                      }}
                    />
                  </div>
                </div>
                <Badge tone={event.tone}>{event.status}</Badge>
                <button className="row-action">Manage <ChevronRight size={15} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <p>No events match your filters.</p>
            <Button variant="secondary" onClick={() => { setQuery(''); setCategory(eventCategories[0]); setStatus(eventStatuses[0]); }}>Reset filters</Button>
          </div>
        )}
      </section>

      {/* Recent activity + Notifications summary */}
      <div className="content-grid">
        <section className="panel panel-wide">
          <SectionHeading
            eyebrow="Timeline"
            title="Recent activity"
            action={<Button variant="ghost">View all <ChevronRight size={16} /></Button>}
          />
          <div className="activity-list">
            {recentActivities.map((item, index) => {
              const Icon = activityIconMap[item.icon];
              return (
                <div className="activity-item" key={index}>
                  <span className={`activity-icon activity-${item.tone}`}><Icon size={16} /></span>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <time>{item.time}</time>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel notification-panel">
          <SectionHeading eyebrow="Stay in the loop" title="Notifications" action={<button className="icon-button"><ActivityIcon size={19} /></button>} />
          <div className="activity-list">
            <div className="activity-item"><span className="activity-icon activity-green"><Check size={16} /></span><div><strong>Registration confirmed</strong><span>Zero Origin Hackathon</span></div><time>2h ago</time></div>
            <div className="activity-item"><span className="activity-icon activity-blue"><FileCheck2 size={16} /></span><div><strong>Certificate ready</strong><span>Impact Lab · 2026</span></div><time>Yesterday</time></div>
            <div className="activity-item"><span className="activity-icon activity-amber"><Clock3 size={16} /></span><div><strong>Event starts soon</strong><span>Designing for Civic Impact</span></div><time>2d ago</time></div>
          </div>
          <Button variant="secondary" className="full-button">Open notification inbox</Button>
        </section>
      </div>

      {/* Discover banner */}
      <section className="discover-banner">
        <div className="banner-mark"><Sparkles size={23} /></div>
        <div>
          <strong>Find your next meaningful room.</strong>
          <span>Discover workshops, competitions, and communities built around shared momentum.</span>
        </div>
        <Button variant="secondary">Explore events <ChevronRight size={16} /></Button>
      </section>
    </div>
  );
}
