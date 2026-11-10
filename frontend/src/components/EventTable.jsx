import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { formatDate, formatTime, initials, percent } from '../lib/format'

export default function EventTable({ events = [] }) {
  if (!events.length) {
    return (
      <div className="table-empty">
        <p>No events here yet.</p>
      </div>
    )
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Date</th>
            <th>Registrations</th>
            <th>Status</th>
            <th aria-label="Open event" />
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const registrations = event.registeredNum || event.registrations || 0
            const capacity = event.capacityNum || event.capacity || event.seats || 0
            const fill = percent(registrations, capacity)
            return (
              <tr key={event.id}>
                <td>
                  <Link className="event-cell" to={`/app/events/${event.id}`}>
                    <span
                      className="event-monogram"
                      style={{ '--event-color': event.color || '#2f5bff' }}
                    >
                      {event.initials || initials(event.title)}
                    </span>
                    <span className="event-cell-copy">
                      <strong>{event.title}</strong>
                      <small>{event.category || 'Uncategorised'}</small>
                    </span>
                  </Link>
                </td>
                <td>
                  <span className="table-primary">{formatDate(event.date)}</span>
                  <small className="table-secondary">{formatTime(event.time)}</small>
                </td>
                <td>
                  <div className="capacity-cell">
                    <span className="capacity-copy">
                      <strong>{registrations}</strong>
                      <small> / {capacity || '∞'}</small>
                    </span>
                    <span className="capacity-track">
                      <i style={{ width: `${fill}%` }} />
                    </span>
                  </div>
                </td>
                <td>
                  <StatusBadge status={event.status || event.approvalStatus} />
                </td>
                <td>
                  <Link className="table-link" to={`/app/events/${event.id}`} aria-label={`Open ${event.title}`}>
                    Open
                    <ArrowUpRight size={14} />
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
