import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Discover from './pages/Discover'
import Hosting from './pages/Hosting'
import Participants from './pages/Participants'
import Certificates from './pages/Certificates'
import Schedule from './pages/Schedule'
import Volunteers from './pages/Volunteers'
import Tasks from './pages/Tasks'
import Budget from './pages/Budget'
import Analytics from './pages/Analytics'
import Reports from './pages/Reports'
import Audit from './pages/Audit'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="events" element={<Events />} />
        <Route path="events/:id" element={<EventDetail />} />
        <Route path="discover" element={<Discover />} />
        <Route path="hosting" element={<Hosting />} />
        <Route path="participants" element={<Participants />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="volunteers" element={<Volunteers />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="budget" element={<Budget />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
