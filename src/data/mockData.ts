import type {
  AuditLogEntry,
  CertificateItem,
  EventItem,
  LeaderboardItem,
  NotificationItem,
  RegistrationRecord,
  UserItem,
} from '@/types';

// ============================================================================
// API STATUS FLAG
// ============================================================================
export const IS_REAL_API_CONNECTED = false;

// ============================================================================
// MOCK USERS & ROLE PROFILES
// ============================================================================
export type MockUserProfile = UserItem & {
  phone?: string;
  org?: string;
  bio?: string;
  website?: string;
  location?: string;
  birthDate?: string;
  pronouns?: string;
  emailUpdates?: boolean;
  smsReminders?: boolean;
  publicProfile?: boolean;
};

export const mockUsers: MockUserProfile[] = [
  {
    id: 'usr-1',
    name: 'Maya Chen',
    email: 'maya@waymark.events',
    role: 'Host',
    status: 'Active',
    eventsCount: 4,
    joinedDate: 'Jan 12, 2025',
    phone: '+1 555 0142',
    org: 'WayMark Platform & Independent Host',
    bio: 'Community builder and event organizer focused on civic tech, open innovation, and sustainability initiatives.',
    website: 'https://maya-chen.work',
    location: 'San Francisco, CA',
    birthDate: '1998-03-14',
    pronouns: 'she/her',
    emailUpdates: true,
    smsReminders: false,
    publicProfile: true,
  },
  {
    id: 'usr-2',
    name: 'Jordan Lee',
    email: 'jordan@waymark.events',
    role: 'Administrator',
    status: 'Active',
    eventsCount: 12,
    joinedDate: 'Nov 04, 2024',
    phone: '+1 555 0199',
    org: 'WayMark Global Administration',
    bio: 'Lead platform administrator overseeing content policies, event approvals, and platform audit compliance.',
    website: 'https://jordan-lee.admin',
    location: 'Seattle, WA',
    emailUpdates: true,
    smsReminders: true,
    publicProfile: true,
  },
  {
    id: 'usr-3',
    name: 'Samira Okafor',
    email: 'samira@waymark.events',
    role: 'Participant',
    status: 'Active',
    eventsCount: 8,
    joinedDate: 'Mar 19, 2025',
    phone: '+1 555 0812',
    org: 'Green Tech Labs',
    bio: 'Full-stack software engineer and open-source contributor participating in civic hackathons.',
    location: 'Austin, TX',
    emailUpdates: true,
    smsReminders: true,
    publicProfile: true,
  },
  {
    id: 'usr-4',
    name: 'Dr. Sarah Lin',
    email: 'sarah.lin@univ.edu',
    role: 'Jury',
    status: 'Active',
    eventsCount: 6,
    joinedDate: 'Feb 01, 2025',
    phone: '+1 555 0341',
    org: 'Department of Computer Science, State University',
    bio: 'Associate Professor specializing in AI ethics, machine learning evaluation, and algorithmic fairness.',
    location: 'Boston, MA',
    emailUpdates: true,
    smsReminders: false,
    publicProfile: true,
  },
  {
    id: 'usr-5',
    name: 'Ari Kim',
    email: 'ari@waymark.events',
    role: 'Participant',
    status: 'Pending',
    eventsCount: 1,
    joinedDate: 'Oct 01, 2026',
    org: 'Student Founder Alliance',
    location: 'Chicago, IL',
    emailUpdates: false,
    smsReminders: false,
    publicProfile: false,
  },
];

// ============================================================================
// MOCK EVENTS & DETAILS
// ============================================================================
export type DetailedMockEvent = EventItem & {
  id: string;
  hostId: string;
  approvalStatus: 'Draft' | 'Pending approval' | 'Approved' | 'Published' | 'Changes requested' | 'Rejected';
  regDeadline: string;
  contactEmail: string;
  website?: string;
  tags?: string[];
  certificatesEnabled: boolean;
  juryEnabled: boolean;
  feedbackEnabled: boolean;
  attendanceRequired: boolean;
};

