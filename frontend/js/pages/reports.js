/* Reports & exports page */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const WMApi = global.WMApi;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      var keys = ['items', 'data', 'results'];
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(value[keys[i]])) return value[keys[i]];
      }
    }
    return [];
  }

  var REPORT_DEFS = [
    { kind: 'registrations', icon: 'clipboard-list', accent: 'blue', title: 'Registration list', desc: 'Every registration with status and ticket.' },
    { kind: 'attendance', icon: 'clipboard-check', accent: 'teal', title: 'Attendance', desc: 'Check-in log by session and method.' },
    { kind: 'no-shows', icon: 'user-x', accent: 'rose', title: 'No-shows', desc: 'Registered participants who did not attend.' },
    { kind: 'results', icon: 'trophy', accent: 'amber', title: 'Scores & results', desc: 'Final rankings and award outcomes.' },
    { kind: 'feedback', icon: 'message-square', accent: 'blue', title: 'Feedback', desc: 'Participant ratings and comments.' },
    { kind: 'certificates', icon: 'award', accent: 'teal', title: 'Certificates', desc: 'Issued credentials and their status.' },
  ];

  function findDef(kind) {
    for (var i = 0; i < REPORT_DEFS.length; i++) {
      if (REPORT_DEFS[i].kind === kind) return REPORT_DEFS[i];
    }
    return null;
  }

  function reportsPage() {
    const state = { eventId: '', recent: [] };

    function eventTitle() {
      var events = D.events || [];
      for (var i = 0; i < events.length; i++) {
        if (String(events[i].id) === String(state.eventId)) return events[i].title;
      }
      return 'No event';
    }

    function load() {
      return D.ready().then(function () {
        var events = D.events || [];
        if (events.length) state.eventId = events[0].id;
        return null;
      });
    }

    function byEvent(x) {
      return !state.eventId || String(x.eventId) === String(state.eventId);
    }

    function csvCell(v) {
      return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    }

    function buildCSV(kind) {
      var header = '';
      var rows = [];
      var regs = D.registrations || [];
      if (kind === 'registrations') {
        header = 'Event,Date,Status,Ticket';
        rows = regs.filter(byEvent).map(function (r) { return [r.eventTitle, r.date, r.status, r.ticketCode]; });
      } else if (kind === 'attendance') {
        header = 'Name,Session,Method,Time';
        rows = (D.attendanceLogs || []).filter(byEvent).map(function (l) { return [l.participantName, l.session, l.method, l.timestamp]; });
      } else if (kind === 'no-shows') {
        header = 'Event,Date,Status,Ticket';
        rows = regs.filter(byEvent).filter(function (r) { return r.attendanceStatus === 'No-show'; })
          .map(function (r) { return [r.eventTitle, r.date, r.status, r.ticketCode]; });
      } else if (kind === 'results') {
        header = 'Rank,Team,Score';
        rows = (D.leaderboard || []).map(function (l) { return [l.rank, l.teamName || l.projectTitle, l.score]; });
      } else if (kind === 'feedback') {
        header = 'Rating,Submitted';
        rows = (D.feedback || []).filter(byEvent).map(function (f) { return [f.overallRating, f.submittedAt]; });
      } else if (kind === 'certificates') {
        header = 'Recipient,Credential,Status';
        rows = (D.certificates || []).map(function (c) { return [c.recipientName, c.credentialId, c.status]; });
      }
      if (!rows.length) return null;
      return header + '\n' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
    }

    function pushRecent(kind, format) {
      var def = findDef(kind);
      state.recent.unshift({
        label: def ? def.title : kind,
        event: eventTitle(),
        format: format,
        time: new Date().toISOString(),
      });
    }

    function handleExport(kind, format) {
      if (!state.eventId) { WM.toast('Select an event first.', 'warning'); return; }
      if (format === 'csv') {
        var csv = buildCSV(kind);
        if (!csv) { WM.toast('No rows available to export yet.', 'warning'); return; }
        WM.downloadCSV('waymark-' + kind + '.csv', csv);
        pushRecent(kind, 'CSV');
        refresh();
        return;
      }
      window.open(WMApi.reports.url(state.eventId, kind, format), '_blank');
      pushRecent(kind, format.toUpperCase());
      refresh();
    }

    function render() {
      var events = D.events || [];
      var noEvents = events.length === 0;

      var selector = noEvents
        ? '<label class="select-field">' + ic('calendar-days', 16)
          + '<select id="rep-event" disabled><option>No events available</option></select>' + ic('chevron-down', 15) + '</label>'
        : '<label class="select-field">' + ic('calendar-days', 16) + '<select id="rep-event">'
          + events.map(function (e) {
            return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
              + esc(e.title) + '</option>';
          }).join('')
          + '</select>' + ic('chevron-down', 15) + '</label>';

      var cards = REPORT_DEFS.map(function (def) {
        var dis = noEvents ? ' disabled' : '';
        return '<article class="report-card">'
          + '<div class="stat-icon stat-' + def.accent + '">' + ic(def.icon, 18) + '</div>'
          + '<strong>' + esc(def.title) + '</strong>'
          + '<small>' + esc(def.desc) + '</small>'
          + '<div class="chip-row">'
          + '<button class="button button-secondary" data-kind="' + esc(def.kind) + '" data-format="pdf"' + dis + '>PDF</button>'
          + '<button class="button button-secondary" data-kind="' + esc(def.kind) + '" data-format="xlsx"' + dis + '>XLSX</button>'
          + '<button class="button button-ghost" data-kind="' + esc(def.kind) + '" data-format="csv"' + dis + '>CSV</button>'
          + '</div></article>';
      }).join('');

      var empty = noEvents
        ? ui.emptyView({ title: 'No events to report on', description: 'Create an event to start generating operational exports.' })
        : '';

      var recent = state.recent || [];
      var recentList = recent.length
        ? '<div class="activity-list">' + recent.map(function (r) {
          return '<div class="activity-item"><span class="activity-icon activity-blue">' + ic('file-down', 15) + '</span>'
            + '<div><strong>' + esc(r.label) + '</strong><span>' + esc(r.event) + ' \u00b7 ' + esc(r.format) + '</span></div>'
            + '<time>' + esc(r.time) + '</time></div>';
        }).join('') + '</div>'
        : '<p class="lede">No exports yet \u2014 generate your first report above.</p>';

      return '<div class="page-stack">'
        + ui.sectionHeading({
          eyebrow: 'Hosting',
          title: 'Reports & exports',
          action: selector,
        })
        + '<p class="lede">Generate operational exports for the selected event.</p>'
        + empty
        + '<div class="report-card-grid">' + cards + '</div>'
        + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'History', title: 'Recent exports' }) + recentList + '</section>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function wire() {
      var sel = document.getElementById('rep-event');
      if (sel) sel.addEventListener('change', function () { state.eventId = sel.value; refresh(); });
      document.querySelectorAll('[data-kind]').forEach(function (b) {
        b.addEventListener('click', function () {
          handleExport(b.getAttribute('data-kind'), b.getAttribute('data-format'));
        });
      });
    }

    WM.page({ route: '/reports', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.reports = reportsPage;
})(window);
