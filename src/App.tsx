import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AppLayout } from '@/layout/AppLayout';
import { ApprovalsPage, DiscoverPage, EventsPage, RegistrationsPage, SimplePage } from '@/pages/WorkspacePages';
import { LoginPage, SignupPage, PasswordResetPage } from '@/pages/AuthPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { SignupForm, ProfileForm } from '@/pages/forms/ProfileForms';
import { EventRegistrationForm } from '@/pages/forms/EventRegistrationForm';
import { HostEventForm, ApprovalForm } from '@/pages/forms/HostEventForms';
import { JuryManagementForm, JuryAssignmentForm, RubricForm, ScoringForm } from '@/pages/forms/JuryForms';
import { AttendanceForm, FeedbackForm, CertificateForm, CertificateVerifyForm } from '@/pages/forms/AttendanceFeedbackCertForms';
import { FormsHubPage } from '@/pages/forms/FormsHubPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/password-reset" element={<PasswordResetPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="registrations" element={<RegistrationsPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="notifications" element={<SimplePage view="notifications" />} />
          <Route path="profile" element={<SimplePage view="profile" />} />
          <Route path="users" element={<SimplePage view="users" />} />
          <Route path="audit" element={<SimplePage view="audit" />} />
          <Route path="forms" element={<FormsHubPage />} />
          <Route path="forms/signup" element={<SignupForm />} />
          <Route path="forms/profile" element={<ProfileForm />} />
          <Route path="forms/event-registration" element={<EventRegistrationForm />} />
          <Route path="forms/host-event" element={<HostEventForm />} />
          <Route path="forms/approval" element={<ApprovalForm />} />
          <Route path="forms/jury-management" element={<JuryManagementForm />} />
          <Route path="forms/jury-assignment" element={<JuryAssignmentForm />} />
          <Route path="forms/rubric" element={<RubricForm />} />
          <Route path="forms/scoring" element={<ScoringForm />} />
          <Route path="forms/attendance" element={<AttendanceForm />} />
          <Route path="forms/feedback" element={<FeedbackForm />} />
          <Route path="forms/certificates" element={<CertificateForm />} />
          <Route path="forms/certificate-verify" element={<CertificateVerifyForm />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
  );
}

export default App;