export const mockEvents: DetailedMockEvent[] = [
  {
    id: 'evt-101',
    hostId: 'usr-1',
    title: 'Zero Origin Hackathon',
    category: 'Hackathon',
    date: 'Oct 18, 2026',
    time: '09:00 — 18:00',
    location: 'Innovation Hub · Hybrid',
    seats: '42 seats left',
    status: 'Registration open',
    approvalStatus: 'Published',
    tone: 'green',
    initials: 'ZO',
    color: 'bg-cyan-700',
    description: 'A 24-hour collaborative sprint bringing developers, designers, and domain experts together to build open-source solutions for climate resilience and civic engagement.',
    organizer: 'Maya Chen & Innovation Hub',
    capacityNum: 200,
    registeredNum: 158,
    regDeadline: 'Oct 16, 2026',
    contactEmail: 'hackathon@waymark.events',
    website: 'https://zero-origin.hackathon.org',
    tags: ['hackathon', 'sustainability', 'ai', 'civic-tech'],
    certificatesEnabled: true,
    juryEnabled: true,
    feedbackEnabled: true,
    attendanceRequired: true,
    agenda: [
      '09:00 AM — Registration & Coffee',
      '10:00 AM — Keynote & Team Formation',
      '01:00 PM — Lunch & Mentor Check-ins',
      '06:00 PM — Project Demos & Judging',
      '07:30 PM — Winner Announcements & Awards',
    ],
    requirements: ['Laptop & Charger', 'GitHub Account', 'Team of 1-4 members'],
  },
  {
    id: 'evt-102',
    hostId: 'usr-1',
    title: 'Designing for Civic Impact',
    category: 'Workshop',
    date: 'Oct 24, 2026',
    time: '14:00 — 17:00',
    location: 'Online · Zoom',
    seats: '18 seats left',
    status: 'Registration open',
    approvalStatus: 'Published',
    tone: 'green',
    initials: 'DC',
    color: 'bg-amber-600',
    description: 'Interactive workshop on human-centered design principles applied to public digital infrastructure, accessibility compliance, and community co-design.',
    organizer: 'Maya Chen & Civic UX Lab',
    capacityNum: 100,
    registeredNum: 82,
    regDeadline: 'Oct 22, 2026',
    contactEmail: 'workshop@waymark.events',
    website: 'https://civic-design.workshop.org',
    tags: ['ux', 'civic-tech', 'workshop', 'design'],
    certificatesEnabled: true,
    juryEnabled: false,
    feedbackEnabled: true,
    attendanceRequired: true,
    agenda: [
      '02:00 PM — Principles of Civic UX',
      '03:00 PM — Hands-on Accessibility Audit',
      '04:30 PM — Group Sharing & Feedback',
    ],
    requirements: ['Figma or Sketch', 'Zoom Desktop Client'],
  },
  {
    id: 'evt-103',
    hostId: 'usr-2',
    title: 'Campus Sustainability Summit',
    category: 'Conference',
    date: 'Nov 02, 2026',
    time: '10:00 — 16:30',
    location: 'Main Auditorium · Offline',
    seats: '120 seats left',
    status: 'Registration open',
    approvalStatus: 'Approved',
    tone: 'green',
    initials: 'CS',
    color: 'bg-emerald-700',
    description: 'Annual gathering of student leaders, researchers, and campus sustainability officers presenting action plans for zero-waste initiatives and renewable energy transitions.',
    organizer: 'Jordan Lee & Green Campus Initiative',
    capacityNum: 400,
    registeredNum: 280,
    regDeadline: 'Oct 30, 2026',
    contactEmail: 'summit@greencampus.org',
    tags: ['sustainability', 'conference', 'climate', 'campus'],
    certificatesEnabled: true,
    juryEnabled: true,
    feedbackEnabled: true,
    attendanceRequired: true,
    agenda: [
      '10:00 AM — Welcome Address',
      '11:15 AM — Panel: Zero Waste Campuses',
      '02:00 PM — Poster Presentation Session',
      '04:00 PM — Action Resolution Voting',
    ],
    requirements: ['Student ID or Guest Badge'],
  },
  {
    id: 'evt-104',
    hostId: 'usr-1',
    title: 'Frontend Futures Meetup',
    category: 'Community',
    date: 'Nov 12, 2026',
    time: '18:30 — 20:30',
    location: 'The Foundry · Offline',
    seats: '6 seats left',
    status: 'Almost full',
    approvalStatus: 'Published',
    tone: 'amber',
    initials: 'FF',
    color: 'bg-slate-700',
    description: 'Casual community gathering exploring Vite 6, WebAssembly UI components, micro-frontend routing, and modern web application architecture.',
    organizer: 'Frontend Engineers Guild',
    capacityNum: 100,
    registeredNum: 94,
    regDeadline: 'Nov 10, 2026',
    contactEmail: 'meetup@frontendfutures.dev',
    tags: ['react', 'vite', 'typescript', 'meetup'],
    certificatesEnabled: false,
    juryEnabled: false,
    feedbackEnabled: true,
    attendanceRequired: false,
    agenda: [
      '06:30 PM — Networking & Pizza',
      '07:00 PM — Lightning Talks',
      '08:15 PM — Q&A and Raffle',
    ],
    requirements: ['Interest in modern web development'],
  },
  {
    id: 'evt-105',
    hostId: 'usr-1',
    title: 'Intro to Ethical AI',
    category: 'Workshop',
    date: 'Nov 18, 2026',
    time: '13:00 — 16:00',
    location: 'Online · Zoom',
    seats: '35 seats left',
    status: 'Pending review',
    approvalStatus: 'Pending approval',
    tone: 'amber',
    initials: 'EA',
    color: 'bg-slate-600',
    description: 'Foundational workshop exploring bias detection, model explainability, and governance frameworks for responsible machine learning applications.',
    organizer: 'Samira Okafor',
    capacityNum: 50,
    registeredNum: 15,
    regDeadline: 'Nov 15, 2026',
    contactEmail: 'ethical-ai@waymark.events',
    certificatesEnabled: true,
    juryEnabled: false,
    feedbackEnabled: true,
    attendanceRequired: true,
  },
  {
    id: 'evt-106',
    hostId: 'usr-5',
    title: 'Student Founder Showcase',
    category: 'Competition',
    date: 'Dec 05, 2026',
    time: '09:30 — 17:00',
    location: 'Innovation Hub Auditorium',
    seats: '0 seats left',
    status: 'Changes requested',
    approvalStatus: 'Changes requested',
    tone: 'red',
    initials: 'SF',
    color: 'bg-rose-700',
    description: 'Pitch competition for student-led startups seeking seed mentorship, incubators, and prototype grants.',
    organizer: 'Ari Kim',
    capacityNum: 120,
    registeredNum: 0,
    regDeadline: 'Nov 28, 2026',
    contactEmail: 'showcase@studentfounders.org',
    certificatesEnabled: true,
    juryEnabled: true,
    feedbackEnabled: true,
    attendanceRequired: true,
  },
];

