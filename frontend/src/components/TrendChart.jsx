import { useId } from 'react'
import { formatNumber } from '../lib/format'

const WIDTH = 760
const HEIGHT = 236
const PAD = { top: 20, right: 18, bottom: 34, left: 42 }

export default function TrendChart({ data = [], color = '#2f5bff' }) {
  const gradientId = useId().replace(/:/g, '')
  const rows = data.length ? data : [{ label: '—', value: 0 }]
  const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0))
  const innerWidth = WIDTH - PAD.left - PAD.right
  const innerHeight = HEIGHT - PAD.top - PAD.bottom
  const step = rows.length > 1 ? innerWidth / (rows.length - 1) : innerWidth

  const points = rows.map((row, index) => {
    const value = Number(row.value) || 0
    return {
      x: PAD.left + (rows.length > 1 ? index * step : innerWidth / 2),
      y: PAD.top + innerHeight - (value / max) * innerHeight,
      value,
      label: row.label,
    }
  })

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const baseline = PAD.top + innerHeight
  const area = `${line} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
  const grid = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Registration trend">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {grid.map((ratio) => {
          const y = PAD.top + innerHeight * ratio
          return (
            <g key={ratio}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeDasharray={ratio === 1 ? '0' : '4 6'}
              />
              <text x={PAD.left - 10} y={y + 4} textAnchor="end" className="chart-axis-value">
                {formatNumber(Math.round(max * (1 - ratio)))}
              </text>
            </g>
          )
        })}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((point) => (
          <g key={`${point.label}-${point.x}`}>
            <circle cx={point.x} cy={point.y} r="4" fill="var(--surface)" stroke={color} strokeWidth="2" />
            <text x={point.x} y={HEIGHT - 8} textAnchor="middle" className="chart-axis-label">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
