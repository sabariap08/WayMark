import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarPlus,
  Check,
  ClipboardList,
  Clock3,
  RotateCw,
  Send,
  X,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { api, errorMessage } from '../lib/api'
import { formatDate, formatTime } from '../lib/format'
import { useAuth } from '../context/AuthContext'

const DEFAULT_FORM = {
  title: '',
  category: 'Workshop',
  date: '',
  time: '',
  location: '',
  seats: 100,
  description: '',
}

const TABS = ['All', 'Pending', 'Approved', 'Changes requested', 'Rejected', 'Cancelled']

export default function Hosting() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [categories, setCategories] = useState([])
  const [tab, setTab] = useState('All')
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')

  const reviewer = Boolean(user?.isAdmin)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [rows, meta] = await Promise.all([
        api.hosting.list(),
        api.meta.get().catch(() => null),
      ])
      setRequests(Array.isArray(rows) ? rows : [])
      const list = meta?.eventCategories || []
      if (list.length) {
        setCategories(list)
        setForm((current) =>
          list.includes(current.category) ? current : { ...current, category: list[0] },
        )
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const counts = useMemo(() => {
    const result = { All: requests.length }
    requests.forEach((row) => {
      result[row.status] = (result[row.status] || 0) + 1
    })
    return result
  }, [requests])

  const visible = useMemo(
    () => (tab === 'All' ? requests : requests.filter((row) => row.status === tab)),
    [requests, tab],
  )

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim()) {
      setActionError('Give the event a title before submitting.')
      return
    }
    setBusy('create')
    setActionError('')
    setNotice('')
    try {
      await api.hosting.create({
        ...form,
        seats: Number(form.seats) || 100,
      })
      setForm((current) => ({ ...DEFAULT_FORM, category: current.category }))
      setNotice('Hosting request submitted. An admin will review it shortly.')
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function decide(row, action) {
    const reason =
      action === 'approve'
        ? ''
        : window.prompt(
            action === 'reject'
              ? 'Reason for rejecting this request (optional):'
              : 'What changes should the requester make?',
            '',
          )
    if (reason === null) return

    setBusy(row.id)
    setActionError('')
    setNotice('')
    try {
      if (action === 'approve') {
        await api.hosting.approve(row.id, { status: 'Registration open' })
        setNotice(`Approved “${row.title}”. The event is now live.`)
      } else if (action === 'reject') {
        await api.hosting.reject(row.id, { reason })
        setNotice(`Rejected “${row.title}”.`)
      } else {
        await api.hosting.requestChanges(row.id, { reason })
        setNotice(`Change request sent for “${row.title}”.`)
      }
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function cancel(row) {
    if (!window.confirm(`Cancel the request “${row.title}”?`)) return
    setBusy(row.id)
    try {
      await api.hosting.cancel(row.id)
      setNotice('Hosting request cancelled.')
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function resubmit(row) {
    setBusy(row.id)
    try {
      await api.hosting.resubmit(row.id)
      setNotice('Request resubmitted for review.')
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <div className="page-stack">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Hosting requests"
        description={
          reviewer
            ? 'Review community submissions and turn approved requests into live events.'
            : 'Propose an event to the workspace team and track its review status.'
        }
        actions={
          <Link className="btn btn-secondary" to="/app/events">
            View events
          </Link>
        }
        meta={
          <>
            <span>{counts.Pending || 0} awaiting review</span>
            <span>{counts.Approved || 0} approved</span>
          </>
        }
      />

      {(notice || actionError) && (
        <div className={`alert ${actionError ? 'alert-error' : 'alert-success'}`}>
          {actionError || notice}
        </div>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">New submission</span>
            <h2>Host an event</h2>
          </div>
          <span className="panel-chip">Reviewed by admins</span>
        </div>
        <form className="module-form" onSubmit={submit}>
          <div className="form-grid form-grid-2">
            <label className="form-field">
              <span>Event title</span>
              <input
                value={form.title}
                onChange={(event) => update('title', event.target.value)}
                placeholder="Community design sprint"
                required
              />
            </label>
            <label className="form-field">
              <span>Category</span>
              <select value={form.category} onChange={(event) => update('category', event.target.value)}>
                {(categories.length ? categories : [form.category]).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Date</span>
              <input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} />
            </label>
            <label className="form-field">
              <span>Start time</span>
              <input type="time" value={form.time} onChange={(event) => update('time', event.target.value)} />
            </label>
            <label className="form-field">
              <span>Location</span>
              <input
                value={form.location}
                onChange={(event) => update('location', event.target.value)}
                placeholder="Hall B, Innovation Centre"
              />
            </label>
            <label className="form-field">
              <span>Seats</span>
              <input
                type="number"
                min="1"
                value={form.seats}
                onChange={(event) => update('seats', event.target.value)}
              />
            </label>
          </div>
          <label className="form-field">
            <span>Description</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
              placeholder="What is the event about, who is it for, and what should attendees expect?"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy === 'create'}>
              <Send size={15} />
              {busy === 'create' ? 'Submitting...' : 'Submit hosting request'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">{reviewer ? 'Moderation' : 'Your submissions'}</span>
            <h2>{reviewer ? 'All hosting requests' : 'Request history'}</h2>
          </div>
        </div>

        <div className="module-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? 'is-active' : ''}
              onClick={() => setTab(item)}
            >
              {item}
              <span>{counts[item] || 0}</span>
            </button>
          ))}
        </div>

        {visible.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  {reviewer && <th>Requester</th>}
                  <th>Date</th>
                  <th>Status</th>
                  <th>Decision</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="table-stack">
                        <strong>{row.title}</strong>
                        <small>{row.category || 'Event'}</small>
                      </div>
                    </td>
                    {reviewer && (
                      <td>
                        <div className="table-stack">
                          <strong>{row.requesterName || 'Member'}</strong>
                          <small>{row.requesterEmail || ''}</small>
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="table-stack">
                        <strong>{formatDate(row.date)}</strong>
                        <small>{formatTime(row.time)}</small>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      <span className="table-note">{row.decisionReason || '—'}</span>
                    </td>
                    <td>
                      <div className="row-actions-cell">
                        {reviewer && row.status === 'Pending' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => decide(row, 'approve')}
                              disabled={busy === row.id}
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => decide(row, 'changes')}
                              disabled={busy === row.id}
                            >
                              Changes
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => decide(row, 'reject')}
                              disabled={busy === row.id}
                            >
                              <X size={14} /> Reject
                            </button>
                          </>
                        )}
                        {!reviewer && !['Approved', 'Cancelled'].includes(row.status) && (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => cancel(row)}
                              disabled={busy === row.id}
                            >
                              Cancel
                            </button>
                            {['Changes requested', 'Rejected'].includes(row.status) && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => resubmit(row)}
                                disabled={busy === row.id}
                              >
                                <RotateCw size={13} /> Resubmit
                              </button>
                            )}
                          </>
                        )}
                        {row.eventId && (
                          <Link className="text-link" to={`/app/events/${row.eventId}`}>
                            Open event
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title={tab === 'All' ? 'No hosting requests yet' : `No ${tab.toLowerCase()} requests`}
            description={
              reviewer
                ? 'Community submissions will appear here for review.'
                : 'Submit the form above to propose your first event.'
            }
          />
        )}
      </section>

      <div className="module-note">
        <Clock3 size={15} />
        <span>Most reviews are completed within two working days.</span>
        <CalendarPlus size={15} />
        <span>Approved requests become live events automatically.</span>
      </div>
    </div>
  )
}