// ============================================================================
// MOCK REGISTRATIONS & PASSES
// ============================================================================
export type DetailedRegistration = RegistrationRecord & {
  userId: string;
  eventId: string;
  teamName?: string;
  track?: string;
  dietaryPref?: string;
  accommodation?: boolean;
};

export const mockRegistrations: DetailedRegistration[] = [
  {
    id: 'reg-101',
    userId: 'usr-1',
    eventId: 'evt-101',
    eventTitle: 'Zero Origin Hackathon',
    category: 'Hackathon',
    date: 'Oct 18, 2026',
    time: '09:00 — 18:00',
    location: 'Innovation Hub · Hybrid',
    status: 'Confirmed',
    attendanceStatus: 'Checked in',
    ticketCode: 'WM-ZO-9842',
    qrCodeUrl: 'WM-ZO-9842',
    registeredAt: 'Oct 02, 2026',
    teamName: 'Team Nexus',
    track: 'Sustainability',
    accommodation: false,
  },
  {
    id: 'reg-102',
    userId: 'usr-1',
    eventId: 'evt-102',
    eventTitle: 'Designing for Civic Impact',
    category: 'Workshop',
    date: 'Oct 24, 2026',
    time: '14:00 — 17:00',
    location: 'Online · Zoom',
    status: 'Confirmed',
    attendanceStatus: 'Not checked in',
    ticketCode: 'WM-DC-4410',
    qrCodeUrl: 'WM-DC-4410',
    registeredAt: 'Oct 05, 2026',
    dietaryPref: 'Vegetarian',
  },
  {
    id: 'reg-103',
    userId: 'usr-3',
    eventId: 'evt-103',
    eventTitle: 'Campus Sustainability Summit',
    category: 'Conference',
    date: 'Sep 15, 2026',
    time: '10:00 — 16:30',
    location: 'Main Auditorium · Offline',
    status: 'Completed',
    attendanceStatus: 'Checked in',
    ticketCode: 'WM-CS-1109',
    qrCodeUrl: 'WM-CS-1109',
    registeredAt: 'Aug 20, 2026',
  },
  {
    id: 'reg-104',
    userId: 'usr-5',
    eventId: 'evt-104',
    eventTitle: 'Frontend Futures Meetup',
    category: 'Community',
    date: 'Nov 12, 2026',
    time: '18:30 — 20:30',
    location: 'The Foundry · Offline',
    status: 'Confirmed',
    attendanceStatus: 'Not checked in',
    ticketCode: 'WM-FF-7721',
    qrCodeUrl: 'WM-FF-7721',
    registeredAt: 'Oct 08, 2026',
  },
];

