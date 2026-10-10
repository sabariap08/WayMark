import type { CategoryData, TrendPoint } from '@/data/dashboard';

export function BarChart({ data, height = 180 }: { data: TrendPoint[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="chart-bar-wrap" style={{ height }}>
      <div className="chart-bars">
        {data.map((point) => {
          const pct = Math.round((point.value / max) * 100);
          return (
            <div className="chart-bar-col" key={point.label}>
              <div className="chart-bar-track">
                <div className="chart-bar-fill" style={{ height: `${pct}%` }}>
                  <span className="chart-bar-value">{point.value}</span>
                </div>
              </div>
              <span className="chart-bar-label">{point.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LineChart({ data, height = 180 }: { data: TrendPoint[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value)) * 0.6;
  const range = max - min || 1;
  const w = 520;
  const h = height;
  const padX = 30;
  const padY = 20;
  const stepX = (w - padX * 2) / (data.length - 1);
  const points = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = padY + (1 - (d.value - min) / range) * (h - padY * 2);
    return { x, y, ...d };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${h - padY} L ${points[0].x.toFixed(1)} ${h - padY} Z`;
  return (
    <div className="chart-line-wrap">
      <svg className="chart-line-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a8d72" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3a8d72" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#lineGradient)" />
        <path d={pathD} fill="none" stroke="#2f7a5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#2f7a5e" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div className="chart-line-labels">
        {data.map((d) => <span key={d.label}>{d.label}</span>)}
      </div>
    </div>
  );
}

export function DonutChart({ data, size = 160 }: { data: CategoryData[]; size?: number }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = size / 2 - 14;
  const center = size / 2;
  let offset = 0;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="chart-donut-wrap">
      <svg className="chart-donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d) => {
          const portion = d.value / total;
          const dash = portion * circumference;
          const segment = (
            <circle
              key={d.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth="18"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${center} ${center})`}
            />
          );
          offset += dash;
          return segment;
        })}
        <text x={center} y={center - 4} textAnchor="middle" className="donut-total">{total}</text>
        <text x={center} y={center + 14} textAnchor="middle" className="donut-label">Total</text>
      </svg>
      <div className="donut-legend">
        {data.map((d) => (
          <div className="donut-legend-item" key={d.label}>
            <span className="donut-dot" style={{ background: d.color }} />
            <span className="donut-legend-label">{d.label}</span>
            <strong>{d.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
