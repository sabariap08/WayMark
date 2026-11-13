import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarCheck2,
  CheckCircle2,
  Search,
  Ticket,
  UserRound,
  Users,
  UserX,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EventSelect from '../components/EventSelect'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { api, errorMessage } from '../lib/api'
import { formatDate } from '../lib/format'
import { useEventScope } from '../lib/useEventScope'

function ParticipantsSkeleton() {
  return (
    <div className="page-stack">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-toolbar" />
      <div className="skeleton skeleton-panel" />
    </div>
  )
}

export default function Participants() {
  const { user, manageable, loading: scopeLoading, error: scopeError, reload: reloadScope, canManage } =
    useEventScope()
  const [eventId, setEventId] = useState('')
  const [rows, setRows] = useState([])
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (canManage && !eventId && manageable.length) {
      setEventId(String(manageable[0].id))
    }
  }, [canManage, manageable, eventId])

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        if (canManage) {
          if (!eventId) {
            if (alive) setRows([])
            return
          }
          const data = await api.events.participants(eventId)
          if (alive) setRows(Array.isArray(data) ? data : [])
        } else {
          const data = await api.registrations.mine()
          if (alive) setMine(Array.isArray(data) ? data : [])
        }
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
  }, [canManage, eventId, reloadKey])

  const source = canManage ? rows : mine

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return source
    return source.filter((row) =>
      [row.userName, row.userEmail, row.eventTitle, row.ticketCode, row.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [source, query])

  const stats = useMemo(() => {
    const total = source.length
    const confirmed = source.filter((row) => ['Confirmed', 'Registered'].includes(row.status)).length
    const checkedIn = source.filter((row) => row.attendanceStatus === 'Checked in').length
    const waitlisted = source.filter((row) => row.status === 'Waitlisted').length
    return { total, confirmed, checkedIn, waitlisted }
  }, [source])

  const selectedEvent = manageable.find((event) => String(event.id) === String(eventId))

  async function checkIn(row) {
    if (!row.ticketCode) {
      setActionError('This participant has no ticket code yet.')
      return
    }
    setBusy(row.id)
    setActionError('')
    setNotice('')
    try {
      await api.registrations.checkIn({
        eventId: eventId || row.eventId,
        code: row.ticketCode,
        method: 'manual',
      })
      setNotice(`${row.userName || 'Participant'} checked in.`)
      const refreshed = await api.events.participants(eventId || row.eventId)
      setRows(Array.isArray(refreshed) ? refreshed : [])
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  if (scopeLoading) return <ParticipantsSkeleton />
  if (scopeError) return <ErrorState message={scopeError} onRetry={reloadScope} />

  if (!canManage) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Workspace"
          title="Participants"
          description="Your registrations, tickets, and attendance history in one place."
          actions={
            <Link className="btn btn-secondary" to="/app/discover">
              Discover events
            </Link>
          }
        />

        {loading ? (
          <div className="skeleton skeleton-panel" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
        ) : mine.length ? (
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Your journey</span>
                <h2>My registrations</h2>
              </div>
              <span className="panel-chip">{mine.length} total</span>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Attendance</th>
                    <th>Ticket</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {mine.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="table-stack">
                          <strong>{row.eventTitle || 'Event'}</strong>
                          <small>{row.category || 'WayMark event'}</small>
                        </div>
                      </td>
                      <td>{formatDate(row.date)}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>{row.attendanceStatus || 'Registered'}</td>
                      <td>
                        <code className="ticket-code-inline">{row.ticketCode || '—'}</code>
                      </td>
                      <td>
                        <Link className="text-link" to={`/app/events/${row.eventId}`}>
                          Open event
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <EmptyState
            icon={Users}
            title="You have not registered for anything yet"
            description="Browse the event directory and reserve a seat to see your ticket here."
            action={
              <Link className="btn btn-primary" to="/app/discover">
                Discover events
              </Link>
            }
          />
        )}
      </div>
    )
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Participants"
        description="A unified directory of attendees, registration status, and attendance history."
        actions={
          <Link className="btn btn-secondary" to="/app/events">
            Manage events
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
        <div className="toolbar-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, ticket, or status"
            aria-label="Search participants"
          />
        </div>
        {selectedEvent && <span className="toolbar-note">{selectedEvent.title}</span>}
      </section>

      {(notice || actionError) && (
        <div
          className={`alert ${actionError ? 'alert-error' : 'alert-success'}`}
          role={actionError ? 'alert' : 'status'}
        >
          {actionError || notice}
        </div>
      )}

      {!eventId ? (
        <EmptyState
          icon={CalendarCheck2}
          title="Select an event"
          description="Choose one of your events to see its participant roster."
        />
      ) : loading ? (
        <div className="skeleton skeleton-panel" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard
              label="Participants"
              value={String(stats.total)}
              detail="All registration rows"
              icon={Users}
              tone="cobalt"
            />
            <StatCard
              label="Confirmed"
              value={String(stats.confirmed)}
              detail="Seats secured"
              icon={Ticket}
              tone="teal"
            />
            <StatCard
              label="Checked in"
              value={String(stats.checkedIn)}
              detail={
                stats.confirmed
                  ? `${Math.round((stats.checkedIn / stats.confirmed) * 100)}% attendance`
                  : 'No check-ins yet'
              }
              icon={CheckCircle2}
              tone="green"
            />
            <StatCard
              label="Waitlist"
              value={String(stats.waitlisted)}
              detail="Awaiting an offer"
              icon={UserX}
              tone="amber"
            />
          </div>

          {filtered.length ? (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Roster</span>
                  <h2>Participant list</h2>
                </div>
                <span className="panel-chip">{filtered.length} shown</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Status</th>
                      <th>Attendance</th>
                      <th>Registered</th>
                      <th>Ticket</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="table-person">
                            <span className="table-avatar">
                              <UserRound size={15} />
                            </span>
                            <div className="table-stack">
                              <strong>{row.userName || 'Participant'}</strong>
                              <small>{row.userEmail || ''}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>{row.attendanceStatus || 'Registered'}</td>
                        <td>{row.registeredAt || '—'}</td>
                        <td>
                          <code className="ticket-code-inline">{row.ticketCode || '—'}</code>
                        </td>
                        <td>
                          <div className="row-actions-cell">
                            {row.attendanceStatus !== 'Checked in' &&
                              ['Confirmed', 'Registered'].includes(row.status) && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => checkIn(row)}
                                  disabled={busy === row.id}
                                >
                                  <CheckCircle2 size={14} />
                                  {busy === row.id ? 'Checking in...' : 'Check in'}
                                </button>
                              )}
                            <Link className="text-link" to={`/app/events/${row.eventId}`}>
                              Event
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <EmptyState
              icon={UserRound}
              title={query ? 'No participants match your search' : 'No registrations yet'}
              description={
                query
                  ? 'Try a broader search term.'
                  : 'Share the event with your community to start collecting registrations.'
              }
              action={
                query ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>
                    Clear search
                  </button>
                ) : (
                  <Link className="btn btn-secondary" to={`/app/events/${eventId}`}>
                    Open event
                  </Link>
                )
              }
            />
          )}
        </>
      )}
    </div>
  )
}
