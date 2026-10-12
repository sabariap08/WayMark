/* Workspace pages — ports pages/WorkspacePages.tsx */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;
  const LOAD = function () { return D.ready(); };

  function tableHead(labels) {
    return '<div class="table-head">' + labels.map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('') + '</div>';
  }
  function tableEvent(o) {
    return '<div class="table-event"><div class="mini-thumb ' + o.color + '">' + esc(o.initials) + '</div>'
      + '<div><strong>' + esc(o.title) + '</strong><small>' + esc(o.category) + '</small></div></div>';
  }
  function eventInitials(title) {
    return String(title || '').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
  }

  /* ===================== Discover ===================== */
  function discover() {
    const state = { query: '', category: 'All categories' };

    function render() {
      const events = D.events;
      const filtered = events.filter(function (event) {
        const q = (event.title + ' ' + event.category + ' ' + event.location).toLowerCase();
        return q.indexOf(state.query.toLowerCase()) !== -1
          && (state.category === 'All categories' || event.category === state.category);
      });

const cards = filtered.map(function (event) {
        const capacity = event.capacityNum || 0;
        const registered = event.registeredNum || 0;
        const seatsLeft = capacity ? Math.max(capacity - registered, 0) : null;
        const seatLabel = seatsLeft == null ? (event.seats || 'Open registration')
          : (seatsLeft === 0 ? 'Waitlist only' : seatsLeft + ' of ' + capacity + ' seats left');
        return '<article class="event-card" data-event="' + esc(event.id) + '">'
          + '<div class="card-art ' + event.color + '"><span>' + esc(event.initials) + '</span>' + ui.badge(event.status, event.tone) + '</div>'
          + '<div class="event-card-body"><div class="eyebrow">' + esc(event.category) + '</div><h3>' + esc(event.title) + '</h3>'
          + '<p>' + ic('calendar-days', 15) + esc(event.date) + ' \u00b7 ' + esc(event.time) + '</p>'
          + '<p>' + ic('users', 15) + esc(event.location) + '</p>'
          + '<div class="card-footer"><span>' + (seatsLeft === 0 ? '<span class="status-badge status-amber">Waitlist</span> ' : '') + esc(seatLabel) + '</span>'
          + '<span class="text-link">View details ' + ic('chevron-right', 14) + '</span></div></div></article>';
      }).join('');

      const grid = filtered.length
        ? '<div class="event-grid">' + cards + '</div>'
        : ui.emptyView({ title: 'No events found', description: 'Try a different keyword or reset your filters.', action: '<button class="button button-secondary" data-reset>Reset filters</button>' });

      const cats = D.eventCategories;
      return '<div class="page-stack">'
        + '<div class="welcome-row"><div><div class="eyebrow">Open doors</div><h1>Discover events</h1>'
        + '<p class="lede">Find the spaces, people, and ideas worth showing up for.</p></div>'
        + '<a class="button button-primary" href="wizard.html">' + ic('plus', 17) + 'Create event</a></div>'
        + '<div class="search-toolbar"><label class="search-field">' + ic('search', 18)
        + '<input id="disc-search" value="' + esc(state.query) + '" placeholder="Search events, topics, or keywords" /></label>'
        + '<label class="select-field">' + ic('filter', 17) + '<select id="disc-category">'
        + cats.map(function (c) { return '<option' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('')
        + '</select>' + ic('chevron-down', 16) + '</label>'
        + '<button class="button button-secondary">Date range ' + ic('chevron-down', 15) + '</button></div>'
        + '<div class="result-meta"><span>' + filtered.length + ' events available</span>'
        + '<button>Sort by <strong>Recently added</strong> ' + ic('chevron-down', 14) + '</button></div>'
        + grid + '</div>';
    }

    function refresh(focusId) { WM.refreshContent(render, focusId); wire(); }

    function wire() {
      const q = document.getElementById('disc-search');
      if (q) q.addEventListener('input', function () {
        state.query = q.value; const pos = q.selectionStart; refresh('disc-search');
        const nq = document.getElementById('disc-search'); if (nq && nq.setSelectionRange) nq.setSelectionRange(pos, pos);
      });
      const cat = document.getElementById('disc-category');
      if (cat) cat.addEventListener('change', function () { state.category = cat.value; refresh(); });
      document.querySelectorAll('[data-reset]').forEach(function (b) {
        b.addEventListener('click', function () { state.query = ''; state.category = 'All categories'; refresh(); });
      });
      document.querySelectorAll('[data-event]').forEach(function (card) {
        card.addEventListener('click', function () {
          window.location.href = 'event-detail.html?id=' + encodeURIComponent(card.getAttribute('data-event'));
        });
      });
    }

    WM.page({ route: '/discover', render: render, mounted: wire, load: LOAD });
  }

  /* ===================== Registrations ===================== */
  function registrations() {
    const state = { tab: 'all' };

    function render() {
      const regs = D.registrations;
      const leaderboard = D.leaderboard;
      const waitlisted = regs.filter(function (r) { return r.status === 'Waitlisted' || r.status === 'Offered'; });
      const filtered = state.tab === 'upcoming' ? regs.filter(function (r) { return r.status === 'Confirmed'; })
        : state.tab === 'completed' ? regs.filter(function (r) { return r.status === 'Completed'; })
          : state.tab === 'waitlist' ? waitlisted : regs;

      const rows = filtered.map(function (reg) {
        return '<div class="table-row">'
          + tableEvent({ title: reg.eventTitle, category: reg.category, initials: eventInitials(reg.eventTitle), color: 'bg-cyan-700' })
          + '<span>' + esc(reg.date) + '</span>'
          + WM.statusChip(reg.status)
          + '<span>' + esc(reg.attendanceStatus) + '</span>'
          + '<div class="row-actions-cell">'
          + (reg.status === 'Offered'
            ? '<button class="button button-primary" data-accept-offer="' + esc(reg.id) + '">Accept offer</button>'
            + '<button class="button button-secondary" data-decline-offer="' + esc(reg.id) + '">Decline</button>'
            : '')
          + '<button class="row-action" data-ticket="' + esc(reg.id) + '">View Ticket ' + ic('chevron-right', 15) + '</button></div></div>';
      }).join('');

      const lb = leaderboard.map(function (item) {
        return '<div class="leaderboard-row"><div class="rank-badge rank-' + item.rank + '">' + item.rank + '</div>'
          + '<div class="leaderboard-main"><strong>' + esc(item.teamName) + ' — ' + esc(item.projectTitle) + '</strong>'
          + '<small>Track: ' + esc(item.track) + '</small></div>'
          + '<div class="leaderboard-score"><strong>' + item.score + ' / ' + item.maxScore + ' pts</strong></div>'
          + ui.badge(item.award, item.tone) + '</div>';
      }).join('');

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Your journey', title: 'My registrations', action: '<button class="button button-secondary" data-download-list>' + ic('download', 15) + 'Download list</button>' })
        + '<div class="filter-tabs">'
        + '<button class="' + (state.tab === 'all' ? 'active' : '') + '" data-tab="all">All <span>' + regs.length + '</span></button>'
        + '<button class="' + (state.tab === 'upcoming' ? 'active' : '') + '" data-tab="upcoming">Upcoming <span>' + regs.filter(function (r) { return r.status === 'Confirmed'; }).length + '</span></button>'
        + '<button class="' + (state.tab === 'waitlist' ? 'active' : '') + '" data-tab="waitlist">Waitlist <span>' + waitlisted.length + '</span></button>'
        + '<button class="' + (state.tab === 'completed' ? 'active' : '') + '" data-tab="completed">Completed <span>' + regs.filter(function (r) { return r.status === 'Completed'; }).length + '</span></button>'
        + '</div>'
        + '<section class="panel table-panel">' + tableHead(['Event', 'Date', 'Registration', 'Attendance', 'Ticket']) + rows + '</section>'
        + '<section class="panel leaderboard-panel">' + ui.sectionHeading({ eyebrow: 'Rankings & Results', title: 'Event Winners & Leaderboard' })
        + '<div class="leaderboard-list">' + lb + '</div></section>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function wire() {
      document.querySelectorAll('[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); refresh(); });
      });
      document.querySelectorAll('[data-ticket]').forEach(function (b) {
        b.addEventListener('click', function () {
          const reg = D.registrations.find(function (r) { return String(r.id) === b.getAttribute('data-ticket'); });
          if (reg) WM.openModal(ticketModal(reg));
        });
      });
      document.querySelectorAll('[data-accept-offer]').forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          global.WMApi.registrations.acceptOffer(b.getAttribute('data-accept-offer')).then(function () {
            WM.toast('Seat accepted \u2014 your registration is confirmed.');
            refresh();
          }, function (err) {
            b.disabled = false;
            WM.toast((err && err.message) || 'Could not accept the offer.', 'error');
          });
        });
      });
      document.querySelectorAll('[data-decline-offer]').forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          global.WMApi.registrations.declineOffer(b.getAttribute('data-decline-offer')).then(function () {
            WM.toast('Offer declined \u2014 the seat goes to the next person in line.', 'warning');
            refresh();
          }, function (err) {
            b.disabled = false;
            WM.toast((err && err.message) || 'Could not decline the offer.', 'error');
          });
        });
      });
      const dl = document.querySelector('[data-download-list]');
      if (dl) dl.addEventListener('click', function () {
        const csv = 'Event Title,Category,Date,Time,Location,Status,Ticket Code\n'
          + D.registrations.map(function (r) { return '"' + r.eventTitle + '","' + r.category + '","' + r.date + '","' + r.time + '","' + r.location + '","' + r.status + '","' + r.ticketCode + '"'; }).join('\n');
        WM.downloadCSV('waymark-registrations.csv', csv);
      });
    }

    function ticketModal(reg) {
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<div class="ticket-modal-head"><div class="modal-icon">' + ic('qr-code', 24) + '</div>'
        + '<span class="eyebrow">Official Event Pass</span><h2>' + esc(reg.eventTitle) + '</h2>'
        + WM.statusChip(reg.status) + '</div>'
        + '<div class="ticket-card-body"><div class="ticket-qr-wrap">' + ic('qr-code', 120, 'stroke-width="1.5"')
        + '<code class="ticket-code">' + esc(reg.ticketCode) + '</code></div>'
        + '<div class="ticket-meta-grid">'
        + '<div><span>Date</span><strong>' + esc(reg.date) + '</strong></div>'
        + '<div><span>Time</span><strong>' + esc(reg.time) + '</strong></div>'
        + '<div><span>Venue</span><strong>' + esc(reg.location) + '</strong></div>'
        + '<div><span>Attendance</span><strong>' + esc(reg.attendanceStatus) + '</strong></div></div></div>'
        + '<div class="modal-actions"><button class="button button-secondary" data-close-modal>Close</button>'
        + '<button class="button button-primary" data-download-ticket="' + esc(reg.ticketCode) + '">' + ic('download', 15) + 'Download Ticket Pass</button></div>'
        + '</section></div>';
    }

    document.addEventListener('click', function (e) {
      const t = e.target.closest('[data-download-ticket]');
      if (t) alert('Downloaded ticket pass ' + t.getAttribute('data-download-ticket'));
    });

    WM.page({ route: '/registrations', render: render, mounted: wire, load: LOAD });
  }

  /* ===================== Events (host) ===================== */
  function eventsPage() {
    function render() {
      const events = D.events;
      const rows = events.map(function (event) {
        const status = event.approvalStatus || event.status;
        return '<div class="table-row">'
          + tableEvent({ title: event.title, category: event.category, initials: event.initials, color: event.color })
          + '<span>' + esc(event.createdAt || event.date) + '</span>'
          + ui.badge(status, event.tone)
          + '<span>' + (event.registeredNum || 0) + '</span>'
          + '<button class="row-action" data-manage="' + esc(event.title) + '">Manage ' + ic('chevron-right', 15) + '</button></div>';
      }).join('');

      const published = events.filter(function (e) { return e.approvalStatus === 'Published'; }).length;
      const attention = events.filter(function (e) {
        const s = e.approvalStatus || '';
        return s === 'Changes requested' || s === 'Rejected' || s === 'Pending approval';
      }).length;
      const categories = [];
      events.forEach(function (e) { if (e.category && categories.indexOf(e.category) === -1) categories.push(e.category); });

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Host workspace', title: 'My events', action: '<div class="heading-actions"><button class="button button-secondary" data-export-events>' + ic('download', 15) + 'Export</button>'
          + '<a class="button button-primary" href="wizard.html">' + ic('plus', 17) + 'Create event</a></div>' })
        + '<div class="stat-grid compact">'
        + ui.statCard({ label: 'All events', value: String(events.length), detail: 'Across ' + categories.length + ' categories', icon: 'clipboard-list', accent: 'blue' })
        + ui.statCard({ label: 'Published', value: String(published), detail: 'Currently discoverable', icon: 'zap', accent: 'teal' })
        + ui.statCard({ label: 'Needs attention', value: String(attention), detail: 'Awaiting review or changes', icon: 'clock-3', accent: 'amber' })
        + '</div>'
        + '<section class="panel table-panel">' + tableHead(['Event', 'Created', 'Status', 'Registrations', '']) + rows + '</section>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function wire() {
      document.querySelectorAll('[data-manage]').forEach(function (b) {
        b.addEventListener('click', function () { WM.openModal(hostModal(b.getAttribute('data-manage'))); });
      });
      const exp = document.querySelector('[data-export-events]');
      if (exp) exp.addEventListener('click', function () {
        const csv = 'Title,Category,Created Date,Status,Registrations\n'
          + D.events.map(function (e) {
            return '"' + e.title + '","' + e.category + '","' + (e.createdAt || e.date) + '","' + (e.approvalStatus || e.status) + '","' + (e.registeredNum || 0) + '"';
          }).join('\n');
        WM.downloadCSV('my-hosted-events.csv', csv);
      });
    }

    function hostModal(title) {
      const items = [
        ['Edit event draft', 'Modify title, dates, or location', 'forms-host-event.html'],
        ['Attendance & Check-in', 'Scan participant QR codes or roster', 'forms-attendance.html'],
        ['Scoring Rubric Builder', 'Configure criteria weights and scores', 'forms-rubric.html'],
        ['Issue Certificates', 'Generate credentials for participants', 'forms-certificates.html'],
      ].map(function (it) {
        return '<a class="quick-action-item" href="' + it[2] + '"><div><strong>' + it[0] + '</strong><small>' + it[1] + '</small></div>' + ic('chevron-right', 16) + '</a>';
      }).join('');
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<span class="eyebrow">Host Event Manager</span><h2>' + esc(title) + '</h2>'
        + '<p>Quick operations for managing event lifecycle, registrations, evaluation, and feedback.</p>'
        + '<div class="quick-action-list">' + items + '</div>'
        + '<div class="modal-actions"><button class="button button-secondary" data-close-modal>Done</button></div>'
        + '</section></div>';
    }

    WM.page({ route: '/events', render: render, mounted: wire, load: LOAD });
  }

  /* ===================== Approvals ===================== */
  function approvals() {
    function pendingEvents() {
      return D.events.filter(function (e) {
        const s = e.approvalStatus || '';
        return s === 'Pending approval' || s === 'Changes requested' || s === 'Rejected' || s === 'Pending review';
      });
    }

    function render() {
      const rows = pendingEvents();
      const body = rows.map(function (event, index) {
        const rejected = event.approvalStatus === 'Rejected';
        return '<div class="table-row">'
          + tableEvent({ title: event.title, category: event.category, initials: event.initials, color: event.color })
          + '<span>' + esc(event.organizer || '') + '</span>'
          + '<span>' + esc(event.submittedAt || event.date) + '</span>'
          + ui.badge(rejected ? 'Rejected' : 'Pending review', rejected ? 'red' : 'amber')
          + '<a class="row-action" href="forms-approval.html?event=' + encodeURIComponent(event.id) + '">Review ' + ic('chevron-right', 15) + '</a></div>';
      }).join('');

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Admin workspace', title: 'Approval queue', action: '<a class="button button-secondary" href="forms-approval.html">Review form ' + ic('chevron-right', 15) + '</a>' })
        + '<div class="queue-callout"><div class="callout-icon">' + ic('shield-check', 20) + '</div>'
        + '<div><strong>' + rows.length + ' events need your review</strong><span>Review content, eligibility, and certificate settings before publishing.</span></div>'
        + '<a class="button button-secondary" href="forms-approval.html">View guidelines</a></div>'
        + '<div class="search-toolbar compact-toolbar"><label class="search-field">' + ic('search', 18)
        + '<input placeholder="Search by title, host, or event type" /></label>'
        + '<button class="button button-secondary">All statuses ' + ic('chevron-down', 15) + '</button></div>'
        + '<section class="panel table-panel">' + tableHead(['Event', 'Host', 'Submitted', 'Status', '']) + body + '</section>'
        + '</div>';
    }

    WM.page({ route: '/approvals', render: render, load: LOAD });
  }

  /* ===================== Notifications ===================== */
  function notifications() {
    const state = { list: null, filter: 'all' };

    function currentList() {
      if (!state.list) state.list = D.notifications.map(function (n) { return Object.assign({}, n); });
      return state.list;
    }

    function render() {
      const list = currentList();
      const filtered = list.filter(function (n) { return state.filter === 'all' || !n.read; });
      const items = filtered.map(function (item) {
        const tone = item.type === 'certificate' ? 'blue' : item.type === 'approval' ? 'green' : 'amber';
        const icon = item.type === 'certificate' ? 'file-check-2' : item.type === 'approval' ? 'check' : 'bell';
        return '<div class="activity-item' + (item.read ? '' : ' unread-item') + '">'
          + '<span class="activity-icon activity-' + tone + '">' + ic(icon, 16) + '</span>'
          + '<div><strong>' + esc(item.title) + '</strong><span>' + esc(item.message) + '</span></div>'
          + '<time>' + esc(item.time) + '</time></div>';
      }).join('');

      const unread = list.filter(function (n) { return !n.read; }).length;
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Your inbox', title: 'Notifications & Activity', action: '<button class="button button-secondary" data-mark-read>Mark all read</button>' })
        + '<div class="filter-tabs">'
        + '<button class="' + (state.filter === 'all' ? 'active' : '') + '" data-nfilter="all">All <span>' + list.length + '</span></button>'
        + '<button class="' + (state.filter === 'unread' ? 'active' : '') + '" data-nfilter="unread">Unread <span>' + unread + '</span></button>'
        + '</div>'
        + '<section class="panel notification-panel"><div class="activity-list">' + items + '</div></section>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }
    function wire() {
      document.querySelectorAll('[data-nfilter]').forEach(function (b) {
        b.addEventListener('click', function () { state.filter = b.getAttribute('data-nfilter'); refresh(); });
      });
      const m = document.querySelector('[data-mark-read]');
      if (m) m.addEventListener('click', function () {
        global.WMApi.notifications.markAllRead().catch(function () { /* best effort */ });
        state.list = currentList().map(function (n) { return Object.assign({}, n, { read: true }); });
        refresh();
      });
    }

    WM.page({ route: '/notifications', render: render, mounted: wire, load: LOAD });
  }

  /* ===================== Profile (SimplePage generic) ===================== */
  function profile() {
    function render() {
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Your account', title: 'Profile' })
        + ui.emptyView({ title: 'This space is ready for your data', description: 'Keep your reusable identity details ready for every registration.', action: '<a class="button button-secondary" href="forms-profile.html">Configure view</a>' })
        + '</div>';
    }
    WM.page({ route: '/profile', render: render });
  }

  /* ===================== Users ===================== */
  function usersPage() {
    const state = { search: '', role: 'All roles' };

    function render() {
      const users = D.users;
      const filtered = users.filter(function (u) {
        const q = (u.name + ' ' + u.email + ' ' + u.role).toLowerCase();
        return q.indexOf(state.search.toLowerCase()) !== -1 && (state.role === 'All roles' || u.role === state.role);
      });
      const rows = filtered.map(function (user) {
        return '<div class="table-row">'
          + '<div class="table-event"><div class="avatar avatar-cream">' + esc(WM.initials(user.name)) + '</div>'
          + '<div><strong>' + esc(user.name) + '</strong><small>' + esc(user.email) + '</small></div></div>'
          + '<span>' + esc(user.role) + '</span>'
          + ui.badge(user.status, user.status === 'Active' ? 'green' : 'amber')
          + '<span>' + user.eventsCount + ' events</span><span>' + esc(user.joinedDate) + '</span></div>';
      }).join('');

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Admin workspace', title: 'User & Access Management', action: '<button class="button button-primary" data-add-user>' + ic('user-plus', 16) + 'Add user</button>' })
        + '<div class="search-toolbar compact-toolbar"><label class="search-field">' + ic('search', 18)
        + '<input id="user-search" value="' + esc(state.search) + '" placeholder="Search users by name or email..." /></label>'
        + '<label class="select-field">' + ic('filter', 17) + '<select id="user-role">'
        + ['All roles', 'Participant', 'Host', 'Jury', 'Administrator'].map(function (r) { return '<option' + (r === state.role ? ' selected' : '') + '>' + r + '</option>'; }).join('')
        + '</select>' + ic('chevron-down', 16) + '</label></div>'
        + '<section class="panel table-panel">' + tableHead(['User', 'Role', 'Status', 'Events', 'Joined']) + rows + '</section>'
        + '</div>';
    }

    function refresh(focusId) { WM.refreshContent(render, focusId); wire(); }
    function wire() {
      const s = document.getElementById('user-search');
      if (s) s.addEventListener('input', function () {
        state.search = s.value; const pos = s.selectionStart; refresh('user-search');
        const ns = document.getElementById('user-search'); if (ns && ns.setSelectionRange) ns.setSelectionRange(pos, pos);
      });
      const r = document.getElementById('user-role');
      if (r) r.addEventListener('change', function () { state.role = r.value; refresh(); });
      const a = document.querySelector('[data-add-user]');
      if (a) a.addEventListener('click', function () { alert('Add user modal ready.'); });
    }

    WM.page({ route: '/users', render: render, mounted: wire, load: LOAD });
  }

  /* ===================== Audit ===================== */
  function audit() {
    const state = { search: '' };

    function render() {
      const logs = D.auditLogs;
      const filtered = logs.filter(function (log) {
        return (log.action + ' ' + log.user + ' ' + log.target).toLowerCase().indexOf(state.search.toLowerCase()) !== -1;
      });
      const rows = filtered.map(function (log) {
        return '<div class="table-row"><div><strong>' + esc(log.action) + '</strong><small>IP: ' + esc(log.ip) + '</small></div>'
          + '<span>' + esc(log.user) + '</span><span>' + esc(log.target) + '</span><span>' + esc(log.timestamp) + '</span>'
          + ui.badge(log.status, log.status === 'Success' ? 'green' : 'red') + '</div>';
      }).join('');

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Admin workspace', title: 'Activity & Audit Logs', action: '<button class="button button-secondary" data-export-audit>' + ic('download', 15) + 'Export CSV</button>' })
        + '<div class="search-toolbar compact-toolbar"><label class="search-field">' + ic('search', 18)
        + '<input id="audit-search" value="' + esc(state.search) + '" placeholder="Search audit logs by action, user, or target..." /></label></div>'
        + '<section class="panel table-panel">' + tableHead(['Action', 'User', 'Target', 'Timestamp', 'Status']) + rows + '</section>'
        + '</div>';
    }

    function refresh(focusId) { WM.refreshContent(render, focusId); wire(); }
    function wire() {
      const s = document.getElementById('audit-search');
      if (s) s.addEventListener('input', function () {
        state.search = s.value; const pos = s.selectionStart; refresh('audit-search');
        const ns = document.getElementById('audit-search'); if (ns && ns.setSelectionRange) ns.setSelectionRange(pos, pos);
      });
      const e = document.querySelector('[data-export-audit]');
      if (e) e.addEventListener('click', function () {
        WM.downloadCSV('waymark-audit-log.csv', 'Action,User,Target,Timestamp,IP,Status\n'
          + D.auditLogs.map(function (l) { return '"' + l.action + '","' + l.user + '","' + l.target + '","' + l.timestamp + '","' + l.ip + '","' + l.status + '"'; }).join('\n'));
      });
    }

    WM.page({ route: '/audit', render: render, mounted: wire, load: LOAD });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.discover = discover;
  global.WMPages.registrations = registrations;
  global.WMPages.events = eventsPage;
  global.WMPages.approvals = approvals;
  global.WMPages.notifications = notifications;
  global.WMPages.profile = profile;
  global.WMPages.users = usersPage;
  global.WMPages.audit = audit;
})(window);