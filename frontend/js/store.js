/* WayMark data store — replaces the old mock data module.
 *
 * Everything is fetched from the Flask backend through WMApi. Each endpoint
 * should return a JSON array, or an object containing the list under one of:
 * items / data / results / <resource-name> (e.g. { "events": [...] }).
 *
 * Expected record shapes (the frontend renders these fields):
 *   events:        id, hostId, title, category, date, time, location, seats, status,
 *                  approvalStatus, tone, initials, color, description, organizer,
 *                  capacityNum, registeredNum, regDeadline, contactEmail, website,
 *                  tags[], certificatesEnabled, juryEnabled, feedbackEnabled,
 *                  attendanceRequired, agenda[], requirements[], createdAt, submittedAt
 *   registrations: id, userId, eventId, eventTitle, category, date, time, location,
 *                  status, attendanceStatus, ticketCode, qrCodeUrl, registeredAt, ...
 *   users:         id, name, email, role, status, eventsCount, joinedDate, phone, org,
 *                  bio, website, location, birthDate, pronouns, emailUpdates,
 *                  smsReminders, publicProfile
 *   notifications: id, title, message, type, time, read
 *   auditLogs:     id, action, user, target, timestamp, ip, status
 *   leaderboard:   rank, teamName, projectTitle, track, score, maxScore, award, tone
 *   attendanceLogs: id, eventId, userId, participantName, participantEmail, session,
 *                  timestamp, method, status
 *   juryAssignments: id, eventId, eventTitle, juryMemberId, juryName, expertise,
 *                  assignedTracks[], status
 *   rubrics:       id, eventId, rubricName, criteria[{ id, name, description, weight, maxScore }]
 *   feedback:      id, eventId, userId, overallRating, contentRating, organizationRating,
 *                  venueRating, whatWorked, whatDidnt, wouldRecommend, attendAgain,
 *                  anonymous, submittedAt
 *   certificates:  id, recipientName, eventTitle, issueDate, credentialId, issuer, type, status
 *   meta:          { eventTypes[[name, tagline, cssClass]], eventCategories[], eventStatuses[] }
 *   dashboard:     { summaryStats[], registrationTrend[], categoryBreakdown[],
 *                    attendanceData[], recentActivities[], dashboardEvents[], quickActions[] }
 */
