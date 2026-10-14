/* Dashboard — role-aware for the two application roles: Normal User (upcoming,
 * QR, waitlist, certificates, feedback, plus hosted events) and Admin (review
 * queue + platform shortcuts). Jury/volunteer are scoped guests, not roles. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;
  const iconMap = { calendar: 'calendar-days', ticket: 'ticket-check', users: 'users', award: 'award' };
  const activityIconMap = { check: 'check', certificate: 'file-check-2', clock: 'clock-3', sparkles: 'sparkles', user: 'users', alert: 'shield-alert' };

  function myRegistrations() { return (D.registrations || []); }
  function isUpcoming(reg) { return reg.status === 'Confirmed' || reg.status === 'Registered'; }
  function isWaitlisted(reg) { return reg.status === 'Waitlisted' || reg.status === 'Offered'; }

  function header(role, firstName, greeting, today) {
    const actions = {
      user: '<a class="button button-primary" href="host-an-event.html">' + ic('plus', 17) + 'Host an Event</a>',
      admin: '<a class="button button-primary" href="approvals.html">' + ic('shield-check', 17) + 'Open review queue</a>',
    };
    const ledes = {
      user: 'Your next events, tickets, and hosted events \u2014 all in one place.',
      admin: 'Platform health, review queue, and recent activity.',
    };
    return '<div class="welcome-row"><div><div class="eyebrow">' + esc(today) + '</div>'
      + '<h1>' + esc(greeting) + ', ' + esc(firstName) + '.</h1><p class="lede">' + ledes[role] + '</p></div>'
      + (actions[role] || actions.user) + '</div>';
  }

  /* ---------- Participant ---------- */
  function participantSection() {
    const regs = myRegistrations();
    const upcoming = regs.filter(isUpcoming);
    const waitlisted = regs.filter(isWaitlisted);
    const validCerts = (D.certificates || []).filter(function (c) { return c.status === 'Valid' || !c.status; });
    const completed = regs.filter(function (r) { return r.status === 'Completed'; });
    const feedbackEventIds = (D.feedback || []).map(function (f) { return String(f.eventId); });
    const feedbackPending = completed.filter(function (r) { return feedbackEventIds.indexOf(String(r.eventId)) === -1; });

    const stats = [
      ui.statCard({ label: 'Upcoming events', value: String(upcoming.length), detail: upcoming.length ? 'Next: ' + upcoming[0].eventTitle : 'Nothing scheduled yet', icon: 'calendar-days', accent: 'blue' }),
      ui.statCard({ label: 'Waitlist', value: String(waitlisted.length), detail: waitlisted.length ? 'Offers expire in 48h' : 'No waitlist entries', icon: 'clock-3', accent: 'amber' }),
      ui.statCard({ label: 'Certificates ready', value: String(validCerts.length), detail: 'Ready to download & verify', icon: 'award', accent: 'teal' }),
      ui.statCard({ label: 'Feedback pending', value: String(feedbackPending.length), detail: 'Events awaiting your review', icon: 'message-square', accent: 'rose' }),
    ].join('');

    const next = upcoming[0];
    const nextCard = next
      ? '<section class="panel panel-wide next-event-panel">' + ui.sectionHeading({ eyebrow: 'Next up', title: 'Your next event' })
        + '<div class="fact-grid"><div class="fact-item"><span>Event</span><strong>' + esc(next.eventTitle) + '</strong></div>'
        + '<div class="fact-item"><span>Date</span><strong>' + esc(next.date) + '</strong></div>'
        + '<div class="fact-item"><span>Time</span><strong>' + esc(next.time || '\u2014') + '</strong></div>'
        + '<div class="fact-item"><span>Venue</span><strong>' + esc(next.location || '\u2014') + '</strong></div></div>'
        + '<div class="modal-actions"><a class="button button-secondary" href="discover.html">Browse more events</a>'
        + '<a class="button button-primary" href="registrations.html">' + ic('qr-code', 16) + ' View ticket & QR pass</a></div></section>'
      : ui.emptyView({ title: 'No upcoming events', description: 'Find your next meaningful room on the discovery page.', action: '<a class="button button-primary" href="discover.html">Discover events</a>' });

    const waitlistRows = waitlisted.map(function (reg) {
      return '<div class="event-row"><div class="event-row-main"><div class="event-row-title"><strong>' + esc(reg.eventTitle) + '</strong>'
        + WM.statusChip(reg.status) + '</div><span>' + esc(reg.date) + ' \u00b7 ' + esc(reg.location || '') + '</span>'
        + '<small>' + (reg.status === 'Offered' ? 'A seat opened up \u2014 accept before the offer expires.' : 'You are on the waitlist. We will email you when a seat opens.') + '</small></div>'
        + (reg.status === 'Offered' ? '<button class="button button-primary" data-accept-offer="' + esc(reg.id) + '">Accept offer</button>' : '')
        + '</div>';
    }).join('');

    const certRows = validCerts.slice(0, 3).map(function (c) {
      return '<div class="timeline-item"><span class="timeline-dot timeline-dot-green"></span>'
        + '<div><strong>' + esc(c.eventTitle || c.event || 'Certificate') + '</strong>'
        + '<span class="mono">' + esc(c.credentialId || c.id || '') + '</span></div></div>';
    }).join('') || '<p class="lede">Certificates appear here after you complete an event.</p>';

    const feedbackRows = feedbackPending.slice(0, 3).map(function (reg) {
      return '<div class="event-row"><div class="event-row-main"><div class="event-row-title"><strong>' + esc(reg.eventTitle) + '</strong></div>'
        + '<span>' + esc(reg.date) + '</span><small>How was it? Your feedback shapes the next edition.</small></div>'
        + '<a class="button button-secondary" href="forms-feedback.html">Share feedback</a></div>';
    }).join('') || '<p class="lede">No feedback requests right now.</p>';

    return '<div class="stat-grid">' + stats + '</div>'
      + nextCard
      + '<div class="content-grid">'
      + '<section class="panel panel-wide">' + ui.sectionHeading({ eyebrow: 'Seats opening up', title: 'Waitlist' })
      + (waitlistRows || '<p class="lede">You are not on any waitlists.</p>') + '</section>'
      + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Credentials', title: 'Certificates', action: '<a class="button button-ghost" href="my-certificates.html">View all ' + ic('chevron-right', 15) + '</a>' })
      + '<div class="timeline">' + certRows + '</div></section>'
      + '</div>'
      + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Tell us how it went', title: 'Feedback pending' })
      + '<div class="event-list">' + feedbackRows + '</div></section>';
  }

  /* ---------- Admin ---------- */
  function adminSection() {
    const pending = (D.events || []).filter(function (e) {
      const s = e.approvalStatus || '';
      return s === 'Pending approval' || s === 'Pending review' || s === 'Changes requested';
    });
    const failedJobs = 0;
    const quick = [
      ['Review queue', 'Approve or request changes on submitted events', 'approvals.html'],
      ['Jobs & failed sends', 'Retry failed email and processing jobs', 'admin-jobs.html'],
      ['AI log', 'Prompts and outcomes from the assistant', 'ai-log.html'],
      ['Platform settings', 'Defaults, branding, and AI budget', 'settings.html'],
    ].map(function (q) {
      return '<a class="quick-action-item" href="' + q[2] + '"><div><strong>' + esc(q[0]) + '</strong><small>' + esc(q[1]) + '</small></div>' + ic('chevron-right', 16) + '</a>';
    }).join('');

    const reviewRows = pending.slice(0, 4).map(function (e) {
      return '<div class="event-row"><div class="event-row-main"><div class="event-row-title"><strong>' + esc(e.title) + '</strong>'
        + WM.statusChip(e.approvalStatus) + '</div><span>' + esc(e.category) + ' \u00b7 submitted ' + esc(e.submittedAt || e.createdAt || '\u2014') + '</span></div>'
        + '<a class="button button-secondary" href="approvals.html">Review</a></div>';
    }).join('') || '<p class="lede">Review queue is clear. Nice.</p>';

    return '<div class="stat-grid compact">'
      + ui.statCard({ label: 'Awaiting review', value: String(pending.length), detail: 'Events needing a decision', icon: 'shield-check', accent: 'amber' })
      + ui.statCard({ label: 'Failed jobs', value: String(failedJobs), detail: 'Check jobs & failed sends', icon: 'list-x', accent: 'rose' })
      + ui.statCard({ label: 'Platform events', value: String((D.events || []).length), detail: 'Across all hosts', icon: 'calendar-days', accent: 'blue' })
      + '</div>'
      + '<div class="content-grid">'
      + '<section class="panel panel-wide">' + ui.sectionHeading({ eyebrow: 'Moderation', title: 'Review queue' })
      + '<div class="event-list">' + reviewRows + '</div></section>'
      + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Shortcuts', title: 'Admin tools' })
      + '<div class="quick-action-list">' + quick + '</div></section>'
      + '</div>';
  }

  /* ---------- Host overview (existing blueprint table + charts) ---------- */
  function hostSection() {
    const state = WM.__dashboardState;
    const cats = D.eventCategories, stats = D.eventStatuses;

    const filtered = D.dashboardEvents.filter(function (event) {
      const q = (event.title + ' ' + event.category + ' ' + event.location).toLowerCase();
      const matchesQuery = q.indexOf(state.query.toLowerCase()) !== -1;
      const matchesCategory = state.category === cats[0] || event.category === state.category;
      const matchesStatus = state.status === stats[0] || event.status === state.status;
      return matchesQuery && matchesCategory && matchesStatus;
    });

    const statCards = D.summaryStats.map(function (stat) {
      return ui.statCard({
        label: stat.label, value: stat.value, detail: stat.detail, accent: stat.accent,
        icon: iconMap[stat.icon], dashboard: true, delta: stat.delta, deltaUp: stat.deltaUp,
      });
    }).join('');

    const rows = filtered.map(function (event) {
      const pct = Math.round((event.registrations / event.capacity) * 100);
      const color = event.registrations / event.capacity > 0.9 ? '#d97f4f' : '#3b6fe0';
      return '<div class="dashboard-table-row">'
        + '<div class="table-event"><div class="mini-thumb ' + event.color + '">' + esc(event.initials) + '</div>'
        + '<div><strong>' + esc(event.title) + '</strong><small>' + esc(event.category) + '</small></div></div>'
        + '<span class="dashboard-cell-date">' + esc(event.date) + '</span>'
        + '<div class="dashboard-reg-cell"><span class="dashboard-reg-num">' + event.registrations + '/' + event.capacity + '</span>'
        + '<div class="capacity-bar"><div class="capacity-fill" style="width:' + pct + '%;background:' + color + '"></div></div></div>'
        + WM.statusChip(event.status)
        + '<a class="row-action" href="workspace.html">Manage ' + ic('chevron-right', 15) + '</a></div>';
    }).join('');

    const hasFilters = state.query || state.category !== cats[0] || state.status !== stats[0];
    const tableBody = filtered.length > 0
      ? '<div class="dashboard-table-wrap"><div class="dashboard-table-head"><span>Event</span><span>Date</span>'
        + '<span>Registrations</span><span>Status</span><span></span></div>' + rows + '</div>'
      : '<div class="dashboard-empty"><p>No events match your filters.</p>'
        + '<button class="button button-secondary" data-reset>Reset filters</button></div>';

    const activity = D.recentActivities.map(function (item) {
      return '<div class="activity-item"><span class="activity-icon activity-' + item.tone + '">' + ic(activityIconMap[item.icon], 16) + '</span>'
        + '<div><strong>' + esc(item.title) + '</strong><span>' + esc(item.detail) + '</span></div>'
        + '<time>' + esc(item.time) + '</time></div>';
    }).join('');

    const quickActions = D.quickActions.map(function (a, index) {
      const hrefs = ['wizard.html', 'messages.html', 'forms-certificates.html', 'reports.html'];
      return '<a class="quick-action-item" href="' + (hrefs[index] || 'forms.html') + '"><div><strong>' + esc(a.label) + '</strong><small>' + esc(a.detail) + '</small></div>'
        + ic('chevron-right', 16, 'class="row-chevron"') + '</a>';
    }).join('');

    const notifTone = { reminder: 'amber', certificate: 'blue', approval: 'green', alert: 'red' };
    const notifIcon = { reminder: 'clock-3', certificate: 'file-check-2', approval: 'check', alert: 'shield-alert' };
    const notifItems = D.notifications.slice(0, 3).map(function (n) {
      const tone = notifTone[n.type] || 'slate';
      const icon = notifIcon[n.type] || 'bell';
      return '<div class="activity-item"><span class="activity-icon activity-' + tone + '">' + ic(icon, 16) + '</span>'
        + '<div><strong>' + esc(n.title) + '</strong><span>' + esc(n.message) + '</span></div>'
        + '<time>' + esc(n.time) + '</time></div>';
    }).join('') || '<p class="lede">No notifications yet.</p>';

    return '<div class="stat-grid">' + statCards + '</div>'

      + '<div class="dashboard-chart-row">'
      + '<section class="panel panel-wide">' + ui.sectionHeading({ eyebrow: 'Growth', title: 'Registration trend', action: '<div class="chart-period-tabs"><button class="active">6 months</button><button>Year</button></div>' }) + WM.charts.lineChart(D.registrationTrend) + '</section>'
      + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Distribution', title: 'Events by category' }) + WM.charts.donutChart(D.categoryBreakdown) + '</section>'
      + '</div>'

      + '<div class="dashboard-chart-row">'
      + '<section class="panel panel-wide">' + ui.sectionHeading({ eyebrow: 'This week', title: 'Attendance overview' }) + WM.charts.barChart(D.attendanceData) + '</section>'
      + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Shortcuts', title: 'Quick actions' }) + '<div class="quick-action-list">' + quickActions + '</div></section>'
      + '</div>'

      + '<section class="panel table-panel dashboard-table-panel"><div class="dashboard-table-header">'
      + ui.sectionHeading({ eyebrow: 'Manage', title: 'Events overview' })
      + '<div class="search-toolbar dashboard-toolbar">'
      + '<label class="search-field">' + ic('search', 18) + '<input id="dash-search" value="' + esc(state.query) + '" placeholder="Search events..." /></label>'
      + '<label class="select-field">' + ic('filter', 17) + '<select id="dash-category">'
      + cats.map(function (c) { return '<option' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('')
      + '</select>' + ic('chevron-down', 16) + '</label>'
      + '<label class="select-field">' + ic('layout-dashboard', 17) + '<select id="dash-status">'
      + stats.map(function (s) { return '<option' + (s === state.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('')
      + '</select>' + ic('chevron-down', 16) + '</label>'
      + '</div></div>'
      + '<div class="result-meta dashboard-result-meta"><span>' + filtered.length + ' of ' + D.dashboardEvents.length + ' events</span>'
      + (hasFilters ? '<button data-reset>Reset filters</button>' : '') + '</div>'
      + tableBody + '</section>'

      + '<div class="content-grid">'
      + '<section class="panel panel-wide">' + ui.sectionHeading({ eyebrow: 'Timeline', title: 'Recent activity', action: '<a class="button button-ghost" href="audit.html">View all ' + ic('chevron-right', 16) + '</a>' }) + '<div class="activity-list">' + activity + '</div></section>'
      + '<section class="panel notification-panel">' + ui.sectionHeading({ eyebrow: 'Stay in the loop', title: 'Notifications', action: '<a class="icon-button" href="notifications.html">' + ic('activity', 19) + '</a>' }) + '<div class="activity-list">'
      + notifItems
      + '</div><a class="button button-secondary full-button" href="notifications.html">Open notification inbox</a></section>'
      + '</div>';
  }

  function render() {
    const role = WM.Auth.getRole();
    const user = WM.Auth.getUser();
    const firstName = user && user.name ? String(user.name).split(' ')[0] : 'there';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const body = role === 'admin' ? adminSection() + hostSection()
      : participantSection() + hostSection();

    return '<div class="page-stack">'
      + header(role, firstName, greeting, today)
      + body
      + '<section class="discover-banner"><div class="banner-mark">' + ic('sparkles', 23) + '</div>'
      + '<div><strong>Find your next meaningful room.</strong>'
      + '<span>Discover workshops, competitions, and communities built around shared momentum.</span></div>'
      + '<a class="button button-secondary" href="discover.html">Explore events ' + ic('chevron-right', 16) + '</a></section>'
      + '</div>';
  }

  function mounted(ref) {
    const role = WM.Auth.getRole();

    function refresh(focusId) { WM.refreshContent(render, focusId); wire(); }

    function wire() {
      const q = document.getElementById('dash-search');
      if (q) q.addEventListener('input', function () {
        WM.__dashboardState.query = q.value;
        const pos = q.selectionStart;
        refresh('dash-search');
        const nq = document.getElementById('dash-search');
        if (nq && nq.setSelectionRange) nq.setSelectionRange(pos, pos);
      });
      const cat = document.getElementById('dash-category');
      if (cat) cat.addEventListener('change', function () { WM.__dashboardState.category = cat.value; refresh(); });
      const st = document.getElementById('dash-status');
      if (st) st.addEventListener('change', function () { WM.__dashboardState.status = st.value; refresh(); });
      document.querySelectorAll('[data-reset]').forEach(function (b) {
        b.addEventListener('click', function () {
          WM.__dashboardState = { query: '', category: D.eventCategories[0], status: D.eventStatuses[0] };
          refresh();
        });
      });
      document.querySelectorAll('[data-accept-offer]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-accept-offer');
          b.disabled = true;
          global.WMApi.registrations.acceptOffer(id).then(function () {
            WM.toast('Seat accepted \u2014 your registration is confirmed.');
            refresh();
          }, function (err) {
            b.disabled = false;
            WM.toast((err && err.message) || 'Could not accept the offer.', 'error');
          });
        });
      });
    }
    wire();
  }

  WM.__dashboardState = WM.__dashboardState || { query: '', category: D.eventCategories[0], status: D.eventStatuses[0] };
  WM.page({ route: '/', render: render, mounted: mounted, load: function () { return D.ready(); } });
})(window);