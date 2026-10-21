(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui, forms = WM.forms;

  const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
  const TRANSITIONS = {
    'Open': ['Investigating', 'Resolved', 'Closed'],
    'Investigating': ['Resolved'],
    'Resolved': ['Closed'],
    'Closed': [],
  };

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const keys = ['items', 'data', 'results', 'incidents', 'sessions'];
      for (let i = 0; i < keys.length; i += 1) {
        if (Array.isArray(value[keys[i]])) return value[keys[i]];
      }
    }
    return [];
  }

  function objOf(value) {
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  }

  function metric(obj, key) {
    const value = obj ? obj[key] : 0;
    return (typeof value === 'number' && isFinite(value)) ? value : 0;
  }

  function qsa(selector) {
    const nodes = document.querySelectorAll(selector);
    if (!nodes || !nodes.length) return [];
    return Array.prototype.slice.call(nodes);
  }

  function notify(message, type) {
    try { WM.toast(message, type || 'success'); } catch (e) { /* noop */ }
  }

  function messageOf(err, fallback) {
    return (err && err.message) ? err.message : fallback;
  }

  function askConfirm(message) {
    try { return global.confirm ? global.confirm(message) : false; } catch (e) { return false; }
  }

  function askPrompt(message) {
    try { return global.prompt ? global.prompt(message) : null; } catch (e) { return null; }
  }

  function dataTable(headers, rows) {
    return '<div class="data-table-wrap"><table class="data-table"><thead><tr>'
      + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('')
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function errorView(title, message) {
    return ui.emptyView({
      title: title,
      description: message,
      action: '<button class="button button-primary" data-ops-refresh>Try again</button>',
    });
  }

  function severityTone(severity) {
    if (severity === 'Critical') return 'red';
    if (severity === 'High') return 'amber';
    if (severity === 'Medium') return 'blue';
    return 'slate';
  }

  function statusTone(status) {
    if (status === 'Open') return 'amber';
    if (status === 'Investigating') return 'blue';
    if (status === 'Resolved') return 'green';
    return 'slate';
  }

  function describeChange(data) {
    const result = objOf(data);
    const notified = typeof result.notified === 'number' ? result.notified : 0;
    const job = objOf(result.job);
    let text = 'Notified ' + notified + ' participant(s)';
    if (job.status) text += ' \u00b7 job ' + job.status;
    if (result.webhookQueued) text += ' \u00b7 webhook queued';
    return text + '.';
  }

  function operationsPage() {
    const state = {
      events: [], eventId: '', loadError: '',
      board: null, boardError: '',
      incidents: [], incidentsError: '',
      sessions: [], sessionsError: '',
      form: { title: '', severity: 'Medium', description: '', location: '' },
      formError: '', busy: false,
      changeResults: {}, changeBusy: '',
    };

    function currentEvent() {
      for (let i = 0; i < state.events.length; i += 1) {
        if (String(state.events[i].id) === String(state.eventId)) return state.events[i];
      }
      return null;
    }

    function canManage() {
      const ev = currentEvent();
      const user = (WM.Auth && WM.Auth.getUser) ? WM.Auth.getUser() : null;
      if (!ev || !user) return true;
      const role = String(user.roleKey || user.role || '').toLowerCase();
      if (role === 'admin' || role === 'administrator') return true;
      return String(ev.hostId || '') === String(user.id || '');
    }

    function eventOptions() {
      return state.events.map(function (e) {
        return '<option value="' + esc(e.id) + '"'
          + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
          + esc(e.title) + '</option>';
      }).join('');
    }

    function loadEventData() {
      const id = state.eventId;
      if (!id) {
        state.board = null; state.incidents = []; state.sessions = [];
        return Promise.resolve();
      }
      return Promise.all([
        global.WMApi.operations.board(id).then(function (data) {
          state.board = (data && typeof data === 'object' && !Array.isArray(data)) ? data : null;
          state.boardError = '';
        }, function (err) {
          state.board = null;
          state.boardError = messageOf(err, 'Could not load the operations board.');
        }),
        global.WMApi.operations.incidents(id).then(function (rows) {
          state.incidents = asList(rows);
          state.incidentsError = '';
        }, function (err) {
          state.incidents = [];
          state.incidentsError = messageOf(err, 'Could not load incidents.');
        }),
        global.WMApi.scheduling.sessions(id).then(function (rows) {
          state.sessions = asList(rows);
          state.sessionsError = '';
        }, function (err) {
          state.sessions = [];
          state.sessionsError = messageOf(err, 'Could not load sessions.');
        }),
      ]);
    }

    function load() {
      return global.WMApi.events.list().then(function (events) {
        state.events = asList(events);
        if (state.events.length && !state.eventId) state.eventId = String(state.events[0].id);
        if (!state.eventId) return null;
        return loadEventData();
      }, function (err) {
        state.events = [];
        state.loadError = messageOf(err, 'Could not load your events.');
        return null;
      });
    }

    function header() {
      const ev = currentEvent();
      const board = objOf(state.board);
      const updated = String(board.updatedAt || '').replace('T', ' ').slice(0, 16);
      const selector = state.events.length
        ? '<label class="select-field">' + ic('calendar-days', 16) + '<select id="ops-event">'
          + eventOptions() + '</select>' + ic('chevron-down', 15) + '</label>'
        : '';
      return ui.sectionHeading({
        eyebrow: 'Live operations',
        title: 'Operations centre',
        action: selector
          + (updated ? ' <span class="chip">Updated ' + esc(updated) + ' UTC</span>' : '')
          + ' <button class="button button-secondary" data-ops-refresh>' + ic('refresh-cw', 15) + ' Refresh</button>'
          + (ev && ev.status ? ' ' + WM.statusChip(ev.status) : ''),
      });
    }

    function statCards() {
      const b = objOf(state.board);
      const attendance = objOf(b.attendance);
      const registrations = objOf(b.registrations);
      const sessions = objOf(b.sessions);
      const volunteers = objOf(b.volunteers);
      const tasks = objOf(b.tasks);
      const incidents = objOf(b.incidents);
      const jobs = objOf(b.jobs);
      const rooms = Array.isArray(b.rooms) ? b.rooms : [];
      const current = objOf(sessions.current);
      const upcoming = Array.isArray(sessions.upcoming) ? sessions.upcoming : [];
      const next = objOf(upcoming[0]);
      const onSite = rooms.reduce(function (sum, room) {
        return sum + (Number(room && room.occupied) || 0);
      }, 0);
      const utilisation = rooms.length ? rooms.reduce(function (sum, room) {
        return sum + (Number(room && room.percent) || 0);
      }, 0) / rooms.length : 0;
      const checkinRate = metric(attendance, 'checkinPercent');

      return '<div class="stat-grid">'
        + ui.statCard({
          label: 'Checked in',
          value: String(metric(attendance, 'checkedIn')),
          detail: checkinRate.toFixed(1) + '% of registrations',
          icon: 'clipboard-check', accent: 'teal',
        })
        + ui.statCard({
          label: 'Expected',
          value: String(metric(registrations, 'confirmed')),
          detail: metric(registrations, 'total') + ' registered \u00b7 '
            + metric(registrations, 'waitlisted') + ' waitlisted',
          icon: 'users', accent: 'blue',
        })
        + ui.statCard({
          label: 'On site now',
          value: String(onSite),
          detail: rooms.length + ' room(s) in use',
          icon: 'map-pin', accent: 'amber',
        })
        + ui.statCard({
          label: 'Volunteers active',
          value: String(metric(volunteers, 'active')),
          detail: metric(volunteers, 'total') + ' on the roster',
          icon: 'user-check', accent: 'teal',
        })
        + ui.statCard({
          label: 'Tasks open',
          value: String(metric(tasks, 'open')),
          detail: metric(tasks, 'overdue') + ' overdue \u00b7 ' + metric(tasks, 'blocked') + ' blocked',
          icon: 'list-todo', accent: 'amber',
        })
        + ui.statCard({
          label: 'Incidents open',
          value: String(metric(incidents, 'open')),
          detail: metric(incidents, 'critical') + ' critical \u00b7 '
            + metric(incidents, 'investigating') + ' investigating',
          icon: 'shield-alert', accent: 'rose',
        })
        + ui.statCard({
          label: 'Sessions today',
          value: String(metric(sessions, 'today')),
          detail: current.title
            ? 'Now: ' + current.title
            : (next.title ? 'Next: ' + next.title : metric(sessions, 'completed') + ' completed'),
          icon: 'calendar-days', accent: 'blue',
        })
        + ui.statCard({
          label: 'Room utilisation',
          value: rooms.length ? utilisation.toFixed(1) + '%' : '\u2014',
          detail: rooms.length ? 'Live bookings across rooms' : 'No rooms in use',
          icon: 'layout-grid', accent: 'rose',
        })
        + ui.statCard({
          label: 'Jobs queued',
          value: String(metric(jobs, 'queued')),
          detail: metric(jobs, 'failed') + ' failed \u00b7 ' + metric(jobs, 'sent') + ' sent',
          icon: 'send', accent: 'teal',
        })
        + '</div>';
    }

    function programmeItem(session, tag, icon, tone) {
      const item = objOf(session);
      const time = [item.startTime, item.endTime].filter(Boolean).join(' \u2013 ');
      const place = item.roomName || '';
      return '<div class="activity-item"><span class="activity-icon activity-' + esc(tone) + '">'
        + ic(icon, 16) + '</span>'
        + '<div><strong>' + esc(item.title || 'Session') + '</strong><span>' + esc(time)
        + (place ? ' \u00b7 ' + esc(place) : '') + '</span></div>'
        + '<time>' + esc(tag) + '</time></div>';
    }

    function programmePanel() {
      const b = objOf(state.board);
      const sessions = objOf(b.sessions);
      const current = objOf(sessions.current);
      const upcoming = Array.isArray(sessions.upcoming) ? sessions.upcoming : [];
      const delayed = Array.isArray(sessions.delayed) ? sessions.delayed : [];
      const items = [];
      if (current.id) items.push(programmeItem(current, 'Now', 'play-circle', 'blue'));
      upcoming.forEach(function (session) {
        items.push(programmeItem(session, 'Upcoming', 'clock', 'teal'));
      });
      delayed.forEach(function (session) {
        items.push(programmeItem(session, 'Delayed', 'alert-triangle', 'amber'));
      });
      const body = items.length
        ? '<div class="activity-list">' + items.join('') + '</div>'
        : '<p class="lede">No sessions are running or queued right now.</p>';
      return '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Live programme', title: 'Sessions running & next' })
        + body + '</section>';
    }

    function roomsPanel() {
      const b = objOf(state.board);
      const rooms = Array.isArray(b.rooms) ? b.rooms : [];
      const body = rooms.length
        ? dataTable(['Room', 'Session', 'Occupied', 'Capacity', 'Utilisation'], rooms.map(function (room) {
          const row = objOf(room);
          const percent = Number(row.percent) || 0;
          return '<tr><td><strong>' + esc(row.name || 'Room') + '</strong></td>'
            + '<td>' + esc(row.sessionTitle || '\u2014') + '</td>'
            + '<td class="num">' + esc(String(Number(row.occupied) || 0)) + '</td>'
            + '<td class="num">' + esc(String(Number(row.capacity) || 0)) + '</td>'
            + '<td><span class="mono">' + esc(percent.toFixed(1) + '%') + '</span></td></tr>';
        }).join(''))
        : ui.emptyView({
          title: 'No rooms in use',
          description: 'Room occupancy appears here while room bookings are live.',
        });
      return '<section class="panel table-panel">'
        + ui.sectionHeading({ eyebrow: 'Venues', title: 'Room utilisation' })
        + body + '</section>';
    }

    function incidentForm() {
      const f = state.form;
      return '<section class="panel">'
        + '<h3 class="section-title">Report an incident</h3>'
        + '<form id="incident-form">'
        + '<div class="form-grid">'
        + forms.textField({
          id: 'inc-title', label: 'Title', value: f.title, required: true,
          placeholder: 'Power outage in Hall A',
        })
        + forms.selectInput({
          id: 'inc-severity', label: 'Severity', options: SEVERITIES, value: f.severity,
        })
        + forms.textField({
          id: 'inc-location', label: 'Area / location', value: f.location,
          placeholder: 'Hall A, backstage',
        })
        + '</div>'
        + forms.textArea({
          id: 'inc-description', label: 'Description', value: f.description, rows: 3,
          placeholder: 'What happened, who is affected, and what has been done so far?',
        })
        + forms.formStatus(state.formError ? 'error' : 'idle', state.formError)
        + forms.formActions({
          showSave: false,
          submitLabel: state.busy ? 'Reporting\u2026' : 'Report incident',
          loading: state.busy,
        })
        + '</form></section>';
    }

    function incidentRow(incident) {
      const row = objOf(incident);
      const status = row.status || 'Open';
      const allowed = [status].concat(TRANSITIONS[status] || []);
      const statusControl = allowed.length > 1
        ? '<div class="form-input-wrap form-select-wrap"><select data-incident-status="'
          + esc(row.id) + '">' + allowed.map(function (option) {
            return '<option value="' + esc(option) + '"' + (option === status ? ' selected' : '')
              + '>' + esc(option) + '</option>';
          }).join('') + '</select>' + ic('chevron-down', 14, 'class="form-select-chevron"') + '</div>'
        : WM.statusChip(status);
      const critical = row.severity === 'Critical';
      return '<tr><td><strong>' + (critical ? ic('alert-triangle', 14) + ' ' : '')
        + esc(row.title || 'Incident') + '</strong>'
        + (row.location ? '<br><small>' + esc(row.location) + '</small>' : '')
        + (row.description ? '<br><small>' + esc(row.description) + '</small>' : '')
        + (row.assigneeName ? '<br><small>Owner: ' + esc(row.assigneeName) + '</small>' : '') + '</td>'
        + '<td>' + ui.badge(row.severity || 'Medium', severityTone(row.severity)) + '</td>'
        + '<td>' + ui.badge(status, statusTone(status)) + '</td>'
        + '<td>' + esc(row.time || row.createdAt || '') + '</td>'
        + '<td>' + statusControl + '</td>'
        + '<td>' + (canManage()
          ? '<button class="button button-ghost" data-incident-delete="' + esc(row.id) + '">Delete</button>'
          : '') + '</td></tr>';
    }

    function incidentsSection() {
      const criticalOpen = state.incidents.filter(function (incident) {
        const row = objOf(incident);
        return row.severity === 'Critical'
          && (row.status === 'Open' || row.status === 'Investigating');
      }).length;
      const openCount = state.incidents.filter(function (incident) {
        const row = objOf(incident);
        return row.status === 'Open' || row.status === 'Investigating';
      }).length;
      const banner = criticalOpen
        ? '<div class="form-error">' + ic('alert-triangle', 14) + ' ' + criticalOpen
          + ' critical incident(s) need immediate attention.</div>'
        : '';
      const body = state.incidents.length
        ? dataTable(['Incident', 'Severity', 'Status', 'Reported', 'Transition', ''], state.incidents.map(incidentRow).join(''))
        : ui.emptyView({
          title: 'No incidents logged',
          description: 'Report an incident above so the operations team can track it.',
        });
      return '<div class="page-stack">'
        + incidentForm()
        + '<section class="panel table-panel">'
        + ui.sectionHeading({
          eyebrow: 'Safety', title: 'Incidents',
          action: openCount ? ui.badge(openCount + ' open', 'amber') : ui.badge('All clear', 'green'),
        })
        + banner
        + (state.incidentsError && !state.incidents.length
          ? forms.formStatus('error', state.incidentsError) : '')
        + body + '</section></div>';
    }

    function changeResultHTML(sessionId) {
      const result = state.changeResults[String(sessionId)];
      if (!result) return '';
      return '<small>' + esc(describeChange(result)) + '</small>';
    }

    function changesSection() {
      const sessions = state.sessions;
      const action = '<button class="button button-secondary" data-ops-refresh>'
        + ic('refresh-cw', 15) + ' Reload sessions</button>';
      let body;
      if (state.sessionsError && !sessions.length) {
        body = errorView('Sessions unavailable', state.sessionsError);
      } else if (!sessions.length) {
        body = ui.emptyView({
          title: 'No sessions to publish',
          description: 'Add sessions to the schedule before notifying participants of changes.',
        });
      } else {
        body = dataTable(['Session', 'Day', 'Time', 'Room', 'Notify', ''], sessions.map(function (session) {
          const row = objOf(session);
          const time = (row.startTime || '\u2014') + (row.endTime ? ' \u2013 ' + row.endTime : '');
          const busy = String(state.changeBusy) === String(row.id);
          return '<tr><td><strong>' + esc(row.title || 'Session') + '</strong></td>'
            + '<td>' + esc(row.day || '\u2014') + '</td>'
            + '<td><span class="mono">' + esc(time) + '</span></td>'
            + '<td>' + esc(row.roomName || '\u2014') + '</td>'
            + '<td><div class="chip-row">'
            + '<button class="button button-secondary" data-notify="' + esc(row.id) + '"'
            + (busy ? ' disabled' : '') + '>' + ic('send', 14) + ' Notify participants</button>'
            + '<button class="button button-ghost" data-change-open="' + esc(row.id) + '"'
            + (busy ? ' disabled' : '') + '>Change time\u2026</button>'
            + '</div>' + changeResultHTML(row.id) + '</td>'
            + '<td>' + WM.statusChip(row.status || 'Draft') + '</td></tr>';
        }).join(''));
      }
      return '<section class="panel table-panel">'
        + ui.sectionHeading({ eyebrow: 'Communications', title: 'Propagate schedule change', action: action })
        + '<p class="lede">Publishing a change updates the session and notifies confirmed registrations through a message job.</p>'
        + body + '</section>';
    }

    function renderBoard() {
      if (state.boardError) return errorView('Operations board unavailable', state.boardError);
      if (!state.board) {
        return ui.emptyView({
          title: 'Operations board is empty',
          description: 'Live metrics will appear as soon as the board returns data.',
        });
      }
      return statCards();
    }

    function render() {
      if (state.loadError && !state.events.length) {
        return '<div class="page-stack">'
          + ui.sectionHeading({ eyebrow: 'Live operations', title: 'Operations centre' })
          + errorView('Events unavailable', state.loadError)
          + '</div>';
      }
      if (!state.events.length) {
        return '<div class="page-stack">'
          + ui.sectionHeading({ eyebrow: 'Live operations', title: 'Operations centre' })
          + ui.emptyView({
            title: 'No events to operate',
            description: 'Create or host an event before opening the operations centre.',
            action: '<a class="button button-primary" href="host-an-event.html">Host an Event</a>',
          })
          + '</div>';
      }
      return '<div class="page-stack">'
        + header() + renderBoard() + programmePanel() + roomsPanel()
        + incidentsSection() + changesSection()
        + '</div>';
    }

    function refresh() {
      WM.refreshContent(render);
      wire();
    }

    function bindFields(map) {
      Object.keys(map).forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        const apply = function () { state.form[map[id]] = el.value; };
        el.addEventListener('input', apply);
        el.addEventListener('change', apply);
      });
    }

    function saveIncident() {
      if (state.busy) return;
      if (!String(state.form.title || '').trim()) {
        state.formError = 'Incident title is required.';
        refresh();
        return;
      }
      state.busy = true;
      state.formError = '';
      refresh();
      const payload = {
        title: String(state.form.title).trim(),
        severity: state.form.severity || 'Medium',
        description: state.form.description || '',
        location: state.form.location || '',
      };
      global.WMApi.operations.createIncident(state.eventId, payload).then(function () {
        state.busy = false;
        state.form = { title: '', severity: 'Medium', description: '', location: '' };
        notify('Incident reported.');
        return loadEventData().then(refresh, refresh);
      }, function (err) {
        state.busy = false;
        state.formError = messageOf(err, 'Could not report the incident.');
        refresh();
      });
    }

    function publishChange(sessionId, payload) {
      if (state.changeBusy) return;
      state.changeBusy = String(sessionId);
      refresh();
      global.WMApi.operations.sessionChanges(sessionId, payload || {}).then(function (data) {
        state.changeBusy = '';
        state.changeResults[String(sessionId)] = data || {};
        try { WM.closeModal(); } catch (e) { /* noop */ }
        notify(describeChange(data));
        return loadEventData().then(refresh, refresh);
      }, function (err) {
        state.changeBusy = '';
        const message = messageOf(err, 'Could not publish the schedule change.');
        const box = document.getElementById('chg-msg');
        if (box) box.innerHTML = forms.formStatus('error', message);
        notify(message, 'error');
        refresh();
        const again = document.querySelector('[data-change-publish]');
        if (again) again.disabled = false;
      });
    }

    function changeModal(session) {
      const row = objOf(session);
      return '<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true">'
        + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
        + '<div class="modal-icon">' + ic('send', 21) + '</div>'
        + '<div class="eyebrow">Propagate change</div><h2>' + esc(row.title || 'Session') + '</h2>'
        + '<p>Update the slot and publish. Confirmed registrations are notified through a message job.</p>'
        + '<div class="form-grid">'
        + forms.textField({ id: 'chg-day', label: 'Day', type: 'date', value: row.day || '' })
        + forms.textField({ id: 'chg-start', label: 'Start time', type: 'time', value: row.startTime || '' })
        + forms.textField({ id: 'chg-end', label: 'End time', type: 'time', value: row.endTime || '' })
        + '</div>'
        + '<div id="chg-msg"></div>'
        + '<div class="modal-actions">'
        + '<button class="button button-secondary" data-close-modal>Cancel</button>'
        + '<button class="button button-primary" data-change-publish="' + esc(row.id) + '">Publish &amp; notify</button>'
        + '</div></section></div>';
    }

    function openChangeModal(session) {
      const row = objOf(session);
      WM.openModal(changeModal(row));
      const publish = document.querySelector('[data-change-publish]');
      if (publish) {
        publish.addEventListener('click', function () {
          const payload = {};
          const dayEl = document.getElementById('chg-day');
          const startEl = document.getElementById('chg-start');
          const endEl = document.getElementById('chg-end');
          if (dayEl && dayEl.value && dayEl.value !== (row.day || '')) payload.day = dayEl.value;
          if (startEl && startEl.value && startEl.value !== (row.startTime || '')) payload.startTime = startEl.value;
          if (endEl && endEl.value && endEl.value !== (row.endTime || '')) payload.endTime = endEl.value;
          if (!Object.keys(payload).length) {
            const box = document.getElementById('chg-msg');
            if (box) box.innerHTML = forms.formStatus('info', 'Change the day or time before publishing.');
            return;
          }
          publish.disabled = true;
          publishChange(row.id, payload);
        });
      }
    }

    function findSession(id) {
      for (let i = 0; i < state.sessions.length; i += 1) {
        if (String(state.sessions[i].id) === String(id)) return state.sessions[i];
      }
      return null;
    }

    function wire() {
      const select = document.getElementById('ops-event');
      if (select) {
        select.addEventListener('change', function () {
          state.eventId = select.value;
          state.board = null;
          state.incidents = [];
          state.sessions = [];
          state.boardError = '';
          state.incidentsError = '';
          state.sessionsError = '';
          state.changeResults = {};
          state.formError = '';
          loadEventData().then(refresh, refresh);
        });
      }

      qsa('[data-ops-refresh]').forEach(function (b) {
        b.addEventListener('click', function () {
          loadEventData().then(refresh, refresh);
        });
      });

      const formEl = document.getElementById('incident-form');
      if (formEl) {
        bindFields({
          'inc-title': 'title',
          'inc-severity': 'severity',
          'inc-location': 'location',
          'inc-description': 'description',
        });
        formEl.addEventListener('submit', function (e) {
          e.preventDefault();
          saveIncident();
        });
        qsa('#incident-form [data-action="submit"]').forEach(function (b) {
          b.addEventListener('click', function (e) {
            e.preventDefault();
            saveIncident();
          });
        });
        qsa('#incident-form [data-action="cancel"]').forEach(function (b) {
          b.addEventListener('click', function () {
            state.formError = '';
            state.form = { title: '', severity: 'Medium', description: '', location: '' };
            refresh();
          });
        });
      }

      qsa('[data-incident-status]').forEach(function (control) {
        control.addEventListener('change', function () {
          const id = control.getAttribute('data-incident-status');
          const next = control.value;
          let resolution = '';
          if (next === 'Resolved') {
            const note = askPrompt('Resolution note (optional)');
            if (note === null) {
              refresh();
              return;
            }
            resolution = note;
          }
          const payload = { status: next };
          if (resolution && String(resolution).trim()) payload.resolution = String(resolution).trim();
          control.disabled = true;
          global.WMApi.operations.updateIncident(id, payload).then(function () {
            notify('Incident updated.');
            return loadEventData().then(refresh, refresh);
          }, function (err) {
            control.disabled = false;
            notify(messageOf(err, 'Could not update the incident.'), 'error');
            refresh();
          });
        });
      });

      qsa('[data-incident-delete]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!askConfirm('Delete this incident? This cannot be undone.')) return;
          b.disabled = true;
          global.WMApi.operations.removeIncident(b.getAttribute('data-incident-delete')).then(function () {
            notify('Incident deleted.');
            return loadEventData().then(refresh, refresh);
          }, function (err) {
            b.disabled = false;
            notify(messageOf(err, 'Could not delete the incident.'), 'error');
          });
        });
      });

      qsa('[data-notify]').forEach(function (b) {
        b.addEventListener('click', function () {
          publishChange(b.getAttribute('data-notify'), {});
        });
      });

      qsa('[data-change-open]').forEach(function (b) {
        b.addEventListener('click', function () {
          const session = findSession(b.getAttribute('data-change-open'));
          if (session) openChangeModal(session);
        });
      });
    }

    WM.page({ route: '/operations-center', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.operationsCenter = operationsPage;
})(window);
