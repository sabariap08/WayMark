import { useEffect, useState } from 'react'
import {
  KeyRound,
  Mail,
  Save,
  Settings2,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import ErrorState from '../components/ErrorState'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const TEXT_FIELDS = [
  { key: 'platformName', label: 'Platform name', hint: 'Shown across the workspace.' },
  { key: 'supportEmail', label: 'Support email', hint: 'Where participants reach your team.' },
  { key: 'timezone', label: 'Timezone', hint: 'Used for scheduling defaults.' },
  { key: 'defaultRubricName', label: 'Default rubric', hint: 'Applied to new judging rounds.' },
  { key: 'certificateIssuer', label: 'Certificate issuer', hint: 'Printed on every certificate.' },
]

const TOGGLE_FIELDS = [
  { key: 'maintenanceMode', label: 'Maintenance mode', hint: 'Temporarily pause the workspace.' },
  { key: 'allowSelfSignup', label: 'Allow self signup', hint: 'Let people create accounts.' },
  { key: 'autoApproveEvents', label: 'Auto-approve events', hint: 'Skip manual review for new events.' },
  { key: 'emailNotifications', label: 'Email notifications', hint: 'Send transactional email.' },
  { key: 'smsReminders', label: 'SMS reminders', hint: 'Send shift and session reminders.' },
]

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="toggle-field">
      <span className="toggle-copy">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <span className={`toggle ${checked ? 'is-on' : ''}`}>
        <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
        <i aria-hidden="true" />
      </span>
    </label>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(Boolean(user?.isAdmin))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  const [resetCode, setResetCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [codeSent, setCodeSent] = useState(false)

  async function load() {
    if (!user?.isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      setSettings(await api.admin.settings())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.isAdmin])

  function update(field, value) {
    setSettings((current) => ({ ...(current || {}), [field]: value }))
  }

  async function save(event) {
    event.preventDefault()
    if (!settings) return
    setBusy('save')
    setActionError('')
    setNotice('')
    try {
      const payload = {}
      TEXT_FIELDS.forEach((field) => {
        payload[field.key] = settings[field.key]
      })
      TOGGLE_FIELDS.forEach((field) => {
        payload[field.key] = Boolean(settings[field.key])
      })
      const updated = await api.admin.updateSettings(payload)
      setSettings(updated)
      setNotice('Platform settings saved.')
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function requestCode() {
    if (!user?.email) return
    setBusy('code')
    setActionError('')
    setNotice('')
    try {
      const result = await api.auth.requestPasswordReset(user.email)
      setCodeSent(true)
      setNotice(
        result?.otpFallback
          ? `Email is not configured locally — use the dev code ${result.otpFallback}.`
          : result?.message || 'Reset code sent to your email.',
      )
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function resetPassword(event) {
    event.preventDefault()
    if (password.length < 8) {
      setActionError('Choose a password with at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setActionError('The two passwords do not match.')
      return
    }
    setBusy('reset')
    setActionError('')
    setNotice('')
    try {
      await api.auth.confirmPasswordReset({
        email: user?.email,
        code: resetCode,
        password,
      })
      setResetCode('')
      setPassword('')
      setConfirm('')
      setCodeSent(false)
      setNotice('Password updated. Use the new password next time you sign in.')
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Utility"
        title="Settings"
        description={
          user?.isAdmin
            ? 'Platform defaults, notifications, and your own account security.'
            : 'Your account details and password security.'
        }
      />

      {(notice || actionError) && (
        <div
          className={`alert ${actionError ? 'alert-error' : 'alert-success'}`}
          role={actionError ? 'alert' : 'status'}
        >
          {actionError || notice}
        </div>
      )}

      {user?.isAdmin && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Platform</span>
              <h2>
                <Settings2 size={18} /> Workspace settings
              </h2>
            </div>
            {settings?.emailConfigured === false && (
              <span className="panel-chip panel-chip-warn">Email not configured</span>
            )}
          </div>

          {loading ? (
            <div className="skeleton skeleton-panel" />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <form className="module-form" onSubmit={save}>
              <div className="form-grid form-grid-2">
                {TEXT_FIELDS.map((field) => (
                  <label className="form-field" key={field.key}>
                    <span>{field.label}</span>
                    <input
                      value={settings?.[field.key] ?? ''}
                      onChange={(event) => update(field.key, event.target.value)}
                    />
                    <small className="field-hint">{field.hint}</small>
                  </label>
                ))}
              </div>

              <div className="toggle-grid">
                {TOGGLE_FIELDS.map((field) => (
                  <Toggle
                    key={field.key}
                    label={field.label}
                    hint={field.hint}
                    checked={settings?.[field.key]}
                    onChange={(value) => update(field.key, value)}
                  />
                ))}
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy === 'save'}>
                  <Save size={15} />
                  {busy === 'save' ? 'Saving...' : 'Save settings'}
                </button>
                {settings?.smtpFrom && (
                  <span className="form-note">
                    <Mail size={14} /> Sending as {settings.smtpFrom}
                  </span>
                )}
              </div>
            </form>
          )}
        </section>
      )}

      <div className="module-columns">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Account</span>
              <h2>
                <UserRound size={18} /> Profile
              </h2>
            </div>
            {user?.isAdmin && <span className="panel-chip">Administrator</span>}
          </div>
          <div className="profile-list">
            <div className="profile-row">
              <span>Name</span>
              <strong>{user?.name || '—'}</strong>
            </div>
            <div className="profile-row">
              <span>Email</span>
              <strong>{user?.email || '—'}</strong>
            </div>
            <div className="profile-row">
              <span>Role</span>
              <strong>{user?.isAdmin ? 'Admin' : 'Member'}</strong>
            </div>
            <div className="profile-row">
              <span>Access</span>
              <strong>
                <ShieldCheck size={14} /> {user?.isAdmin ? 'Full platform access' : 'Personal workspace access'}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Security</span>
              <h2>
                <KeyRound size={18} /> Change password
              </h2>
            </div>
          </div>
          <form className="module-form" onSubmit={resetPassword}>
            <div className="form-field">
              <span>Reset code</span>
              <div className="code-row">
                <input
                  value={resetCode}
                  onChange={(event) => setResetCode(event.target.value)}
                  placeholder="6-digit code"
                  aria-label="Reset code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={requestCode}
                  disabled={busy === 'code'}
                >
                  {busy === 'code' ? 'Sending...' : codeSent ? 'Resend' : 'Send code'}
                </button>
              </div>
            </div>
            <label className="form-field">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="form-field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy === 'reset'}>
                {busy === 'reset' ? 'Updating...' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
