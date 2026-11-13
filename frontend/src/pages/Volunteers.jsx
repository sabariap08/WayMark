import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  HeartHandshake,
  Mail,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EventSelect from '../components/EventSelect'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import ModuleAccess from '../components/ModuleAccess'
import { api, errorMessage } from '../lib/api'
import { useEventScope } from '../lib/useEventScope'

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  department: '',
  responsibility: '',
  shiftDate: '',
  shiftTime: '',
}

export default function Volunteers() {
  const { manageable, loading: scopeLoading, error: scopeError, reload: reloadScope, canManage } =
    useEventScope()
  const [eventId, setEventId] = useState('')
  const [volunteers, setVolunteers] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [query, setQuery] = useState('')
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
      const rows = await api.volunteers.list({ eventId })
      setVolunteers(Array.isArray(rows) ? rows : [])
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

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return volunteers
    return volunteers.filter((row) =>
      [row.name, row.email, row.department, row.responsibility, row.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [volunteers, query])

  const stats = useMemo(() => {
    const confirmed = volunteers.filter((row) => ['Confirmed', 'Active'].includes(row.status)).length
    const invited = volunteers.filter((row) => row.status === 'Invited').length
    const departments = new Set(volunteers.map((row) => row.department).filter(Boolean)).size
    return { total: volunteers.length, confirmed, invited, departments }
  }, [volunteers])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function addVolunteer(event) {
    event.preventDefault()
    if (!form.name.trim()) {
      setActionError('Volunteer name is required.')
      return
    }
    setBusy('create')
    setActionError('')
    setNotice('')
    try {
      await api.volunteers.create({ ...form, eventId })
      setForm(EMPTY_FORM)
      setNotice('Volunteer added and invite prepared.')
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function invite(row) {
    setBusy(row.id)
    setActionError('')
    setNotice('')
    try {
      const result = await api.volunteers.invite(row.id)
      setNotice(`Invite ready for ${row.name}. ${result.inviteUrl || ''}`)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function setStatus(row, status) {
    setBusy(row.id)
    setActionError('')
    setNotice('')
    try {
      await api.volunteers.update(row.id, { status })
      setNotice(`${row.name} marked ${status.toLowerCase()}.`)
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function remove(row) {
    if (!window.confirm(`Remove ${row.name} from the volunteer team?`)) return
    setBusy(row.id)
    setActionError('')
    setNotice('')
    try {
      await api.volunteers.remove(row.id)
      setNotice('Volunteer removed.')
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
          title="Volunteers"
          description="Scoped invite links, availability, assignments, and hour tracking."
        />
        <ModuleAccess
          title="Volunteers are managed by hosts"
          description="Only an event host or administrator can build the volunteer team. Discover events to find ways to get involved."
          action={
            <Link className="btn btn-secondary" to="/app/discover">
              Discover events
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operations"
        title="Volunteers"
        description="Invite your crew, track availability, and keep every shift covered."
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
        <div className="toolbar-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search volunteers, departments, or roles"
            aria-label="Search volunteers"
          />
        </div>
      </section>

      {(notice || actionError) && (
        <div
          className={`alert ${actionError ? 'alert-error' : 'alert-success'}`}
          role={actionError ? 'alert' : 'status'}
        >
          {actionError || notice}
        </div>
      )}

      {!eventId ? (
        <EmptyState
          icon={HeartHandshake}
          title="Select an event"
          description="Choose an event to manage its volunteer team."
        />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Volunteers" value={String(stats.total)} detail="On the roster" icon={Users} tone="cobalt" />
            <StatCard label="Confirmed" value={String(stats.confirmed)} detail="Ready for shifts" icon={Check} tone="green" />
            <StatCard label="Invited" value={String(stats.invited)} detail="Awaiting response" icon={Mail} tone="amber" />
            <StatCard label="Departments" value={String(stats.departments)} detail="Teams represented" icon={HeartHandshake} tone="teal" />
          </div>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Add to team</span>
                <h2>New volunteer</h2>
              </div>
              <span className="panel-chip">Invite sent by email</span>
            </div>
            <form className="module-form" onSubmit={addVolunteer}>
              <div className="form-grid form-grid-3">
                <label className="form-field">
                  <span>Name</span>
                  <input value={form.name} onChange={(event) => update('name', event.target.value)} required />
                </label>
                <label className="form-field">
                  <span>Email</span>
                  <input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Phone</span>
                  <input value={form.phone} onChange={(event) => update('phone', event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Department</span>
                  <input value={form.department} onChange={(event) => update('department', event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Responsibility</span>
                  <input
                    value={form.responsibility}
                    onChange={(event) => update('responsibility', event.target.value)}
                    placeholder="Registration desk"
                  />
                </label>
                <label className="form-field">
                  <span>Shift date</span>
                  <input type="date" value={form.shiftDate} onChange={(event) => update('shiftDate', event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Shift time</span>
                  <input value={form.shiftTime} onChange={(event) => update('shiftTime', event.target.value)} placeholder="09:00 - 13:00" />
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy === 'create'}>
                  <UserPlus size={15} />
                  {busy === 'create' ? 'Adding...' : 'Add volunteer'}
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Roster</span>
                <h2>Volunteer team</h2>
              </div>
              <span className="panel-chip">{filtered.length} shown</span>
            </div>

            {loading ? (
              <div className="skeleton skeleton-panel" />
            ) : error ? (
              <ErrorState message={error} onRetry={load} />
            ) : filtered.length ? (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Volunteer</th>
                      <th>Role</th>
                      <th>Shift</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="table-stack">
                            <strong>{row.name}</strong>
                            <small>{row.email || row.phone || 'No contact yet'}</small>
                          </div>
                        </td>
                        <td>
                          <div className="table-stack">
                            <strong>{row.responsibility || 'General support'}</strong>
                            <small>{row.department || 'No department'}</small>
                          </div>
                        </td>
                        <td>
                          <div className="table-stack">
                            <strong>{row.shiftDate || 'Flexible'}</strong>
                            <small>{row.shiftTime || 'Time TBA'}</small>
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>
                          <div className="row-actions-cell">
                            {row.status === 'Invited' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setStatus(row, 'Confirmed')}
                                disabled={busy === row.id}
                              >
                                <Check size={13} /> Confirm
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => invite(row)}
                              disabled={busy === row.id}
                            >
                              <Send size={13} /> Invite
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => remove(row)}
                              disabled={busy === row.id}
                            >
                              <Trash2 size={13} /> Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={HeartHandshake}
                title={query ? 'No volunteers match your search' : 'No volunteers yet'}
                description={
                  query
                    ? 'Try a different name, department, or role.'
                    : 'Add your first volunteer above. They will receive a scoped invite link.'
                }
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}
