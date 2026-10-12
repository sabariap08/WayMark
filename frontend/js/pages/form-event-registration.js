/* Event registration form — ports pages/forms/EventRegistrationForm.tsx */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, F = WM.forms, ui = WM.ui;

  function eventRegistration() {
    const s = {
      eventId: '', eventTitle: '', eventStatus: 'Registration open', eventTone: 'green',
      eventType: 'Hackathon', fullName: '', email: '', phone: '', org: '',
      teamName: '', teamSize: '1', experienceLevel: '', dietaryPref: '', track: '', posterTopic: '',
      accommodation: false, transport: false, agree: false, agreeCode: false,
      errors: {}, status: 'idle', statusMsg: '', loading: false,
    };

    function applyUser(user) {
      if (!user) return;
      const u = user.user || user.profile || user;
      s.fullName = u.name || u.fullName || s.fullName;
      s.email = u.email || s.email;
      s.phone = u.phone || s.phone;
      s.org = u.org || s.org;
    }

    function load() {
      return D.ready().then(function () {
        const params = new URLSearchParams(global.location.search);
        const id = params.get('event');
        const event = (id && D.events.find(function (e) { return String(e.id) === id; })) || D.events[0] || null;
        if (event) {
          s.eventId = event.id;
          s.eventTitle = event.title;
          s.eventStatus = event.status || 'Registration open';
          s.eventTone = event.tone || 'green';
          if (event.category) s.eventType = event.category;
        }
        const user = WM.Auth.getUser();
        if (user) applyUser(user);
        if (!s.email) return global.WMApi.users.me().then(applyUser, function () { /* optional */ });
        return null;
      });
    }

    function payload() {
      return {
        eventId: s.eventId,
        fullName: s.fullName, email: s.email, phone: s.phone, org: s.org,
        eventType: s.eventType, teamName: s.teamName, teamSize: s.teamSize,
        experienceLevel: s.experienceLevel, dietaryPref: s.dietaryPref, track: s.track,
        posterTopic: s.posterTopic, accommodation: s.accommodation, transport: s.transport,
      };
    }

    function render() {
      if (s.status === 'success') {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('file-text', 24) + '</div>'
          + '<h3>Registration complete</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<button class="button button-secondary" data-reset-registration>Register for another event</button></div>';
      }

      let conditional = '';
      if (s.eventType === 'Hackathon') {
        conditional = F.formSection({ title: 'Hackathon details', eyebrow: 'Team & track', children:
          '<div class="form-grid-2">'
          + F.textField({ id: 'reg-team', label: 'Team name', value: s.teamName, required: true, error: s.errors.teamName })
          + F.selectInput({ id: 'reg-team-size', label: 'Team size', value: s.teamSize, options: ['1', '2', '3', '4', '5', '6'] })
          + '</div>'
          + F.radioGroup({ id: 'reg-exp', label: 'Experience level', value: s.experienceLevel, required: true, error: s.errors.experienceLevel, columns: 3, options: [
            { value: 'beginner', label: 'Beginner', detail: 'First or second hackathon' },
            { value: 'intermediate', label: 'Intermediate', detail: '3-5 hackathons' },
            { value: 'advanced', label: 'Advanced', detail: '6+ hackathons' }] })
          + F.radioGroup({ id: 'reg-track', label: 'Preferred track', value: s.track, required: true, error: s.errors.track, columns: 3, options: [
            { value: 'ai-ml', label: 'AI & ML', detail: 'Machine learning projects' },
            { value: 'sustainability', label: 'Sustainability', detail: 'Climate & environment' },
            { value: 'civic-tech', label: 'Civic tech', detail: 'Community impact' }] })
          + '<div class="form-field-group"><div class="form-field-label-row"><label>Team portfolio link<span class="form-req">*</span></label><span class="form-hint">GitHub, Google Drive, or similar</span></div>'
          + '<div class="form-input-wrap">' + ic('link-2', 16) + '<input placeholder="https://..." /></div></div>'
          + F.checkboxField({ id: 'reg-code', label: 'I agree to the hackathon code of conduct', checked: s.agreeCode, hint: 'All team members must comply with the code of conduct.' })
          + (s.errors.agreeCode ? '<span class="field-error">' + WM.esc(s.errors.agreeCode) + '</span>' : '') });
      } else if (s.eventType === 'Workshop') {
        conditional = F.formSection({ title: 'Workshop details', eyebrow: 'Session preferences', children:
          F.radioGroup({ id: 'reg-ws-exp', label: 'Experience level', value: s.experienceLevel, required: true, error: s.errors.experienceLevel, columns: 3, options: [
            { value: 'beginner', label: 'Beginner', detail: 'New to the topic' },
            { value: 'intermediate', label: 'Intermediate', detail: 'Some experience' },
            { value: 'advanced', label: 'Advanced', detail: 'Deep knowledge' }] })
          + F.selectInput({ id: 'reg-diet', label: 'Dietary preferences', value: s.dietaryPref, options: ['No preference', 'Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Kosher'], hint: 'For catered sessions' }) });
      } else if (s.eventType === 'Conference') {
        conditional = F.formSection({ title: 'Conference details', eyebrow: 'Presentation', children:
          F.textField({ id: 'reg-poster', label: 'Poster / talk topic', value: s.posterTopic, required: true, error: s.errors.posterTopic, hint: 'If presenting; otherwise enter \u2018Attending only\u2019' })
          + F.selectInput({ id: 'reg-session', label: 'Preferred session track', value: s.track, options: ['No preference', 'Research', 'Industry', 'Student', 'Community'] }) });
      } else if (s.eventType === 'Community') {
        conditional = F.formSection({ title: 'Community meetup', eyebrow: 'Details', children:
          F.textArea({ id: 'reg-topics', label: 'Topics you\u2019d like to discuss', value: s.posterTopic, rows: 3, hint: 'Help the organizer plan the agenda' }) });
      }

      return '<div class="page-stack">'
        + '<div class="section-heading"><div><span class="eyebrow">Event registration</span><h2>'
        + (s.eventTitle ? 'Register for: ' + WM.esc(s.eventTitle) : 'Register for an event') + '</h2></div>'
        + (s.eventStatus ? ui.badge(s.eventStatus, s.eventTone) : '') + '</div>'
        + F.formSection({ title: 'Event type', eyebrow: 'Format', children:
          F.radioGroup({ id: 'reg-type', label: 'Select your event type', value: s.eventType, columns: 4, options: [
            { value: 'Hackathon', label: 'Hackathon', detail: 'Team competition' },
            { value: 'Workshop', label: 'Workshop', detail: 'Learning session' },
            { value: 'Conference', label: 'Conference', detail: 'Talks & posters' },
            { value: 'Community', label: 'Community', detail: 'Meetup' }] }) })
        + F.formSection({ title: 'Participant details', eyebrow: 'Your information', children:
          '<div class="form-grid-2">'
          + F.textField({ id: 'reg-name', label: 'Full name', value: s.fullName, required: true, error: s.errors.fullName })
          + F.textField({ id: 'reg-email', label: 'Email address', value: s.email, required: true, type: 'email', error: s.errors.email })
          + F.textField({ id: 'reg-phone', label: 'Phone number', value: s.phone, hint: 'Optional, for reminders' })
          + F.textField({ id: 'reg-org', label: 'Organization / school', value: s.org })
          + '</div>' })
        + conditional
        + F.formSection({ title: 'Logistics', eyebrow: 'Support', children:
          F.toggleField({ id: 'reg-accom', label: 'Request accommodation', checked: s.accommodation, hint: 'For multi-day events requiring overnight stay.' })
          + F.toggleField({ id: 'reg-transport', label: 'Request transport assistance', checked: s.transport, hint: 'Shuttle or travel stipend for eligible participants.' }) })
        + F.formSection({ title: 'Terms & consent', eyebrow: 'Agreement', children:
          F.checkboxField({ id: 'reg-agree', label: 'I accept the participation terms and event guidelines', checked: s.agree })
          + (s.errors.agree ? '<span class="field-error">' + WM.esc(s.errors.agree) + '</span>' : '') })
        + F.formStatus(s.status, s.statusMsg)
        + F.formActions({ submitLabel: 'Confirm registration', saveLabel: 'Save draft', loading: s.loading })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function validate() {
      const e = {};
      if (!s.fullName.trim()) e.fullName = 'Full name is required.';
      if (!s.email.trim()) e.email = 'Email is required.';
      else if (!/^\S+@\S+\.\S+$/.test(s.email)) e.email = 'Enter a valid email address.';
      if (s.eventType === 'Hackathon') {
        if (!s.teamName.trim()) e.teamName = 'Team name is required for hackathons.';
        if (!s.experienceLevel) e.experienceLevel = 'Please select your experience level.';
        if (!s.track) e.track = 'Please select a track.';
        if (!s.agreeCode) e.agreeCode = 'You must agree to the code of conduct.';
      }
      if (s.eventType === 'Workshop' && !s.experienceLevel) e.experienceLevel = 'Please select your experience level.';
      if (s.eventType === 'Conference' && !s.posterTopic.trim()) e.posterTopic = 'Poster topic is required for conferences.';
      if (!s.agree) e.agree = 'You must accept the participation terms.';
      return e;
    }

    const map = {
      'reg-name': 'fullName', 'reg-email': 'email', 'reg-phone': 'phone', 'reg-org': 'org',
      'reg-team': 'teamName', 'reg-team-size': 'teamSize', 'reg-diet': 'dietaryPref',
      'reg-poster': 'posterTopic', 'reg-session': 'track', 'reg-topics': 'posterTopic',
    };
    const toggles = { 'reg-accom': 'accommodation', 'reg-transport': 'transport' };

    function wire() {
      Object.keys(map).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', function () {
          const key = map[id]; s[key] = el.value;
          if (s.errors[key]) { s.errors[key] = undefined; draw(id, el.selectionStart); }
        });
        if (el) el.addEventListener('change', function () { s[map[id]] = el.value; draw(); });
      });
      Object.keys(toggles).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', function () { s[toggles[id]] = !s[toggles[id]]; draw(); });
      });
      document.querySelectorAll('[data-radio]').forEach(function (b) {
        b.addEventListener('click', function () {
          const group = b.getAttribute('data-radio'), val = b.getAttribute('data-value');
          if (group === 'reg-type') { s.eventType = val; s.errors = {}; }
          else if (group === 'reg-exp' || group === 'reg-ws-exp') { s.experienceLevel = val; s.errors.experienceLevel = undefined; }
          else if (group === 'reg-track') { s.track = val; s.errors.track = undefined; }
          draw();
        });
      });
      ['reg-code', 'reg-agree'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', function () {
          if (id === 'reg-code') { s.agreeCode = !s.agreeCode; s.errors.agreeCode = undefined; }
          else { s.agree = !s.agree; s.errors.agree = undefined; }
          draw();
        });
      });
      const reset = document.querySelector('[data-reset-registration]');
      if (reset) reset.addEventListener('click', function () { s.status = 'idle'; s.statusMsg = ''; draw(); });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-action');
          if (action === 'save') {
            s.loading = true; s.status = 'loading'; draw();
            global.WMApi.registrations.create(Object.assign(payload(), { status: 'Draft' })).then(function () {
              s.loading = false; s.status = 'success';
              s.statusMsg = 'Draft saved. You can return to complete your registration later.';
              draw();
            }, function (err) {
              s.loading = false; s.status = 'error';
              s.statusMsg = (err && err.message) || 'We could not save your draft. Please try again.';
              draw();
            });
          } else if (action === 'submit') {
            const e = validate(); s.errors = e;
            if (Object.keys(e).length) { draw(); return; }
            s.loading = true; s.status = 'loading'; draw();
            global.WMApi.registrations.create(payload()).then(function (data) {
              s.loading = false; s.status = 'success';
              const code = data && (data.ticketCode || data.ticket_code);
              s.statusMsg = 'Registration confirmed!' + (code ? ' Your ticket code is ' + code + '.' : ' A confirmation email has been sent.');
              draw();
            }, function (err) {
              s.loading = false; s.status = 'error';
              s.statusMsg = (err && err.message) || 'We could not complete your registration. Please try again.';
              draw();
            });
          }
        });
      });
    }

    WM.page({ route: '/forms/event-registration', render: render, mounted: function () { wire(); }, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.eventRegistration = eventRegistration;
})(window);