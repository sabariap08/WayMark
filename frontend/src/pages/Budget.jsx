import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Banknote,
  PiggyBank,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EventSelect from '../components/EventSelect'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import ModuleAccess from '../components/ModuleAccess'
import { api, errorMessage } from '../lib/api'
import { percent } from '../lib/format'
import { useEventScope } from '../lib/useEventScope'

const KINDS = ['Expense', 'Sponsorship', 'Revenue', 'Adjustment']

const EMPTY_LINE = {
  description: '',
  kind: 'Expense',
  amount: '',
  categoryId: '',
  date: '',
}

const EMPTY_CATEGORY = { name: '', planned: '' }

export default function Budget() {
  const { manageable, loading: scopeLoading, error: scopeError, reload: reloadScope, canManage } =
    useEventScope()
  const [eventId, setEventId] = useState('')
  const [summary, setSummary] = useState(null)
  const [categories, setCategories] = useState([])
  const [lines, setLines] = useState([])
  const [sponsors, setSponsors] = useState([])
  const [lineForm, setLineForm] = useState(EMPTY_LINE)
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (canManage && !eventId && manageable.length) {
      setEventId(String(manageable[0].id))
    }
  }, [canManage, manageable, eventId])

  async function load() {
    if (!canManage || !eventId) return
    setLoading(true)
    setError('')
    try {
      const [summaryData, categoryRows, lineRows, sponsorRows] = await Promise.all([
        api.budget.summary(eventId),
        api.budget.categories(eventId).catch(() => []),
        api.budget.lines(eventId).catch(() => []),
        api.budget.sponsors(eventId).catch(() => []),
      ])
      setSummary(summaryData)
      setCategories(Array.isArray(categoryRows) ? categoryRows : [])
      setLines(Array.isArray(lineRows) ? lineRows : [])
      setSponsors(Array.isArray(sponsorRows) ? sponsorRows : [])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, eventId])

  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  function updateLine(field, value) {
    setLineForm((current) => ({ ...current, [field]: value }))
  }

  function updateCategory(field, value) {
    setCategoryForm((current) => ({ ...current, [field]: value }))
  }

  async function addLine(event) {
    event.preventDefault()
    if (!lineForm.description.trim() || !lineForm.amount) {
      setActionError('Add a description and amount for the budget line.')
      return
    }
    setBusy('line')
    setActionError('')
    setNotice('')
    try {
      await api.budget.createLine(eventId, {
        ...lineForm,
        amount: Number(lineForm.amount),
      })
      setLineForm(EMPTY_LINE)
      setNotice('Budget line recorded.')
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function addCategory(event) {
    event.preventDefault()
    if (!categoryForm.name.trim()) {
      setActionError('Give the category a name.')
      return
    }
    setBusy('category')
    setActionError('')
    setNotice('')
    try {
      await api.budget.createCategory(eventId, {
        name: categoryForm.name,
        planned: Number(categoryForm.planned) || 0,
      })
      setCategoryForm(EMPTY_CATEGORY)
      setNotice('Budget category created.')
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function removeLine(line) {
    if (!window.confirm(`Delete “${line.description}”?`)) return
    setBusy(line.id)
    try {
      await api.budget.removeLine(line.id)
      setNotice('Budget line removed.')
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
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
          eyebrow="Operations"
          title="Budget"
          description="Budget lines, scenarios, sponsors, and sponsor reporting."
        />
        <ModuleAccess
          title="Budgets are managed by hosts"
          description="Only an event host or administrator can plan and track an event budget."
          action={
            <Link className="btn btn-secondary" to="/app/events">
              View events
            </Link>
          }
        />
      </div>
    )
  }

  const planned = summary?.plannedTotal
  const actual = summary?.actualTotal
  const remaining = summary?.remaining
  const currency = summary?.currency || 'INR'
  const utilisation = summary?.utilisationPercent || 0

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operations"
        title="Budget"
        description="Plan the money, track actuals, and report to sponsors with confidence."
        actions={
          <Link className="btn btn-secondary" to={`/app/events/${eventId || ''}`}>
            Open event
          </Link>
        }
      />

      <section className="toolbar">
        <EventSelect
          events={manageable}
          value={eventId}
          onChange={setEventId}
          label="Event"
          placeholder="Select an event"
        />
        {summary && <span className="toolbar-note">Currency: {currency}</span>}
      </section>

      {(notice || actionError) && (
        <div className={`alert ${actionError ? 'alert-error' : 'alert-success'}`}>
          {actionError || notice}
        </div>
      )}

      {!eventId ? (
        <EmptyState
          icon={Wallet}
          title="Select an event"
          description="Choose an event to open its budget plan."
        />
      ) : loading ? (
        <div className="skeleton skeleton-panel" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Planned" value={planned?.formatted || '—'} detail="Approved budget" icon={PiggyBank} tone="cobalt" />
            <StatCard label="Actual" value={actual?.formatted || '—'} detail={`${utilisation}% utilised`} icon={Receipt} tone="amber" />
            <StatCard label="Remaining" value={remaining?.formatted || '—'} detail="Available balance" icon={Banknote} tone={Number(remaining?.amount) < 0 ? 'rose' : 'green'} />
            <StatCard label="Variance" value={summary?.variance?.formatted || '—'} detail={`${summary?.variancePercent ?? 0}% vs plan`} icon={Number(summary?.varianceMinor) < 0 ? TrendingDown : TrendingUp} tone={Number(summary?.varianceMinor) < 0 ? 'rose' : 'teal'} />
          </div>

          <div className="budget-progress panel">
            <div className="budget-progress-head">
              <div>
                <span className="eyebrow">Utilisation</span>
                <h2>Budget health</h2>
              </div>
              <strong>{utilisation}%</strong>
            </div>
            <span className="capacity-track capacity-track-lg">
              <i style={{ width: `${Math.min(100, utilisation)}%` }} />
            </span>
            <div className="budget-progress-foot">
              <span>{actual?.formatted || '—'} spent</span>
              <span>{planned?.formatted || '—'} planned</span>
            </div>
          </div>

          <div className="module-columns">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Spend</span>
                  <h2>Record a budget line</h2>
                </div>
              </div>
              <form className="module-form" onSubmit={addLine}>
                <div className="form-grid form-grid-2">
                  <label className="form-field">
                    <span>Description</span>
                    <input
                      value={lineForm.description}
                      onChange={(event) => updateLine('description', event.target.value)}
                      placeholder="Venue deposit"
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Amount ({currency})</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={lineForm.amount}
                      onChange={(event) => updateLine('amount', event.target.value)}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Kind</span>
                    <select value={lineForm.kind} onChange={(event) => updateLine('kind', event.target.value)}>
                      {KINDS.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Category</span>
                    <select
                      value={lineForm.categoryId}
                      onChange={(event) => updateLine('categoryId', event.target.value)}
                    >
                      <option value="">Uncategorised</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Date</span>
                    <input type="date" value={lineForm.date} onChange={(event) => updateLine('date', event.target.value)} />
                  </label>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy === 'line'}>
                    <Plus size={15} />
                    {busy === 'line' ? 'Saving...' : 'Add line'}
                  </button>
                </div>
              </form>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Structure</span>
                  <h2>Budget categories</h2>
                </div>
              </div>
              <form className="module-form module-form-inline" onSubmit={addCategory}>
                <label className="form-field">
                  <span>Category name</span>
                  <input
                    value={categoryForm.name}
                    onChange={(event) => updateCategory('name', event.target.value)}
                    placeholder="Logistics"
                  />
                </label>
                <label className="form-field">
                  <span>Planned</span>
                  <input
                    type="number"
                    min="0"
                    value={categoryForm.planned}
                    onChange={(event) => updateCategory('planned', event.target.value)}
                  />
                </label>
                <button type="submit" className="btn btn-secondary" disabled={busy === 'category'}>
                  Add
                </button>
              </form>

              {categories.length ? (
                <div className="category-bars">
                  {categories.map((category) => (
                    <div className="category-bar" key={category.id}>
                      <div className="category-bar-head">
                        <strong>{category.name}</strong>
                        <span>{category.plannedFormatted}</span>
                      </div>
                      <span className="capacity-track">
                        <i
                          style={{
                            width: `${percent(
                              category.planned,
                              summary?.plannedTotal?.amount || category.planned,
                            )}%`,
                          }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="panel-empty">No categories yet. Add one to group expenses.</p>
              )}
            </section>
          </div>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Ledger</span>
                <h2>Budget lines</h2>
              </div>
              <span className="panel-chip">{lines.length} lines</span>
            </div>
            {lines.length ? (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Kind</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.description}</td>
                        <td>{categoryNames[line.categoryId] || 'Uncategorised'}</td>
                        <td>{line.kind}</td>
                        <td>{line.date || '—'}</td>
                        <td>
                          <strong>{line.amountFormatted}</strong>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeLine(line)}
                            disabled={busy === line.id}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Receipt}
                title="No budget lines yet"
                description="Record expenses, sponsorship revenue, and adjustments above."
              />
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Partners</span>
                <h2>Sponsors</h2>
              </div>
              <span className="panel-chip">{sponsors.length} partners</span>
            </div>
            {sponsors.length ? (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sponsor</th>
                      <th>Package</th>
                      <th>Promised</th>
                      <th>Received</th>
                      <th>Deliverables</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sponsors.map((sponsor) => (
                      <tr key={sponsor.id}>
                        <td>
                          <div className="table-stack">
                            <strong>{sponsor.name}</strong>
                            <small>{sponsor.contactEmail || sponsor.contactName || 'No contact'}</small>
                          </div>
                        </td>
                        <td>{sponsor.package || '—'}</td>
                        <td>{sponsor.promisedFormatted}</td>
                        <td>{sponsor.receivedFormatted}</td>
                        <td>
                          {sponsor.deliverablesDone}/{sponsor.deliverablesTotal}
                        </td>
                        <td>
                          <StatusBadge status={sponsor.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="panel-empty">No sponsors recorded for this event yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
