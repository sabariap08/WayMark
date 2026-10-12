/* Create-event wizard — 5-step guided event setup (route /wizard) */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  function wizardPage() {
    const F = WM.forms;
    const FALLBACK_CATEGORIES = ['Hackathon', 'Workshop', 'Seminar', 'Sports', 'Cultural', 'Community'];
    const STEPS = ['Basics', 'Schedule & venue', 'Capacity & registration', 'Evaluation & certificates', 'Review & submit'];

    const state = {
      step: 1,
      title: '', category: '', tags: '', description: '',
      date: '', time: '', location: '', regDeadline: '',
      capacity: '', contactEmail: '', attendanceRequired: true,
      juryEnabled: false, rubric: '', certificatesEnabled: true, feedbackEnabled: true,
      agenda: '', errors: {}, draftLoading: false, submitting: false,
    };

    function categories() {
      const cats = (D.eventCategories || []).filter(function (c) { return c !== 'All categories'; });
      return cats.length ? cats : FALLBACK_CATEGORIES;
    }

    function rubricOptions() {
      const names = (D.rubrics || []).map(function (r) { return r.rubricName || r.name; }).filter(Boolean);
      return names.length ? names : ['No rubric configured'];
    }

    function load() {
      return D.ready().then(function () {
        if (!state.category) state.category = categories()[0];
        const user = WM.Auth && WM.Auth.getUser ? WM.Auth.getUser() : null;
        if (!state.contactEmail && user && user.email) state.contactEmail = user.email;
        return null;
      });
    }

    function stepsBar() {
      const items = STEPS.map(function (label, i) {
        const n = i + 1;
        const done = n < state.step;
        const active = n === state.step;
        const cls = 'wizard-step' + (done ? ' wizard-step-done' : '') + (active ? ' wizard-step-active' : '');
        const num = done ? ic('check', 11, 'stroke-width="3"') : n;
        return '<div class="' + cls + '"><span class="wizard-step-num">' + num + '</span>' + esc(label) + '</div>';
      }).join('');
      return '<div class="wizard-steps">' + items + '</div>';
    }

    function stepBasics() {
      return F.textField({ id: 'wiz-title', label: 'Event title', value: state.title, required: true, error: state.errors.title, placeholder: 'e.g. Zero Origin Hackathon' })
        + F.selectInput({ id: 'wiz-category', label: 'Category', value: state.category, options: categories(), icon: ic('tag', 16) })
        + F.textField({ id: 'wiz-tags', label: 'Tags (comma-separated)', value: state.tags, icon: ic('tag', 16), placeholder: 'ai, sustainability, civic-tech' })
        + F.textArea({ id: 'wiz-description', label: 'Description', value: state.description, rows: 4, placeholder: 'Describe your event, goals, and what participants can expect...' });
    }

    function stepSchedule() {
      return '<div class="form-grid-2">'
        + F.textField({ id: 'wiz-date', label: 'Event date', value: state.date, required: true, error: state.errors.date, type: 'date', icon: ic('calendar', 16) })
        + F.textField({ id: 'wiz-time', label: 'Start time', value: state.time, type: 'time' })
        + '</div>'
        + F.textField({ id: 'wiz-location', label: 'Location / venue', value: state.location, required: true, error: state.errors.location, icon: ic('map-pin', 16), placeholder: 'e.g. Innovation Hub, San Francisco' })
        + F.textField({ id: 'wiz-reg-deadline', label: 'Registration deadline', value: state.regDeadline, type: 'date', icon: ic('ticket-check', 16) });
    }

    function stepCapacity() {
      return '<div class="form-grid-2">'
        + F.textField({ id: 'wiz-capacity', label: 'Capacity', value: state.capacity, type: 'number', icon: ic('users', 16), placeholder: 'e.g. 100' })
        + F.textField({ id: 'wiz-contact', label: 'Contact email', value: state.contactEmail, type: 'email', icon: ic('mail', 16), placeholder: 'you@example.com' })
        + '</div>'
        + F.toggleField({ id: 'wiz-attendance', label: 'Require attendance check-in', checked: state.attendanceRequired, hint: 'Participants must check in to receive certificates.' });
    }

    function stepEvaluation() {
      return F.toggleField({ id: 'wiz-jury', label: 'Enable jury evaluation', checked: state.juryEnabled, hint: 'Assign jury members to score participant submissions.' })
        + (state.juryEnabled ? F.selectInput({ id: 'wiz-rubric', label: 'Rubric', value: state.rubric, options: rubricOptions(), icon: ic('list-checks', 16) }) : '')
        + F.toggleField({ id: 'wiz-cert', label: 'Issue certificates', checked: state.certificatesEnabled, hint: 'Automatically generate certificates for eligible participants.' })
        + F.toggleField({ id: 'wiz-feedback', label: 'Collect feedback', checked: state.feedbackEnabled, hint: 'Send a feedback form after the event concludes.' });
    }

    function reviewSummary() {
      const facts = [
        ['Title', state.title || '\u2014'],
        ['Category', state.category || '\u2014'],
        ['Tags', state.tags || '\u2014'],
        ['Description', state.description || '\u2014'],
        ['Date', state.date || '\u2014'],
        ['Time', state.time || '\u2014'],
        ['Location', state.location || '\u2014'],
        ['Registration deadline', state.regDeadline || '\u2014'],
        ['Capacity', state.capacity || '\u2014'],
        ['Contact email', state.contactEmail || '\u2014'],
        ['Attendance required', state.attendanceRequired ? 'Yes' : 'No'],
        ['Jury evaluation', state.juryEnabled ? 'Enabled' : 'Disabled'],
        ['Rubric', state.juryEnabled ? (state.rubric || '\u2014') : '\u2014'],
        ['Certificates', state.certificatesEnabled ? 'Enabled' : 'Disabled'],
        ['Feedback', state.feedbackEnabled ? 'Enabled' : 'Disabled'],
      ];
      return '<div class="fact-grid">' + facts.map(function (f) {
        return '<div class="fact-item"><span>' + esc(f[0]) + '</span><strong>' + esc(f[1]) + '</strong></div>';
      }).join('') + '</div>';
    }

    function stepReview() {
      return reviewSummary();
    }

    function stepBody() {
      switch (state.step) {
        case 2: return stepSchedule();
        case 3: return stepCapacity();
        case 4: return stepEvaluation();
        case 5: return stepReview();
        default: return stepBasics();
      }
    }

    function actions() {
      if (state.step >= 5) {
        return '<div class="wizard-actions">'
          + '<button type="button" class="button button-secondary" data-wiz="back">' + ic('arrow-left', 15) + ' Back</button>'
          + '<div class="heading-actions">'
          + '<button type="button" class="button button-secondary" data-wiz="ai">' + ic('sparkles', 15) + ' Draft with AI</button>'
          + '<button type="button" class="button button-secondary" data-wiz="draft"' + (state.draftLoading ? ' disabled' : '') + '>' + ic('save', 15) + ' Save draft</button>'
          + '<button type="button" class="button button-primary" data-wiz="submit"' + (state.submitting ? ' disabled' : '') + '>' + ic('check', 15) + ' Submit for approval</button>'
          + '</div></div>';
      }
      return '<div class="wizard-actions">'
        + (state.step > 1
          ? '<button type="button" class="button button-secondary" data-wiz="back">' + ic('arrow-left', 15) + ' Back</button>'
          : '<span></span>')
        + '<button type="button" class="button button-primary" data-wiz="next">Continue ' + ic('chevron-right', 15) + '</button>'
        + '</div>';
    }

    function render() {
      return '<div class="page-stack">'
        + '<div class="welcome-row"><div><div class="eyebrow">Host workspace</div><h1>Create event</h1>'
        + '<p class="lede">Set up your event in five guided steps.</p></div></div>'
        + '<section class="panel">' + stepsBar()
        + '<div class="wizard-body">' + stepBody() + '</div>'
        + actions() + '</section></div>';
    }

    function refresh(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function validate() {
      const e = {};
      if (!state.title.trim()) e.title = 'Event title is required.';
      if (!state.date) e.date = 'Event date is required.';
      if (!state.location.trim()) e.location = 'Location is required.';
      return e;
    }

    function validateStep(step) {
      const e = {};
      if (step === 1 && !state.title.trim()) e.title = 'Event title is required.';
      if (step === 2) {
        if (!state.date) e.date = 'Event date is required.';
        if (!state.location.trim()) e.location = 'Location is required.';
      }
      state.errors = e;
      return Object.keys(e).length === 0;
    }

    function payload(statusValue) {
      const user = WM.Auth && WM.Auth.getUser ? WM.Auth.getUser() : null;
      return {
        title: state.title.trim(),
        category: state.category,
        tags: state.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
        description: state.description.trim(),
        date: state.date,
        time: state.time,
        location: state.location.trim(),
        regDeadline: state.regDeadline,
        capacity: Number(state.capacity) || 0,
        contactEmail: state.contactEmail.trim(),
        attendanceRequired: state.attendanceRequired,
        juryEnabled: state.juryEnabled,
        rubric: state.rubric,
        certificatesEnabled: state.certificatesEnabled,
        feedbackEnabled: state.feedbackEnabled,
        organizer: user && user.name ? user.name : '',
        status: statusValue,
      };
    }

    function createdId(data) {
      if (!data || typeof data !== 'object') return '';
      if (data.id) return data.id;
      if (data.event && data.event.id) return data.event.id;
      return '';
    }

    function draftAI() {
      const brief = (state.title + ' ' + state.description).trim();
      global.WMApi.ai.draftEvent({ brief: brief }).then(
        function (data) {
          const resp = data || {};
          const draft = resp.draft || resp.event || resp;
          if (draft && typeof draft === 'object') {
            if (!state.description && draft.description) state.description = draft.description;
            if (!state.title && draft.title) state.title = draft.title;
            if (!state.location && draft.location) state.location = draft.location;
            if (!state.agenda && draft.agenda) {
              state.agenda = Array.isArray(draft.agenda) ? draft.agenda.join(', ') : String(draft.agenda);
            }
          }
          WM.toast('Draft generated');
          refresh();
        },
        function (err) {
          WM.toast((err && err.message) || 'Something went wrong.', 'error');
        }
      );
    }

    function saveDraft() {
      const e = validate();
      state.errors = e;
      if (Object.keys(e).length) { WM.toast('Please complete the required fields.', 'error'); refresh(); return; }
      state.draftLoading = true; refresh();
      global.WMApi.events.create(payload('draft')).then(
        function () {
          WM.toast('Draft saved.');
          window.location.href = 'events.html';
        },
        function (err) {
          state.draftLoading = false; refresh();
          WM.toast((err && err.message) || 'Something went wrong.', 'error');
        }
      );
    }

    function submitEvent() {
      const e = validate();
      state.errors = e;
      if (Object.keys(e).length) { WM.toast('Please complete the required fields.', 'error'); refresh(); return; }
      state.submitting = true; refresh();
      global.WMApi.events.create(payload('draft')).then(function (data) {
        return global.WMApi.events.submit(createdId(data));
      }).then(
        function () {
          WM.toast('Event submitted for approval.');
          window.location.href = 'events.html';
        },
        function (err) {
          state.submitting = false; refresh();
          WM.toast((err && err.message) || 'Something went wrong.', 'error');
        }
      );
    }

    const texts = {
      'wiz-title': 'title', 'wiz-tags': 'tags', 'wiz-description': 'description', 'wiz-date': 'date',
      'wiz-time': 'time', 'wiz-location': 'location', 'wiz-reg-deadline': 'regDeadline',
      'wiz-capacity': 'capacity', 'wiz-contact': 'contactEmail',
    };
    const toggles = {
      'wiz-attendance': 'attendanceRequired', 'wiz-jury': 'juryEnabled',
      'wiz-cert': 'certificatesEnabled', 'wiz-feedback': 'feedbackEnabled',
    };
    const selects = { 'wiz-category': 'category', 'wiz-rubric': 'rubric' };

    function wire() {
      Object.keys(texts).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', function () {
          state[texts[id]] = el.value;
          if (state.errors[texts[id]]) { state.errors[texts[id]] = undefined; refresh(id, el.selectionStart); }
        });
      });
      Object.keys(selects).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', function () { state[selects[id]] = el.value; refresh(); });
      });
      Object.keys(toggles).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', function () { state[toggles[id]] = !state[toggles[id]]; refresh(); });
      });
      document.querySelectorAll('[data-wiz]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-wiz');
          if (action === 'next') {
            if (validateStep(state.step)) { state.step = Math.min(5, state.step + 1); state.errors = {}; }
            refresh();
          } else if (action === 'back') {
            state.step = Math.max(1, state.step - 1); state.errors = {}; refresh();
          } else if (action === 'ai') { draftAI(); }
          else if (action === 'draft') { saveDraft(); }
          else if (action === 'submit') { submitEvent(); }
        });
      });
    }

    WM.page({ route: '/wizard', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.wizard = wizardPage;
})(window);
