import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock3,
  ListChecks,
  Plus,
  Trash2,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EventSelect from '../components/EventSelect'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import ModuleAccess from '../components/ModuleAccess'
import { api, errorMessage } from '../lib/api'
import { formatDate } from '../lib/format'
import { useEventScope } from '../lib/useEventScope'

const COLUMNS = ['Open', 'In progress', 'Blocked', 'Done']
const PRIORITIES = ['Low', 'Normal', 'High', 'Critical']

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'Normal',
  dueAt: '',
}

export default function Tasks() {
  const { manageable, loading: scopeLoading, error: scopeError, reload: reloadScope, canManage } =
    useEventScope()
  const [eventId, setEventId] = useState('')
  const [tasks, setTasks] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
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
      const rows = await api.tasks.list(eventId)
      setTasks(Array.isArray(rows) ? rows : [])
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

  const grouped = useMemo(() => {
    const result = {}
    COLUMNS.forEach((column) => {
      result[column] = tasks.filter((task) => task.status === column)
    })
    return result
  }, [tasks])

  const stats = useMemo(() => {
    const open = tasks.filter((task) => !['Done', 'Cancelled'].includes(task.status)).length
    const done = tasks.filter((task) => task.status === 'Done').length
    const overdue = tasks.filter((task) => task.isOverdue).length
    return { total: tasks.length, open, done, overdue }
  }, [tasks])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function createTask(event) {
    event.preventDefault()
    if (!form.title.trim()) {
      setActionError('Task title is required.')
      return
    }
    setBusy('create')
    setActionError('')
    setNotice('')
    try {
      await api.tasks.create(eventId, {
        ...form,
        dueAt: form.dueAt || null,
      })
      setForm(EMPTY_FORM)
      setNotice('Task added to the board.')
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function move(task, status) {
    setBusy(task.id)
    setActionError('')
    setNotice('')
    try {
      await api.tasks.update(task.id, { status })
      setNotice(`“${task.title}” moved to ${status}.`)
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function remove(task) {
    if (!window.confirm(`Delete “${task.title}”?`)) return
    setBusy(task.id)
    setActionError('')
    setNotice('')
    try {
      await api.tasks.remove(task.id)
      setNotice('Task deleted.')
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
          title="Tasks"
          description="Task boards, dependencies, and recommendations for the event team."
        />
        <ModuleAccess
          title="Tasks are managed by hosts"
          description="Only an event host or administrator can plan tasks for an event. Explore events to find one to join."
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
        title="Tasks"
        description="Plan the work, surface blockers, and keep the team moving."
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
          icon={ListChecks}
          title="Select an event"
          description="Choose an event to open its task board."
        />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Tasks" value={String(stats.total)} detail="Across the board" icon={ListChecks} tone="cobalt" />
            <StatCard label="Open" value={String(stats.open)} detail="Still in motion" icon={CircleDot} tone="amber" />
            <StatCard label="Overdue" value={String(stats.overdue)} detail={stats.overdue ? 'Needs attention' : 'On track'} icon={AlertTriangle} tone={stats.overdue ? 'rose' : 'teal'} />
            <StatCard label="Done" value={String(stats.done)} detail="Completed tasks" icon={CheckCircle2} tone="green" />
          </div>

          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Quick add</span>
                <h2>New task</h2>
              </div>
            </div>
            <form className="module-form" onSubmit={createTask}>
              <div className="form-grid form-grid-3">
                <label className="form-field">
                  <span>Title</span>
                  <input value={form.title} onChange={(event) => update('title', event.target.value)} required />
                </label>
                <label className="form-field">
                  <span>Priority</span>
                  <select value={form.priority} onChange={(event) => update('priority', event.target.value)}>
                    {PRIORITIES.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Due date</span>
                  <input type="date" value={form.dueAt} onChange={(event) => update('dueAt', event.target.value)} />
                </label>
              </div>
              <label className="form-field">
                <span>Description</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(event) => update('description', event.target.value)}
                  placeholder="What needs to happen?"
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy === 'create'}>
                  <Plus size={15} />
                  {busy === 'create' ? 'Adding...' : 'Add task'}
                </button>
              </div>
            </form>
          </section>

          {loading ? (
            <div className="skeleton skeleton-panel" />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : tasks.length ? (
            <div className="kanban">
              {COLUMNS.map((column) => (
                <section className="kanban-column" key={column}>
                  <header className="kanban-head">
                    <h2>{column}</h2>
                    <span>{grouped[column].length}</span>
                  </header>
                  <div className="kanban-body">
                    {grouped[column].length ? (
                      grouped[column].map((task) => (
                        <article className={`task-card priority-${String(task.priority).toLowerCase()}`} key={task.id}>
                          <div className="task-card-top">
                            <StatusBadge status={task.priority} tone={task.priority === 'Critical' ? 'danger' : task.priority === 'High' ? 'warning' : 'neutral'} dot={false} />
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Delete ${task.title}`}
                              onClick={() => remove(task)}
                              disabled={busy === task.id}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <h3>{task.title}</h3>
                          {task.description && <p>{task.description}</p>}
                          <div className="task-meta">
                            {task.dueAt && (
                              <span className={task.isOverdue ? 'is-overdue' : ''}>
                                <Clock3 size={13} />
                                {formatDate(task.dueAt)}
                              </span>
                            )}
                            {task.assigneeName && <span>{task.assigneeName}</span>}
                          </div>
                          <div className="task-actions">
                            <select
                              value={task.status}
                              onChange={(event) => move(task, event.target.value)}
                              aria-label={`Move ${task.title}`}
                              disabled={busy === task.id}
                            >
                              {[...COLUMNS, 'Cancelled'].map((item) => (
                                <option key={item}>{item}</option>
                              ))}
                            </select>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="kanban-empty">Nothing here.</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ListChecks}
              title="No tasks yet"
              description="Add the first task above. Priorities, due dates, and statuses will keep work visible."
            />
          )}

          {tasks.some((task) => task.status === 'Cancelled') && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Archive</span>
                  <h2>Cancelled tasks</h2>
                </div>
              </div>
              <div className="cancelled-list">
                {tasks
                  .filter((task) => task.status === 'Cancelled')
                  .map((task) => (
                    <div className="cancelled-row" key={task.id}>
                      <span>{task.title}</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(task)}>
                        Remove
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
