/* My certificates page — participant credential wallet */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

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

  function myCertificates() {
    const state = { rows: [] };

    function normalizeRow(c) {
      c = c || {};
      const id = c.id != null ? String(c.id) : '';
      return {
        id: id,
        recipientName: c.recipientName || c.recipient || '',
        eventTitle: c.eventTitle || c.event || '',
        issueDate: c.issueDate || c.date || '',
        credentialId: c.credentialId || c.credential || id,
        issuer: c.issuer || 'WayMark Platform',
        type: c.type || 'Participation',
        status: c.status || 'Valid',
      };
    }

    function normalize(list) { return asList(list).map(normalizeRow); }

    function load() {
      return D.ready().then(function () {
        state.rows = normalize(D.certificates);
        return null;
      });
    }

    function mounted() {
      wire();
      global.WMApi.me.certificates().then(function (data) {
        const list = asList(data);
        if (list.length) { state.rows = normalize(list); refresh(); }
      }, function () { /* keep fallback rows */ });
    }

    function card(c) {
      return '<article class="report-card">'
        + '<div class="stat-icon stat-blue">' + ic('award', 19) + '</div>'
        + '<strong>' + esc(c.eventTitle || 'Certificate') + '</strong>'
        + '<small>Recipient: ' + esc(c.recipientName || '\u2014') + ' &middot; ' + esc(c.type) + '</small>'
        + '<span class="mono">' + esc(c.credentialId || '\u2014') + '</span>'
        + '<div class="chip-row">' + WM.statusChip(c.status) + '</div>'
        + '<small>Issued ' + esc(c.issueDate || '\u2014') + ' &middot; ' + esc(c.issuer) + '</small>'
        + '<div class="chip-row">'
        + '<button class="button button-secondary" data-view="' + esc(c.id) + '">' + ic('eye', 15) + 'View</button>'
        + '<a class="button button-secondary" href="forms-certificate-verify.html?credential=' + encodeURIComponent(c.credentialId || '') + '">' + ic('shield-check', 15) + 'Verify</a>'
        + '<button class="button button-secondary" data-download="' + esc(c.id) + '">' + ic('download', 15) + 'Download</button>'
        + '</div>'
        + '</article>';
    }

    function render() {
      const body = state.rows.length
        ? '<div class="report-card-grid">' + state.rows.map(card).join('') + '</div>'
        : ui.emptyView({
            title: 'No certificates yet',
            description: 'Certificates appear here after you attend and complete an event.',
            action: '<a class="button button-secondary" href="discover.html">' + ic('calendar-days', 16) + 'Browse events</a>',
          });
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Your credentials', title: 'My certificates' })
        + '<p class="lede">Credentials issued to you, ready to download or verify.</p>'
        + body
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function findRow(id) {
      return state.rows.find(function (r) { return String(r.id) === String(id); });
    }

    function certModal(c) {
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<div class="eyebrow">Certificate</div>'
        + '<div style="border:1px solid var(--wm-border);border-radius:12px;padding:26px;text-align:center;display:flex;flex-direction:column;gap:8px;align-items:center">'
        + '<div class="stat-icon stat-blue">' + ic('award', 22) + '</div>'
        + '<h2 style="margin:0">' + esc(c.eventTitle || 'Certificate') + '</h2>'
        + '<span class="eyebrow" style="margin:0">Awarded to</span>'
        + '<strong style="font-size:18px">' + esc(c.recipientName || '\u2014') + '</strong>'
        + '<span class="mono">' + esc(c.credentialId || '\u2014') + '</span>'
        + '<small>Issued ' + esc(c.issueDate || '\u2014') + ' by ' + esc(c.issuer) + '</small>'
        + '</div>'
        + '<div class="modal-actions"><button class="button button-secondary" data-close-modal>Close</button></div>'
        + '</section></div>';
    }

    function download(c) {
      const csv = 'Credential ID,Recipient,Event,Type,Issuer,Issue Date,Status\n'
        + '"' + c.credentialId + '","' + c.recipientName + '","' + c.eventTitle + '","' + c.type + '","' + c.issuer + '","' + c.issueDate + '","' + c.status + '"';
      WM.downloadCSV('waymark-certificate-' + String(c.credentialId || 'certificate') + '.csv', csv);
      WM.toast('Certificate download started.');
    }

    function wire() {
      document.querySelectorAll('[data-view]').forEach(function (b) {
        b.addEventListener('click', function () {
          const c = findRow(b.getAttribute('data-view'));
          if (c) WM.openModal(certModal(c));
        });
      });
      document.querySelectorAll('[data-download]').forEach(function (b) {
        b.addEventListener('click', function () {
          const c = findRow(b.getAttribute('data-download'));
          if (c) download(c);
        });
      });
    }

    WM.page({ route: '/my-certificates', render: render, mounted: mounted, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.myCertificates = myCertificates;
})(window);
