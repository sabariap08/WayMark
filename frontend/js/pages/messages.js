/* Messages & email jobs page */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const WMApi = global.WMApi;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui, F = WM.forms;

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      var keys = ['items', 'data', 'results'];
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(value[keys[i]])) return value[keys[i]];
      }
    }
    return [];
  }

  function messagesPage() {
    const state = {
      eventId: '',
      template: 'Registration confirmation',
      audience: 'All registrants',
      subject: '',
      body: '',
      jobs: [],
      mail: [],
    };

    var TEMPLATES = ['Registration confirmation', 'Waitlist offer', 'Reminder', 'Results released', 'Certificate ready', 'Custom'];
    var AUDIENCES = ['All registrants', 'Confirmed only', 'Waitlisted', 'Jury members', 'Custom list'];

    function normalizeJobs(list) {
      return (list || []).map(function (j) {
        return {
          id: j.id != null ? j.id : '',
          label: j.subject || j.template || j.name || 'Message',
          recipients: j.recipients != null ? j.recipients
            : (j.recipientCount != null ? j.recipientCount : (j.audience || '')),
          status: j.status || 'Queued',
          time: j.time || j.createdAt || j.timestamp || '',
        };
      });
    }

    function fetchJobs() {
      if (!state.eventId) { return Promise.resolve(); }
      return WMApi.events.jobs(state.eventId).then(function (data) {
        state.jobs = normalizeJobs(asList(data));
      }, function () { /* keep local jobs / empty */ });
    }

    function fetchMails() {
      return WMApi.messages.list().then(function (data) {
        state.mail = asList(data);
      }, function () { /* outbox unavailable */ });
    }

    function load() {
      return D.ready().then(function () {
        var events = D.events || [];
        if (events.length) state.eventId = events[0].id;
        return fetchJobs();
      }).then(fetchMails);
    }

    function jobClass(status) {
      var s = String(status || '').toLowerCase();
      if (s === 'sent' || s === 'done' || s === 'completed') return 'job-done';
      if (s === 'failed' || s === 'error') return 'job-failed';
      return 'job-queued';
    }

    function jobIcon(status) {
      var s = String(status || '').toLowerCase();
      if (s === 'sent' || s === 'done' || s === 'completed') return 'check-circle-2';
      if (s === 'failed' || s === 'error') return 'alert-circle';
      return 'clock';
    }

    function eventSelect() {
      var events = D.events || [];
      if (!events.length) {
        return '<label class="select-field">' + ic('calendar-days', 16)
          + '<select id="msg-event" disabled><option>No events available</option></select>' + ic('chevron-down', 15) + '</label>';
      }
      return '<label class="select-field">' + ic('calendar-days', 16) + '<select id="msg-event">'
        + events.map(function (e) {
          return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
            + esc(e.title) + '</option>';
        }).join('')
        + '</select>' + ic('chevron-down', 15) + '</label>';
    }

    function render() {
      var jobs = state.jobs || [];
      var queued = 0, sent = 0, failed = 0;
      jobs.forEach(function (j) {
        var st = String(j.status || '').toLowerCase();
        if (st === 'failed' || st === 'error') failed++;
        else if (st === 'sent' || st === 'done' || st === 'completed') sent++;
        else queued++;
      });
      var chips = '<div class="chip-row">'
        + ui.badge(queued + ' queued', 'amber')
        + ui.badge(sent + ' sent', 'green')
        + ui.badge(failed + ' failed', 'red')
        + '</div>';

      var compose = '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Compose', title: 'Compose message' })
        + F.selectInput({ id: 'msg-template', label: 'Template', value: state.template, options: TEMPLATES })
        + F.selectInput({ id: 'msg-audience', label: 'Audience', value: state.audience, options: AUDIENCES })
        + F.textField({ id: 'msg-subject', label: 'Subject', value: state.subject, placeholder: 'Email subject line' })
        + F.textArea({ id: 'msg-body', label: 'Message body', value: state.body, rows: 7, placeholder: 'Write your message...' })
        + '<div class="chip-row">'
        + '<button class="button button-secondary" data-ai-draft>' + ic('sparkles', 15) + ' Draft with AI</button>'
        + '<button class="button button-primary" data-queue-send>' + ic('send', 15) + ' Queue send</button>'
        + '</div></section>';

      var jobRows = jobs.length
        ? '<div class="activity-list">' + jobs.map(function (j) {
          var st = String(j.status || '').toLowerCase();
          var isFailed = st === 'failed' || st === 'error';
          return '<div class="activity-item">'
            + '<span class="activity-icon activity-blue">' + ic(jobIcon(j.status), 15) + '</span>'
            + '<div><strong>' + esc(j.label) + '</strong><span>' + esc(j.recipients) + ' recipients \u00b7 ' + esc(j.time) + '</span></div>'
            + '<span class="job-status ' + jobClass(j.status) + '">' + esc(j.status) + '</span>'
            + (isFailed ? '<button class="button button-ghost" data-retry="' + esc(j.id) + '">Retry</button>' : '')
            + '</div>';
        }).join('') + '</div>'
        : '<p class="lede">No jobs queued yet.</p>';

      var history = '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Outbox', title: 'Job history' })
        + jobRows
        + '</section>';

      var mail = state.mail || [];
      var mailRows = mail.length
        ? '<div class="activity-list">' + mail.map(function (m) {
          var st = String(m.status || 'Stored').toLowerCase();
          var tone = st === 'sent' ? 'green' : (st === 'failed' ? 'red' : 'amber');
          return '<div class="activity-item">'
            + '<span class="activity-icon activity-blue">' + ic('mail', 15) + '</span>'
            + '<div><strong>' + esc(m.subject || '(no subject)') + '</strong><span>' + esc(m.to || '')
            + (m.kind ? ' \u00b7 ' + esc(m.kind) : '') + (m.time ? ' \u00b7 ' + esc(m.time) : '') + '</span></div>'
            + ui.badge(m.status || 'Stored', tone)
            + '</div>';
        }).join('') + '</div>'
        : '<p class="lede">No mail yet. Messages sent from this page and system emails (OTP codes, receipts, certificates) are captured here, even when email delivery is not configured.</p>';

      var outboxPanel = '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Message section', title: 'Mail outbox' })
        + mailRows
        + '</section>';

      var note = '<section class="panel"><p class="lede">Sending uses <code>/events/{id}/messages</code>; the outbox reads <code>/messages</code> '
        + '(every email is stored in-app). AI drafting uses <code>/ai/draft-message</code>. '
        + 'Jobs retry uses <code>/admin/jobs/{id}/retry</code>.</p></section>';

      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Hosting', title: 'Messages & jobs', action: '<div>' + eventSelect() + chips + '</div>' })
        + '<div class="content-grid">' + compose + history + '</div>'
        + outboxPanel
        + note
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function draftWithAI() {
      WMApi.ai.draftMessage({
        template: state.template,
        audience: state.audience,
        subject: state.subject,
        eventId: state.eventId,
      }).then(function (data) {
        var d = data || {};
        var subject = d.subject || (d.message && d.message.subject) || '';
        var body = d.body || d.content || (d.message && d.message.body) || '';
        if (subject) state.subject = subject;
        if (body) state.body = body;
        WM.toast('Draft inserted.');
        refresh();
      }, function (err) {
        WM.toast((err && err.message) || 'Could not draft a message.', 'error');
      });
    }

    function queueSend() {
      if (!state.eventId) { WM.toast('Choose an event first.', 'warning'); return; }
      if (!String(state.subject).trim() || !String(state.body).trim()) {
        WM.toast('Add a subject and message body before sending.', 'warning');
        return;
      }
      WMApi.events.sendMessage(state.eventId, {
        template: state.template,
        audience: state.audience,
        subject: state.subject,
        body: state.body,
      }).then(function (data) {
        var n = (data && data.recipients) || 0;
        WM.toast('Message sent to ' + n + ' recipient' + (n === 1 ? '' : 's') + '.');
        state.subject = '';
        state.body = '';
        return fetchJobs().then(fetchMails);
      }).then(refresh, function (err) {
        WM.toast((err && err.message) || 'Could not send the message.', 'error');
      });
    }

    function wire() {
      var ev = document.getElementById('msg-event');
      if (ev) ev.addEventListener('change', function () {
        state.eventId = ev.value;
        fetchJobs().then(refresh, refresh);
      });
      var t = document.getElementById('msg-template');
      if (t) t.addEventListener('change', function () { state.template = t.value; refresh(); });
      var a = document.getElementById('msg-audience');
      if (a) a.addEventListener('change', function () { state.audience = a.value; refresh(); });
      var subj = document.getElementById('msg-subject');
      if (subj) subj.addEventListener('input', function () { state.subject = subj.value; });
      var body = document.getElementById('msg-body');
      if (body) body.addEventListener('input', function () { state.body = body.value; });
      var ai = document.querySelector('[data-ai-draft]');
      if (ai) ai.addEventListener('click', draftWithAI);
      var q = document.querySelector('[data-queue-send]');
      if (q) q.addEventListener('click', queueSend);
      document.querySelectorAll('[data-retry]').forEach(function (b) {
        b.addEventListener('click', function () {
          WMApi.jobs.retry(b.getAttribute('data-retry')).then(function () {
            WM.toast('Retry requested.');
            refresh();
          }, function (err) {
            WM.toast((err && err.message) || 'Something went wrong.', 'error');
          });
        });
      });
    }

    WM.page({ route: '/messages', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.messages = messagesPage;
})(window);
