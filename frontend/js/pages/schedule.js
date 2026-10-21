(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui, forms = WM.forms;

  const TABS = ['Schedule board', 'Sessions', 'Venues & Rooms', 'Resources', 'Conflicts'];
  const SESSION_TYPES = ['Talk', 'Workshop', 'Panel', 'Performance', 'Break', 'Ceremony', 'Other'];
  const SESSION_STATUSES = ['Draft', 'Published', 'Completed', 'Cancelled'];
  const RESOURCE_KINDS = ['Room', 'Auditorium', 'Laboratory', 'Equipment', 'Projector',
    'Audio system', 'Vehicle', 'Staff', 'Speaker', 'Judge', 'Volunteer'];
  const RESOURCE_STATUSES = ['Active', 'Maintenance', 'Unavailable'];

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const keys = ['items', 'data', 'results', 'sessions', 'venues', 'resources', 'conflicts'];
      for (let i = 0; i < keys.length; i += 1) {
        if (Array.isArray(value[keys[i]])) return value[keys[i]];
      }
    }
    return [];
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

  function selectValues(o) {
    const value = o.value == null ? '' : o.value;
    const options = (o.options || []).map(function (opt) {
      return '<option value="' + esc(opt.value) + '"'
        + (String(opt.value) === String(value) ? ' selected' : '') + '>' + esc(opt.label) + '</option>';
    }).join('');
    return '<div class="form-field-group">'
      + '<div class="form-field-label-row"><label for="' + esc(o.id) + '">' + esc(o.label)
      + (o.required ? '<span class="form-req">*</span>' : '') + '</label></div>'
      + '<div class="form-input-wrap form-select-wrap' + (o.error ? ' form-input-error' : '') + '">'
      + '<select id="' + esc(o.id) + '" data-field="' + esc(o.id) + '">' + options + '</select>'
      + ic('chevron-down', 16, 'class="form-select-chevron"') + '</div>'
      + (o.error ? '<span class="field-error">' + esc(o.error) + '</span>' : '') + '</div>';
  }

  function errorView(title, message) {
    return ui.emptyView({
      title: title,
      description: message,
      action: '<button class="button button-primary" data-reload-event>Try again</button>',
    });
  }

  function schedulePage() {
    const state = {
      events: [], eventId: '', tab: TABS[0],
      board: null, sessions: [], venues: [], resources: [], conflicts: [],
      sectionErrors: { board: '', sessions: '', venues: '', resources: '', conflicts: '' },
      loadError: '', message: '', validating: false,
      form: null,
    };

    function currentEvent() {
      for (let i = 0; i < state.events.length; i += 1) {
        if (String(state.events[i].id) === String(state.eventId)) return state.events[i];
      }
      return null;
    }

    function eventOptions() {
      return state.events.map(function (e) {
        return '<option value="' + esc(e.id) + '"'
          + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
          + esc(e.title) + '</option>';
      }).join('');
    }

    function sessionRows() {
      if (state.sessions.length) return state.sessions;
      return state.board ? asList(state.board.sessions) : [];
    }

    function venueRows() {
      if (state.venues.length) return state.venues;
      return state.board ? asList(state.board.venues) : [];
    }

    function resourceRows() {
      if (state.resources.length) return state.resources;
      return state.board ? asList(state.board.resources) : [];
    }

    function venueName(id) {
      const rows = venueRows();
      for (let i = 0; i < rows.length; i += 1) {
        if (String(rows[i].id) === String(id)) return rows[i].name || '';
      }
      return '';
    }

    function sortBySlot(a, b) {
      return (String(a.day || '') + ' ' + String(a.startTime || ''))
        .localeCompare(String(b.day || '') + ' ' + String(b.startTime || ''));
    }

    function dayList() {
      const days = [];
      const add = function (day) {
        if (day && days.indexOf(day) === -1) days.push(day);
      };
      if (state.board && Array.isArray(state.board.days)) state.board.days.forEach(add);
      sessionRows().forEach(function (s) { if (s && s.day) add(String(s.day)); });
      days.sort();
      const unscheduled = sessionRows().some(function (s) { return s && !s.day; });
      if (unscheduled) days.push('');
      return days;
    }

    function loadEventData() {
      const id = state.eventId;
      if (!id) {
        state.board = null; state.sessions = []; state.venues = [];
        state.resources = []; state.conflicts = [];
        return Promise.resolve();
      }
      return Promise.all([
        global.WMApi.scheduling.board(id).then(function (data) {
          state.board = (data && typeof data === 'object' && !Array.isArray(data)) ? data : null;
          state.sectionErrors.board = '';
        }, function (err) {
          state.board = null;
          state.sectionErrors.board = messageOf(err, 'Could not load the schedule board.');
        }),
        global.WMApi.scheduling.sessions(id).then(function (rows) {
          state.sessions = asList(rows);
          state.sectionErrors.sessions = '';
        }, function (err) {
          state.sessions = [];
          state.sectionErrors.sessions = messageOf(err, 'Could not load sessions.');
        }),
        global.WMApi.scheduling.venues(id).then(function (rows) {
          state.venues = asList(rows);
          state.sectionErrors.venues = '';
        }, function (err) {
          state.venues = [];
          state.sectionErrors.venues = messageOf(err, 'Could not load venues.');
        }),
        global.WMApi.scheduling.resources(id).then(function (rows) {
          state.resources = asList(rows);
          state.sectionErrors.resources = '';
        }, function (err) {
          state.resources = [];
          state.sectionErrors.resources = messageOf(err, 'Could not load resources.');
        }),
        global.WMApi.scheduling.conflicts(id, { status: 'Open' }).then(function (rows) {
          state.conflicts = asList(rows);
          state.sectionErrors.conflicts = '';
        }, function (err) {
          state.conflicts = [];
          state.sectionErrors.conflicts = messageOf(err, 'Could not load conflicts.');
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
      const selector = state.events.length
        ? '<label class="select-field">' + ic('calendar-days', 16) + '<select id="sch-event">'
          + eventOptions() + '</select>' + ic('chevron-down', 15) + '</label>'
        : '';
      return ui.sectionHeading({
        eyebrow: 'Hosting operations',
        title: 'Schedule & resources',
        action: selector + (ev && ev.status ? ' ' + WM.statusChip(ev.status) : ''),
      });
    }

    function tabsBar() {
      return '<div class="workspace-tabs">' + TABS.map(function (t) {
        return '<button class="workspace-tab' + (t === state.tab ? ' workspace-tab-active' : '')
          + '" data-stab="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>';
    }

    function boardTab() {
      if (state.sectionErrors.board && !state.board) {
        return errorView('Schedule unavailable', state.sectionErrors.board);
      }
      const rows = sessionRows();
      if (!rows.length) {
        return ui.emptyView({
          title: 'No sessions scheduled',
          description: 'Add a session to start building the event schedule.',
          action: '<button class="button button-primary" data-stab="Sessions">Add a session</button>',
        });
      }
      return dayList().map(function (day) {
        const dayRows = rows.filter(function (s) { return String(s.day || '') === day; }).sort(sortBySlot);
        if (!dayRows.length) return '';
        const body = dayRows.map(function (s) {
          const time = (s.startTime || '\u2014') + (s.endTime ? ' \u2013 ' + s.endTime : '');
          const place = venueName(s.venueId) || s.roomName || '\u2014';
          return '<tr><td><span class="mono">' + esc(time) + '</span></td>'
            + '<td><strong>' + esc(s.title || 'Untitled session') + '</strong>'
            + (s.track ? '<br><small>' + esc(s.track) + '</small>' : '') + '</td>'
            + '<td>' + esc(place) + '</td>'
            + '<td>' + esc(s.sessionType || '\u2014') + '</td>'
            + '<td class="num">' + esc(s.capacity ? String(s.capacity) : '\u2014') + '</td>'
            + '<td>' + WM.statusChip(s.status || 'Draft') + '</td></tr>';
        }).join('');
        return '<section class="panel table-panel">'
          + ui.sectionHeading({ eyebrow: 'Day', title: day || 'Unscheduled' })
          + dataTable(['Time', 'Session', 'Venue / room', 'Type', 'Capacity', 'Status'], body)
          + '</section>';
      }).join('');
    }

    function sessionForm() {
      const f = state.form;
      const v = f.values;
      const venueOptions = [{ value: '', label: 'No venue' }].concat(venueRows().map(function (venue) {
        return { value: venue.id, label: venue.name || 'Venue' };
      }));
      return '<section class="panel">'
        + '<h3 class="section-title">' + (f.mode === 'create' ? 'New session' : 'Edit session') + '</h3>'
        + '<form id="session-form">'
        + '<div class="form-grid">'
        + forms.textField({ id: 'sf-title', label: 'Title', value: v.title, required: true, placeholder: 'Opening keynote' })
        + forms.textField({ id: 'sf-day', label: 'Day', type: 'date', value: v.day, required: true })
        + forms.textField({ id: 'sf-start', label: 'Start time', type: 'time', value: v.startTime, required: true })
        + forms.textField({ id: 'sf-end', label: 'End time', type: 'time', value: v.endTime, required: true })
        + forms.selectInput({ id: 'sf-type', label: 'Session type', options: SESSION_TYPES, value: v.sessionType })
        + forms.selectInput({ id: 'sf-status', label: 'Status', options: SESSION_STATUSES, value: v.status })
        + forms.textField({ id: 'sf-capacity', label: 'Capacity', type: 'number', value: v.capacity, hint: '0 = not set' })
        + selectValues({ id: 'sf-venue', label: 'Venue', options: venueOptions, value: v.venueId })
        + forms.textField({ id: 'sf-room', label: 'Room name', value: v.roomName, placeholder: 'Hall A' })
        + forms.textField({ id: 'sf-track', label: 'Track', value: v.track, placeholder: 'Main stage' })
        + '</div>'
        + forms.textArea({ id: 'sf-description', label: 'Description', value: v.description, rows: 3 })
        + forms.formStatus(f.error ? 'error' : 'idle', f.error ? f.error : '')
        + forms.formActions({
          showSave: false,
          submitLabel: f.mode === 'create' ? 'Create session' : 'Save changes',
          loading: f.busy,
        })
        + '</form></section>';
    }

    function sessionsTab() {
      const action = '<button class="button button-primary" data-new-session>'
        + ic('plus', 15) + ' New session</button>';
      const rows = sessionRows().slice().sort(sortBySlot);
      const body = rows.length
        ? dataTable(['Title', 'Day', 'Time', 'Type', 'Capacity', 'Status', ''], rows.map(function (s) {
          const time = (s.startTime || '\u2014') + (s.endTime ? ' \u2013 ' + s.endTime : '');
          return '<tr><td><strong>' + esc(s.title || 'Untitled session') + '</strong>'
            + (s.track ? '<br><small>' + esc(s.track) + '</small>' : '') + '</td>'
            + '<td>' + esc(s.day || '\u2014') + '</td>'
            + '<td><span class="mono">' + esc(time) + '</span></td>'
            + '<td>' + esc(s.sessionType || '\u2014') + '</td>'
            + '<td class="num">' + esc(s.capacity ? String(s.capacity) : '\u2014') + '</td>'
            + '<td>' + WM.statusChip(s.status || 'Draft') + '</td>'
            + '<td><div class="chip-row">'
            + '<button class="button button-secondary" data-session-edit="' + esc(s.id) + '">Edit</button>'
            + '<button class="button button-ghost" data-session-delete="' + esc(s.id) + '">Delete</button>'
            + '</div></td></tr>';
        }).join(''))
        : ui.emptyView({ title: 'No sessions yet', description: 'Create the first session for this event.' });
      const formHTML = state.form && state.form.kind === 'session' ? sessionForm() : '';
      return '<div class="page-stack">'
        + (state.message ? forms.formStatus('success', state.message) : '')
        + (state.sectionErrors.sessions && !rows.length ? forms.formStatus('error', state.sectionErrors.sessions) : '')
        + formHTML
        + '<section class="panel table-panel">'
        + ui.sectionHeading({ eyebrow: 'Programme', title: 'Sessions', action: action })
        + body + '</section></div>';
    }

    function venueForm() {
      const f = state.form;
      const v = f.values;
      return '<section class="panel">'
        + '<h3 class="section-title">' + (f.mode === 'create' ? 'New venue' : 'Edit venue') + '</h3>'
        + '<form id="venue-form">'
        + '<div class="form-grid">'
        + forms.textField({ id: 'vf-name', label: 'Name', value: v.name, required: true, placeholder: 'Main auditorium' })
        + forms.textField({ id: 'vf-capacity', label: 'Capacity', type: 'number', value: v.capacity })
        + forms.textField({ id: 'vf-city', label: 'City', value: v.city, placeholder: 'Bengaluru' })
        + forms.textField({ id: 'vf-address', label: 'Address', value: v.address, placeholder: '12 MG Road' })
        + forms.textField({ id: 'vf-directions', label: 'Directions', value: v.directions, placeholder: 'Gate 3, second floor' })
        + forms.selectInput({ id: 'vf-primary', label: 'Primary venue', options: ['Yes', 'No'], value: v.isPrimary })
        + '</div>'
        + forms.textArea({ id: 'vf-accessibility', label: 'Accessibility & amenities', value: v.accessibility, rows: 3, placeholder: 'Step-free access, hearing loop, projector...' })
        + forms.formStatus(f.error ? 'error' : 'idle', f.error ? f.error : '')
        + forms.formActions({
          showSave: false,
          submitLabel: f.mode === 'create' ? 'Create venue' : 'Save changes',
          loading: f.busy,
        })
        + '</form></section>';
    }

    function venuesTab() {
      const action = '<button class="button button-primary" data-new-venue>'
        + ic('plus', 15) + ' New venue</button>';
      const rows = venueRows().slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      const body = rows.length
        ? dataTable(['Name', 'City', 'Address', 'Capacity', 'Primary', ''], rows.map(function (v) {
          return '<tr><td><strong>' + esc(v.name || 'Venue') + '</strong></td>'
            + '<td>' + esc(v.city || '\u2014') + '</td>'
            + '<td>' + esc(v.address || '\u2014') + '</td>'
            + '<td class="num">' + esc(v.capacity ? String(v.capacity) : '\u2014') + '</td>'
            + '<td>' + (v.isPrimary ? ui.badge('Primary', 'green') : ui.badge('Secondary', 'slate')) + '</td>'
            + '<td><div class="chip-row">'
            + '<button class="button button-secondary" data-venue-edit="' + esc(v.id) + '">Edit</button>'
            + '<button class="button button-ghost" data-venue-delete="' + esc(v.id) + '">Delete</button>'
            + '</div></td></tr>';
        }).join(''))
        : ui.emptyView({
          title: 'No venues yet',
          description: 'Add venues so sessions and room resources can be linked to a place.',
        });
      const formHTML = state.form && state.form.kind === 'venue' ? venueForm() : '';
      return '<div class="page-stack">'
        + (state.message ? forms.formStatus('success', state.message) : '')
        + (state.sectionErrors.venues && !rows.length ? forms.formStatus('error', state.sectionErrors.venues) : '')
        + formHTML
        + '<section class="panel table-panel">'
        + ui.sectionHeading({ eyebrow: 'Locations', title: 'Venues & rooms', action: action })
        + body + '</section></div>';
    }

    function resourceForm() {
      const f = state.form;
      const v = f.values;
      const venueOptions = [{ value: '', label: 'No venue' }].concat(venueRows().map(function (venue) {
        return { value: venue.id, label: venue.name || 'Venue' };
      }));
      return '<section class="panel">'
        + '<h3 class="section-title">' + (f.mode === 'create' ? 'New resource' : 'Edit resource') + '</h3>'
        + '<form id="resource-form">'
        + '<div class="form-grid">'
        + forms.textField({ id: 'rf-name', label: 'Name', value: v.name, required: true, placeholder: 'Projector 2' })
        + forms.selectInput({ id: 'rf-kind', label: 'Kind', options: RESOURCE_KINDS, value: v.kind })
        + selectValues({ id: 'rf-venue', label: 'Venue', options: venueOptions, value: v.venueId })
        + forms.textField({ id: 'rf-capacity', label: 'Capacity', type: 'number', value: v.capacity })
        + forms.textField({ id: 'rf-location', label: 'Location', value: v.location, placeholder: 'Store room B' })
        + forms.selectInput({ id: 'rf-status', label: 'Status', options: RESOURCE_STATUSES, value: v.status })
        + forms.textField({ id: 'rf-from', label: 'Available from', type: 'time', value: v.availableFrom })
        + forms.textField({ id: 'rf-to', label: 'Available to', type: 'time', value: v.availableTo })
        + forms.textField({ id: 'rf-days', label: 'Available days', value: v.availableDays, hint: 'Comma-separated YYYY-MM-DD dates' })
        + '</div>'
        + forms.textArea({ id: 'rf-notes', label: 'Notes', value: v.notes, rows: 2 })
        + forms.formStatus(f.error ? 'error' : 'idle', f.error ? f.error : '')
        + forms.formActions({
          showSave: false,
          submitLabel: f.mode === 'create' ? 'Create resource' : 'Save changes',
          loading: f.busy,
        })
        + '</form></section>';
    }

    function resourcesTab() {
      const action = '<button class="button button-primary" data-new-resource>'
        + ic('plus', 15) + ' New resource</button>';
      const rows = resourceRows().slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      const body = rows.length
        ? dataTable(['Name', 'Kind', 'Venue', 'Capacity', 'Availability', 'Status', ''], rows.map(function (r) {
          const windowLabel = (r.availableFrom || r.availableTo)
            ? (r.availableFrom || '') + ' \u2013 ' + (r.availableTo || '')
            : 'All day';
          const days = Array.isArray(r.availableDays) ? r.availableDays.length : 0;
          return '<tr><td><strong>' + esc(r.name || 'Resource') + '</strong>'
            + (r.location ? '<br><small>' + esc(r.location) + '</small>' : '') + '</td>'
            + '<td>' + ui.badge(r.kind || 'Room', 'blue') + '</td>'
            + '<td>' + esc(venueName(r.venueId) || '\u2014') + '</td>'
            + '<td class="num">' + esc(r.capacity ? String(r.capacity) : '\u2014') + '</td>'
            + '<td><span class="mono">' + esc(windowLabel) + '</span>'
            + (days ? '<br><small>' + days + ' day(s) listed</small>' : '') + '</td>'
            + '<td>' + ui.badge(r.status || 'Active', r.status === 'Active' ? 'green' : (r.status === 'Maintenance' ? 'amber' : 'red')) + '</td>'
            + '<td><div class="chip-row">'
            + '<button class="button button-secondary" data-resource-edit="' + esc(r.id) + '">Edit</button>'
            + '<button class="button button-ghost" data-resource-delete="' + esc(r.id) + '">Delete</button>'
            + '</div></td></tr>';
        }).join(''))
        : ui.emptyView({
          title: 'No resources yet',
          description: 'Add rooms, equipment, vehicles or staff that sessions can book.',
        });
      const formHTML = state.form && state.form.kind === 'resource' ? resourceForm() : '';
      return '<div class="page-stack">'
        + (state.message ? forms.formStatus('success', state.message) : '')
        + (state.sectionErrors.resources && !rows.length ? forms.formStatus('error', state.sectionErrors.resources) : '')
        + formHTML
        + '<section class="panel table-panel">'
        + ui.sectionHeading({ eyebrow: 'Inventory', title: 'Resources', action: action })
        + body + '</section></div>';
    }

    function conflictCard(c) {
      const severityTone = c.severity === 'Critical' ? 'red' : 'amber';
      const detail = (c.detail && typeof c.detail === 'object') ? c.detail : {};
      const suggestions = Array.isArray(detail.suggestions) ? detail.suggestions : [];
      const timeSuggestions = Array.isArray(detail.timeSuggestions) ? detail.timeSuggestions : [];
      const titles = Array.isArray(c.sessionTitles) ? c.sessionTitles.filter(Boolean) : [];
      const actions = [];
      suggestions.forEach(function (suggestion, index) {
        const label = suggestion.name || suggestion.kind || 'Alternative resource';
        actions.push('<button class="button button-secondary" data-apply="' + esc(c.id)
          + '" data-apply-kind="suggestion" data-apply-index="' + index + '">'
          + ic('move-right', 14) + ' ' + esc(label) + '</button>');
      });
      timeSuggestions.forEach(function (slot, index) {
        const label = (slot.day || '') + ' ' + (slot.startTime || '') + '\u2013' + (slot.endTime || '');
        actions.push('<button class="button button-secondary" data-apply="' + esc(c.id)
          + '" data-apply-kind="time" data-apply-index="' + index + '">'
          + ic('clock', 14) + ' ' + esc(label) + '</button>');
      });
      return '<article class="report-card">'
        + '<div class="chip-row">'
        + ui.badge(c.severity || 'Warning', severityTone)
        + ui.badge(c.conflictType || 'Conflict', 'blue')
        + (c.day ? '<span class="chip">' + esc(c.day)
          + (c.startTime ? ' \u00b7 ' + esc(c.startTime) + (c.endTime ? '\u2013' + esc(c.endTime) : '') : '')
          + '</span>' : '')
        + '</div>'
        + '<strong>' + esc(c.conflictType || 'Scheduling conflict') + '</strong>'
        + '<p>' + esc(c.message || 'No description supplied.') + '</p>'
        + (c.resourceName ? '<small>Resource: ' + esc(c.resourceName) + '</small>' : '')
        + (titles.length ? '<small>Sessions: ' + esc(titles.join(' \u00b7 ')) + '</small>' : '')
        + (actions.length ? '<div class="chip-row">' + actions.join('') + '</div>' : '')
        + '<div class="chip-row">'
        + '<button class="button button-secondary" data-resolve="' + esc(c.id) + '">Resolve</button>'
        + '<button class="button button-ghost" data-dismiss="' + esc(c.id) + '">Dismiss</button>'
        + '</div></article>';
    }

    function conflictsTab() {
      const action = '<button class="button button-primary" data-validate'
        + (state.validating ? ' disabled' : '') + '>'
        + ic('shield-check', 15) + ' ' + (state.validating ? 'Validating\u2026' : 'Validate schedule')
        + '</button>';
      const body = state.conflicts.length
        ? '<div class="report-card-grid">' + state.conflicts.map(conflictCard).join('') + '</div>'
        : ui.emptyView({
          title: 'No open conflicts',
          description: 'Run validation to scan sessions, venues, resources and speakers for clashes.',
        });
      return '<div class="page-stack">'
        + (state.sectionErrors.conflicts && !state.conflicts.length
          ? forms.formStatus('error', state.sectionErrors.conflicts) : '')
        + '<section class="panel">'
        + ui.sectionHeading({ eyebrow: 'Conflict engine', title: 'Conflicts', action: action })
        + body + '</section></div>';
    }

    function tabBody() {
      switch (state.tab) {
        case 'Sessions': return sessionsTab();
        case 'Venues & Rooms': return venuesTab();
        case 'Resources': return resourcesTab();
        case 'Conflicts': return conflictsTab();
        default: return boardTab();
      }
    }

    function render() {
      if (state.loadError && !state.events.length) {
        return '<div class="page-stack">'
          + ui.sectionHeading({ eyebrow: 'Hosting operations', title: 'Schedule & resources' })
          + errorView('Events unavailable', state.loadError)
          + '</div>';
      }
      if (!state.events.length) {
        return '<div class="page-stack">'
          + ui.sectionHeading({ eyebrow: 'Hosting operations', title: 'Schedule & resources' })
          + ui.emptyView({
            title: 'No events to schedule',
            description: 'Create or host an event before building a schedule.',
            action: '<a class="button button-primary" href="host-an-event.html">Host an Event</a>',
          })
          + '</div>';
      }
      return '<div class="page-stack">' + header() + tabsBar() + tabBody() + '</div>';
    }

    function refresh() {
      WM.refreshContent(render);
      wire();
    }

    function openForm(kind, mode, record) {
      const rec = record || {};
      let values;
      if (kind === 'session') {
        values = {
          title: rec.title || '',
          day: rec.day || '',
          startTime: rec.startTime || '',
          endTime: rec.endTime || '',
          sessionType: SESSION_TYPES.indexOf(rec.sessionType) !== -1 ? rec.sessionType : 'Talk',
          status: SESSION_STATUSES.indexOf(rec.status) !== -1 ? rec.status : 'Draft',
          capacity: rec.capacity ? String(rec.capacity) : '',
          venueId: rec.venueId || '',
          roomName: rec.roomName || '',
          track: rec.track || '',
          description: rec.description || '',
        };
      } else if (kind === 'venue') {
        values = {
          name: rec.name || '',
          address: rec.address || '',
          city: rec.city || '',
          capacity: rec.capacity ? String(rec.capacity) : '',
          accessibility: rec.accessibility || '',
          directions: rec.directions || '',
          isPrimary: rec.isPrimary ? 'Yes' : 'No',
        };
      } else {
        values = {
          name: rec.name || '',
          kind: RESOURCE_KINDS.indexOf(rec.kind) !== -1 ? rec.kind : 'Room',
          venueId: rec.venueId || '',
          capacity: rec.capacity ? String(rec.capacity) : '',
          location: rec.location || '',
          availableDays: Array.isArray(rec.availableDays) ? rec.availableDays.join(', ') : '',
          availableFrom: rec.availableFrom || '',
          availableTo: rec.availableTo || '',
          status: RESOURCE_STATUSES.indexOf(rec.status) !== -1 ? rec.status : 'Active',
          notes: rec.notes || '',
        };
      }
      state.form = { kind: kind, mode: mode, id: rec.id || '', values: values, error: '', busy: false };
      refresh();
    }

    function bindFields(map) {
      Object.keys(map).forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        const apply = function () {
          if (state.form) state.form.values[map[id]] = el.value;
        };
        el.addEventListener('input', apply);
        el.addEventListener('change', apply);
      });
    }

    function afterWrite(message) {
      state.message = message;
      notify(message);
      return loadEventData().then(refresh, refresh);
    }

    function saveSession() {
      const f = state.form;
      if (!f || f.kind !== 'session' || f.busy) return;
      const v = f.values;
      const problems = [];
      if (!String(v.title || '').trim()) problems.push('Session title is required.');
      if (!v.day) problems.push('A day is required (YYYY-MM-DD).');
      if (!v.startTime) problems.push('Start time is required.');
      if (!v.endTime) problems.push('End time is required.');
      if (v.startTime && v.endTime && v.endTime <= v.startTime) {
        problems.push('End time must be after start time.');
      }
      if (problems.length) {
        f.error = problems.join(' ');
        refresh();
        return;
      }
      const payload = {
        title: String(v.title).trim(),
        day: v.day,
        startTime: v.startTime,
        endTime: v.endTime,
        sessionType: v.sessionType || 'Talk',
        status: v.status || 'Draft',
        capacity: Number(v.capacity) || 0,
        venueId: v.venueId || '',
        roomName: v.roomName || '',
        track: v.track || '',
        description: v.description || '',
      };
      f.busy = true;
      f.error = '';
      refresh();
      const request = f.mode === 'create'
        ? global.WMApi.scheduling.createSession(state.eventId, payload)
        : global.WMApi.scheduling.updateSession(f.id, payload);
      request.then(function () {
        state.form = null;
        return afterWrite(f.mode === 'create' ? 'Session created.' : 'Session updated.');
      }, function (err) {
        f.busy = false;
        f.error = messageOf(err, 'Could not save the session.');
        refresh();
      });
    }

    function saveVenue() {
      const f = state.form;
      if (!f || f.kind !== 'venue' || f.busy) return;
      const v = f.values;
      if (!String(v.name || '').trim()) {
        f.error = 'Venue name is required.';
        refresh();
        return;
      }
      const payload = {
        name: String(v.name).trim(),
        address: v.address || '',
        city: v.city || '',
        capacity: Number(v.capacity) || 0,
        accessibility: v.accessibility || '',
        directions: v.directions || '',
        isPrimary: v.isPrimary === 'Yes',
      };
      f.busy = true;
      f.error = '';
      refresh();
      const request = f.mode === 'create'
        ? global.WMApi.scheduling.createVenue(state.eventId, payload)
        : global.WMApi.scheduling.updateVenue(f.id, payload);
      request.then(function () {
        state.form = null;
        return afterWrite(f.mode === 'create' ? 'Venue created.' : 'Venue updated.');
      }, function (err) {
        f.busy = false;
        f.error = messageOf(err, 'Could not save the venue.');
        refresh();
      });
    }

    function saveResource() {
      const f = state.form;
      if (!f || f.kind !== 'resource' || f.busy) return;
      const v = f.values;
      if (!String(v.name || '').trim()) {
        f.error = 'Resource name is required.';
        refresh();
        return;
      }
      const days = String(v.availableDays || '').split(',').map(function (day) {
        return day.trim();
      }).filter(Boolean);
      const payload = {
        name: String(v.name).trim(),
        kind: v.kind || 'Room',
        venueId: v.venueId || '',
        capacity: Number(v.capacity) || 0,
        location: v.location || '',
        availableDays: days,
        availableFrom: v.availableFrom || '',
        availableTo: v.availableTo || '',
        status: v.status || 'Active',
        notes: v.notes || '',
      };
      f.busy = true;
      f.error = '';
      refresh();
      const request = f.mode === 'create'
        ? global.WMApi.scheduling.createResource(state.eventId, payload)
        : global.WMApi.scheduling.updateResource(f.id, payload);
      request.then(function () {
        state.form = null;
        return afterWrite(f.mode === 'create' ? 'Resource created.' : 'Resource updated.');
      }, function (err) {
        f.busy = false;
        f.error = messageOf(err, 'Could not save the resource.');
        refresh();
      });
    }

    function wireForm(formId, save) {
      const formEl = document.getElementById(formId);
      if (!formEl) return;
      formEl.addEventListener('submit', function (e) {
        e.preventDefault();
        save();
      });
      qsa('#' + formId + ' [data-action="submit"]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          save();
        });
      });
      qsa('#' + formId + ' [data-action="cancel"]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.form = null;
          refresh();
        });
      });
    }

    function findById(rows, id) {
      for (let i = 0; i < rows.length; i += 1) {
        if (String(rows[i].id) === String(id)) return rows[i];
      }
      return null;
    }

    function removeRow(kind, id, label, removeFn) {
      const record = findById(kind === 'session' ? sessionRows() : (kind === 'venue' ? venueRows() : resourceRows()), id);
      const name = record && record.name ? record.name : (record && record.title ? record.title : label);
      if (!askConfirm('Delete "' + name + '"? This cannot be undone.')) return;
      removeFn().then(function () {
        return afterWrite(kind.charAt(0).toUpperCase() + kind.slice(1) + ' deleted.');
      }, function (err) {
        notify(messageOf(err, 'Could not delete the ' + kind + '.'), 'error');
      });
    }

    function wireSessions() {
      const create = document.querySelector('[data-new-session]');
      if (create) create.addEventListener('click', function () { openForm('session', 'create'); });
      qsa('[data-session-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          const record = findById(sessionRows(), b.getAttribute('data-session-edit'));
          if (record) openForm('session', 'edit', record);
        });
      });
      qsa('[data-session-delete]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-session-delete');
          removeRow('session', id, 'this session', function () {
            return global.WMApi.scheduling.removeSession(id);
          });
        });
      });
      if (state.form && state.form.kind === 'session') {
        bindFields({
          'sf-title': 'title', 'sf-day': 'day', 'sf-start': 'startTime', 'sf-end': 'endTime',
          'sf-type': 'sessionType', 'sf-status': 'status', 'sf-capacity': 'capacity',
          'sf-venue': 'venueId', 'sf-room': 'roomName', 'sf-track': 'track',
          'sf-description': 'description',
        });
        wireForm('session-form', saveSession);
      }
    }

    function wireVenues() {
      const create = document.querySelector('[data-new-venue]');
      if (create) create.addEventListener('click', function () { openForm('venue', 'create'); });
      qsa('[data-venue-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          const record = findById(venueRows(), b.getAttribute('data-venue-edit'));
          if (record) openForm('venue', 'edit', record);
        });
      });
      qsa('[data-venue-delete]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-venue-delete');
          removeRow('venue', id, 'this venue', function () {
            return global.WMApi.scheduling.removeVenue(id);
          });
        });
      });
      if (state.form && state.form.kind === 'venue') {
        bindFields({
          'vf-name': 'name', 'vf-capacity': 'capacity', 'vf-city': 'city',
          'vf-address': 'address', 'vf-directions': 'directions',
          'vf-primary': 'isPrimary', 'vf-accessibility': 'accessibility',
        });
        wireForm('venue-form', saveVenue);
      }
    }

    function wireResources() {
      const create = document.querySelector('[data-new-resource]');
      if (create) create.addEventListener('click', function () { openForm('resource', 'create'); });
      qsa('[data-resource-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          const record = findById(resourceRows(), b.getAttribute('data-resource-edit'));
          if (record) openForm('resource', 'edit', record);
        });
      });
      qsa('[data-resource-delete]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-resource-delete');
          removeRow('resource', id, 'this resource', function () {
            return global.WMApi.scheduling.removeResource(id);
          });
        });
      });
      if (state.form && state.form.kind === 'resource') {
        bindFields({
          'rf-name': 'name', 'rf-kind': 'kind', 'rf-venue': 'venueId',
          'rf-capacity': 'capacity', 'rf-location': 'location', 'rf-status': 'status',
          'rf-from': 'availableFrom', 'rf-to': 'availableTo', 'rf-days': 'availableDays',
          'rf-notes': 'notes',
        });
        wireForm('resource-form', saveResource);
      }
    }

    function suggestionPayload(conflict, suggestion) {
      const payload = {};
      const sessionId = suggestion.sessionId
        || (Array.isArray(conflict.sessionIds) && conflict.sessionIds.length ? conflict.sessionIds[0] : '');
      if (sessionId) payload.sessionId = sessionId;
      if (suggestion.resourceId) payload.resourceId = suggestion.resourceId;
      if (suggestion.venueId) payload.venueId = suggestion.venueId;
      if (suggestion.day) payload.day = suggestion.day;
      if (suggestion.startTime) payload.startTime = suggestion.startTime;
      if (suggestion.endTime) payload.endTime = suggestion.endTime;
      return payload;
    }

    function applySuggestion(conflict, payload, retried) {
      return global.WMApi.scheduling.applyConflict(conflict.id, payload).then(function (data) {
        state.conflicts = asList(data && data.conflicts);
        notify('Suggestion applied and the schedule was re-validated.');
        return loadEventData();
      }, function (err) {
        if (!retried && err && err.status === 409 && /confirmPublished/i.test(err.message || '')) {
          notify(err.message, 'warning');
          const retryPayload = Object.assign({}, payload, { confirmPublished: true });
          return applySuggestion(conflict, retryPayload, true);
        }
        notify(messageOf(err, 'Could not apply the suggestion.'), 'error');
      });
    }

    function validateSchedule() {
      if (state.validating || !state.eventId) return;
      state.validating = true;
      state.sectionErrors.conflicts = '';
      refresh();
      global.WMApi.scheduling.validate(state.eventId).then(function (rows) {
        state.validating = false;
        state.conflicts = asList(rows);
        notify(state.conflicts.length
          ? state.conflicts.length + ' open conflict(s) found.'
          : 'Schedule is clean \u2014 no conflicts.', state.conflicts.length ? 'warning' : 'success');
        return loadEventData().then(refresh, refresh);
      }, function (err) {
        state.validating = false;
        state.sectionErrors.conflicts = messageOf(err, 'Could not validate the schedule.');
        refresh();
      });
    }

    function wireConflicts() {
      const validate = document.querySelector('[data-validate]');
      if (validate) validate.addEventListener('click', validateSchedule);

      qsa('[data-apply]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-apply');
          const kind = b.getAttribute('data-apply-kind');
          const index = Number(b.getAttribute('data-apply-index'));
          const conflict = findById(state.conflicts, id);
          if (!conflict) return;
          const detail = (conflict.detail && typeof conflict.detail === 'object') ? conflict.detail : {};
          const list = kind === 'time'
            ? (Array.isArray(detail.timeSuggestions) ? detail.timeSuggestions : [])
            : (Array.isArray(detail.suggestions) ? detail.suggestions : []);
          const suggestion = list[index];
          if (!suggestion) return;
          let payload;
          if (kind === 'time') {
            payload = { day: suggestion.day, startTime: suggestion.startTime, endTime: suggestion.endTime };
            if (Array.isArray(conflict.sessionIds) && conflict.sessionIds.length) {
              payload.sessionId = conflict.sessionIds[0];
            }
          } else {
            payload = suggestionPayload(conflict, suggestion);
          }
          b.disabled = true;
          applySuggestion(conflict, payload, false).then(refresh, refresh);
        });
      });

      qsa('[data-resolve]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-resolve');
          const note = askPrompt('Resolution note');
          if (note === null) return;
          if (!String(note).trim()) {
            notify('A resolution note is required.', 'warning');
            return;
          }
          b.disabled = true;
          global.WMApi.scheduling.resolveConflict(id, { resolution: String(note).trim() }).then(function () {
            notify('Conflict resolved.');
            return loadEventData().then(refresh, refresh);
          }, function (err) {
            b.disabled = false;
            notify(messageOf(err, 'Could not resolve the conflict.'), 'error');
          });
        });
      });

      qsa('[data-dismiss]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-dismiss');
          if (!askConfirm('Dismiss this conflict without resolving it?')) return;
          b.disabled = true;
          global.WMApi.scheduling.dismissConflict(id, {}).then(function () {
            notify('Conflict dismissed.');
            return loadEventData().then(refresh, refresh);
          }, function (err) {
            b.disabled = false;
            notify(messageOf(err, 'Could not dismiss the conflict.'), 'error');
          });
        });
      });
    }

    function wire() {
      const select = document.getElementById('sch-event');
      if (select) {
        select.addEventListener('change', function () {
          state.eventId = select.value;
          state.form = null;
          state.message = '';
          state.board = null;
          state.sessions = [];
          state.venues = [];
          state.resources = [];
          state.conflicts = [];
          state.sectionErrors = { board: '', sessions: '', venues: '', resources: '', conflicts: '' };
          loadEventData().then(refresh, refresh);
        });
      }

      qsa('[data-stab]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.tab = b.getAttribute('data-stab');
          state.form = null;
          state.message = '';
          refresh();
        });
      });

      qsa('[data-reload-event]').forEach(function (b) {
        b.addEventListener('click', function () {
          loadEventData().then(refresh, refresh);
        });
      });

      if (state.tab === 'Sessions') wireSessions();
      else if (state.tab === 'Venues & Rooms') wireVenues();
      else if (state.tab === 'Resources') wireResources();
      else if (state.tab === 'Conflicts') wireConflicts();
    }

    WM.page({ route: '/schedule', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.schedule = schedulePage;
})(window);
