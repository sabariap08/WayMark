import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ScrollText,
  Search,
  ShieldCheck,
  ShieldX,
  Users,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import ModuleAccess from '../components/ModuleAccess'
import { api, errorMessage } from '../lib/api'
import { formatDate } from '../lib/format'
import { useEventScope } from '../lib/useEventScope'

const STATUSES = ['', 'Success', 'Failed', 'Warning']

export default function Audit() {
  const { user, loading: scopeLoading, error: scopeError, reload: reloadScope, canManage } =
    useEventScope()
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(term = appliedQuery) {
    if (!canManage) return
    setLoading(true)
    setError('')
    try {
      const params = term ? { q: term } : undefined
      const payload = user?.isAdmin
        ? await api.admin.audit(params)
        : await api.audit.list(params)
      setRows(Array.isArray(payload) ? payload : [])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, user?.isAdmin])

  const filtered = useMemo(() => {
    if (!status) return rows
    return rows.filter((row) => String(row.status || '').toLowerCase() === status.toLowerCase())
  }, [rows, status])

  const stats = useMemo(() => {
    const success = rows.filter((row) => row.status === 'Success').length
    const failed = rows.filter((row) => row.status === 'Failed').length
    const actors = new Set(rows.map((row) => row.user).filter(Boolean)).size
    return { total: rows.length, success, failed, actors }
  }, [rows])

  function submitSearch(event) {
    event.preventDefault()
    const term = query.trim()
    setAppliedQuery(term)
    load(term)
  }

  if (scopeLoading) {
    return (
      <div className="page-stack">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-panel" />
      </div>
    )
  }
  if (scopeError) return <ErrorState message={scopeError} onRetry={reloadScope} />

  if (!canManage) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Insight"
          title="Audit log"
          description="A tamper-evident trail of approvals, edits, and access changes."
        />
        <ModuleAccess
          title="Audit logs are for hosts and admins"
          description="Only an event host or administrator can review the audit trail."
          action={
            <Link className="btn btn-secondary" to="/app/events">
              View events
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Insight"
        title="Audit log"
        description="Every approval, edit, and access change — recorded with actor, target, and time."
      />

      <form className="toolbar" onSubmit={submitSearch}>
        <div className="toolbar-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by action"
            aria-label="Search audit actions"
          />
        </div>
        <label className="module-select">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((item) => (
              <option key={item || 'all'} value={item}>
                {item || 'All statuses'}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      <div className="stat-grid">
        <StatCard label="Events" value={String(stats.total)} detail="Most recent entries" icon={ScrollText} tone="cobalt" />
        <StatCard label="Successful" value={String(stats.success)} detail="Completed actions" icon={ShieldCheck} tone="green" />
        <StatCard label="Failed" value={String(stats.failed)} detail="Rejected or errored" icon={ShieldX} tone="rose" />
        <StatCard label="Actors" value={String(stats.actors)} detail="Distinct users" icon={Users} tone="teal" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Trail</span>
            <h2>{user?.isAdmin ? 'Platform activity' : 'Activity'}</h2>
          </div>
          <span className="panel-chip">{filtered.length} entries</span>
        </div>

        {loading ? (
          <div className="skeleton skeleton-panel" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : filtered.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>When</th>
                  <th>IP</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="table-stack">
                        <strong>{row.action}</strong>
                        <small>{row.time || formatDate(row.timestamp, { month: 'short', day: 'numeric' })}</small>
                      </div>
                    </td>
                    <td>{row.user || 'System'}</td>
                    <td>{row.target || '—'}</td>
                    <td>{row.time || '—'}</td>
                    <td>
                      <code className="inline-code">{row.ip || '—'}</code>
                    </td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={ScrollText}
            title={appliedQuery || status ? 'No entries match these filters' : 'No audit entries yet'}
            description={
              appliedQuery || status
                ? 'Try a broader search or clear the status filter.'
                : 'Actions will appear here as hosts and admins work with events.'
            }
          />
        )}
      </section>
    </div>
  )
}