// ============================================================================
// MOCK ATTENDANCE RECORDS
// ============================================================================
export type MockAttendanceLog = {
  id: string;
  eventId: string;
  userId: string;
  participantName: string;
  participantEmail: string;
  session: string;
  timestamp: string;
  method: 'Manual ID' | 'QR Code Scan';
  status: 'Checked in' | 'Checked out';
};

export const mockAttendanceLogs: MockAttendanceLog[] = [
  { id: 'att-1', eventId: 'evt-101', userId: 'usr-1', participantName: 'Maya Chen', participantEmail: 'maya@waymark.events', session: 'Main event', timestamp: 'Oct 18, 08:52 AM', method: 'QR Code Scan', status: 'Checked in' },
  { id: 'att-2', eventId: 'evt-101', userId: 'usr-3', participantName: 'Samira Okafor', participantEmail: 'samira@waymark.events', session: 'Main event', timestamp: 'Oct 18, 09:05 AM', method: 'Manual ID', status: 'Checked in' },
  { id: 'att-3', eventId: 'evt-103', userId: 'usr-3', participantName: 'Samira Okafor', participantEmail: 'samira@waymark.events', session: 'Main Auditorium', timestamp: 'Sep 15, 09:55 AM', method: 'QR Code Scan', status: 'Checked in' },
];

// ============================================================================
// MOCK JURY MEMBERS & ASSIGNMENTS
// ============================================================================
export type MockJuryAssignment = {
  id: string;
  eventId: string;
  eventTitle: string;
  juryMemberId: string;
  juryName: string;
  expertise: string;
  assignedTracks: string[];
  status: 'Assigned' | 'In Progress' | 'Completed';
};

export const mockJuryAssignments: MockJuryAssignment[] = [
  { id: 'jassign-1', eventId: 'evt-101', eventTitle: 'Zero Origin Hackathon', juryMemberId: 'usr-4', juryName: 'Dr. Sarah Lin', expertise: 'AI & Machine Learning', assignedTracks: ['AI & ML', 'Sustainability'], status: 'Completed' },
  { id: 'jassign-2', eventId: 'evt-101', eventTitle: 'Zero Origin Hackathon', juryMemberId: 'usr-2', juryName: 'Jordan Lee', expertise: 'Product Strategy', assignedTracks: ['Civic Tech'], status: 'In Progress' },
];

// ============================================================================
// MOCK RUBRICS & SCORES
// ============================================================================
export type MockRubricCriterion = { id: string; name: string; description: string; weight: number; maxScore: number };

export type MockRubric = {
  id: string;
  eventId: string;
  rubricName: string;
  criteria: MockRubricCriterion[];
};

export const mockRubrics: MockRubric[] = [
  {
    id: 'rub-101',
    eventId: 'evt-101',
    rubricName: 'Zero Origin Hackathon Evaluation Rubric',
    criteria: [
      { id: 'c1', name: 'Innovation & Originality', description: 'Uniqueness of idea and creative problem solving', weight: 30, maxScore: 10 },
      { id: 'c2', name: 'Technical Execution', description: 'Code quality, architecture, and completeness of demo', weight: 30, maxScore: 10 },
      { id: 'c3', name: 'Civic & Climate Impact', description: 'Real-world applicability and sustainability potential', weight: 25, maxScore: 10 },
      { id: 'c4', name: 'Pitch & Presentation', description: 'Clarity of presentation, slides, and Q&A answers', weight: 15, maxScore: 10 },
    ],
  },
];

