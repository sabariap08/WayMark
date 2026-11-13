import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import LoadingState from './components/LoadingState'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Events = lazy(() => import('./pages/Events'))
const EventDetail = lazy(() => import('./pages/EventDetail'))
const Discover = lazy(() => import('./pages/Discover'))
const Hosting = lazy(() => import('./pages/Hosting'))
const Participants = lazy(() => import('./pages/Participants'))
const Certificates = lazy(() => import('./pages/Certificates'))
const Schedule = lazy(() => import('./pages/Schedule'))
const Volunteers = lazy(() => import('./pages/Volunteers'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Budget = lazy(() => import('./pages/Budget'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Reports = lazy(() => import('./pages/Reports'))
const Audit = lazy(() => import('./pages/Audit'))
const Settings = lazy(() => import('./pages/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))

export default function App() {
  return (
    <Suspense fallback={<LoadingState full />}>
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
    </Suspense>
  )
}
