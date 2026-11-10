import {
  Award,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  ClipboardList,
  Compass,
  FileBarChart,
  HeartHandshake,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
  Users,
  Wallet,
} from 'lucide-react'

export const navigation = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', to: '/app', icon: LayoutDashboard, end: true },
      { label: 'Events', to: '/app/events', icon: CalendarDays },
      { label: 'Discover', to: '/app/discover', icon: Compass },
      { label: 'Hosting requests', to: '/app/hosting', icon: ClipboardList },
      { label: 'Participants', to: '/app/participants', icon: Users },
      { label: 'Certificates', to: '/app/certificates', icon: Award },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Schedule', to: '/app/schedule', icon: CalendarRange },
      { label: 'Volunteers', to: '/app/volunteers', icon: HeartHandshake },
      { label: 'Tasks', to: '/app/tasks', icon: ListChecks },
      { label: 'Budget', to: '/app/budget', icon: Wallet },
    ],
  },
  {
    label: 'Insight',
    items: [
      { label: 'Analytics', to: '/app/analytics', icon: ChartNoAxesCombined },
      { label: 'Reports', to: '/app/reports', icon: FileBarChart },
      { label: 'Audit log', to: '/app/audit', icon: ScrollText },
    ],
  },
]

export const utilityNavigation = [{ label: 'Settings', to: '/app/settings', icon: Settings }]

export const pageLabels = {
  '/app': 'Overview',
  '/app/events': 'Events',
  '/app/discover': 'Discover',
  '/app/hosting': 'Hosting requests',
  '/app/participants': 'Participants',
  '/app/certificates': 'Certificates',
  '/app/schedule': 'Schedule',
  '/app/volunteers': 'Volunteers',
  '/app/tasks': 'Tasks',
  '/app/budget': 'Budget',
  '/app/analytics': 'Analytics',
  '/app/reports': 'Reports',
  '/app/audit': 'Audit log',
  '/app/settings': 'Settings',
}

export const placeholderDetails = {
  discover: {
    eyebrow: 'Workspace',
    title: 'Discover',
    description: 'A curated public event directory with saved searches and recommendations.',
    icon: Compass,
  },
  hosting: {
    eyebrow: 'Workspace',
    title: 'Hosting requests',
    description: 'Submit, review, and approve event hosting requests from your community.',
    icon: ClipboardList,
  },
  participants: {
    eyebrow: 'Workspace',
    title: 'Participants',
    description: 'A unified directory of attendees, registrations, and attendance history.',
    icon: Users,
  },
  certificates: {
    eyebrow: 'Workspace',
    title: 'Certificates',
    description: 'Eligibility rules, batch issuing, and public certificate verification.',
    icon: Award,
  },
  schedule: {
    eyebrow: 'Operations',
    title: 'Schedule',
    description: 'Sessions, rooms, resources, conflict detection, and publishing.',
    icon: CalendarRange,
  },
  volunteers: {
    eyebrow: 'Operations',
    title: 'Volunteers',
    description: 'Scoped invite links, availability, assignments, and hour tracking.',
    icon: HeartHandshake,
  },
  tasks: {
    eyebrow: 'Operations',
    title: 'Tasks',
    description: 'Task boards, dependencies, and recommendations for the event team.',
    icon: ListChecks,
  },
  budget: {
    eyebrow: 'Operations',
    title: 'Budget',
    description: 'Budget lines, scenarios, sponsors, and sponsor reporting.',
    icon: Wallet,
  },
  analytics: {
    eyebrow: 'Insight',
    title: 'Analytics',
    description: 'Registration trends, attendance, category mix, and event comparison.',
    icon: ChartNoAxesCombined,
  },
  reports: {
    eyebrow: 'Insight',
    title: 'Reports',
    description: 'Export registrations, attendance, results, feedback, and certificates.',
    icon: FileBarChart,
  },
  audit: {
    eyebrow: 'Insight',
    title: 'Audit log',
    description: 'A searchable record of important actions across the workspace.',
    icon: ScrollText,
  },
  settings: {
    eyebrow: 'Account',
    title: 'Settings',
    description: 'Workspace preferences, notifications, and account security.',
    icon: Settings,
  },
}
