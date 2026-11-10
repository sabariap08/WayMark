import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Menu, Search, Settings } from 'lucide-react'
import Avatar from './Avatar'
import { pageLabels } from './navigation'
import { useAuth } from '../context/AuthContext'

function currentLabel(pathname) {
  if (pageLabels[pathname]) return pageLabels[pathname]
  if (/^\/app\/events\/[^/]+$/.test(pathname)) return 'Event details'
  return 'Workspace'
}

export default function Topbar({ onMenu }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [query, setQuery] = useState('')

  function submitSearch(event) {
    event.preventDefault()
    const value = query.trim()
    navigate(value ? `/app/events?q=${encodeURIComponent(value)}` : '/app/events')
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-button mobile-menu" onClick={onMenu} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="breadcrumb">
          <span>Workspace</span>
          <span className="breadcrumb-sep">/</span>
          <strong>{currentLabel(pathname)}</strong>
        </div>
      </div>

      <div className="topbar-right">
        <form className="topbar-search" onSubmit={submitSearch} role="search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events"
            aria-label="Search events"
          />
          <kbd>/</kbd>
        </form>

        <details className="popover">
          <summary className="icon-button notification-button" aria-label="Notifications">
            <Bell size={18} />
            <span className="notification-dot" />
          </summary>
          <div className="popover-panel notification-panel">
            <div className="popover-head">
              <strong>Notifications</strong>
              <span>All caught up</span>
            </div>
            <p className="popover-empty">No unread updates. Activity from your events will appear here.</p>
          </div>
        </details>

        <details className="popover user-popover">
          <summary className="user-trigger">
            <Avatar name={user?.name || 'WayMark User'} size="sm" />
            <span className="user-trigger-copy">
              <strong>{user?.name || 'WayMark User'}</strong>
              <small>{user?.isAdmin || user?.roleKey === 'admin' ? 'Administrator' : 'Member'}</small>
            </span>
            <ChevronDown size={14} />
          </summary>
          <div className="popover-panel user-panel">
            <div className="user-panel-head">
              <Avatar name={user?.name || 'WayMark User'} size="md" />
              <div>
                <strong>{user?.name || 'WayMark User'}</strong>
                <span>{user?.email || 'No email available'}</span>
              </div>
            </div>
            <Link className="popover-link" to="/app/settings">
              <Settings size={15} />
              Settings
            </Link>
            <button type="button" className="popover-link danger" onClick={handleLogout}>
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}
