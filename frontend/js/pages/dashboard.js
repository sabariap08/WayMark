/* Dashboard — ports pages/DashboardPage.tsx */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;
  const iconMap = { calendar: 'calendar-days', ticket: 'ticket-check', users: 'users', award: 'award' };
  const activityIconMap = { check: 'check', certificate: 'file-check-2', clock: 'clock-3', sparkles: 'sparkles', user: 'users', alert: 'shield-alert' };

  function render() {
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
      const color = event.registrations / event.capacity > 0.9 ? '#d97f4f' : '#3a8d72';
      return '<div class="dashboard-table-row">'
        + '<div class="table-event"><div class="mini-thumb ' + event.color + '">' + esc(event.initials) + '</div>'
        + '<div><strong>' + esc(event.title) + '</strong><small>' + esc(event.category) + '</small></div></div>'
        + '<span class="dashboard-cell-date">' + esc(event.date) + '</span>'
        + '<div class="dashboard-reg-cell"><span class="dashboard-reg-num">' + event.registrations + '/' + event.capacity + '</span>'
        + '<div class="capacity-bar"><div class="capacity-fill" style="width:' + pct + '%;background:' + color + '"></div></div></div>'
        + ui.badge(event.status, event.tone)
        + '<button class="row-action">Manage ' + ic('chevron-right', 15) + '</button></div>';
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

    const quickActions = D.quickActions.map(function (a) {
      return '<button class="quick-action-item"><div><strong>' + esc(a.label) + '</strong><small>' + esc(a.detail) + '</small></div>'
        + ic('chevron-right', 16, 'class="row-chevron"') + '</button>';
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

    const user = WM.Auth.getUser();
    const firstName = user && user.name ? String(user.name).split(' ')[0] : 'there';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return '<div class="page-stack">'
      + '<div class="welcome-row"><div><div class="eyebrow">' + esc(today) + '</div>'
      + '<h1>' + esc(greeting) + ', ' + esc(firstName) + '.</h1><p class="lede">Here\u2019s what\u2019s happening across your events today.</p></div>'
      + '<button class="button button-primary">' + ic('plus', 17) + 'Create event</button></div>'

      + '<div class="stat-grid">' + statCards + '</div>'

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
      + '<section class="panel panel-wide">' + ui.sectionHeading({ eyebrow: 'Timeline', title: 'Recent activity', action: '<button class="button button-ghost">View all ' + ic('chevron-right', 16) + '</button>' }) + '<div class="activity-list">' + activity + '</div></section>'
      + '<section class="panel notification-panel">' + ui.sectionHeading({ eyebrow: 'Stay in the loop', title: 'Notifications', action: '<button class="icon-button">' + ic('activity', 19) + '</button>' }) + '<div class="activity-list">'
      + notifItems
      + '</div><a class="button button-secondary full-button" href="notifications.html">Open notification inbox</a></section>'
      + '</div>'

      + '<section class="discover-banner"><div class="banner-mark">' + ic('sparkles', 23) + '</div>'
      + '<div><strong>Find your next meaningful room.</strong>'
      + '<span>Discover workshops, competitions, and communities built around shared momentum.</span></div>'
      + '<a class="button button-secondary" href="discover.html">Explore events ' + ic('chevron-right', 16) + '</a></section>'
      + '</div>';
  }

  function mounted(ref) {
    const content = ref.content;
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
    }
    wire();
  }

  WM.__dashboardState = WM.__dashboardState || { query: '', category: D.eventCategories[0], status: D.eventStatuses[0] };
  WM.page({ route: '/', render: render, mounted: mounted, load: function () { return D.ready(); } });
})(window);
