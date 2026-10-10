import {
  mockAuditLogs,
  mockCertificates,
  mockEvents,
  mockLeaderboard,
  mockNotifications,
  mockRegistrations,
  mockUsers,
} from './mockData';

export const events = mockEvents;

export const eventTypes = [
  ['Hackathon', 'Build, solve, collaborate', 'type-blue'],
  ['Workshop', 'Teach and learn together', 'type-amber'],
  ['Conference', 'Gather ideas and people', 'type-green'],
  ['Other', 'Start from a blank canvas', 'type-slate'],
] as const;

export const sampleRegistrations = mockRegistrations;
export const sampleLeaderboard = mockLeaderboard;
export const sampleNotifications = mockNotifications;
export const sampleUsers = mockUsers;
export const sampleAuditLogs = mockAuditLogs;
export const sampleCertificates = mockCertificates;


