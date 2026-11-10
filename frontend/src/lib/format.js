export function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value, options = {}) {
  const date = parseDate(value)
  if (!date) return value || 'Date TBA'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(date)
}

export function formatShortDate(value) {
  const date = parseDate(value)
  if (!date) return value || 'TBA'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date)
}

export function formatTime(value) {
  if (!value) return 'Time TBA'
  const match = String(value).match(/^(\d{1,2}):(\d{2})/)
  if (!match) return value
  const date = new Date()
  date.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return new Intl.NumberFormat('en', { notation: number >= 10000 ? 'compact' : 'standard' }).format(number)
}

export function initials(name, fallback = 'WM') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return fallback
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function percent(value, total) {
  const numerator = Number(value)
  const denominator = Number(total)
  if (!denominator || !Number.isFinite(numerator)) return 0
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100)))
}

export function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function todayLabel() {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

export function statusTone(status) {
  const value = String(status || '').toLowerCase()
  if (['published', 'registration open', 'confirmed', 'active', 'valid', 'checked in', 'completed'].some((item) => value.includes(item))) {
    return 'success'
  }
  if (['pending', 'awaiting', 'waitlisted', 'offered', 'draft', 'submitted'].some((item) => value.includes(item))) {
    return 'warning'
  }
  if (['cancelled', 'rejected', 'failed', 'suspended', 'no-show', 'revoked'].some((item) => value.includes(item))) {
    return 'danger'
  }
  return 'neutral'
}
