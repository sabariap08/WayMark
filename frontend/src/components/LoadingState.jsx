export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

export default function LoadingState({ full = false, label = 'Loading workspace' }) {
  return (
    <div className={`loading-state ${full ? 'loading-full' : ''}`} role="status">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  )
}
