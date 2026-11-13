import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
  Users,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EventTable from '../components/EventTable'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { api, errorMessage } from '../lib/api'
import { formatDate, formatTime, percent } from '../lib/format'

function EventsSkeleton() {
  return (
    <div className="page-stack">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-toolbar" />
      <div className="event-card-grid">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div className="skeleton skeleton-card" key={item} />
        ))}
      </div>
    </div>
  )
}

export default function Events() {
  const [searchParams] = useSearchParams()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [status, setStatus] = useState('All statuses')
  const [category, setCategory] = useState('All categories')
  const [view, setView] = useState('grid')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const payload = await api.events.list()
      setEvents(Array.isArray(payload) ? payload : [])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    setQuery(searchParams.get('q') || '')
  }, [searchParams])

  const statuses = useMemo(() => {
    const unique = [...new Set(events.map((event) => event.status).filter(Boolean))]
    return ['All statuses', ...unique.sort()]
  }, [events])

  const categories = useMemo(() => {
    const unique = [...new Set(events.map((event) => event.category).filter(Boolean))]
    return ['All categories', ...unique.sort()]
  }, [events])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return events.filter((event) => {
      if (status !== 'All statuses' && event.status !== status) return false
      if (category !== 'All categories' && event.category !== category) return false
      if (!term) return true
      return [event.title, event.category, event.location, event.organizer]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [events, query, status, category])

  if (loading) return <EventsSkeleton />
  if (error) return <ErrorState message={error} onRetry={load} />

  const hasFilters = query.trim() || status !== 'All statuses' || category !== 'All categories'

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Events"
        description="Plan, run, and close out every event from a single workspace."
        actions={
          <Link className="btn btn-primary" to="/app/hosting">
            <Plus size={15} />
            Host an event
          </Link>
        }
      />

      <section className="toolbar">
        <div className="toolbar-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, category, or location"
            aria-label="Search events"
          />
        </div>
        <div className="toolbar-filters">
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <div className="view-toggle" role="group" aria-label="View style">
            <button
              type="button"
              className={view === 'grid' ? 'is-active' : ''}
              onClick={() => setView('grid')}
              aria-label="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={view === 'table' ? 'is-active' : ''}
              onClick={() => setView('table')}
              aria-label="Table view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </section>

      <div className="results-bar">
        <span>
          <strong>{filtered.length}</strong> {filtered.length === 1 ? 'event' : 'events'}
          {hasFilters ? ' matching your filters' : ' in this workspace'}
        </span>
        {hasFilters && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setQuery('')
              setStatus('All statuses')
              setCategory('All categories')
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {!filtered.length ? (
        <EmptyState
          icon={CalendarDays}
          title={hasFilters ? 'No events match those filters' : 'No events yet'}
          description={
            hasFilters
              ? 'Try a broader search or clear the filters to see the full workspace.'
              : 'Submit a hosting request to create the first event in this workspace.'
          }
          action={
            hasFilters ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setQuery('')
                  setStatus('All statuses')
                  setCategory('All categories')
                }}
              >
                Clear filters
              </button>
            ) : (
              <Link className="btn btn-primary" to="/app/hosting">
                Host an event
              </Link>
            )
          }
        />
      ) : view === 'table' ? (
        <section className="panel panel-table">
          <EventTable events={filtered} />
        </section>
      ) : (
        <div className="event-card-grid">
          {filtered.map((event) => {
            const registrations = event.registeredNum || 0
            const capacity = event.capacityNum || event.seats || 0
            const fill = percent(registrations, capacity)
            return (
              <article className="event-card" key={event.id}>
                <div className="event-card-top" style={{ '--event-color': event.color || '#2f5bff' }}>
                  <span className="event-card-monogram">{event.initials || 'WM'}</span>
                  <StatusBadge status={event.status || event.approvalStatus} />
                </div>
                <div className="event-card-body">
                  <span className="eyebrow">{event.category || 'Event'}</span>
                  <Link className="event-card-title" to={`/app/events/${event.id}`}>
                    {event.title}
                  </Link>
                  <p className="event-card-description">
                    {event.description || 'Open the event workspace to see the full plan.'}
                  </p>
                  <div className="event-card-meta">
                    <span>
                      <CalendarDays size={14} />
                      {formatDate(event.date)} · {formatTime(event.time)}
                    </span>
                    <span>
                      <MapPin size={14} />
                      {event.location || 'Location TBA'}
                    </span>
                    <span>
                      <Users size={14} />
                      {registrations} registered
                    </span>
                  </div>
                  <div className="event-card-progress">
                    <div className="event-card-progress-head">
                      <span>Capacity</span>
                      <strong>{fill}%</strong>
                    </div>
                    <span className="capacity-track">
                      <i style={{ width: `${fill}%` }} />
                    </span>
                  </div>
                  <div className="event-card-foot">
                    <span>{event.hostName || event.organizer || 'WayMark team'}</span>
                    <Link className="text-link" to={`/app/events/${event.id}`}>
                      Open event <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
