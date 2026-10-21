/* Analytics page.
 *
 * Three views:
 *   Event analytics  - pick an event and render the metric groups the backend
 *                      returns (registrations over time, attendance, capacity,
 *                      feedback, sessions, expenses, sponsors, volunteers,
 *                      competition, retention).
 *   Compare events   - pick two events and render the backend delta table.
 *   Query            - ask one of the allow-listed analytics questions.
 *
 * Every metric shown comes with its backend `formula` where available, so the
 * UI never implies a number was invented.
 */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;
  const Api = global.WMApi;

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

  function numOrDash(v) {
    return (v === null || v === undefined) ? '\u2014' : String(v);
  }

  // document.querySelectorAll can return null in the smoke harness; never assume.
  function qa(selector) {
    const node = document.querySelectorAll(selector);
    return node && typeof node.forEach === 'function' ? node : [];
  }

  const CHART_COLORS = ['#3b7291', '#377569', '#9b6a2a', '#a45d53', '#6b7c76', '#5b6ea8'];

  function metricsToBars(rows, labelKey, valueKey) {
    return asList(rows).map(function (r) {
      const label = r[labelKey] != null ? String(r[labelKey]) : '';
      const value = r[valueKey] != null ? r[valueKey] : (r.count != null ? r.count : 0);
      return { label: label, value: Number(value) || 0 };
    });
  }

  function analyticsPage() {
    const state = {
      view: 'event',
      eventId: '',
      compareA: '',
      compareB: '',
      question: '',
      metric: null,
      compare: null,
      query: null,
      queryError: '',
      insight: null,
      busy: '',
    };

    const QUERY_SUGGESTIONS = [
      'registrations over time',
      'top session',
      'incomplete tasks',
      'over budget',
      'no show',
      'feedback',
      'capacity',
      'compare editions',
    ];

    function eventName(id) {
      const events = D.events || [];
      for (let i = 0; i < events.length; i += 1) {
        if (String(events[i].id) === String(id)) return events[i].title;
      }
      return String(id || '\u2014');
    }

    function eventOptions(selected, idName) {
      const events = D.events || [];
      if (!events.length) {
        return '<label class="select-field">' + ic('calendar-days', 16)
          + '<select id="' + idName + '" disabled><option>No events available</option></select>'
          + ic('chevron-down', 15) + '</label>';
      }
      return '<label class="select-field">' + ic('calendar-days', 16) + '<select id="' + idName + '">'
        + '<option value="">Select an event\u2026</option>'
        + events.map(function (e) {
          return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(selected) ? ' selected' : '') + '>'
            + esc(e.title) + '</option>';
        }).join('')
        + '</select>' + ic('chevron-down', 15) + '</label>';
    }

    function groups() {
      return state.metric && typeof state.metric === 'object' ? state.metric : {};
    }

    function renderMetric() {
      const m = groups();
      if (!state.eventId) {
        return ui.emptyView({ title: 'Select an event', description: 'Choose one of your events to load its analytics.' });
      }
      if (!m.event && !m.registrations) {
        return ui.emptyView({ title: 'No analytics returned', description: 'The backend did not return metrics for this event yet.' });
      }

      const reg = m.registrations || {};
      const att = m.attendance || {};
      const cap = m.capacity || {};
      const fb = m.feedback || {};
      const sess = m.sessions || {};
      const exp = m.expenses || {};
      const sp = m.sponsors || {};
      const vol = m.volunteers || {};
      const comp = m.competition || {};
      const ret = m.retention || {};

      const stats = '<div class="stat-grid">'
        + ui.statCard({ label: 'Registrations', value: numOrDash(reg.total), detail: numOrDash(reg.confirmed) + ' confirmed', icon: 'ticket', accent: 'blue' })
        + ui.statCard({ label: 'Attendance rate', value: att.rate == null ? '\u2014' : att.rate + '%', detail: numOrDash(att.checkedIn) + ' checked in, ' + numOrDash(att.noShows) + ' no-shows', icon: 'clipboard-check', accent: 'teal' })
        + ui.statCard({ label: 'Capacity used', value: cap.utilizationPercent == null ? '\u2014' : cap.utilizationPercent + '%', detail: numOrDash(cap.seats) + ' seats', icon: 'users', accent: 'amber' })
        + ui.statCard({ label: 'Feedback', value: numOrDash(fb.responses), detail: fb.averageOverall == null ? 'No ratings yet' : 'Avg ' + fb.averageOverall + '/5', icon: 'message-square', accent: 'rose' })
        + '</div>';

      const overTime = asList(reg.overTime).map(function (p) {
        return { label: String(p.date != null ? p.date : ''), value: Number(p.count) || 0 };
      });

      const charts = '<div class="panel-grid">'
        + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Registrations', title: 'Registration over time' })
        + (overTime.length ? WM.charts.lineChart(overTime, 180) : '<p class="lede">No registrations recorded.</p>')
        + (reg.formula ? '<p class="lede mono">' + esc(reg.formula) + '</p>' : '') + '</section>'

        + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Attendance', title: 'Checked in vs no-shows' })
        + WM.charts.barChart([
          { label: 'Checked in', value: Number(att.checkedIn) || 0 },
          { label: 'No-shows', value: Number(att.noShows) || 0 },
        ], 180)
        + (att.formula ? '<p class="lede mono">' + esc(att.formula) + '</p>' : '') + '</section>'

        + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Sessions', title: 'Session fill' })
        + WM.charts.donutChart([
          { label: 'Attended', value: Number(sess.attendedSessions) || 0, color: CHART_COLORS[0] },
          { label: 'Not attended', value: Math.max(0, (Number(sess.total) || 0) - (Number(sess.attendedSessions) || 0)), color: CHART_COLORS[4] },
        ], 160)
        + '<p class="lede">' + numOrDash(sess.completed) + ' of ' + numOrDash(sess.total) + ' sessions completed.</p>'
        + (sess.formula ? '<p class="lede mono">' + esc(sess.formula) + '</p>' : '') + '</section>'

        + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Budget', title: 'Expenses by category' })
        + WM.charts.barChart((asList(exp.byCategory)).map(function (c) {
          return { label: String(c.name != null ? c.name : ''), value: Number(c.actualMinor) || 0 };
        }), 180)
        + '<p class="lede">Planned ' + numOrDash(exp.plannedMinor) + ' \u00b7 Actual ' + numOrDash(exp.actualMinor) + ' ' + esc(exp.currency || '') + '</p>'
        + (exp.formula ? '<p class="lede mono">' + esc(exp.formula) + '</p>' : '') + '</section>'
        + '</div>';

      const facts = [
        ['Sponsors', numOrDash(sp.count) + ' \u00b7 received ' + numOrDash(sp.receivedMinor) + ' ' + esc(exp.currency || '')],
        ['Volunteer task completion', vol.taskCompletionPercent == null ? '\u2014' : vol.taskCompletionPercent + '% (' + numOrDash(vol.tasksCompleted) + '/' + numOrDash(vol.tasksTotal) + ')'],
        ['Competition participation', comp.participationRatePercent == null ? '\u2014' : comp.participationRatePercent + '% (' + numOrDash(comp.scored) + '/' + numOrDash(comp.submissions) + ' scored)'],
        ['Retention vs previous edition', ret.percent == null ? '\u2014' : ret.percent + '%'],
      ];
      const factGrid = '<section class="panel"><div class="fact-grid">' + facts.map(function (f) {
        return '<div class="fact-item"><span>' + esc(f[0]) + '</span><strong>' + f[1] + '</strong></div>';
      }).join('') + '</div>'
        + (ret.note ? '<p class="lede">' + esc(ret.note) + '</p>' : '') + '</section>';

      const insightBlock = state.insight
        ? '<section class="panel"><div class="section-heading"><div><span class="eyebrow">AI</span><h2>Insights</h2></div>'
          + ui.badge('AI proposal \u2014 humans decide', 'amber') + '</div>'
          + renderInsightList(state.insight) + '</section>'
        : '';

      return stats + charts + factGrid + insightBlock;
    }

    function renderInsightList(data) {
      const insight = data && typeof data === 'object' ? data : {};
      const text = insight.insight || '';
      const sentences = String(text).split(/(?<=\.)\s+/).filter(function (s) { return s.trim(); });
      const list = sentences.length
        ? '<ul class="plain-list">' + sentences.map(function (s) { return '<li>' + esc(s.trim()) + '</li>'; }).join('') + '</ul>'
        : '<p class="lede">' + esc(text || 'No insight returned.') + '</p>';
      const source = insight.source ? '<p class="lede mono">source: ' + esc(insight.source) + '</p>' : '';
      return '<p class="lede">Rule-based summary of already-computed numbers. This is a proposal \u2014 a human decides what to act on.</p>'
        + list + source;
    }

    function renderCompare() {
      const c = state.compare;
      if (!c) {
        return ui.emptyView({ title: 'Pick two events', description: 'Choose two events you host and press Compare.' });
      }
      const deltas = asList(c.deltas);
      if (!deltas.length) {
        return ui.emptyView({ title: 'Nothing to compare', description: 'The backend returned no comparable metrics for those events.' });
      }
      const rows = deltas.map(function (d) {
        const comparable = d.comparable !== false;
        const deltaCell = comparable
          ? ((d.delta == null ? '\u2014' : (d.delta > 0 ? '+' : '') + d.delta)
            + ' ' + (d.deltaPercent == null ? '' : '(' + (d.deltaPercent > 0 ? '+' : '') + d.deltaPercent + '%)'))
          : ui.badge('not comparable', 'slate');
        const reason = !comparable && d.reason ? '<br><small>' + esc(d.reason) + '</small>' : '';
        return '<tr>'
          + '<td class="mono">' + esc(d.metric || '') + '</td>'
          + '<td class="num">' + numOrDash(d.valueA) + '</td>'
          + '<td class="num">' + numOrDash(d.valueB) + '</td>'
          + '<td class="num">' + deltaCell + reason + '</td>'
          + '</tr>';
      }).join('');

      return '<section class="panel table-panel"><div class="data-table-wrap"><table class="data-table"><thead><tr>'
        + '<th>Metric</th><th class="num">' + esc(eventName(state.compareA)) + '</th>'
        + '<th class="num">' + esc(eventName(state.compareB)) + '</th><th class="num">Delta (B \u2212 A)</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>'
        + '<p class="lede mono">delta = valueB - valueA; deltaPercent = delta / valueA * 100</p>';
    }

    function renderQuery() {
      const suggestions = QUERY_SUGGESTIONS.map(function (s) {
        return '<button class="button button-ghost" data-suggest="' + esc(s) + '">' + esc(s) + '</button>';
      }).join(' ');

      const form = '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Analytics', title: 'Ask a supported question' })
        + '<p class="lede">Only allow-listed intents are answered. Unsupported questions return the supported list.</p>'
        + WM.forms.textArea({ id: 'an-question', label: 'Question', value: state.question, rows: 3, placeholder: 'e.g. registrations over time' })
        + '<div class="chip-row" style="margin-bottom:12px">' + suggestions + '</div>'
        + '<div class="chip-row">'
        + '<button class="button button-primary" id="an-run"' + (state.busy === 'query' ? ' disabled' : '') + '>Run query</button>'
        + '</div>'
        + (state.queryError ? WM.forms.formStatus('error', state.queryError) : '')
        + '</section>';

      let result = '';
      const q = state.query;
      if (q && typeof q === 'object') {
        const metrics = q.metrics && typeof q.metrics === 'object' ? q.metrics : {};
        let chart = '';
        if (Array.isArray(metrics.byDate)) {
          chart = WM.charts.lineChart(metrics.byDate.map(function (p) {
            return { label: String(p.date != null ? p.date : ''), value: Number(p.count) || 0 };
          }), 180);
        } else if (Array.isArray(metrics.sessions)) {
          chart = WM.charts.barChart(metrics.sessions.map(function (s) {
            return { label: String(s.session != null ? s.session : ''), value: Number(s.count) || 0 };
          }), 180);
        } else if (Array.isArray(metrics.categories)) {
          chart = WM.charts.barChart(metrics.categories.map(function (c) {
            return { label: String(c.name != null ? c.name : ''), value: Number(c.actualMinor) || 0 };
          }), 180);
        }
        result = '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Answer', title: q.intent || 'Result' })
          + '<p>' + esc(q.answer || 'No answer returned.') + '</p>'
          + chart
          + '<details><summary>Raw metrics</summary><pre class="mono">' + esc(JSON.stringify(metrics, null, 2)) + '</pre></details>'
          + '</section>';
      }

      return form + result;
    }

    function render() {
      const events = D.events || [];
      const noEvents = events.length === 0;

      const tabs = '<div class="filter-tabs">'
        + ['event', 'compare', 'query'].map(function (v) {
          const label = v === 'event' ? 'Event analytics' : (v === 'compare' ? 'Compare events' : 'Query');
          return '<button data-view="' + v + '" class="' + (state.view === v ? 'active' : '') + '" style="padding:0 13px 12px;border:0;background:transparent;font-size:12px">'
            + label + '</button>';
        }).join('') + '</div>';

      let body = '';
      let action = '';
      if (state.view === 'event') {
        action = '<div class="chip-row">' + eventOptions(state.eventId, 'an-event')
          + '<button class="button button-secondary" id="an-insights"' + (state.busy === 'insight' ? ' disabled' : '') + '>'
          + ic('sparkles', 16) + ' AI insights</button></div>';
        body = noEvents
          ? ui.emptyView({ title: 'No events available', description: 'Create or host an event to see analytics.' })
          : renderMetric();
      } else if (state.view === 'compare') {
        body = noEvents
          ? ui.emptyView({ title: 'No events available', description: 'Create or host events to compare.' })
          : '<section class="panel"><div class="search-toolbar" style="flex-wrap:wrap">'
            + eventOptions(state.compareA, 'an-compare-a')
            + eventOptions(state.compareB, 'an-compare-b')
            + '<button class="button button-primary" id="an-compare"' + (state.busy === 'compare' ? ' disabled' : '') + '>Compare</button>'
            + '</div></section>' + renderCompare();
      } else {
        body = renderQuery();
      }

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Hosting operations', title: 'Analytics', action: action })
        + '<p class="lede">Historical metrics computed from database rows. Every figure carries the formula it came from.</p>'
        + tabs + body + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function loadEvent() {
      if (!state.eventId) { state.metric = null; return Promise.resolve(); }
      return Api.analytics.event(state.eventId).then(function (data) {
        state.metric = data && typeof data === 'object' ? data : null;
        return null;
      }, function (err) {
        state.metric = null;
        WM.toast((err && err.message) || 'Could not load analytics.', 'error');
        return null;
      });
    }

    function doCompare() {
      if (!state.compareA || !state.compareB) { WM.toast('Choose two events to compare.', 'warning'); return; }
      state.busy = 'compare'; state.compare = null; refresh();
      Api.analytics.compare({ eventIdA: state.compareA, eventIdB: state.compareB }).then(function (data) {
        state.busy = ''; state.compare = data && typeof data === 'object' ? data : null; refresh();
      }, function (err) {
        state.busy = ''; refresh();
        WM.toast((err && err.message) || 'Could not compare events.', 'error');
      });
    }

    function doQuery() {
      const question = state.question;
      if (!question.trim()) { WM.toast('Type a question first.', 'warning'); return; }
      state.busy = 'query'; state.queryError = ''; refresh();
      const payload = { question: question };
      if (state.eventId) payload.eventId = state.eventId;
      Api.analytics.query(payload).then(function (data) {
        state.busy = ''; state.query = data && typeof data === 'object' ? data : null; refresh();
      }, function (err) {
        state.busy = ''; state.query = null;
        const supported = err && err.data && Array.isArray(err.data.supported) ? err.data.supported : null;
        state.queryError = (err && err.message) || 'Query failed.'
          + (supported ? ' Supported: ' + supported.join(', ') : '');
        refresh();
      });
    }

    function doInsights() {
      if (!state.eventId) { WM.toast('Select an event first.', 'warning'); return; }
      state.busy = 'insight'; state.insight = null; refresh();
      Api.analytics.insights({ eventId: state.eventId }).then(function (data) {
        state.busy = ''; state.insight = data && typeof data === 'object' ? data : null; refresh();
      }, function (err) {
        state.busy = ''; refresh();
        WM.toast((err && err.message) || 'Could not generate insights.', 'error');
      });
    }

    function wire() {
      qa('[data-view]').forEach(function (b) {
        b.addEventListener('click', function () { state.view = b.getAttribute('data-view'); refresh(); });
      });
      const sel = document.getElementById('an-event');
      if (sel) sel.addEventListener('change', function () {
        state.eventId = sel.value; state.insight = null;
        loadEvent().then(refresh);
      });
      const ca = document.getElementById('an-compare-a');
      if (ca) ca.addEventListener('change', function () { state.compareA = ca.value; });
      const cb = document.getElementById('an-compare-b');
      if (cb) cb.addEventListener('change', function () { state.compareB = cb.value; });
      const cmp = document.getElementById('an-compare');
      if (cmp) cmp.addEventListener('click', doCompare);
      const run = document.getElementById('an-run');
      if (run) run.addEventListener('click', doQuery);
      qa('[data-suggest]').forEach(function (b) {
        b.addEventListener('click', function () { state.question = b.getAttribute('data-suggest'); refresh(); });
      });
      const ta = document.getElementById('an-question');
      if (ta) ta.addEventListener('input', function () { state.question = ta.value; });
      const ins = document.getElementById('an-insights');
      if (ins) ins.addEventListener('click', doInsights);
    }

    function load() {
      return D.ready().then(function () {
        const events = D.events || [];
        if (events.length) {
          state.eventId = events[0].id;
          if (events[1]) { state.compareA = events[0].id; state.compareB = events[1].id; }
        }
        return loadEvent();
      }, function () { return null; });
    }

    WM.page({ route: '/analytics', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.analytics = analyticsPage;
})(window);
