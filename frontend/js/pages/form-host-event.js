/* Host event creation + admin approval forms — ports HostEventForms.tsx */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, F = WM.forms, ui = WM.ui;

  function hostEvent() {
    const s = {
      mode: 'edit', title: '', eventType: '', category: 'Hackathon', description: '',
      startDate: '', endDate: '', startTime: '', endTime: '', location: '', format: '',
      capacity: '50', regDeadline: '', organizer: 'Maya Chen', contactEmail: 'maya@waymark.events',
      website: '', tags: '', certificates: true, juryEnabled: false, feedbackEnabled: true,
      attendanceRequired: true, agreeRules: false, errors: {}, status: 'idle', statusMsg: '', loading: false,
    };

    function eventPreview() {
      const row = function (label, val) { return '<div class="preview-row"><span>' + label + '</span><strong>' + (val || '\u2014') + '</strong></div>'; };
      return row('Event title', s.title)
        + row('Type', s.eventType) + row('Category', s.category) + row('Format', s.format)
        + row('Date', s.startDate ? (s.startDate + ' \u2192 ' + (s.endDate || '\u2014')) : '')
        + row('Time', s.startTime ? (s.startTime + ' \u2014 ' + (s.endTime || '\u2014')) : '')
        + row('Location', s.location) + row('Capacity', s.capacity)
        + row('Reg. deadline', s.regDeadline) + row('Contact', s.contactEmail)
        + '<div class="preview-row preview-desc"><span>Description</span><p>' + (s.description || '\u2014') + '</p></div>'
        + '<div class="preview-flags">'
        + (s.certificates ? ui.badge('Certificates', 'green') : '')
        + (s.juryEnabled ? ui.badge('Jury evaluation', 'blue') : '')
        + (s.feedbackEnabled ? ui.badge('Feedback enabled', 'amber') : '')
        + (s.attendanceRequired ? ui.badge('Attendance required', 'slate') : '')
        + '</div>';
    }

    function render() {
      if (s.status === 'success' && s.mode === 'edit') {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('check', 24) + '</div>'
          + '<h3>Event submitted</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<div class="form-success-actions">'
          + '<button class="button button-secondary" data-action="reset">Create another</button>'
          + '<button class="button button-primary">View in my events ' + ic('chevron-right', 16) + '</button>'
          + '</div></div>';
      }

      const heading = '<div class="section-heading"><div><span class="eyebrow">Host workspace</span><h2>Create event</h2></div>'
        + '<div class="form-mode-toggle">'
        + '<button class="' + (s.mode === 'edit' ? 'active' : '') + '" data-mode="edit">' + ic('pencil', 14) + ' Edit</button>'
        + '<button class="' + (s.mode === 'preview' ? 'active' : '') + '" data-mode="preview">' + ic('eye', 14) + ' Preview</button>'
        + '</div></div>';

      if (s.mode === 'preview') {
        return '<div class="page-stack">' + heading
          + '<div class="form-preview-stack">'
          + F.formPreviewCard({ title: s.title || 'Untitled event', children: eventPreview() })
          + F.formStatus(s.status, s.statusMsg)
          + F.formActions({ onSave: true, onSubmit: true, loading: s.loading, submitLabel: 'Submit for approval', saveLabel: 'Save draft', showCancel: false })
          + '</div></div>';
      }

      return '<div class="page-stack">' + heading
        + F.formSection({ title: 'Event basics', eyebrow: 'Step 1', children:
          F.textField({ id: 'he-title', label: 'Event title', value: s.title, required: true, error: s.errors.title, placeholder: 'e.g. Zero Origin Hackathon' })
          + '<div class="form-grid-2">'
          + F.radioGroup({ id: 'he-type', label: 'Event type', value: s.eventType, required: true, error: s.errors.eventType, columns: 4, options: [
            { value: 'Hackathon', label: 'Hackathon' }, { value: 'Workshop', label: 'Workshop' },
            { value: 'Conference', label: 'Conference' }, { value: 'Community', label: 'Community' }] })
          + '</div>'
          + F.selectInput({ id: 'he-category', label: 'Category', value: s.category, options: ['Hackathon', 'Workshop', 'Conference', 'Community', 'Competition', 'Other'], icon: ic('tag', 16) })
          + F.textArea({ id: 'he-desc', label: 'Description', value: s.description, required: true, error: s.errors.description, rows: 4, maxLength: 1000, hint: 'Minimum 30 characters. This will be shown on the event page.', placeholder: 'Describe your event, goals, and what participants can expect...' }) })
        + F.formSection({ title: 'Date & time', eyebrow: 'Step 2', children:
          '<div class="form-grid-2">'
          + F.textField({ id: 'he-start-date', label: 'Start date', value: s.startDate, required: true, error: s.errors.startDate, type: 'date', icon: ic('calendar', 16) })
          + F.textField({ id: 'he-end-date', label: 'End date', value: s.endDate, required: true, error: s.errors.endDate, type: 'date', icon: ic('calendar', 16) })
          + F.textField({ id: 'he-start-time', label: 'Start time', value: s.startTime, required: true, error: s.errors.startTime, type: 'time' })
          + F.textField({ id: 'he-end-time', label: 'End time', value: s.endTime, required: true, error: s.errors.endTime, type: 'time' })
          + '</div>' })
        + F.formSection({ title: 'Location & capacity', eyebrow: 'Step 3', children:
          F.radioGroup({ id: 'he-format', label: 'Format', value: s.format, required: true, error: s.errors.format, columns: 3, options: [
            { value: 'Online', label: 'Online', detail: 'Zoom or similar' },
            { value: 'Offline', label: 'In-person', detail: 'Physical venue' },
            { value: 'Hybrid', label: 'Hybrid', detail: 'Both online & in-person' }] })
          + F.textField({ id: 'he-location', label: 'Location / venue', value: s.location, required: true, error: s.errors.location, icon: ic('map-pin', 16), placeholder: 'e.g. Innovation Hub, San Francisco' })
          + '<div class="form-grid-2">'
          + F.textField({ id: 'he-capacity', label: 'Capacity', value: s.capacity, required: true, error: s.errors.capacity, type: 'number', icon: ic('users', 16) })
          + F.textField({ id: 'he-reg-deadline', label: 'Registration deadline', value: s.regDeadline, required: true, error: s.errors.regDeadline, type: 'date', icon: ic('ticket-check', 16) })
          + '</div>' })
        + F.formSection({ title: 'Organizer details', eyebrow: 'Step 4', children:
          '<div class="form-grid-2">'
          + F.textField({ id: 'he-organizer', label: 'Organizer name', value: s.organizer })
          + F.textField({ id: 'he-contact', label: 'Contact email', value: s.contactEmail, required: true, error: s.errors.contactEmail, type: 'email' })
          + F.textField({ id: 'he-website', label: 'Event website (optional)', value: s.website, icon: ic('link-2', 16), placeholder: 'https://...' })
          + F.textField({ id: 'he-tags', label: 'Tags (comma-separated)', value: s.tags, icon: ic('tag', 16), placeholder: 'sustainability, ai, civic-tech' })
          + '</div>' })
        + F.formSection({ title: 'Event features', eyebrow: 'Step 5', children:
          F.toggleField({ id: 'he-cert', label: 'Issue certificates', checked: s.certificates, hint: 'Automatically generate certificates for eligible participants.' })
          + F.toggleField({ id: 'he-jury', label: 'Enable jury evaluation', checked: s.juryEnabled, hint: 'Assign jury members to score participant submissions.' })
          + F.toggleField({ id: 'he-feedback', label: 'Collect feedback', checked: s.feedbackEnabled, hint: 'Send a feedback form after the event concludes.' })
          + F.toggleField({ id: 'he-attendance', label: 'Require attendance check-in', checked: s.attendanceRequired, hint: 'Participants must check in to receive certificates.' }) })
        + F.formSection({ title: 'Guidelines', eyebrow: 'Step 6', children:
          F.checkboxField({ id: 'he-rules', label: 'I agree to the WayMark hosting guidelines and content policies', checked: s.agreeRules })
          + (s.errors.agreeRules ? '<span class="field-error">' + WM.esc(s.errors.agreeRules) + '</span>' : '') })
        + F.formStatus(s.status, s.statusMsg)
        + F.formActions({ onSave: true, onSubmit: true, loading: s.loading, submitLabel: 'Submit for approval', saveLabel: 'Save draft' })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function validate() {
      const e = {};
      if (!s.title.trim()) e.title = 'Event title is required.';
      else if (s.title.trim().length < 5) e.title = 'Title must be at least 5 characters.';
      if (!s.eventType) e.eventType = 'Please select an event type.';
      if (!s.description.trim()) e.description = 'Description is required.';
      else if (s.description.trim().length < 30) e.description = 'Description must be at least 30 characters.';
      if (!s.startDate) e.startDate = 'Start date is required.';
      if (!s.endDate) e.endDate = 'End date is required.';
      if (s.startDate && s.endDate && s.endDate < s.startDate) e.endDate = 'End date cannot be before start date.';
      if (!s.startTime) e.startTime = 'Start time is required.';
      if (!s.endTime) e.endTime = 'End time is required.';
      if (!s.location.trim()) e.location = 'Location is required.';
      if (!s.format) e.format = 'Please select a format.';
      if (!s.capacity || Number(s.capacity) < 1) e.capacity = 'Capacity must be at least 1.';
      if (!s.regDeadline) e.regDeadline = 'Registration deadline is required.';
      if (!s.contactEmail.trim()) e.contactEmail = 'Contact email is required.';
      else if (!/^\S+@\S+\.\S+$/.test(s.contactEmail)) e.contactEmail = 'Enter a valid email address.';
      if (!s.agreeRules) e.agreeRules = 'You must agree to the hosting guidelines.';
      return e;
    }

    const texts = {
      'he-title': 'title', 'he-desc': 'description', 'he-start-date': 'startDate', 'he-end-date': 'endDate',
      'he-start-time': 'startTime', 'he-end-time': 'endTime', 'he-location': 'location', 'he-capacity': 'capacity',
      'he-reg-deadline': 'regDeadline', 'he-organizer': 'organizer', 'he-contact': 'contactEmail', 'he-website': 'website', 'he-tags': 'tags',
    };
    const selects = { 'he-category': 'category' };
    const toggles = { 'he-cert': 'certificates', 'he-jury': 'juryEnabled', 'he-feedback': 'feedbackEnabled', 'he-attendance': 'attendanceRequired' };
    const radios = { 'he-type': 'eventType', 'he-format': 'format' };

    function wire() {
      document.querySelectorAll('[data-mode]').forEach(function (b) {
        b.addEventListener('click', function () { s.mode = b.getAttribute('data-mode'); draw(); });
      });
      Object.keys(texts).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', function () {
          s[texts[id]] = el.value;
          if (s.errors[texts[id]]) { s.errors[texts[id]] = undefined; draw(id, el.selectionStart); }
        });
      });
      Object.keys(selects).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', function () { s[selects[id]] = el.value; draw(); });
      });
      Object.keys(toggles).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', function () { s[toggles[id]] = !s[toggles[id]]; draw(); });
      });
      document.querySelectorAll('[data-radio]').forEach(function (b) {
        b.addEventListener('click', function () {
          const key = radios[b.getAttribute('data-radio')];
          s[key] = b.getAttribute('data-value'); s.errors[key] = undefined; draw();
        });
      });
      const rules = document.getElementById('he-rules');
      if (rules) rules.addEventListener('click', function () { s.agreeRules = !s.agreeRules; s.errors.agreeRules = undefined; draw(); });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-action');
          if (action === 'reset') { s.status = 'idle'; s.statusMsg = ''; s.errors = {}; draw(); }
          else if (action === 'cancel') { s.mode = 'edit'; s.status = 'idle'; s.statusMsg = ''; draw(); }
          else if (action === 'save') { s.loading = true; draw(); window.setTimeout(function () { s.loading = false; s.status = 'success'; s.statusMsg = 'Draft saved. You can continue editing later.'; draw(); }, 600); }
          else if (action === 'submit') {
            const e = validate(); s.errors = e;
            if (Object.keys(e).length) { s.status = 'error'; s.statusMsg = 'Please fix the errors before submitting.'; draw(); return; }
            s.loading = true; s.status = 'loading'; draw();
            window.setTimeout(function () { s.loading = false; s.status = 'success'; s.statusMsg = 'Event submitted for approval! Administrators will review it shortly.'; draw(); }, 1000);
          }
        });
      });
    }

    WM.page({ route: '/forms/host-event', render: render, mounted: function () { wire(); } });
  }

  function approvalForm() {
    const s = {
      decision: '', reviewNotes: '', conditions: '', publishImmediately: true, featured: false,
      notifyOrganizer: true, errors: {}, status: 'idle', statusMsg: '', loading: false,
    };

    function render() {
      if (s.status === 'success') {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('check', 24) + '</div>'
          + '<h3>Decision recorded</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<button class="button button-secondary" data-action="reset">Review next event</button></div>';
      }
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Admin workspace', title: 'Review: Campus Sustainability Summit' })
        + '<div class="form-approval-summary panel"><div class="approval-summary-row">'
        + '<div class="approval-summary-item"><span class="eyebrow">Organizer</span><strong>Jordan Lee</strong></div>'
        + '<div class="approval-summary-item"><span class="eyebrow">Type</span><strong>Conference</strong></div>'
        + '<div class="approval-summary-item"><span class="eyebrow">Date</span><strong>Nov 02, 2026</strong></div>'
        + '<div class="approval-summary-item"><span class="eyebrow">Capacity</span><strong>400</strong></div>'
        + '<div class="approval-summary-item"><span class="eyebrow">Submitted</span><strong>3h ago</strong></div>'
        + '</div></div>'
        + F.formSection({ title: 'Review decision', eyebrow: 'Action', children:
          F.radioGroup({ id: 'ap-decision', label: 'Decision', value: s.decision, required: true, error: s.errors.decision, columns: 1, options: [
            { value: 'approve', label: 'Approve and publish', detail: 'Event will be live immediately or on scheduled date' },
            { value: 'approve-with-conditions', label: 'Approve with conditions', detail: 'Specify conditions the organizer must meet' },
            { value: 'request-changes', label: 'Request changes', detail: 'Send back to organizer for edits' },
            { value: 'reject', label: 'Reject', detail: 'Event will not be published' }] })
          + (s.decision === 'approve-with-conditions'
            ? F.textArea({ id: 'ap-conditions', label: 'Conditions', value: s.conditions, required: true, error: s.errors.conditions, rows: 3, placeholder: 'List the conditions the organizer must address...' })
            : '')
          + F.textArea({ id: 'ap-notes', label: 'Review notes', value: s.reviewNotes, rows: 3, required: s.decision === 'reject' || s.decision === 'request-changes', error: s.errors.reviewNotes, placeholder: 'Internal notes or feedback for the organizer...' }) })
        + F.formSection({ title: 'Publishing options', eyebrow: 'Settings', children:
          F.toggleField({ id: 'ap-publish', label: 'Publish immediately', checked: s.publishImmediately, hint: 'If off, event will be scheduled for publishing on its start date.' })
          + F.toggleField({ id: 'ap-featured', label: 'Feature on discover page', checked: s.featured, hint: 'Highlighted in the discover events section.' })
          + F.toggleField({ id: 'ap-notify', label: 'Notify organizer', checked: s.notifyOrganizer, hint: 'Send an email notification with the decision.' }) })
        + F.formStatus(s.status, s.statusMsg)
        + F.formActions({ onSubmit: true, loading: s.loading, submitLabel: s.decision === 'reject' ? 'Reject event' : 'Approve & publish', saveLabel: 'Save review', showCancel: true })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function wire() {
      const notes = document.getElementById('ap-notes');
      if (notes) notes.addEventListener('input', function () { s.reviewNotes = notes.value; if (s.errors.reviewNotes) { s.errors.reviewNotes = undefined; draw('ap-notes', notes.selectionStart); } });
      const cond = document.getElementById('ap-conditions');
      if (cond) cond.addEventListener('input', function () { s.conditions = cond.value; if (s.errors.conditions) { s.errors.conditions = undefined; draw('ap-conditions', cond.selectionStart); } });
      document.querySelectorAll('[data-radio]').forEach(function (b) {
        b.addEventListener('click', function () { s.decision = b.getAttribute('data-value'); s.errors.decision = undefined; draw(); });
      });
      const toggles = { 'ap-publish': 'publishImmediately', 'ap-featured': 'featured', 'ap-notify': 'notifyOrganizer' };
      Object.keys(toggles).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', function () { s[toggles[id]] = !s[toggles[id]]; draw(); });
      });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-action');
          if (action === 'reset') { s.status = 'idle'; s.decision = ''; s.reviewNotes = ''; draw(); }
          else if (action === 'cancel') { s.status = 'idle'; s.statusMsg = ''; draw(); }
          else if (action === 'submit') {
            const e = {};
            if (!s.decision) e.decision = 'Please select a decision.';
            if (s.decision === 'approve-with-conditions' && !s.conditions.trim()) e.conditions = 'Conditions must be specified.';
            if (s.decision === 'reject' && !s.reviewNotes.trim()) e.reviewNotes = 'Please provide a reason for rejection.';
            s.errors = e;
            if (Object.keys(e).length) { draw(); return; }
            s.loading = true; s.status = 'loading'; draw();
            window.setTimeout(function () {
              s.loading = false; s.status = 'success';
              s.statusMsg = s.decision === 'reject' ? 'Event rejected. The organizer has been notified.' : 'Event approved and published successfully.';
              draw();
            }, 900);
          }
        });
      });
    }

    WM.page({ route: '/forms/approval', render: render, mounted: function () { wire(); } });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.hostEvent = hostEvent;
  global.WMPages.approvalForm = approvalForm;
})(window);