export type MockSubmissionScore = {
  id: string;
  rubricId: string;
  eventId: string;
  submissionTitle: string;
  teamName: string;
  juryMemberId: string;
  juryName: string;
  scores: Record<string, number>;
  totalScore: number;
  maxScore: number;
  recommendation: 'Winner' | 'Runner-up' | 'Honorable Mention' | 'Finalist';
  comment: string;
  conflictOfInterest: boolean;
  submittedAt: string;
};

export const mockScores: MockSubmissionScore[] = [
  {
    id: 'score-1',
    rubricId: 'rub-101',
    eventId: 'evt-101',
    submissionTitle: 'CarbonTrace — Real-time Emissions Dashboard',
    teamName: 'Team Nexus',
    juryMemberId: 'usr-4',
    juryName: 'Dr. Sarah Lin',
    scores: { c1: 9.5, c2: 9.8, c3: 9.5, c4: 9.0 },
    totalScore: 96.5,
    maxScore: 100,
    recommendation: 'Winner',
    comment: 'Exceptional technical implementation with live IoT sensor streaming. Highly scalable for municipal deployment.',
    conflictOfInterest: false,
    submittedAt: 'Oct 18, 2026 06:45 PM',
  },
  {
    id: 'score-2',
    rubricId: 'rub-101',
    eventId: 'evt-101',
    submissionTitle: 'EduFlow — Accessible Micro-Learning',
    teamName: 'Team Spark',
    juryMemberId: 'usr-4',
    juryName: 'Dr. Sarah Lin',
    scores: { c1: 9.0, c2: 9.2, c3: 9.0, c4: 9.6 },
    totalScore: 92.0,
    maxScore: 100,
    recommendation: 'Runner-up',
    comment: 'Outstanding UX design and WCAG 2.1 AAA compliance. Great pitch delivery.',
    conflictOfInterest: false,
    submittedAt: 'Oct 18, 2026 07:02 PM',
  },
];

// ============================================================================
// MOCK RESULTS & LEADERBOARD
// ============================================================================
export const mockLeaderboard: LeaderboardItem[] = [
  {
    rank: 1,
    teamName: 'Team Nexus',
    projectTitle: 'CarbonTrace — Real-time Emissions Dashboard',
    track: 'Sustainability',
    score: 96.5,
    maxScore: 100,
    award: 'Winner',
    tone: 'green',
  },
  {
    rank: 2,
    teamName: 'Team Spark',
    projectTitle: 'EduFlow — Accessible Micro-Learning',
    track: 'Civic Tech',
    score: 92.0,
    maxScore: 100,
    award: 'Runner-up',
    tone: 'blue',
  },
  {
    rank: 3,
    teamName: 'Team Aurora',
    projectTitle: 'GreenGrid — Community Solar Allocation',
    track: 'Sustainability',
    score: 88.5,
    maxScore: 100,
    award: 'Honorable Mention',
    tone: 'amber',
  },
  {
    rank: 4,
    teamName: 'Team Forge',
    projectTitle: 'CivicPulse — Neighborhood Poll Engine',
    track: 'Civic Tech',
    score: 84.0,
    maxScore: 100,
    award: 'Finalist',
    tone: 'slate',
  },
];

// ============================================================================
// MOCK FEEDBACK
// ============================================================================
export type MockFeedbackEntry = {
  id: string;
  eventId: string;
  userId?: string;
  overallRating: number;
  contentRating: number;
  organizationRating: number;
  venueRating: number;
  whatWorked: string;
  whatDidnt?: string;
  wouldRecommend: string;
  attendAgain: boolean;
  anonymous: boolean;
  submittedAt: string;
};

export const mockFeedback: MockFeedbackEntry[] = [
  {
    id: 'fb-1',
    eventId: 'evt-101',
    userId: 'usr-3',
    overallRating: 5,
    contentRating: 5,
    organizationRating: 4,
    venueRating: 5,
    whatWorked: 'The mentorship check-ins during lunch were invaluable! Great hardware kit support.',
    whatDidnt: 'More power outlets near middle tables would help.',
    wouldRecommend: 'Yes, definitely',
    attendAgain: true,
    anonymous: false,
    submittedAt: 'Oct 19, 2026 09:12 AM',
  },
];

