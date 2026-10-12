(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  function judgePage() {
    const tokenParam = (function () {
      const m = /[?&]token=([^&]+)/.exec(global.location ? (global.location.search || '') : '');
      return m ? decodeURIComponent(m[1]) : '';
    })();

    const state = {
      selectedId: '',
      scores: {},
      comment: '',
      scored: 0,
      submitted: false,
      token: tokenParam,
    };

    function events() { return D.events || []; }

    function currentRubric() {
      const rubrics = D.rubrics || [];
      if (!rubrics.length) return null;
      if (state.selectedId) {
        const found = rubrics.find(function (r) {
          return String(r && r.eventId) === String(state.selectedId);
        });
        if (found) return found;
      }
      return rubrics[0];
    }

    function criteriaList() {
      const rubric = currentRubric();
      if (!rubric || !rubric.criteria || !rubric.criteria.length) return [];
      return rubric.criteria;
    }

    function critId(criterion, index) {
      return criterion && criterion.id != null ? String(criterion.id) : 'c' + index;
    }

    function findCriterion(id) {
      const crits = criteriaList();
      for (let i = 0; i < crits.length; i += 1) {
        if (critId(crits[i], i) === String(id)) return crits[i];
      }
      return null;
    }

    function fmt(n) {
      const r = Math.round(Number(n || 0) * 100) / 100;
      return String(r);
    }

    function sumScores(crits) {
      let score = 0, max = 0;
      crits.forEach(function (c, i) {
        const id = critId(c, i);
        score += Number(state.scores[id]) || 0;
        max += Number(c && c.maxScore) || 10;
      });
      return { score: fmt(score), max: fmt(max) };
    }

    function everyScored(crits) {
      if (!crits.length) return false;
      for (let i = 0; i < crits.length; i += 1) {
        if (!(Number(state.scores[critId(crits[i], i)]) > 0)) return false;
      }
      return true;
    }

    function criterionCard(criterion, index) {
      const id = critId(criterion, index);
      const max = Number(criterion && criterion.maxScore) || 10;
      const val = Number(state.scores[id]) || 0;
      const weight = criterion && criterion.weight != null ? criterion.weight + '%' : '\u2014';
      const anchors = [0.25, 0.5, 0.75, 1].map(function (pct) {
        const a = fmt(max * pct);
        return '<button class="anchor-btn" data-anchor="' + esc(id) + '" data-value="' + esc(a) + '">' + esc(a) + '</button>';
      }).join('');
      return '<div class="judge-criterion">'
        + '<div class="judge-criterion-head">'
        + '<div><strong>' + esc(criterion && criterion.name) + '</strong></div>'
        + '<div style="display:flex;align-items:center;gap:6px">' + ui.badge(weight, 'blue')
        + '<span class="stepper-max">Max ' + max + '</span></div></div>'
        + (criterion && criterion.description ? '<p class="lede" style="margin:0 0 10px">' + esc(criterion.description) + '</p>' : '')
        + '<div class="criterion-stepper">'
        + '<button class="stepper-btn" data-step="minus" data-crit="' + esc(id) + '" aria-label="Decrease score">\u2212</button>'
        + '<span class="stepper-value">' + esc(fmt(val)) + '</span>'
        + '<span class="stepper-max">/ ' + max + '</span>'
        + '<button class="stepper-btn" data-step="plus" data-crit="' + esc(id) + '" aria-label="Increase score">+</button>'
        + '</div>'
        + '<div class="anchor-list">' + anchors + '</div>'
        + '</div>';
    }

    function submitBar(crits) {
      const t = sumScores(crits);
      const ready = everyScored(crits);
      return '<div class="panel" style="position:sticky;bottom:16px;z-index:6;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px">'
        + '<div><span class="eyebrow" style="margin:0">Total score</span><br>'
        + '<strong style="font-size:18px">' + esc(t.score) + ' / ' + esc(t.max) + '</strong></div>'
        + '<button class="button button-primary" data-submit' + (ready ? '' : ' disabled') + '>'
        + ic('send', 16) + ' Submit score</button>'
        + '</div>';
    }

    function render() {
      if (!state.selectedId && events().length) state.selectedId = String(events()[0].id);

      const list = events();
      const assignments = D.juryAssignments || [];
      const total = assignments.length || 1;
      const crits = criteriaList();
      const options = list.map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.selectedId) ? ' selected' : '') + '>'
          + esc(e.title) + '</option>';
      }).join('');
      const guestChip = state.token
        ? '<span class="status-badge status-blue">' + ic('key-round', 12) + ' Guest session</span>'
        : '';

      const header = ui.sectionHeading({ eyebrow: 'Guest jury', title: 'Judge scoring app', action: guestChip })
        + '<div class="search-toolbar compact-toolbar">'
        + '<label class="select-field">' + ic('calendar-days', 17) + '<select id="judge-event">' + options + '</select>' + ic('chevron-down', 16) + '</label>'
        + '<span class="lede" style="margin:0">' + esc(state.scored + ' of ' + total + ' submissions scored') + '</span>'
        + '</div>';

      let body;
      if (state.submitted) {
        const t = sumScores(crits);
        body = '<section class="panel" style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px">'
          + '<div style="color:var(--wm-success)">' + ic('check-circle-2', 28) + '</div>'
          + '<h3 style="margin:0">Score submitted</h3>'
          + '<p class="lede" style="margin:0">Total: ' + esc(t.score) + ' / ' + esc(t.max) + '</p>'
          + '<button class="button button-secondary" data-next>' + ic('arrow-right', 16) + ' Score next submission</button>'
          + '</section>';
      } else if (!crits.length) {
        body = ui.emptyView({
          title: 'No rubric configured yet',
          description: 'A scoring rubric is required before submissions can be judged.',
          action: '<a class="button button-primary" href="forms-rubric.html">Build a rubric</a>',
        });
      } else {
        body = '<div class="judge-criteria">' + crits.map(criterionCard).join('') + '</div>'
          + '<div class="form-field-group" style="margin-top:16px">'
          + '<div class="form-field-label-row"><label for="judge-comment">Overall comment</label></div>'
          + '<textarea class="form-textarea" id="judge-comment" rows="4" placeholder="Summarise your assessment...">' + esc(state.comment) + '</textarea>'
          + '</div>'
          + submitBar(crits);
      }

      return '<div class="page-stack">'
        + header + body
        + '<p class="lede">Scores reference the active rubric round. Submissions open only during evaluation windows.</p>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function submitScore() {
      const crits = criteriaList();
      if (!everyScored(crits)) {
        WM.toast('Score every criterion before submitting.', 'warning');
        return;
      }
      global.WMApi.scores.create({ eventId: state.selectedId, criteria: state.scores, comment: state.comment })
        .then(function () {
          state.submitted = true;
          state.scored += 1;
          WM.toast('Score submitted.');
          refresh();
        }, function (err) {
          WM.toast((err && err.message) || 'Something went wrong.', 'error');
        });
    }

    function wire() {
      const ev = document.getElementById('judge-event');
      if (ev) ev.addEventListener('change', function () {
        state.selectedId = ev.value;
        state.scores = {};
        state.comment = '';
        state.submitted = false;
        refresh();
      });

      document.querySelectorAll('[data-step]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-crit');
          const criterion = findCriterion(id);
          if (!criterion) return;
          const max = Number(criterion.maxScore) || 10;
          let val = Number(state.scores[id]) || 0;
          val += b.getAttribute('data-step') === 'plus' ? 1 : -1;
          if (val < 0) val = 0;
          if (val > max) val = max;
          state.scores[id] = val;
          refresh();
        });
      });

      document.querySelectorAll('[data-anchor]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.scores[b.getAttribute('data-anchor')] = Number(b.getAttribute('data-value')) || 0;
          refresh();
        });
      });

      const submit = document.querySelector('[data-submit]');
      if (submit) submit.addEventListener('click', submitScore);

      const next = document.querySelector('[data-next]');
      if (next) next.addEventListener('click', function () {
        state.scores = {};
        state.comment = '';
        state.submitted = false;
        refresh();
      });

      const comment = document.getElementById('judge-comment');
      if (comment) comment.addEventListener('input', function () { state.comment = comment.value; });
    }

    function mounted() {
      if (state.token) {
        global.WMApi.guest.activate(state.token).then(function () {
          WM.toast('Judge session activated.');
        }, function (err) {
          WM.toast('Guest link could not be activated: ' + ((err && err.message) || ''), 'error');
        });
      }
      wire();
    }

    WM.page({ route: '/judge', render: render, mounted: mounted, load: function () { return D.ready(); } });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.judge = judgePage;
})(window);
