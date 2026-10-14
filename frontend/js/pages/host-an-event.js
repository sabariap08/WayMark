/* Host an Event — a Normal User submits a hosting request that an Admin
 * reviews. A hosting request is not a role; every signed-in user may submit. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  function hostAnEvent() {
    const blank = function () {
      return { title: '', category: 'Community', description: '', date: '', time: '', location: '',
        organizer: '', contactEmail: '', seats: 50, regDeadline: '', fee: 'Free', tags: '', requirements: '' };
    };
    const state = {
      form: blank(), requests: [],
      categories: ['Hackathon', 'Workshop', 'Conference', 'Competition', 'Community'],
      errors: {}, message: '', submitting: false,
    };

    function payload() {
      const f = state.form;
      return {
        title: f.title.trim(), category: f.category, description: f.description.trim(),
        date: f.date.trim(), time: f.time.trim(), location: f.location.trim(),
        organizer: f.organizer.trim(), contactEmail: f.contactEmail.trim(),
        seats: parseInt(f.seats, 10) || 50, regDeadline: f.regDeadline.trim(), fee: f.fee.trim(),
        tags: String(f.tags).split(',').map(function (t) { return t.trim(); }).filter(Boolean),
        requirements: String(f.requirements).split(',').map(function (t) { return t.trim(); }).filter(Boolean),
      };
    }

    function field(id, label, key, opts) {
      opts = opts || {};
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label) + (opts.required ? '<span class="form-req">*</span>' : '') + '</label>'
        + '<div class="form-input-wrap' + (state.errors[key] ? ' form-input-error' : '') + '">'
        + '<input id="' + id + '" type="' + (opts.type || 'text') + '" placeholder="' + esc(opts.placeholder || '') + '" value="' + esc(state.form[key]) + '" />'
        + '</div>'
        + (state.errors[key] ? '<span class="field-error">' + esc(state.errors[key]) + '</span>' : '') + '</div>';
    }

    function listRows() {
      if (!state.requests.length) return ui.emptyView({ title: 'No hosting requests yet', description: 'Submit one above to get started.' });
      const head = '<div class="table-head"><span>Event</span><span>Date</span><span>Status</span><span></span></div>';
      const rows = state.requests.map(function (r) {
        const tone = r.status === 'Approved' ? 'green' : r.status === 'Rejected' ? 'red' : r.status === 'Pending' ? 'amber' : 'blue';
        const action = r.status === 'Approved'
          ? '<a class="row-action" href="event-detail.html?id=' + encodeURIComponent(r.eventId || '') + '">Open event ' + ic('chevron-right', 14) + '</a>'
          : (r.status === 'Changes requested' || r.status === 'Rejected')
            ? '<button class="button button-secondary" data-resubmit="' + esc(r.id) + '">Resubmit</button>'
            : '<button class="button button-secondary" data-cancel="' + esc(r.id) + '">Cancel</button>';
        const reason = r.decisionReason ? '<small>Reviewer: ' + esc(r.decisionReason) + '</small>' : '';
        return '<div class="table-row"><div class="table-event"><strong>' + esc(r.title) + '</strong>'
          + '<small>' + esc(r.category) + '</small>' + reason + '</div>'
          + '<span>' + esc(r.date || '—') + '</span>' + ui.badge(r.status, tone) + action + '</div>';
      }).join('');
      return '<section class="panel table-panel">' + head + rows + '</section>';
    }

    function render() {
      const catOptions = state.categories.map(function (c) {
        return '<option' + (c === state.form.category ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Host an Event', title: 'Submit a hosting request',
          action: '<a class="button button-secondary" href="my-hosted-events.html">My hosted events ' + ic('chevron-right', 15) + '</a>' })
        + '<div class="queue-callout"><div class="callout-icon">' + ic('info', 20) + '</div>'
        + '<div><strong>How hosting works</strong><span>Tell us about your event. An admin reviews it and, once approved, it goes live under your account.</span></div></div>'
        + '<form class="panel" id="host-form">'
        + '<div class="form-grid">'
        + field('host-title', 'Event title', 'title', { required: true, placeholder: 'Open Source Maintainers Meetup' })
        + '<div class="form-field-group"><label for="host-category">Category</label>'
        + '<div class="form-input-wrap"><select id="host-category">' + catOptions + '</select></div></div>'
        + field('host-date', 'Date', 'date', { placeholder: 'Jan 22, 2027' })
        + field('host-time', 'Time', 'time', { placeholder: '18:00 - 21:00' })
        + field('host-location', 'Location / venue', 'location', { placeholder: 'Cubbon Pavilion, Bengaluru' })
        + field('host-seats', 'Capacity (seats)', 'seats', { type: 'number' })
        + field('host-organizer', 'Organizer', 'organizer', { placeholder: 'Your name or team' })
        + field('host-contact', 'Contact email', 'contactEmail', { type: 'email', placeholder: 'you@example.com' })
        + field('host-fee', 'Fee', 'fee', { placeholder: 'Free' })
        + field('host-deadline', 'Registration deadline', 'regDeadline', { placeholder: 'Jan 18, 2027' })
        + '</div>'
        + '<div class="form-field-group"><label for="host-description">Description</label>'
        + '<textarea id="host-description" rows="4" placeholder="What is this event about?">' + esc(state.form.description) + '</textarea></div>'
        + '<div class="form-field-group"><label for="host-tags">Tags</label>'
        + '<input id="host-tags" placeholder="Comma separated, e.g. Open source, Community" value="' + esc(state.form.tags) + '" /></div>'
        + '<div class="form-field-group"><label for="host-requirements">Requirements</label>'
        + '<input id="host-requirements" placeholder="Comma separated, e.g. Laptop, ID" value="' + esc(state.form.requirements) + '" /></div>'
        + (state.errors.form ? '<div class="form-error">' + esc(state.errors.form) + '</div>' : '')
        + (state.message ? '<div class="form-info">' + esc(state.message) + '</div>' : '')
        + '<div class="modal-actions"><button type="submit" class="button button-primary"' + (state.submitting ? ' disabled' : '') + '>'
        + (state.submitting ? '<span class="loading-spinner"></span> Submitting…' : 'Submit hosting request ' + ic('arrow-right', 16)) + '</button></div>'
        + '</form>'
        + '<h2 class="section-title">Your hosting requests</h2>'
        + listRows()
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function reload() {
      return global.WMApi.hosting.list().then(function (list) {
        state.requests = Array.isArray(list) ? list : [];
        refresh();
      });
    }

    function wire() {
      const bind = function (id, key) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', function () { state.form[key] = el.value; state.errors[key] = undefined; });
      };
      bind('host-title', 'title'); bind('host-date', 'date'); bind('host-time', 'time');
      bind('host-location', 'location'); bind('host-seats', 'seats'); bind('host-organizer', 'organizer');
      bind('host-contact', 'contactEmail'); bind('host-fee', 'fee'); bind('host-deadline', 'regDeadline');
      bind('host-description', 'description'); bind('host-tags', 'tags'); bind('host-requirements', 'requirements');
      const cat = document.getElementById('host-category');
      if (cat) cat.addEventListener('change', function () { state.form.category = cat.value; });
      const form = document.getElementById('host-form');
      if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        const errs = {};
        if (!state.form.title.trim()) errs.title = 'Event title is required.';
        if (!state.form.date.trim()) errs.date = 'A date helps reviewers schedule the event.';
        state.errors = errs; state.message = '';
        if (Object.keys(errs).length) { refresh(); return; }
        state.submitting = true; refresh();
        global.WMApi.hosting.create(payload()).then(function () {
          state.submitting = false;
          state.form = blank();
          state.message = 'Hosting request submitted. An admin will review it shortly.';
          return reload();
        }, function (err) {
          state.submitting = false;
          state.errors = { form: (err && err.message) || 'Could not submit the request.' };
          refresh();
        });
      });
      document.querySelectorAll('[data-cancel]').forEach(function (b) {
        b.addEventListener('click', function () {
          global.WMApi.hosting.cancel(b.getAttribute('data-cancel')).then(function () { WM.toast('Hosting request cancelled.'); reload(); },
            function (err) { WM.toast((err && err.message) || 'Could not cancel.', 'error'); });
        });
      });
      document.querySelectorAll('[data-resubmit]').forEach(function (b) {
        b.addEventListener('click', function () {
          global.WMApi.hosting.resubmit(b.getAttribute('data-resubmit'), {}).then(function () { WM.toast('Hosting request resubmitted.'); reload(); },
            function (err) { WM.toast((err && err.message) || 'Could not resubmit.', 'error'); });
        });
      });
    }

    function load() {
      return global.WMApi.hosting.list().then(function (list) {
        state.requests = Array.isArray(list) ? list : [];
      }, function () { state.requests = []; });
    }

    WM.page({ route: '/host-an-event', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.hostAnEvent = hostAnEvent;
})(window);
