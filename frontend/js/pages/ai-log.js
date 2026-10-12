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

  function truncate(text, n) {
    const s = String(text == null ? '' : text);
    if (s.length <= n) return s;
    return s.slice(0, n) + '\u2026';
  }

  function normalize(row) {
    const r = row || {};
    return {
      id: r.id != null ? r.id : '',
      createdAt: r.createdAt || r.time || r.timestamp || '',
      feature: r.feature || 'AI',
      model: r.model || '\u2014',
      user: r.user || r.userName || r.email || 'system',
      prompt: r.prompt || '',
      response: r.response || '',
      tokens: r.tokens != null ? r.tokens : null,
      status: r.status || 'ok',
      context: r.context || null,
      eventId: r.eventId || '',
    };
  }

  function aiLogPage() {
    const state = { rows: [], filtered: [], feature: 'All features', search: '' };

    function statusBadge(status) {
      return String(status || '').toLowerCase() === 'ok'
        ? ui.badge('Completed', 'green')
        : ui.badge(status || 'Failed', 'red');
    }

    function fact(label, value) {
      return '<div class="fact-item"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
    }

    function rowHTML(row, index) {
      return '<tr data-row="' + index + '">'
        + '<td>' + esc(row.createdAt || '\u2014') + '</td>'
        + '<td>' + ui.badge(row.feature, 'blue') + '</td>'
        + '<td>' + esc(row.user) + '</td>'
        + '<td class="mono">' + esc(row.model) + '</td>'
        + '<td>' + esc(truncate(row.prompt, 70)) + '</td>'
        + '<td class="num">' + (row.tokens == null ? '\u2014' : esc(row.tokens)) + '</td>'
        + '<td>' + statusBadge(row.status) + '</td>'
        + '</tr>';
    }

    function rowModal(row) {
      const contextBlock = row.context
        ? '<h4>Context</h4><pre class="mono">' + esc(JSON.stringify(row.context, null, 2)) + '</pre>'
        : '';
      const eventBlock = row.eventId
        ? '<p class="lede"><strong>Event:</strong> <span class="mono">' + esc(row.eventId) + '</span></p>'
        : '';
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card modal-card-wide" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<span class="eyebrow">AI call detail</span><h2>' + esc(row.feature) + '</h2>'
        + '<div class="fact-grid">'
        + fact('Time', row.createdAt || '\u2014')
        + fact('Feature', row.feature)
        + fact('User', row.user)
        + fact('Model', row.model)
        + fact('Tokens', row.tokens == null ? '\u2014' : row.tokens)
        + fact('Status', String(row.status).toLowerCase() === 'ok' ? 'Completed' : 'Failed')
        + '</div>'
        + eventBlock
        + '<h4>Prompt</h4><pre class="mono">' + esc(row.prompt || '\u2014') + '</pre>'
        + '<h4>Response</h4><pre class="mono">' + esc(row.response || '\u2014') + '</pre>'
        + contextBlock
        + '<div class="modal-actions"><button class="button button-secondary" data-close-modal>Close</button></div>'
        + '</section></div>';
    }

    function render() {
      const all = state.rows || [];
      const filtered = all.filter(function (r) {
        const byFeature = state.feature === 'All features' || r.feature === state.feature;
        const bySearch = !state.search || String(r.prompt || '').toLowerCase().indexOf(state.search.toLowerCase()) !== -1;
        return byFeature && bySearch;
      });
      state.filtered = filtered;

      const tokensSum = all.reduce(function (sum, r) { return sum + (r.tokens == null ? 0 : Number(r.tokens) || 0); }, 0);
      const anyTokens = all.some(function (r) { return r.tokens != null; });
      const failed = all.filter(function (r) { return String(r.status).toLowerCase() !== 'ok'; }).length;

      const stats = '<div class="stat-grid compact">'
        + ui.statCard({ label: 'Total calls', value: String(all.length), detail: 'Assistant requests logged', icon: 'sparkles', accent: 'blue' })
        + ui.statCard({ label: 'Tokens used', value: anyTokens ? String(tokensSum) : '\u2014', detail: 'Across all features', icon: 'gauge', accent: 'teal' })
        + ui.statCard({ label: 'Failed calls', value: String(failed), detail: 'Need review', icon: 'alert-triangle', accent: 'amber' })
        + '</div>';

      const features = ['All features', 'Draft event', 'Draft message', 'Summarise feedback', 'Ask assistant'];
      const filters = '<div class="search-toolbar">'
        + '<label class="search-field">' + ic('search', 18)
        + '<input id="ai-search" value="' + esc(state.search) + '" placeholder="Search prompts..." /></label>'
        + '<label class="select-field">' + ic('filter', 17) + '<select id="ai-feature">'
        + features.map(function (f) { return '<option' + (f === state.feature ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('')
        + '</select>' + ic('chevron-down', 16) + '</label>'
        + '</div>';

      const header = ui.sectionHeading({ eyebrow: 'Administration', title: 'AI log' })
        + '<p class="lede">Every assistant call made on the platform, with prompts and outcomes.</p>';

      let body;
      if (!all.length) {
        body = ui.emptyView({
          title: 'No AI calls logged yet',
          description: 'Assistant usage will appear here once hosts start drafting with AI.',
        });
      } else if (!filtered.length) {
        body = '<section class="panel"><p class="lede" style="margin:0">No AI calls match your filters.</p></section>';
      } else {
        body = '<section class="panel table-panel"><div class="data-table-wrap"><table class="data-table"><thead><tr>'
          + '<th>Time</th><th>Feature</th><th>User</th><th>Model</th><th>Prompt</th><th class="num">Tokens</th><th>Status</th>'
          + '</tr></thead><tbody>' + filtered.map(rowHTML).join('') + '</tbody></table></div></section>';
      }

      return '<div class="page-stack">' + header + stats + filters + body + '</div>';
    }

    function refresh(focusId) { WM.refreshContent(render, focusId); wire(); }

    function wire() {
      const search = document.getElementById('ai-search');
      if (search) search.addEventListener('input', function () {
        state.search = search.value;
        const pos = search.selectionStart;
        refresh('ai-search');
        const next = document.getElementById('ai-search');
        if (next && next.setSelectionRange) next.setSelectionRange(pos, pos);
      });

      const feature = document.getElementById('ai-feature');
      if (feature) feature.addEventListener('change', function () { state.feature = feature.value; refresh(); });

      document.querySelectorAll('[data-row]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          const row = (state.filtered || [])[Number(tr.getAttribute('data-row'))];
          if (row) WM.openModal(rowModal(row));
        });
      });
    }

    function load() {
      return global.WMApi.admin.aiLogs().then(function (data) {
        state.rows = asList(data, ['logs', 'aiLogs', 'ai_logs']).map(normalize);
        return null;
      }, function () {
        state.rows = [];
        return null;
      });
    }

    WM.page({ route: '/ai-log', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.aiLog = aiLogPage;
})(window);
