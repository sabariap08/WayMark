/* Integrations — webhooks, ICS calendars, registration import/export and the
 * public read-only API. All admin-only endpoints surface the backend message
 * honestly (403s included); nothing is faked client-side. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  const TABS = ['Webhooks', 'Calendar', 'Import', 'Exports', 'Public API'];
  /* Event names actually emitted by backend/utils/webhooks.py + blueprints.
   * The backend also matches '*' and 'prefix.*' patterns. */
  const HOOK_EVENTS = ['webhook.test', 'event.created', 'schedule.updated', '*'];
  const EXPORT_KINDS = [
    ['registrations', 'Registrations'],
    ['schedule', 'Schedule'],
    ['tasks', 'Tasks'],
    ['budget', 'Budget'],
    ['sponsors', 'Sponsors'],
  ];

  function qs(sel) {
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function qsa(sel) {
    let nodes = null;
    try { nodes = document.querySelectorAll(sel); } catch (e) { nodes = null; }
    return (nodes && typeof nodes.forEach === 'function') ? nodes : [];
  }

  function origin() {
    return (global.location && global.location.origin) ? global.location.origin : '';
  }

  function copyText(text, okMessage) {
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(function () {
        WM.toast(okMessage || 'Copied to clipboard.');
      }, function () { WM.toast(text); });
    } else {
      WM.toast(text);
    }
  }

  /* Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). */
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', inQuotes = false;
    const src = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') { cell += '"'; i += 1; } else { inQuotes = false; }
        } else { cell += ch; }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n') {
        row.push(cell); cell = '';
        if (row.some(function (c) { return String(c).trim() !== ''; })) rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
    row.push(cell);
    if (row.some(function (c) { return String(c).trim() !== ''; })) rows.push(row);
    return rows;
  }

  function readCsvFile(file) {
    return new Promise(function (resolve) {
      try {
        const reader = new FileReader();
        reader.onload = function () { resolve(parseCsv(reader.result)); };
        reader.onerror = function () { resolve(null); };
        reader.readAsText(file);
      } catch (e) {
        resolve(null);
      }
    });
  }

  function integrationsPage() {
    const state = {
      tab: 'Webhooks',
      events: [], eventId: '',
      webhooks: [], hooksBusy: false,
      hookForm: { url: '', events: [] },
      hookMessage: '', hookError: '',
      testMessage: '',
      deliveriesFor: '', deliveries: [], deliveriesError: '',
      retryMessage: '',
      importFile: null, importFileName: '', importFileRows: null,
      importText: '', importResult: null, importError: '', importBusy: false,
      lastImport: null,
      keys: null, keysError: '', keysBusy: false,
      feed: [], feedError: '',
    };

    /* ------------------------------------------------------------------ *
     * Shared bits                                                         *
     * ------------------------------------------------------------------ */
    function eventSelect(id, label) {
      let opts = '<option value="">' + (state.events.length ? 'Choose an event…' : 'No events available') + '</option>';
      opts += state.events.map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
          + esc(e.title) + '</option>';
      }).join('');
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label) + '</label>'
        + '<div class="form-input-wrap"><select id="' + id + '"' + (state.events.length ? '' : ' disabled') + '>' + opts + '</select></div></div>';
    }

    function tabsBar() {
      return '<div class="filter-tabs">' + TABS.map(function (t) {
        return '<button class="' + (state.tab === t ? 'active' : '') + '" data-tab="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>';
    }

    /* ------------------------------------------------------------------ *
     * Webhooks tab                                                        *
     * ------------------------------------------------------------------ */
    function webhooksTab() {
      const checks = HOOK_EVENTS.map(function (name) {
        const on = state.hookForm.events.indexOf(name) !== -1;
        return '<div class="form-checkbox-row"><button type="button" class="form-checkbox'
          + (on ? ' form-checkbox-on' : '') + '" data-hook-event="' + esc(name) + '" aria-pressed="' + on + '">'
          + (on ? ic('check', 13, 'stroke-width="3"') : '') + '</button>'
          + '<div><span>' + esc(name) + '</span></div></div>';
      }).join('');

      const create = '<section class="panel"><h3 class="section-title">Add a webhook</h3>'
        + '<div class="form-grid">'
        + '<div class="form-field-group"><label for="hook-url">Endpoint URL<span class="form-req">*</span></label>'
        + '<div class="form-input-wrap"><input id="hook-url" type="url" placeholder="https://example.com/hooks/waymark" value="' + esc(state.hookForm.url) + '" /></div></div>'
        + '</div>'
        + '<p class="lede">Subscribe to events (leave everything unchecked to receive all). '
        + 'The backend also matches <code>*</code> and <code>prefix.*</code> patterns. '
        + 'Each delivery is signed with <code>X-WayMark-Signature: sha256=&lt;HMAC-SHA256 of the body&gt;</code>.</p>'
        + '<div class="form-grid-2">' + checks + '</div>'
        + WM.forms.formStatus(state.hookError ? 'error' : 'success', state.hookError || state.hookMessage)
        + '<div class="modal-actions"><button type="button" class="button button-primary" data-create-hook' + (state.hooksBusy ? ' disabled' : '') + '>'
        + (state.hooksBusy ? '<span class="loading-spinner"></span> Creating…' : 'Create webhook ' + ic('plus', 16)) + '</button></div>'
        + '</section>';

      let list;
      if (!state.webhooks.length) {
        list = ui.emptyView({ title: 'No webhooks yet', description: 'Create one above to start receiving WayMark events at your endpoint.' });
      } else {
        const rows = state.webhooks.map(function (h) {
          const eventBadges = (Array.isArray(h.events) && h.events.length)
            ? h.events.map(function (e) { return ui.badge(e, 'blue'); }).join(' ')
            : ui.badge('all events', 'slate');
          return '<div class="table-row"><div class="table-event"><strong>' + esc(h.url) + '</strong>'
            + '<small>' + eventBadges + '</small>'
            + '<small>Created ' + esc(h.createdAt || '—') + (h.secretSet ? ' · secret set' : '') + '</small></div>'
            + ui.badge(h.active ? 'Active' : 'Inactive', h.active ? 'green' : 'slate')
            + '<div class="row-actions">'
            + '<button class="button button-secondary" data-test="' + esc(h.id) + '">Send test</button>'
            + '<button class="button button-secondary" data-deliveries="' + esc(h.id) + '">Deliveries</button>'
            + '<button class="button button-ghost" data-delete-hook="' + esc(h.id) + '">Delete</button>'
            + '</div></div>';
        }).join('');
        list = '<section class="panel table-panel"><div class="table-head"><span>Endpoint</span><span>State</span><span></span></div>'
          + rows + '</section>';
      }

      const testPanel = state.testMessage
        ? '<section class="panel"><div class="form-info">' + ic('check', 14) + ' ' + esc(state.testMessage) + '</div></section>'
        : '';

      return create + testPanel + list + deliveriesPanel();
    }

    function deliveriesPanel() {
      if (!state.deliveriesFor) return '';
      let body;
      if (state.deliveriesError) {
        body = '<div class="form-error">' + esc(state.deliveriesError) + '</div>';
      } else if (!state.deliveries.length) {
        body = ui.emptyView({ title: 'No deliveries yet', description: 'Deliveries appear here after the server emits a matching event (use "Send test" to queue one).' });
      } else {
        const rows = state.deliveries.map(function (d) {
          const tone = d.status === 'Delivered' ? 'green' : (d.status === 'Failed' ? 'red' : (d.status === 'Skipped' ? 'slate' : 'amber'));
          return '<div class="table-row"><div class="table-event"><strong>' + esc(d.eventType) + '</strong>'
            + '<small>' + esc(d.createdAt || '') + (d.deliveredAt ? ' · delivered ' + esc(d.deliveredAt) : '') + '</small>'
            + (d.error ? '<small>' + esc(d.error) + '</small>' : '') + '</div>'
            + ui.badge(d.status, tone)
            + '<span>' + esc(d.attempts || 0) + ' attempt(s)' + (d.responseCode ? ' · HTTP ' + esc(d.responseCode) : '') + '</span>'
            + '<div class="row-actions"><button class="button button-secondary" data-retry="' + esc(d.id) + '">Retry</button></div></div>';
        }).join('');
        body = '<div class="table-head"><span>Delivery</span><span>Status</span><span>Attempts</span><span></span></div>' + rows;
      }
      return '<section class="panel table-panel">'
        + WM.ui.sectionHeading({ eyebrow: 'Webhooks', title: 'Recent deliveries',
          action: '<button class="button button-ghost" data-deliveries-back>' + ic('x', 15) + ' Close</button>' })
        + WM.forms.formStatus(state.retryMessage ? 'success' : 'idle', state.retryMessage)
        + body + '</section>';
    }

    /* ------------------------------------------------------------------ *
     * Calendar tab                                                        *
     * ------------------------------------------------------------------ */
    function calendarTab() {
      const abs = state.eventId ? origin() + global.WMApi.integrations.icsUrl(state.eventId) : '';
      const mine = origin() + '/api/me/calendar.ics';
      return '<section class="panel"><h3 class="section-title">Event calendar (ICS)</h3>'
        + eventSelect('cal-event', 'Event')
        + (state.eventId
          ? '<div class="form-field-group"><label for="cal-url">Absolute ICS URL</label>'
            + '<div class="form-input-wrap"><input id="cal-url" type="text" readonly value="' + esc(abs) + '" /></div></div>'
            + '<div class="modal-actions"><button type="button" class="button button-secondary" data-copy-cal>Copy URL</button>'
            + '<a class="button button-primary" href="' + esc(abs) + '" target="_blank" rel="noopener">Open .ics ' + ic('external-link', 15) + '</a></div>'
            : '<p class="lede">Pick an event to build its calendar subscription URL.</p>')
        + '<p class="lede">Unpublished events (draft/pending/cancelled) require host or admin access — '
        + 'anyone else receives a 401/403 from the server.</p>'
        + '</section>'
        + '<section class="panel"><h3 class="section-title">My calendar</h3>'
        + '<p class="lede">All Confirmed/Registered events for the signed-in user (authentication required).</p>'
        + '<div class="form-field-group"><label for="cal-mine">Absolute URL</label>'
        + '<div class="form-input-wrap"><input id="cal-mine" type="text" readonly value="' + esc(mine) + '" /></div></div>'
        + '<div class="modal-actions"><button type="button" class="button button-secondary" data-copy-mine>Copy URL</button>'
        + '<a class="button button-primary" href="' + esc(mine) + '" target="_blank" rel="noopener">Open .ics ' + ic('external-link', 15) + '</a></div>'
        + '</section>';
    }

    /* ------------------------------------------------------------------ *
     * Import tab                                                          *
     * ------------------------------------------------------------------ */
    function importTab() {
      let result = '';
      const r = state.importResult;
      if (r) {
        let errors = '';
        if (Array.isArray(r.errors) && r.errors.length) {
          const rows = r.errors.slice(0, 50).map(function (e) {
            return '<tr><td>' + esc(e.row) + '</td><td>' + esc(e.column) + '</td><td>' + esc(e.message) + '</td></tr>';
          }).join('');
          errors = '<h4 class="section-title">Errors</h4>'
            + '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Row</th><th>Column</th><th>Message</th></tr></thead>'
            + '<tbody>' + rows + '</tbody></table></div>'
            + (r.errors.length > 50 ? '<p class="lede">…and ' + (r.errors.length - 50) + ' more.</p>' : '');
        }
        const canCommit = r.mode !== 'commit' && Number(r.valid) > 0;
        result = '<section class="panel"><h3 class="section-title">Import result (' + esc(r.mode) + ')</h3>'
          + '<div class="stat-card"><div class="stat-icon stat-blue">' + ic('users', 19, 'stroke-width="2"') + '</div>'
          + '<div class="stat-copy"><span>Rows</span><strong>' + esc(r.total || 0) + ' total · ' + esc(r.valid || 0) + ' valid</strong>'
          + '<small>' + esc(r.skippedDuplicates || 0) + ' duplicate(s) skipped · ' + esc(r.created || 0) + ' created</small></div></div>'
          + errors
          + (r.mode === 'commit'
            ? WM.forms.formStatus('success', (r.created || 0) + ' registration(s) created.')
            : (canCommit
              ? '<div class="modal-actions"><button type="button" class="button button-primary" data-commit-import>Commit ' + esc(r.valid) + ' registration(s)</button></div>'
              : ''))
          + '</section>';
      }
      return '<section class="panel"><h3 class="section-title">Bulk-import registrations</h3>'
        + eventSelect('imp-event', 'Event')
        + '<div class="form-field-group"><label for="imp-file">CSV / XLSX file</label>'
        + '<div class="form-input-wrap"><input id="imp-file" type="file" accept=".csv,.xlsx,.xlsm,text/csv" /></div>'
        + (state.importFileName ? '<span class="form-hint">Selected: ' + esc(state.importFileName) + '</span>' : '') + '</div>'
        + WM.forms.textArea({ id: 'imp-paste', label: '…or paste CSV rows', rows: 5, value: state.importText,
          hint: 'Header row required: name, email, phone, college, category, team, notes',
          placeholder: 'name,email\nAda Lovelace,ada@example.com' })
        + WM.forms.formStatus(state.importError ? 'error' : 'idle', state.importError)
        + '<div class="modal-actions"><button type="button" class="button button-primary" data-validate-import' + (state.importBusy ? ' disabled' : '') + '>'
        + (state.importBusy ? '<span class="loading-spinner"></span> Validating…' : 'Validate import') + '</button></div>'
        + '<p class="lede">Validation runs server-side ("validate" mode); nothing is written until you commit. '
        + 'Files are posted as multipart field "file"; pasted rows travel as JSON {rows, mode}.</p>'
        + '</section>' + result;
    }

    /* ------------------------------------------------------------------ *
     * Exports tab                                                         *
     * ------------------------------------------------------------------ */
    function exportsTab() {
      const buttons = EXPORT_KINDS.map(function (kind) {
        return '<div class="row-actions">'
          + '<strong>' + esc(kind[1]) + '</strong>'
          + '<button class="button button-secondary" data-export="' + esc(kind[0]) + '" data-format="csv">CSV</button>'
          + '<button class="button button-secondary" data-export="' + esc(kind[0]) + '" data-format="xlsx">XLSX</button>'
          + '</div>';
      }).join('');
      return '<section class="panel"><h3 class="section-title">Event exports</h3>'
        + eventSelect('exp-event', 'Event')
        + '<p class="lede">Each button opens the signed download URL in a new tab. '
        + 'Exports are manager/admin only — if the server answers 403 you are not a manager for that event.</p>'
        + '<div class="form-grid-2">' + buttons + '</div></section>';
    }

    /* ------------------------------------------------------------------ *
     * Public API tab                                                      *
     * ------------------------------------------------------------------ */
    function apiTab() {
      let keysPanel;
      if (state.keysError) {
        keysPanel = '<section class="panel"><h3 class="section-title">Public API key</h3>'
          + '<div class="form-error">' + esc(state.keysError) + '</div>'
          + '<p class="lede">Only platform admins can read or rotate the key.</p></section>';
      } else if (state.keys && state.keys.publicApiKey) {
        keysPanel = '<section class="panel"><h3 class="section-title">Public API key</h3>'
          + '<div class="form-field-group"><label for="api-key">Key (admin only)</label>'
          + '<div class="form-input-wrap"><input id="api-key" type="text" readonly value="' + esc(state.keys.publicApiKey) + '" /></div></div>'
          + '<div class="modal-actions"><button type="button" class="button button-secondary" data-copy-key>Copy key</button>'
          + '<button type="button" class="button button-secondary" data-rotate-key' + (state.keysBusy ? ' disabled' : '') + '>Rotate key</button></div>'
          + '<p class="lede">Send it as header <code>X-WayMark-Key: &lt;key&gt;</code> on <code>GET /api/v1/events</code>, '
          + '<code>/api/v1/events/&lt;id&gt;</code> and <code>/api/v1/events/&lt;id&gt;/schedule</code>. '
          + 'The public feed carries event metadata only — no participant PII, no money. '
          + 'Rotating invalidates the previous key immediately.</p></section>';
      } else {
        keysPanel = '<section class="panel"><p class="lede">Loading API key…</p></section>';
      }

      let feed;
      if (state.feedError) {
        feed = '<div class="form-error">' + esc(state.feedError) + '</div>';
      } else if (!state.feed.length) {
        feed = ui.emptyView({ title: 'No public events', description: 'Published, open, ongoing or completed events will appear in the public feed.' });
      } else {
        const rows = state.feed.slice(0, 25).map(function (e) {
          return '<div class="table-row"><div class="table-event"><strong>' + esc(e.title) + '</strong>'
            + '<small>' + esc(e.date || '') + (e.time ? ' · ' + esc(e.time) : '') + ' · ' + esc(e.location || '') + '</small>'
            + '<small>' + esc(e.registeredNum || 0) + '/' + esc(e.capacityNum || e.seats || 0) + ' seats</small></div>'
            + ui.statusChip(e.status) + '</div>';
        }).join('');
        feed = '<section class="panel table-panel"><div class="table-head"><span>Event</span><span>Status</span></div>' + rows + '</section>';
      }

      return keysPanel
        + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Public API', title: 'Public feed preview (GET /v1/events)',
          action: '<button type="button" class="button button-secondary" data-refresh-feed>Refresh</button>' })
        + feed + '</section>';
    }

    /* ------------------------------------------------------------------ *
     * Render + wire                                                       *
     * ------------------------------------------------------------------ */
    function render() {
      const body = state.tab === 'Webhooks' ? webhooksTab()
        : state.tab === 'Calendar' ? calendarTab()
        : state.tab === 'Import' ? importTab()
        : state.tab === 'Exports' ? exportsTab()
        : apiTab();
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Administration', title: 'Integrations' })
        + '<p class="lede">Outbound webhooks, calendar feeds, bulk import/export and the public read-only API.</p>'
        + tabsBar() + body + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function reloadHooks() {
      return global.WMApi.integrations.webhooks().then(function (rows) {
        state.webhooks = Array.isArray(rows) ? rows : [];
      }, function () { state.webhooks = []; });
    }

    function reloadDeliveries() {
      if (!state.deliveriesFor) return;
      return global.WMApi.integrations.deliveries(state.deliveriesFor).then(function (rows) {
        state.deliveries = Array.isArray(rows) ? rows : [];
        state.deliveriesError = '';
        refresh();
      }, function (err) {
        state.deliveries = [];
        state.deliveriesError = (err && err.message) || 'Could not load deliveries.';
        refresh();
      });
    }

    function runImport(mode) {
      if (!state.eventId) { state.importError = 'Choose an event first.'; refresh(); return; }
      state.importError = ''; state.importBusy = true; refresh();

      const done = function (data) {
        state.importBusy = false;
        state.importResult = (data && typeof data === 'object') ? data : null;
        state.lastImport = { mode: mode };
        refresh();
      };
      const fail = function (err) {
        state.importBusy = false;
        state.importError = (err && err.message) || 'Import failed.';
        refresh();
      };

      if (state.importFile) {
        const sendFile = function () {
          const fd = new FormData();
          fd.append('file', state.importFile);
          fd.append('mode', mode);
          global.WMApi.integrations.importRegistrations(state.eventId, fd).then(done, function (err) {
            /* WMApi serialises bodies as JSON, so a FormData upload can degrade
             * server-side; CSV files were pre-parsed, so retry as JSON rows. */
            if (Array.isArray(state.importFileRows) && state.importFileRows.length) {
              global.WMApi.integrations.importRegistrations(state.eventId, { rows: state.importFileRows, mode: mode })
                .then(done, fail);
              return;
            }
            fail(err);
          });
        };
        if (state.importFileRows === null && /\.csv$/i.test(state.importFile.name || '')) {
          readCsvFile(state.importFile).then(function (parsed) {
            state.importFileRows = Array.isArray(parsed) ? parsed : null;
            sendFile();
          });
          return;
        }
        sendFile();
        return;
      }

      const rows = parseCsv(state.importText);
      if (!rows.length) { state.importBusy = false; state.importError = 'Paste CSV rows (with a header row) or choose a file.'; refresh(); return; }
      global.WMApi.integrations.importRegistrations(state.eventId, { rows: rows, mode: mode }).then(done, fail);
    }

    function wire() {
      qsa('[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); refresh(); });
      });

      const bindSelect = function (id, key) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', function () { state[key] = el.value; refresh(); });
      };
      bindSelect('cal-event', 'eventId');
      bindSelect('imp-event', 'eventId');
      bindSelect('exp-event', 'eventId');

      const urlInput = document.getElementById('hook-url');
      if (urlInput) urlInput.addEventListener('input', function () { state.hookForm.url = urlInput.value; });

      qsa('[data-hook-event]').forEach(function (b) {
        b.addEventListener('click', function () {
          const name = b.getAttribute('data-hook-event');
          const i = state.hookForm.events.indexOf(name);
          if (i === -1) state.hookForm.events.push(name); else state.hookForm.events.splice(i, 1);
          refresh();
        });
      });

      const createBtn = qs('[data-create-hook]');
      if (createBtn) createBtn.addEventListener('click', function () {
        const url = String(state.hookForm.url || '').trim();
        if (!url) { state.hookError = 'An endpoint URL is required.'; refresh(); return; }
        state.hookError = ''; state.hookMessage = ''; state.hooksBusy = true; refresh();
        global.WMApi.integrations.createWebhook({ url: url, events: state.hookForm.events.slice() }).then(function (data) {
          state.hooksBusy = false;
          state.hookForm = { url: '', events: [] };
          state.hookMessage = 'Webhook created'
            + (data && data.secretPlain ? ' — signing secret (shown once, store it now): ' + data.secretPlain : '.');
          reloadHooks().then(refresh);
        }, function (err) {
          state.hooksBusy = false;
          state.hookError = (err && err.message) || 'Could not create the webhook.';
          refresh();
        });
      });

      qsa('[data-test]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-test');
          const hook = state.webhooks.filter(function (h) { return String(h.id) === String(id); })[0];
          global.WMApi.integrations.testWebhook(id).then(function () {
            state.testMessage = 'Test accepted by the server (response ok) — it emitted "webhook.test" to '
              + ((hook && hook.url) || 'your endpoint') + '. Check the delivery list below.';
            if (state.deliveriesFor === id) { reloadDeliveries(); } else { refresh(); }
          }, function (err) { WM.toast((err && err.message) || 'Test failed.', 'error'); });
        });
      });

      qsa('[data-deliveries]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.deliveriesFor = b.getAttribute('data-deliveries');
          state.deliveries = []; state.deliveriesError = ''; state.retryMessage = '';
          refresh();
          reloadDeliveries();
        });
      });

      const backBtn = qs('[data-deliveries-back]');
      if (backBtn) backBtn.addEventListener('click', function () {
        state.deliveriesFor = ''; state.deliveries = []; state.deliveriesError = ''; state.retryMessage = '';
        refresh();
      });

      qsa('[data-retry]').forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          global.WMApi.integrations.retryDelivery(b.getAttribute('data-retry')).then(function (d) {
            /* The retry endpoint re-sends the SAME delivery row — it returns its
             * id and never creates a duplicate. */
            state.retryMessage = 'Delivery ' + ((d && d.id) || '?') + ' re-sent → status '
              + ((d && d.status) || '?') + ', attempts ' + ((d && d.attempts) || 0)
              + ((d && d.responseCode) ? ', HTTP ' + d.responseCode : '')
              + '. No duplicate delivery was created.';
            reloadDeliveries();
          }, function (err) {
            WM.toast((err && err.message) || 'Retry failed.', 'error');
            refresh();
          });
        });
      });

      qsa('[data-delete-hook]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-delete-hook');
          const hook = state.webhooks.filter(function (h) { return String(h.id) === String(id); })[0];
          if (!global.confirm('Delete webhook ' + ((hook && hook.url) || '') + '? Past delivery rows remain in the database.')) return;
          b.disabled = true;
          global.WMApi.integrations.removeWebhook(id).then(function () {
            WM.toast('Webhook deleted.');
            if (state.deliveriesFor === id) { state.deliveriesFor = ''; state.deliveries = []; }
            reloadHooks().then(refresh);
          }, function (err) { b.disabled = false; WM.toast((err && err.message) || 'Could not delete.', 'error'); });
        });
      });

      const copyCal = qs('[data-copy-cal]');
      if (copyCal) copyCal.addEventListener('click', function () {
        copyText(origin() + global.WMApi.integrations.icsUrl(state.eventId), 'ICS URL copied.');
      });
      const copyMine = qs('[data-copy-mine]');
      if (copyMine) copyMine.addEventListener('click', function () {
        copyText(origin() + '/api/me/calendar.ics', 'Calendar URL copied.');
      });

      const fileInput = document.getElementById('imp-file');
      if (fileInput) fileInput.addEventListener('change', function () {
        const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        state.importFile = file;
        state.importFileName = file ? (file.name || '') : '';
        state.importFileRows = null;
        state.importResult = null;
        if (file && /\.csv$/i.test(file.name || '')) {
          readCsvFile(file).then(function (parsed) { state.importFileRows = Array.isArray(parsed) ? parsed : null; });
        }
        refresh();
      });

      const pasteArea = document.getElementById('imp-paste');
      if (pasteArea) pasteArea.addEventListener('input', function () {
        state.importText = pasteArea.value;
        if (state.importFile) { state.importFile = null; state.importFileName = ''; state.importFileRows = null; }
      });

      const validateBtn = qs('[data-validate-import]');
      if (validateBtn) validateBtn.addEventListener('click', function () { runImport('validate'); });

      const commitBtn = qs('[data-commit-import]');
      if (commitBtn) commitBtn.addEventListener('click', function () { runImport('commit'); });

      qsa('[data-export]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!state.eventId) { WM.toast('Choose an event first.', 'error'); return; }
          const kind = b.getAttribute('data-export');
          const fmt = b.getAttribute('data-format') || 'csv';
          global.window.open(origin() + global.WMApi.integrations.exportUrl(state.eventId, kind, fmt), '_blank');
        });
      });

      const copyKey = qs('[data-copy-key]');
      if (copyKey) copyKey.addEventListener('click', function () {
        copyText((state.keys && state.keys.publicApiKey) || '', 'API key copied.');
      });

      const rotateBtn = qs('[data-rotate-key]');
      if (rotateBtn) rotateBtn.addEventListener('click', function () {
        if (!global.confirm('Rotate the public API key? Every integration using the current key stops working immediately.')) return;
        state.keysBusy = true; refresh();
        global.WMApi.integrations.rotateKeys({ rotate: true }).then(function (data) {
          state.keysBusy = false;
          state.keys = (data && typeof data === 'object') ? data : state.keys;
          WM.toast('API key rotated.');
          refresh();
        }, function (err) {
          state.keysBusy = false;
          state.keysError = (err && err.message) || 'Could not rotate the key.';
          refresh();
        });
      });

      const feedBtn = qs('[data-refresh-feed]');
      if (feedBtn) feedBtn.addEventListener('click', function () {
        global.WMApi.integrations.publicEvents().then(function (rows) {
          state.feed = Array.isArray(rows) ? rows : [];
          state.feedError = '';
          refresh();
        }, function (err) {
          state.feed = [];
          state.feedError = (err && err.message) || 'Could not load the public feed.';
          refresh();
        });
      });
    }

    function load() {
      return global.WMApi.events.list().then(function (events) {
        state.events = Array.isArray(events) ? events : [];
        if (state.events.length) state.eventId = String(state.events[0].id);
      }, function () { state.events = []; })
        .then(function () { return reloadHooks(); })
        .then(function () {
          return global.WMApi.integrations.keys().then(function (data) {
            state.keys = (data && typeof data === 'object') ? data : null;
            state.keysError = '';
          }, function (err) {
            state.keys = null;
            state.keysError = (err && err.message) || 'The API key is admin-only.';
          });
        })
        .then(function () {
          return global.WMApi.integrations.publicEvents().then(function (rows) {
            state.feed = Array.isArray(rows) ? rows : [];
            state.feedError = '';
          }, function (err) {
            state.feed = [];
            state.feedError = (err && err.message) || 'Could not load the public feed.';
          });
        });
    }

    WM.page({ route: '/integrations', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.integrations = integrationsPage;
})(window);
