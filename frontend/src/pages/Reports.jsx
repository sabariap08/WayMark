import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  MessageSquareHeart,
  Trophy,
  Users,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EventSelect from '../components/EventSelect'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import ModuleAccess from '../components/ModuleAccess'
import { api, errorMessage } from '../lib/api'
import { useEventScope } from '../lib/useEventScope'

const REPORTS = [
  {
    kind: 'registrations',
    title: 'Registrations',
    description: 'Ticket, name, email, status, attendance, and registration date.',
    icon: Users,
  },
  {
    kind: 'attendance',
    title: 'Attendance',
    description: 'Every check-in with session, method, and timestamp.',
    icon: ClipboardCheck,
  },
  {
    kind: 'results',
    title: 'Results',
    description: 'Ranked teams, projects, scores, spreads, and awards.',
    icon: Trophy,
  },
  {
    kind: 'feedback',
    title: 'Feedback',
    description: 'Ratings, written feedback, and recommendation flags.',
    icon: MessageSquareHeart,
  },
  {
    kind: 'certificates',
    title: 'Certificates',
    description: 'Recipients, credential IDs, issue dates, and status.',
    icon: Award,
  },
  {
    kind: 'submissions',
    title: 'Submissions',
    description: 'Team projects, tracks, status, and average scores.',
    icon: FileText,
  },
]

const FORMATS = ['csv', 'xlsx', 'pdf']

export default function Reports() {
  const { manageable, loading: scopeLoading, error: scopeError, reload: reloadScope, canManage } =
    useEventScope()
  const [eventId, setEventId] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (canManage && !eventId && manageable.length) {
      setEventId(String(manageable[0].id))
    }
  }, [canManage, manageable, eventId])

  async function download(kind, format) {
    if (!eventId) return
    setBusy(`${kind}-${format}`)
    setActionError('')
    setNotice('')
    try {
      const name = await api.reports.download(eventId, kind, format)
      setNotice(`Downloaded ${name}.`)
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
          eyebrow="Insight"
          title="Reports"
          description="Export registrations, attendance, results, feedback, certificates, and submissions."
        />
        <ModuleAccess
          title="Reports are for event hosts"
          description="Only an event host or administrator can export event reports."
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
        title="Reports"
        description="Export the data your team, sponsors, and auditors need — in one click."
      />

      <section className="toolbar">
        <EventSelect
          events={manageable}
          value={eventId}
          onChange={setEventId}
          label="Event"
          placeholder="Select an event"
        />
        {eventId && <span className="toolbar-note">CSV, Excel, and PDF available</span>}
      </section>

      {(notice || actionError) && (
        <div className={`alert ${actionError ? 'alert-error' : 'alert-success'}`}>
          {actionError || notice}
        </div>
      )}

      {!eventId ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Select an event"
          description="Choose an event to export its reports."
        />
      ) : (
        <div className="report-grid">
          {REPORTS.map((report) => {
            const Icon = report.icon
            return (
              <article className="report-card" key={report.kind}>
                <div className="report-card-head">
                  <span className="report-icon">
                    <Icon size={19} />
                  </span>
                  <div>
                    <h2>{report.title}</h2>
                    <p>{report.description}</p>
                  </div>
                </div>
                <div className="report-actions">
                  {FORMATS.map((format) => (
                    <button
                      key={format}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => download(report.kind, format)}
                      disabled={busy === `${report.kind}-${format}`}
                    >
                      <Download size={13} />
                      {busy === `${report.kind}-${format}` ? 'Preparing…' : format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <section className="panel panel-muted">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Note</span>
            <h2>Report contents reflect recorded data</h2>
          </div>
        </div>
        <p className="panel-empty">
          Each export is generated directly from the database for the selected event. Empty
          sections appear as headers only; nothing is estimated or back-filled.
        </p>
      </section>
    </div>
  )
}
