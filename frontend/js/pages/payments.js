/* Payments + offline sync. WayMark never touches card data: checkout only
 * creates a Pending payment and a client reference. Verification is
 * server-side only (HMAC-SHA256 signature), and this page has no card
 * number / CVC / expiry inputs anywhere. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  function qs(sel) {
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function qsa(sel) {
    let nodes = null;
    try { nodes = document.querySelectorAll(sel); } catch (e) { nodes = null; }
    return (nodes && typeof nodes.forEach === 'function') ? nodes : [];
  }

  /* Money arrives as integer minor units; render major units ourselves. */
  function money(minor, currency) {
    let n = Number(minor);
    if (isNaN(n)) n = 0;
    return (n / 100).toFixed(2) + ' ' + (currency || 'INR');
  }

  function paymentsPage() {
    const state = {
      config: null, configLoaded: false, configError: '',
      regs: [], regId: '',
      payment: null, paymentError: '', paymentBusy: false,
      checkout: null, checkoutError: '', checkoutBusy: false,
      events: [], offlineEventId: '',
      sync: null, syncError: '', syncBusy: false,
      manifest: null, manifestError: '', manifestBusy: false,
    };

    function enabled() {
      return !!(state.config && state.config.provider);
    }

    function regOptions() {
      let opts = '<option value="">' + (state.regs.length ? 'Choose a registration…' : 'No registrations available') + '</option>';
      opts += state.regs.map(function (r) {
        return '<option value="' + esc(r.id) + '"' + (String(r.id) === String(state.regId) ? ' selected' : '') + '>'
          + esc(r.eventTitle || 'Registration') + (r.userName ? ' — ' + esc(r.userName) : '') + '</option>';
      }).join('');
      return opts;
    }

    function eventOptions() {
      let opts = '<option value="">' + (state.events.length ? 'Choose an event…' : 'No events available') + '</option>';
      opts += state.events.map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.offlineEventId) ? ' selected' : '') + '>'
          + esc(e.title) + '</option>';
      }).join('');
      return opts;
    }

    /* ------------------------------------------------------------------ *
     * Payments panels                                                     *
     * ------------------------------------------------------------------ */
    function configStrip() {
      if (state.configError) {
        return '<section class="panel"><div class="form-error">' + esc(state.configError) + '</div></section>';
      }
      if (!state.configLoaded) {
        return '<section class="panel"><p class="lede">Loading payment configuration…</p></section>';
      }
      const c = state.config || {};
      return '<section class="panel"><div class="form-grid-2">'
        + '<div class="stat-card"><div class="stat-icon stat-blue">' + ic('credit-card', 19, 'stroke-width="2"') + '</div>'
        + '<div class="stat-copy"><span>Provider</span><strong>' + esc(c.provider || 'Not configured') + '</strong>'
        + '<small>' + (enabled() ? 'Online payments enabled' : 'Payments are disabled on this server') + '</small></div></div>'
        + '<div class="stat-card"><div class="stat-icon stat-' + (c.mode === 'live' ? 'teal' : 'amber') + '">' + ic('flask-conical', 19, 'stroke-width="2"') + '</div>'
        + '<div class="stat-copy"><span>Mode</span><strong>' + esc(c.mode || '—') + '</strong>'
        + '<small>' + esc(c.currency || 'INR') + ' · ' + (enabled() ? 'enabled' : 'disabled') + '</small></div></div>'
        + '</div>'
        + (enabled() ? '' : '<p class="lede">Set <code>PAYMENT_PROVIDER</code> in the backend configuration to enable checkout. '
          + 'No checkout controls are shown while payments are disabled.</p>')
        + '</section>';
    }

    function paymentLookup() {
      let result;
      if (state.paymentError) {
        result = '<div class="form-info">' + ic('info', 14) + ' ' + esc(state.paymentError) + '</div>';
      } else if (state.payment) {
        const p = state.payment;
        result = '<div class="table-row" style="flex-wrap:wrap">'
          + '<div class="table-event"><strong>' + esc(money(p.amountMinor, p.currency)) + '</strong>'
          + '<small>Provider: ' + esc(p.provider || '—') + ' · reference ' + esc(p.providerRef || '—') + '</small>'
          + '<small>Created ' + esc(p.createdAt || '—') + (p.failureReason ? ' · ' + esc(p.failureReason) : '') + '</small></div>'
          + ui.statusChip(p.status)
          + '</div>';
      } else {
        result = '<p class="lede">Pick a registration to see its payment state.</p>';
      }
      return '<section class="panel"><h3 class="section-title">Registration payment</h3>'
        + '<div class="form-field-group"><label for="pay-reg">Registration</label>'
        + '<div class="form-input-wrap form-select-wrap"><select id="pay-reg"' + (state.regs.length ? '' : ' disabled') + '>' + regOptions() + '</select>'
        + ic('chevron-down', 16, 'class="form-select-chevron"') + '</div></div>'
        + result + '</section>';
    }

    function checkoutPanel() {
      let result = '';
      if (state.checkoutError) {
        result = '<div class="form-error">' + esc(state.checkoutError) + '</div>';
      } else if (state.checkout) {
        const c = state.checkout;
        result = '<div class="stat-card"><div class="stat-icon stat-teal">' + ic('receipt', 19, 'stroke-width="2"') + '</div>'
          + '<div class="stat-copy"><span>Pending payment created</span><strong>' + esc(money(c.amountMinor, c.currency)) + '</strong>'
          + '<small>paymentId ' + esc(c.paymentId) + ' · provider ' + esc(c.provider)
          + ' · clientReference ' + esc(c.clientReference) + '</small></div></div>'
          + '<p class="lede">Amount shown from integer minor units (' + esc(c.amountMinor) + '); '
          + 'the provider reports ' + esc(c.amount) + ' ' + esc(c.currency) + ' in major units.</p>';
      }

      return '<section class="panel"><h3 class="section-title">Sandbox checkout</h3>'
        + '<p class="lede">Starting checkout creates or reuses a Pending payment record and returns a client reference. '
        + 'It does not charge anything by itself. ' + ic('shield-check', 14) + ' '
        + '<strong>WayMark never handles card data</strong> — there are no card number, CVC or expiry fields anywhere on this page.</p>'
        + '<div class="modal-actions"><button type="button" class="button button-primary" data-start-checkout'
        + (state.checkoutBusy || !state.regId ? ' disabled' : '') + '>'
        + (state.checkoutBusy ? '<span class="loading-spinner"></span> Starting…' : 'Start checkout ' + ic('arrow-right', 15)) + '</button></div>'
        + result
        + '<div class="form-info" style="display:block">' + ic('lock', 14) + ' <strong>Verification is server-side only.</strong> '
        + 'A payment becomes Paid when a trusted server POSTs <code>/api/payments/verify</code> (or the provider webhook) with header '
        + '<code>X-WayMark-Signature</code> = HMAC-SHA256 over <code>providerRef|registrationId|amountMinor</code>, keyed by '
        + '<code>PAYMENT_SECRET</code>. This UI cannot and does not verify payments client-side.</div>'
        + '</section>';
    }

    function webhookNote() {
      return '<section class="panel"><h3 class="section-title">Operator note: payment webhooks</h3>'
        + '<p class="lede"><code>POST /api/payments/&lt;provider&gt;/webhook</code> exists for providers. It is '
        + 'signature-verified with the same HMAC-SHA256 scheme (<code>X-WayMark-Signature</code> over '
        + '<code>providerRef|registrationId|amountMinor</code>) and idempotent on <code>providerRef</code>: replays return '
        + '<code>{"ok": true, "duplicate": true}</code> without changing state. Only non-sensitive metadata is stored.</p>'
        + '</section>';
    }

    /* ------------------------------------------------------------------ *
     * Offline panels                                                      *
     * ------------------------------------------------------------------ */
    function offlinePanel() {
      let sync = '';
      if (state.syncError) {
        sync = '<div class="form-error">' + esc(state.syncError) + '</div>';
      } else if (state.sync) {
        const s = state.sync;
        const devices = Array.isArray(s.devices) && s.devices.length
          ? '<div class="table-head"><span>Device</span><span>Scans</span><span>Last seen</span></div>'
            + s.devices.map(function (d) {
              return '<div class="table-row"><div class="table-event"><strong>' + esc(d.deviceId || 'unknown') + '</strong></div>'
                + '<span>' + esc(d.scans || 0) + '</span><span>' + esc(d.lastSeen || '—') + '</span></div>';
            }).join('')
          : '<p class="lede">No devices have synced for this event yet.</p>';
        sync = '<div class="form-grid-2">'
          + stat('Check-ins accepted', s.accepted, 'teal', 'user-check')
          + stat('Duplicates', s.duplicates, 'blue', 'copy')
          + stat('Rejected', s.rejected, 'rose', 'ban')
          + stat('Conflicts', s.conflicts, 'amber', 'git-merge')
          + stat('Pending (offline)', s.pending, 'blue', 'cloud-off')
          + '</div>'
          + '<p class="lede">Last sync: ' + esc(s.lastSyncAt || '—') + '</p>'
          + '<section class="panel table-panel">' + devices + '</section>';
      }

      let manifest = '';
      if (state.manifestError) {
        manifest = '<div class="form-error">' + esc(state.manifestError) + '</div>';
      } else if (state.manifest) {
        const m = state.manifest;
        const items = Array.isArray(m.items) ? m.items : [];
        const shown = items.slice(0, 100);
        manifest = '<p class="lede">' + esc(m.title || '') + (m.date ? ' · ' + esc(m.date) : '')
          + (m.venue ? ' · ' + esc(m.venue) : '') + ' · expires ' + esc(m.expiresAt || '—') + '</p>'
          + '<p class="lede"><strong>' + esc(items.length) + '</strong> ticket code(s) in the manifest'
          + (items.length > shown.length ? ' — showing the first ' + shown.length : '') + '. '
          + 'Only ticket codes and registration ids are included (no names or emails).</p>'
          + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
          + shown.map(function (t) {
            return '<span class="chip" title="registration ' + esc(t.registrationId) + '">' + esc(t.ticketCode) + '</span>';
          }).join('')
          + '</div>'
          + '<div class="queue-callout" style="margin-top:16px"><div class="callout-icon">' + ic('alert-triangle', 20) + '</div>'
          + '<div><strong>Offline warning</strong><span>' + esc(m.offlineNote || '') + '</span></div></div>';
      }

      return '<section class="panel"><h3 class="section-title">Offline check-in sync</h3>'
        + '<div class="form-field-group"><label for="off-event">Event</label>'
        + '<div class="form-input-wrap form-select-wrap"><select id="off-event"' + (state.events.length ? '' : ' disabled') + '>'
        + eventOptions() + '</select>' + ic('chevron-down', 16, 'class="form-select-chevron"') + '</div></div>'
        + '<div class="modal-actions">'
        + '<button type="button" class="button button-secondary" data-sync-status' + (state.syncBusy || !state.offlineEventId ? ' disabled' : '') + '>Sync status</button>'
        + '<button type="button" class="button button-primary" data-manifest' + (state.manifestBusy || !state.offlineEventId ? ' disabled' : '') + '>Offline manifest</button>'
        + '</div>'
        + sync
        + '</section>'
        + '<section class="panel"><h3 class="section-title">Offline manifest</h3>' + manifest + '</section>';
    }

    function stat(label, value, accent, icon) {
      return '<div class="stat-card"><div class="stat-icon stat-' + accent + '">' + ic(icon, 19, 'stroke-width="2"') + '</div>'
        + '<div class="stat-copy"><span>' + esc(label) + '</span><strong>' + esc(value == null ? 0 : value) + '</strong></div></div>';
    }

    /* ------------------------------------------------------------------ *
     * Render + wire                                                       *
     * ------------------------------------------------------------------ */
    function render() {
      const paymentsBody = enabled()
        ? paymentLookup() + checkoutPanel() + webhookNote()
        : ui.emptyView({
          title: 'Payments are disabled on this server',
          description: 'No payment provider is configured, so checkout is unavailable. Registration payment lookup and card handling are disabled — WayMark never handles card data.',
        });

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Administration', title: 'Payments & offline sync' })
        + '<p class="lede">Provider configuration, payment lookup, sandbox checkout and offline attendance sync.</p>'
        + configStrip() + paymentsBody + offlinePanel()
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function loadPayment() {
      if (!state.regId) { state.payment = null; state.paymentError = ''; refresh(); return; }
      state.paymentBusy = true; state.paymentError = '';
      global.WMApi.payments.registration(state.regId).then(function (data) {
        state.paymentBusy = false;
        state.payment = (data && typeof data === 'object') ? data : null;
        state.paymentError = '';
        refresh();
      }, function (err) {
        state.paymentBusy = false;
        state.payment = null;
        /* 404 means no payment recorded yet — show the backend message. */
        state.paymentError = (err && err.message) || 'Could not load the payment.';
        refresh();
      });
    }

    function wire() {
      const regSel = document.getElementById('pay-reg');
      if (regSel) regSel.addEventListener('change', function () {
        state.regId = regSel.value;
        state.checkout = null; state.checkoutError = '';
        refresh();
        loadPayment();
      });

      const checkoutBtn = qs('[data-start-checkout]');
      if (checkoutBtn) checkoutBtn.addEventListener('click', function () {
        if (!state.regId) { WM.toast('Choose a registration first.', 'error'); return; }
        state.checkoutBusy = true; state.checkoutError = ''; refresh();
        global.WMApi.payments.checkout(state.regId).then(function (data) {
          state.checkoutBusy = false;
          state.checkout = (data && typeof data === 'object') ? data : null;
          refresh();
        }, function (err) {
          state.checkoutBusy = false;
          state.checkout = null;
          state.checkoutError = (err && err.message) || 'Could not start checkout.';
          refresh();
        });
      });

      const offSel = document.getElementById('off-event');
      if (offSel) offSel.addEventListener('change', function () {
        state.offlineEventId = offSel.value;
        state.sync = null; state.syncError = ''; state.manifest = null; state.manifestError = '';
        refresh();
      });

      const syncBtn = qs('[data-sync-status]');
      if (syncBtn) syncBtn.addEventListener('click', function () {
        if (!state.offlineEventId) { WM.toast('Choose an event first.', 'error'); return; }
        state.syncBusy = true; state.syncError = ''; refresh();
        global.WMApi.offline.syncStatus(state.offlineEventId).then(function (data) {
          state.syncBusy = false;
          state.sync = (data && typeof data === 'object') ? data : null;
          refresh();
        }, function (err) {
          state.syncBusy = false;
          state.sync = null;
          state.syncError = (err && err.message) || 'Could not load sync status.';
          refresh();
        });
      });

      const manifestBtn = qs('[data-manifest]');
      if (manifestBtn) manifestBtn.addEventListener('click', function () {
        if (!state.offlineEventId) { WM.toast('Choose an event first.', 'error'); return; }
        state.manifestBusy = true; state.manifestError = ''; refresh();
        global.WMApi.offline.manifest(state.offlineEventId).then(function (data) {
          state.manifestBusy = false;
          state.manifest = (data && typeof data === 'object') ? data : null;
          refresh();
        }, function (err) {
          state.manifestBusy = false;
          state.manifest = null;
          state.manifestError = (err && err.message) || 'Could not load the manifest.';
          refresh();
        });
      });
    }

    function load() {
      return global.WMApi.payments.config().then(function (data) {
        state.config = (data && typeof data === 'object') ? data : null;
        state.configLoaded = true;
        state.configError = '';
      }, function (err) {
        state.config = null;
        state.configLoaded = true;
        state.configError = (err && err.message) || 'Could not load payment configuration.';
      })
        .then(function () {
          return global.WMApi.registrations.list().then(function (rows) {
            state.regs = Array.isArray(rows) ? rows : [];
          }, function () { state.regs = []; });
        })
        .then(function () {
          return global.WMApi.events.list().then(function (rows) {
            state.events = Array.isArray(rows) ? rows : [];
            if (state.events.length) state.offlineEventId = String(state.events[0].id);
          }, function () { state.events = []; });
        });
    }

    WM.page({ route: '/payments', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.payments = paymentsPage;
})(window);
