import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Globe2,
  Hourglass,
  Mail,
  MapPin,
  ShieldCheck,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import EventTable from '../components/EventTable'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import { api, errorMessage } from '../lib/api'
import { formatDate, formatTime, percent } from '../lib/format'
import { useAuth } from '../context/AuthContext'

const OPEN_STATUSES = ['Published', 'Registration open']

function shareText(value) {
  return value === undefined || value === null || value === '' ? '—' : value
}

function AgendaList({ items }) {
  return (
    <ol className="agenda-list">
      {items.map((item, index) => {
        const row = typeof item === 'string' ? { title: item } : item || {}
        const title = row.title || row.name || row.label || `Session ${index + 1}`
        const time = row.time || row.start || ''
        return (
          <li key={`${title}-${index}`}>
            <span className="agenda-marker">{time || String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{title}</strong>
              {row.detail && <small>{row.detail}</small>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function DetailSkeleton() {
  return (
    <div className="page-stack">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-hero" />
      <div className="detail-grid">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
    </div>
  )
}

export default function EventDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [event, setEvent] = useState(null)
  const [registrations, setRegistrations] = useState([])
  const [attendance, setAttendance] = useState([])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [busy, setBusy] = useState(false)

  const manager = Boolean(event && (user?.isAdmin || event.hostId === user?.id))

  async function load() {
    setLoading(true)
    setError('')
    try {
      const eventData = await api.events.get(id)
      setEvent(eventData)

      const isManager = Boolean(user?.isAdmin || eventData.hostId === user?.id)
      const requests = [
        api.registrations.list({ eventId: id }).catch(() => []),
        isManager ? api.events.attendance(id).catch(() => []) : Promise.resolve([]),
        isManager ? api.events.results(id).catch(() => null) : Promise.resolve(null),
      ]
      const [registrationRows, attendanceRows, resultData] = await Promise.all(requests)
      setRegistrations(Array.isArray(registrationRows) ? registrationRows : [])
      setAttendance(Array.isArray(attendanceRows) ? attendanceRows : [])
      setResults(resultData)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const myRegistration = useMemo(
    () => (!manager ? registrations.find((row) => row.userId === user?.id) : null),
    [manager, registrations, user?.id],
  )

  const capacity = event?.capacityNum || event?.seats || 0
  const registered = event?.registeredNum || registrations.filter((row) => ['Confirmed', 'Registered'].includes(row.status)).length || 0
  const fill = percent(registered, capacity)
  const seatsLeft = capacity ? Math.max(capacity - registered, 0) : null
  const isOpen = event && OPEN_STATUSES.includes(event.status)
  const agenda = event?.agenda || []
  const requirements = event?.requirements || []
  const resultEntries = results?.entries || []
  const recentRegistrations = useMemo(() => {
    return [...registrations]
      .sort((a, b) => String(b.registeredAt || '').localeCompare(String(a.registeredAt || '')))
      .slice(0, 6)
      .map((row) => ({
        id: row.id,
        title: row.userName || row.userEmail || 'Participant',
        category: row.userEmail || '',
        date: row.registeredAt || '',
        time: row.attendanceStatus || row.status || '',
        registeredNum: 1,
        capacityNum: 1,
        status: row.status,
        color: '#2f5bff',
        initials: (row.userName || 'P').slice(0, 2).toUpperCase(),
      }))
  }, [registrations])

  async function register(waitlist = false) {
    setBusy(true)
    setActionError('')
    setActionNote('')
    try {
      const registration = await api.registrations.create({ eventId: id, waitlist })
      setActionNote(
        registration.status === 'Waitlisted'
          ? `You joined the waitlist at position ${registration.waitlistPosition || '—'}.`
          : 'Registration confirmed. Your ticket is ready.',
      )
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function cancelRegistration() {
    if (!myRegistration) return
    if (!window.confirm('Cancel this registration?')) return
    setBusy(true)
    setActionError('')
    setActionNote('')
    try {
      await api.registrations.cancel(myRegistration.id)
      setActionNote('Registration cancelled.')
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <DetailSkeleton />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!event) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Event not found"
        description="This event may have been removed or the link is out of date."
        action={
          <Link className="btn btn-secondary" to="/app/events">
            Back to events
          </Link>
        }
      />
    )
  }

  return (
    <div className="page-stack">
      <div className="detail-back-row">
        <Link className="text-link" to="/app/events">
          <ArrowLeft size={15} />
          Back to events
        </Link>
        <span>{event.category || 'Event'} · {formatDate(event.date)}</span>
      </div>

      <section className="event-hero" style={{ '--event-color': event.color || '#2f5bff' }}>
        <div className="event-hero-glow" />
        <div className="event-hero-top">
          <span className="event-hero-monogram">{event.initials || 'WM'}</span>
          <div className="event-hero-badges">
            <StatusBadge status={event.approvalStatus || event.status} />
            <span className="hero-chip">{event.format || 'Offline'}</span>
            {event.resultsReleased && <span className="hero-chip is-accent">Results released</span>}
          </div>
        </div>
        <div className="event-hero-copy">
          <span className="eyebrow">{event.category || 'Event'}</span>
          <h1>{event.title}</h1>
          <p>{event.description || 'Details for this event will be shared by the host.'}</p>
          {event.tags?.length > 0 && (
            <div className="tag-row">
              {event.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="event-hero-meta">
          <div>
            <CalendarDays size={16} />
            <span>
              <small>Date</small>
              <strong>{formatDate(event.date)}</strong>
            </span>
          </div>
          <div>
            <Clock3 size={16} />
            <span>
              <small>Time</small>
              <strong>{formatTime(event.time)}</strong>
            </span>
          </div>
          <div>
            <MapPin size={16} />
            <span>
              <small>Location</small>
              <strong>{shareText(event.location)}</strong>
            </span>
          </div>
          <div>
            <UserRound size={16} />
            <span>
              <small>Host</small>
              <strong>{shareText(event.organizer || event.hostName)}</strong>
            </span>
          </div>
        </div>
      </section>

      {(actionError || actionNote) && (
        <div
          className={`alert ${actionError ? 'alert-error' : 'alert-success'}`}
          role={actionError ? 'alert' : 'status'}
        >
          {actionError || actionNote}
        </div>
      )}

      <div className="detail-grid">
        <div className="page-stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">The event</span>
                <h2>About this event</h2>
              </div>
            </div>
            <p className="detail-prose">
              {event.description || 'The host has not added a longer description yet.'}
            </p>
            <div className="fact-strip">
              <span>
                <Ticket size={15} /> {registered} registered
              </span>
              <span>
                <Users size={15} /> {capacity || 'Open'} capacity
              </span>
              <span>
                <Clock3 size={15} /> {event.regDeadline ? `Closes ${event.regDeadline}` : 'Open until full'}
              </span>
            </div>
          </section>

          {agenda.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Schedule</span>
                  <h2>Agenda</h2>
                </div>
              </div>
              <AgendaList items={agenda} />
            </section>
          )}

          {requirements.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Before you arrive</span>
                  <h2>Requirements</h2>
                </div>
              </div>
              <ul className="check-list">
                {requirements.map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <CheckCircle2 size={16} />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {manager && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Organiser view</span>
                  <h2>Registration health</h2>
                </div>
                <Link className="text-link" to="/app/participants">
                  Manage <ArrowRight size={14} />
                </Link>
              </div>
              <div className="mini-stat-grid">
                <div className="mini-stat">
                  <span>Registered</span>
                  <strong>{registered}</strong>
                  <small>{capacity ? `${fill}% of capacity` : 'No cap set'}</small>
                </div>
                <div className="mini-stat">
                  <span>Checked in</span>
                  <strong>{attendance.length}</strong>
                  <small>{registered ? `${percent(attendance.length, registered)}% attendance` : 'No registrations yet'}</small>
                </div>
                <div className="mini-stat">
                  <span>Waitlist</span>
                  <strong>{event.waitlistNum || 0}</strong>
                  <small>Offers expire in 48h</small>
                </div>
              </div>
              {registrations.length > 0 ? (
                <EventTable events={recentRegistrations} />
              ) : (
                <p className="panel-empty">No registrations yet.</p>
              )}
            </section>
          )}

          {resultEntries.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Outcome</span>
                  <h2>Results</h2>
                </div>
                {results?.released && <span className="panel-chip">Released</span>}
              </div>
              <div className="result-list">
                {resultEntries.slice(0, 5).map((entry) => (
                  <div className="result-row" key={entry.submissionId}>
                    <span className="result-rank">{entry.rank}</span>
                    <div>
                      <strong>{entry.projectTitle || entry.teamName || 'Entry'}</strong>
                      <small>{entry.teamName || entry.track || 'Participant'}</small>
                    </div>
                    <span className="result-score">{entry.score}</span>
                    {entry.award && <span className="tag">{entry.award}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="detail-side">
          <section className="panel register-panel">
            <div className="register-panel-head">
              <span className="eyebrow">Registration</span>
              <StatusBadge status={event.status} />
            </div>

            <div className="register-price">
              <strong>{capacity ? `${seatsLeft} seats left` : 'Open registration'}</strong>
              <span>{capacity ? `${registered} of ${capacity} filled` : 'No capacity limit set'}</span>
            </div>
            <span className="capacity-track">
              <i style={{ width: `${fill}%` }} />
            </span>

            {manager ? (
              <p className="register-note">
                You manage this event. Registration and participant actions live in the organiser
                workspace.
              </p>
            ) : myRegistration ? (
              <div className="ticket-card">
                <span className="ticket-icon">
                  <Ticket size={18} />
                </span>
                <div>
                  <strong>
                    {myRegistration.status === 'Waitlisted'
                      ? `Waitlist #${myRegistration.waitlistPosition || '—'}`
                      : 'You are registered'}
                  </strong>
                  <small>
                    {myRegistration.ticketCode
                      ? `Ticket ${myRegistration.ticketCode}`
                      : myRegistration.attendanceStatus || myRegistration.status}
                  </small>
                </div>
              </div>
            ) : (
              <p className="register-note">
                {isOpen
                  ? 'Reserve your seat. You will receive a ticket code immediately.'
                  : 'Registration is not currently open for this event.'}
              </p>
            )}

            {!manager && myRegistration ? (
              <button type="button" className="btn btn-secondary btn-block" onClick={cancelRegistration} disabled={busy}>
                {busy ? 'Working...' : 'Cancel registration'}
              </button>
            ) : !manager ? (
              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={() => register(seatsLeft === 0)}
                disabled={busy || !isOpen}
              >
                {busy ? 'Reserving...' : seatsLeft === 0 ? 'Join waitlist' : 'Register for this event'}
                {!busy && <ArrowRight size={16} />}
              </button>
            ) : (
              <Link className="btn btn-primary btn-block" to="/app/participants">
                Open participants
                <ArrowRight size={15} />
              </Link>
            )}

            <div className="register-meta">
              <span>
                <CalendarDays size={14} />
                {event.regDeadline ? `Registration closes ${event.regDeadline}` : 'Registration open until full'}
              </span>
              <span>
                <Mail size={14} />
                {event.contactEmail || 'Contact the host in-app'}
              </span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">At a glance</span>
                <h2>Event details</h2>
              </div>
            </div>
            <div className="fact-list">
              <div>
                <span>Format</span>
                <strong>{event.format || 'Offline'}</strong>
              </div>
              <div>
                <span>Participation</span>
                <strong>{event.participation || 'Individual'}</strong>
              </div>
              <div>
                <span>Visibility</span>
                <strong>{event.visibility || 'Public'}</strong>
              </div>
              <div>
                <span>Timezone</span>
                <strong>{event.timezone || 'Asia/Kolkata'}</strong>
              </div>
              <div>
                <span>Certificates</span>
                <strong>{event.certificatesEnabled ? 'Available' : 'Not offered'}</strong>
              </div>
              <div>
                <span>Jury evaluation</span>
                <strong>{event.juryEnabled ? 'Enabled' : 'Not for this event'}</strong>
              </div>
            </div>
            {event.website && (
              <a className="text-link detail-website" href={event.website} target="_blank" rel="noreferrer">
                <Globe2 size={14} /> Visit event website
              </a>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Venue</span>
                <h2>Location</h2>
              </div>
            </div>
            <div className="venue-card">
              <span className="venue-icon">
                <MapPin size={19} />
              </span>
              <div>
                <strong>{shareText(event.location)}</strong>
                <small>Full directions will be shared by the host before the event.</small>
              </div>
            </div>
          </section>

          <section className="panel trust-panel">
            <div className="trust-row">
              <ShieldCheck size={17} />
              <span>
                <strong>Event host</strong>
                <small>Managed in this WayMark workspace</small>
              </span>
            </div>
            <div className="trust-row">
              <ClipboardCheck size={17} />
              <span>
                <strong>{requirements.length ? 'Clear requirements' : 'Open event'}</strong>
                <small>
                  {requirements.length
                    ? 'Everything is listed above'
                    : 'Ask the host if anything is unclear'}
                </small>
              </span>
            </div>
            <div className="trust-row">
              <Award size={17} />
              <span>
                <strong>{event.certificatesEnabled ? 'Certificate eligible' : 'No certificate'}</strong>
                <small>{event.attendanceRequired ? 'Attendance required' : 'Attendance optional'}</small>
              </span>
            </div>
            <div className="trust-row">
              <Hourglass size={17} />
              <span>
                <strong>{event.resultsReleased ? 'Results are live' : 'Results not released'}</strong>
                <small>{results?.releasedAt ? formatDate(results.releasedAt) : 'The host will publish results here'}</small>
              </span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
