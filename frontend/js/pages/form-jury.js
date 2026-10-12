/* Jury management, assignment, rubric + scoring forms — ports JuryForms.tsx */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, F = WM.forms, ui = WM.ui;

  const POOL = [
    { id: '1', name: 'Dr. Sarah Lin', email: 'sarah.lin@univ.edu', expertise: 'AI & Machine Learning', status: 'Confirmed' },
    { id: '2', name: 'Marcus Webb', email: 'marcus.webb@studio.co', expertise: 'Product Design', status: 'Pending' },
    { id: '3', name: 'Prof. Aisha Rahman', email: 'a.rahman@inst.org', expertise: 'Sustainability', status: 'Confirmed' },
    { id: '4', name: 'Daniel Cho', email: 'daniel.cho@tech.io', expertise: 'Civic Tech', status: 'Confirmed' },
    { id: '5', name: 'Elena Vasquez', email: 'elena@startup.co', expertise: 'Business & Strategy', status: 'Confirmed' },
  ];
  function av(name) { return name.split(' ').map(function (n) { return n[0]; }).join('').slice(0, 2); }

  function juryManagement() {
    const s = {
      name: '', email: '', expertise: '', errors: {}, status: 'idle', statusMsg: '', loading: false,
      members: [
        { id: '1', name: 'Dr. Sarah Lin', email: 'sarah.lin@univ.edu', expertise: 'AI & Machine Learning', status: 'Confirmed' },
        { id: '2', name: 'Marcus Webb', email: 'marcus.webb@studio.co', expertise: 'Product Design', status: 'Pending' },
        { id: '3', name: 'Prof. Aisha Rahman', email: 'a.rahman@inst.org', expertise: 'Sustainability', status: 'Confirmed' },
      ],
    };

    function render() {
      const rows = s.members.map(function (m) {
        return '<div class="jury-row"><div class="jury-avatar">' + WM.esc(av(m.name)) + '</div>'
          + '<div class="jury-info"><strong>' + WM.esc(m.name) + '</strong><span>' + WM.esc(m.email) + ' \u00b7 ' + WM.esc(m.expertise) + '</span></div>'
          + ui.badge(m.status, m.status === 'Confirmed' ? 'green' : 'amber')
          + '<button class="jury-remove" data-remove="' + m.id + '" aria-label="Remove member">' + ic('x', 16) + '</button></div>';
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
        + F.formSection({ title: 'Current jury', eyebrow: 'Roster', children: '<div class="jury-list">' + rows + '</div>' })
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
        b.addEventListener('click', function () { s.members = s.members.filter(function (m) { return m.id !== b.getAttribute('data-remove'); }); draw(); });
      });
      const add = document.querySelector('[data-action="add"]');
      if (add) add.addEventListener('click', function () {
        const e = {};
        if (!s.name.trim()) e.name = 'Name is required.';
        if (!s.email.trim()) e.email = 'Email is required.';
        else if (!/^\S+@\S+\.\S+$/.test(s.email)) e.email = 'Enter a valid email address.';
        if (!s.expertise) e.expertise = 'Please select an area of expertise.';
        s.errors = e;
        if (Object.keys(e).length) { draw(); return; }
        s.loading = true; draw();
        window.setTimeout(function () {
          s.loading = false;
          s.members = s.members.concat([{ id: String(Date.now()), name: s.name, email: s.email, expertise: s.expertise, status: 'Pending' }]);
          s.name = ''; s.email = ''; s.expertise = '';
          s.status = 'success'; s.statusMsg = 'Jury member added and invitation sent.';
          draw();
        }, 600);
      });
    }

    WM.page({ route: '/forms/jury-management', render: render, mounted: function () { wire(); } });
  }

  function juryAssignment() {
    const s = {
      event: 'Zero Origin Hackathon', track: 'All tracks', panelSize: '3', search: '',
      assigned: ['1', '3'], status: 'idle', statusMsg: '', loading: false,
    };

    function render() {
      if (s.status === 'success') {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('gavel', 24) + '</div>'
          + '<h3>Jury panel assigned</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<button class="button button-secondary" data-action="reset">Assign another panel</button></div>';
      }
      const filtered = POOL.filter(function (m) { return m.name.toLowerCase().indexOf(s.search.toLowerCase()) !== -1; });
      const rows = filtered.map(function (m) {
        const on = s.assigned.indexOf(m.id) !== -1;
        return '<button type="button" class="jury-assign-row' + (on ? ' assigned' : '') + '" data-assign="' + m.id + '">'
          + '<div class="jury-avatar">' + WM.esc(av(m.name)) + '</div>'
          + '<div class="jury-info"><strong>' + WM.esc(m.name) + '</strong><span>' + WM.esc(m.expertise) + '</span></div>'
          + '<span class="jury-check' + (on ? ' checked' : '') + '">' + (on ? ic('check', 14, 'stroke-width="3"') : '') + '</span></button>';
      }).join('');
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Administration', title: 'Jury assignment' })
        + F.formSection({ title: 'Assignment details', eyebrow: 'Configure', children:
          '<div class="form-grid-2">'
          + F.selectInput({ id: 'ja-event', label: 'Event', value: s.event, options: ['Zero Origin Hackathon', 'Campus Sustainability Summit', 'AI Ethics Roundtable'] })
          + F.selectInput({ id: 'ja-track', label: 'Track / category', value: s.track, options: ['All tracks', 'AI & ML', 'Sustainability', 'Civic tech'] })
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
      const selects = { 'ja-event': 'event', 'ja-track': 'track', 'ja-panel': 'panelSize' };
      Object.keys(selects).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', function () { s[selects[id]] = el.value; draw(); });
      });
      document.querySelectorAll('[data-assign]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-assign');
          s.assigned = s.assigned.indexOf(id) !== -1 ? s.assigned.filter(function (a) { return a !== id; }) : s.assigned.concat([id]);
          draw();
        });
      });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.getAttribute('data-action') === 'reset') { s.status = 'idle'; s.statusMsg = ''; draw(); return; }
          if (b.getAttribute('data-action') !== 'submit') return;
          if (s.assigned.length === 0) { s.status = 'error'; s.statusMsg = 'At least one jury member must be assigned.'; draw(); return; }
          s.loading = true; s.status = 'loading'; draw();
          window.setTimeout(function () { s.loading = false; s.status = 'success'; s.statusMsg = s.assigned.length + ' jury members assigned to ' + s.event + '.'; draw(); }, 800);
        });
      });
    }

    WM.page({ route: '/forms/jury-assignment', render: render, mounted: function () { wire(); } });
  }

  function rubricForm() {
    const s = {
      rubricName: '', event: 'Zero Origin Hackathon',
      criteria: [
        { id: '1', name: 'Innovation', description: 'Originality and creativity of the solution', weight: 30, maxScore: 10 },
        { id: '2', name: 'Technical execution', description: 'Quality of implementation and code', weight: 30, maxScore: 10 },
        { id: '3', name: 'Impact', description: 'Potential real-world impact', weight: 25, maxScore: 10 },
        { id: '4', name: 'Presentation', description: 'Clarity and effectiveness of the pitch', weight: 15, maxScore: 10 },
      ],
      errors: {}, status: 'idle', statusMsg: '', loading: false,
    };

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
          + F.selectInput({ id: 'rb-event', label: 'Linked event', value: s.event, options: ['Zero Origin Hackathon', 'Campus Sustainability Summit', 'AI Ethics Roundtable'] }) })
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

    function wire() {
      const name = document.getElementById('rb-name');
      if (name) name.addEventListener('input', function () { s.rubricName = name.value; if (s.errors.rubricName) { s.errors.rubricName = undefined; draw('rb-name', name.selectionStart); } });
      const ev = document.getElementById('rb-event');
      if (ev) ev.addEventListener('change', function () { s.event = ev.value; draw(); });
      document.querySelectorAll('[data-rub]').forEach(function (input) {
        input.addEventListener('input', function () {
          const id = input.getAttribute('data-rub-id'), field = input.getAttribute('data-rub');
          const c = s.criteria.find(function (x) { return x.id === id; });
          if (c) c[field] = field === 'weight' || field === 'maxScore' ? Number(input.value) : input.value;
          draw(input.id, input.selectionStart);
        });
      });
      document.querySelectorAll('[data-remove-criterion]').forEach(function (b) {
        b.addEventListener('click', function () { s.criteria = s.criteria.filter(function (c) { return c.id !== b.getAttribute('data-remove-criterion'); }); draw(); });
      });
      const add = document.querySelector('[data-add-criterion]');
      if (add) add.addEventListener('click', function () {
        s.criteria = s.criteria.concat([{ id: String(Date.now()), name: '', description: '', weight: 10, maxScore: 10 }]); draw();
      });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-action');
          if (action === 'reset') { s.status = 'idle'; s.rubricName = ''; draw(); return; }
          if (action !== 'submit') return;
          const e = {}, tw = totalWeight();
          if (!s.rubricName.trim()) e.rubricName = 'Rubric name is required.';
          if (s.criteria.length === 0) e.criteria = 'At least one criterion is required.';
          if (tw !== 100) e.weight = 'Weights must total 100% (currently ' + tw + '%).';
          if (s.criteria.some(function (c) { return !c.name.trim(); })) e.criteriaName = 'All criteria must have a name.';
          s.errors = e;
          if (Object.keys(e).length) { draw(); return; }
          s.loading = true; s.status = 'loading'; draw();
          window.setTimeout(function () { s.loading = false; s.status = 'success'; s.statusMsg = 'Rubric created and linked to event.'; draw(); }, 800);
        });
      });
    }

    WM.page({ route: '/forms/rubric', render: render, mounted: function () { wire(); } });
  }

  function scoringForm() {
    const CRITERIA = [
      { id: '1', name: 'Innovation', max: 10, weight: '30%' },
      { id: '2', name: 'Technical execution', max: 10, weight: '30%' },
      { id: '3', name: 'Impact', max: 10, weight: '25%' },
      { id: '4', name: 'Presentation', max: 10, weight: '15%' },
    ];
    const s = {
      submission: 'Team Nexus \u2014 CarbonTrace', scores: { '1': 0, '2': 0, '3': 0, '4': 0 },
      overallComment: '', recommendation: '', conflict: false, errors: {}, status: 'idle', statusMsg: '', loading: false,
    };

    function render() {
      if (s.status === 'success') {
        return '<div class="form-success-screen"><div class="success-icon">' + ic('check', 24) + '</div>'
          + '<h3>Scores submitted</h3><p>' + WM.esc(s.statusMsg) + '</p>'
          + '<button class="button button-secondary" data-action="reset">Score next submission</button></div>';
      }
      const totalScore = CRITERIA.reduce(function (sum, c) { return sum + (s.scores[c.id] || 0); }, 0);
      const maxTotal = CRITERIA.reduce(function (sum, c) { return sum + c.max; }, 0);
      const items = CRITERIA.map(function (c) {
        return '<div class="scoring-item"><div class="scoring-item-head"><strong>' + c.name + '</strong><span>Weight: ' + c.weight + '</span></div>'
          + F.scoreInput({ id: c.id, label: 'Score', value: s.scores[c.id] || 0, max: c.max })
          + (s.errors['score-' + c.id] ? '<span class="field-error">' + WM.esc(s.errors['score-' + c.id]) + '</span>' : '') + '</div>';
      }).join('');
      const recs = ['Winner', 'Runner-up', 'Honorable mention'].map(function (r) {
        return '<button type="button" class="form-radio-card' + (s.recommendation === r ? ' form-radio-selected' : '') + '" data-rec="' + r + '">'
          + '<span class="form-radio-dot' + (s.recommendation === r ? ' form-radio-dot-on' : '') + '"></span><div><strong>' + r + '</strong></div></button>';
      }).join('');
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Evaluation', title: 'Score submission' })
        + F.formSection({ title: 'Submission', eyebrow: 'Review', children:
          F.selectInput({ id: 'sc-submission', label: 'Submission', value: s.submission, options: ['Team Nexus \u2014 CarbonTrace', 'Team Spark \u2014 EduFlow', 'Team Aurora \u2014 GreenGrid', 'Team Forge \u2014 CivicPulse'] })
          + '<div class="scoring-submission-info">'
          + '<div><span class="eyebrow">Team</span><strong>Team Nexus</strong></div>'
          + '<div><span class="eyebrow">Track</span><strong>Sustainability</strong></div>'
          + '<div><span class="eyebrow">Submitted</span><strong>Oct 18, 6:02 PM</strong></div></div>' })
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

    function wire() {
      const sub = document.getElementById('sc-submission');
      if (sub) sub.addEventListener('change', function () { s.submission = sub.value; draw(); });
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
          if (action === 'reset') { s.status = 'idle'; s.scores = { '1': 0, '2': 0, '3': 0, '4': 0 }; s.overallComment = ''; s.recommendation = ''; draw(); return; }
          if (action === 'save') { s.loading = true; draw(); window.setTimeout(function () { s.loading = false; s.status = 'success'; s.statusMsg = 'Scores saved as draft.'; draw(); }, 500); return; }
          if (action === 'cancel') { s.status = 'idle'; s.statusMsg = ''; draw(); return; }
          if (action !== 'submit') return;
          const e = {};
          CRITERIA.forEach(function (c) { if (!s.scores[c.id]) e['score-' + c.id] = 'Please score ' + c.name + '.'; });
          if (!s.recommendation) e.recommendation = 'Please select a recommendation.';
          if (!s.conflict && !s.overallComment.trim()) e.comment = 'Please provide overall feedback.';
          s.errors = e;
          if (Object.keys(e).length) { draw(); return; }
          s.loading = true; s.status = 'loading'; draw();
          window.setTimeout(function () { s.loading = false; s.status = 'success'; s.statusMsg = 'Scores submitted successfully.'; draw(); }, 800);
        });
      });
    }

    WM.page({ route: '/forms/scoring', render: render, mounted: function () { wire(); } });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.juryManagement = juryManagement;
  global.WMPages.juryAssignment = juryAssignment;
  global.WMPages.rubricForm = rubricForm;
  global.WMPages.scoringForm = scoringForm;
})(window);
