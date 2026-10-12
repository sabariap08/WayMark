/* Verification exceptions page */
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

  function exceptionsPage() {
    const state = { eventId: '', rows: [] };

    function normalizeRows(list) {
      return (list || []).map(function (r) {
        var regId = r.registrationId != null ? r.registrationId : (r.id != null ? r.id : '');
        return {
          registrationId: regId,
          id: r.id != null ? r.id : regId,
          participantName: r.participantName || r.name || r.participant || '',
          type: r.type || 'Exception',
          detectedAt: r.detectedAt || r.time || '',
          status: r.status || 'Exception',
          detail: r.detail || r.reason || '',
        };
      });
    }

    function fallbackRows() {
      return normalizeRows((D.registrations || []).filter(function (r) {
        return r.attendanceStatus === 'Exception';
      }));
    }

    function fetchExceptions() {
      if (!state.eventId) { state.rows = fallbackRows(); return Promise.resolve(); }
      return WMApi.events.exceptions(state.eventId).then(function (data) {
        var list = asList(data);
        state.rows = list.length ? normalizeRows(list) : fallbackRows();
      }, function () {
        state.rows = fallbackRows();
      });
    }

    function load() {
      return D.ready().then(function () {
        var events = D.events || [];
        if (events.length) state.eventId = events[0].id;
        return fetchExceptions();
      });
    }

    function eventSelect() {
      var events = D.events || [];
      if (!events.length) {
        return '<label class="select-field">' + ic('calendar-days', 16)
          + '<select id="exc-event" disabled><option>No events available</option></select>' + ic('chevron-down', 15) + '</label>';
      }
      return '<label class="select-field">' + ic('calendar-days', 16) + '<select id="exc-event">'
        + events.map(function (e) {
          return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
            + esc(e.title) + '</option>';
        }).join('')
        + '</select>' + ic('chevron-down', 15) + '</label>';
    }

    function render() {
      var rows = state.rows || [];
      var open = 0, resolved = 0, overridden = 0;
      rows.forEach(function (r) {
        var st = String(r.status || '').toLowerCase();
        if (st === 'resolved') resolved++;
        else if (st === 'overridden') overridden++;
        if (st !== 'resolved' && st !== 'overridden') open++;
      });

      var table;
      if (rows.length) {
        var body = rows.map(function (row, index) {
          var st = String(row.status || '').toLowerCase();
          var actions = '';
          if (st !== 'overridden' && st !== 'resolved') {
            actions += '<button class="button button-secondary" data-exception-action data-status="Overridden" data-index="' + index + '">Override</button>';
          }
          if (st !== 'resolved') {
            actions += '<button class="button button-primary" data-exception-action data-status="Resolved" data-index="' + index + '">Resolve</button>';
          }
          return '<tr>'
            + '<td><strong>' + esc(row.participantName) + '</strong>'
            + (row.detail ? '<div class="tie-note">' + esc(row.detail) + '</div>' : '') + '</td>'
            + '<td>' + ui.badge(row.type, 'amber') + '</td>'
            + '<td>' + esc(row.detectedAt) + '</td>'
            + '<td>' + WM.statusChip(row.status) + '</td>'
            + '<td><div class="chip-row">' + (actions || '<span class="tie-note">No action needed</span>') + '</div></td>'
            + '</tr>';
        }).join('');
        table = '<section class="panel table-panel"><div class="data-table-wrap"><table class="data-table">'
          + '<thead><tr><th>Participant</th><th>Exception type</th><th>Detected</th><th>Status</th><th>Actions</th></tr></thead>'
          + '<tbody>' + body + '</tbody></table></div></section>';
      } else {
        table = ui.emptyView({
          title: 'No verification exceptions \u2014 every check-in was clean',
          description: 'Flags raised during check-in will appear here for review.',
        });
      }

      var logs = (D.auditLogs || []).filter(function (l) {
        var a = String(l.action || '').toLowerCase();
        return a.indexOf('override') !== -1 || a.indexOf('exception') !== -1;
      });
      var timeline = logs.length
        ? '<div class="timeline">' + logs.map(function (l) {
          return '<div class="timeline-item"><span class="timeline-dot"></span>'
            + '<div><strong>' + esc(l.action) + '</strong>'
            + '<div class="tie-note">' + esc(l.user) + ' \u00b7 ' + esc(l.timestamp) + '</div></div></div>';
        }).join('') + '</div>'
        : '<p class="lede">No related audit entries loaded.</p>';

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Evaluation', title: 'Verification exceptions', action: eventSelect() })
        + '<p class="lede">Check-in attempts that need a human decision.</p>'
        + '<div class="stat-grid compact">'
        + ui.statCard({ label: 'Open exceptions', value: String(open), detail: 'Awaiting a decision', icon: 'shield-alert', accent: 'amber' })
        + ui.statCard({ label: 'Resolved today', value: String(resolved), detail: 'Cleared by staff', icon: 'check-circle-2', accent: 'teal' })
        + ui.statCard({ label: 'Overridden', value: String(overridden), detail: 'Manually accepted', icon: 'shield-check', accent: 'blue' })
        + '</div>'
        + table
        + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'History', title: 'Audit trail' }) + timeline + '</section>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function actionModal(row, targetStatus) {
      var label = targetStatus === 'Resolved' ? 'Resolve exception' : 'Override exception';
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<div class="eyebrow">' + esc(targetStatus) + '</div><h2>' + esc(label) + '?</h2>'
        + '<p>' + esc(row.participantName || 'This participant') + ' \u00b7 ' + esc(row.type) + '</p>'
        + '<label class="form-field-group" for="exc-reason">Reason</label>'
        + '<textarea id="exc-reason" rows="3" class="form-textarea" placeholder="Explain the decision..."></textarea>'
        + '<div class="modal-actions"><button class="button button-secondary" data-close-modal>Cancel</button>'
        + '<button class="button button-primary" data-confirm-exception data-status="' + esc(targetStatus) + '">'
        + ic('check', 15) + ' ' + esc(label) + '</button></div>'
        + '</section></div>';
    }

    function doAction(row, targetStatus) {
      var reasonEl = document.getElementById('exc-reason');
      var reason = reasonEl ? reasonEl.value : '';
      WMApi.registrations.override(row.registrationId || row.id, { reason: reason, status: targetStatus }).then(function () {
        row.status = targetStatus;
        WM.closeModal();
        WM.toast('Exception ' + targetStatus.toLowerCase() + '.');
        refresh();
      }, function (err) {
        WM.toast((err && err.message) || 'Something went wrong.', 'error');
      });
    }

    function wire() {
      var sel = document.getElementById('exc-event');
      if (sel) sel.addEventListener('change', function () {
        state.eventId = sel.value;
        fetchExceptions().then(refresh, refresh);
      });
      document.querySelectorAll('[data-exception-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          var index = Number(b.getAttribute('data-index'));
          var row = state.rows[index];
          var target = b.getAttribute('data-status');
          if (!row) return;
          WM.openModal(actionModal(row, target));
          var confirm = document.querySelector('[data-confirm-exception]');
          if (confirm) confirm.addEventListener('click', function () { doAction(row, target); });
        });
      });
    }

    WM.page({ route: '/exceptions', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.exceptions = exceptionsPage;
})(window);
