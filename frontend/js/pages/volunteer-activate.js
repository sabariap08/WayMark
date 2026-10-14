/* Volunteer session — activates a volunteer invite link (?token=…) into a
 * scoped guest session. No account is created and no application role granted. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  function volunteerSession() {
    const tokenParam = (function () {
      const m = /[?&]token=([^&]+)/.exec(global.location ? (global.location.search || '') : '');
      return m ? decodeURIComponent(m[1]) : '';
    })();

    const state = { status: tokenParam ? 'loading' : 'error', message: tokenParam ? '' : 'This link is missing its invite token.', volunteer: null };

    function card(inner) {
      return '<div class="auth-shell"><div class="auth-card">' + inner + '</div></div>';
    }

    function render() {
      if (state.status === 'loading') {
        return card('<div class="auth-loading"><span class="loading-spinner"></span><p>Activating your volunteer session…</p></div>');
      }
      if (state.status === 'error') {
        return card('<div class="auth-success"><div class="success-icon">' + ic('alert-circle', 24) + '</div>'
          + '<h3>We could not open this invite</h3><p>' + esc(state.message) + '</p>'
          + '<a class="button button-primary" href="login.html">Go to sign in ' + ic('arrow-right', 16) + '</a></div>');
      }
      const v = state.volunteer || {};
      return card('<div class="auth-success"><div class="success-icon">' + ic('check', 24) + '</div>'
        + '<h3>Welcome, ' + esc(v.name || 'volunteer') + '.</h3>'
        + '<p>You are confirmed as a volunteer' + (v.eventTitle ? ' for ' + esc(v.eventTitle) : '') + '.</p>'
        + '<div class="fact-grid"><div class="fact-item"><span>Department</span><strong>' + esc(v.department || '—') + '</strong></div>'
        + '<div class="fact-item"><span>Responsibility</span><strong>' + esc(v.responsibility || '—') + '</strong></div>'
        + '<div class="fact-item"><span>Shift</span><strong>' + esc((v.shiftDate || '') + ' ' + (v.shiftTime || '')) + '</strong></div>'
        + '<div class="fact-item"><span>Status</span><strong>' + esc(v.status || 'Confirmed') + '</strong></div></div>'
        + '<a class="button button-primary" href="index.html">Open WayMark ' + ic('arrow-right', 16) + '</a></div>');
    }

    function mount() {
      WM.page({ route: '/volunteer', requiresLayout: false, render: render });
      if (!tokenParam) return;
      global.WMApi.guest.activate(tokenParam).then(function (data) {
        state.status = 'success';
        state.volunteer = (data && data.volunteer) || {};
        WM.reload();
        WM.toast('Volunteer session activated.');
      }, function (err) {
        state.status = 'error';
        state.message = (err && err.message) || 'This guest link is invalid or has expired.';
        WM.reload();
      });
    }

    mount();
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.volunteerSession = volunteerSession;
})(window);
