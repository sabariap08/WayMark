export default function StatCard({ label, value, detail, icon: Icon, tone = 'cobalt', trend }) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-card-top">
        <span className="stat-card-icon">{Icon && <Icon size={18} strokeWidth={1.8} />}</span>
        {trend && <span className={`stat-trend ${trend.direction === 'down' ? 'is-down' : ''}`}>{trend.label}</span>}
      </div>
      <div className="stat-card-body">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {detail && <span className="stat-detail">{detail}</span>}
      </div>
    </article>
  )
}
