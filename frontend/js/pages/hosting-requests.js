/* Hosting requests — the Admin review queue for hosting requests. Admins
 * approve a request (turning it into a live event owned by the requester),
 * reject it with a reason, or ask the requester for changes. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  const FILTERS = ['Pending', 'Changes requested', 'Approved', 'Rejected', 'Cancelled', 'All'];
  function tone(status) {
    if (status === 'Approved') return 'green';
    if (status === 'Rejected') return 'red';
    if (status === 'Pending') return 'amber';
    if (status === 'Cancelled') return 'slate';
    return 'blue';
  }

  function hostingRequests() {
    const state = { requests: [], filter: 'Pending', busy: '' };

    function visible() {
      if (state.filter === 'All') return state.requests;
      return state.requests.filter(function (r) { return r.status === state.filter; });
    }

    function render() {
      const all = state.requests;
      const pending = all.filter(function (r) { return r.status === 'Pending'; }).length;
      const approved = all.filter(function (r) { return r.status === 'Approved'; }).length;
      const changes = all.filter(function (r) { return r.status === 'Changes requested'; }).length;

      const stats = '<div class="stat-grid">'
        + ui.statCard({ label: 'Awaiting review', value: String(pending), detail: 'New hosting requests', icon: 'inbox', accent: 'amber' })
        + ui.statCard({ label: 'Approved', value: String(approved), detail: 'Turned into live events', icon: 'check-circle-2', accent: 'teal' })
        + ui.statCard({ label: 'Changes requested', value: String(changes), detail: 'Waiting on the requester', icon: 'edit-3', accent: 'blue' })
        + ui.statCard({ label: 'Total requests', value: String(all.length), detail: 'Across all users', icon: 'layers', accent: 'slate' })
        + '</div>';

      const tabs = '<div class="filter-tabs">' + FILTERS.map(function (f) {
        const count = f === 'All' ? all.length : all.filter(function (r) { return r.status === f; }).length;
        return '<button class="filter-tab' + (state.filter === f ? ' filter-tab-active' : '') + '" data-filter="' + esc(f) + '">'
          + esc(f) + ' <em>' + count + '</em></button>';
      }).join('') + '</div>';

      const rows = visible().map(function (r) {
        const isBusy = state.busy === r.id;
        const actions = r.status === 'Approved'
          ? '<a class="row-action" href="event-detail.html?id=' + encodeURIComponent(r.eventId || '') + '">Open event ' + ic('chevron-right', 14) + '</a>'
          : r.status === 'Pending'
            ? '<div class="row-actions">'
              + '<button class="button button-primary" data-approve="' + esc(r.id) + '"' + (isBusy ? ' disabled' : '') + '>Approve</button>'
              + '<button class="button button-secondary" data-changes="' + esc(r.id) + '"' + (isBusy ? ' disabled' : '') + '>Request changes</button>'
              + '<button class="button button-ghost" data-reject="' + esc(r.id) + '"' + (isBusy ? ' disabled' : '') + '>Reject</button></div>'
            : r.status === 'Changes requested'
              ? '<div class="row-actions"><button class="button button-secondary" data-changes="' + esc(r.id) + '"' + (isBusy ? ' disabled' : '') + '>Update note</button>'
                + '<button class="button button-ghost" data-reject="' + esc(r.id) + '"' + (isBusy ? ' disabled' : '') + '>Reject</button></div>'
              : r.status === 'Rejected'
                ? '<div class="row-actions"><button class="button button-secondary" data-approve="' + esc(r.id) + '"' + (isBusy ? ' disabled' : '') + '>Approve anyway</button></div>'
                : '<span class="muted-dash">—</span>';
        const reason = r.decisionReason ? '<small class="decision-reason">"' + esc(r.decisionReason) + '"</small>' : '';
        return '<div class="table-row"><div class="table-event"><strong>' + esc(r.title) + '</strong>'
          + '<small>' + esc(r.requesterName || 'User') + ' · ' + esc(r.category || 'Event') + ' · ' + esc(r.date || 'No date') + '</small>' + reason + '</div>'
          + '<span>' + esc(r.requesterEmail || '') + '</span>' + ui.badge(r.status, tone(r.status)) + actions + '</div>';
      }).join('');

      const table = visible().length
        ? '<section class="panel table-panel"><div class="table-head"><span>Event</span><span>Requester</span><span>Status</span><span></span></div>' + rows + '</section>'
        : ui.emptyView({ title: 'Nothing here', description: 'There are no hosting requests with this status.' });

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Administration', title: 'Hosting requests' })
        + stats + tabs + table + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function reload() {
      return global.WMApi.hosting.list().then(function (list) {
        state.requests = Array.isArray(list) ? list : [];
        refresh();
      });
    }

    function act(id, fn, okMsg) {
      state.busy = id; refresh();
      return fn().then(function () { state.busy = ''; WM.toast(okMsg); return reload(); },
        function (err) { state.busy = ''; refresh(); WM.toast((err && err.message) || 'Action failed.', 'error'); });
    }

    function wire() {
      document.querySelectorAll('[data-filter]').forEach(function (b) {
        b.addEventListener('click', function () { state.filter = b.getAttribute('data-filter'); refresh(); });
      });
      document.querySelectorAll('[data-approve]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-approve');
          act(id, function () { return global.WMApi.hosting.approve(id, { status: 'Registration open' }); }, 'Hosting request approved — the event is now live.');
        });
      });
      document.querySelectorAll('[data-reject]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-reject');
          const reason = global.prompt('Reason for rejecting this hosting request (optional):', '');
          if (reason === null) return;
          act(id, function () { return global.WMApi.hosting.reject(id, { reason: reason }); }, 'Hosting request rejected.');
        });
      });
      document.querySelectorAll('[data-changes]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-changes');
          const reason = global.prompt('What changes should the requester make?', '');
          if (reason === null) return;
          act(id, function () { return global.WMApi.hosting.requestChanges(id, { reason: reason }); }, 'Change request sent to the requester.');
        });
      });
    }

    function load() {
      return global.WMApi.hosting.list().then(function (list) {
        state.requests = Array.isArray(list) ? list : [];
      }, function () { state.requests = []; });
    }

    WM.page({ route: '/hosting-requests', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.hostingRequests = hostingRequests;
})(window);