// ============================================================================
// MOCK CERTIFICATES
// ============================================================================
export const mockCertificates: CertificateItem[] = [
  { id: 'cert-1', recipientName: 'Maya Chen', eventTitle: 'Zero Origin Hackathon', issueDate: 'Oct 18, 2026', credentialId: 'WM-2026-001', issuer: 'WayMark Platform', type: 'Excellence', status: 'Valid' },
  { id: 'cert-2', recipientName: 'Jordan Lee', eventTitle: 'Impact Lab 2026', issueDate: 'Sep 30, 2026', credentialId: 'WM-2026-002', issuer: 'Civic UX Guild', type: 'Participation', status: 'Valid' },
  { id: 'cert-3', recipientName: 'Samira Okafor', eventTitle: 'Campus Sustainability Summit', issueDate: 'Aug 14, 2026', credentialId: 'WM-2026-003', issuer: 'Green Campus Initiative', type: 'Achievement', status: 'Valid' },
];

// ============================================================================
// MOCK NOTIFICATIONS
// ============================================================================
export const mockNotifications: NotificationItem[] = [
  { id: 'notif-1', title: 'Registration confirmed', message: 'Your registration for Zero Origin Hackathon has been confirmed. View your QR ticket.', type: 'reminder', time: '2 hours ago', read: false },
  { id: 'notif-2', title: 'Certificate ready to download', message: 'Your certificate for Impact Lab 2026 is ready. Verification ID: WM-2026-001.', type: 'certificate', time: 'Yesterday', read: false },
  { id: 'notif-3', title: 'Event starts in 2 days', message: 'Designing for Civic Impact starts on Oct 24 at 14:00. Check your Zoom link.', type: 'reminder', time: '2 days ago', read: true },
  { id: 'notif-4', title: 'Approval queue update', message: 'Campus Sustainability Summit has been approved by administrator Jordan Lee.', type: 'approval', time: '3 days ago', read: true },
];

// ============================================================================
// MOCK AUDIT LOGS
// ============================================================================
export const mockAuditLogs: AuditLogEntry[] = [
  { id: 'log-1', action: 'Approved Event', user: 'Jordan Lee (Admin)', target: 'Campus Sustainability Summit', timestamp: 'Oct 10, 2026 14:32', ip: '192.168.1.42', status: 'Success' },
  { id: 'log-2', action: 'Issued Certificates', user: 'Maya Chen (Host)', target: 'Impact Lab 2026 (12 recipients)', timestamp: 'Oct 09, 2026 11:15', ip: '10.0.0.18', status: 'Success' },
  { id: 'log-3', action: 'Assigned Jury Panel', user: 'Jordan Lee (Admin)', target: 'Zero Origin Hackathon (3 members)', timestamp: 'Oct 08, 2026 09:40', ip: '192.168.1.42', status: 'Success' },
  { id: 'log-4', action: 'Exported Roster CSV', user: 'Maya Chen (Host)', target: 'Zero Origin Hackathon Registrations', timestamp: 'Oct 07, 2026 16:05', ip: '10.0.0.18', status: 'Success' },
  { id: 'log-5', action: 'Failed Login Attempt', user: 'Unknown User', target: 'admin@waymark.events', timestamp: 'Oct 06, 2026 22:11', ip: '185.220.101.5', status: 'Failed' },
];

// ============================================================================
// DYNAMIC DASHBOARD STATS CALCULATOR
// ============================================================================
export function calculateDynamicStats() {
  const totalEvents = mockEvents.length;
  const totalRegistrations = mockEvents.reduce((sum, e) => sum + (e.registeredNum || 0), 0);
  const activeParticipants = mockUsers.filter((u) => u.role === 'Participant' || u.status === 'Active').length;
  const totalCertificates = mockCertificates.filter((c) => c.status === 'Valid').length;

  return [
    { label: 'Total events', value: String(totalEvents), detail: `${mockEvents.filter((e) => e.approvalStatus === 'Published').length} published live`, delta: '+12%', deltaUp: true, accent: 'blue' as const, icon: 'calendar' as const },
    { label: 'Total registrations', value: totalRegistrations.toLocaleString(), detail: `${mockRegistrations.length} in your workspace`, delta: '+8%', deltaUp: true, accent: 'teal' as const, icon: 'ticket' as const },
    { label: 'Active participants', value: String(activeParticipants), detail: 'Across all registered events', delta: '+5%', deltaUp: true, accent: 'amber' as const, icon: 'users' as const },
    { label: 'Certificates issued', value: String(totalCertificates), detail: 'Ready to download & verify', delta: '+3%', deltaUp: true, accent: 'rose' as const, icon: 'award' as const },
  ];
}
