import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  Sparkles,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react'
import StatCard from '../components/StatCard'
import TrendChart from '../components/TrendChart'
import EventTable from '../components/EventTable'
import ErrorState from '../components/ErrorState'
import PageHeader from '../components/PageHeader'
import { api, errorMessage } from '../lib/api'
import { greeting, todayLabel } from '../lib/format'
import { useAuth } from '../context/AuthContext'

const statIcons = {
  calendar: CalendarDays,
  ticket: Ticket,
  alert: AlertTriangle,
  users: Users,
  award: Award,
}

const activityIcons = {
  certificate: Award,
  sparkles: Sparkles,
  user: UserRound,
  alert: AlertTriangle,
  check: CheckCircle2,
  clock: Clock3,
}

const quickActionRoutes = {
  'Discover events': '/app/discover',
  'Host an event': '/app/hosting',
  'View my registrations': '/app/participants',
  'Download certificates': '/app/certificates',
  'Review pending events': '/app/events',
  'Review hosting requests': '/app/hosting',
  'Open audit log': '/app/audit',
}

function DashboardSkeleton() {
  return (
    <div className="page-stack">
      <div className="skeleton skeleton-title" />
      <div className="stat-grid">
        {[0, 1, 2, 3].map((item) => (
          <div className="skeleton skeleton-stat" key={item} />
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="skeleton skeleton-chart" />
        <div className="skeleton skeleton-chart" />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const payload = await api.dashboard.overview()
      setData(payload)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <DashboardSkeleton />
  if (error) return <ErrorState message={error} onRetry={load} />

  const stats = data?.summaryStats || []
  const trend = data?.registrationTrend || []
  const categories = (data?.categoryBreakdown || []).slice(0, 5)
  const activities = data?.recentActivities || []
  const events = data?.dashboardEvents || []
  const quickActions = data?.quickActions || []
  const firstName = (user?.name || 'there').split(' ')[0]
  const categoryTotal = categories.reduce((total, item) => total + Number(item.value || 0), 0)

  let cursor = 0
  const donutSegments = categories.map((item) => {
    const start = cursor
    const share = categoryTotal ? (Number(item.value || 0) / categoryTotal) * 100 : 0
    cursor += share
    return `${item.color || '#2f5bff'} ${start}% ${Math.max(start + share, start + 0.4)}%`
  })

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={todayLabel()}
        title={`${greeting()}, ${firstName}`}
        description="Here is what is moving across your events today."
        actions={
          <>
            <Link className="btn btn-secondary" to="/app/events">
              View all events
            </Link>
            <Link className="btn btn-primary" to="/app/hosting">
              Host an event
              <ArrowRight size={15} />
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        {stats.map((stat) => {
          const Icon = statIcons[stat.icon] || CalendarDays
          return (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              detail={stat.detail}
              icon={Icon}
              tone={stat.accent || 'cobalt'}
            />
          )
        })}
      </div>

      <div className="dashboard-grid">
        <section className="panel panel-chart">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Momentum</span>
              <h2>Registration trend</h2>
            </div>
            <span className="panel-chip">Last 6 months</span>
          </div>
          <TrendChart data={trend} />
        </section>

        <section className="panel panel-categories">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Mix</span>
              <h2>Event categories</h2>
            </div>
          </div>
          {categoryTotal > 0 ? (
            <div className="category-body">
              <div
                className="donut"
                style={{
                  background: donutSegments.length
                    ? `conic-gradient(${donutSegments.join(', ')})`
                    : 'var(--surface-3)',
                }}
                role="img"
                aria-label={`${categoryTotal} events across ${categories.length} categories`}
              >
                <span className="donut-hole">
                  <strong>{categoryTotal}</strong>
                  <small>events</small>
                </span>
              </div>
              <div className="category-legend">
                {categories.map((item) => (
                  <div className="legend-row" key={item.label}>
                    <span className="legend-dot" style={{ background: item.color || '#2f5bff' }} />
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="panel-empty">Category data will appear as events are created.</p>
          )}
        </section>
      </div>

      <div className="dashboard-lower">
        <section className="panel panel-events">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Workspace</span>
              <h2>Recent events</h2>
            </div>
            <Link className="text-link" to="/app/events">
              See all <ArrowRight size={14} />
            </Link>
          </div>
          <EventTable events={events} />
        </section>

        <section className="panel panel-activity">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Live feed</span>
              <h2>Recent activity</h2>
            </div>
          </div>
          {activities.length ? (
            <div className="activity-list">
              {activities.map((activity, index) => {
                const Icon = activityIcons[activity.icon] || Clock3
                return (
                  <div className="activity-row" key={`${activity.title}-${index}`}>
                    <span className={`activity-icon tone-${activity.tone || 'cobalt'}`}>
                      <Icon size={15} />
                    </span>
                    <div className="activity-copy">
                      <strong>{activity.title}</strong>
                      <span>{activity.detail || 'Workspace update'}</span>
                    </div>
                    <time>{activity.time}</time>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="panel-empty">No recent activity yet.</p>
          )}
        </section>
      </div>

      {quickActions.length > 0 && (
        <section className="quick-section">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Shortcuts</span>
              <h2>Pick up where you left off</h2>
            </div>
          </div>
          <div className="quick-grid">
            {quickActions.map((action) => (
              <Link className="quick-card" to={quickActionRoutes[action.label] || '/app/events'} key={action.label}>
                <span className="quick-icon">
                  <Compass size={17} />
                </span>
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.detail}</small>
                </span>
                <ArrowRight size={15} className="quick-arrow" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
