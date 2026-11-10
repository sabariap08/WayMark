import { AlertTriangle, RotateCw } from 'lucide-react'

export default function ErrorState({ title = 'Could not load this view', message, onRetry }) {
  return (
    <div className="state-card state-error" role="alert">
      <span className="state-icon">
        <AlertTriangle size={20} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{message || 'The workspace could not reach the API. Check that the backend is running and try again.'}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          <RotateCw size={15} />
          Try again
        </button>
      )}
    </div>
  )
}
