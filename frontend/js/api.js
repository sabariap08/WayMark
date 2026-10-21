/* WayMark REST client for the Flask backend.
 *
 * Every page talks to the backend through WMApi. No mock data lives here —
 * responses are consumed as-is. Adjust endpoint paths in one place if your
 * Flask blueprints differ.
 */
(function (global) {
  'use strict';

  const CONFIG = global.WM_CONFIG || {};
  const BASE = String(CONFIG.API_BASE_URL || '/api').replace(/\/+$/, '');
  const TOKEN_KEY = CONFIG.TOKEN_KEY || 'waymark_token';

  function ApiError(message, status, data) {
    const err = new Error(message);
    err.name = 'ApiError';
    err.status = status;
    err.data = data;
    return err;
  }

  function getToken() {
    try { return global.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function setToken(token) {
    try {
      if (token) global.localStorage.setItem(TOKEN_KEY, token);
      else global.localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* storage unavailable */ }
  }

  function qs(params) {
    if (!params) return '';
    const parts = [];
    Object.keys(params).forEach(function (key) {
      const value = params[key];
      if (value === undefined || value === null || value === '') return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    const headers = { Accept: 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const init = {
      method: method,
      headers: headers,
      credentials: opts.credentials || 'same-origin',
    };
    if (body !== undefined) {
      const isForm = typeof global.FormData !== 'undefined' && body instanceof global.FormData;
      if (isForm) {
        init.body = body; // browser sets the multipart boundary
      } else {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
    }

    return global.fetch(BASE + path, init).then(function (res) {
      const contentType = res.headers && res.headers.get ? (res.headers.get('content-type') || '') : '';
      const parsed = contentType.indexOf('application/json') !== -1
        ? res.json().catch(function () { return null; })
        : res.text().catch(function () { return ''; });

      return parsed.then(function (data) {
        if (res.ok) return data;

        if (res.status === 401 && path.indexOf('/auth/') !== 0) {
          setToken(null);
          try { global.localStorage.removeItem('waymark_user'); } catch (e) { /* noop */ }
          if (global.WM && global.WM.Auth) global.WM.Auth.clearLocal();
          if (CONFIG.REQUIRE_AUTH !== false && global.location && global.location.pathname.indexOf('login') === -1) {
            global.location.href = 'login.html';
          }
        }

        const message = (data && data.message) || (typeof data === 'string' && data) || ('Request failed with status ' + res.status);
        throw ApiError(message, res.status, data);
      });
    });
  }

  function get(path, params, opts) { return request('GET', path + qs(params), undefined, opts); }
  function post(path, body, opts) { return request('POST', path, body === undefined ? {} : body, opts); }
  function put(path, body, opts) { return request('PUT', path, body === undefined ? {} : body, opts); }
  function patch(path, body, opts) { return request('PATCH', path, body === undefined ? {} : body, opts); }
  function del(path, opts) { return request('DELETE', path, undefined, opts); }

  global.WMApi = {
    ApiError: ApiError,
    getToken: getToken,
    setToken: setToken,
    request: request,

    auth: {
      login: function (email, password) {
        return post('/auth/login', { email: email, password: password }, { credentials: 'include' })
          .then(function (data) {
            if (data && data.token) setToken(data.token);
            return data;
          });
      },
      signup: function (payload) { return post('/auth/signup', payload); },
      logout: function () {
        return post('/auth/logout').catch(function () { /* best effort */ })
          .then(function () { setToken(null); });
      },
      me: function () { return get('/auth/me'); },
      requestPasswordReset: function (email) { return post('/auth/password-reset', { email: email }); },
      resetPassword: function (token, password) { return post('/auth/password-reset/confirm', { token: token, password: password }); },
      requestOtp: function (email, purpose) {
        return post('/auth/otp/request', { email: email, purpose: purpose || 'password_reset' });
      },
      verifyOtp: function (email, purpose, code) {
        return post('/auth/otp/verify', { email: email, purpose: purpose || 'password_reset', code: code });
      },
    },

    meta: {
      get: function () { return get('/meta'); },
    },

    me: {
      registrations: function (params) { return get('/me/registrations', params); },
      certificates: function (params) { return get('/me/certificates', params); },
    },

    eventTypes: {
      list: function (params) { return get('/event-types', params); },
      get: function (id) { return get('/event-types/' + encodeURIComponent(id)); },
    },

    events: {
      list: function (params) { return get('/events', params); },
      get: function (id) { return get('/events/' + encodeURIComponent(id)); },
      create: function (data) { return post('/events', data); },
      update: function (id, data) { return put('/events/' + encodeURIComponent(id), data); },
      remove: function (id) { return del('/events/' + encodeURIComponent(id)); },
      submit: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/submit', payload); },
      cancel: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/cancel', payload); },
      complete: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/complete', payload); },
      duplicate: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/duplicate', payload); },
      approve: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/approve', payload); },
      leaderboard: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/leaderboard', params); },
      submissions: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/submissions', params); },
      roster: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/roster', params); },
      participants: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/participants', params); },
      registrations: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/registrations', params); },
      exceptions: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/exceptions', params); },
      attendance: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/attendance', params); },
      noShows: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/no-shows', params); },
      jobs: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/jobs', params); },
      results: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/results', params); },
      releaseResults: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/results/release', payload); },
      generateCertificates: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/certificates/generate', payload); },
      sendMessage: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/messages', payload); },
    },

    registrations: {
      list: function (params) { return get('/registrations', params); },
      create: function (data) { return post('/registrations', data); },
      remove: function (id) { return del('/registrations/' + encodeURIComponent(id)); },
      ticket: function (id) { return get('/registrations/' + encodeURIComponent(id) + '/ticket'); },
      qr: function (id) { return get('/registrations/' + encodeURIComponent(id) + '/qr'); },
      acceptOffer: function (id) { return post('/registrations/' + encodeURIComponent(id) + '/accept-offer'); },
      declineOffer: function (id) { return post('/registrations/' + encodeURIComponent(id) + '/decline-offer'); },
      override: function (id, payload) { return post('/registrations/' + encodeURIComponent(id) + '/override', payload); },
    },

    checkin: {
      create: function (data) { return post('/checkin', data); },
    },

    leaderboard: {
      list: function (params) { return get('/leaderboard', params); },
    },

    notifications: {
      list: function (params) { return get('/notifications', params); },
      markRead: function (id) { return post('/notifications/' + encodeURIComponent(id) + '/read'); },
      markAllRead: function () { return post('/notifications/read-all'); },
    },

    users: {
      list: function (params) { return get('/users', params); },
      me: function () { return get('/users/me'); },
      updateMe: function (data) { return put('/users/me', data); },
    },

    audit: {
      list: function (params) { return get('/audit-logs', params); },
    },

    dashboard: {
      overview: function () { return get('/dashboard'); },
    },

    jury: {
      list: function (params) { return get('/jury', params); },
      add: function (data) { return post('/jury', data); },
      remove: function (id) { return del('/jury/' + encodeURIComponent(id)); },
      assignments: function (params) { return get('/jury/assignments', params); },
      assign: function (data) { return post('/jury/assignments', data); },
      lookup: function (data) { return post('/jury/lookup', data); },
      scores: function (data) { return post('/jury/scores', data); },
    },

    rubrics: {
      list: function (params) { return get('/rubrics', params); },
      get: function (id) { return get('/rubrics/' + encodeURIComponent(id)); },
      create: function (data) { return post('/rubrics', data); },
      forEvent: function (eventId, round, data) {
        const path = '/events/' + encodeURIComponent(eventId) + '/rubrics/' + encodeURIComponent(round || 'preliminary');
        return data ? put(path, data) : get(path);
      },
    },

    submissions: {
      list: function (params) { return get('/submissions', params); },
      get: function (id) { return get('/submissions/' + encodeURIComponent(id)); },
    },

    scores: {
      create: function (data) { return post('/scores', data); },
      reopen: function (id, payload) { return post('/scores/' + encodeURIComponent(id) + '/reopen', payload); },
    },

    attendance: {
      roster: function (params) { return get('/attendance/roster', params); },
      checkIn: function (data) { return post('/attendance/check-in', data); },
      undo: function (id) { return post('/attendance/' + encodeURIComponent(id) + '/undo'); },
    },

    feedback: {
      list: function (params) { return get('/feedback', params); },
      create: function (data) { return post('/feedback', data); },
    },

    certificates: {
      list: function (params) { return get('/certificates', params); },
      issue: function (data) { return post('/certificates/issue', data); },
      withdraw: function (id, payload) { return post('/certificates/' + encodeURIComponent(id) + '/withdraw', payload); },
      verify: function (credentialId) { return get('/verify/' + encodeURIComponent(credentialId)); },
    },

    reports: {
      get: function (eventId, kind, params) {
        return get('/events/' + encodeURIComponent(eventId) + '/reports/' + encodeURIComponent(kind), params);
      },
      url: function (eventId, kind, format) {
        return BASE + '/events/' + encodeURIComponent(eventId) + '/reports/' + encodeURIComponent(kind)
          + qs({ format: format || 'pdf' });
      },
    },

    jobs: {
      list: function (params) { return get('/admin/jobs', params); },
      retry: function (id) { return post('/admin/jobs/' + encodeURIComponent(id) + '/retry'); },
    },

    messages: {
      list: function (params) { return get('/messages', params); },
      resend: function (id) { return post('/messages/' + encodeURIComponent(id) + '/resend'); },
    },

    hosting: {
      list: function (params) { return get('/hosting-requests', params); },
      get: function (id) { return get('/hosting-requests/' + encodeURIComponent(id)); },
      create: function (data) { return post('/hosting-requests', data); },
      update: function (id, data) { return put('/hosting-requests/' + encodeURIComponent(id), data); },
      resubmit: function (id, data) { return post('/hosting-requests/' + encodeURIComponent(id) + '/resubmit', data); },
      cancel: function (id, data) { return post('/hosting-requests/' + encodeURIComponent(id) + '/cancel', data); },
      approve: function (id, data) { return post('/hosting-requests/' + encodeURIComponent(id) + '/approve', data); },
      reject: function (id, data) { return post('/hosting-requests/' + encodeURIComponent(id) + '/reject', data); },
      requestChanges: function (id, data) { return post('/hosting-requests/' + encodeURIComponent(id) + '/request-changes', data); },
    },

    volunteers: {
      list: function (params) { return get('/volunteers', params); },
      create: function (data) { return post('/volunteers', data); },
      update: function (id, data) { return put('/volunteers/' + encodeURIComponent(id), data); },
      remove: function (id) { return del('/volunteers/' + encodeURIComponent(id)); },
      invite: function (id) { return post('/volunteers/' + encodeURIComponent(id) + '/invite'); },
    },

    scheduling: {
      sessions: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/sessions', params); },
      createSession: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/sessions', data); },
      session: function (id) { return get('/sessions/' + encodeURIComponent(id)); },
      updateSession: function (id, data) { return patch('/sessions/' + encodeURIComponent(id), data); },
      removeSession: function (id) { return del('/sessions/' + encodeURIComponent(id)); },
      venues: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/venues', params); },
      createVenue: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/venues', data); },
      updateVenue: function (id, data) { return patch('/venues/' + encodeURIComponent(id), data); },
      removeVenue: function (id) { return del('/venues/' + encodeURIComponent(id)); },
      resources: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/resources', params); },
      createResource: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/resources', data); },
      updateResource: function (id, data) { return patch('/resources/' + encodeURIComponent(id), data); },
      removeResource: function (id) { return del('/resources/' + encodeURIComponent(id)); },
      board: function (eventId) { return get('/events/' + encodeURIComponent(eventId) + '/schedule'); },
      validate: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/schedule/validate', data || {}); },
      conflicts: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/conflicts', params); },
      resolveConflict: function (id, data) { return post('/conflicts/' + encodeURIComponent(id) + '/resolve', data || {}); },
      dismissConflict: function (id, data) { return post('/conflicts/' + encodeURIComponent(id) + '/dismiss', data || {}); },
      applyConflict: function (id, data) { return post('/conflicts/' + encodeURIComponent(id) + '/apply', data || {}); },
      bookings: function (sessionId, params) { return get('/sessions/' + encodeURIComponent(sessionId) + '/bookings', params); },
      createBooking: function (sessionId, data) { return post('/sessions/' + encodeURIComponent(sessionId) + '/bookings', data); },
      removeBooking: function (id) { return del('/bookings/' + encodeURIComponent(id)); },
    },

    operations: {
      board: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/operations', params); },
      incidents: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/incidents', params); },
      createIncident: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/incidents', data); },
      updateIncident: function (id, data) { return patch('/incidents/' + encodeURIComponent(id), data); },
      removeIncident: function (id) { return del('/incidents/' + encodeURIComponent(id)); },
      sessionChanges: function (sessionId, data) { return post('/sessions/' + encodeURIComponent(sessionId) + '/changes', data || {}); },
    },

    tasks: {
      list: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/tasks', params); },
      create: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/tasks', data); },
      update: function (id, data) { return patch('/tasks/' + encodeURIComponent(id), data); },
      remove: function (id) { return del('/tasks/' + encodeURIComponent(id)); },
      assign: function (id, data) { return post('/tasks/' + encodeURIComponent(id) + '/assign', data || {}); },
      dependencies: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/tasks/dependencies', params); },
      recommendations: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/volunteers/recommendations', params); },
      logHours: function (eventId, volunteerId, data) { return post('/events/' + encodeURIComponent(eventId) + '/volunteers/' + encodeURIComponent(volunteerId) + '/hours', data || {}); },
    },

    finance: {
      budgetCategories: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/budget/categories', params); },
      createBudgetCategory: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/budget/categories', data); },
      updateBudgetCategory: function (id, data) { return patch('/budget/categories/' + encodeURIComponent(id), data); },
      removeBudgetCategory: function (id) { return del('/budget/categories/' + encodeURIComponent(id)); },
      budgetLines: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/budget/lines', params); },
      createBudgetLine: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/budget/lines', data); },
      updateBudgetLine: function (id, data) { return patch('/budget/lines/' + encodeURIComponent(id), data); },
      removeBudgetLine: function (id) { return del('/budget/lines/' + encodeURIComponent(id)); },
      budgetSummary: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/budget/summary', params); },
      budgetScenarios: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/budget/scenarios', params); },
      createBudgetScenario: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/budget/scenarios', data || {}); },
      sponsors: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/sponsors', params); },
      createSponsor: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/sponsors', data); },
      updateSponsor: function (id, data) { return patch('/sponsors/' + encodeURIComponent(id), data); },
      removeSponsor: function (id) { return del('/sponsors/' + encodeURIComponent(id)); },
      setDeliverables: function (id, data) { return put('/sponsors/' + encodeURIComponent(id) + '/deliverables', data || {}); },
      sponsorReport: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/sponsor-report', params); },
    },

    plans: {
      status: function () { return get('/ai/status'); },
      generate: function (data) { return post('/plans/generate', data || {}); },
      list: function (params) { return get('/plans', params); },
      get: function (id) { return get('/plans/' + encodeURIComponent(id)); },
      update: function (id, data) { return patch('/plans/' + encodeURIComponent(id), data); },
      remove: function (id) { return del('/plans/' + encodeURIComponent(id)); },
      preview: function (id, data) { return post('/plans/' + encodeURIComponent(id) + '/preview', data || {}); },
      approve: function (id, data) { return post('/plans/' + encodeURIComponent(id) + '/approve', data || {}); },
      reject: function (id, data) { return post('/plans/' + encodeURIComponent(id) + '/reject', data || {}); },
      draftSchedule: function (data) { return post('/plans/draft-schedule', data || {}); },
      draftTasks: function (data) { return post('/plans/draft-tasks', data || {}); },
      draftCommunication: function (data) { return post('/plans/draft-communication', data || {}); },
    },

    achievements: {
      eligibility: function (eventId, params) { return get('/events/' + encodeURIComponent(eventId) + '/certificates/eligibility', params); },
      issueEligible: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/certificates/issue-eligible', data || {}); },
      sync: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/achievements/sync', data || {}); },
      mine: function (params) { return get('/me/achievements', params); },
      summary: function (params) { return get('/achievements/summary', params); },
      share: function (id, data) { return patch('/achievements/' + encodeURIComponent(id) + '/share', data || {}); },
    },

    analytics: {
      event: function (eventId, params) { return get('/analytics/events/' + encodeURIComponent(eventId), params); },
      compare: function (params) { return get('/analytics/compare', params); },
      query: function (data) { return post('/analytics/query', data || {}); },
      insights: function (data) { return post('/ai/insights', data || {}); },
    },

    integrations: {
      webhooks: function (params) { return get('/webhooks', params); },
      createWebhook: function (data) { return post('/webhooks', data); },
      removeWebhook: function (id) { return del('/webhooks/' + encodeURIComponent(id)); },
      testWebhook: function (id, data) { return post('/webhooks/' + encodeURIComponent(id) + '/test', data || {}); },
      deliveries: function (id, params) { return get('/webhooks/' + encodeURIComponent(id) + '/deliveries', params); },
      retryDelivery: function (deliveryId, data) { return post('/webhooks/deliveries/' + encodeURIComponent(deliveryId) + '/retry', data || {}); },
      icsUrl: function (eventId) { return '/api/events/' + encodeURIComponent(eventId) + '/calendar.ics'; },
      importRegistrations: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/import/registrations', data); },
      exportUrl: function (eventId, kind, format) { return '/api/events/' + encodeURIComponent(eventId) + '/exports/' + encodeURIComponent(kind) + '?format=' + encodeURIComponent(format || 'csv'); },
      publicEvents: function (params) { return get('/v1/events', params); },
      publicEvent: function (id) { return get('/v1/events/' + encodeURIComponent(id)); },
      publicSchedule: function (id) { return get('/v1/events/' + encodeURIComponent(id) + '/schedule'); },
      keys: function () { return get('/integrations/keys'); },
      rotateKeys: function (data) { return patch('/integrations/keys', data || { rotate: true }); },
    },

    organizations: {
      list: function (params) { return get('/organizations', params); },
      create: function (data) { return post('/organizations', data); },
      get: function (id) { return get('/organizations/' + encodeURIComponent(id)); },
      update: function (id, data) { return patch('/organizations/' + encodeURIComponent(id), data); },
      remove: function (id) { return del('/organizations/' + encodeURIComponent(id)); },
      members: function (orgId, params) { return get('/organizations/' + encodeURIComponent(orgId) + '/members', params); },
      addMember: function (orgId, data) { return post('/organizations/' + encodeURIComponent(orgId) + '/members', data); },
      updateMember: function (memberId, data) { return patch('/organizations/members/' + encodeURIComponent(memberId), data); },
      removeMember: function (memberId) { return del('/organizations/members/' + encodeURIComponent(memberId)); },
      events: function (orgId, params) { return get('/organizations/' + encodeURIComponent(orgId) + '/events', params); },
      attachEvent: function (eventId, data) { return post('/events/' + encodeURIComponent(eventId) + '/organization', data || {}); },
    },

    payments: {
      config: function () { return get('/payments/config'); },
      checkout: function (registrationId, data) { return post('/registrations/' + encodeURIComponent(registrationId) + '/checkout', data || {}); },
      verify: function (data) { return post('/payments/verify', data || {}); },
      registration: function (registrationId, params) { return get('/registrations/' + encodeURIComponent(registrationId) + '/payment', params); },
    },

    offline: {
      syncStatus: function (eventId, params) { return get('/attendance/sync-status', params ? Object.assign({ eventId: eventId }, params) : { eventId: eventId }); },
      manifest: function (eventId, params) { return get('/attendance/offline-manifest', params ? Object.assign({ eventId: eventId }, params) : { eventId: eventId }); },
    },

    eventTypeAdmin: {
      create: function (data) { return post('/event-types', data); },
      update: function (id, data) { return patch('/event-types/' + encodeURIComponent(id), data); },
      remove: function (id) { return del('/event-types/' + encodeURIComponent(id)); },
    },

    guest: {
      activate: function (token) {
        return post('/guest/activate', { token: token }).then(function (data) {
          if (data && data.token) setToken(data.token);
          return data;
        });
      },
    },

    admin: {
      reviewQueue: function (params) { return get('/admin/review-queue', params); },
      approve: function (id, payload) { return post('/admin/events/' + encodeURIComponent(id) + '/approve', payload); },
      requestChanges: function (id, payload) { return post('/admin/events/' + encodeURIComponent(id) + '/request-changes', payload); },
      reject: function (id, payload) { return post('/admin/events/' + encodeURIComponent(id) + '/reject', payload); },
      users: function (params) { return get('/admin/users', params); },
      events: function (params) { return get('/admin/events', params); },
      audit: function (params) { return get('/admin/audit', params); },
      jobs: function (params) { return get('/admin/jobs', params); },
      retryJob: function (id) { return post('/admin/jobs/' + encodeURIComponent(id) + '/retry'); },
      removeUser: function (id, payload) { return post('/admin/users/' + encodeURIComponent(id) + '/remove', payload); },
      aiLogs: function (params) { return get('/admin/ai-logs', params); },
      settings: function () { return get('/admin/settings'); },
      updateSettings: function (data) { return patch('/admin/settings', data); },
    },

    ai: {
      draftEvent: function (data) { return post('/ai/draft-event', data); },
      draftMessage: function (data) { return post('/ai/draft-message', data); },
      summariseFeedback: function (data) { return post('/ai/summarise-feedback', data); },
      ask: function (data) { return post('/ai/ask', data); },
    },
  };
})(window);