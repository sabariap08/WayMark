/* My hosted events — a Normal User's own hosting requests and the events that
 * were approved from them. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  function tone(status) {
    if (status === 'Approved') return 'green';
    if (status === 'Rejected') return 'red';
    if (status === 'Pending') return 'amber';
    if (status === 'Cancelled') return 'slate';
    return 'blue';
  }

  function myHostedEvents() {
    const state = { requests: [], events: [] };

    function render() {
      const reqs = state.requests;
      const pending = reqs.filter(function (r) { return r.status === 'Pending'; });
      const approved = reqs.filter(function (r) { return r.status === 'Approved'; });
      const needsAction = reqs.filter(function (r) { return r.status === 'Changes requested' || r.status === 'Rejected'; });

      const stats = '<div class="stat-grid">'
        + ui.statCard({ label: 'Hosting requests', value: String(reqs.length), detail: 'Submitted by you', icon: 'inbox', accent: 'blue' })
        + ui.statCard({ label: 'Awaiting review', value: String(pending.length), detail: 'With the admin team', icon: 'clock-3', accent: 'amber' })
        + ui.statCard({ label: 'Live events', value: String(approved.length), detail: 'Approved and published', icon: 'calendar-check', accent: 'teal' })
        + ui.statCard({ label: 'Needs attention', value: String(needsAction.length), detail: 'Rejected or change requests', icon: 'alert-triangle', accent: 'rose' })
        + '</div>';

      const rows = reqs.map(function (r) {
        const action = r.status === 'Approved'
          ? '<a class="row-action" href="event-detail.html?id=' + encodeURIComponent(r.eventId || '') + '">Open event ' + ic('chevron-right', 14) + '</a>'
          : (r.status === 'Changes requested' || r.status === 'Rejected')
            ? '<button class="button button-secondary" data-resubmit="' + esc(r.id) + '">Update &amp; resubmit</button>'
            : r.status === 'Pending'
              ? '<button class="button button-ghost" data-cancel="' + esc(r.id) + '">Withdraw</button>'
              : '<span class="muted-dash">—</span>';
        const reviewer = r.decidedBy ? '<small>Reviewed by ' + esc(r.decidedBy) + '</small>' : '';
        const reason = r.decisionReason ? '<small class="decision-reason">"' + esc(r.decisionReason) + '"</small>' : '';
        return '<div class="table-row"><div class="table-event"><strong>' + esc(r.title) + '</strong>'
          + '<small>' + esc(r.category || 'Event') + ' · ' + esc(r.date || 'No date') + '</small>' + reviewer + reason + '</div>'
          + '<span>' + esc(r.requesterEmail || '') + '</span>' + ui.badge(r.status, tone(r.status)) + action + '</div>';
      }).join('');

      const table = reqs.length
        ? '<section class="panel table-panel"><div class="table-head"><span>Event</span><span>Contact</span><span>Status</span><span></span></div>' + rows + '</section>'
        : ui.emptyView({
          title: 'No hosting requests yet',
          description: 'Submit your first hosting request and it will appear here once reviewed.',
          action: '<a class="button button-primary" href="host-an-event.html">' + ic('plus', 16) + ' Host an Event</a>',
        });

      const eventRows = approved.map(function (r) {
        return '<div class="event-row"><div class="event-row-main"><div class="event-row-title"><strong>' + esc(r.title) + '</strong>'
          + WM.statusChip('Live') + '</div><span>' + esc(r.date || '') + ' · ' + esc(r.location || r.venue || '') + '</span></div>'
          + '<a class="button button-secondary" href="event-detail.html?id=' + encodeURIComponent(r.eventId || '') + '">Manage ' + ic('chevron-right', 14) + '</a></div>';
      }).join('');
      const liveEvents = approved.length
        ? '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Published', title: 'Events you host' }) + '<div class="event-list">' + eventRows + '</div></section>'
        : '';

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Host an Event', title: 'My hosted events',
          action: '<a class="button button-primary" href="host-an-event.html">' + ic('plus', 16) + ' New hosting request</a>' })
        + stats + table + liveEvents + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function reload() {
      return global.WMApi.hosting.list().then(function (list) {
        state.requests = Array.isArray(list) ? list : [];
        refresh();
      });
    }

    function wire() {
      document.querySelectorAll('[data-cancel]').forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          global.WMApi.hosting.cancel(b.getAttribute('data-cancel')).then(function () { WM.toast('Hosting request withdrawn.'); reload(); },
            function (err) { b.disabled = false; WM.toast((err && err.message) || 'Could not withdraw.', 'error'); });
        });
      });
      document.querySelectorAll('[data-resubmit]').forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          global.WMApi.hosting.resubmit(b.getAttribute('data-resubmit'), {}).then(function () { WM.toast('Hosting request resubmitted for review.'); reload(); },
            function (err) { b.disabled = false; WM.toast((err && err.message) || 'Could not resubmit.', 'error'); });
        });
      });
    }

    function load() {
      return global.WMApi.hosting.list().then(function (list) {
        state.requests = Array.isArray(list) ? list : [];
      }, function () { state.requests = []; });
    }

    WM.page({ route: '/my-hosted-events', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.myHostedEvents = myHostedEvents;
})(window);
