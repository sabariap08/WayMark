/* Event type administration - the universal event engine's configuration.
 * Admin-only: every mutation is rejected server-side for non-admins, and this
 * page renders that message instead of pretending the write worked. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const esc = WM.esc, ui = WM.ui;

  function eventTypeAdmin() {
    const state = {
      rows: [], loading: true, error: '', busy: false, message: '',
      form: { id: '', name: '', tagline: '', cssClass: '', configText: '', replaceConfig: false },
      errors: {},
    };

    function templateConfig() {
      const system = state.rows.filter(function (r) { return r.isSystem; })[0];
      return (system && system.config && Object.keys(system.config).length)
        ? JSON.parse(JSON.stringify(system.config)) : {};
    }

    function field(id, label, key, opts) {
      opts = opts || {};
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label)
        + (opts.required ? '<span class="form-req">*</span>' : '') + '</label>'
        + '<div class="form-input-wrap' + (state.errors[key] ? ' form-input-error' : '') + '">'
        + '<input id="' + id + '" type="' + (opts.type || 'text') + '" placeholder="'
        + esc(opts.placeholder || '') + '" value="' + esc(state.form[key]) + '" /></div>'
        + (state.errors[key] ? '<span class="field-error">' + esc(state.errors[key]) + '</span>' : '')
        + '</div>';
    }

    function rowCard(r) {
      const cfg = r.config || {};
      const participation = cfg.participation ? esc(cfg.participation) : 'not set';
      return '<div class="card-compact">'
        + '<div class="row-between">'
        + '<div><strong>' + esc(r.name) + '</strong> '
        + (r.isSystem ? ui.badge('system', 'info') : ui.badge('custom', 'neutral'))
        + '<div class="muted-text">' + esc(r.tagline || '') + '</div></div>'
        + '<div class="inline-actions">'
        + (r.isSystem ? '' : '<button class="button button-ghost" data-edit="' + esc(r.id) + '">Edit</button>'
          + '<button class="button button-ghost" data-remove="' + esc(r.id) + '">Delete</button>')
        + '</div></div>'
        + '<div class="meta-line">participation: ' + participation
        + ' &middot; workflow steps: ' + (Array.isArray(cfg.workflow) ? cfg.workflow.length : 0)
        + ' &middot; certificate rules: '
        + (cfg.certificates && Array.isArray(cfg.certificates.rules) ? cfg.certificates.rules.length : 0)
        + '</div></div>';
    }

    function render() {
      if (state.loading) return '<div class="page-stack">' + ui.sectionHeading({ eyebrow: 'Event engine', title: 'Event types' }) + '<p class="muted-text">Loading event types…</p></div>';
      const formOpen = !!state.form.id || state.busy || !!state.form.name;
      return '<div class="page-stack">'
        + ui.sectionHeading({
          eyebrow: 'Event engine', title: 'Event types',
          description: 'Each event type carries the workflow, fields, evaluation and certificate rules the rest of the app applies when an event is created from it.',
        })
        + WM.forms.formStatus(state.errors.form ? 'error' : (state.message ? 'success' : ''), state.errors.form || state.message)
        + '<div class="card-stack">' + (state.rows.length ? state.rows.map(rowCard).join('') : ui.emptyView({ title: 'No event types yet', description: 'Seeded types appear here once the server has started at least once.' })) + '</div>'
        + '<div class="card-compact">'
        + ui.sectionHeading({ eyebrow: 'Configuration', title: formOpen && state.form.id ? 'Edit event type' : 'New event type' })
        + field('et-name', 'Name', 'name', { required: true, placeholder: 'Hackathon' })
        + field('et-tagline', 'Tagline', 'tagline', { placeholder: 'Build something in a day' })
        + field('et-css', 'CSS class', 'cssClass', { placeholder: 'event-hackathon' })
        + '<div class="form-field-group"><label for="et-config">Config (JSON)<span class="form-req">*</span></label>'
        + '<div class="form-input-wrap' + (state.errors.configText ? ' form-input-error' : '') + '">'
        + '<textarea id="et-config" rows="10" placeholder="{}">' + esc(state.form.configText) + '</textarea></div>'
        + (state.errors.configText ? '<span class="field-error">' + esc(state.errors.configText) + '</span>'
          : '<span class="muted-text">Must include participation (individual|team), teamSizeMin/Max, workflow[], fields[], evaluation and certificates.rules[]. Unknown certificate rule names are rejected by the server.</span>')
        + '</div>'
        + '<label class="checkbox-field"><input id="et-replace" type="checkbox"' + (state.form.replaceConfig ? ' checked' : '') + ' /> Replace the whole config (unchecked merges keys)</label>'
        + '<div class="inline-actions">'
        + '<button class="button button-primary" data-save>' + (state.busy ? 'Saving…' : (state.form.id ? 'Save changes' : 'Create event type')) + '</button>'
        + '<button class="button button-ghost" data-template>Start from a system template</button>'
        + (state.form.id ? '<button class="button button-ghost" data-cancel>Cancel edit</button>' : '')
        + '</div></div></div>';
    }

    function wire() {
      const qa = function (sel) { try { return document.querySelectorAll(sel) || []; } catch (e) { return []; } };
      const q1 = function (sel) { try { return document.querySelector(sel); } catch (e) { return null; } };

      const nameEl = q1('#et-name'), tagEl = q1('#et-tagline'), cssEl = q1('#et-css'),
        cfgEl = q1('#et-config'), repEl = q1('#et-replace');
      if (nameEl) nameEl.addEventListener('input', function () { state.form.name = nameEl.value; });
      if (tagEl) tagEl.addEventListener('input', function () { state.form.tagline = tagEl.value; });
      if (cssEl) cssEl.addEventListener('input', function () { state.form.cssClass = cssEl.value; });
      if (cfgEl) cfgEl.addEventListener('input', function () { state.form.configText = cfgEl.value; });
      if (repEl) repEl.addEventListener('change', function () { state.form.replaceConfig = repEl.checked; });

      qa('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          const row = state.rows.filter(function (r) { return String(r.id) === b.getAttribute('data-edit'); })[0];
          if (!row) return;
          state.errors = {}; state.message = '';
          state.form = {
            id: String(row.id), name: row.name || '', tagline: row.tagline || '',
            cssClass: row.cssClass || '', configText: JSON.stringify(row.config || {}, null, 2),
            replaceConfig: false,
          };
          WM.refreshContent ? WM.refreshContent() : WM.reload();
        });
      });

      qa('[data-remove]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!global.confirm('Delete this event type? Events already using it keep their stored type.')) return;
          global.WMApi.eventTypeAdmin.remove(b.getAttribute('data-remove')).then(function () {
            WM.toast('Event type deleted.'); load();
          }, function (err) { WM.toast((err && err.message) || 'Could not delete.', 'error'); });
        });
      });

      const tpl = q1('[data-template]');
      if (tpl) tpl.addEventListener('click', function () {
        state.form.configText = JSON.stringify(templateConfig(), null, 2);
        state.errors.configText = '';
        WM.refreshContent ? WM.refreshContent() : WM.reload();
      });

      const cancel = q1('[data-cancel]');
      if (cancel) cancel.addEventListener('click', function () {
        state.form = { id: '', name: '', tagline: '', cssClass: '', configText: '', replaceConfig: false };
        state.errors = {};
        WM.refreshContent ? WM.refreshContent() : WM.reload();
      });

      const save = q1('[data-save]');
      if (save) save.addEventListener('click', function () {
        state.errors = {};
        const name = (state.form.name || '').trim();
        if (!name) state.errors.name = 'Name is required.';
        let config = {};
        try {
          config = JSON.parse(state.form.configText || '{}');
          if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('not an object');
        } catch (e) {
          state.errors.configText = 'Config must be valid JSON describing an object.';
        }
        if (Object.keys(state.errors).length) { WM.refreshContent ? WM.refreshContent() : WM.reload(); return; }
        state.busy = true;
        const payload = { name: name, tagline: (state.form.tagline || '').trim(), cssClass: (state.form.cssClass || '').trim(), config: config };
        const done = function () {
          state.busy = false;
          state.message = state.form.id ? 'Event type updated.' : 'Event type created.';
          state.form = { id: '', name: '', tagline: '', cssClass: '', configText: '', replaceConfig: false };
          load();
        };
        const fail = function (err) {
          state.busy = false;
          state.errors.form = (err && err.message) || 'Could not save the event type.';
          WM.refreshContent ? WM.refreshContent() : WM.reload();
        };
        if (state.form.id) {
          payload.replaceConfig = !!state.form.replaceConfig;
          global.WMApi.eventTypeAdmin.update(state.form.id, payload).then(done, fail);
        } else {
          global.WMApi.eventTypeAdmin.create(payload).then(done, fail);
        }
      });
    }

    function load() {
      state.loading = true;
      state.error = '';
      return global.WMApi.eventTypes.list().then(function (rows) {
        state.rows = Array.isArray(rows) ? rows : [];
        state.loading = false;
      }, function (err) {
        state.rows = [];
        state.loading = false;
        state.errors = { form: (err && err.message) || 'Could not load event types.' };
      });
    }

    WM.page({ route: '/event-types', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.eventTypeAdmin = eventTypeAdmin;
})(window);
