import {
  Award,
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
