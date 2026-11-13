import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Gauge,
  MessageSquareHeart,
  Users,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EventSelect from '../components/EventSelect'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import ModuleAccess from '../components/ModuleAccess'
import TrendChart from '../components/TrendChart'
import { api, errorMessage } from '../lib/api'
import { formatShortDate } from '../lib/format'
import { useEventScope } from '../lib/useEventScope'

function MetricLine({ label, value, hint }) {
  return (
    <div className="metric-line">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  )
}

export default function Analytics() {
  const { manageable, loading: scopeLoading, error: scopeError, reload: reloadScope, canManage } =
    useEventScope()
  const [eventId, setEventId] = useState('')
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (canManage && !eventId && manageable.length) {
      setEventId(String(manageable[0].id))
    }
  }, [canManage, manageable, eventId])

  async function load() {
    if (!canManage || !eventId) return
    setLoading(true)
    setError('')
    try {
      setMetrics(await api.analytics.event(eventId))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, eventId])

  const trend = useMemo(
    () =>
      (metrics?.registrations?.overTime || [])
        .filter((row) => row.date && row.date !== 'unknown')
        .map((row) => ({ label: formatShortDate(row.date), value: row.count })),
    [metrics],
  )

  if (scopeLoading) {
    return (
      <div className="page-stack">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-panel" />
      </div>
    )
  }
  if (scopeError) return <ErrorState message={scopeError} onRetry={reloadScope} />

  if (!canManage) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Insight"
          title="Analytics"
          description="Deterministic metrics for registrations, attendance, budget, and sponsors."
        />
        <ModuleAccess
          title="Analytics are for event hosts"
          description="Only an event host or administrator can review event analytics. Every metric is computed from recorded rows."
          action={
            <Link className="btn btn-secondary" to="/app/events">
              View events
            </Link>
          }
        />
      </div>
    )
  }

  const registration = metrics?.registrations
  const attendance = metrics?.attendance
  const capacity = metrics?.capacity
  const feedback = metrics?.feedback
  const sessions = metrics?.sessions
  const sponsors = metrics?.sponsors
  const volunteers = metrics?.volunteers
  const competition = metrics?.competition
  const retention = metrics?.retention

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Insight"
        title="Analytics"
        description="Every number is calculated from recorded rows — formulas are shown with each metric."
      />

      <section className="toolbar">
        <EventSelect
          events={manageable}
          value={eventId}
          onChange={setEventId}
          label="Event"
          placeholder="Select an event"
        />
        {metrics?.event && <span className="toolbar-note">{metrics.event.title}</span>}
      </section>

      {!eventId ? (
        <EmptyState
          icon={BarChart3}
          title="Select an event"
          description="Choose an event to review its analytics."
        />
      ) : loading ? (
        <div className="skeleton skeleton-panel" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Registrations" value={String(registration?.total ?? 0)} detail={`${registration?.confirmed ?? 0} confirmed`} icon={Users} tone="cobalt" />
            <StatCard label="Attendance" value={attendance?.rate == null ? '—' : `${attendance.rate}%`} detail={`${attendance?.checkedIn ?? 0} checked in`} icon={CheckCircle2} tone="green" />
            <StatCard label="Capacity used" value={capacity?.utilizationPercent == null ? '—' : `${capacity.utilizationPercent}%`} detail={`${capacity?.seats ?? 0} seats`} icon={Gauge} tone="amber" />
            <StatCard label="Feedback" value={feedback?.averageOverall == null ? '—' : `${feedback.averageOverall}/5`} detail={`${feedback?.responses ?? 0} responses`} icon={MessageSquareHeart} tone="rose" />
          </div>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Signal</span>
                <h2>Registrations over time</h2>
              </div>
              <span className="panel-chip">{registration?.total ?? 0} total</span>
            </div>
            {trend.length ? (
              <TrendChart data={trend} />
            ) : (
              <p className="panel-empty">No registration timestamps recorded for this event yet.</p>
            )}
            <p className="metric-formula">{registration?.formula}</p>
          </section>

          <div className="metric-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Attendance</span>
                  <h2>Turnout</h2>
                </div>
              </div>
              <MetricLine label="Checked in" value={attendance?.checkedIn ?? 0} />
              <MetricLine label="No-shows" value={attendance?.noShows ?? 0} />
              <MetricLine label="Rate" value={attendance?.rate == null ? '—' : `${attendance.rate}%`} />
              <p className="metric-formula">{attendance?.formula}</p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Capacity</span>
                  <h2>Seats</h2>
                </div>
              </div>
              <MetricLine label="Seats" value={capacity?.seats ?? 0} />
              <MetricLine label="Confirmed" value={registration?.confirmed ?? 0} />
              <span className="capacity-track">
                <i style={{ width: `${Math.min(100, capacity?.utilizationPercent || 0)}%` }} />
              </span>
              <MetricLine label="Utilisation" value={capacity?.utilizationPercent == null ? '—' : `${capacity.utilizationPercent}%`} />
              <p className="metric-formula">{capacity?.formula}</p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Experience</span>
                  <h2>Feedback</h2>
                </div>
              </div>
              <MetricLine label="Responses" value={feedback?.responses ?? 0} />
              <MetricLine label="Average rating" value={feedback?.averageOverall == null ? '—' : `${feedback.averageOverall}/5`} />
              <MetricLine label="Would recommend" value={feedback?.wouldRecommendPercent == null ? '—' : `${feedback.wouldRecommendPercent}%`} />
              <p className="metric-formula">{feedback?.formula}</p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Programme</span>
                  <h2>Sessions</h2>
                </div>
              </div>
              <MetricLine label="Scheduled" value={sessions?.total ?? 0} />
              <MetricLine label="Completed" value={sessions?.completed ?? 0} />
              <MetricLine label="Sessions attended" value={sessions?.attendedSessions ?? 0} />
              <p className="metric-formula">{sessions?.formula}</p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Partners</span>
                  <h2>Sponsors</h2>
                </div>
              </div>
              <MetricLine label="Sponsors" value={sponsors?.count ?? 0} />
              <MetricLine label="Deliverables done" value={`${sponsors?.deliverablesDone ?? 0}/${sponsors?.deliverablesTotal ?? 0}`} />
              <MetricLine
                label="Completion"
                value={sponsors?.deliverableCompletionPercent == null ? '—' : `${sponsors.deliverableCompletionPercent}%`}
              />
              <p className="metric-formula">{sponsors?.formula}</p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Crew</span>
                  <h2>Volunteers &amp; tasks</h2>
                </div>
              </div>
              <MetricLine label="Volunteers" value={volunteers?.total ?? 0} />
              <MetricLine label="Tasks completed" value={`${volunteers?.tasksCompleted ?? 0}/${volunteers?.tasksTotal ?? 0}`} />
              <MetricLine
                label="Task completion"
                value={volunteers?.taskCompletionPercent == null ? '—' : `${volunteers.taskCompletionPercent}%`}
              />
              <p className="metric-formula">{volunteers?.formula}</p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Competition</span>
                  <h2>Submissions</h2>
                </div>
              </div>
              <MetricLine label="Submissions" value={competition?.submissions ?? 0} />
              <MetricLine label="Scored" value={competition?.scored ?? 0} />
              <MetricLine
                label="Participation"
                value={competition?.participationRatePercent == null ? '—' : `${competition.participationRatePercent}%`}
              />
              <p className="metric-formula">{competition?.formula}</p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Loyalty</span>
                  <h2>Retention</h2>
                </div>
              </div>
              <MetricLine
                label="Returning participants"
                value={retention?.participantsFromPreviousEdition ?? 0}
              />
              <MetricLine
                label="Retention rate"
                value={retention?.percent == null ? '—' : `${retention.percent}%`}
              />
              <p className="metric-formula">{retention?.note || retention?.formula}</p>
            </section>
          </div>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Transparency</span>
                <h2>How these numbers are built</h2>
              </div>
              <Activity size={18} />
            </div>
            <div className="formula-list">
              {Object.entries(metrics?.formulas || {}).map(([key, value]) => (
                <div className="formula-row" key={key}>
                  <strong>{key}</strong>
                  <span>{value}</span>
                </div>
              ))}
            </div>
            <p className="metric-formula">
              <CalendarClock size={14} /> Data reflects confirmed registrations, attendance logs,
              feedback, submitted sessions, and recorded budget lines for this event only.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
