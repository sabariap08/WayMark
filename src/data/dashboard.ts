export type TrendPoint = { label: string; value: number };

export type CategoryData = { label: string; value: number; color: string };

export type ActivityEntry = {
  icon: 'check' | 'certificate' | 'clock' | 'sparkles' | 'user' | 'alert';
  tone: 'green' | 'blue' | 'amber' | 'slate' | 'red';
  title: string;
  detail: string;
  time: string;
};

export type DashboardEvent = {
  id: string;
  title: string;
  category: string;
  date: string;
  time: string;
  location: string;
  registrations: number;
  capacity: number;
  status: string;
  tone: 'blue' | 'green' | 'amber' | 'red' | 'slate';
  initials: string;
  color: string;
};

export type QuickAction = { label: string; detail: string };

import { calculateDynamicStats } from './mockData';

export const summaryStats = calculateDynamicStats();

export const registrationTrend: TrendPoint[] = [
  { label: 'May', value: 180 },
  { label: 'Jun', value: 240 },
  { label: 'Jul', value: 310 },
  { label: 'Aug', value: 280 },
  { label: 'Sep', value: 420 },
  { label: 'Oct', value: 510 },
];

export const categoryBreakdown: CategoryData[] = [
  { label: 'Hackathons', value: 38, color: '#3b7291' },
  { label: 'Workshops', value: 27, color: '#9b6a2a' },
  { label: 'Conferences', value: 21, color: '#377569' },
  { label: 'Community', value: 14, color: '#60746f' },
];

export const attendanceData: TrendPoint[] = [
  { label: 'Mon', value: 45 },
  { label: 'Tue', value: 62 },
  { label: 'Wed', value: 38 },
  { label: 'Thu', value: 78 },
  { label: 'Fri', value: 55 },
  { label: 'Sat', value: 92 },
  { label: 'Sun', value: 30 },
];

export const recentActivities: ActivityEntry[] = [
  { icon: 'check', tone: 'green', title: 'Registration confirmed', detail: 'Zero Origin Hackathon · Maya Chen', time: '2h ago' },
  { icon: 'certificate', tone: 'blue', title: 'Certificate issued', detail: 'Impact Lab 2026 · 12 recipients', time: '5h ago' },
  { icon: 'clock', tone: 'amber', title: 'Event starts in 2 days', detail: 'Designing for Civic Impact', time: '8h ago' },
  { icon: 'user', tone: 'slate', title: 'New participant joined', detail: 'Ari Kim registered for 3 events', time: 'Yesterday' },
  { icon: 'alert', tone: 'red', title: 'Approval overdue', detail: 'Student Founder Showcase · 3 days', time: 'Yesterday' },
  { icon: 'sparkles', tone: 'green', title: 'Event published', detail: 'Campus Sustainability Summit', time: '2d ago' },
];

export const dashboardEvents: DashboardEvent[] = [
  { id: '1', title: 'Zero Origin Hackathon', category: 'Hackathon', date: 'Oct 18, 2026', time: '09:00 — 18:00', location: 'Innovation Hub · Hybrid', registrations: 158, capacity: 200, status: 'Registration open', tone: 'green', initials: 'ZO', color: 'bg-cyan-700' },
  { id: '2', title: 'Designing for Civic Impact', category: 'Workshop', date: 'Oct 24, 2026', time: '14:00 — 17:00', location: 'Online · Zoom', registrations: 82, capacity: 100, status: 'Registration open', tone: 'green', initials: 'DC', color: 'bg-amber-600' },
  { id: '3', title: 'Campus Sustainability Summit', category: 'Conference', date: 'Nov 02, 2026', time: '10:00 — 16:30', location: 'Main Auditorium · Offline', registrations: 280, capacity: 400, status: 'Registration open', tone: 'green', initials: 'CS', color: 'bg-emerald-700' },
  { id: '4', title: 'Frontend Futures Meetup', category: 'Community', date: 'Nov 12, 2026', time: '18:30 — 20:30', location: 'The Foundry · Offline', registrations: 94, capacity: 100, status: 'Almost full', tone: 'amber', initials: 'FF', color: 'bg-slate-700' },
  { id: '5', title: 'AI Ethics Roundtable', category: 'Workshop', date: 'Nov 20, 2026', time: '13:00 — 15:00', location: 'Online · Zoom', registrations: 12, capacity: 50, status: 'Draft', tone: 'slate', initials: 'AE', color: 'bg-slate-600' },
  { id: '6', title: 'Climate Voices Forum', category: 'Conference', date: 'Dec 05, 2026', time: '09:30 — 17:00', location: 'East Wing · Offline', registrations: 0, capacity: 250, status: 'Pending approval', tone: 'blue', initials: 'CV', color: 'bg-emerald-800' },
];

export const quickActions: QuickAction[] = [
  { label: 'Create event', detail: 'Start a new event from scratch' },
  { label: 'Invite participants', detail: 'Send invitations by email or link' },
  { label: 'Issue certificates', detail: 'Generate and distribute certificates' },
  { label: 'Export report', detail: 'Download registration and attendance data' },
];

export const eventCategories = ['All categories', 'Hackathon', 'Workshop', 'Conference', 'Community'] as const;
export const eventStatuses = ['All statuses', 'Registration open', 'Almost full', 'Draft', 'Pending approval'] as const;
