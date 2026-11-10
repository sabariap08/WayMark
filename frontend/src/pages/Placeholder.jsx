import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Check, Clock3, Sparkles } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { placeholderDetails } from '../components/navigation'
import NotFound from './NotFound'

const nextUp = [
  'Connected to the same events, people, and workspace data',
  'Role-aware controls for admins, hosts, and members',
  'Exports, notifications, and audit history built in',
]

export default function Placeholder() {
  const { module } = useParams()
  const detail = placeholderDetails[module]

  if (!detail) return <NotFound />

  const Icon = detail.icon

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={detail.eyebrow}
        title={detail.title}
        description={detail.description}
        actions={
          <Link className="btn btn-primary" to="/app/events">
            Go to events
            <ArrowRight size={15} />
          </Link>
        }
      />

      <section className="placeholder-panel">
        <div className="placeholder-glow" />
        <span className="placeholder-icon">
          <Icon size={28} strokeWidth={1.7} />
        </span>
        <span className="eyebrow">
          <Sparkles size={14} /> Module in rollout
        </span>
        <h2>This workspace is taking shape.</h2>
        <p>
          The {detail.title.toLowerCase()} surface is being rebuilt on the new design system. The
          core event workflow is live now; this module is next in line.
        </p>
        <div className="placeholder-status">
          <Clock3 size={15} />
          <span>Core pages first. Operations and insight modules follow.</span>
        </div>
        <div className="placeholder-list">
          {nextUp.map((item) => (
            <span key={item}>
              <Check size={15} />
              {item}
            </span>
          ))}
        </div>
        <div className="placeholder-actions">
          <Link className="btn btn-primary" to="/app">
            Back to overview
          </Link>
          <Link className="btn btn-secondary" to="/app/events">
            Browse events
          </Link>
        </div>
      </section>
    </div>
  )
}
