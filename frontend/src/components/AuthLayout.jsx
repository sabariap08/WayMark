import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Sparkles } from 'lucide-react'
import Brand from './Brand'

export default function AuthLayout({ children }) {
  return (
    <div className="auth-frame">
      <aside className="auth-aside">
        <Brand to="/" inverted />
        <div className="auth-aside-body">
          <span className="auth-pill">
            <Sparkles size={14} />
            The event operating system
          </span>
          <h1>Run the whole event from one calm place.</h1>
          <p>
            Registration, scheduling, volunteers, judging, certificates, and reporting. One
            workspace, shared by every team.
          </p>
          <ul className="auth-points">
            <li>
              <Check size={14} /> Built for admins, hosts, and participants
            </li>
            <li>
              <Check size={14} /> Demo data seeded on first run
            </li>
            <li>
              <Check size={14} /> No build step for the backend
            </li>
          </ul>
        </div>
        <div className="auth-aside-foot">
          <span>WayMark Studio</span>
          <span>Prototype workspace</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Brand to="/" />
        </div>
        <Link className="auth-back" to="/">
          <ArrowLeft size={15} />
          Back to site
        </Link>
        {children}
      </main>
    </div>
  )
}
