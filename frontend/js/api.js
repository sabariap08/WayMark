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
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
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
    },

    meta: {
      get: function () { return get('/meta'); },
    },

    events: {
      list: function (params) { return get('/events', params); },
      get: function (id) { return get('/events/' + encodeURIComponent(id)); },
      create: function (data) { return post('/events', data); },
      update: function (id, data) { return put('/events/' + encodeURIComponent(id), data); },
      remove: function (id) { return del('/events/' + encodeURIComponent(id)); },
      submit: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/submit', payload); },
      approve: function (id, payload) { return post('/events/' + encodeURIComponent(id) + '/approve', payload); },
      leaderboard: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/leaderboard', params); },
      submissions: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/submissions', params); },
      roster: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/roster', params); },
      participants: function (id, params) { return get('/events/' + encodeURIComponent(id) + '/participants', params); },
    },

    registrations: {
      list: function (params) { return get('/registrations', params); },
      create: function (data) { return post('/registrations', data); },
      remove: function (id) { return del('/registrations/' + encodeURIComponent(id)); },
      ticket: function (id) { return get('/registrations/' + encodeURIComponent(id) + '/ticket'); },
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
    },

    rubrics: {
      list: function (params) { return get('/rubrics', params); },
      get: function (id) { return get('/rubrics/' + encodeURIComponent(id)); },
      create: function (data) { return post('/rubrics', data); },
    },

    submissions: {
      list: function (params) { return get('/submissions', params); },
      get: function (id) { return get('/submissions/' + encodeURIComponent(id)); },
    },

    scores: {
      create: function (data) { return post('/scores', data); },
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
      verify: function (credentialId) { return get('/certificates/verify/' + encodeURIComponent(credentialId)); },
    },
  };
})(window);