/* Results & release page */
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

  function resultsPage() {
    const state = { eventId: '', released: false, rows: [] };

    function normalizeRows(list) {
      return (list || []).map(function (row) {
        var score = Number(row.score); if (isNaN(score)) score = 0;
        var maxScore = Number(row.maxScore); if (isNaN(maxScore)) maxScore = 0;
        return {
          rank: row.rank != null ? row.rank : '',
          teamName: row.teamName || row.projectTitle || row.name || '',
          projectTitle: row.projectTitle || row.name || '',
          track: row.track || '',
          score: score,
          maxScore: maxScore,
          award: row.award || '',
          tone: row.tone || '',
        };
      });
    }

    function fetchResults() {
      if (!state.eventId) { state.rows = normalizeRows(D.leaderboard || []); return Promise.resolve(); }
      return WMApi.events.results(state.eventId).then(function (data) {
        var list = asList(data);
        state.rows = normalizeRows(list.length ? list : (D.leaderboard || []));
      }, function () {
        state.rows = normalizeRows(D.leaderboard || []);
      });
    }

    function load() {
      return D.ready().then(function () {
        var events = D.events || [];
        if (events.length) state.eventId = events[0].id;
        return fetchResults();
      });
    }

    function eventSelect() {
      var events = D.events || [];
      if (!events.length) {
        return '<label class="select-field">' + ic('calendar-days', 16)
          + '<select id="res-event" disabled><option>No events available</option></select>'
          + ic('chevron-down', 15) + '</label>';
      }
      return '<label class="select-field">' + ic('calendar-days', 16) + '<select id="res-event">'
        + events.map(function (e) {
          return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
            + esc(e.title) + '</option>';
        }).join('')
        + '</select>' + ic('chevron-down', 15) + '</label>';
    }

    function render() {
      var rows = state.rows || [];
      var scores = rows.map(function (r) { return Number(r.score) || 0; });
      var count = rows.length;
      var avg = 0, max = 0, min = 0;
      if (count) {
        max = Math.max.apply(null, scores);
        min = Math.min.apply(null, scores);
        var sum = scores.reduce(function (a, b) { return a + b; }, 0);
        avg = sum / count;
      }
      var spread = max > 0 ? (max - min) / max : 0;
      var spreadPct = Math.round(spread * 100);

      var jury = D.juryAssignments || [];
      var names = [];
      jury.forEach(function (a) {
        var n = a.juryName || a.name;
        if (n && names.indexOf(n) === -1) names.push(n);
      });
      var juryCount = names.length || jury.length;

      var releaseChip = state.released ? ui.badge('Results released', 'green') : ui.badge('Not released', 'amber');

      var spreadFlag = spread > 0.2
        ? '<div class="spread-flag">' + ic('alert-triangle', 13) + ' Wide score spread \u2014 review before release</div>'
        : '';

      var releaseBtn = state.released
        ? '<button class="button button-primary" disabled>' + ic('check', 15) + ' Results released</button>'
        : '<button class="button button-primary" data-release>' + ic('send', 15) + ' Release results</button>';

      var table;
      if (count) {
        var body = rows.map(function (row, i) {
          var tie = '';
          for (var j = 0; j < rows.length; j++) {
            if (j !== i && Math.abs((Number(rows[j].score) || 0) - (Number(row.score) || 0)) <= 0.01) {
              var otherRank = (rows[j].rank !== '' && rows[j].rank != null) ? rows[j].rank : (j + 1);
              tie = '<div class="tie-note">Tied with #' + esc(otherRank) + '</div>';
              break;
            }
          }
          return '<tr>'
            + '<td><span class="rank-cell">#' + esc(row.rank) + '</span>' + tie + '</td>'
            + '<td><strong>' + esc(row.teamName) + '</strong><div class="tie-note">' + esc(row.projectTitle) + '</div></td>'
            + '<td>' + esc(row.track) + '</td>'
            + '<td class="num">' + esc(row.score) + ' / ' + esc(row.maxScore) + ' pts</td>'
            + '<td>' + (row.award ? ui.badge(row.award, row.tone || 'slate') : '\u2014') + '</td>'
            + '</tr>';
        }).join('');
        table = '<section class="panel table-panel"><div class="data-table-wrap"><table class="data-table">'
          + '<thead><tr><th>Rank</th><th>Team / project</th><th>Track</th><th class="num">Score</th><th>Award</th></tr></thead>'
          + '<tbody>' + body + '</tbody></table></div></section>';
      } else {
        table = ui.emptyView({
          title: 'No rankings yet',
          description: 'Scores will appear here once the jury submits their evaluations.',
        });
      }

      return '<div class="page-stack">'
        + ui.sectionHeading({
          eyebrow: 'Hosting',
          title: 'Results & release',
          action: '<div class="chip-row">' + eventSelect() + releaseChip + '</div>',
        })
        + '<div class="stat-grid">'
        + ui.statCard({ label: 'Submissions scored', value: String(count), detail: 'Ranked entries', icon: 'clipboard-check', accent: 'blue' })
        + ui.statCard({ label: 'Jury members', value: String(juryCount), detail: 'Assigned to this event', icon: 'users', accent: 'teal' })
        + ui.statCard({ label: 'Average score', value: count ? avg.toFixed(1) : '0', detail: 'Across all submissions', icon: 'gauge', accent: 'amber' })
        + ui.statCard({ label: 'Score spread', value: spreadPct + '%', detail: 'Max vs min difference', icon: 'trending-up', accent: 'rose' })
        + '</div>'
        + spreadFlag
        + '<div class="result-meta"><span>Final rankings</span>' + releaseBtn + '</div>'
        + table
        + '<p class="lede">Need to correct a score? <a class="text-link" href="forms-scoring.html">Reopen a score</a>.</p>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function releaseModal() {
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<div class="modal-icon">' + ic('trophy', 21) + '</div>'
        + '<div class="eyebrow">Final step</div><h2>Release results?</h2>'
        + '<p>Participants will see final rankings and awards. This cannot be undone.</p>'
        + '<div class="modal-actions"><button class="button button-secondary" data-close-modal>Cancel</button>'
        + '<button class="button button-primary" data-confirm-release>' + ic('check', 15) + ' Release results</button></div>'
        + '</section></div>';
    }

    function doRelease() {
      if (!state.eventId) { WM.closeModal(); WM.toast('Select an event first.', 'warning'); return; }
      WMApi.events.releaseResults(state.eventId).then(function () {
        state.released = true;
        WM.closeModal();
        WM.toast('Results released.');
        refresh();
      }, function (err) {
        WM.toast((err && err.message) || 'Something went wrong.', 'error');
      });
    }

    function wire() {
      var sel = document.getElementById('res-event');
      if (sel) sel.addEventListener('change', function () {
        state.eventId = sel.value;
        state.released = false;
        fetchResults().then(refresh, refresh);
      });
      var rb = document.querySelector('[data-release]');
      if (rb) rb.addEventListener('click', function () {
        WM.openModal(releaseModal());
        var confirm = document.querySelector('[data-confirm-release]');
        if (confirm) confirm.addEventListener('click', doRelease);
      });
    }

    WM.page({ route: '/results', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.results = resultsPage;
})(window);
