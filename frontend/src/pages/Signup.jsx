import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, User } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../lib/api'

export default function Signup() {
  const { user, loading, signup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Create account · WayMark'
  }, [])

  useEffect(() => {
    if (!loading && user) navigate('/app', { replace: true })
  }, [loading, navigate, user])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (form.password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }
    if (form.password !== form.confirm) {
      setError('The passwords do not match.')
      return
    }

    setBusy(true)
    try {
      await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      navigate('/app', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-heading">
          <span className="eyebrow">Start here</span>
          <h2>Create your account</h2>
          <p>Your workspace is ready as soon as you sign in.</p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Full name</span>
            <span className="input-wrap">
              <User size={16} />
              <input
                type="text"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="Maya Kapoor"
                autoComplete="name"
                required
                autoFocus
              />
            </span>
          </label>

          <label className="field">
            <span className="field-label">Work email</span>
            <span className="input-wrap">
              <Mail size={16} />
              <input
                type="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </span>
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <span className="input-wrap">
              <LockKeyhole size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          <label className="field">
            <span className="field-label">Confirm password</span>
            <span className="input-wrap">
              <LockKeyhole size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.confirm}
                onChange={(event) => update('confirm', event.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
                required
              />
            </span>
          </label>

          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
            {busy ? 'Creating account...' : 'Create account'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>

        <p className="auth-legal">
          By creating an account you agree to use this prototype workspace responsibly.
        </p>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
