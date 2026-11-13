import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award,
  BadgeCheck,
  Download,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EventSelect from '../components/EventSelect'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { api, errorMessage } from '../lib/api'
import { useEventScope } from '../lib/useEventScope'

const CERT_TYPES = ['Participation', 'Completion', 'Winner', 'Runner-up', 'Volunteer', 'Speaker']

export default function Certificates() {
  const { manageable, loading: scopeLoading, error: scopeError, reload: reloadScope, canManage } =
    useEventScope()
  const [eventId, setEventId] = useState('')
  const [certificates, setCertificates] = useState([])
  const [eligibility, setEligibility] = useState([])
  const [type, setType] = useState(CERT_TYPES[0])
  const [query, setQuery] = useState('')
  const [credential, setCredential] = useState('')
  const [verification, setVerification] = useState(null)
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

  async function reloadCertificates() {
    setLoading(true)
    setError('')
    try {
      if (canManage) {
        if (!eventId) {
          setCertificates([])
          setEligibility([])
          return
        }
        const [certs, eligible] = await Promise.all([
          api.certificates.list({ eventId }),
          api.events.eligibility(eventId).catch(() => []),
        ])
        setCertificates(Array.isArray(certs) ? certs : [])
        setEligibility(Array.isArray(eligible) ? eligible : [])
      } else {
        const certs = await api.certificates.mine()
        setCertificates(Array.isArray(certs) ? certs : [])
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reloadCertificates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, eventId])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return certificates
    return certificates.filter((row) =>
      [row.recipientName, row.credentialId, row.type, row.status, row.issuer]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [certificates, query])

  const stats = useMemo(() => {
    const valid = certificates.filter((row) => row.status === 'Valid').length
    const withdrawn = certificates.filter((row) => row.status === 'Withdrawn').length
    const recipients = new Set(certificates.map((row) => row.recipientId || row.recipientName)).size
    return { total: certificates.length, valid, withdrawn, recipients }
  }, [certificates])

  const pendingEligible = eligibility.filter((row) => row.eligible)

  async function issueEligible() {
    setBusy('eligible')
    setActionError('')
    setNotice('')
    try {
      const result = await api.events.issueEligible(eventId, { type })
      setNotice(`${result.issued || 0} certificate(s) issued for ${type.toLowerCase()}.`)
      await reloadCertificates()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function issueOne(row) {
    setBusy(row.registrationId)
    setActionError('')
    setNotice('')
    try {
      await api.certificates.issue({
        eventId,
        recipientId: row.userId,
        recipientName: row.name,
        registrationId: row.registrationId,
        type,
      })
      setNotice(`Certificate issued to ${row.name || 'participant'}.`)
      await reloadCertificates()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function withdraw(row) {
    if (!window.confirm(`Withdraw certificate ${row.credentialId}?`)) return
    setBusy(row.id)
    setActionError('')
    setNotice('')
    try {
      await api.certificates.withdraw(row.id, { reason: 'Withdrawn from certificates workspace' })
      setNotice('Certificate withdrawn.')
      await reloadCertificates()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function verify(event) {
    event.preventDefault()
    if (!credential.trim()) return
    setBusy('verify')
    setVerification(null)
    try {
      const result = await api.certificates.verify(credential.trim())
      setVerification(result)
    } catch (err) {
      setVerification({ valid: false, message: errorMessage(err) })
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

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Certificates"
        description={
          canManage
            ? 'Issue, review, and withdraw credentials for your events.'
            : 'Your credentials, ready to download and share.'
        }
        actions={
          <Link className="btn btn-secondary" to="/app/events">
            View events
          </Link>
        }
      />

      {(notice || actionError) && (
        <div className={`alert ${actionError ? 'alert-error' : 'alert-success'}`}>
          {actionError || notice}
        </div>
      )}

      {canManage && (
        <section className="toolbar">
          <EventSelect
            events={manageable}
            value={eventId}
            onChange={setEventId}
            label="Event"
            placeholder="Select an event"
          />
          <div className="toolbar-filters">
            <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Certificate type">
              {CERT_TYPES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={issueEligible}
              disabled={!eventId || busy === 'eligible' || !pendingEligible.length}
            >
              <Sparkles size={15} />
              {busy === 'eligible' ? 'Issuing...' : `Issue eligible (${pendingEligible.length})`}
            </button>
          </div>
        </section>
      )}

      <div className="stat-grid">
        <StatCard label="Certificates" value={String(stats.total)} detail="Issued credentials" icon={Award} tone="cobalt" />
        <StatCard label="Valid" value={String(stats.valid)} detail="Ready to verify" icon={BadgeCheck} tone="green" />
        <StatCard label="Recipients" value={String(stats.recipients)} detail="Unique people" icon={ShieldCheck} tone="teal" />
        <StatCard label="Withdrawn" value={String(stats.withdrawn)} detail="No longer valid" icon={XCircle} tone="rose" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">{canManage ? 'Issued credentials' : 'Your credentials'}</span>
            <h2>Certificate register</h2>
          </div>
          <div className="toolbar-search panel-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipients or credential IDs"
              aria-label="Search certificates"
            />
          </div>
        </div>

        {loading ? (
          <div className="skeleton skeleton-panel" />
        ) : error ? (
          <ErrorState message={error} onRetry={reloadCertificates} />
        ) : filtered.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Credential</th>
                  <th>Issued</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="table-stack">
                        <strong>{row.recipientName || 'Recipient'}</strong>
                        <small>{row.issuer || 'WayMark Events'}</small>
                      </div>
                    </td>
                    <td>{row.eventTitle || '—'}</td>
                    <td>{row.type || 'Participation'}</td>
                    <td>
                      <code className="ticket-code-inline">{row.credentialId}</code>
                    </td>
                    <td>{row.issueDate || '—'}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      <div className="row-actions-cell">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigator.clipboard?.writeText(row.credentialId)}
                        >
                          Copy ID
                        </button>
                        {canManage && row.status === 'Valid' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => withdraw(row)}
                            disabled={busy === row.id}
                          >
                            Withdraw
                          </button>
                        )}
                        {row.eventId && (
                          <Link className="text-link" to={`/app/events/${row.eventId}`}>
                            Event
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
            icon={Award}
            title={canManage ? 'No certificates for this event yet' : 'No certificates yet'}
            description={
              canManage
                ? 'Use “Issue eligible” to generate credentials for attendees who meet the criteria.'
                : 'Certificates you earn will appear here with a verifiable credential ID.'
            }
          />
        )}
      </section>

      {canManage && eventId && pendingEligible.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Eligibility</span>
              <h2>Ready to issue</h2>
            </div>
            <span className="panel-chip">{pendingEligible.length} eligible</span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Registration</th>
                  <th>Reason</th>
                  <th aria-label="Issue" />
                </tr>
              </thead>
              <tbody>
                {pendingEligible.slice(0, 20).map((row) => (
                  <tr key={row.registrationId}>
                    <td>
                      <div className="table-stack">
                        <strong>{row.name || 'Participant'}</strong>
                        <small>{row.email || ''}</small>
                      </div>
                    </td>
                    <td>{row.status || '—'}</td>
                    <td>
                      <span className="table-note">
                        {(row.reasons || []).join(', ') || 'Meets the certificate criteria'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => issueOne(row)}
                        disabled={busy === row.registrationId}
                      >
                        <Download size={14} /> Issue
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel verify-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Public verification</span>
            <h2>Verify a credential</h2>
          </div>
          <ShieldCheck size={18} />
        </div>
        <form className="verify-form" onSubmit={verify}>
          <div className="input-wrap">
            <Search size={16} />
            <input
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              placeholder="Enter a credential ID, e.g. WM-XXXX-XXXX"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy === 'verify' || !credential.trim()}>
            {busy === 'verify' ? 'Checking...' : 'Verify'}
          </button>
        </form>
        {verification && (
          <div className={`verify-result ${verification.valid ? 'is-valid' : 'is-invalid'}`}>
            {verification.valid ? <BadgeCheck size={18} /> : <XCircle size={18} />}
            <div>
              <strong>{verification.valid ? 'Valid certificate' : 'Not valid'}</strong>
              <span>
                {verification.certificate
                  ? `${verification.certificate.recipientName} · ${verification.certificate.eventTitle}`
                  : verification.message || 'No matching credential found.'}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
