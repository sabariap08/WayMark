import { Link } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="not-found">
      <span className="not-found-code">404</span>
      <span className="empty-state-icon">
        <Compass size={24} />
      </span>
      <h1>This page took a wrong turn.</h1>
      <p>The link may be out of date, or the page may have moved.</p>
      <div className="not-found-actions">
        <Link className="btn btn-primary" to="/app">
          Back to overview
        </Link>
        <Link className="btn btn-secondary" to="/app/events">
          <ArrowLeft size={15} />
          Browse events
        </Link>
      </div>
    </div>
  )
}
