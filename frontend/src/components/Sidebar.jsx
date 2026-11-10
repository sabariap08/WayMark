import { NavLink } from 'react-router-dom'
import { ArrowUpRight, Sparkles, X } from 'lucide-react'
import Brand from './Brand'
import Avatar from './Avatar'
import { navigation, utilityNavigation } from './navigation'
import { useAuth } from '../context/AuthContext'

function NavItem({ item, onNavigate }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => `side-link ${isActive ? 'is-active' : ''}`}
    >
      <Icon size={17} strokeWidth={1.8} />
      <span>{item.label}</span>
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth()

  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-head">
        <Brand to="/app" inverted />
        <button type="button" className="icon-button sidebar-close" onClick={onClose} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>

      <div className="workspace-chip">
        <span className="workspace-avatar">W</span>
        <span className="workspace-copy">
          <strong>WayMark Studio</strong>
          <small>Prototype workspace</small>
        </span>
        <span className="workspace-plan">Demo</span>
      </div>

      <nav className="side-nav" aria-label="Primary navigation">
        {navigation.map((group) => (
          <div className="side-group" key={group.label}>
            <span className="side-label">{group.label}</span>
            {group.items.map((item) => (
              <NavItem key={item.to} item={item} onNavigate={onClose} />
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="side-note">
          <span className="side-note-icon">
            <Sparkles size={15} />
          </span>
          <div>
            <strong>New design system</strong>
            <p>Core workflows are live. The remaining modules are rolling out next.</p>
          </div>
          <ArrowUpRight size={14} className="side-note-arrow" />
        </div>

        <div className="side-user">
          <Avatar name={user?.name || 'WayMark User'} size="sm" />
          <span className="side-user-copy">
            <strong>{user?.name || 'WayMark User'}</strong>
            <small>{user?.isAdmin || user?.roleKey === 'admin' ? 'Administrator' : 'Workspace member'}</small>
          </span>
        </div>

        <div className="side-utility">
          {utilityNavigation.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onClose} />
          ))}
        </div>
      </div>
    </aside>
  )
}
