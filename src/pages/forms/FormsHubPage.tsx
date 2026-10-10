import { Link } from 'react-router-dom';
import { Award, Calendar, ChevronRight, ClipboardCheck, FileText, Gavel, LayoutGrid, MessageSquare, Pencil, Scale, User, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type FormCard = { title: string; description: string; path: string; icon: LucideIcon; group: string };

const forms: FormCard[] = [
  { title: 'User registration', description: 'Create a new WayMark account', path: '/forms/signup', icon: UserPlus, group: 'Account' },
  { title: 'Profile management', description: 'Update personal info, preferences, and privacy', path: '/forms/profile', icon: User, group: 'Account' },
  { title: 'Event registration', description: 'Register for an event with type-specific fields', path: '/forms/event-registration', icon: Calendar, group: 'Participation' },
  { title: 'Host event creation', description: 'Create, edit, preview, and submit events for approval', path: '/forms/host-event', icon: Pencil, group: 'Hosting' },
  { title: 'Event approval & publishing', description: 'Review, approve, reject, or publish submitted events', path: '/forms/approval', icon: FileText, group: 'Administration' },
  { title: 'Jury management', description: 'Add and manage jury members', path: '/forms/jury-management', icon: Gavel, group: 'Evaluation' },
  { title: 'Jury assignment', description: 'Assign jury panels to events and tracks', path: '/forms/jury-assignment', icon: Scale, group: 'Evaluation' },
  { title: 'Rubric creation', description: 'Build scoring rubrics with weighted criteria', path: '/forms/rubric', icon: Award, group: 'Evaluation' },
  { title: 'Jury scoring', description: 'Score participant submissions using rubrics', path: '/forms/scoring', icon: Scale, group: 'Evaluation' },
  { title: 'Attendance check-in', description: 'Check in participants manually or via QR', path: '/forms/attendance', icon: ClipboardCheck, group: 'Operations' },
  { title: 'Event feedback', description: 'Collect post-event ratings and comments', path: '/forms/feedback', icon: MessageSquare, group: 'Operations' },
  { title: 'Issue certificates', description: 'Generate certificates for eligible participants', path: '/forms/certificates', icon: Award, group: 'Certificates' },
  { title: 'Verify certificate', description: 'Look up and validate a certificate by ID', path: '/forms/certificate-verify', icon: FileText, group: 'Certificates' },
];

const groups = [...new Set(forms.map((f) => f.group))];

export function FormsHubPage() {
  return (
    <div className="page-stack">
      <div className="section-heading">
        <div>
          <span className="eyebrow">WayMark platform</span>
          <h2>Forms & workflows</h2>
        </div>
        <Link to="/" className="button button-secondary"><LayoutGrid size={16} /> Back to dashboard</Link>
      </div>
      {groups.map((group) => (
        <div className="forms-hub-group" key={group}>
          <span className="eyebrow">{group}</span>
          <div className="forms-hub-grid">
            {forms.filter((f) => f.group === group).map((form) => (
              <Link to={form.path} className="forms-hub-card" key={form.path}>
                <div className="forms-hub-icon"><form.icon size={20} /></div>
                <div>
                  <strong>{form.title}</strong>
                  <span>{form.description}</span>
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
