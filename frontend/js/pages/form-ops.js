/* Attendance, feedback, certificate + verification forms — ports AttendanceFeedbackCertForms.tsx */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, F = WM.forms, ui = WM.ui;

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

  function eventTitles() {
    const titles = (D.events || []).map(function (e) { return e.title; });
    return titles.length ? titles : ['No events available'];
  }

  function findEvent(title) {
    return (D.events || []).find(function (e) { return e.title === title; }) || null;
  }

  /* ===================== Attendance ===================== */
  function attendanceForm() {
    const s = {
      mode: 'manual', eventId: '', event: '', participantId: '', session: 'Main event',
      roster: [], status: 'idle', statusMsg: '', loading: false,
    };
    let statusTimer = null;

    function normalizeRoster(value) {
      return asList(value, ['roster', 'participants', 'attendance']).map(function (r) {
        const checked = !!r.checkedIn || r.status === 'Checked in' || r.attendanceStatus === 'Checked in';
        return {
          id: String(r.id || r.userId || r.participantId || ''),
          name: r.name || r.participantName || '',
          email: r.email || r.participantEmail || '',
          checkedIn: checked,
        };
      });
    }

    function loadRoster(eventId) {
      if (!eventId) { s.roster = []; return Promise.resolve(); }
      return global.WMApi.events.roster(eventId).then(function (data) {
        s.roster = normalizeRoster(data);
      }, function () {
        s.roster = D.attendanceLogs.filter(function (l) {
          return String(l.eventId) === String(eventId);
        }).map(function (l) {
          return {
            id: String(l.userId || l.id), name: l.participantName || '', email: l.participantEmail || '',
            checkedIn: l.status === 'Checked in',
          };
        });
      });
    }

    function load() {
      return D.ready().then(function () {
        const first = D.events[0];
        if (first) { s.eventId = first.id; s.event = first.title; }
        return loadRoster(s.eventId);
      });
    }

    function render() {
      const checkedCount = s.roster.filter(function (r) { return r.checkedIn; }).length;
      const rows = s.roster.map(function (r) {
        const on = r.checkedIn;
        return '<div class="attendance-row' + (on ? ' checked-in' : '') + '">'
          + '<div class="attendance-id">' + WM.esc(r.id) + '</div>'
          + '<div class="attendance-name"><strong>' + WM.esc(r.name) + '</strong><span>' + WM.esc(r.email) + '</span></div>'
          + ui.badge(on ? 'Checked in' : 'Not checked in', on ? 'green' : 'slate')
          + '<button class="button button-' + (on ? 'secondary' : 'primary') + ' attendance-toggle" data-checkin="' + WM.esc(r.id) + '">' + (on ? 'Undo' : 'Check in') + '</button></div>';
      }).join('') || '<p class="lede">No participants on this roster yet.</p>';

      const modeSection = s.mode === 'manual'
        ? F.formSection({ title: 'Manual check-in', eyebrow: 'Enter ID', children:
            F.textField({ id: 'at-pid', label: 'Participant ID', value: s.participantId, placeholder: 'e.g. P001', icon: ic('clipboard-check', 16) })
            + '<button type="button" class="button button-primary" data-action="manual"' + (s.loading ? ' disabled' : '') + '>' + ic('check', 15) + ' Check in participant</button>'
            + F.formStatus(s.status, s.statusMsg) })
        : F.formSection({ title: 'QR code scanner', eyebrow: 'Scan', children:
            '<div class="qr-placeholder">' + ic('qr-code', 64) + '<p>QR scanner is ready. Point the camera at a participant\u2019s QR code.</p></div>'
            + F.formStatus(s.status, s.statusMsg) });

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Event operations', title: 'Attendance check-in' })
        + F.formSection({ title: 'Session selection', eyebrow: 'Setup', children:
          '<div class="form-grid-2">'
          + F.selectInput({ id: 'at-event', label: 'Event', value: s.event, options: eventTitles() })
          + F.selectInput({ id: 'at-session', label: 'Session', value: s.session, options: ['Main event', 'Opening ceremony', 'Workshop session A', 'Workshop session B', 'Closing ceremony'] })
          + '</div>' })
        + F.formSection({ title: 'Check-in method', eyebrow: 'Mode', children:
          F.radioGroup({ id: 'at-mode', label: 'Select method', value: s.mode, columns: 2, options: [
            { value: 'manual', label: 'Manual check-in', detail: 'Search by ID or name' },
            { value: 'qr', label: 'QR code scan', detail: 'Scan participant QR code' }] }) })
        + modeSection
        + F.formSection({ title: 'Attendance roster', eyebrow: checkedCount + '/' + s.roster.length + ' checked in', children:
          '<div class="attendance-roster">' + rows + '</div>' })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function setTransient(status, msg) {
      s.status = status; s.statusMsg = msg; draw();
      if (statusTimer) window.clearTimeout(statusTimer);
      statusTimer = window.setTimeout(function () { s.status = 'idle'; s.statusMsg = ''; draw(); }, 2000);
    }

    function wire() {
      const ev = document.getElementById('at-event');
      if (ev) ev.addEventListener('change', function () {
        s.event = ev.value;
        const match = findEvent(ev.value);
        s.eventId = match ? match.id : '';
        loadRoster(s.eventId).then(draw, draw);
      });
      const se = document.getElementById('at-session');
      if (se) se.addEventListener('change', function () { s.session = se.value; draw(); });
      document.querySelectorAll('[data-radio]').forEach(function (b) {
        b.addEventListener('click', function () { s.mode = b.getAttribute('data-value'); draw(); });
      });
      const pid = document.getElementById('at-pid');
      if (pid) pid.addEventListener('input', function () { s.participantId = pid.value; });
      document.querySelectorAll('[data-checkin]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-checkin');
          const person = s.roster.find(function (r) { return r.id === id; });
          const wasIn = !!(person && person.checkedIn);
          const request = wasIn
            ? global.WMApi.attendance.undo(id)
            : global.WMApi.attendance.checkIn({ eventId: s.eventId, participantId: id, session: s.session });
          request.then(function () {
            if (person) person.checkedIn = !wasIn;
            setTransient('success', (person ? person.name : id) + ' checked ' + (wasIn ? 'out' : 'in') + '.');
          }, function (err) {
            setTransient('error', (err && err.message) || 'Check-in failed. Please try again.');
          });
        });
      });
      document.querySelectorAll('[data-action="manual"]').forEach(function (b) {
        b.addEventListener('click', function () {
          const pidVal = s.participantId.trim();
          if (!pidVal) { s.status = 'error'; s.statusMsg = 'Enter a participant ID.'; draw(); return; }
          s.loading = true; draw();
          global.WMApi.attendance.checkIn({ eventId: s.eventId, participantId: pidVal, session: s.session }).then(function () {
            s.loading = false;
            const person = s.roster.find(function (r) { return r.id === pidVal; });
            if (person) person.checkedIn = true;
            s.status = 'success'; s.statusMsg = 'Participant ' + pidVal + ' checked in.';
            s.participantId = ''; draw();
          }, function (err) {
            s.loading = false; s.status = 'error';
            s.statusMsg = (err && err.message) || 'Check-in failed. Please try again.';
            draw();
          });
        });
      });
    }

    WM.page({ route: '/forms/attendance', render: render, mounted: function () { wire(); }, load: load });
  }

  /* ===================== Feedback ===================== */
  function feedbackForm() {
    const s = {
      eventId: '', event: '', overallRating: 0, contentRating: 0, organizationRating: 0,
      venueRating: 0, whatWorked: '', whatDidnt: '', wouldRecommend: '', attendAgain: true,
      anonymous: false, errors: {}, status: 'idle', statusMsg: '', loading: false,
    };

    function load() {
      return D.ready().then(function () {
        const first = D.events[0];
        if (first) { s.eventId = first.id; s.event = first.title; }
        return null;
      });
    }

    function render() {
      if (s.status === 'success') {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('message-square', 24) + '</div>'
          + '<h3>Feedback received</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<button class="button button-secondary" data-action="reset">Submit another</button></div>';
      }
      const recs = ['Yes, definitely', 'Maybe', 'No'].map(function (r) {
        return '<button type="button" class="form-radio-card' + (s.wouldRecommend === r ? ' form-radio-selected' : '') + '" data-rec="' + r + '">'
          + '<span class="form-radio-dot' + (s.wouldRecommend === r ? ' form-radio-dot-on' : '') + '"></span><div><strong>' + r + '</strong></div></button>';
      }).join('');
      const rating = function (title, id, value, req, err) {
        return '<div class="feedback-rating"><div class="feedback-rating-head"><strong>' + title + (req ? '<span class="form-req">*</span>' : '') + '</strong></div>'
          + F.scoreInput({ id: id, label: '', value: value, max: 5 })
          + (err ? '<span class="field-error">' + WM.esc(err) + '</span>' : '') + '</div>';
      };
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Post-event', title: 'Event feedback' })
        + F.formSection({ title: 'Event', eyebrow: 'Select', children:
          F.selectInput({ id: 'fb-event', label: 'Which event are you reviewing?', value: s.event, options: eventTitles() }) })
        + F.formSection({ title: 'Ratings', eyebrow: 'Your experience', children:
          rating('Overall experience', 'fb-overall', s.overallRating, true, s.errors.overall)
          + rating('Content quality', 'fb-content', s.contentRating, false)
          + rating('Organization', 'fb-org', s.organizationRating, false)
          + rating('Venue / platform', 'fb-venue', s.venueRating, false) })
        + F.formSection({ title: 'Written feedback', eyebrow: 'Details', children:
          F.textArea({ id: 'fb-worked', label: 'What worked well?', value: s.whatWorked, required: true, error: s.errors.whatWorked, rows: 3, placeholder: 'Share what you enjoyed about the event...' })
          + F.textArea({ id: 'fb-didnt', label: 'What could be improved?', value: s.whatDidnt, rows: 3, placeholder: 'Constructive suggestions for the organizers...' })
          + '<div class="form-field-group"><div class="form-field-label-row"><label>Would you recommend this event to others?<span class="form-req">*</span></label></div>'
          + '<div class="form-radio-grid form-radio-cols-3">' + recs + '</div>'
          + (s.errors.recommend ? '<span class="field-error">' + WM.esc(s.errors.recommend) + '</span>' : '') + '</div>'
          + F.toggleField({ id: 'fb-again', label: 'I would attend another event by this organizer', checked: s.attendAgain })
          + F.toggleField({ id: 'fb-anon', label: 'Submit anonymously', checked: s.anonymous, hint: 'Your name will not be shared with the organizer.' }) })
        + F.formStatus(s.status, s.statusMsg)
        + F.formActions({ onSubmit: true, loading: s.loading, submitLabel: 'Submit feedback', showSave: false })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function wire() {
      const ev = document.getElementById('fb-event');
      if (ev) ev.addEventListener('change', function () {
        s.event = ev.value;
        const match = findEvent(ev.value);
        s.eventId = match ? match.id : '';
        draw();
      });
      const ratings = { 'fb-overall': 'overallRating', 'fb-content': 'contentRating', 'fb-org': 'organizationRating', 'fb-venue': 'venueRating' };
      document.querySelectorAll('[data-score]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-score');
          s[ratings[id]] = Number(b.getAttribute('data-index'));
          if (id === 'fb-overall') s.errors.overall = undefined;
          draw();
        });
      });
      const worked = document.getElementById('fb-worked');
      if (worked) worked.addEventListener('input', function () { s.whatWorked = worked.value; if (s.errors.whatWorked) { s.errors.whatWorked = undefined; draw('fb-worked', worked.selectionStart); } });
      const didnt = document.getElementById('fb-didnt');
      if (didnt) didnt.addEventListener('input', function () { s.whatDidnt = didnt.value; });
      document.querySelectorAll('[data-rec]').forEach(function (b) {
        b.addEventListener('click', function () { s.wouldRecommend = b.getAttribute('data-rec'); s.errors.recommend = undefined; draw(); });
      });
      const again = document.getElementById('fb-again');
      if (again) again.addEventListener('click', function () { s.attendAgain = !s.attendAgain; draw(); });
      const anon = document.getElementById('fb-anon');
      if (anon) anon.addEventListener('click', function () { s.anonymous = !s.anonymous; draw(); });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-action');
          if (action === 'reset') { s.status = 'idle'; s.overallRating = 0; s.contentRating = 0; s.organizationRating = 0; s.venueRating = 0; s.whatWorked = ''; s.whatDidnt = ''; s.wouldRecommend = ''; draw(); return; }
          if (action !== 'submit') return;
          const e = {};
          if (!s.overallRating) e.overall = 'Please rate your overall experience.';
          if (!s.wouldRecommend) e.recommend = 'Please select an option.';
          if (!s.whatWorked.trim()) e.whatWorked = 'Please share what worked well.';
          s.errors = e;
          if (Object.keys(e).length) { draw(); return; }
          s.loading = true; s.status = 'loading'; draw();
          global.WMApi.feedback.create({
            eventId: s.eventId, overallRating: s.overallRating, contentRating: s.contentRating,
            organizationRating: s.organizationRating, venueRating: s.venueRating,
            whatWorked: s.whatWorked, whatDidnt: s.whatDidnt, wouldRecommend: s.wouldRecommend,
            attendAgain: s.attendAgain, anonymous: s.anonymous,
          }).then(function () {
            s.loading = false; s.status = 'success';
            s.statusMsg = 'Thank you! Your feedback has been submitted.';
            draw();
          }, function (err) {
            s.loading = false; s.status = 'error';
            s.statusMsg = (err && err.message) || 'We could not submit your feedback. Please try again.';
            draw();
          });
        });
      });
    }

    WM.page({ route: '/forms/feedback', render: render, mounted: function () { wire(); }, load: load });
  }

  /* ===================== Certificate issuing ===================== */
  function certificateForm() {
    const s = {
      eventId: '', event: '', template: 'Standard', title: 'Certificate of Participation',
      issuer: 'WayMark Platform', signatory: '', criteria: 'attended', minScore: '0',
      people: [], recipients: [], status: 'idle', statusMsg: '', loading: false, issued: false,
    };

    function normalizePeople(value) {
      return asList(value, ['participants', 'roster', 'eligible']).map(function (p) {
        const attended = !!p.attended || !!p.checkedIn || p.status === 'Checked in' || p.attendanceStatus === 'Checked in';
        return {
          id: String(p.id || p.userId || p.participantId || ''),
          name: p.name || p.participantName || '',
          attended: attended,
          score: Number(p.score || 0),
        };
      });
    }

    function load() {
      return D.ready().then(function () {
        const first = D.events[0];
        if (first) { s.eventId = first.id; s.event = first.title; }
        if (!s.signatory) {
          const user = WM.Auth.getUser();
          s.signatory = user && user.name ? user.name : '';
        }
        if (!s.eventId) { s.people = []; return null; }
        return global.WMApi.events.participants(s.eventId).then(function (data) {
          s.people = normalizePeople(data);
        }, function () {
          return global.WMApi.events.roster(s.eventId).then(function (data) {
            s.people = normalizePeople(data);
          }, function () {
            s.people = [];
          });
        });
      });
    }

    function render() {
      if (s.issued) {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('file-check-2', 24) + '</div>'
          + '<h3>Certificates issued</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<div class="form-success-actions">'
          + '<button class="button button-secondary">' + ic('download', 15) + ' Download all</button>'
          + '<button class="button button-primary" data-action="issue-more">Issue more</button></div></div>';
      }
      const filtered = s.criteria === 'attended' ? s.people.filter(function (p) { return p.attended; })
        : s.criteria === 'score' ? s.people.filter(function (p) { return p.attended && p.score >= Number(s.minScore); })
        : s.people;
      const rows = filtered.map(function (p) {
        const on = s.recipients.indexOf(p.id) !== -1;
        return '<div class="cert-recipient-row' + (on ? ' selected' : '') + '">'
          + F.checkboxField({ id: 'ct-' + p.id, label: '', checked: on })
          + '<div class="cert-recipient-info"><strong>' + WM.esc(p.name) + '</strong><span>' + WM.esc(p.id) + ' \u00b7 ' + (p.attended ? ('Score: ' + p.score) : 'Did not attend') + '</span></div>'
          + (p.attended ? ui.badge('Eligible', 'green') : ui.badge('Not eligible', 'slate')) + '</div>';
      }).join('') || '<p class="lede">No participants available for this event yet.</p>';
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Certificates', title: 'Issue certificates' })
        + F.formSection({ title: 'Certificate details', eyebrow: 'Template', children:
          '<div class="form-grid-2">'
          + F.selectInput({ id: 'ct-event', label: 'Event', value: s.event, options: eventTitles() })
          + F.selectInput({ id: 'ct-template', label: 'Template', value: s.template, options: ['Standard', 'Achievement', 'Participation', 'Excellence', 'Completion'] })
          + F.textField({ id: 'ct-title', label: 'Certificate title', value: s.title })
          + F.textField({ id: 'ct-issuer', label: 'Issuing organization', value: s.issuer })
          + F.textField({ id: 'ct-signatory', label: 'Signatory name', value: s.signatory })
          + '</div>' })
        + F.formSection({ title: 'Eligibility criteria', eyebrow: 'Rules', children:
          F.radioGroup({ id: 'ct-criteria', label: 'Who should receive certificates?', value: s.criteria, columns: 3, options: [
            { value: 'attended', label: 'All who attended', detail: 'Checked-in participants' },
            { value: 'score', label: 'Minimum score', detail: 'Jury score threshold' },
            { value: 'manual', label: 'Manual selection', detail: 'Pick recipients individually' }] })
          + (s.criteria === 'score' ? F.textField({ id: 'ct-min-score', label: 'Minimum jury score', value: s.minScore, type: 'number' }) : '') })
        + F.formSection({ title: 'Recipients', eyebrow: s.recipients.length + ' selected', children:
          '<div class="cert-recipient-list">' + rows + '</div>' })
        + F.formStatus(s.status, s.statusMsg)
        + F.formActions({ onSubmit: true, loading: s.loading, submitLabel: 'Issue certificates', showSave: false })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function wire() {
      const sel = { 'ct-event': 'event', 'ct-template': 'template', 'ct-title': 'title', 'ct-issuer': 'issuer', 'ct-signatory': 'signatory', 'ct-min-score': 'minScore' };
      Object.keys(sel).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', function () { s[sel[id]] = el.value; draw(); });
        if (el) el.addEventListener('input', function () { s[sel[id]] = el.value; });
      });
      const ev = document.getElementById('ct-event');
      if (ev) ev.addEventListener('change', function () {
        const match = findEvent(ev.value);
        s.eventId = match ? match.id : '';
        s.recipients = [];
        if (s.eventId) {
          global.WMApi.events.participants(s.eventId).then(function (data) {
            s.people = normalizePeople(data); draw();
          }, function () { s.people = []; draw(); });
        } else { s.people = []; draw(); }
      });
      document.querySelectorAll('[data-radio]').forEach(function (b) {
        b.addEventListener('click', function () { s.criteria = b.getAttribute('data-value'); s.recipients = []; draw(); });
      });
      document.querySelectorAll('[data-check]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-check').replace('ct-', '');
          s.recipients = s.recipients.indexOf(id) !== -1 ? s.recipients.filter(function (r) { return r !== id; }) : s.recipients.concat([id]);
          draw();
        });
      });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-action');
          if (action === 'issue-more') { s.issued = false; s.recipients = []; s.status = 'idle'; draw(); return; }
          if (action !== 'submit') return;
          if (s.recipients.length === 0) { s.status = 'error'; s.statusMsg = 'Select at least one recipient.'; draw(); return; }
          s.loading = true; s.status = 'loading'; draw();
          global.WMApi.certificates.issue({
            eventId: s.eventId, template: s.template, title: s.title, issuer: s.issuer,
            signatory: s.signatory, criteria: s.criteria, minScore: Number(s.minScore) || 0,
            recipientIds: s.recipients,
          }).then(function () {
            s.loading = false; s.status = 'success'; s.issued = true;
            s.statusMsg = s.recipients.length + ' certificate(s) issued successfully.';
            draw();
          }, function (err) {
            s.loading = false; s.status = 'error';
            s.statusMsg = (err && err.message) || 'We could not issue the certificates. Please try again.';
            draw();
          });
        });
      });
    }

    WM.page({ route: '/forms/certificates', render: render, mounted: function () { wire(); }, load: load });
  }

  /* ===================== Certificate verification ===================== */
  function certificateVerify() {
    const s = { certId: '', result: 'idle', cert: null, loading: false };

    function render() {
      const cert = s.cert || {};
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Certificates', title: 'Verify a certificate' })
        + F.formSection({ title: 'Certificate lookup', eyebrow: 'Search', children:
          F.textField({ id: 'cv-id', label: 'Certificate ID', value: s.certId, placeholder: 'e.g. WM-2026-001', icon: ic('award', 16), hint: 'Found on the certificate document' })
          + '<button type="button" class="button button-primary" data-action="verify"' + (s.loading ? ' disabled' : '') + '>'
          + (s.loading ? '<span class="loading-spinner"></span> Verifying...' : 'Verify certificate') + '</button>' })
        + (s.result === 'valid'
          ? '<div class="panel cert-verify-result valid"><div class="success-icon">' + ic('check', 24) + '</div>'
            + '<h3>Certificate verified</h3>'
            + '<div class="cert-verify-details">'
            + '<div><span class="eyebrow">Holder</span><strong>' + WM.esc(cert.recipientName || cert.holder || '\u2014') + '</strong></div>'
            + '<div><span class="eyebrow">Event</span><strong>' + WM.esc(cert.eventTitle || cert.event || '\u2014') + '</strong></div>'
            + '<div><span class="eyebrow">Date</span><strong>' + WM.esc(cert.issueDate || cert.date || '\u2014') + '</strong></div>'
            + '<div><span class="eyebrow">Status</span><strong>' + WM.esc(cert.status || 'Valid') + '</strong></div></div>'
            + '<button class="button button-secondary">' + ic('download', 15) + ' Download copy</button></div>'
          : '')
        + (s.result === 'invalid'
          ? '<div class="panel cert-verify-result invalid"><div class="cert-verify-invalid-icon">' + ic('file-check-2', 24) + '</div>'
            + '<h3>Certificate not found</h3><p>No certificate with ID "' + WM.esc(s.certId) + '" was found. Please check the ID and try again.</p></div>'
          : '')
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function wire() {
      const idEl = document.getElementById('cv-id');
      if (idEl) idEl.addEventListener('input', function () { s.certId = idEl.value; });
      const btn = document.querySelector('[data-action="verify"]');
      if (btn) btn.addEventListener('click', function () {
        if (!s.certId.trim()) return;
        s.loading = true; s.result = 'idle'; s.cert = null; draw();
        global.WMApi.certificates.verify(s.certId.trim()).then(function (data) {
          s.loading = false; s.result = 'valid';
          s.cert = (data && (data.certificate || data)) || {};
          draw();
        }, function () {
          s.loading = false; s.result = 'invalid'; draw();
        });
      });
    }

    WM.page({ route: '/forms/certificate-verify', render: render, mounted: function () { wire(); } });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.attendanceForm = attendanceForm;
  global.WMPages.feedbackForm = feedbackForm;
  global.WMPages.certificateForm = certificateForm;
  global.WMPages.certificateVerify = certificateVerify;
})(window);