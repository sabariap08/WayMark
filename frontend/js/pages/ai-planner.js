/* AI Event Co-Pilot (planner) page.
 *
 * Everything here is a DRAFT. The backend forbids publishing a plan without an
 * explicit human "Approve & create event" action, and this UI never implies
 * otherwise.
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

  function isTrue(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  // document.querySelectorAll can return null in the smoke harness; never assume.
  function qa(selector) {
    const node = document.querySelectorAll(selector);
    return node && typeof node.forEach === 'function' ? node : [];
  }

  function money(minor, currency) {
    if (minor == null || minor === '') return '\u2014';
    const n = Number(minor);
    if (isNaN(n)) return String(minor);
    const major = (n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (currency ? major + ' ' + currency : major);
  }

  function statusTone(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'applied') return 'green';
    if (s === 'rejected') return 'red';
    if (s === 'draft') return 'blue';
    return 'slate';
  }

  function aiPlannerPage() {
    const state = {
      status: null,
      brief: '',
      planId: '',
      plan: null,
      validation: null,
      preview: null,
      drafts: {},
      plans: [],
      rejectReason: '',
      busy: '',
      error: '',
    };

    /* ---------------------------- plan summary ---------------------------- */

    function planFromRow(row) {
      if (!row || typeof row !== 'object') return null;
      return row.plan && typeof row.plan === 'object' ? row.plan : null;
    }

    function renderProviderStrip() {
      const s = state.status && typeof state.status === 'object' ? state.status : {};
      const configured = isTrue(s.configured);
      const label = configured ? 'Remote provider' : 'Local deterministic engine';
      const model = s.model ? ' \u00b7 ' + esc(s.model) : '';
      const provider = s.provider ? ' \u00b7 ' + esc(s.provider) : '';
      const note = s.note ? ' ' + esc(s.note) : '';
      return '<div class="queue-callout">'
        + '<span class="callout-icon">' + ic('sparkles', 16) + '</span>'
        + '<div><strong>' + label + '</strong>'
        + '<span>' + provider + model + note + ' Plans always require human approval before anything is published.</span></div>'
        + ui.badge(configured ? 'configured' : 'local', configured ? 'blue' : 'slate')
        + '</div>';
    }

    function renderValidation(validation) {
      const v = validation && typeof validation === 'object' ? validation : {};
      const errors = asList(v.errors);
      const warnings = asList(v.warnings);
      const validBadge = isTrue(v.valid) ? ui.badge('Valid', 'green') : ui.badge('Invalid', 'red');
      const errList = errors.length
        ? '<div class="form-error"><strong>' + errors.length + ' error(s)</strong><ul class="plain-list">'
          + errors.map(function (e) { return '<li><span class="mono">' + esc(e.path || '') + '</span> ' + esc(e.message || '') + '</li>'; }).join('')
          + '</ul></div>'
        : '';
      const warnList = warnings.length
        ? '<div class="form-info" style="margin-top:8px"><strong>' + warnings.length + ' warning(s)</strong><ul class="plain-list">'
          + warnings.map(function (w) { return '<li><span class="mono">' + esc(w.path || '') + '</span> ' + esc(w.message || '') + '</li>'; }).join('')
          + '</ul></div>'
        : '';
      return '<div class="chip-row" style="align-items:center;margin-bottom:10px">' + validBadge
        + '<span class="lede">Validation is advisory \u2014 errors block approval, warnings do not.</span></div>'
        + errList + warnList;
    }

    function renderSchedule(plan) {
      const schedule = asList(plan.schedule);
      const activities = asList(plan.activities);
      if (!schedule.length && !activities.length) return '<p class="lede">No schedule returned.</p>';

      const byDay = {};
      schedule.forEach(function (s) {
        const day = s && s.day != null ? s.day : 0;
        (byDay[day] = byDay[day] || []).push({
          start: s.startTime, end: s.endTime, title: s.title, type: s.type, kind: 'session',
        });
      });
      activities.forEach(function (a) {
        const day = a && a.day != null ? a.day : 1;
        (byDay[day] = byDay[day] || []).push({
          start: a.startTime, end: a.endTime, title: a.title, type: a.type, kind: 'activity',
          expected: a.expectedParticipants,
        });
      });

      const days = Object.keys(byDay).sort(function (a, b) { return Number(a) - Number(b); });
      const blocks = days.map(function (day) {
        const items = byDay[day].map(function (it) {
          return '<tr><td class="mono">' + esc((it.start || '') + (it.end ? '\u2013' + it.end : '')) + '</td>'
            + '<td>' + esc(it.title || '\u2014') + '</td>'
            + '<td>' + (it.type ? ui.badge(it.type, it.kind === 'activity' ? 'teal' : 'blue') : '\u2014') + '</td>'
            + '<td class="num">' + (it.expected == null ? '\u2014' : esc(it.expected)) + '</td></tr>';
        }).join('');
        return '<h4 style="margin:16px 0 6px">Day ' + esc(day) + '</h4>'
          + '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Item</th><th>Type</th><th class="num">Expected</th></tr></thead>'
          + '<tbody>' + items + '</tbody></table></div>';
      }).join('');
      return blocks;
    }

    function renderTasks(plan) {
      const tasks = asList(plan.tasks);
      if (!tasks.length) return '<p class="lede">No tasks returned.</p>';
      return '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Task</th><th class="num">Due day</th><th>Priority</th></tr></thead><tbody>'
        + tasks.map(function (t) {
          return '<tr><td>' + esc(t.title || 'Task') + '</td>'
            + '<td class="num">' + (t.dueDay == null ? '\u2014' : esc(t.dueDay)) + '</td>'
            + '<td>' + esc(t.priority || 'Normal') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    function renderBudget(plan) {
      const expenses = asList(plan.expenses);
      const currency = plan.currency || 'INR';
      const total = expenses.reduce(function (sum, e) { return sum + (Number(e.amountMinor) || 0); }, 0);
      const rows = expenses.map(function (e) {
        const pct = total ? Math.round((Number(e.amountMinor || 0) / total) * 100) : 0;
        return '<tr><td>' + esc(e.category || 'Category') + '</td>'
          + '<td class="num">' + esc(money(e.amountMinor, currency)) + '</td>'
          + '<td class="num">' + pct + '%</td></tr>';
      }).join('');
      return '<div class="chip-row" style="margin-bottom:10px">'
        + ui.badge('Budget: ' + money(plan.budgetMinor, currency), 'blue')
        + ui.badge('Planned expenses: ' + money(total, currency), total > (Number(plan.budgetMinor) || 0) ? 'amber' : 'green')
        + '</div>'
        + '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
    }

    function renderPlan() {
      const p = state.plan;
      if (!p || typeof p !== 'object') {
        return ui.emptyView({ title: 'No plan yet', description: 'Describe your event in the brief above and press Generate plan.' });
      }
      const currency = p.currency || 'INR';
      const header = '<div class="fact-grid">'
        + '<div class="fact-item"><span>Title</span><strong>' + esc(p.title || '\u2014') + '</strong></div>'
        + '<div class="fact-item"><span>Dates</span><strong>' + esc((p.startDate || '') + (p.endDate ? ' \u2192 ' + p.endDate : '')) + '</strong></div>'
        + '<div class="fact-item"><span>Days</span><strong>' + esc(p.days == null ? '\u2014' : p.days) + '</strong></div>'
        + '<div class="fact-item"><span>Participants</span><strong>' + esc(p.participants == null ? '\u2014' : p.participants) + '</strong></div>'
        + '<div class="fact-item"><span>Budget</span><strong>' + esc(money(p.budgetMinor, currency)) + '</strong></div>'
        + '<div class="fact-item"><span>Category</span><strong>' + esc(p.category || '\u2014') + '</strong></div>'
        + '</div>';

      const actions = '<div class="chip-row" style="margin-top:14px">'
        + '<button class="button button-secondary" id="ap-save"' + (state.busy === 'save' ? ' disabled' : '') + '>Save draft</button>'
        + '<button class="button button-secondary" id="ap-preview"' + (state.busy === 'preview' ? ' disabled' : '') + '>Preview as event</button>'
        + '<button class="button button-primary" id="ap-approve"' + (state.busy === 'approve' ? ' disabled' : '') + '>Approve & create event</button>'
        + '<button class="button button-ghost" id="ap-reject"' + (state.busy === 'reject' ? ' disabled' : '') + '>Reject</button>'
        + '</div>';

      const preview = state.preview ? renderPreview() : '';

      return renderValidation(state.validation)
        + header
        + preview
        + '<h3 style="margin-top:20px">Schedule & activities</h3>' + renderSchedule(p)
        + '<h3 style="margin-top:20px">Tasks</h3>' + renderTasks(p)
        + '<h3 style="margin-top:20px">Budget breakdown</h3>' + renderBudget(p)
        + actions
        + '<p class="lede" style="margin-top:10px">Nothing is published until you approve. The backend creates a <strong>Draft</strong> event, never a live one.</p>';
    }

    function renderPreview() {
      const pv = state.preview && typeof state.preview === 'object' ? state.preview : {};
      const event = pv.event && typeof pv.event === 'object' ? pv.event : {};
      const sessions = asList(pv.sessions);
      const tasks = asList(pv.tasks);
      const budget = asList(pv.budgetCategories);
      const volunteers = asList(pv.volunteers);

      const fields = [
        ['Title', event.title], ['Date', event.date], ['Status', event.status],
        ['Location', event.location], ['Seats', event.seats], ['Category', event.category],
        ['Host', event.hostName],
      ];
      return '<section class="panel" style="margin-top:16px"><div class="section-heading"><div><span class="eyebrow">Preview</span>'
        + '<h3>Draft event fields</h3></div>' + ui.badge('Draft \u2014 not published', 'amber') + '</div>'
        + '<div class="fact-grid">' + fields.map(function (f) {
          return '<div class="fact-item"><span>' + esc(f[0]) + '</span><strong>' + esc(f[1] == null ? '\u2014' : f[1]) + '</strong></div>';
        }).join('') + '</div>'
        + '<p class="lede">Would create ' + sessions.length + ' session(s), ' + tasks.length + ' task(s), '
        + budget.length + ' budget categor(ies) and ' + volunteers.length + ' volunteer role(s).</p>'
        + '</section>';
    }

    function renderDraftBlock(key, title) {
      const d = state.drafts[key];
      if (d === undefined) return '';
      const list = asList(d);
      let inner;
      if (!list.length) {
        inner = '<p class="lede">No draft returned.</p>';
      } else if (key === 'draftSchedule') {
        inner = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Day</th><th>Time</th><th>Title</th><th>Type</th></tr></thead><tbody>'
          + list.map(function (s) {
            return '<tr><td class="num">' + esc(s.day == null ? '\u2014' : s.day) + '</td>'
              + '<td class="mono">' + esc((s.startTime || '') + (s.endTime ? '\u2013' + s.endTime : '')) + '</td>'
              + '<td>' + esc(s.title || '\u2014') + '</td><td>' + esc(s.type || '\u2014') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      } else if (key === 'draftTasks') {
        inner = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Task</th><th class="num">Due day</th></tr></thead><tbody>'
          + list.map(function (t) {
            return '<tr><td>' + esc(t.title || '\u2014') + '</td><td class="num">' + esc(t.dueDay == null ? '\u2014' : t.dueDay) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      } else {
        inner = '<div class="activity-list">' + list.map(function (c) {
          return '<div class="activity-item"><span class="activity-icon activity-blue">' + ic('send', 15) + '</span>'
            + '<div><strong>' + esc(c.type || 'Message') + ' \u2014 ' + esc(c.audience || '') + '</strong>'
            + '<span>' + esc(c.subject || '') + '</span><small>' + esc(c.body || '') + '</small></div></div>';
        }).join('') + '</div>';
      }
      return '<section class="panel" style="margin-top:12px"><div class="section-heading"><div><span class="eyebrow">Draft</span>'
        + '<h4>' + esc(title) + '</h4></div></div>' + inner + '</section>';
    }

    function renderDraftHelpers() {
      if (!state.plan) return '';
      return '<section class="panel" style="margin-top:16px">'
        + ui.sectionHeading({ eyebrow: 'Draft helpers', title: 'Regenerate parts of the plan' })
        + '<p class="lede">These drafts are generated from the current plan\u2019s brief. Nothing is saved until you Save draft.</p>'
        + '<div class="chip-row">'
        + '<button class="button button-secondary" data-draft="draftSchedule"' + (state.busy === 'draftSchedule' ? ' disabled' : '') + '>Draft schedule</button>'
        + '<button class="button button-secondary" data-draft="draftTasks"' + (state.busy === 'draftTasks' ? ' disabled' : '') + '>Draft tasks</button>'
        + '<button class="button button-secondary" data-draft="draftCommunication"' + (state.busy === 'draftCommunication' ? ' disabled' : '') + '>Draft communication</button>'
        + '</div>'
        + renderDraftBlock('draftSchedule', 'Schedule draft')
        + renderDraftBlock('draftTasks', 'Task draft')
        + renderDraftBlock('draftCommunication', 'Communication draft')
        + '</section>';
    }

    function renderPlansList() {
      const rows = state.plans || [];
      if (!rows.length) {
        return ui.emptyView({ title: 'No saved plans', description: 'Generated plans you save will appear here.' });
      }
      const list = rows.map(function (p, index) {
        const busy = state.busy === ('plan:' + p.id);
        const status = p.status || 'Draft';
        const actions = '<div class="chip-row">'
          + '<button class="button button-secondary" data-open="' + index + '"' + (busy ? ' disabled' : '') + '>Open</button>'
          + (String(status).toLowerCase() === 'draft'
            ? '<button class="button button-primary" data-apply="' + index + '"' + (busy ? ' disabled' : '') + '>Approve & apply</button>' : '')
          + '<button class="button button-ghost" data-delete="' + index + '"' + (busy ? ' disabled' : '') + '>Delete</button>'
          + '</div>';
        const applied = p.appliedRef
          ? '<small>Applied to event <a href="my-hosted-events.html">' + esc(p.appliedRef) + '</a></small>' : '';
        return '<div class="activity-item"><span class="activity-icon activity-blue">' + ic('file-text', 15) + '</span>'
          + '<div><strong>' + esc(p.title || 'Untitled plan') + '</strong>'
          + '<span>' + ui.statusChip(status) + ' \u00b7 ' + esc(p.provider || 'local') + (p.time ? ' \u00b7 ' + esc(p.time) : '') + '</span>'
          + applied + '</div>' + actions + '</div>';
      }).join('');
      return '<div class="activity-list">' + list + '</div>';
    }

    function render() {
      const brief = WM.forms.textArea({
        id: 'ap-brief', label: 'Event brief', value: state.brief, rows: 5,
        placeholder: 'e.g. A two-day hackathon in Coimbatore for 800 participants with a budget of Rs. 2,00,000',
        hint: 'Plain language. The local engine extracts title, days, participants, city and budget.',
      });

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Host an event', title: 'AI planner' })
        + '<p class="lede">Draft a full event plan from a short brief. AI produces a proposal; you review, adjust and approve it before anything is created.</p>'
        + renderProviderStrip()
        + '<section class="panel">' + o(brief) + '</section>'
        + (state.error ? WM.forms.formStatus('error', state.error) : '')
        + '<section class="panel" style="margin-top:16px">'
        + '<div class="section-heading"><div><span class="eyebrow">Plan</span><h2>Generated plan</h2></div>'
        + ui.badge('Draft \u2014 human approval required', 'amber') + '</div>'
        + renderPlan()
        + '</section>'
        + renderDraftHelpers()
        + '<section class="panel" style="margin-top:16px">'
        + ui.sectionHeading({ eyebrow: 'Plans', title: 'Saved plans' })
        + renderPlansList()
        + '</section>'
        + '</div>';
    }

    function o(briefHTML) {
      return briefHTML
        + '<div class="chip-row" style="margin-top:12px">'
        + '<button class="button button-primary" id="ap-generate"' + (state.busy === 'generate' ? ' disabled' : '') + '>'
        + ic('sparkles', 16) + ' Generate plan</button>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    /* ------------------------------- actions ------------------------------ */

    function loadStatus() {
      return Api.plans.status().then(function (data) {
        state.status = data && typeof data === 'object' ? data : {};
        return null;
      }, function () { state.status = {}; return null; });
    }

    function loadPlans() {
      return Api.plans.list().then(function (data) {
        state.plans = asList(data, ['plans']);
        return null;
      }, function () { state.plans = []; return null; });
    }

    function applyGenerated(data) {
      const d = data && typeof data === 'object' ? data : {};
      state.planId = d.planId || '';
      state.plan = d.plan && typeof d.plan === 'object' ? d.plan : null;
      state.validation = d.validation && typeof d.validation === 'object' ? d.validation : null;
      state.preview = null;
      state.drafts = {};
    }

    function doGenerate() {
      const brief = (state.brief || '').trim();
      if (!brief) { WM.toast('Write a brief first.', 'warning'); return; }
      state.busy = 'generate'; state.error = ''; refresh();
      Api.plans.generate({ brief: brief }).then(function (data) {
        state.busy = '';
        applyGenerated(data);
        WM.toast('Plan generated \u2014 review before approving.');
        return loadPlans();
      }, function (err) {
        state.busy = ''; state.error = (err && err.message) || 'Could not generate a plan.'; refresh();
      }).then(function () { refresh(); });
    }

    function doSave() {
      if (!state.planId) { WM.toast('Generate a plan first.', 'warning'); return; }
      state.busy = 'save'; refresh();
      Api.plans.update(state.planId, { plan: state.plan }).then(function (data) {
        state.busy = '';
        const row = data && typeof data === 'object' ? data : null;
        if (row && row.validation) state.validation = row.validation;
        WM.toast('Draft saved.');
        return loadPlans();
      }, function (err) {
        state.busy = ''; refresh();
        WM.toast((err && err.message) || 'Could not save the draft.', 'error');
      }).then(function () { refresh(); });
    }

    function doPreview() {
      if (!state.planId) { WM.toast('Generate a plan first.', 'warning'); return; }
      state.busy = 'preview'; refresh();
      Api.plans.preview(state.planId, {}).then(function (data) {
        state.busy = ''; state.preview = data && typeof data === 'object' ? data : null; refresh();
      }, function (err) {
        state.busy = ''; refresh();
        WM.toast((err && err.message) || 'Could not preview the plan.', 'error');
      });
    }

    function doApprove() {
      if (!state.planId) { WM.toast('Generate a plan first.', 'warning'); return; }
      state.busy = 'approve'; state.error = ''; refresh();
      Api.plans.approve(state.planId, {}).then(function (data) {
        state.busy = '';
        const counts = data && data.counts ? data.counts : {};
        WM.toast('Plan approved \u2014 draft event created ('
          + (counts.sessions || 0) + ' sessions, ' + (counts.tasks || 0) + ' tasks).', 'success');
        return loadPlans();
      }, function (err) {
        state.busy = '';
        const errs = err && err.data && Array.isArray(err.data.errors) ? err.data.errors : null;
        if (errs) {
          state.error = 'Validation failed: ' + errs.map(function (e) { return (e.path || '') + ' ' + (e.message || ''); }).join('; ');
        } else {
          state.error = (err && err.message) || 'Could not approve the plan.';
        }
        refresh();
      }).then(function () { refresh(); });
    }

    function doReject() {
      if (!state.planId) { WM.toast('Generate a plan first.', 'warning'); return; }
      state.busy = 'reject'; refresh();
      Api.plans.reject(state.planId, { reason: state.rejectReason || '' }).then(function () {
        state.busy = '';
        state.plan = null; state.validation = null; state.preview = null; state.planId = '';
        WM.toast('Plan rejected.');
        return loadPlans();
      }, function (err) {
        state.busy = ''; refresh();
        WM.toast((err && err.message) || 'Could not reject the plan.', 'error');
      }).then(function () { refresh(); });
    }

    function doDraft(kind) {
      const brief = state.plan && state.plan.description ? state.plan.description : state.brief;
      if (!brief) { WM.toast('Generate a plan first.', 'warning'); return; }
      state.busy = kind; refresh();
      Api.plans[kind]({ brief: brief }).then(function (data) {
        state.busy = '';
        state.drafts[kind] = Array.isArray(data) ? data : [];
        refresh();
      }, function (err) {
        state.busy = ''; refresh();
        WM.toast((err && err.message) || 'Could not draft.', 'error');
      });
    }

    /* -------------------------------- wiring ------------------------------ */

    function wire() {
      const ta = document.getElementById('ap-brief');
      if (ta) ta.addEventListener('input', function () { state.brief = ta.value; });
      const gen = document.getElementById('ap-generate');
      if (gen) gen.addEventListener('click', doGenerate);
      const save = document.getElementById('ap-save');
      if (save) save.addEventListener('click', doSave);
      const prev = document.getElementById('ap-preview');
      if (prev) prev.addEventListener('click', doPreview);
      const appr = document.getElementById('ap-approve');
      if (appr) appr.addEventListener('click', doApprove);
      const rej = document.getElementById('ap-reject');
      if (rej) rej.addEventListener('click', doReject);
      qa('[data-draft]').forEach(function (b) {
        b.addEventListener('click', function () { doDraft(b.getAttribute('data-draft')); });
      });

      qa('[data-open]').forEach(function (b) {
        b.addEventListener('click', function () {
          const row = state.plans[Number(b.getAttribute('data-open'))];
          if (!row) return;
          state.planId = row.id;
          state.plan = planFromRow(row);
          state.validation = row.validation && typeof row.validation === 'object' ? row.validation : null;
          state.brief = row.brief || state.brief;
          state.preview = null; state.drafts = {}; state.error = '';
          refresh();
        });
      });
      qa('[data-apply]').forEach(function (b) {
        b.addEventListener('click', function () {
          const row = state.plans[Number(b.getAttribute('data-apply'))];
          if (!row) return;
          state.planId = row.id;
          state.plan = planFromRow(row);
          state.validation = row.validation && typeof row.validation === 'object' ? row.validation : null;
          doApprove();
        });
      });
      qa('[data-delete]').forEach(function (b) {
        b.addEventListener('click', function () {
          const row = state.plans[Number(b.getAttribute('data-delete'))];
          if (!row) return;
          if (!global.confirm('Delete this plan?')) return;
          state.busy = 'plan:' + row.id; refresh();
          Api.plans.remove(row.id).then(function () {
            state.busy = ''; WM.toast('Plan deleted.'); return loadPlans();
          }, function (err) {
            state.busy = ''; refresh();
            WM.toast((err && err.message) || 'Could not delete the plan.', 'error');
          }).then(function () { refresh(); });
        });
      });
    }

    function load() {
      return Promise.all([loadStatus(), loadPlans()]).then(function () { return null; }, function () { return null; });
    }

    WM.page({ route: '/ai-planner', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.aiPlanner = aiPlannerPage;
})(window);
