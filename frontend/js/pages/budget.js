/* Budget & sponsors — event budget summary, categories, lines, scenarios,
 * sponsorship pipeline, deliverables checklists and the sponsor report. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  const LINE_KINDS = ['Expense', 'Sponsorship', 'Revenue', 'Adjustment'];
  const SPONSOR_STATUSES = ['Prospect', 'Pledged', 'Confirmed', 'Paid', 'Declined'];

  function arr(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const keys = ['items', 'data', 'results'];
      for (let i = 0; i < keys.length; i++) {
        if (Array.isArray(value[keys[i]])) return value[keys[i]];
      }
    }
    return [];
  }

  function num(value) {
    const n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function money(minor, currency) {
    return (num(minor) / 100).toFixed(2) + ' ' + (currency || 'INR');
  }

  function majorString(minor) {
    return (num(minor) / 100).toFixed(2);
  }

  function parseMajor(text) {
    const raw = String(text == null ? '' : text).trim().replace(/,/g, '');
    if (!raw) return { minor: null, error: 'Enter an amount.' };
    if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
      return { minor: null, error: 'Enter a valid amount with up to 2 decimals (e.g. 1250.00).' };
    }
    const value = parseFloat(raw);
    if (!isFinite(value)) return { minor: null, error: 'Enter a valid amount (e.g. 1250.00).' };
    return { minor: Math.round(value * 100), error: '' };
  }

  function call(fn) {
    try {
      const out = fn();
      if (out && typeof out.then === 'function') return out;
      return Promise.resolve(out === undefined ? null : out);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function errText(err, fallback) {
    if (!err) return fallback || 'Something went wrong.';
    if (err.status === 401) return 'Sign-in required \u2014 ' + (err.message || 'please sign in again.');
    if (err.status === 403) return 'Not allowed \u2014 ' + (err.message || 'you can only manage events you host.');
    return err.message || fallback || 'Something went wrong.';
  }

  function qsAll(selector) {
    try { return document.querySelectorAll(selector) || []; } catch (e) { return []; }
  }

  function byId(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }

  function blankCategory() {
    return { name: '', planned: '' };
  }

  function blankLine() {
    return {
      categoryId: '', description: '', kind: 'Expense',
      amount: '', date: '', documentRef: '',
    };
  }

  function blankSponsor() {
    return {
      name: '', package: '', status: 'Prospect', promised: '', received: '',
      contactName: '', contactEmail: '', contactPhone: '', booth: '', notes: '',
    };
  }

  function budget() {
    const state = {
      events: [], eventId: '', currency: 'INR',
      summary: null, categories: [], lines: [], scenarios: null, sponsors: [],
      errors: { summary: '', categories: '', lines: '', scenarios: '', sponsors: '', report: '' },
      catForm: blankCategory(), catEditId: '', catErr: {}, catMessage: '',
      lineForm: blankLine(), lineEditId: '', lineErr: {}, lineMessage: '', lineFilter: '',
      scenForm: { label: '', participants: '', perParticipant: '' }, scenErr: {}, scenBusy: false, scenProj: null,
      sponsorForm: blankSponsor(), sponsorEditId: '', sponsorErr: {}, sponsorMessage: '',
      deliv: { sponsorId: '', items: [], error: '', message: '', busy: false },
      report: null, busy: false,
    };

    function currentEvent() {
      const found = arr(state.events).filter(function (e) {
        return String(e.id) === String(state.eventId);
      });
      return found[0] || null;
    }

    function eventPicker() {
      if (!arr(state.events).length) return '';
      return '<label class="select-field">' + ic('calendar-days', 16)
        + '<select id="bdg-event">' + arr(state.events).map(function (e) {
          return '<option value="' + esc(e.id) + '"'
            + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
            + esc(e.title || 'Event') + '</option>';
        }).join('') + '</select>' + ic('chevron-down', 15) + '</label>';
    }

    function moneyObj(o) {
      if (!o || typeof o !== 'object') return money(0, state.currency);
      return money(o.minor, o.currency || state.currency);
    }

    function simpleOptions(values, selected) {
      return values.map(function (v) {
        return '<option value="' + esc(v) + '"'
          + (String(v) === String(selected) ? ' selected' : '') + '>'
          + esc(v) + '</option>';
      }).join('');
    }

    function inputField(id, label, type, value, opts) {
      opts = opts || {};
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label)
        + (opts.required ? '<span class="form-req">*</span>' : '') + '</label>'
        + '<div class="form-input-wrap' + (opts.error ? ' form-input-error' : '') + '">'
        + '<input id="' + id + '" type="' + esc(type || 'text') + '" value="' + esc(value == null ? '' : value) + '"'
        + ' placeholder="' + esc(opts.placeholder || '') + '" />'
        + '</div>'
        + (opts.error ? '<span class="field-error">' + esc(opts.error) + '</span>' : '')
        + (opts.hint ? '<span class="form-hint">' + esc(opts.hint) + '</span>' : '')
        + '</div>';
    }

    function textareaField(id, label, value, opts) {
      opts = opts || {};
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label) + '</label>'
        + '<textarea id="' + id + '" rows="' + (opts.rows || 3) + '" class="form-textarea"'
        + ' placeholder="' + esc(opts.placeholder || '') + '">' + esc(value == null ? '' : value) + '</textarea>'
        + (opts.error ? '<span class="field-error">' + esc(opts.error) + '</span>' : '')
        + '</div>';
    }

    function selectField(id, label, optionsHTML, opts) {
      opts = opts || {};
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label) + '</label>'
        + '<div class="form-input-wrap' + (opts.error ? ' form-input-error' : '') + '">'
        + '<select id="' + id + '">' + optionsHTML + '</select>'
        + '</div>'
        + (opts.error ? '<span class="field-error">' + esc(opts.error) + '</span>' : '')
        + (opts.hint ? '<span class="form-hint">' + esc(opts.hint) + '</span>' : '')
        + '</div>';
    }

    function errorBox() {
      const list = Object.keys(state.errors).map(function (key) {
        return state.errors[key];
      }).filter(function (text) { return !!text; });
      if (!list.length) return '';
      const unique = list.filter(function (text, index) { return list.indexOf(text) === index; });
      return '<div class="queue-callout"><div class="callout-icon">' + ic('shield-alert', 20) + '</div>'
        + '<div><strong>Some finance data could not be loaded</strong><span>'
        + unique.map(function (text) { return esc(text); }).join('<br />')
        + '</span></div></div>';
    }

    function summarySection() {
      const summary = state.summary;
      const heading = ui.sectionHeading({ eyebrow: 'Finance', title: 'Budget summary' });
      if (!summary) {
        return '<section class="panel">' + heading
          + ui.emptyView({
            title: 'No budget summary yet',
            description: 'Add categories and budget lines to see planned spend against actuals.',
          })
          + '</section>';
      }
      const planned = num(summary.plannedMinor);
      const actual = num(summary.actualMinor);
      const remaining = num(summary.remainingMinor);
      const variance = num(summary.varianceMinor);
      const revenue = summary.revenue && summary.revenue.total ? summary.revenue.total : null;
      return '<section class="panel">' + heading
        + '<div class="stat-grid">'
        + ui.statCard({
          label: 'Total budget', value: money(planned, state.currency),
          detail: 'Planned across categories', icon: 'wallet', accent: 'blue',
        })
        + ui.statCard({
          label: 'Spent', value: money(actual, state.currency),
          detail: 'Actual budget lines', icon: 'receipt', accent: 'amber',
        })
        + ui.statCard({
          label: 'Remaining', value: money(remaining, state.currency),
          detail: 'Planned minus spent', icon: 'piggy-bank', accent: 'teal',
        })
        + ui.statCard({
          label: 'Variance', value: money(variance, state.currency),
          detail: num(summary.variancePercent) + '% of plan',
          icon: 'trending-up', accent: variance > 0 ? 'rose' : 'teal',
        })
        + ui.statCard({
          label: 'Utilisation', value: num(summary.utilisationPercent) + '%',
          detail: 'Spent vs planned', icon: 'gauge', accent: 'slate',
        })
        + ui.statCard({
          label: 'Revenue', value: revenue ? moneyObj(revenue) : money(0, state.currency),
          detail: 'Sponsorship + other revenue', icon: 'hand-coins', accent: 'teal',
        })
        + '</div>'
        + '<p class="lede" style="margin-top:14px">Variance is actual minus planned. '
        + 'All amounts are rendered from integer minor units in ' + esc(state.currency) + '.</p>'
        + '</section>';
    }

    function categoryOptions(selected) {
      return '<option value="">Uncategorised</option>' + arr(state.categories).map(function (c) {
        return '<option value="' + esc(c.id) + '"'
          + (String(c.id) === String(selected) ? ' selected' : '') + '>'
          + esc(c.name) + '</option>';
      }).join('');
    }

    function categoryName(id) {
      const found = arr(state.categories).filter(function (c) {
        return String(c.id) === String(id);
      });
      return found[0] ? (found[0].name || '') : '';
    }

    function categoriesSection() {
      const categories = arr(state.categories);
      const rows = categories.map(function (c) {
        const currency = c.currency || state.currency;
        return '<tr>'
          + '<td><strong>' + esc(c.name) + '</strong><div class="tie-note">' + esc(currency) + '</div></td>'
          + '<td>' + esc(money(c.plannedMinor, currency)) + '</td>'
          + '<td>' + esc(money(c.actualMinor, currency)) + '</td>'
          + '<td>' + esc(money(c.varianceMinor, currency)) + '</td>'
          + '<td>' + esc(num(c.utilisationPercent)) + '%</td>'
          + '<td><div class="chip-row">'
          + '<button class="button button-secondary" data-cat-edit="' + esc(c.id) + '">Edit</button>'
          + '<button class="button button-ghost" data-cat-del="' + esc(c.id) + '">Delete</button>'
          + '</div></td></tr>';
      }).join('');

      const table = categories.length
        ? '<div class="data-table-wrap"><table class="data-table">'
          + '<thead><tr><th>Category</th><th>Planned</th><th>Actual</th><th>Variance</th><th>Used</th><th>Actions</th></tr></thead>'
          + '<tbody>' + rows + '</tbody></table></div>'
        : ui.emptyView({
          title: 'No categories yet',
          description: 'Create a category to group planned and actual spend.',
        });

      return '<section class="panel">'
        + ui.sectionHeading({
          eyebrow: 'Plan', title: 'Budget categories',
          action: state.catEditId ? ui.badge('Editing', 'amber') : '',
        })
        + table
        + inputField('cat-name', 'Category name', 'text', state.catForm.name, {
          required: true, placeholder: 'Venue & logistics', error: state.catErr.name,
        })
        + inputField('cat-planned', 'Planned amount (' + state.currency + ')', 'text', state.catForm.planned, {
          placeholder: '25000.00', error: state.catErr.planned,
          hint: 'Enter major units \u2014 converted to integer minor units before saving.',
        })
        + (state.catErr.form ? '<div class="form-error">' + esc(state.catErr.form) + '</div>' : '')
        + (state.catMessage ? '<div class="form-info">' + esc(state.catMessage) + '</div>' : '')
        + '<div class="modal-actions" style="justify-content:flex-start">'
        + '<button class="button button-primary" data-cat-submit="1"' + (state.busy ? ' disabled' : '') + '>'
        + (state.catEditId ? 'Save category' : 'Add category') + '</button>'
        + (state.catEditId ? '<button class="button button-secondary" data-cat-cancel="1">Cancel edit</button>' : '')
        + '</div></section>';
    }

    function linesSection() {
      const lines = arr(state.lines);
      const filter = String(state.lineFilter || '');
      const visible = filter
        ? lines.filter(function (l) { return String(l.categoryId) === filter; })
        : lines;

      const filterSelect = '<label class="select-field">' + ic('filter', 15)
        + '<select id="ln-cat-filter"><option value="">All categories</option>'
        + arr(state.categories).map(function (c) {
          return '<option value="' + esc(c.id) + '"'
            + (String(c.id) === filter ? ' selected' : '') + '>'
            + esc(c.name) + '</option>';
        }).join('') + '</select>' + ic('chevron-down', 15) + '</label>';

      const rows = visible.map(function (l) {
        const currency = l.currency || state.currency;
        const kindTone = l.kind === 'Adjustment' ? 'amber' : (l.kind === 'Expense' ? 'slate' : 'teal');
        return '<tr>'
          + '<td><strong>' + esc(l.description) + '</strong>'
          + (l.documentRef ? '<div class="tie-note">Ref ' + esc(l.documentRef) + '</div>' : '') + '</td>'
          + '<td>' + (categoryName(l.categoryId)
            ? esc(categoryName(l.categoryId))
            : '<span class="tie-note">Uncategorised</span>') + '</td>'
          + '<td>' + ui.badge(l.kind || 'Expense', kindTone) + '</td>'
          + '<td>' + esc(money(l.amountMinor, currency)) + '</td>'
          + '<td>' + (l.date ? esc(l.date) : '<span class="tie-note">No date</span>') + '</td>'
          + '<td><div class="chip-row">'
          + '<button class="button button-secondary" data-line-edit="' + esc(l.id) + '">Edit</button>'
          + '<button class="button button-ghost" data-line-del="' + esc(l.id) + '">Delete</button>'
          + '</div></td></tr>';
      }).join('');

      const table = visible.length
        ? '<div class="data-table-wrap"><table class="data-table">'
          + '<thead><tr><th>Line</th><th>Category</th><th>Kind</th><th>Amount</th><th>Date</th><th>Actions</th></tr></thead>'
          + '<tbody>' + rows + '</tbody></table></div>'
        : ui.emptyView({
          title: 'No budget lines',
          description: filter
            ? 'No lines have been recorded in this category yet.'
            : 'Record the first expense, sponsorship or revenue line.',
        });

      return '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Actuals', title: 'Budget lines', action: filterSelect })
        + table
        + selectField('ln-category', 'Category', categoryOptions(state.lineForm.categoryId))
        + inputField('ln-desc', 'Description', 'text', state.lineForm.description, {
          required: true, placeholder: 'Stage lighting hire', error: state.lineErr.description,
        })
        + selectField('ln-kind', 'Kind', simpleOptions(LINE_KINDS, state.lineForm.kind))
        + inputField('ln-amount', 'Amount (' + state.currency + ')', 'text', state.lineForm.amount, {
          required: true, placeholder: '1250.00', error: state.lineErr.amount,
          hint: 'Converted to minor units with Math.round(value * 100) before saving.',
        })
        + inputField('ln-date', 'Date', 'date', state.lineForm.date, { error: state.lineErr.date })
        + inputField('ln-ref', 'Document reference', 'text', state.lineForm.documentRef, {
          placeholder: 'Invoice number or receipt link',
        })
        + (state.lineErr.form ? '<div class="form-error">' + esc(state.lineErr.form) + '</div>' : '')
        + (state.lineMessage ? '<div class="form-info">' + esc(state.lineMessage) + '</div>' : '')
        + '<div class="modal-actions" style="justify-content:flex-start">'
        + '<button class="button button-primary" data-line-submit="1"' + (state.busy ? ' disabled' : '') + '>'
        + (state.lineEditId ? 'Save line' : 'Add line') + '</button>'
        + (state.lineEditId ? '<button class="button button-secondary" data-line-cancel="1">Cancel edit</button>' : '')
        + '</div></section>';
    }

    function scenariosSection() {
      const payload = state.scenarios;
      const list = payload ? arr(payload.scenarios) : [];
      const assumptions = payload && payload.assumptions ? payload.assumptions : {};
      const rows = list.map(function (s) {
        return '<tr>'
          + '<td><strong>' + esc(s.label) + '</strong></td>'
          + '<td>' + esc(num(s.participants)) + '</td>'
          + '<td>' + esc(moneyObj(s.estimated)) + '</td></tr>';
      }).join('');

      const table = list.length
        ? '<div class="data-table-wrap"><table class="data-table">'
          + '<thead><tr><th>Scenario</th><th>Participants</th><th>Estimated cost</th></tr></thead>'
          + '<tbody>' + rows + '</tbody></table></div>'
        : '<p class="lede">No scenarios saved yet. Add one below to project costs at a different attendance level.</p>';

      const perMinor = num(assumptions.perParticipant);
      const assumptionLine = perMinor
        ? '<p class="tie-note">Current assumption: '
          + esc(money(perMinor, assumptions.currency || state.currency))
          + ' per participant.</p>'
        : '';

      let projection = '';
      if (state.scenProj) {
        const p = state.scenProj;
        const delta = num(p.delta);
        projection = '<div class="queue-callout"><div class="callout-icon">' + ic('calculator', 20) + '</div>'
          + '<div><strong>Projected \u00b7 ' + esc(p.label) + '</strong>'
          + '<span>' + esc(num(p.participants)) + ' participants \u2192 '
          + esc(money(p.estimatedMinor, p.currency)) + ' estimated; projected variance '
          + esc(money(p.varianceMinor, p.currency)) + ' against the planned budget'
          + (delta !== 0 ? ' (' + (delta > 0 ? '+' : '') + esc(delta) + ' participants vs current forecast)' : '')
          + '.</span></div></div>';
      }

      return '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Forecast', title: 'Budget scenarios' })
        + table + assumptionLine
        + inputField('scen-label', 'Scenario label', 'text', state.scenForm.label, {
          placeholder: 'Optimistic attendance',
        })
        + inputField('scen-participants', 'Participants', 'number', state.scenForm.participants, {
          required: true, placeholder: '150', error: state.scenErr.participants,
        })
        + inputField('scen-per', 'Cost per participant (' + state.currency + ')', 'text', state.scenForm.perParticipant, {
          placeholder: '450.00', error: state.scenErr.perParticipant,
        })
        + (state.scenErr.form ? '<div class="form-error">' + esc(state.scenErr.form) + '</div>' : '')
        + '<div class="modal-actions" style="justify-content:flex-start">'
        + '<button class="button button-primary" data-scen-create="1"' + (state.scenBusy ? ' disabled' : '') + '>'
        + (state.scenBusy ? 'Saving\u2026' : 'Create scenario') + '</button>'
        + '</div>'
        + (payload && payload.note ? '<p class="lede">' + esc(payload.note) + '</p>' : '')
        + projection
        + '</section>';
    }

    function sponsorRows() {
      return arr(state.sponsors).map(function (s) {
        const currency = s.currency || state.currency;
        const tone = s.status === 'Paid' ? 'green'
          : s.status === 'Confirmed' ? 'teal'
            : s.status === 'Declined' ? 'red' : 'amber';
        return '<tr>'
          + '<td><strong>' + esc(s.name) + '</strong>'
          + (s.contactName || s.contactEmail
            ? '<div class="tie-note">' + esc(s.contactName || '')
              + (s.contactEmail ? ' \u00b7 ' + esc(s.contactEmail) : '') + '</div>'
            : '') + '</td>'
          + '<td>' + (s.package ? esc(s.package) : '<span class="tie-note">No tier</span>') + '</td>'
          + '<td>' + ui.badge(s.status || 'Prospect', tone) + '</td>'
          + '<td>' + esc(money(s.promisedMinor, currency)) + '</td>'
          + '<td>' + esc(money(s.receivedMinor, currency)) + '</td>'
          + '<td>' + esc(num(s.deliverablesDone) + '/' + num(s.deliverablesTotal)) + '</td>'
          + '<td><div class="chip-row">'
          + '<button class="button button-secondary" data-sponsor-edit="' + esc(s.id) + '">Edit</button>'
          + '<button class="button button-secondary" data-sponsor-deliv="' + esc(s.id) + '">Deliverables</button>'
          + '<button class="button button-ghost" data-sponsor-del="' + esc(s.id) + '">Delete</button>'
          + '</div></td></tr>';
      }).join('');
    }

    function delivPanel() {
      const deliv = state.deliv;
      if (!deliv.sponsorId) return '';
      const sponsor = arr(state.sponsors).filter(function (s) {
        return String(s.id) === String(deliv.sponsorId);
      })[0];
      const items = arr(deliv.items);
      const rows = items.map(function (item, index) {
        return '<tr>'
          + '<td><div class="form-input-wrap"><input id="deliv-title-' + index + '" type="text" value="'
          + esc(item.title) + '" placeholder="Deliverable title" /></div></td>'
          + '<td><div class="form-input-wrap"><input id="deliv-due-' + index + '" type="date" value="'
          + esc(item.due) + '" /></div></td>'
          + '<td><div class="chip-row">'
          + '<button type="button" class="button button-' + (item.done ? 'primary' : 'secondary')
          + '" data-deliv-done="' + index + '">' + (item.done ? 'Done' : 'Pending') + '</button>'
          + '<button type="button" class="button button-ghost" data-deliv-remove="' + index + '">Remove</button>'
          + '</div></td></tr>';
      }).join('');

      return '<div class="panel" style="margin-top:16px" id="deliv-editor">'
        + '<div class="eyebrow">Deliverables checklist</div>'
        + '<h3>' + esc(sponsor ? sponsor.name : 'Sponsor') + '</h3>'
        + (items.length
          ? '<div class="data-table-wrap"><table class="data-table">'
            + '<thead><tr><th>Title</th><th>Due</th><th>Status</th></tr></thead>'
            + '<tbody>' + rows + '</tbody></table></div>'
          : '<p class="lede">No deliverables yet. Add the first item below.</p>')
        + (deliv.error ? '<div class="form-error">' + esc(deliv.error) + '</div>' : '')
        + (deliv.message ? '<div class="form-info">' + esc(deliv.message) + '</div>' : '')
        + '<div class="modal-actions" style="justify-content:flex-start">'
        + '<button class="button button-secondary" data-deliv-add="1">Add deliverable</button>'
        + '<button class="button button-primary" data-deliv-save="1"' + (deliv.busy ? ' disabled' : '') + '>'
        + (deliv.busy ? 'Saving\u2026' : 'Save checklist') + '</button>'
        + '<button class="button button-ghost" data-deliv-cancel="1">Close</button>'
        + '</div></div>';
    }

    function reportPanel() {
      const report = state.report;
      if (!report) {
        return state.errors.report
          ? '<div class="form-error" style="margin-top:16px">' + esc(state.errors.report) + '</div>'
          : '';
      }
      const summary = report.summary || {};
      const entries = arr(report.sponsors);
      const rows = entries.map(function (s) {
        return '<tr>'
          + '<td><strong>' + esc(s.name) + '</strong>'
          + (s.package ? '<div class="tie-note">' + esc(s.package) + '</div>' : '') + '</td>'
          + '<td>' + ui.badge(s.status || 'Prospect', 'slate') + '</td>'
          + '<td>' + esc(s.promisedFormatted || '') + '</td>'
          + '<td>' + esc(s.receivedFormatted || '') + '</td>'
          + '<td>' + esc(num(s.deliverablesDone) + '/' + num(s.deliverablesTotal)) + '</td>'
          + '<td>' + esc(num(s.completionPercent)) + '%</td>'
          + '<td>' + (s.overdue ? ui.badge('Overdue', 'red') : ui.badge('On track', 'green')) + '</td>'
          + '</tr>';
      }).join('');
      const packages = arr(report.byPackage).map(function (p) {
        return '<div class="chip-row" style="margin-bottom:6px">'
          + ui.badge(p.package || 'No package', 'slate')
          + '<span class="tie-note">' + esc(num(p.count)) + ' sponsor(s) \u00b7 promised '
          + esc(moneyObj(p.promised)) + '</span></div>';
      }).join('');

      return '<div class="panel" style="margin-top:16px" id="sponsor-report">'
        + '<div class="eyebrow">Sponsor report</div><h3>Sponsorship summary</h3>'
        + '<div class="stat-grid compact">'
        + ui.statCard({
          label: 'Sponsors', value: String(num(summary.sponsors)),
          detail: 'On this event', icon: 'handshake', accent: 'blue',
        })
        + ui.statCard({
          label: 'Promised', value: moneyObj(summary.promisedTotal),
          detail: 'Total commitments', icon: 'file-signature', accent: 'teal',
        })
        + ui.statCard({
          label: 'Received', value: moneyObj(summary.receivedTotal),
          detail: 'Outstanding ' + moneyObj(summary.outstanding), icon: 'wallet', accent: 'amber',
        })
        + ui.statCard({
          label: 'Deliverables',
          value: num(summary.deliverablesDone) + '/' + num(summary.deliverablesTotal),
          detail: num(summary.deliverablesOverdue) + ' overdue', icon: 'list-checks', accent: 'slate',
        })
        + '</div>'
        + (entries.length
          ? '<div class="data-table-wrap"><table class="data-table">'
            + '<thead><tr><th>Sponsor</th><th>Status</th><th>Promised</th><th>Received</th><th>Deliverables</th><th>Completion</th><th>Schedule</th></tr></thead>'
            + '<tbody>' + rows + '</tbody></table></div>'
          : '<p class="lede">No sponsors on this event yet.</p>')
        + (packages ? '<div style="margin-top:14px">' + packages + '</div>' : '')
        + (report.roiNote ? '<p class="lede">' + esc(report.roiNote) + '</p>' : '')
        + '<div class="modal-actions" style="justify-content:flex-start">'
        + '<button class="button button-secondary" data-report-csv="1">Download CSV</button>'
        + '<button class="button button-ghost" data-report-close="1">Close report</button>'
        + '</div></div>';
    }

    function sponsorsSection() {
      const sponsors = arr(state.sponsors);
      const table = sponsors.length
        ? '<div class="data-table-wrap"><table class="data-table">'
          + '<thead><tr><th>Sponsor</th><th>Package</th><th>Status</th><th>Promised</th><th>Received</th><th>Deliverables</th><th>Actions</th></tr></thead>'
          + '<tbody>' + sponsorRows() + '</tbody></table></div>'
        : ui.emptyView({
          title: 'No sponsors yet',
          description: 'Add a sponsor with their package, promised amount and deliverables.',
        });

      return '<section class="panel">'
        + ui.sectionHeading({
          eyebrow: 'Sponsorship', title: 'Sponsors',
          action: '<button class="button button-secondary" data-sponsor-report="1">Sponsor report</button>',
        })
        + table
        + inputField('sp-name', 'Sponsor name', 'text', state.sponsorForm.name, {
          required: true, placeholder: 'Northwind Labs', error: state.sponsorErr.name,
        })
        + inputField('sp-package', 'Package / tier', 'text', state.sponsorForm.package, {
          placeholder: 'Gold, Community, Media',
        })
        + selectField('sp-status', 'Status', simpleOptions(SPONSOR_STATUSES, state.sponsorForm.status))
        + inputField('sp-promised', 'Promised (' + state.currency + ')', 'text', state.sponsorForm.promised, {
          placeholder: '50000.00', error: state.sponsorErr.promised,
        })
        + inputField('sp-received', 'Received (' + state.currency + ')', 'text', state.sponsorForm.received, {
          placeholder: '25000.00', error: state.sponsorErr.received,
        })
        + inputField('sp-contact', 'Contact name', 'text', state.sponsorForm.contactName, {
          placeholder: 'Asha Menon',
        })
        + inputField('sp-email', 'Contact email', 'email', state.sponsorForm.contactEmail, {
          placeholder: 'asha@example.com',
        })
        + inputField('sp-phone', 'Contact phone', 'text', state.sponsorForm.contactPhone, {
          placeholder: '+91 98000 00000',
        })
        + inputField('sp-booth', 'Booth', 'text', state.sponsorForm.booth, {
          placeholder: 'Hall B, stall 12',
        })
        + textareaField('sp-notes', 'Notes', state.sponsorForm.notes, {
          placeholder: 'Contract terms, invoicing notes',
        })
        + (state.sponsorErr.form ? '<div class="form-error">' + esc(state.sponsorErr.form) + '</div>' : '')
        + (state.sponsorMessage ? '<div class="form-info">' + esc(state.sponsorMessage) + '</div>' : '')
        + '<div class="modal-actions" style="justify-content:flex-start">'
        + '<button class="button button-primary" data-sponsor-submit="1"' + (state.busy ? ' disabled' : '') + '>'
        + (state.sponsorEditId ? 'Save sponsor' : 'Add sponsor') + '</button>'
        + (state.sponsorEditId ? '<button class="button button-secondary" data-sponsor-cancel="1">Cancel edit</button>' : '')
        + '</div>'
        + delivPanel() + reportPanel()
        + '</section>';
    }

    function render() {
      const events = arr(state.events);
      const heading = ui.sectionHeading({
        eyebrow: 'Hosting operations',
        title: 'Budget & sponsors',
        action: eventPicker(),
      });
      const body = events.length
        ? summarySection() + categoriesSection() + linesSection() + scenariosSection() + sponsorsSection()
        : ui.emptyView({
          title: 'No events to budget yet',
          description: 'Budgets and sponsorships are scoped to an event you host.',
          action: '<a class="button button-primary" href="host-an-event.html">Host an Event</a>',
        });
      return '<div class="page-stack">' + heading + errorBox() + body + '</div>';
    }

    function refresh() {
      WM.refreshContent(render);
      wire();
    }

    function perParticipantDefault() {
      const assumptions = state.scenarios && state.scenarios.assumptions;
      const minor = assumptions ? num(assumptions.perParticipant) : 0;
      return minor > 0 ? majorString(minor) : '';
    }

    function loadSummary(eid) {
      return call(function () { return global.WMApi.finance.budgetSummary(eid); }).then(function (data) {
        state.summary = data && typeof data === 'object' ? data : null;
        if (state.summary && state.summary.currency) state.currency = state.summary.currency;
      }, function (err) {
        state.summary = null;
        state.errors.summary = errText(err, 'Could not load the budget summary.');
      });
    }

    function loadCategories(eid) {
      return call(function () { return global.WMApi.finance.budgetCategories(eid); }).then(function (rows) {
        state.categories = arr(rows);
      }, function (err) {
        state.categories = [];
        state.errors.categories = errText(err, 'Could not load budget categories.');
      });
    }

    function loadLines(eid) {
      return call(function () { return global.WMApi.finance.budgetLines(eid); }).then(function (rows) {
        state.lines = arr(rows);
      }, function (err) {
        state.lines = [];
        state.errors.lines = errText(err, 'Could not load budget lines.');
      });
    }

    function loadScenarios(eid) {
      return call(function () { return global.WMApi.finance.budgetScenarios(eid); }).then(function (data) {
        state.scenarios = data && typeof data === 'object' ? data : null;
        if (!state.scenForm.perParticipant) state.scenForm.perParticipant = perParticipantDefault();
      }, function (err) {
        state.scenarios = null;
        state.errors.scenarios = errText(err, 'Could not load budget scenarios.');
      });
    }

    function loadSponsors(eid) {
      return call(function () { return global.WMApi.finance.sponsors(eid); }).then(function (rows) {
        state.sponsors = arr(rows);
      }, function (err) {
        state.sponsors = [];
        state.errors.sponsors = errText(err, 'Could not load sponsors.');
      });
    }

    function reloadAll() {
      if (!state.eventId) { refresh(); return Promise.resolve(); }
      state.errors = { summary: '', categories: '', lines: '', scenarios: '', sponsors: '', report: '' };
      const eid = state.eventId;
      return Promise.all([
        loadSummary(eid),
        loadCategories(eid),
        loadLines(eid),
        loadScenarios(eid),
        loadSponsors(eid),
      ]).then(function () { refresh(); });
    }

    function resetForEvent() {
      const event = currentEvent();
      state.currency = event && event.currency ? event.currency : 'INR';
      state.summary = null;
      state.categories = [];
      state.lines = [];
      state.scenarios = null;
      state.sponsors = [];
      state.report = null;
      state.errors = { summary: '', categories: '', lines: '', scenarios: '', sponsors: '', report: '' };
      state.catForm = blankCategory();
      state.catEditId = '';
      state.catErr = {};
      state.catMessage = '';
      state.lineForm = blankLine();
      state.lineEditId = '';
      state.lineErr = {};
      state.lineMessage = '';
      state.lineFilter = '';
      state.scenForm = { label: '', participants: '', perParticipant: '' };
      state.scenErr = {};
      state.scenProj = null;
      state.sponsorForm = blankSponsor();
      state.sponsorEditId = '';
      state.sponsorErr = {};
      state.sponsorMessage = '';
      state.deliv = { sponsorId: '', items: [], error: '', message: '', busy: false };
    }

    function submitCategory() {
      if (state.busy) return;
      const name = String(state.catForm.name || '').trim();
      const parsed = parseMajor(state.catForm.planned);
      const errs = {};
      if (!name) errs.name = 'Category name is required.';
      let minor = 0;
      if (String(state.catForm.planned || '').trim() === '') {
        minor = 0;
      } else if (parsed.error) {
        errs.planned = parsed.error;
      } else {
        minor = parsed.minor;
        if (minor < 0) errs.planned = 'Planned amount cannot be negative.';
      }
      state.catErr = errs;
      if (Object.keys(errs).length) { refresh(); return; }

      const payload = { name: name, planned: majorString(minor), currency: state.currency };
      const editingId = state.catEditId;
      state.busy = true;
      state.catMessage = '';
      refresh();
      const request = editingId
        ? call(function () { return global.WMApi.finance.updateBudgetCategory(editingId, payload); })
        : call(function () { return global.WMApi.finance.createBudgetCategory(state.eventId, payload); });
      request.then(function () {
        state.busy = false;
        state.catEditId = '';
        state.catForm = blankCategory();
        state.catErr = {};
        state.catMessage = 'Category saved.';
        WM.toast('Category saved.');
        reloadAll();
      }, function (err) {
        state.busy = false;
        state.catErr = { form: errText(err, 'Could not save the category.') };
        refresh();
      });
    }

    function submitLine() {
      if (state.busy) return;
      const form = state.lineForm;
      const parsed = parseMajor(form.amount);
      const errs = {};
      if (!String(form.description || '').trim()) errs.description = 'A description is required.';
      let minor = null;
      if (parsed.error) {
        errs.amount = parsed.error;
      } else {
        minor = parsed.minor;
        if (form.kind !== 'Adjustment' && minor <= 0) {
          errs.amount = 'Amount must be greater than zero (adjustments may be zero or negative).';
        }
      }
      if (form.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(form.date))) {
        errs.date = 'Date must be YYYY-MM-DD.';
      }
      state.lineErr = errs;
      if (Object.keys(errs).length || minor == null) { refresh(); return; }

      const payload = {
        categoryId: String(form.categoryId || ''),
        description: String(form.description).trim(),
        kind: LINE_KINDS.indexOf(form.kind) !== -1 ? form.kind : 'Expense',
        amount: majorString(minor),
        date: String(form.date || ''),
        documentRef: String(form.documentRef || ''),
      };
      const editingId = state.lineEditId;
      state.busy = true;
      state.lineMessage = '';
      refresh();
      const request = editingId
        ? call(function () { return global.WMApi.finance.updateBudgetLine(editingId, payload); })
        : call(function () { return global.WMApi.finance.createBudgetLine(state.eventId, payload); });
      request.then(function () {
        state.busy = false;
        state.lineEditId = '';
        state.lineForm = blankLine();
        state.lineErr = {};
        state.lineMessage = 'Budget line saved.';
        WM.toast('Budget line saved.');
        reloadAll();
      }, function (err) {
        state.busy = false;
        state.lineErr = { form: errText(err, 'Could not save the budget line.') };
        refresh();
      });
    }

    function createScenario() {
      if (state.scenBusy) return;
      const form = state.scenForm;
      const participants = parseInt(String(form.participants || '').trim(), 10);
      const parsed = parseMajor(form.perParticipant);
      const existing = arr(state.scenarios && state.scenarios.scenarios).map(function (s) {
        return { label: String(s.label || ''), participants: num(s.participants) };
      });
      const errs = {};
      if (!isFinite(participants) || participants <= 0) {
        errs.participants = 'Enter a positive participant count.';
      }
      if (parsed.error) errs.perParticipant = parsed.error;
      else if (parsed.minor < 0) errs.perParticipant = 'Cost per participant cannot be negative.';
      if (existing.length >= 6) errs.form = 'A budget can hold at most 6 scenarios.';
      state.scenErr = errs;
      if (Object.keys(errs).length) { refresh(); return; }

      const label = String(form.label || '').trim() || ('Scenario ' + (existing.length + 1));
      const entry = { label: label, participants: participants };
      state.scenBusy = true;
      refresh();
      call(function () {
        return global.WMApi.finance.createBudgetScenario(state.eventId, {
          scenarios: existing.concat([entry]),
          perParticipantMinor: parsed.minor,
        });
      }).then(function (data) {
        state.scenBusy = false;
        state.scenarios = data && typeof data === 'object' ? data : null;
        const created = arr(state.scenarios && state.scenarios.scenarios).filter(function (s) {
          return String(s.label) === label && num(s.participants) === participants;
        })[0];
        const estimatedMinor = created && created.estimated
          ? num(created.estimated.minor)
          : parsed.minor * participants;
        const planned = state.summary ? num(state.summary.plannedMinor) : 0;
        const baseCount = state.summary && state.summary.forecast
          ? num(state.summary.forecast.participantCount)
          : 0;
        state.scenProj = {
          label: label,
          participants: participants,
          estimatedMinor: estimatedMinor,
          varianceMinor: estimatedMinor - planned,
          currency: (created && created.estimated && created.estimated.currency) || state.currency,
          delta: baseCount ? participants - baseCount : 0,
        };
        state.scenForm = { label: '', participants: '', perParticipant: perParticipantDefault() };
        state.scenErr = {};
        WM.toast('Scenario created.');
        refresh();
      }, function (err) {
        state.scenBusy = false;
        state.scenErr = { form: errText(err, 'Could not create the scenario.') };
        refresh();
      });
    }

    function submitSponsor() {
      if (state.busy) return;
      const form = state.sponsorForm;
      const promised = parseMajor(form.promised);
      const received = parseMajor(form.received);
      const errs = {};
      if (!String(form.name || '').trim()) errs.name = 'Sponsor name is required.';
      let promisedMinor = 0;
      let receivedMinor = 0;
      if (String(form.promised || '').trim() === '') {
        promisedMinor = 0;
      } else if (promised.error) {
        errs.promised = promised.error;
      } else {
        promisedMinor = promised.minor;
        if (promisedMinor < 0) errs.promised = 'Promised amount cannot be negative.';
      }
      if (String(form.received || '').trim() === '') {
        receivedMinor = 0;
      } else if (received.error) {
        errs.received = received.error;
      } else {
        receivedMinor = received.minor;
        if (receivedMinor < 0) errs.received = 'Received amount cannot be negative.';
      }
      state.sponsorErr = errs;
      if (Object.keys(errs).length) { refresh(); return; }

      const payload = {
        name: String(form.name).trim(),
        package: String(form.package || ''),
        status: SPONSOR_STATUSES.indexOf(form.status) !== -1 ? form.status : 'Prospect',
        promised: majorString(promisedMinor),
        received: majorString(receivedMinor),
        contactName: String(form.contactName || ''),
        contactEmail: String(form.contactEmail || ''),
        contactPhone: String(form.contactPhone || ''),
        booth: String(form.booth || ''),
        notes: String(form.notes || ''),
      };
      const editingId = state.sponsorEditId;
      state.busy = true;
      state.sponsorMessage = '';
      refresh();
      const request = editingId
        ? call(function () { return global.WMApi.finance.updateSponsor(editingId, payload); })
        : call(function () { return global.WMApi.finance.createSponsor(state.eventId, payload); });
      request.then(function () {
        state.busy = false;
        state.sponsorEditId = '';
        state.sponsorForm = blankSponsor();
        state.sponsorErr = {};
        state.sponsorMessage = 'Sponsor saved.';
        WM.toast('Sponsor saved.');
        reloadAll();
      }, function (err) {
        state.busy = false;
        state.sponsorErr = { form: errText(err, 'Could not save the sponsor.') };
        refresh();
      });
    }

    function openDeliverables(id) {
      const sponsor = arr(state.sponsors).filter(function (s) {
        return String(s.id) === String(id);
      })[0];
      if (!sponsor) return;
      state.deliv = {
        sponsorId: String(sponsor.id),
        items: arr(sponsor.deliverables).map(function (d) {
          return {
            title: String(d && d.title ? d.title : ''),
            due: String(d && d.due ? d.due : ''),
            done: !!(d && d.done),
          };
        }),
        error: '', message: '', busy: false,
      };
      refresh();
      const editor = byId('deliv-editor');
      if (editor && editor.scrollIntoView) {
        try { editor.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { }
      }
    }

    function readDeliverables() {
      return arr(state.deliv.items).map(function (item, index) {
        const titleEl = byId('deliv-title-' + index);
        const dueEl = byId('deliv-due-' + index);
        return {
          title: titleEl ? titleEl.value : String(item.title || ''),
          due: dueEl ? dueEl.value : String(item.due || ''),
          done: !!item.done,
        };
      });
    }

    function saveDeliverables() {
      if (!state.deliv.sponsorId || state.deliv.busy) return;
      const items = readDeliverables();
      if (items.some(function (item) { return !String(item.title || '').trim(); })) {
        state.deliv.error = 'Every deliverable needs a title.';
        refresh();
        return;
      }
      if (items.some(function (item) {
        return item.due && !/^\d{4}-\d{2}-\d{2}$/.test(String(item.due));
      })) {
        state.deliv.error = 'Due dates must use YYYY-MM-DD.';
        refresh();
        return;
      }
      state.deliv.busy = true;
      state.deliv.error = '';
      state.deliv.message = '';
      refresh();
      call(function () {
        return global.WMApi.finance.setDeliverables(state.deliv.sponsorId, { deliverables: items });
      }).then(function (data) {
        state.deliv.busy = false;
        state.deliv.items = arr(data && data.deliverables).map(function (d) {
          return {
            title: String(d && d.title ? d.title : ''),
            due: String(d && d.due ? d.due : ''),
            done: !!(d && d.done),
          };
        });
        state.deliv.message = 'Checklist saved.';
        WM.toast('Deliverables saved.');
        reloadAll();
      }, function (err) {
        state.deliv.busy = false;
        state.deliv.error = errText(err, 'Could not save the checklist.');
        refresh();
      });
    }

    function loadSponsorReport() {
      if (!state.eventId) return;
      state.report = null;
      state.errors.report = '';
      refresh();
      call(function () { return global.WMApi.finance.sponsorReport(state.eventId); })
        .then(function (data) {
          state.report = data && typeof data === 'object' ? data : null;
          refresh();
        }, function (err) {
          state.errors.report = errText(err, 'Could not load the sponsor report.');
          refresh();
        });
    }

    function csvCell(value) {
      return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
    }

    function downloadSponsorCSV() {
      const report = state.report;
      if (!report) {
        WM.toast('Load the sponsor report first.', 'warning');
        return;
      }
      const summary = report.summary || {};
      const lines = [];
      lines.push(['Sponsor report', currentEvent() ? currentEvent().title : ''].map(csvCell).join(','));
      lines.push('');
      lines.push(['Metric', 'Value'].map(csvCell).join(','));
      lines.push(['Sponsors', num(summary.sponsors)].map(csvCell).join(','));
      lines.push(['Promised', summary.promisedTotal ? summary.promisedTotal.formatted : ''].map(csvCell).join(','));
      lines.push(['Received', summary.receivedTotal ? summary.receivedTotal.formatted : ''].map(csvCell).join(','));
      lines.push(['Outstanding', summary.outstanding ? summary.outstanding.formatted : ''].map(csvCell).join(','));
      lines.push(['Deliverables done', num(summary.deliverablesDone) + '/' + num(summary.deliverablesTotal)].map(csvCell).join(','));
      lines.push(['Deliverables overdue', num(summary.deliverablesOverdue)].map(csvCell).join(','));
      lines.push('');
      lines.push(['Sponsor', 'Package', 'Status', 'Promised', 'Received', 'Deliverables done', 'Deliverables total', 'Completion %', 'Overdue'].map(csvCell).join(','));
      arr(report.sponsors).forEach(function (s) {
        lines.push([
          s.name || '', s.package || '', s.status || '',
          s.promisedFormatted || '', s.receivedFormatted || '',
          num(s.deliverablesDone), num(s.deliverablesTotal),
          num(s.completionPercent), s.overdue ? 'Yes' : 'No',
        ].map(csvCell).join(','));
      });
      try {
        WM.downloadCSV('waymark-sponsor-report.csv', lines.join('\n'));
        WM.toast('Sponsor report downloaded.');
      } catch (err) {
        WM.toast('Could not download the report.', 'error');
      }
    }

    function bindField(id, key, getter) {
      const el = byId(id);
      if (!el) return;
      const apply = function () { getter()[key] = el.value; };
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    }

    function wire() {
      const eventSel = byId('bdg-event');
      if (eventSel) eventSel.addEventListener('change', function () {
        state.eventId = eventSel.value;
        resetForEvent();
        reloadAll();
      });

      bindField('cat-name', 'name', function () { return state.catForm; });
      bindField('cat-planned', 'planned', function () { return state.catForm; });
      bindField('ln-category', 'categoryId', function () { return state.lineForm; });
      bindField('ln-desc', 'description', function () { return state.lineForm; });
      bindField('ln-kind', 'kind', function () { return state.lineForm; });
      bindField('ln-amount', 'amount', function () { return state.lineForm; });
      bindField('ln-date', 'date', function () { return state.lineForm; });
      bindField('ln-ref', 'documentRef', function () { return state.lineForm; });
      bindField('scen-label', 'label', function () { return state.scenForm; });
      bindField('scen-participants', 'participants', function () { return state.scenForm; });
      bindField('scen-per', 'perParticipant', function () { return state.scenForm; });
      bindField('sp-name', 'name', function () { return state.sponsorForm; });
      bindField('sp-package', 'package', function () { return state.sponsorForm; });
      bindField('sp-status', 'status', function () { return state.sponsorForm; });
      bindField('sp-promised', 'promised', function () { return state.sponsorForm; });
      bindField('sp-received', 'received', function () { return state.sponsorForm; });
      bindField('sp-contact', 'contactName', function () { return state.sponsorForm; });
      bindField('sp-email', 'contactEmail', function () { return state.sponsorForm; });
      bindField('sp-phone', 'contactPhone', function () { return state.sponsorForm; });
      bindField('sp-booth', 'booth', function () { return state.sponsorForm; });
      bindField('sp-notes', 'notes', function () { return state.sponsorForm; });

      const lineFilter = byId('ln-cat-filter');
      if (lineFilter) lineFilter.addEventListener('change', function () {
        state.lineFilter = lineFilter.value;
        refresh();
      });

      qsAll('[data-cat-submit]').forEach(function (b) {
        b.addEventListener('click', submitCategory);
      });
      qsAll('[data-cat-cancel]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.catEditId = '';
          state.catForm = blankCategory();
          state.catErr = {};
          state.catMessage = '';
          refresh();
        });
      });
      qsAll('[data-cat-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-cat-edit');
          const found = arr(state.categories).filter(function (c) {
            return String(c.id) === String(id);
          })[0];
          if (!found) return;
          state.catEditId = String(found.id);
          state.catForm = { name: found.name || '', planned: majorString(found.plannedMinor) };
          state.catErr = {};
          state.catMessage = '';
          refresh();
        });
      });
      qsAll('[data-cat-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!global.confirm('Delete this budget category? Categories with lines cannot be removed.')) return;
          b.disabled = true;
          call(function () { return global.WMApi.finance.removeBudgetCategory(b.getAttribute('data-cat-del')); })
            .then(function () {
              WM.toast('Category deleted.');
              reloadAll();
            }, function (err) {
              b.disabled = false;
              WM.toast(errText(err, 'Could not delete the category.'), 'error');
            });
        });
      });

      qsAll('[data-line-submit]').forEach(function (b) {
        b.addEventListener('click', submitLine);
      });
      qsAll('[data-line-cancel]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.lineEditId = '';
          state.lineForm = blankLine();
          state.lineErr = {};
          state.lineMessage = '';
          refresh();
        });
      });
      qsAll('[data-line-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-line-edit');
          const found = arr(state.lines).filter(function (l) {
            return String(l.id) === String(id);
          })[0];
          if (!found) return;
          state.lineEditId = String(found.id);
          state.lineForm = {
            categoryId: found.categoryId || '',
            description: found.description || '',
            kind: LINE_KINDS.indexOf(found.kind) !== -1 ? found.kind : 'Expense',
            amount: majorString(found.amountMinor),
            date: found.date || '',
            documentRef: found.documentRef || '',
          };
          state.lineErr = {};
          state.lineMessage = '';
          refresh();
        });
      });
      qsAll('[data-line-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!global.confirm('Delete this budget line?')) return;
          b.disabled = true;
          call(function () { return global.WMApi.finance.removeBudgetLine(b.getAttribute('data-line-del')); })
            .then(function () {
              WM.toast('Budget line deleted.');
              reloadAll();
            }, function (err) {
              b.disabled = false;
              WM.toast(errText(err, 'Could not delete the budget line.'), 'error');
            });
        });
      });

      qsAll('[data-scen-create]').forEach(function (b) {
        b.addEventListener('click', createScenario);
      });

      qsAll('[data-sponsor-submit]').forEach(function (b) {
        b.addEventListener('click', submitSponsor);
      });
      qsAll('[data-sponsor-cancel]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.sponsorEditId = '';
          state.sponsorForm = blankSponsor();
          state.sponsorErr = {};
          state.sponsorMessage = '';
          refresh();
        });
      });
      qsAll('[data-sponsor-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-sponsor-edit');
          const found = arr(state.sponsors).filter(function (s) {
            return String(s.id) === String(id);
          })[0];
          if (!found) return;
          state.sponsorEditId = String(found.id);
          state.sponsorForm = {
            name: found.name || '',
            package: found.package || '',
            status: SPONSOR_STATUSES.indexOf(found.status) !== -1 ? found.status : 'Prospect',
            promised: majorString(found.promisedMinor),
            received: majorString(found.receivedMinor),
            contactName: found.contactName || '',
            contactEmail: found.contactEmail || '',
            contactPhone: found.contactPhone || '',
            booth: found.booth || '',
            notes: found.notes || '',
          };
          state.sponsorErr = {};
          state.sponsorMessage = '';
          refresh();
        });
      });
      qsAll('[data-sponsor-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!global.confirm('Remove this sponsor? This cannot be undone.')) return;
          b.disabled = true;
          call(function () { return global.WMApi.finance.removeSponsor(b.getAttribute('data-sponsor-del')); })
            .then(function () {
              if (state.deliv.sponsorId === b.getAttribute('data-sponsor-del')) {
                state.deliv = { sponsorId: '', items: [], error: '', message: '', busy: false };
              }
              WM.toast('Sponsor removed.');
              reloadAll();
            }, function (err) {
              b.disabled = false;
              WM.toast(errText(err, 'Could not remove the sponsor.'), 'error');
            });
        });
      });
      qsAll('[data-sponsor-deliv]').forEach(function (b) {
        b.addEventListener('click', function () {
          openDeliverables(b.getAttribute('data-sponsor-deliv'));
        });
      });
      qsAll('[data-sponsor-report]').forEach(function (b) {
        b.addEventListener('click', loadSponsorReport);
      });
      qsAll('[data-report-close]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.report = null;
          state.errors.report = '';
          refresh();
        });
      });
      qsAll('[data-report-csv]').forEach(function (b) {
        b.addEventListener('click', downloadSponsorCSV);
      });

      qsAll('[data-deliv-add]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.deliv.items = readDeliverables();
          state.deliv.items.push({ title: '', due: '', done: false });
          state.deliv.message = '';
          refresh();
        });
      });
      qsAll('[data-deliv-remove]').forEach(function (b) {
        b.addEventListener('click', function () {
          const index = parseInt(b.getAttribute('data-deliv-remove'), 10);
          if (!isFinite(index) || index < 0) return;
          state.deliv.items = readDeliverables();
          state.deliv.items.splice(index, 1);
          state.deliv.message = '';
          refresh();
        });
      });
      qsAll('[data-deliv-done]').forEach(function (b) {
        b.addEventListener('click', function () {
          const index = parseInt(b.getAttribute('data-deliv-done'), 10);
          if (!isFinite(index) || index < 0) return;
          state.deliv.items = readDeliverables();
          if (state.deliv.items[index]) {
            state.deliv.items[index].done = !state.deliv.items[index].done;
          }
          state.deliv.message = '';
          refresh();
        });
      });
      qsAll('[data-deliv-save]').forEach(function (b) {
        b.addEventListener('click', saveDeliverables);
      });
      qsAll('[data-deliv-cancel]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.deliv = { sponsorId: '', items: [], error: '', message: '', busy: false };
          refresh();
        });
      });
    }

    function load() {
      return call(function () { return global.WMApi.events.list(); }).then(function (events) {
        state.events = arr(events);
        if (state.events.length) {
          state.eventId = String(state.events[0].id);
          const event = currentEvent();
          if (event && event.currency) state.currency = event.currency;
        }
        if (!state.eventId) return null;
        return reloadAll();
      }).catch(function (err) {
        state.events = [];
        state.errors.summary = errText(err, 'Could not load events.');
      });
    }

    WM.page({ route: '/budget', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.budget = budget;
})(window);
