import { initials } from '../lib/format'

const tones = ['cobalt', 'plum', 'teal', 'amber', 'rose']

export default function Avatar({ name, size = 'md', tone, className = '' }) {
  const seed = String(name || 'WayMark')
    .split('')
    .reduce((total, letter) => total + letter.charCodeAt(0), 0)
  const selected = tone || tones[seed % tones.length]

  return (
    <span className={`avatar avatar-${size} avatar-${selected} ${className}`.trim()} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
