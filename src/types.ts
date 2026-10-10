export type ViewKey =
  | 'overview'
  | 'discover'
  | 'registrations'
  | 'events'
  | 'notifications'
  | 'profile'
  | 'approvals'
  | 'users'
  | 'audit';

export type BadgeTone = 'blue' | 'green' | 'amber' | 'red' | 'slate';

export type EventItem = {
  id?: string;
  title: string;
  category: string;
  date: string;
  time: string;
  location: string;
  seats: string;
  status: string;
  tone: BadgeTone;
  initials: string;
  color: string;
  description?: string;
  organizer?: string;
  agenda?: string[];
  requirements?: string[];
  capacityNum?: number;
  registeredNum?: number;
};

export type RegistrationRecord = {
  id: string;
  eventTitle: string;
  category: string;
  date: string;
  time: string;
  location: string;
  status: 'Confirmed' | 'Completed' | 'Pending' | 'Cancelled';
  attendanceStatus: 'Checked in' | 'Not checked in' | 'Absent';
  ticketCode: string;
  qrCodeUrl: string;
  registeredAt: string;
};

export type LeaderboardItem = {
  rank: number;
  teamName: string;
  projectTitle: string;
  track: string;
  score: number;
  maxScore: number;
  award: 'Winner' | 'Runner-up' | 'Honorable Mention' | 'Finalist';
  tone: BadgeTone;
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: 'reminder' | 'approval' | 'certificate' | 'invitation' | 'system';
  time: string;
  read: boolean;
};

export type UserItem = {
  id: string;
  name: string;
  email: string;
  role: 'Participant' | 'Host' | 'Jury' | 'Administrator';
  status: 'Active' | 'Pending' | 'Suspended';
  eventsCount: number;
  joinedDate: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  user: string;
  target: string;
  timestamp: string;
  ip: string;
  status: 'Success' | 'Warning' | 'Failed';
};

export type CertificateItem = {
  id: string;
  recipientName: string;
  eventTitle: string;
  issueDate: string;
  credentialId: string;
  issuer: string;
  type: 'Participation' | 'Excellence' | 'Achievement';
  status: 'Valid' | 'Revoked';
};

