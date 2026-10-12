/* Admin jobs page — background job monitoring & retries */
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

  function adminJobs() {
    const state = { rows: [], filter: 'all' };

    function normalizeStatus(value) {
      const s = String(value == null ? '' : value).toLowerCase();
      if (s.indexOf('fail') !== -1 || s.indexOf('error') !== -1) return 'Failed';
      if (s.indexOf('sent') !== -1 || s.indexOf('done') !== -1 || s.indexOf('success') !== -1) return 'Sent';
      if (s.indexOf('queue') !== -1 || s.indexOf('pending') !== -1 || s.indexOf('process') !== -1) return 'Queued';
      return 'Queued';
    }

    function normalizeJob(j) {
      j = j || {};
      let recipients;
      if (Array.isArray(j.recipients)) recipients = j.recipients.length;
      else if (j.recipients != null && j.recipients !== '') recipients = j.recipients;
      else if (j.count != null) recipients = j.count;
      else recipients = 0;
      return {
        id: j.id != null ? String(j.id) : '',
        type: j.type || j.template || j.kind || 'email',
        subject: j.subject || j.label || 'Email job',
        recipients: recipients,
        status: normalizeStatus(j.status),
        createdAt: j.createdAt || j.time || '',
        error: j.error || '',
        eventTitle: j.eventTitle || j.event || '',
      };
    }

    function normalize(list) { return asList(list).map(normalizeJob); }

    function fetchJobs() {
      return global.WMApi.admin.jobs().then(function (data) {
        return asList(data);
      }, function () {
        return global.WMApi.jobs.list().then(function (data) {
          return asList(data);
        }, function () {
          return [];
        });
      }).then(function (list) { state.rows = normalize(list); });
    }

    function load() {
      return D.ready().then(function () { return fetchJobs(); });
    }

    function counts() {
      const c = { Queued: 0, Sent: 0, Failed: 0 };
      state.rows.forEach(function (j) { if (c[j.status] != null) c[j.status] += 1; });
      return c;
    }

    function statusCell(status) {
      const cls = status === 'Failed' ? 'job-failed' : status === 'Sent' ? 'job-done' : 'job-queued';
      const icon = status === 'Failed' ? 'alert-triangle' : status === 'Sent' ? 'check' : 'clock';
      return '<span class="job-status ' + cls + '">' + ic(icon, 13) + esc(status) + '</span>';
    }

    function table() {
      const filtered = state.filter === 'all'
        ? state.rows
        : state.rows.filter(function (j) { return j.status.toLowerCase() === state.filter; });

      const head = '<tr><th>Type</th><th>Subject</th><th class="num">Recipients</th><th>Event</th><th>Created</th><th>Status</th><th>Actions</th></tr>';
      const rows = filtered.map(function (j) {
        const actions = (j.status === 'Failed'
          ? '<button class="button button-secondary" data-retry="' + esc(j.id) + '">' + ic('rotate-cw', 14) + 'Retry</button>'
          : '')
          + '<button class="button button-secondary" data-details="' + esc(j.id) + '">' + ic('info', 14) + 'Details</button>';
        return '<tr>'
          + '<td>' + esc(j.type) + '</td>'
          + '<td>' + esc(j.subject) + '</td>'
          + '<td class="num">' + esc(String(j.recipients)) + '</td>'
          + '<td>' + esc(j.eventTitle || '\u2014') + '</td>'
          + '<td>' + esc(j.createdAt || '\u2014') + '</td>'
          + '<td>' + statusCell(j.status) + '</td>'
          + '<td><div class="chip-row">' + actions + '</div></td>'
          + '</tr>';
      }).join('');

      if (!filtered.length) {
        return ui.emptyView({ title: 'No jobs found', description: 'Email jobs will appear here as hosts send messages.' });
      }
      return '<div class="data-table-wrap"><table class="data-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
    }

    function render() {
      const c = counts();
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Admin workspace', title: 'Jobs & failed sends' })
        + '<p class="lede">Background email and processing jobs across all events.</p>'
        + '<div class="stat-grid compact">'
        + ui.statCard({ label: 'Queued', value: String(c.Queued), detail: 'Waiting to send', icon: 'clock-3', accent: 'amber' })
        + ui.statCard({ label: 'Sent', value: String(c.Sent), detail: 'Delivered successfully', icon: 'check-circle-2', accent: 'teal' })
        + ui.statCard({ label: 'Failed', value: String(c.Failed), detail: 'Need a retry', icon: 'alert-circle', accent: 'rose' })
        + '</div>'
        + '<div class="search-toolbar compact-toolbar">'
        + '<label class="select-field">' + ic('filter', 17) + '<select id="job-filter">'
        + [['all', 'All statuses'], ['queued', 'Queued'], ['sent', 'Sent'], ['failed', 'Failed']].map(function (o) {
          return '<option value="' + o[0] + '"' + (state.filter === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('')
        + '</select>' + ic('chevron-down', 16) + '</label>'
        + '<button class="button button-secondary" data-refresh-jobs>' + ic('refresh-cw', 15) + 'Refresh</button>'
        + '</div>'
        + '<section class="panel">' + table() + '</section>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function findRow(id) {
      return state.rows.find(function (j) { return String(j.id) === String(id); });
    }

    function fact(label, value) {
      return '<div class="fact-item"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
    }

    function detailsModal(j) {
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card modal-card-wide" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<span class="eyebrow">Job details</span><h2>' + esc(j.subject) + '</h2>'
        + '<div class="fact-grid">'
        + fact('Job ID', j.id)
        + fact('Type', j.type)
        + fact('Recipients', String(j.recipients))
        + fact('Event', j.eventTitle || '\u2014')
        + fact('Status', j.status)
        + fact('Created', j.createdAt || '\u2014')
        + '</div>'
        + '<div class="form-field-group" style="margin-top:14px"><span class="eyebrow">Error detail</span>'
        + '<pre class="mono">' + esc(j.error || 'No error detail provided.') + '</pre></div>'
        + '<div class="modal-actions"><button class="button button-secondary" data-close-modal>Close</button></div>'
        + '</section></div>';
    }

    function reload() { fetchJobs().then(refresh); }

    function wire() {
      const sel = document.getElementById('job-filter');
      if (sel) sel.addEventListener('change', function () { state.filter = sel.value; refresh(); });

      const refreshBtn = document.querySelector('[data-refresh-jobs]');
      if (refreshBtn) refreshBtn.addEventListener('click', function () {
        fetchJobs().then(function () { WM.toast('Jobs refreshed.'); refresh(); });
      });

      document.querySelectorAll('[data-retry]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-retry');
          global.WMApi.admin.retryJob(id).then(function () {
            WM.toast('Retry queued.');
            reload();
          }, function (err) {
            WM.toast((err && err.message) || 'Something went wrong.', 'error');
          });
        });
      });

      document.querySelectorAll('[data-details]').forEach(function (b) {
        b.addEventListener('click', function () {
          const j = findRow(b.getAttribute('data-details'));
          if (j) WM.openModal(detailsModal(j));
        });
      });
    }

    WM.page({ route: '/admin-jobs', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.adminJobs = adminJobs;
})(window);
