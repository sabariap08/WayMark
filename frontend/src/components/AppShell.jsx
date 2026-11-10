import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.classList.toggle('nav-locked', sidebarOpen)
    return () => document.body.classList.remove('nav-locked')
  }, [sidebarOpen])

  return (
    <div className="app-frame">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="app-main">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="page-shell">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
