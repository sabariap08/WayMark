/* Jury management, assignment, rubric + scoring forms — ports JuryForms.tsx */
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

  function av(name) { return String(name || '').split(' ').map(function (n) { return n[0]; }).join('').slice(0, 2); }

  function eventTitles() {
    const titles = (D.events || []).map(function (e) { return e.title; });
    return titles.length ? titles : ['No events available'];
  }

  function juryMemberOptions() {
    const pool = D.users.filter(function (u) { return u.role === 'Jury'; });
    if (pool.length) return pool.map(function (u) { return { id: u.id, name: u.name, email: u.email, expertise: u.expertise || 'Jury', status: u.status || 'Confirmed' }; });
    return [];
  }

  /* ===================== Jury management ===================== */
  function juryManagement() {
    const s = {
      name: '', email: '', expertise: '', errors: {}, status: 'idle', statusMsg: '', loading: false, members: [],
    };

    function load() {
      return global.WMApi.jury.list().then(function (data) {
        s.members = asList(data, ['jury', 'members']);
      }, function () {
        s.members = juryMemberOptions();
      });
    }

    function render() {
      const rows = s.members.map(function (m) {
        return '<div class="jury-row"><div class="jury-avatar">' + WM.esc(av(m.name)) + '</div>'
          + '<div class="jury-info"><strong>' + WM.esc(m.name) + '</strong><span>' + WM.esc(m.email) + ' \u00b7 ' + WM.esc(m.expertise || '') + '</span></div>'
          + ui.badge(m.status, m.status === 'Confirmed' ? 'green' : 'amber')
          + '<button class="jury-remove" data-remove="' + WM.esc(m.id) + '" aria-label="Remove member">' + ic('x', 16) + '</button></div>';
      }).join('');
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Administration', title: 'Jury management' })
        + F.formSection({ title: 'Add jury member', eyebrow: 'Invite', children:
          '<div class="form-grid-2">'
          + F.textField({ id: 'jm-name', label: 'Full name', value: s.name, required: true, error: s.errors.name, icon: ic('user', 16) })
          + F.textField({ id: 'jm-email', label: 'Email address', value: s.email, required: true, error: s.errors.email, type: 'email' })
          + '</div>'
          + F.selectInput({ id: 'jm-expertise', label: 'Area of expertise', value: s.expertise, required: true, error: s.errors.expertise,
            options: ['Select...', 'AI & Machine Learning', 'Product Design', 'Sustainability', 'Civic Tech', 'Business & Strategy', 'Research', 'Other'] })
          + F.formStatus(s.status, s.statusMsg)
          + '<button type="button" class="button button-primary" data-action="add"' + (s.loading ? ' disabled' : '') + '>' + ic('plus', 15) + ' Add member</button>' })
        + F.formSection({ title: 'Current jury', eyebrow: 'Roster', children: '<div class="jury-list">' + (rows || '<p class="lede">No jury members yet.</p>') + '</div>' })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function wire() {
      const map = { 'jm-name': 'name', 'jm-email': 'email' };
      Object.keys(map).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', function () { s[map[id]] = el.value; if (s.errors[map[id]]) { s.errors[map[id]] = undefined; draw(id, el.selectionStart); } });
      });
      const ex = document.getElementById('jm-expertise');
      if (ex) ex.addEventListener('change', function () { s.expertise = ex.value; s.errors.expertise = undefined; draw(); });
      document.querySelectorAll('[data-remove]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-remove');
          global.WMApi.jury.remove(id).then(function () {
            s.members = s.members.filter(function (m) { return String(m.id) !== id; });
          }, function () {
            s.members = s.members.filter(function (m) { return String(m.id) !== id; });
          }).then(draw);
        });
      });
      const add = document.querySelector('[data-action="add"]');
      if (add) add.addEventListener('click', function () {
        const e = {};
        if (!s.name.trim()) e.name = 'Name is required.';
        if (!s.email.trim()) e.email = 'Email is required.';
        else if (!/^\S+@\S+\.\S+$/.test(s.email)) e.email = 'Enter a valid email address.';
        if (!s.expertise || s.expertise === 'Select...') e.expertise = 'Please select an area of expertise.';
        s.errors = e;
        if (Object.keys(e).length) { draw(); return; }
        s.loading = true; draw();
        const body = { name: s.name, email: s.email, expertise: s.expertise };
        global.WMApi.jury.add(body).then(function (data) {
          s.loading = false;
          const created = (data && (data.member || data.jury || data)) || null;
          s.members = s.members.concat([{
            id: (created && created.id) || String(Date.now()),
            name: (created && created.name) || body.name,
            email: (created && created.email) || body.email,
            expertise: (created && created.expertise) || body.expertise,
            status: (created && created.status) || 'Pending',
          }]);
          s.name = ''; s.email = ''; s.expertise = '';
          s.status = 'success'; s.statusMsg = 'Jury member added and invitation sent.';
          draw();
        }, function (err) {
          s.loading = false; s.status = 'error';
          s.statusMsg = (err && err.message) || 'We could not add this jury member.';
          draw();
        });
      });
    }

    WM.page({ route: '/forms/jury-management', render: render, mounted: function () { wire(); }, load: load });
  }

  /* ===================== Jury assignment ===================== */
  function juryAssignment() {
    const s = {
      pool: [], eventId: '', event: '', track: 'All tracks', panelSize: '3', search: '',
      assigned: [], status: 'idle', statusMsg: '', loading: false,
    };

    function load() {
      return D.ready().then(function () {
        const hands = D.events.map(function (e) { return { id: e.id, title: e.title }; });
        if (hands.length) { s.eventId = hands[0].id; s.event = hands[0].title; }
        return global.WMApi.jury.list().then(function (data) {
          s.pool = asList(data, ['jury', 'members']);
        }, function () {
          s.pool = juryMemberOptions();
        });
      });
    }

    function trackOptions() {
      const cats = (D.eventCategories || []).filter(function (c) { return c !== 'All categories'; });
      return ['All tracks'].concat(cats.length ? cats : ['AI & ML', 'Sustainability', 'Civic tech']);
    }

    function render() {
      if (s.status === 'success') {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('gavel', 24) + '</div>'
          + '<h3>Jury panel assigned</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<button class="button button-secondary" data-action="reset">Assign another panel</button></div>';
      }
      const filtered = s.pool.filter(function (m) { return String(m.name).toLowerCase().indexOf(s.search.toLowerCase()) !== -1; });
      const rows = filtered.map(function (m) {
        const on = s.assigned.indexOf(String(m.id)) !== -1;
        return '<button type="button" class="jury-assign-row' + (on ? ' assigned' : '') + '" data-assign="' + WM.esc(m.id) + '">'
          + '<div class="jury-avatar">' + WM.esc(av(m.name)) + '</div>'
          + '<div class="jury-info"><strong>' + WM.esc(m.name) + '</strong><span>' + WM.esc(m.expertise || '') + '</span></div>'
          + '<span class="jury-check' + (on ? ' checked' : '') + '">' + (on ? ic('check', 14, 'stroke-width="3"') : '') + '</span></button>';
      }).join('') || '<p class="lede">No jury members available. Add members first.</p>';
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Administration', title: 'Jury assignment' })
        + F.formSection({ title: 'Assignment details', eyebrow: 'Configure', children:
          '<div class="form-grid-2">'
          + F.selectInput({ id: 'ja-event', label: 'Event', value: s.event, options: eventTitles() })
          + F.selectInput({ id: 'ja-track', label: 'Track / category', value: s.track, options: trackOptions() })
          + F.selectInput({ id: 'ja-panel', label: 'Panel size', value: s.panelSize, options: ['1', '2', '3', '4', '5', '6'] })
          + '</div>' })
        + F.formSection({ title: 'Select jury members', eyebrow: 'Assign', children:
          '<div class="form-input-wrap jury-search">' + ic('search', 16)
          + '<input id="ja-search" value="' + WM.esc(s.search) + '" placeholder="Search jury members..." /></div>'
          + '<div class="jury-assign-list">' + rows + '</div>'
          + '<div class="jury-assign-count"><strong>' + s.assigned.length + '</strong> member(s) assigned</div>' })
        + F.formStatus(s.status, s.statusMsg)
        + F.formActions({ onSubmit: true, loading: s.loading, submitLabel: 'Assign jury panel', showSave: false })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function wire() {
      const search = document.getElementById('ja-search');
      if (search) search.addEventListener('input', function () { s.search = search.value; draw('ja-search', search.selectionStart); });
      const eventSel = document.getElementById('ja-event');
      if (eventSel) eventSel.addEventListener('change', function () {
        s.event = eventSel.value;
        const match = D.events.find(function (e) { return e.title === eventSel.value; });
        s.eventId = match ? match.id : '';
        draw();
      });
      const trackSel = document.getElementById('ja-track');
      if (trackSel) trackSel.addEventListener('change', function () { s.track = trackSel.value; draw(); });
      const panelSel = document.getElementById('ja-panel');
      if (panelSel) panelSel.addEventListener('change', function () { s.panelSize = panelSel.value; draw(); });
      document.querySelectorAll('[data-assign]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-assign');
          s.assigned = s.assigned.indexOf(id) !== -1 ? s.assigned.filter(function (a) { return a !== id; }) : s.assigned.concat([id]);
          draw();
        });
      });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.getAttribute('data-action') === 'reset') { s.status = 'idle'; s.statusMsg = ''; s.assigned = []; draw(); return; }
          if (b.getAttribute('data-action') !== 'submit') return;
          if (s.assigned.length === 0) { s.status = 'error'; s.statusMsg = 'At least one jury member must be assigned.'; draw(); return; }
          s.loading = true; s.status = 'loading'; draw();
          global.WMApi.jury.assign({
            eventId: s.eventId, event: s.event, track: s.track, panelSize: Number(s.panelSize) || s.assigned.length,
            juryMemberIds: s.assigned,
          }).then(function () {
            s.loading = false; s.status = 'success';
            s.statusMsg = s.assigned.length + ' jury members assigned to ' + s.event + '.';
            draw();
          }, function (err) {
            s.loading = false; s.status = 'error';
            s.statusMsg = (err && err.message) || 'We could not assign this jury panel.';
            draw();
          });
        });
      });
    }

    WM.page({ route: '/forms/jury-assignment', render: render, mounted: function () { wire(); }, load: load });
  }

  /* ===================== Rubric form ===================== */
  function rubricForm() {
    const s = {
      rubricName: '', eventId: '', event: '',
      criteria: [{ id: '1', name: '', description: '', weight: 0, maxScore: 10 }],
      errors: {}, status: 'idle', statusMsg: '', loading: false,
    };

    function load() {
      return D.ready().then(function () {
        if (D.events.length) { s.eventId = D.events[0].id; s.event = D.events[0].title; }
        return null;
      });
    }

    function totalWeight() { return s.criteria.reduce(function (sum, c) { return sum + Number(c.weight || 0); }, 0); }

    function render() {
      if (s.status === 'success') {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('award', 24) + '</div>'
          + '<h3>Rubric created</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<button class="button button-secondary" data-action="reset">Create another</button></div>';
      }
      const tw = totalWeight();
      const rows = s.criteria.map(function (c, i) {
        return '<div class="rubric-row"><div class="rubric-row-num">' + (i + 1) + '</div>'
          + '<div class="rubric-row-body">'
          + '<input class="rubric-input" id="rb-name-' + c.id + '" data-rub="name" data-rub-id="' + c.id + '" value="' + WM.esc(c.name) + '" placeholder="Criterion name" />'
          + '<input class="rubric-input rubric-input-desc" id="rb-desc-' + c.id + '" data-rub="description" data-rub-id="' + c.id + '" value="' + WM.esc(c.description) + '" placeholder="Description" />'
          + '<div class="rubric-row-meta">'
          + '<label>Weight: <input type="number" id="rb-weight-' + c.id + '" data-rub="weight" data-rub-id="' + c.id + '" value="' + c.weight + '" min="0" max="100" />%</label>'
          + '<label>Max: <input type="number" id="rb-max-' + c.id + '" data-rub="maxScore" data-rub-id="' + c.id + '" value="' + c.maxScore + '" min="1" max="20" /></label>'
          + '</div></div>'
          + '<button class="jury-remove" data-remove-criterion="' + c.id + '" aria-label="Remove criterion">' + ic('trash-2', 15) + '</button></div>';
      }).join('');
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Evaluation', title: 'Create rubric' })
        + F.formSection({ title: 'Rubric details', eyebrow: 'Setup', children:
          F.textField({ id: 'rb-name', label: 'Rubric name', value: s.rubricName, required: true, error: s.errors.rubricName, placeholder: 'e.g. Hackathon judging criteria' })
          + F.selectInput({ id: 'rb-event', label: 'Linked event', value: s.event, options: eventTitles() }) })
        + F.formSection({ title: 'Scoring criteria', eyebrow: 'Dimensions', children:
          (s.errors.criteria ? '<div class="form-error">' + WM.esc(s.errors.criteria) + '</div>' : '')
          + (s.errors.criteriaName ? '<div class="form-error">' + WM.esc(s.errors.criteriaName) + '</div>' : '')
          + '<div class="rubric-list">' + rows + '</div>'
          + '<div class="rubric-weight-total' + (tw !== 100 ? ' weight-error' : '') + '">Total weight: <strong>' + tw + '%</strong> ' + (tw !== 100 ? '<span>(must equal 100%)</span>' : '') + '</div>'
          + (s.errors.weight ? '<span class="field-error">' + WM.esc(s.errors.weight) + '</span>' : '')
          + '<button type="button" class="button button-secondary" data-add-criterion>' + ic('plus', 15) + ' Add criterion</button>' })
        + F.formStatus(s.status, s.statusMsg)
        + F.formActions({ onSubmit: true, loading: s.loading, submitLabel: 'Create rubric', saveLabel: 'Save draft' })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function payload(status) {
      return {
        rubricName: s.rubricName.trim(),
        eventId: s.eventId,
        event: s.event,
        status: status,
        criteria: s.criteria.map(function (c) {
          return { name: c.name.trim(), description: c.description, weight: Number(c.weight) || 0, maxScore: Number(c.maxScore) || 10 };
        }),
      };
    }

    function save(status, successMsg) {
      s.loading = true; s.status = 'loading'; draw();
      global.WMApi.rubrics.create(payload(status)).then(function () {
        s.loading = false; s.status = 'success'; s.statusMsg = successMsg;
        draw();
      }, function (err) {
        s.loading = false; s.status = 'error';
        s.statusMsg = (err && err.message) || 'We could not save the rubric.';
        draw();
      });
    }

    function wire() {
      const name = document.getElementById('rb-name');
      if (name) name.addEventListener('input', function () { s.rubricName = name.value; if (s.errors.rubricName) { s.errors.rubricName = undefined; draw('rb-name', name.selectionStart); } });
      const ev = document.getElementById('rb-event');
      if (ev) ev.addEventListener('change', function () {
        s.event = ev.value;
        const match = D.events.find(function (e) { return e.title === ev.value; });
        s.eventId = match ? match.id : '';
        draw();
      });
      document.querySelectorAll('[data-rub]').forEach(function (input) {
        input.addEventListener('input', function () {
          const id = input.getAttribute('data-rub-id'), field = input.getAttribute('data-rub');
          const c = s.criteria.find(function (x) { return String(x.id) === id; });
          if (c) c[field] = field === 'weight' || field === 'maxScore' ? Number(input.value) : input.value;
          draw(input.id, input.selectionStart);
        });
      });
      document.querySelectorAll('[data-remove-criterion]').forEach(function (b) {
        b.addEventListener('click', function () { s.criteria = s.criteria.filter(function (c) { return String(c.id) !== b.getAttribute('data-remove-criterion'); }); draw(); });
      });
      const add = document.querySelector('[data-add-criterion]');
      if (add) add.addEventListener('click', function () {
        s.criteria = s.criteria.concat([{ id: String(Date.now()), name: '', description: '', weight: 10, maxScore: 10 }]); draw();
      });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-action');
          if (action === 'reset') { s.status = 'idle'; s.statusMsg = ''; s.rubricName = ''; draw(); return; }
          if (action === 'save') {
            if (!s.rubricName.trim()) { s.errors.rubricName = 'Rubric name is required.'; draw(); return; }
            save('Draft', 'Rubric saved as draft.');
            return;
          }
          if (action !== 'submit') return;
          const e = {}, tw = totalWeight();
          if (!s.rubricName.trim()) e.rubricName = 'Rubric name is required.';
          if (s.criteria.length === 0) e.criteria = 'At least one criterion is required.';
          if (tw !== 100) e.weight = 'Weights must total 100% (currently ' + tw + '%).';
          if (s.criteria.some(function (c) { return !String(c.name).trim(); })) e.criteriaName = 'All criteria must have a name.';
          s.errors = e;
          if (Object.keys(e).length) { draw(); return; }
          save('Active', 'Rubric created and linked to event.');
        });
      });
    }

    WM.page({ route: '/forms/rubric', render: render, mounted: function () { wire(); }, load: load });
  }

  /* ===================== Scoring form ===================== */
  function scoringForm() {
    const s = {
      submissions: [], submission: '', submissionInfo: null, rubricId: '', criteria: [],
      scores: {}, overallComment: '', recommendation: '', conflict: false,
      errors: {}, status: 'idle', statusMsg: '', loading: false,
    };

    function load() {
      return D.ready().then(function () {
        return Promise.all([
          global.WMApi.submissions.list().catch(function () { return []; }),
          global.WMApi.rubrics.list().catch(function () { return []; }),
        ]);
      }).then(function (res) {
        s.submissions = asList(res[0], ['submissions']);
        const rubric = asList(res[1], ['rubrics'])[0] || null;
        s.rubricId = rubric ? rubric.id : '';
        s.criteria = ((rubric && rubric.criteria) || []).map(function (c) {
          return { id: c.id, name: c.name, max: c.maxScore || 10, weight: c.weight != null ? c.weight + '%' : '' };
        });
        s.criteria.forEach(function (c) { s.scores[c.id] = 0; });
        if (s.submissions.length) selectSubmission(labelOf(s.submissions[0]));
        return null;
      });
    }

    function labelOf(sub) {
      const team = sub.teamName || sub.team || '';
      const project = sub.projectTitle || sub.title || sub.project || '';
      return (team && project) ? team + ' \u2014 ' + project : (team || project || String(sub.id || ''));
    }

    function selectSubmission(label) {
      s.submission = label;
      const sub = s.submissions.find(function (x) { return labelOf(x) === label; }) || null;
      s.submissionInfo = sub ? {
        team: sub.teamName || sub.team || '', track: sub.track || '', submitted: sub.submittedAt || sub.submitted_at || '',
      } : null;
    }

    function render() {
      if (s.status === 'success') {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('check', 24) + '</div>'
          + '<h3>Scores submitted</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<button class="button button-secondary" data-action="reset">Score next submission</button></div>';
      }
      const totalScore = s.criteria.reduce(function (sum, c) { return sum + (s.scores[c.id] || 0); }, 0);
      const maxTotal = s.criteria.reduce(function (sum, c) { return sum + c.max; }, 0);
      const items = s.criteria.map(function (c) {
        return '<div class="scoring-item"><div class="scoring-item-head"><strong>' + WM.esc(c.name) + '</strong><span>Weight: ' + WM.esc(c.weight) + '</span></div>'
          + F.scoreInput({ id: c.id, label: 'Score', value: s.scores[c.id] || 0, max: c.max })
          + (s.errors['score-' + c.id] ? '<span class="field-error">' + WM.esc(s.errors['score-' + c.id]) + '</span>' : '') + '</div>';
      }).join('') || '<p class="lede">No rubric is available yet. Create a rubric before scoring submissions.</p>';
      const recs = ['Winner', 'Runner-up', 'Honorable mention'].map(function (r) {
        return '<button type="button" class="form-radio-card' + (s.recommendation === r ? ' form-radio-selected' : '') + '" data-rec="' + r + '">'
          + '<span class="form-radio-dot' + (s.recommendation === r ? ' form-radio-dot-on' : '') + '"></span><div><strong>' + r + '</strong></div></button>';
      }).join('');
      const info = s.submissionInfo || {};
      const subLabels = s.submissions.map(labelOf);
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Evaluation', title: 'Score submission' })
        + F.formSection({ title: 'Submission', eyebrow: 'Review', children:
          (subLabels.length
            ? F.selectInput({ id: 'sc-submission', label: 'Submission', value: s.submission, options: subLabels })
            : '<p class="lede">No submissions available yet.</p>')
          + '<div class="scoring-submission-info">'
          + '<div><span class="eyebrow">Team</span><strong>' + WM.esc(info.team || '\u2014') + '</strong></div>'
          + '<div><span class="eyebrow">Track</span><strong>' + WM.esc(info.track || '\u2014') + '</strong></div>'
          + '<div><span class="eyebrow">Submitted</span><strong>' + WM.esc(info.submitted || '\u2014') + '</strong></div></div>' })
        + F.formSection({ title: 'Scoring', eyebrow: 'Rubric', children:
          '<div class="scoring-list">' + items + '</div>'
          + '<div class="scoring-total">Total: <strong>' + totalScore + '/' + maxTotal + '</strong></div>' })
        + F.formSection({ title: 'Overall assessment', eyebrow: 'Feedback', children:
          '<div class="form-field-group"><div class="form-field-label-row"><label>Recommendation<span class="form-req">*</span></label></div>'
          + '<div class="form-radio-grid form-radio-cols-3">' + recs + '</div>'
          + (s.errors.recommendation ? '<span class="field-error">' + WM.esc(s.errors.recommendation) + '</span>' : '') + '</div>'
          + '<div class="form-field-group"><div class="form-field-label-row"><label>Overall comments<span class="form-req">*</span></label></div>'
          + '<textarea class="form-textarea" id="sc-comment" rows="4" placeholder="Provide summary feedback for the team...">' + WM.esc(s.overallComment) + '</textarea>'
          + (s.errors.comment ? '<span class="field-error">' + WM.esc(s.errors.comment) + '</span>' : '') + '</div>'
          + F.toggleField({ id: 'sc-conflict', label: 'I have a conflict of interest with this team', checked: s.conflict, hint: 'If yes, your scores will be excluded from the final tally.' }) })
        + F.formStatus(s.status, s.statusMsg)
        + F.formActions({ onSave: true, onSubmit: true, loading: s.loading, submitLabel: 'Submit scores', saveLabel: 'Save draft' })
        + '</div>';
    }

    function draw(focusId, sel) { WM.refreshContent(render, focusId, sel); wire(); }

    function payload(status) {
      const sub = s.submissions.find(function (x) { return labelOf(x) === s.submission; });
      return {
        submissionId: sub ? sub.id : '',
        eventId: sub ? sub.eventId : '',
        rubricId: s.rubricId,
        status: status,
        scores: s.scores,
        recommendation: s.recommendation,
        comment: s.overallComment,
        conflictOfInterest: s.conflict,
      };
    }

    function send(status, successMsg) {
      s.loading = true; s.status = 'loading'; draw();
      global.WMApi.scores.create(payload(status)).then(function () {
        s.loading = false; s.status = 'success'; s.statusMsg = successMsg;
        draw();
      }, function (err) {
        s.loading = false; s.status = 'error';
        s.statusMsg = (err && err.message) || 'We could not save your scores.';
        draw();
      });
    }

    function wire() {
      const sub = document.getElementById('sc-submission');
      if (sub) sub.addEventListener('change', function () { selectSubmission(sub.value); draw(); });
      document.querySelectorAll('[data-score]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-score');
          s.scores[id] = Number(b.getAttribute('data-index'));
          s.errors['score-' + id] = undefined; draw();
        });
      });
      document.querySelectorAll('[data-rec]').forEach(function (b) {
        b.addEventListener('click', function () { s.recommendation = b.getAttribute('data-rec'); s.errors.recommendation = undefined; draw(); });
      });
      const comment = document.getElementById('sc-comment');
      if (comment) comment.addEventListener('input', function () { s.overallComment = comment.value; if (s.errors.comment) { s.errors.comment = undefined; draw('sc-comment', comment.selectionStart); } });
      const conflict = document.getElementById('sc-conflict');
      if (conflict) conflict.addEventListener('click', function () { s.conflict = !s.conflict; draw(); });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-action');
          if (action === 'reset') {
            s.status = 'idle'; s.statusMsg = '';
            s.criteria.forEach(function (c) { s.scores[c.id] = 0; });
            s.overallComment = ''; s.recommendation = ''; s.conflict = false; draw(); return;
          }
          if (action === 'save') { send('Draft', 'Scores saved as draft.'); return; }
          if (action === 'cancel') { s.status = 'idle'; s.statusMsg = ''; draw(); return; }
          if (action !== 'submit') return;
          const e = {};
          if (!s.submission) e.submission = 'Please select a submission.';
          s.criteria.forEach(function (c) { if (!s.scores[c.id]) e['score-' + c.id] = 'Please score ' + c.name + '.'; });
          if (!s.recommendation) e.recommendation = 'Please select a recommendation.';
          if (!s.conflict && !s.overallComment.trim()) e.comment = 'Please provide overall feedback.';
          s.errors = e;
          if (Object.keys(e).length) { draw(); return; }
          send('Submitted', 'Scores submitted successfully.');
        });
      });
    }

    WM.page({ route: '/forms/scoring', render: render, mounted: function () { wire(); }, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.juryManagement = juryManagement;
  global.WMPages.juryAssignment = juryAssignment;
  global.WMPages.rubricForm = rubricForm;
  global.WMPages.scoringForm = scoringForm;
})(window);