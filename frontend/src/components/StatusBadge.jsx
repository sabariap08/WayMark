import { statusTone } from '../lib/format'

export default function StatusBadge({ status, tone, dot = true }) {
  const label = status || 'Unknown'
  return (
    <span className={`status status-${tone || statusTone(label)}`}>
      {dot && <span className="status-dot" aria-hidden="true" />}
      {label}
    </span>
  )
}
