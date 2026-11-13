import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarRange,
  Clock3,
  DoorOpen,
  MapPin,
  Presentation,
  Users,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EventSelect from '../components/EventSelect'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import ModuleAccess from '../components/ModuleAccess'
import { api, errorMessage } from '../lib/api'
import { formatDate, formatTime } from '../lib/format'
import { useEventScope } from '../lib/useEventScope'

function groupByDay(sessions = []) {
  const groups = new Map()
  sessions.forEach((session) => {
    const key = session.day || 'Unscheduled'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(session)
  })
  return [...groups.entries()]
    .map(([day, items]) => ({
      day,
      items: items.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || ''))),
    }))
    .sort((a, b) => String(a.day).localeCompare(String(b.day)))
}

export default function Schedule() {
  const { manageable, loading: scopeLoading, error: scopeError, reload: reloadScope, canManage } =
    useEventScope()
  const [eventId, setEventId] = useState('')
  const [data, setData] = useState(null)
  const [conflicts, setConflicts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (canManage && !eventId && manageable.length) {
      setEventId(String(manageable[0].id))
    }
  }, [canManage, manageable, eventId])

  useEffect(() => {
    let alive = true
    async function load() {
      if (!canManage || !eventId) return
      setLoading(true)
      setError('')
      try {
        const [schedule, conflictRows] = await Promise.all([
          api.schedule.get(eventId),
          api.schedule.conflicts(eventId).catch(() => []),
        ])
        if (!alive) return
        setData(schedule || { days: [], sessions: [], venues: [], resources: [], bookings: [] })
        setConflicts(Array.isArray(conflictRows) ? conflictRows : [])
      } catch (err) {
        if (alive) setError(errorMessage(err))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [canManage, eventId])

  const days = useMemo(() => groupByDay(data?.sessions || []), [data])
  const openConflicts = conflicts.filter((row) => row.status === 'Open')
  const selectedEvent = manageable.find((event) => String(event.id) === String(eventId))

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
          eyebrow="Operations"
          title="Schedule"
          description="Sessions, rooms, resources, and conflict detection for your event."
        />
        <ModuleAccess
          title="Schedule is managed by hosts"
          description="Only an event host or administrator can build and publish the schedule. Explore events to find one you can join."
          action={
            <Link className="btn btn-secondary" to="/app/discover">
              Discover events
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operations"
        title="Schedule"
        description="Sessions, rooms, resources, conflict detection, and publishing."
        actions={
          <Link className="btn btn-secondary" to={`/app/events/${eventId || ''}`}>
            Open event workspace
          </Link>
        }
      />

      <section className="toolbar">
        <EventSelect
          events={manageable}
          value={eventId}
          onChange={setEventId}
          label="Event"
          placeholder="Select an event"
        />
        {selectedEvent && (
          <span className="toolbar-note">
            {formatDate(selectedEvent.date)} · {selectedEvent.location || 'Location TBA'}
          </span>
        )}
      </section>

      {!eventId ? (
        <EmptyState
          icon={CalendarRange}
          title="Select an event"
          description="Choose an event to inspect its agenda, rooms, and resources."
        />
      ) : loading ? (
        <div className="skeleton skeleton-panel" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setEventId(eventId)} />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard
              label="Sessions"
              value={String(data?.sessions?.length || 0)}
              detail={`${days.length} scheduled day${days.length === 1 ? '' : 's'}`}
              icon={Presentation}
              tone="cobalt"
            />
            <StatCard
              label="Venues"
              value={String(data?.venues?.length || 0)}
              detail={`${data?.resources?.length || 0} resources`}
              icon={DoorOpen}
              tone="teal"
            />
            <StatCard
              label="Bookings"
              value={String(data?.bookings?.length || 0)}
              detail="Resource reservations"
              icon={CalendarRange}
              tone="plum"
            />
            <StatCard
              label="Conflicts"
              value={String(openConflicts.length)}
              detail={openConflicts.length ? 'Needs attention' : 'Schedule is clear'}
              icon={AlertTriangle}
              tone={openConflicts.length ? 'rose' : 'green'}
            />
          </div>

          {days.length ? (
            <div className="schedule-list">
              {days.map((group) => (
                <section className="panel schedule-day" key={group.day}>
                  <div className="panel-head">
                    <div>
                      <span className="eyebrow">Day</span>
                      <h2>{group.day === 'Unscheduled' ? 'Unscheduled sessions' : formatDate(group.day)}</h2>
                    </div>
                    <span className="panel-chip">{group.items.length} sessions</span>
                  </div>
                  <div className="session-list">
                    {group.items.map((session) => (
                      <article className="session-card" key={session.id}>
                        <div className="session-time">
                          <strong>{formatTime(session.startTime)}</strong>
                          <span>{formatTime(session.endTime)}</span>
                        </div>
                        <div className="session-copy">
                          <div className="session-head">
                            <h3>{session.title}</h3>
                            <StatusBadge status={session.status} />
                          </div>
                          <p>{session.description || 'No session notes yet.'}</p>
                          <div className="session-meta">
                            <span>
                              <MapPin size={13} />
                              {session.roomName || 'Room TBA'}
                            </span>
                            <span>
                              <Users size={13} />
                              {session.capacity ? `${session.capacity} seats` : 'Open capacity'}
                            </span>
                            <span>
                              <Clock3 size={13} />
                              {session.sessionType || 'Talk'}
                            </span>
                            {session.speakers?.length > 0 && (
                              <span>
                                <Presentation size={13} />
                                {session.speakers.map((speaker) => speaker.name || speaker).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarRange}
              title="No sessions scheduled"
              description="Add sessions to the event to build the agenda. Sessions, rooms, and resources will appear here."
              action={
                <Link className="btn btn-secondary" to={`/app/events/${eventId}`}>
                  Open event workspace
                </Link>
              }
            />
          )}

          {openConflicts.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Conflict detection</span>
                  <h2>Open conflicts</h2>
                </div>
                <span className="status status-danger">
                  <span className="status-dot" />
                  {openConflicts.length} open
                </span>
              </div>
              <div className="conflict-list">
                {openConflicts.map((conflict) => (
                  <div className="conflict-row" key={conflict.id}>
                    <span className={`conflict-severity tone-${conflict.severity === 'Critical' ? 'rose' : 'amber'}`}>
                      <AlertTriangle size={15} />
                    </span>
                    <div>
                      <strong>{conflict.message || conflict.conflictType}</strong>
                      <small>
                        {(conflict.sessionTitles || []).join(' · ') ||
                          `${formatDate(conflict.day)} ${formatTime(conflict.startTime)}`}
                      </small>
                    </div>
                    <span className="table-note">{conflict.resourceName || conflict.person || ''}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
