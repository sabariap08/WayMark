import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Menu, Search, Settings } from 'lucide-react'
import Avatar from './Avatar'
import { pageLabel } from './navigation'
import { useAuth } from '../context/AuthContext'

const typingTags = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export default function Topbar({ onMenu }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  const headerRef = useRef(null)

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || typingTags.has(target.tagName))

      if (event.key === '/' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    function closePopoversOutside(event) {
      const panels = headerRef.current?.querySelectorAll('details.popover[open]') || []
      panels.forEach((panel) => {
        if (!panel.contains(event.target)) panel.removeAttribute('open')
      })
    }

    function closePopoversOnEscape(event) {
      if (event.key !== 'Escape') return
      headerRef.current?.querySelectorAll('details.popover[open]').forEach((panel) => {
        panel.removeAttribute('open')
      })
    }

    document.addEventListener('pointerdown', closePopoversOutside)
    document.addEventListener('keydown', closePopoversOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closePopoversOutside)
      document.removeEventListener('keydown', closePopoversOnEscape)
    }
  }, [])

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
    <header className="topbar" ref={headerRef}>
      <div className="topbar-left">
        <button type="button" className="icon-button mobile-menu" onClick={onMenu} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="breadcrumb">
          <span>Workspace</span>
          <span className="breadcrumb-sep">/</span>
          <strong>{pageLabel(pathname)}</strong>
        </div>
      </div>

      <div className="topbar-right">
        <form className="topbar-search" onSubmit={submitSearch} role="search">
          <Search size={15} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events"
            aria-label="Search events"
            aria-keyshortcuts="/"
          />
          <kbd title="Press / to search">/</kbd>
        </form>

        <details className="popover">
          <summary className="icon-button notification-button" aria-label="Notifications">
            <Bell size={18} />
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
