/* Event workspace — 10-tab operations board (route /workspace) */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

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

  function dataTable(headers, rows) {
    return '<div class="data-table-wrap"><table class="data-table"><thead><tr>'
      + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('')
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function eventWorkspacePage() {
    const TABS = ['Overview', 'Registrations', 'Verification exceptions', 'Attendance', 'Jury & rubric',
      'Scores & results', 'Messages & jobs', 'Feedback', 'Certificates', 'Reports'];
    const state = { selectedId: '', tab: 'Overview', data: {}, released: false };

    function events() { return D.events || []; }

    function selectedEvent() {
      const list = events();
      if (!list.length) return null;
      return list.find(function (e) { return String(e.id) === String(state.selectedId); }) || list[0];
    }

    function eventId() { const ev = selectedEvent(); return ev ? ev.id : ''; }

    function regName(r) {
      return r.name || r.participantName || r.participant || r.eventTitle || 'Participant';
    }

    function certsForEvent(ev) {
      return (D.certificates || []).filter(function (c) {
        if (c.eventId != null && ev.id != null) return String(c.eventId) === String(ev.id);
        return !!c.eventTitle && c.eventTitle === ev.title;
      });
    }

    function fallbackExceptions() {
      return (D.registrations || []).filter(function (r) { return r.attendanceStatus === 'Exception'; });
    }

    function ensure(key, getPromise) {
      if (state.data[key]) return Promise.resolve();
      const promise = typeof getPromise === 'function' ? getPromise() : getPromise;
      return promise.then(
        function (v) { state.data[key] = asList(v); refresh(); },
        function (err) {
          state.data[key] = [];
          WM.toast((err && err.message) || 'Could not load data.', 'error');
          refresh();
        }
      );
    }

    function ensureExceptions() {
      if (state.data.exceptions) return;
      const id = eventId();
      if (!id) { state.data.exceptions = fallbackExceptions(); return; }
      global.WMApi.events.exceptions(id).then(
        function (v) {
          const list = asList(v, ['exceptions']);
          state.data.exceptions = list.length ? list : fallbackExceptions();
          refresh();
        },
        function () {
          state.data.exceptions = fallbackExceptions();
          refresh();
        }
      );
    }

    function load() {
      return D.ready().then(function () {
        const list = events();
        if (list.length && !state.selectedId) state.selectedId = list[0].id;
        return null;
      });
    }

    function header() {
      const ev = selectedEvent();
      const status = ev ? (ev.approvalStatus || ev.status || '') : '';
      const options = events().map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.selectedId) ? ' selected' : '') + '>'
          + esc(e.title) + '</option>';
      }).join('');
      return '<div class="welcome-row"><div><div class="eyebrow">Host workspace</div><h1>Event workspace</h1>'
        + '<p class="lede">Operate the full event lifecycle from one board.</p></div>'
        + '<div class="heading-actions">'
        + '<label class="select-field">' + ic('calendar-days', 16) + '<select id="ws-event">' + options + '</select>' + ic('chevron-down', 16) + '</label>'
        + WM.statusChip(status)
        + '<a class="button button-secondary" href="wizard.html">' + ic('pencil', 15) + ' Edit</a>'
        + '<a class="button button-secondary" href="event-detail.html?id=' + encodeURIComponent(ev ? ev.id : '') + '">' + ic('external-link', 15) + ' Public page</a>'
        + '<a class="button button-primary" href="results.html">' + ic('trophy', 15) + ' Open results</a>'
        + '</div></div>';
    }

    function tabsBar() {
      return '<div class="workspace-tabs">' + TABS.map(function (t) {
        return '<button class="workspace-tab' + (t === state.tab ? ' workspace-tab-active' : '') + '" data-wstab="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>';
    }

    /* ---------- Overview ---------- */
    function overviewTab() {
      const ev = selectedEvent();
      const regs = (D.registrations || []).filter(function (r) { return String(r.eventId) === String(ev.id); });
      const logs = (D.attendanceLogs || []).filter(function (a) { return String(a.eventId) === String(ev.id); });
      const checkedIn = logs.filter(function (a) { return a.status === 'Checked in'; }).length;
      const fb = (D.feedback || []).filter(function (f) { return String(f.eventId) === String(ev.id); });
      const certs = certsForEvent(ev);
      const capacity = ev.capacityNum != null ? ev.capacityNum : (ev.capacity || 0);
      const activities = (D.recentActivities || []).slice(0, 5);

      const activityHTML = activities.length
        ? '<div class="activity-list">' + activities.map(function (a) {
          return '<div class="activity-item"><span class="activity-icon activity-' + esc(a.tone || 'blue') + '">' + ic(a.icon || 'activity', 16) + '</span>'
            + '<div><strong>' + esc(a.title) + '</strong><span>' + esc(a.detail || '') + '</span></div>'
            + '<time>' + esc(a.time || '') + '</time></div>';
        }).join('') + '</div>'
        : ui.emptyView({ title: 'No recent activity', description: 'Participant and operational activity will appear here.' });

      return '<div class="page-stack">'
        + '<div class="stat-grid">'
        + ui.statCard({ label: 'Registered', value: String(regs.length) + (capacity ? ' / ' + capacity : ''), detail: capacity ? Math.round((regs.length / capacity) * 100) + '% of capacity' : 'No capacity set', icon: 'users', accent: 'blue' })
        + ui.statCard({ label: 'Checked in', value: String(checkedIn), detail: regs.length ? Math.round((checkedIn / regs.length) * 100) + '% attendance' : 'No registrations yet', icon: 'clipboard-check', accent: 'teal' })
        + ui.statCard({ label: 'Feedback', value: String(fb.length), detail: 'Responses collected', icon: 'message-square', accent: 'amber' })
        + ui.statCard({ label: 'Certificates issued', value: String(certs.length), detail: 'Ready to download', icon: 'award', accent: 'rose' })
        + '</div>'
        + '<section class="panel">' + ui.sectionHeading({ eyebrow: 'Timeline', title: 'Recent activity' }) + activityHTML + '</section>'
        + '</div>';
    }

    /* ---------- Registrations ---------- */
    function registrationsTab() {
      const ev = selectedEvent();
      const all = D.registrations || [];
      let list = all.filter(function (r) { return String(r.eventId) === String(ev.id); });
      const fellBack = !list.length && all.length > 0;
      if (fellBack) list = all;
      const note = fellBack ? '<p class="lede">No registrations matched this event, showing all registrations.</p>' : '';
      const rows = list.map(function (r) {
        return '<tr><td>' + esc(regName(r)) + '</td>'
          + '<td>' + WM.statusChip(r.status || 'Registered') + '</td>'
          + '<td>' + esc(r.attendanceStatus || '\u2014') + '</td>'
          + '<td><span class="mono">' + esc(r.ticketCode || '\u2014') + '</span></td>'
          + '<td>' + esc(r.registeredAt || r.date || '') + '</td></tr>';
      }).join('');
      const table = list.length
        ? dataTable(['Participant', 'Status', 'Attendance', 'Ticket code', 'Registered'], rows)
        : ui.emptyView({ title: 'No registrations yet', description: 'Registrations for this event will appear here.' });
      return '<div class="page-stack">' + note + '<section class="panel table-panel">' + table + '</section></div>';
    }

    /* ---------- Verification exceptions ---------- */
    function exceptionsTab() {
      const list = state.data.exceptions || [];
      if (!list.length) {
        return ui.emptyView({ title: 'No verification exceptions', description: 'All detected entries are clean.' });
      }
      const rows = list.map(function (x) {
        return '<tr><td>' + esc(x.type || 'Exception') + '</td>'
          + '<td>' + esc(regName(x)) + '</td>'
          + '<td>' + esc(x.detectedAt || x.time || x.timestamp || '') + '</td>'
          + '<td>' + WM.statusChip(x.status || 'Exception') + '</td>'
          + '<td><button class="button button-secondary" data-override="' + esc(x.id || x.registrationId || '') + '">Override</button></td></tr>';
      }).join('');
      return '<div class="page-stack"><section class="panel table-panel">'
        + ui.sectionHeading({ eyebrow: 'Verification', title: 'Exceptions' })
        + dataTable(['Type', 'Participant', 'Detected', 'Status', ''], rows) + '</section></div>';
    }

    function overrideModal(regId) {
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<div class="modal-icon">' + ic('shield-alert', 21) + '</div>'
        + '<div class="eyebrow">Verification exception</div><h2>Override exception</h2>'
        + '<p>Provide a reason for overriding this exception before continuing.</p>'
        + WM.forms.textArea({ id: 'ov-reason', label: 'Reason for override', value: '', rows: 3, placeholder: 'Explain why this exception is being overridden...' })
        + '<div class="modal-actions"><button class="button button-secondary" data-close-modal>Cancel</button>'
        + '<button class="button button-primary" data-override-confirm="' + esc(regId) + '">Confirm override</button></div>'
        + '</section></div>';
    }

    /* ---------- Attendance ---------- */
    function attendanceTab() {
      const ev = selectedEvent();
      const fallback = (D.attendanceLogs || []).filter(function (a) { return String(a.eventId) === String(ev.id); });
      const logs = (state.data.attendance && state.data.attendance.length) ? state.data.attendance : fallback;
      const checked = logs.filter(function (a) { return a.status === 'Checked in'; }).length;
      const rows = logs.slice(0, 25).map(function (a) {
        return '<tr><td>' + esc(a.participantName || a.name || '\u2014') + '</td>'
          + '<td>' + esc(a.session || '\u2014') + '</td>'
          + '<td>' + esc(a.method || '\u2014') + '</td>'
          + '<td>' + esc(a.timestamp || a.time || '') + '</td></tr>';
      }).join('');
      const table = logs.length
        ? dataTable(['Participant', 'Session', 'Method', 'Time'], rows)
        : ui.emptyView({ title: 'No check-ins yet', description: 'Scanned check-ins will appear here as participants arrive.' });
      return '<div class="page-stack">'
        + '<div class="stat-grid compact">'
        + ui.statCard({ label: 'Check-ins', value: String(checked), detail: logs.length + ' logged entries', icon: 'clipboard-check', accent: 'teal' })
        + '</div>'
        + '<div class="heading-actions">'
        + '<a class="button button-secondary" href="scanner.html">' + ic('scan-line', 15) + ' Open scanner</a>'
        + '<a class="button button-secondary" href="forms-attendance.html">' + ic('clipboard-check', 15) + ' Attendance form</a>'
        + '</div>'
        + '<section class="panel table-panel">' + table + '</section></div>';
    }

    /* ---------- Jury & rubric ---------- */
    function juryTab() {
      const ev = selectedEvent();
      const assignments = (D.juryAssignments || []).filter(function (j) { return String(j.eventId) === String(ev.id); });
      const juryRows = assignments.map(function (j) {
        return '<tr><td>' + esc(j.juryName || j.name || '\u2014') + '</td>'
          + '<td>' + esc(j.expertise || '\u2014') + '</td>'
          + '<td>' + WM.statusChip(j.status || 'Assigned') + '</td></tr>';
      }).join('');
      const juryTable = assignments.length
        ? dataTable(['Jury member', 'Expertise', 'Status'], juryRows)
        : ui.emptyView({ title: 'No jury assigned', description: 'Assign jury members to evaluate submissions.' });

      const rubric = (D.rubrics || []).find(function (r) { return String(r.eventId) === String(ev.id); }) || null;
      const criteria = rubric && rubric.criteria ? rubric.criteria : [];
      const critRows = criteria.map(function (c) {
        return '<tr><td>' + esc(c.name || '\u2014') + '</td>'
          + '<td class="num">' + esc(c.weight != null ? c.weight : '') + '</td>'
          + '<td class="num">' + esc(c.maxScore != null ? c.maxScore : '') + '</td></tr>';
      }).join('');
      const rubricHTML = criteria.length
        ? dataTable(['Criterion', 'Weight', 'Max'], critRows)
        : ui.emptyView({ title: 'No rubric configured', description: 'Build a rubric to score submissions consistently.' });

      return '<div class="page-stack">'
        + '<div class="heading-actions">'
        + '<a class="button button-secondary" href="forms-jury-management.html">' + ic('scale', 15) + ' Jury panel</a>'
        + '<a class="button button-secondary" href="forms-rubric.html">' + ic('list-checks', 15) + ' Rubric builder</a>'
        + '</div>'
        + '<section class="panel table-panel">' + ui.sectionHeading({ eyebrow: 'Evaluation', title: 'Jury assignments' }) + juryTable + '</section>'
        + '<section class="panel table-panel">' + ui.sectionHeading({ eyebrow: rubric && rubric.rubricName ? rubric.rubricName : 'Scoring', title: 'Scoring rubric' }) + rubricHTML + '</section>'
        + '</div>';
    }

    /* ---------- Scores & results ---------- */
    function resultsTab() {
      const list = D.leaderboard || [];
      const scores = list.map(function (i) { return Number(i.score) || 0; });
      const max = scores.length ? Math.max.apply(null, scores) : 0;
      const min = scores.length ? Math.min.apply(null, scores) : 0;
      const wide = max > 0 && (max - min) / max > 0.2;
      const spreadHTML = wide ? '<span class="spread-flag">' + ic('alert-triangle', 12) + ' Wide score spread \u2014 review before release</span>' : '';
      const rows = list.map(function (i) {
        return '<tr><td><span class="rank-cell">' + esc(i.rank != null ? i.rank : '') + '</span></td>'
          + '<td><strong>' + esc(i.teamName || '\u2014') + '</strong><br><small>' + esc(i.projectTitle || '') + '</small></td>'
          + '<td>' + esc(i.track || '\u2014') + '</td>'
          + '<td class="num">' + esc(i.score != null ? i.score : '') + (i.maxScore != null ? ' / ' + esc(i.maxScore) : '') + '</td>'
          + '<td>' + (i.award ? ui.badge(i.award, i.tone || 'blue') : '') + '</td></tr>';
      }).join('');
      const table = list.length
        ? dataTable(['Rank', 'Team / project', 'Track', 'Score', 'Award'], rows)
        : ui.emptyView({ title: 'No scores yet', description: 'Scores will appear once jury evaluation is complete.' });
      const status = state.released ? 'Results released' : 'Not released';
      return '<div class="page-stack"><section class="panel table-panel">'
        + ui.sectionHeading({ eyebrow: 'Results', title: 'Scores & results', action: '<div class="heading-actions">' + spreadHTML + WM.statusChip(status)
          + '<button class="button button-primary" data-release>' + ic('trophy', 15) + ' Release results</button></div>' })
        + table + '</section></div>';
    }

    function releaseModal() {
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<div class="modal-icon">' + ic('trophy', 21) + '</div>'
        + '<div class="eyebrow">Release results</div><h2>Publish final rankings?</h2>'
        + '<p>Participants will see rankings. This cannot be undone.</p>'
        + '<div class="modal-actions"><button class="button button-secondary" data-close-modal>Cancel</button>'
        + '<button class="button button-primary" data-release-confirm>Release results</button></div>'
        + '</section></div>';
    }

    /* ---------- Messages & jobs ---------- */
    function jobChip(status) {
      const s = String(status || '').toLowerCase();
      const cls = s === 'failed' ? 'job-failed' : (s === 'queued' || s === 'pending' ? 'job-queued' : 'job-done');
      return '<span class="job-status ' + cls + '">' + ic('circle', 10) + esc(status || 'Queued') + '</span>';
    }

    function jobsTab() {
      const jobs = state.data.jobs || [];
      const rows = jobs.map(function (j) {
        const failed = String(j.status || '').toLowerCase() === 'failed';
        return '<tr><td><strong>' + esc(j.subject || j.templateName || j.template || 'Message') + '</strong></td>'
          + '<td>' + esc(j.recipientCount != null ? j.recipientCount : (j.recipients || j.count || 0)) + '</td>'
          + '<td>' + jobChip(j.status) + '</td>'
          + '<td>' + esc(j.time || j.createdAt || j.updatedAt || '') + '</td>'
          + '<td>' + (failed ? '<button class="button button-secondary" data-retry-job="' + esc(j.id || '') + '">Retry</button>' : '') + '</td></tr>';
      }).join('');
      const table = jobs.length
        ? dataTable(['Template / subject', 'Recipients', 'Status', 'Time', ''], rows)
        : ui.emptyView({ title: 'No message jobs', description: 'Email and notification jobs for this event will appear here.' });
      return '<div class="page-stack">'
        + '<div class="heading-actions"><a class="button button-secondary" href="messages.html">' + ic('send', 15) + ' Messages & jobs</a></div>'
        + '<section class="panel table-panel">' + ui.sectionHeading({ eyebrow: 'Delivery', title: 'Messages & jobs' }) + table + '</section></div>';
    }

    /* ---------- Feedback ---------- */
    function stars(value) {
      const v = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
      let out = '';
      for (let i = 0; i < 5; i += 1) out += (i < v ? '\u2605' : '\u2606');
      return out;
    }

    function condense(text) {
      const s = String(text == null ? '' : text);
      return s.length > 120 ? s.slice(0, 117) + '\u2026' : (s || '\u2014');
    }

    function feedbackTab() {
      const ev = selectedEvent();
      const list = (D.feedback || []).filter(function (f) { return String(f.eventId) === String(ev.id); });
      const avg = list.length
        ? list.reduce(function (sum, f) { return sum + (Number(f.overallRating) || 0); }, 0) / list.length
        : 0;
      const cards = list.map(function (f) {
        return '<div class="report-card"><div><strong>' + esc(stars(f.overallRating)) + '</strong>'
          + '<p>' + esc(condense(f.whatWorked)) + '</p></div>'
          + '<small>' + esc(f.submittedAt || '') + '</small></div>';
      }).join('');
      const body = list.length
        ? '<div class="report-card-grid">' + cards + '</div>'
        : ui.emptyView({ title: 'No feedback yet', description: 'Feedback responses will appear here after the event.' });
      return '<div class="page-stack">'
        + '<div class="stat-grid compact">'
        + ui.statCard({ label: 'Average rating', value: avg ? avg.toFixed(1) + ' / 5' : '\u2014', detail: list.length + ' responses', icon: 'star', accent: 'amber' })
        + '</div>' + body + '</div>';
    }

    /* ---------- Certificates ---------- */
    function certificatesTab() {
      const ev = selectedEvent();
      const list = certsForEvent(ev);
      const rows = list.map(function (c) {
        return '<tr><td>' + esc(c.recipientName || c.recipient || '\u2014') + '</td>'
          + '<td><span class="mono">' + esc(c.credentialId || '\u2014') + '</span></td>'
          + '<td>' + WM.statusChip(c.status || 'Valid') + '</td></tr>';
      }).join('');
      const table = list.length
        ? dataTable(['Recipient', 'Credential ID', 'Status'], rows)
        : ui.emptyView({ title: 'No certificates issued', description: 'Generate certificates for eligible participants.' });
      return '<div class="page-stack">'
        + '<div class="heading-actions">'
        + '<button class="button button-primary" data-certificates>' + ic('award', 15) + ' Issue certificates</button>'
        + '<a class="button button-secondary" href="forms-certificates.html">' + ic('file-check-2', 15) + ' Certificate form</a>'
        + '</div>'
        + '<section class="panel table-panel">' + ui.sectionHeading({ eyebrow: 'Credentials', title: 'Certificates' }) + table + '</section></div>';
    }

    /* ---------- Reports ---------- */
    function reportsTab() {
      const reports = [
        ['Registration list', 'Who signed up and their details', 'registrations'],
        ['Attendance', 'Check-in counts and timing', 'attendance'],
        ['No-shows', 'Registered but did not attend', 'no-shows'],
        ['Scores & results', 'Rankings and award allocation', 'scores'],
        ['Feedback', 'Participant experience and ratings', 'feedback'],
        ['Certificates', 'Issued credentials and status', 'certificates'],
      ];
      const cards = reports.map(function (r) {
        return '<div class="report-card"><strong>' + esc(r[0]) + '</strong><p>' + esc(r[1]) + '</p>'
          + '<a class="button button-secondary" href="reports.html?report=' + encodeURIComponent(r[2]) + '">' + ic('external-link', 14) + ' Open report</a></div>';
      }).join('');
      return '<div class="page-stack"><div class="report-card-grid">' + cards + '</div></div>';
    }

    function tabBody() {
      switch (state.tab) {
        case 'Registrations': return registrationsTab();
        case 'Verification exceptions': return exceptionsTab();
        case 'Attendance': return attendanceTab();
        case 'Jury & rubric': return juryTab();
        case 'Scores & results': return resultsTab();
        case 'Messages & jobs': return jobsTab();
        case 'Feedback': return feedbackTab();
        case 'Certificates': return certificatesTab();
        case 'Reports': return reportsTab();
        default: return overviewTab();
      }
    }

    function render() {
      if (!events().length) {
        return '<div class="page-stack">'
          + ui.sectionHeading({ eyebrow: 'Host workspace', title: 'Event workspace' })
          + ui.emptyView({ title: 'No events yet', description: 'Create your first event to open the workspace.', action: '<a class="button button-primary" href="wizard.html">Create event</a>' })
          + '</div>';
      }
      return '<div class="page-stack">' + header() + tabsBar() + tabBody() + '</div>';
    }

    function refresh(focusId) { WM.refreshContent(render, focusId); wire(); }

    function wire() {
      const sel = document.getElementById('ws-event');
      if (sel) sel.addEventListener('change', function () {
        state.selectedId = sel.value;
        state.data = {};
        refresh();
      });
      document.querySelectorAll('[data-wstab]').forEach(function (b) {
        b.addEventListener('click', function () { state.tab = b.getAttribute('data-wstab'); refresh(); });
      });

      if (eventId()) {
        if (state.tab === 'Verification exceptions') ensureExceptions();
        if (state.tab === 'Attendance') ensure('attendance', function () { return global.WMApi.events.attendance(eventId()); });
        if (state.tab === 'Messages & jobs') ensure('jobs', function () { return global.WMApi.events.jobs(eventId()); });
      }

      document.querySelectorAll('[data-override]').forEach(function (b) {
        b.addEventListener('click', function () { WM.openModal(overrideModal(b.getAttribute('data-override'))); });
      });
      const overrideConfirm = document.querySelector('[data-override-confirm]');
      if (overrideConfirm) overrideConfirm.addEventListener('click', function () {
        const id = overrideConfirm.getAttribute('data-override-confirm');
        const reasonEl = document.getElementById('ov-reason');
        const reason = reasonEl ? reasonEl.value : '';
        global.WMApi.registrations.override(id, { reason: reason, status: 'Overridden' }).then(
          function () {
            WM.closeModal(); state.data.exceptions = null;
            WM.toast('Exception overridden.'); refresh();
          },
          function (err) { WM.toast((err && err.message) || 'Something went wrong.', 'error'); }
        );
      });

      const release = document.querySelector('[data-release]');
      if (release) release.addEventListener('click', function () { WM.openModal(releaseModal()); });
      const releaseConfirm = document.querySelector('[data-release-confirm]');
      if (releaseConfirm) releaseConfirm.addEventListener('click', function () {
        global.WMApi.events.releaseResults(eventId()).then(
          function () {
            WM.closeModal(); state.released = true;
            WM.toast('Results released'); refresh();
          },
          function (err) { WM.toast((err && err.message) || 'Something went wrong.', 'error'); }
        );
      });

      const cert = document.querySelector('[data-certificates]');
      if (cert) cert.addEventListener('click', function () {
        global.WMApi.events.generateCertificates(eventId()).then(
          function () { WM.toast('Certificates generated.'); refresh(); },
          function (err) { WM.toast((err && err.message) || 'Something went wrong.', 'error'); }
        );
      });

      document.querySelectorAll('[data-retry-job]').forEach(function (b) {
        b.addEventListener('click', function () {
          global.WMApi.jobs.retry(b.getAttribute('data-retry-job')).then(
            function () { WM.toast('Job retried.'); state.data.jobs = null; refresh(); },
            function (err) { WM.toast((err && err.message) || 'Something went wrong.', 'error'); }
          );
        });
      });
    }

    WM.page({ route: '/workspace', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.eventWorkspace = eventWorkspacePage;
})(window);
