/* History page — participant event timeline */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;
  const LOAD = function () { return D.ready(); };

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const keys = ['items', 'data', 'results'];
      for (let i = 0; i < keys.length; i += 1) {
        if (Array.isArray(value[keys[i]])) return value[keys[i]];
      }
    }
    return [];
  }

  function historyPage() {
    const state = { tab: 'all' };

    function registrations() { return asList(D.registrations); }
    function isAttended(r) { return !!(r && r.attendanceStatus === 'Attended'); }
    function isMissed(r) { return !!(r && (r.attendanceStatus === 'Missed' || r.attendanceStatus === 'No-show')); }

    function attendanceDot(r) {
      const s = r && r.attendanceStatus;
      if (s === 'Attended') return 'timeline-dot-green';
      if (s === 'Registered' || s === 'Checked in') return 'timeline-dot-amber';
      if (s === 'Missed' || s === 'No-show') return 'timeline-dot-red';
      return '';
    }

    function feedbackEnabled(reg) {
      if (reg && reg.feedbackEnabled) return true;
      const ev = asList(D.events).find(function (e) { return String(e.id) === String(reg && reg.eventId); });
      return !!(ev && ev.feedbackEnabled);
    }

    function statCounts() {
      const logs = asList(D.attendanceLogs);
      const attendedLogs = logs.filter(function (l) {
        const s = String((l && l.status) || '').toLowerCase();
        return s === 'attended' || s === 'checked in';
      }).length;
      const attendedRegs = registrations().filter(isAttended).length;
      return {
        attended: attendedLogs > 0 ? attendedLogs : attendedRegs,
        feedback: asList(D.feedback).length,
        certificates: asList(D.certificates).length,
      };
    }

    function timeline() {
      let list = registrations();
      if (state.tab === 'attended') list = list.filter(isAttended);
      else if (state.tab === 'missed') list = list.filter(isMissed);
      list = list.slice().sort(function (a, b) {
        return String((b && b.date) || '').localeCompare(String((a && a.date) || ''));
      });

      if (!registrations().length) {
        return ui.emptyView({
          title: 'No history yet',
          description: 'Register for an event and your journey will show up here.',
          action: '<a class="button button-primary" href="discover.html">' + ic('calendar-days', 16) + 'Discover events</a>',
        });
      }
      if (!list.length) return '<p class="lede">No events match this filter.</p>';

      const items = list.map(function (reg) {
        let actions = '';
        if (isAttended(reg)) {
          actions += '<a class="button button-secondary" href="registrations.html">' + ic('ticket', 14) + 'View ticket</a>';
          if (feedbackEnabled(reg)) {
            actions += '<a class="button button-secondary" href="forms-feedback.html">' + ic('message-square', 14) + 'Leave feedback</a>';
          }
        }
        return '<div class="timeline-item">'
          + '<span class="timeline-dot ' + attendanceDot(reg) + '"></span>'
          + '<div style="flex:1;min-width:0">'
          + '<div class="eyebrow">' + esc(reg.category || 'Event') + '</div>'
          + '<strong>' + esc(reg.eventTitle || reg.title || 'Untitled event') + '</strong>'
          + '<div><small>' + ic('calendar-days', 12) + ' ' + esc(reg.date || '') + ' &middot; ' + ic('map-pin', 12) + ' ' + esc(reg.location || '') + '</small></div>'
          + '<div class="chip-row" style="margin-top:6px">' + WM.statusChip(reg.status || 'Registered') + '</div>'
          + '<small>' + esc(reg.attendanceStatus || '') + '</small>'
          + '</div>'
          + (actions ? '<div style="flex-shrink:0">' + actions + '</div>' : '')
          + '</div>';
      }).join('');

      return '<div class="timeline">' + items + '</div>';
    }

    function render() {
      const counts = statCounts();
      const all = registrations();
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Your journey', title: 'Your history' })
        + '<p class="lede">Every event you have been part of, in one timeline.</p>'
        + '<div class="stat-grid compact">'
        + ui.statCard({ label: 'Events attended', value: String(counts.attended), detail: 'Across your registrations', icon: 'calendar-check', accent: 'blue' })
        + ui.statCard({ label: 'Feedback submitted', value: String(counts.feedback), detail: 'Reviews you have shared', icon: 'message-square', accent: 'teal' })
        + ui.statCard({ label: 'Certificates earned', value: String(counts.certificates), detail: 'Ready to download', icon: 'award', accent: 'amber' })
        + '</div>'
        + '<div class="filter-tabs">'
        + '<button class="' + (state.tab === 'all' ? 'active' : '') + '" data-tab="all">All <span>' + all.length + '</span></button>'
        + '<button class="' + (state.tab === 'attended' ? 'active' : '') + '" data-tab="attended">Attended <span>' + all.filter(isAttended).length + '</span></button>'
        + '<button class="' + (state.tab === 'missed' ? 'active' : '') + '" data-tab="missed">Missed <span>' + all.filter(isMissed).length + '</span></button>'
        + '</div>'
        + '<section class="panel">' + timeline() + '</section>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function wire() {
      document.querySelectorAll('[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); refresh(); });
      });
    }

    WM.page({ route: '/history', render: render, mounted: wire, load: LOAD });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.history = historyPage;
})(window);
