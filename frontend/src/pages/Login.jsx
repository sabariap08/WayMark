import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../lib/api'

export default function Login() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const destination = location.state?.from || '/app'

  useEffect(() => {
    document.title = 'Sign in · WayMark'
  }, [])

  useEffect(() => {
    if (!loading && user) navigate(destination, { replace: true })
  }, [destination, loading, navigate, user])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(identifier.trim(), password)
      navigate(destination, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function useDemoAccount(email, demoPassword) {
    setIdentifier(email)
    setPassword(demoPassword)
    setError('')
    setBusy(true)
    try {
      await login(email, demoPassword)
      navigate(destination, { replace: true })
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
          <span className="eyebrow">Welcome back</span>
          <h2>Sign in to WayMark</h2>
          <p>Pick up where your team left off.</p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Email or username</span>
            <span className="input-wrap">
              <Mail size={16} />
              <input
                type="text"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="you@company.com"
                autoComplete="username"
                required
                autoFocus
              />
            </span>
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <span className="input-wrap">
              <LockKeyhole size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
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

          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="auth-divider">
          <span>or try the demo</span>
        </div>

        <div className="demo-grid">
          <button type="button" className="demo-card" onClick={() => useDemoAccount('user@baymark.com', 'user@123')} disabled={busy}>
            <span className="demo-avatar">U</span>
            <span>
              <strong>Normal user</strong>
              <small>user@baymark.com</small>
            </span>
          </button>
          <button type="button" className="demo-card" onClick={() => useDemoAccount('admin@baymark.com', 'admin@123')} disabled={busy}>
            <span className="demo-avatar is-admin">A</span>
            <span>
              <strong>Administrator</strong>
              <small>admin@baymark.com</small>
            </span>
          </button>
        </div>

        <p className="auth-switch">
          New to WayMark? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
