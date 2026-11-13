import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  Compass,
  MapPin,
  Plus,
  Search,
  Users,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { formatDate, formatTime, percent } from '../lib/format'
import { useEventScope } from '../lib/useEventScope'

function DiscoverSkeleton() {
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

export default function Discover() {
  const { events, loading, error, reload } = useEventScope()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All categories')

  const categories = useMemo(() => {
    const unique = [...new Set(events.map((event) => event.category).filter(Boolean))]
    return ['All categories', ...unique.sort()]
  }, [events])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return events.filter((event) => {
      if (category !== 'All categories' && event.category !== category) return false
      if (!term) return true
      return [event.title, event.category, event.location, event.organizer, event.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [events, query, category])

  if (loading) return <DiscoverSkeleton />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const hasFilters = query.trim() || category !== 'All categories'
  const openForRegistration = events.filter((event) =>
    ['Published', 'Registration open'].includes(event.status),
  ).length

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Open doors"
        title="Discover events"
        description="Find the spaces, people, and ideas worth showing up for."
        actions={
          <Link className="btn btn-primary" to="/app/hosting">
            <Plus size={15} />
            Host an event
          </Link>
        }
        meta={
          <>
            <span>{events.length} events available</span>
            <span>{openForRegistration} open for registration</span>
          </>
        }
      />

      <section className="toolbar">
        <div className="toolbar-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events, topics, or keywords"
            aria-label="Search events"
          />
        </div>
        <div className="toolbar-filters">
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setQuery('')
                setCategory('All categories')
              }}
            >
              Reset
            </button>
          )}
        </div>
      </section>

      <div className="results-bar">
        <span>
          <strong>{filtered.length}</strong> {filtered.length === 1 ? 'event' : 'events'}
          {hasFilters ? ' matching your filters' : ' worth exploring'}
        </span>
      </div>

      {filtered.length ? (
        <div className="event-card-grid">
          {filtered.map((event) => {
            const registered = event.registeredNum || 0
            const capacity = event.capacityNum || event.seats || 0
            const fill = percent(registered, capacity)
            const seatsLeft = capacity ? Math.max(capacity - registered, 0) : null
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
                    {event.description || 'Open the event to see the full plan.'}
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
                      {seatsLeft === null
                        ? 'Open registration'
                        : seatsLeft === 0
                          ? 'Waitlist only'
                          : `${seatsLeft} seats left`}
                    </span>
                  </div>
                  <div className="event-card-progress">
                    <div className="event-card-progress-head">
                      <span>Capacity</span>
                      <strong>{capacity ? `${fill}%` : 'Open'}</strong>
                    </div>
                    <span className="capacity-track">
                      <i style={{ width: `${fill}%` }} />
                    </span>
                  </div>
                  <div className="event-card-foot">
                    <span>{event.organizer || event.hostName || 'WayMark team'}</span>
                    <Link className="text-link" to={`/app/events/${event.id}`}>
                      View details <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={Compass}
          title={hasFilters ? 'No events match those filters' : 'Nothing to discover yet'}
          description={
            hasFilters
              ? 'Try a different keyword or reset your filters to see everything.'
              : 'New events will appear here as hosts publish them.'
          }
          action={
            hasFilters ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setQuery('')
                  setCategory('All categories')
                }}
              >
                Reset filters
              </button>
            ) : (
              <Link className="btn btn-primary" to="/app/hosting">
                Host the first event
              </Link>
            )
          }
        />
      )}
    </div>
  )
}
