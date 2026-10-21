/* Achievements & certificates page.
 *
 * Hosts can pick one of their events and see, for every active registration,
 * whether the participant is certificate-eligible (computed by the backend from
 * authoritative attendance/score/volunteer rows). They can batch-issue
 * certificates to everyone eligible, or run an achievement sync that rebuilds
 * participation + volunteer achievements.
 *
 * The bottom section shows the signed-in user's own achievements with a
 * per-row share toggle.
 */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;
  const Api = global.WMApi;

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

  function isTrue(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  // document.querySelectorAll can return null in the smoke harness; never assume.
  function qa(selector) {
    const node = document.querySelectorAll(selector);
    return node && typeof node.forEach === 'function' ? node : [];
  }

  function tone(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'cancelled' || s === 'rejected' || s === 'withdrawn') return 'red';
    if (s === 'waitlisted' || s === 'offered' || s === 'pending') return 'amber';
    if (s === 'confirmed' || s === 'registered') return 'green';
    return 'slate';
  }

  function achievementsPage() {
    const state = {
      eventId: '',
      eligibility: [],
      issueResult: null,
      syncResult: null,
      mine: null,
      summary: null,
      busy: '',
    };

    function eventTitle() {
      const events = D.events || [];
      for (let i = 0; i < events.length; i += 1) {
        if (String(events[i].id) === String(state.eventId)) return events[i].title;
      }
      return 'No event selected';
    }

    function eligibleRows() {
      return (state.eligibility || []).filter(function (r) { return isTrue(r.eligible); });
    }

    function ruleText(row) {
      const reasons = Array.isArray(row.reasons) ? row.reasons : [];
      const missing = Array.isArray(row.missing) ? row.missing : [];
      if (isTrue(row.eligible)) {
        if (reasons.length) return 'Satisfied: ' + reasons.join(', ');
        return 'Eligible';
      }
      if (missing.length) return 'Missing: ' + missing.join(', ');
      return row.note || 'Not eligible';
    }

    function attendanceVerified(row) {
      const evaluations = row.evaluations && typeof row.evaluations === 'object' ? row.evaluations : {};
      const att = evaluations.verified_attendance;
      if (att && typeof att === 'object') return isTrue(att.passed);
      const anyPassed = Object.keys(evaluations).some(function (k) {
        const e = evaluations[k];
        return e && typeof e === 'object' && isTrue(e.passed);
      });
      return anyPassed;
    }

    function renderStats() {
      const rows = state.eligibility || [];
      const eligible = eligibleRows().length;
      const total = rows.length;
      const summary = state.summary || {};
      return '<div class="stat-grid">'
        + ui.statCard({ label: 'Registrations reviewed', value: String(total), detail: 'Active registrations for the event', icon: 'users', accent: 'blue' })
        + ui.statCard({ label: 'Eligible for certificates', value: String(eligible), detail: 'Pass every configured rule', icon: 'award', accent: 'teal' })
        + ui.statCard({ label: 'My achievements', value: summary.total == null ? '\u2014' : String(summary.total), detail: (summary.shared == null ? '\u2014' : String(summary.shared)) + ' shared publicly', icon: 'sparkles', accent: 'amber' })
        + '</div>';
    }

    function renderEligibility() {
      const rows = state.eligibility || [];
      if (!state.eventId) {
        return ui.emptyView({
          title: 'Pick an event',
          description: 'Select one of your events to check certificate eligibility.',
        });
      }
      if (!rows.length) {
        return ui.emptyView({
          title: 'No registrations to review',
          description: 'This event has no active registrations yet, so there is nobody to issue certificates to.',
        });
      }

      const body = rows.map(function (row, index) {
        const eligible = isTrue(row.eligible);
        const verified = attendanceVerified(row);
        const evaluations = row.evaluations && typeof row.evaluations === 'object' ? row.evaluations : {};
        const ruleKeys = Array.isArray(row.rules) ? row.rules : Object.keys(evaluations);
        const ruleBadges = ruleKeys.map(function (key) {
          const ev = evaluations[key];
          if (ev && typeof ev === 'object') {
            const ok = isTrue(ev.passed);
            const detail = ev.supported === false ? 'rule not supported' : (ev.passed === null ? 'not evaluated' : (ok ? 'passed' : 'not met'));
            return ui.badge(key + ': ' + detail, ok ? 'green' : (ev.passed === null ? 'slate' : 'amber'));
          }
          return ui.badge(key, 'slate');
        }).join(' ');

        return '<tr data-row="' + index + '">'
          + '<td><strong>' + esc(row.name || 'Unnamed participant') + '</strong>'
          + (row.email ? '<br><small class="mono">' + esc(row.email) + '</small>' : '') + '</td>'
          + '<td>' + esc(ruleText(row)) + '</td>'
          + '<td>' + (verified ? ui.badge('Verified', 'green') : ui.badge('Not verified', 'slate')) + '</td>'
          + '<td>' + (eligible ? ui.badge('Eligible', 'green') : ui.badge('Not eligible', 'red')) + '</td>'
          + '<td><div class="chip-row">' + (ruleBadges || '<span class="muted-dash">\u2014</span>') + '</div></td>'
          + '<td>' + ui.statusChip(row.status || '\u2014') + '</td>'
          + '</tr>';
      }).join('');

      return '<section class="panel table-panel"><div class="data-table-wrap"><table class="data-table"><thead><tr>'
        + '<th>Participant</th><th>Reason / rules satisfied</th><th>Attendance</th><th>Eligibility</th><th>Rule detail</th><th>Registration</th>'
        + '</tr></thead><tbody>' + body + '</tbody></table></div></section>';
    }

    function issueResultHTML() {
      const r = state.issueResult;
      if (!r) return '';
      const skipped = Array.isArray(r.skipped) ? r.skipped : [];
      const skippedList = skipped.length
        ? '<details class="panel" style="margin-top:12px"><summary>' + skipped.length + ' skipped</summary>'
          + '<ul class="plain-list">' + skipped.map(function (s) {
            return '<li>' + esc(s.userId || 'participant') + ' \u2014 ' + esc(s.reason || 'not eligible') + '</li>';
          }).join('') + '</ul></details>'
        : '';
      return WM.forms.formStatus('success', 'Issued ' + (r.issued == null ? 0 : r.issued) + ' certificate(s).')
        + skippedList;
    }

    function syncResultHTML() {
      const r = state.syncResult;
      if (!r) return '';
      return WM.forms.formStatus('success', 'Achievement sync complete: ' + (r.created == null ? 0 : r.created) + ' created, ' + (r.existing == null ? 0 : r.existing) + ' already existed.');
    }

    function renderAchievementCards() {
      const mine = state.mine || {};
      const list = Array.isArray(mine.achievements) ? mine.achievements : [];
      if (!list.length) {
        return ui.emptyView({
          title: 'No achievements yet',
          description: 'Achievements appear here as you participate, volunteer or earn certificates.',
        });
      }
      return '<div class="activity-list">' + list.map(function (a) {
        const shared = isTrue(a.shared);
        return '<div class="activity-item"><span class="activity-icon activity-blue">' + ic(shared ? 'share-2' : 'lock', 15) + '</span>'
          + '<div><strong>' + esc(a.title || a.kind || 'Achievement') + '</strong>'
          + '<span>' + esc(a.detail || '') + '</span>'
          + '<small>' + esc(a.eventTitle || '') + (a.time ? ' \u00b7 ' + esc(a.time) : '') + '</small>'
          + (a.credentialId ? '<small class="mono">' + esc(a.credentialId) + '</small>' : '')
          + '</div>'
          + '<button class="button button-secondary" data-share="' + esc(a.id) + '" data-shared="' + (shared ? '1' : '0') + '">'
          + (shared ? 'Shared' : 'Private') + '</button></div>';
      }).join('') + '</div>';
    }

    function render() {
      const events = D.events || [];
      const noEvents = events.length === 0;

      const selector = noEvents
        ? '<label class="select-field">' + ic('calendar-days', 16)
          + '<select id="ach-event" disabled><option>No events available</option></select>' + ic('chevron-down', 15) + '</label>'
        : '<label class="select-field">' + ic('calendar-days', 16) + '<select id="ach-event">'
          + events.map(function (e) {
            return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
              + esc(e.title) + '</option>';
          }).join('')
          + '</select>' + ic('chevron-down', 15) + '</label>';

      const eligible = eligibleRows().length;
      const actions = '<div class="chip-row">'
        + '<button class="button button-primary" id="ach-issue"' + (noEvents || !eligible || state.busy === 'issue' ? ' disabled' : '') + '>'
        + ic('award', 16) + ' Issue certificates to eligible (' + eligible + ')</button>'
        + '<button class="button button-secondary" id="ach-sync"' + (noEvents || state.busy === 'sync' ? ' disabled' : '') + '>'
        + ic('refresh-cw', 16) + ' Achievement sync</button>'
        + '</div>';

      const mineSummary = state.summary || {};
      const mineSection = '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Evaluation', title: 'My achievements' })
        + '<p class="lede">Your personal record of participation, volunteering and certificates.</p>'
        + renderAchievementCards()
        + '</section>';

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Evaluation', title: 'Achievements & certificates', action: selector })
        + '<p class="lede">Eligibility is computed by the backend from attendance, results, submissions and volunteer records \u2014 never guessed.</p>'
        + renderStats()
        + '<section class="panel"><div class="section-heading"><div><h2>Certificate eligibility \u2014 ' + esc(eventTitle()) + '</h2></div>' + actions + '</div>'
        + '<p class="lede">Participants below passed every rule configured for this event. Issuing is a human decision.</p>'
        + issueResultHTML() + syncResultHTML()
        + renderEligibility()
        + '</section>'
        + mineSection
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function loadEligibility() {
      if (!state.eventId) { state.eligibility = []; return Promise.resolve(); }
      return Api.achievements.eligibility(state.eventId).then(function (data) {
        state.eligibility = asList(data, ['eligibility', 'participants', 'rows']);
        return null;
      }, function () { state.eligibility = []; return null; });
    }

    function doIssue() {
      if (!state.eventId) { WM.toast('Select an event first.', 'warning'); return; }
      state.busy = 'issue'; state.issueResult = null; refresh();
      Api.achievements.issueEligible(state.eventId, {}).then(function (data) {
        state.busy = '';
        state.issueResult = data && typeof data === 'object' ? data : { issued: 0, skipped: [] };
        WM.toast('Issued ' + (state.issueResult.issued == null ? 0 : state.issueResult.issued) + ' certificate(s).');
        return loadEligibility();
      }, function (err) {
        state.busy = ''; refresh();
        WM.toast((err && err.message) || 'Could not issue certificates.', 'error');
      }).then(function () { refresh(); });
    }

    function doSync() {
      if (!state.eventId) { WM.toast('Select an event first.', 'warning'); return; }
      state.busy = 'sync'; state.syncResult = null; refresh();
      Api.achievements.sync(state.eventId, {}).then(function (data) {
        state.busy = '';
        state.syncResult = data && typeof data === 'object' ? data : { created: 0, existing: 0 };
        WM.toast('Achievements synced.');
        return loadMine(false);
      }, function (err) {
        state.busy = ''; refresh();
        WM.toast((err && err.message) || 'Could not sync achievements.', 'error');
      }).then(function () { refresh(); });
    }

    function reloadMine() {
      return loadMine(false).then(function () { refresh(); });
    }

    function loadMine(showAll) {
      return Api.achievements.mine(showAll ? { all: 1 } : undefined).then(function (data) {
        state.mine = data && typeof data === 'object' ? data : { achievements: [] };
        return null;
      }, function () { state.mine = { achievements: [] }; return null; });
    }

    function loadSummary() {
      return Api.achievements.summary().then(function (data) {
        state.summary = data && typeof data === 'object' ? data : {};
        return null;
      }, function () { state.summary = {}; return null; });
    }

    function wire() {
      const sel = document.getElementById('ach-event');
      if (sel) sel.addEventListener('change', function () {
        state.eventId = sel.value;
        state.issueResult = null; state.syncResult = null;
        loadEligibility().then(refresh);
      });
      const issue = document.getElementById('ach-issue');
      if (issue) issue.addEventListener('click', doIssue);
      const sync = document.getElementById('ach-sync');
      if (sync) sync.addEventListener('click', doSync);
      qa('[data-share]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-share');
          const shared = b.getAttribute('data-shared') === '1';
          b.disabled = true;
          Api.achievements.share(id, { shared: !shared }).then(function () {
            WM.toast(!shared ? 'Achievement shared.' : 'Achievement made private.');
            return reloadMine();
          }, function (err) {
            b.disabled = false;
            WM.toast((err && err.message) || 'Could not update sharing.', 'error');
          });
        });
      });
    }

    function load() {
      return D.ready().then(function () {
        const events = D.events || [];
        if (events.length) state.eventId = events[0].id;
        return Promise.all([loadEligibility(), loadMine(false), loadSummary()]);
      }, function () {
        state.eligibility = [];
        return Promise.all([loadMine(false), loadSummary()]);
      });
    }

    WM.page({ route: '/achievements', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.achievements = achievementsPage;
})(window);
