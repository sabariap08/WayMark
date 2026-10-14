/* WayMark frontend configuration.
 *
 * Point API_BASE_URL at your Flask backend. If Flask serves these static
 * files itself (e.g. via send_from_directory or a static folder), the
 * default same-origin path "/api" works without changes.
 *
 * WayMark has exactly two application roles: Admin and Normal User. Jury and
 * volunteer guests activate scoped links (?token=) and never become a role.
 *
 * Example Flask blueprints expected (all JSON):
 *   /api/auth, /api/events, /api/registrations, /api/users, /api/notifications,
 *   /api/audit-logs, /api/leaderboard, /api/meta, /api/dashboard, /api/jury,
 *   /api/rubrics, /api/submissions, /api/scores, /api/attendance, /api/feedback,
 *   /api/certificates, /api/hosting-requests, /api/volunteers, /api/guest
 */
window.WM_CONFIG = {
  API_BASE_URL: '/api',
  TOKEN_KEY: 'waymark_token',

  // Set to false only if you want to browse pages without a Flask backend.
  REQUIRE_AUTH: false,

  // Optional: the login page shows a "Use demo account" shortcut when set.
  DEMO_EMAIL: '',
  DEMO_PASSWORD: '',
};

// Apply the saved theme as early as possible to avoid a flash of the
// wrong palette. lib.js owns the toggle; this only reads the value.
(function () {
  try {
    var saved = localStorage.getItem('waymark_theme');
    document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();