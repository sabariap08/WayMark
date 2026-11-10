import { Link } from 'react-router-dom'

export default function Brand({ to = '/', inverted = false, compact = false }) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!compact && <span className="brand-word">WayMark</span>}
    </>
  )

  if (!to) return <span className={`brand ${inverted ? 'brand-inverted' : ''}`}>{content}</span>

  return (
    <Link to={to} className={`brand ${inverted ? 'brand-inverted' : ''}`} aria-label="WayMark home">
      {content}
    </Link>
  )
}
