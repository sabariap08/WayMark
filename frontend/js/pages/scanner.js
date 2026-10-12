(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  function asList(value, names) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const keys = (names || []).concat(['items', 'data', 'results']);
      for (let i = 0; i < keys.length; i += 1) {
        if (Array.isArray(value[keys[i]])) return value[keys[i]];
      }
    }
    return [];
  }

  function codeOf(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return entry;
    return entry.code || entry.ticketCode || entry.qrCode || entry.id || '';
  }

  function nameOf(entry) {
    if (entry == null || typeof entry === 'string') return '';
    return entry.participantName || entry.name || entry.attendeeName || '';
  }

  function scannerPage() {
    const state = {
      selectedId: '',
      roster: [],
      history: [],
      count: 0,
      last: null,
      simCounter: 1,
    };

    function fallbackRoster() {
      const regs = D.registrations || [];
      const fromRegs = regs.map(function (r) {
        return { ticketCode: (r && r.ticketCode) || '', participantName: (r && r.eventTitle) || '' };
      }).filter(function (r) { return r.ticketCode; });
      if (fromRegs.length) return fromRegs;
      const sim = [];
      for (let i = 0; i < 5; i += 1) {
        sim.push({ ticketCode: 'WM-SIM-' + state.simCounter, participantName: '' });
        state.simCounter += 1;
      }
      return sim;
    }

    function fetchRoster() {
      if (!state.selectedId) {
        state.roster = fallbackRoster();
        return Promise.resolve();
      }
      return global.WMApi.events.roster(state.selectedId).then(function (data) {
        const list = asList(data, ['roster', 'participants', 'registrations']);
        state.roster = list.length ? list : fallbackRoster();
      }, function () {
        state.roster = fallbackRoster();
      });
    }

    function isChecked(code) {
      return state.history.some(function (h) { return h.code === code; });
    }

    function nextUnchecked() {
      const roster = state.roster || [];
      for (let i = 0; i < roster.length; i += 1) {
        const code = codeOf(roster[i]);
        if (code && !isChecked(code)) return code;
      }
      const fresh = 'WM-SIM-' + state.simCounter;
      state.simCounter += 1;
      state.roster = roster.concat([{ ticketCode: fresh, participantName: '' }]);
      return fresh;
    }

    function recordHistory(entry) {
      state.history = [entry].concat(state.history || []).slice(0, 8);
    }

    function now() {
      try { return new Date().toLocaleTimeString(); } catch (e) { return ''; }
    }

    function checkIn(code) {
      const value = String(code || '').trim();
      if (!value) {
        WM.toast('Enter or scan a ticket code.', 'warning');
        return;
      }
      global.WMApi.checkin.create({ eventId: state.selectedId, code: value, method: 'scanner' }).then(function (result) {
        const name = (result && (result.participantName || result.name)) || value;
        state.last = { tone: 'green', name: name, message: 'Checked in successfully', code: value };
        recordHistory({ id: result && result.id, name: name, code: value, tone: 'green', time: now() });
        state.count += 1;
        WM.toast('Checked in: ' + name);
        refresh();
      }, function (err) {
        if (!err || err.name !== 'ApiError') {
          state.last = { tone: 'green', name: value, message: 'Checked in (offline demo)', code: value };
          recordHistory({ id: null, name: value, code: value, tone: 'green', time: now() });
          state.count += 1;
          refresh();
          return;
        }
        const message = String((err && err.message) || '');
        const lower = message.toLowerCase();
        if (lower.indexOf('duplicate') !== -1 || lower.indexOf('already') !== -1) {
          state.last = { tone: 'amber', name: value, message: 'Already checked in', code: value };
        } else {
          state.last = { tone: 'red', name: value, message: 'Check-in rejected' + (message ? ': ' + message : ''), code: value };
        }
        refresh();
      });
    }

    function undo() {
      const last = (state.history || [])[0];
      if (!last || !last.id) {
        WM.toast('Nothing to undo.', 'warning');
        return;
      }
      global.WMApi.attendance.undo(last.id).then(function () {
        state.history = state.history.slice(1);
        state.count = Math.max(0, state.count - 1);
        WM.toast('Check-in undone.');
        refresh();
      }, function (err) {
        WM.toast((err && err.message) || 'Something went wrong.', 'error');
      });
    }

    function resultHTML() {
      if (!state.last) {
        return '<div class="scan-result" style="background:var(--wm-bg);color:var(--wm-ink-500)">'
          + ic('scan-line', 20) + '<span>Waiting for the first scan.</span></div>';
      }
      const tone = state.last.tone;
      const icon = tone === 'green' ? 'check-circle-2' : tone === 'amber' ? 'alert-triangle' : 'x-circle';
      return '<div class="scan-result scan-result-' + tone + '">' + ic(icon, 22)
        + '<div><strong>' + esc(state.last.name) + '</strong><br><small>' + esc(state.last.message) + '</small></div></div>';
    }

    function historyHTML() {
      const list = state.history || [];
      if (!list.length) return '<p class="lede">No scans yet.</p>';
      return list.map(function (h) {
        const icon = h.tone === 'green' ? 'check-circle-2' : h.tone === 'amber' ? 'alert-triangle' : 'x-circle';
        const label = h.tone === 'green' ? 'Checked in' : h.tone === 'amber' ? 'Duplicate' : 'Rejected';
        return '<div class="activity-item">'
          + '<span class="activity-icon activity-' + h.tone + '">' + ic(icon, 16) + '</span>'
          + '<div><strong>' + esc(h.name) + '</strong><span class="mono">' + esc(h.code) + '</span></div>'
          + '<time>' + esc(h.time) + '</time>' + ui.badge(label, h.tone) + '</div>';
      }).join('');
    }

    function render() {
      if (!state.selectedId && (D.events || []).length) state.selectedId = String(D.events[0].id);
      const list = D.events || [];
      const options = list.map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.selectedId) ? ' selected' : '') + '>'
          + esc(e.title) + '</option>';
      }).join('');

      const header = ui.sectionHeading({ eyebrow: 'Guest operations', title: 'Scanner app' })
        + '<div class="search-toolbar compact-toolbar">'
        + '<label class="select-field">' + ic('calendar-days', 17) + '<select id="scan-event">' + options + '</select>' + ic('chevron-down', 16) + '</label>'
        + '</div>'
        + '<p class="lede">Scan participant QR passes to check people in.</p>';

      const left = '<section class="panel">'
        + '<div class="scan-stage">'
        + '<div class="scan-frame"></div>'
        + ic('scan-line', 40)
        + '<p>Point the camera at a participant QR pass</p>'
        + '<button class="button button-secondary" data-simulate>' + ic('camera', 16) + ' Simulate scan</button>'
        + '</div>'
        + '<div style="display:flex;gap:8px;margin-top:14px;align-items:center">'
        + '<div class="form-input-wrap" style="flex:1">' + ic('keyboard', 16)
        + '<input id="scan-code" class="mono" placeholder="WM-XXXX-XXXX" /></div>'
        + '<button class="button button-primary" data-checkin>' + ic('check', 16) + ' Check in</button>'
        + '</div></section>';

      const right = '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Live', title: 'Live status' })
        + '<div class="scan-live-count">' + state.count + '</div>'
        + '<span class="lede">Checked in this session</span>'
        + '<div style="margin:10px 0"><span class="eyebrow" style="margin:0">Roster</span> '
        + '<strong>' + (state.roster || []).length + ' passes</strong></div>'
        + resultHTML()
        + '<button class="button button-secondary full-button" data-undo>' + ic('undo-2', 15) + ' Undo last check-in</button>'
        + '<div class="activity-list" style="margin-top:14px">' + historyHTML() + '</div>'
        + '<a class="button button-secondary full-button" href="forms-attendance.html">Open full attendance roster</a>'
        + '</section>';

      return '<div class="page-stack">'
        + header
        + '<div class="content-grid">' + left + right + '</div>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function wire() {
      const ev = document.getElementById('scan-event');
      if (ev) ev.addEventListener('change', function () {
        state.selectedId = ev.value;
        state.roster = [];
        state.history = [];
        state.count = 0;
        state.last = null;
        fetchRoster().then(function () { refresh(); });
      });

      const sim = document.querySelector('[data-simulate]');
      if (sim) sim.addEventListener('click', function () { checkIn(nextUnchecked()); });

      const manual = document.querySelector('[data-checkin]');
      if (manual) manual.addEventListener('click', function () {
        const input = document.getElementById('scan-code');
        checkIn(input ? input.value : '');
      });

      const undoBtn = document.querySelector('[data-undo]');
      if (undoBtn) undoBtn.addEventListener('click', undo);
    }

    function load() {
      return D.ready().then(function () {
        if (!state.selectedId && (D.events || []).length) state.selectedId = String(D.events[0].id);
        return fetchRoster();
      });
    }

    WM.page({ route: '/scanner', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.scanner = scannerPage;
})(window);