(function (global) {
  'use strict';

  const Api = global.WMApi;

  function asList(value, names) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const keys = (names || []).concat(['items', 'data', 'results']);
      for (let i = 0; i < keys.length; i += 1) {
        if (Array.isArray(value[keys[i]])) return value[keys[i]];
      }
    }
    return null;
  }

  const DEFAULT_QUICK_ACTIONS = [
    { label: 'Create event', detail: 'Start a new event from scratch' },
    { label: 'Invite participants', detail: 'Send invitations by email or link' },
    { label: 'Issue certificates', detail: 'Generate and distribute certificates' },
    { label: 'Export report', detail: 'Download registration and attendance data' },
  ];

  const store = {
    loaded: false,
    _promise: null,

    users: [],
    events: [],
    registrations: [],
    attendanceLogs: [],
    juryAssignments: [],
    rubrics: [],
    scores: [],
    leaderboard: [],
    feedback: [],
    certificates: [],
    notifications: [],
    auditLogs: [],

    eventTypes: [],
    eventCategories: ['All categories'],
    eventStatuses: ['All statuses'],

    registrationTrend: [],
    categoryBreakdown: [],
    attendanceData: [],
    recentActivities: [],
    dashboardEvents: [],
    quickActions: DEFAULT_QUICK_ACTIONS.slice(),
    summaryStats: [],

    reset: function () {
      this._promise = null;
      this.loaded = false;
    },

    load: function (force) {
      const self = this;
      if (self._promise && !force) return self._promise;
      self._promise = Promise.resolve()
        .then(function () { return self._fetchAll(); })
        .then(function () { self.loaded = true; return self; });
      return self._promise;
    },

    ready: function () {
      return this._promise || this.load();
    },

    _fetchAll: function () {
      const self = this;
      const tasks = [
        ['meta', function () { return Api.meta.get(); }],
        ['events', function () { return Api.events.list(); }],
        ['registrations', function () { return Api.registrations.list(); }],
        ['users', function () { return Api.users.list(); }],
        ['notifications', function () { return Api.notifications.list(); }],
        ['auditLogs', function () { return Api.audit.list(); }],
        ['leaderboard', function () { return Api.leaderboard.list(); }],
        ['attendanceLogs', function () { return Api.attendance.roster(); }],
        ['juryAssignments', function () { return Api.jury.assignments(); }],
        ['rubrics', function () { return Api.rubrics.list(); }],
        ['feedback', function () { return Api.feedback.list(); }],
        ['certificates', function () { return Api.certificates.list(); }],
        ['dashboard', function () { return Api.dashboard.overview(); }],
      ];
      return Promise.all(tasks.map(function (task) {
        return Promise.resolve()
          .then(task[1])
          .then(
            function (value) { return { key: task[0], value: value, ok: true }; },
            function () { return { key: task[0], value: null, ok: false }; }
          );
      })).then(function (results) {
        results.forEach(function (r) {
          if (r.ok) self._apply(r.key, r.value);
        });
        self._deriveFallbacks();
        return self;
      });
    },

    _apply: function (key, value) {
      const self = this;
      switch (key) {
        case 'meta': {
          if (!value || typeof value !== 'object') return;
          const types = asList(value, ['eventTypes']);
          if (types) self.eventTypes = types;
          const categories = asList(value, ['eventCategories']);
          if (categories && categories.length) self.eventCategories = ['All categories'].concat(categories);
          const statuses = asList(value, ['eventStatuses']);
          if (statuses && statuses.length) self.eventStatuses = ['All statuses'].concat(statuses);
          return;
        }
        case 'dashboard': {
          if (!value || typeof value !== 'object') return;
          ['summaryStats', 'registrationTrend', 'categoryBreakdown', 'attendanceData', 'recentActivities', 'dashboardEvents', 'quickActions'].forEach(function (k) {
            const list = asList(value, [k]);
            if (list && list.length) self[k] = list;
          });
          return;
        }
        default: {
          const list = asList(value, [key]);
          if (list) self[key] = list;
        }
      }
    },

    _deriveFallbacks: function () {
      const self = this;

      if (self.eventCategories.length <= 1 && self.events.length) {
        const seen = [];
        self.events.forEach(function (e) {
          if (e && e.category && seen.indexOf(e.category) === -1) seen.push(e.category);
        });
        self.eventCategories = ['All categories'].concat(seen);
      }

      if (self.eventStatuses.length <= 1 && self.events.length) {
        const seen = [];
        self.events.forEach(function (e) {
          const status = e && (e.status || e.approvalStatus);
          if (status && seen.indexOf(status) === -1) seen.push(status);
        });
        self.eventStatuses = ['All statuses'].concat(seen);
      }

      if (!self.dashboardEvents.length && self.events.length) {
        self.dashboardEvents = self.events.map(function (e) {
          return {
            id: e.id, title: e.title, category: e.category, date: e.date, time: e.time,
            location: e.location, registrations: e.registeredNum || 0, capacity: e.capacityNum || 0,
            status: e.status, tone: e.tone || 'slate', initials: e.initials || '', color: e.color || 'bg-slate-600',
          };
        });
      }

      if (!self.summaryStats.length) {
        const published = self.events.filter(function (e) { return e.approvalStatus === 'Published'; }).length;
        const totalRegistrations = self.events.reduce(function (sum, e) { return sum + (e.registeredNum || 0); }, 0);
        const activeParticipants = self.users.filter(function (u) { return u.role === 'Participant' || u.status === 'Active'; }).length;
        const validCertificates = self.certificates.filter(function (c) { return c.status === 'Valid'; }).length;
        self.summaryStats = [
          { label: 'Total events', value: String(self.events.length), detail: published + ' published live', accent: 'blue', icon: 'calendar' },
          { label: 'Total registrations', value: totalRegistrations.toLocaleString(), detail: self.registrations.length + ' in your workspace', accent: 'teal', icon: 'ticket' },
          { label: 'Active participants', value: String(activeParticipants), detail: 'Across all registered events', accent: 'amber', icon: 'users' },
          { label: 'Certificates issued', value: String(validCertificates), detail: 'Ready to download & verify', accent: 'rose', icon: 'award' },
        ];
      }
    },
  };

  global.WMData = store;
})(window);