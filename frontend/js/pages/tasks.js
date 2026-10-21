/* Task board — event-scoped tasks with filters, inline status changes,
 * assignment, dependency graph, volunteer recommendations and hour logging. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  const STATUSES = ['Open', 'In progress', 'Blocked', 'Done', 'Cancelled'];
  const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];
  const ASSIGNEE_TYPES = ['user', 'volunteer'];
  const PRIORITY_TONES = { Low: 'slate', Normal: 'blue', High: 'amber', Critical: 'red' };
  const DUE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

  function arr(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const keys = ['items', 'data', 'results'];
      for (let i = 0; i < keys.length; i++) {
        if (Array.isArray(value[keys[i]])) return value[keys[i]];
      }
    }
    return [];
  }

  function call(fn) {
    try {
      const out = fn();
      if (out && typeof out.then === 'function') return out;
      return Promise.resolve(out === undefined ? null : out);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function errText(err, fallback) {
    if (!err) return fallback || 'Something went wrong.';
    if (err.status === 401) return 'Sign-in required \u2014 ' + (err.message || 'please sign in again.');
    if (err.status === 403) return 'Not allowed \u2014 ' + (err.message || 'you can only manage events you host.');
    return err.message || fallback || 'Something went wrong.';
  }

  function qsAll(selector) {
    try { return document.querySelectorAll(selector) || []; } catch (e) { return []; }
  }

  function byId(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }

  function blankForm() {
    return {
      title: '', description: '', priority: 'Normal', dueAt: '',
      assigneeType: 'volunteer', assigneeId: '', sessionId: '',
    };
  }

  function toInputValue(iso) {
    const text = String(iso || '');
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) ? text.slice(0, 16) : '';
  }

  function tasksBoard() {
    const state = {
      events: [], eventId: '',
      tasks: [], volunteers: [], sessions: [], deps: null,
      filterStatus: 'All', filterPriority: 'All', filterAssignee: 'All',
      form: blankForm(), editingId: '', busy: false, errors: {}, message: '', error: '',
      assignOpen: '', assignType: 'volunteer', assignId: '',
      rec: null, recSessionId: '', recTaskId: '', recBusy: false, recError: '',
    };

    function currentEvent() {
      const found = arr(state.events).filter(function (e) {
        return String(e.id) === String(state.eventId);
      });
      return found[0] || null;
    }

    function eventOptions() {
      return arr(state.events).map(function (e) {
        return '<option value="' + esc(e.id) + '"'
          + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>'
          + esc(e.title || 'Event') + '</option>';
      }).join('');
    }

    function eventPicker() {
      if (!arr(state.events).length) return '';
      return '<label class="select-field">' + ic('calendar-days', 16)
        + '<select id="tsk-event">' + eventOptions() + '</select>'
        + ic('chevron-down', 15) + '</label>';
    }

    function activeVolunteers() {
      return arr(state.volunteers).filter(function (v) {
        return String(v.status || '') !== 'Removed';
      });
    }

    function volunteerOptions(selected) {
      return activeVolunteers().map(function (v) {
        return '<option value="' + esc(v.id) + '"'
          + (String(v.id) === String(selected) ? ' selected' : '') + '>'
          + esc(v.name || 'Volunteer')
          + (v.department ? ' \u00b7 ' + esc(v.department) : '')
          + '</option>';
      }).join('');
    }

    function simpleOptions(values, selected) {
      return values.map(function (v) {
        return '<option value="' + esc(v) + '"'
          + (String(v) === String(selected) ? ' selected' : '') + '>'
          + esc(v) + '</option>';
      }).join('');
    }

    function allOptions(values, allLabel, selected) {
      return '<option value="All"' + (selected === 'All' ? ' selected' : '') + '>'
        + esc(allLabel) + '</option>' + simpleOptions(values, selected);
    }

    function inputField(id, label, type, value, opts) {
      opts = opts || {};
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label)
        + (opts.required ? '<span class="form-req">*</span>' : '') + '</label>'
        + '<div class="form-input-wrap' + (opts.error ? ' form-input-error' : '') + '">'
        + '<input id="' + id + '" type="' + esc(type || 'text') + '" value="' + esc(value == null ? '' : value) + '"'
        + ' placeholder="' + esc(opts.placeholder || '') + '" />'
        + '</div>'
        + (opts.error ? '<span class="field-error">' + esc(opts.error) + '</span>' : '')
        + (opts.hint ? '<span class="form-hint">' + esc(opts.hint) + '</span>' : '')
        + '</div>';
    }

    function textareaField(id, label, value, opts) {
      opts = opts || {};
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label) + '</label>'
        + '<textarea id="' + id + '" rows="' + (opts.rows || 3) + '" class="form-textarea"'
        + ' placeholder="' + esc(opts.placeholder || '') + '">' + esc(value == null ? '' : value) + '</textarea>'
        + (opts.error ? '<span class="field-error">' + esc(opts.error) + '</span>' : '')
        + '</div>';
    }

    function selectField(id, label, optionsHTML, opts) {
      opts = opts || {};
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label) + '</label>'
        + '<div class="form-input-wrap' + (opts.error ? ' form-input-error' : '') + '">'
        + '<select id="' + id + '">' + optionsHTML + '</select>'
        + '</div>'
        + (opts.error ? '<span class="field-error">' + esc(opts.error) + '</span>' : '')
        + (opts.hint ? '<span class="form-hint">' + esc(opts.hint) + '</span>' : '')
        + '</div>';
    }

    function findTask(id) {
      const found = arr(state.tasks).filter(function (t) {
        return String(t.id) === String(id);
      });
      return found[0] || null;
    }

    function assigneeLabel(task) {
      if (!task || !task.assigneeId) return '<span class="tie-note">Unassigned</span>';
      return esc(task.assigneeName || task.assigneeId) + ' '
        + ui.badge(task.assigneeType || 'user', task.assigneeType === 'volunteer' ? 'teal' : 'slate');
    }

    function taskRow(task) {
      const deps = arr(task.dependsOn);
      return '<tr>'
        + '<td><strong>' + esc(task.title) + '</strong>'
        + (task.description ? '<div class="tie-note">' + esc(task.description) + '</div>' : '')
        + '<div class="chip-row">'
        + ui.badge(task.priority || 'Normal', PRIORITY_TONES[task.priority] || 'slate')
        + ui.badge(deps.length + (deps.length === 1 ? ' dependency' : ' dependencies'), deps.length ? 'blue' : 'slate')
        + (task.isOverdue ? ui.badge('Overdue', 'red') : '')
        + '</div></td>'
        + '<td>' + (task.dueLabel || task.dueAt
          ? esc(task.dueLabel || task.dueAt)
          : '<span class="tie-note">No due date</span>') + '</td>'
        + '<td>' + assigneeLabel(task) + '</td>'
        + '<td><div class="form-input-wrap"><select data-status="' + esc(task.id) + '">'
        + simpleOptions(STATUSES, task.status) + '</select></div></td>'
        + '<td><div class="chip-row">'
        + '<button class="button button-secondary" data-edit="' + esc(task.id) + '">Edit</button>'
        + '<button class="button button-ghost" data-assign-toggle="' + esc(task.id) + '">Assign</button>'
        + '<button class="button button-danger" data-del="' + esc(task.id) + '">Delete</button>'
        + '</div>'
        + (state.assignOpen === String(task.id) ? assignPanel(task) : '')
        + '</td></tr>';
    }

    function assignPanel(task) {
      const isVolunteer = state.assignType !== 'user';
      const target = isVolunteer
        ? selectField('tsk-assign-id', 'Volunteer',
          '<option value="">Select a volunteer\u2026</option>' + volunteerOptions(state.assignId))
        : inputField('tsk-assign-id', 'Assignee user id', 'text', state.assignId, {
          hint: 'Paste the WayMark user id \u2014 the API resolves the display name.',
        });
      return '<div class="panel" style="margin-top:10px;padding:16px">'
        + '<div class="eyebrow">Assign \u00b7 ' + esc(task.title) + '</div>'
        + '<div class="chip-row" style="margin:10px 0">'
        + '<button class="button button-' + (isVolunteer ? 'primary' : 'secondary') + '" data-assign-type="volunteer">Volunteer</button>'
        + '<button class="button button-' + (!isVolunteer ? 'primary' : 'secondary') + '" data-assign-type="user">User</button>'
        + '</div>' + target
        + '<div class="chip-row" style="margin-top:10px">'
        + '<button class="button button-primary" data-assign-go="' + esc(task.id) + '">Assign</button>'
        + '<button class="button button-secondary" data-assign-cancel="1">Cancel</button>'
        + '</div></div>';
    }

    function formPanel() {
      const editing = !!state.editingId;
      const isVolunteer = state.form.assigneeType !== 'user';
      const assigneeField = isVolunteer
        ? selectField('tsk-f-assignee', 'Volunteer assignee',
          '<option value="">Unassigned</option>' + volunteerOptions(state.form.assigneeId),
          { hint: activeVolunteers().length ? '' : 'No volunteers exist for this event yet.' })
        : inputField('tsk-f-assignee', 'User assignee id', 'text', state.form.assigneeId, {
          hint: 'Leave blank to keep the task unassigned.',
        });
      const sessionOpts = '<option value="">No linked session</option>'
        + arr(state.sessions).map(function (s) {
          return '<option value="' + esc(s.id) + '"'
            + (String(s.id) === String(state.form.sessionId) ? ' selected' : '') + '>'
            + esc(s.title || 'Session') + (s.day ? ' \u00b7 ' + esc(s.day) : '')
            + (s.startTime ? ' ' + esc(s.startTime) : '') + '</option>';
        }).join('');

      return '<section class="panel">'
        + ui.sectionHeading({
          eyebrow: editing ? 'Editing task' : 'New task',
          title: editing ? 'Edit task' : 'Create a task',
          action: editing ? '<button class="button button-secondary" data-form-cancel="1">Cancel edit</button>' : '',
        })
        + inputField('tsk-f-title', 'Title', 'text', state.form.title, {
          required: true, placeholder: 'Confirm stage layout', error: state.errors.title,
        })
        + textareaField('tsk-f-desc', 'Description', state.form.description, {
          placeholder: 'What needs to happen, and any handover notes.',
        })
        + selectField('tsk-f-priority', 'Priority',
          simpleOptions(PRIORITIES, state.form.priority), { error: state.errors.priority })
        + inputField('tsk-f-due', 'Due date & time', 'datetime-local', state.form.dueAt, {
          error: state.errors.dueAt, hint: 'The API only accepts ISO date/time \u2014 the picker sends YYYY-MM-DDTHH:MM.',
        })
        + selectField('tsk-f-assignee-type', 'Assignee type',
          simpleOptions(ASSIGNEE_TYPES, state.form.assigneeType))
        + assigneeField
        + selectField('tsk-f-session', 'Linked session', sessionOpts, {
          hint: 'Sessions come from the event schedule and drive volunteer recommendations.',
        })
        + (state.errors.form ? '<div class="form-error">' + esc(state.errors.form) + '</div>' : '')
        + (state.message ? '<div class="form-info">' + esc(state.message) + '</div>' : '')
        + '<div class="modal-actions" style="justify-content:flex-start">'
        + '<button class="button button-primary" data-form-submit="1"' + (state.busy ? ' disabled' : '') + '>'
        + (state.busy ? 'Saving\u2026' : (editing ? 'Save changes' : 'Create task')) + '</button>'
        + '</div></section>';
    }

    function dependencyWarnings(nodes, edges, byNode) {
      const out = [];
      const adjacency = {};
      edges.forEach(function (edge) {
        const from = String(edge && edge.from);
        const to = String(edge && edge.to);
        adjacency[from] = adjacency[from] || [];
        adjacency[from].push(to);
      });
      const colour = {};
      let cycle = false;
      function visit(id) {
        if (cycle || colour[id] === 2) return;
        if (colour[id] === 1) { cycle = true; return; }
        colour[id] = 1;
        arr(adjacency[id]).forEach(visit);
        colour[id] = 2;
      }
      Object.keys(adjacency).forEach(visit);
      if (cycle) out.push('Cycle detected in the dependency graph \u2014 fix dependsOn before closing tasks.');

      nodes.forEach(function (node) {
        if (node && String(node.status || '') === 'Blocked') {
          out.push('Blocked: "' + (node.title || node.id) + '" is marked Blocked.');
        }
      });
      edges.forEach(function (edge) {
        const dep = byNode[String(edge && edge.from)];
        const task = byNode[String(edge && edge.to)];
        if (!dep || !task) return;
        if (String(dep.status || '') !== 'Done'
          && ['Done', 'Cancelled'].indexOf(String(task.status || '')) === -1) {
          out.push('Waiting: "' + (task.title || task.id) + '" needs "'
            + (dep.title || dep.id) + '" (currently ' + (dep.status || 'Open') + ').');
        }
      });
      const missing = edges.filter(function (edge) {
        return !byNode[String(edge && edge.from)] || !byNode[String(edge && edge.to)];
      }).length;
      if (missing) out.push(missing + ' edge(s) reference tasks outside this event.');
      const unallocated = nodes.filter(function (node) {
        return node && node.resourceAllocated === false;
      }).length;
      if (unallocated) out.push(unallocated + ' task(s) have a resource that is not allocated yet.');
      return out;
    }

    function depsPanel() {
      const deps = state.deps || {};
      const nodes = arr(deps.nodes);
      const edges = arr(deps.edges);
      const byNode = {};
      nodes.forEach(function (node) { if (node) byNode[String(node.id)] = node; });
      const warnings = dependencyWarnings(nodes, edges, byNode);

      const nodeByName = function (id) {
        const node = byNode[String(id)];
        return node ? (node.title || node.id) : String(id || '');
      };

      let body;
      if (!nodes.length && !edges.length) {
        body = ui.emptyView({
          title: 'No dependency edges yet',
          description: 'Tasks created with dependsOn appear here as a graph of blockers and dependents.',
        });
      } else {
        const nodeRows = nodes.map(function (node) {
          const allocated = node.resourceAllocated;
          const allocBadge = allocated === true
            ? ui.badge('Allocated', 'green')
            : allocated === false
              ? ui.badge('Not allocated', 'amber')
              : ui.badge('n/a', 'slate');
          return '<tr>'
            + '<td><strong>' + esc(node.title || node.id) + '</strong></td>'
            + '<td>' + WM.statusChip(node.status) + '</td>'
            + '<td>' + ui.badge(node.type || 'unassigned', 'slate') + '</td>'
            + '<td>' + (node.sessionTitle ? esc(node.sessionTitle) : '<span class="tie-note">No session</span>') + '</td>'
            + '<td>' + (node.resourceTitle ? esc(node.resourceTitle) : '<span class="tie-note">No resource</span>') + '</td>'
            + '<td>' + allocBadge + '</td></tr>';
        }).join('');

        const edgeList = edges.length
          ? '<div class="chip-row" style="margin-top:12px">' + edges.map(function (edge) {
            return '<span class="status-badge status-slate">'
              + esc(nodeByName(edge && edge.from)) + ' \u2192 ' + esc(nodeByName(edge && edge.to))
              + '</span>';
          }).join('') + '</div>'
          : '<p class="lede">No dependency edges yet.</p>';

        body = (warnings.length
          ? '<div class="form-error" style="display:block">' + warnings.map(function (w) {
            return '<div>' + ic('alert-triangle', 13) + ' ' + esc(w) + '</div>';
          }).join('') + '</div>'
          : '')
          + '<div class="data-table-wrap"><table class="data-table">'
          + '<thead><tr><th>Task</th><th>Status</th><th>Assignee type</th><th>Session</th><th>Resource</th><th>Resource allocated</th></tr></thead>'
          + '<tbody>' + nodeRows + '</tbody></table></div>'
          + edgeList;
      }

      return '<section class="panel">'
        + ui.sectionHeading({
          eyebrow: 'Dependencies', title: 'Dependency graph',
          action: '<button class="button button-secondary" data-deps-reload="1">Refresh</button>',
        })
        + body + '</section>';
    }

    function recRows() {
      const list = state.rec ? arr(state.rec.recommendations) : [];
      return list.map(function (r) {
        const reasons = arr(r.reasons);
        const blockers = arr(r.blockers);
        const vid = esc(r.volunteerId);
        return '<tr>'
          + '<td><strong>' + esc(r.name || 'Volunteer') + '</strong>'
          + '<div class="tie-note">Score ' + esc(r.score == null ? 0 : r.score) + '</div></td>'
          + '<td>' + (reasons.length
            ? reasons.map(function (reason) { return ui.badge(reason, 'green'); }).join(' ')
            : '<span class="tie-note">No matching signals</span>') + '</td>'
          + '<td>' + (blockers.length
            ? blockers.map(function (blocker) { return ui.badge(blocker, 'red'); }).join(' ')
            : ui.badge('No blockers', 'slate')) + '</td>'
          + '<td><div class="chip-row">'
          + '<button class="button button-primary" data-rec-assign="' + vid + '">Assign</button>'
          + '<div class="form-input-wrap" style="max-width:96px"><input id="rec-hours-' + vid + '" type="number" min="0.25" step="0.25" placeholder="Hours" /></div>'
          + '<button class="button button-secondary" data-rec-log="' + vid + '">Log hours</button>'
          + '</div></td></tr>';
      }).join('');
    }

    function recPanel() {
      const sessionOpts = '<option value="">Select a session\u2026</option>'
        + arr(state.sessions).map(function (s) {
          return '<option value="' + esc(s.id) + '"'
            + (String(s.id) === String(state.recSessionId) ? ' selected' : '') + '>'
            + esc(s.title || 'Session') + (s.day ? ' \u00b7 ' + esc(s.day) : '')
            + (s.startTime ? ' ' + esc(s.startTime) : '') + '</option>';
        }).join('');
      const taskOpts = '<option value="">No task selected</option>'
        + arr(state.tasks).map(function (t) {
          return '<option value="' + esc(t.id) + '"'
            + (String(t.id) === String(state.recTaskId) ? ' selected' : '') + '>'
            + esc(t.title || 'Task') + '</option>';
        }).join('');
      const rec = state.rec;
      const list = rec ? arr(rec.recommendations) : [];
      const estimate = rec && rec.estimateHours != null
        ? ui.badge('Estimate ' + rec.estimateHours + 'h', 'blue')
        : '';
      const body = state.recError
        ? '<div class="form-error">' + esc(state.recError) + '</div>'
        : list.length
          ? '<div class="data-table-wrap"><table class="data-table">'
            + '<thead><tr><th>Volunteer</th><th>Reasons</th><th>Blockers</th><th>Actions</th></tr></thead>'
            + '<tbody>' + recRows() + '</tbody></table></div>'
          : '<p class="lede">' + (rec
            ? 'No volunteers are available for this event yet.'
            : 'Pick a session or task, then load recommendations to rank volunteers by score.') + '</p>';

      return '<section class="panel">'
        + ui.sectionHeading({
          eyebrow: 'Volunteers', title: 'Recommended volunteers', action: estimate,
        })
        + '<div class="form-grid">'
        + selectField('rec-session', 'Session', sessionOpts, {
          hint: arr(state.sessions).length ? '' : 'No sessions exist for this event yet.',
        })
        + selectField('rec-task', 'Task (optional)', taskOpts)
        + '</div>'
        + '<div class="modal-actions" style="justify-content:flex-start">'
        + '<button class="button button-primary" data-rec-load="1"' + (state.recBusy ? ' disabled' : '') + '>'
        + (state.recBusy ? 'Ranking\u2026' : 'Load recommendations') + '</button>'
        + '</div>'
        + body + '</section>';
    }

    function render() {
      const events = arr(state.events);
      const heading = ui.sectionHeading({
        eyebrow: 'Hosting operations',
        title: 'Task board',
        action: eventPicker(),
      });

      if (!events.length) {
        return '<div class="page-stack">' + heading
          + ui.emptyView({
            title: 'No events to manage yet',
            description: 'Tasks belong to an event. Create or get approval for an event first.',
            action: '<a class="button button-primary" href="host-an-event.html">Host an Event</a>',
          })
          + '</div>';
      }

      const tasks = arr(state.tasks);
      const counts = {};
      STATUSES.forEach(function (s) { counts[s] = 0; });
      tasks.forEach(function (t) {
        const key = String(t && t.status);
        if (counts[key] != null) counts[key] += 1;
      });

      const statusTabs = '<div class="filter-tabs">'
        + ['All'].concat(STATUSES).map(function (s) {
          const count = s === 'All' ? tasks.length : counts[s] || 0;
          return '<button class="filter-tab' + (state.filterStatus === s ? ' filter-tab-active' : '')
            + '" data-status-filter="' + esc(s) + '">' + esc(s) + ' <em>' + count + '</em></button>';
        }).join('') + '</div>';

      const toolbar = '<section class="panel">' + statusTabs
        + '<div class="form-grid">'
        + selectField('tsk-priority-filter', 'Priority',
          allOptions(PRIORITIES, 'All priorities', state.filterPriority))
        + selectField('tsk-assignee-filter', 'Assignee type',
          allOptions(ASSIGNEE_TYPES, 'Any assignee', state.filterAssignee))
        + '</div></section>';

      const visible = tasks.filter(function (t) {
        if (state.filterStatus !== 'All' && String(t.status) !== state.filterStatus) return false;
        if (state.filterPriority !== 'All' && String(t.priority) !== state.filterPriority) return false;
        if (state.filterAssignee !== 'All' && String(t.assigneeType || 'unassigned') !== state.filterAssignee) return false;
        return true;
      });

      const table = visible.length
        ? '<section class="panel table-panel"><div class="data-table-wrap"><table class="data-table">'
          + '<thead><tr><th>Task</th><th>Due</th><th>Assignee</th><th>Status</th><th>Actions</th></tr></thead>'
          + '<tbody>' + visible.map(taskRow).join('') + '</tbody></table></div></section>'
        : ui.emptyView({
          title: 'No tasks match',
          description: tasks.length
            ? 'Adjust the filters to see more tasks.'
            : 'Create the first task for this event with the form below.',
        });

      const errorBox = state.error
        ? '<div class="queue-callout"><div class="callout-icon">' + ic('shield-alert', 20) + '</div>'
          + '<div><strong>Tasks unavailable</strong><span>' + esc(state.error) + '</span></div></div>'
        : '';

      return '<div class="page-stack">' + heading + errorBox + toolbar + table
        + formPanel() + depsPanel() + recPanel() + '</div>';
    }

    function refresh() {
      WM.refreshContent(render);
      wire();
    }

    function reloadAll() {
      state.error = '';
      if (!state.eventId) {
        state.tasks = [];
        state.deps = null;
        state.rec = null;
        refresh();
        return Promise.resolve();
      }
      const eid = state.eventId;
      const jobs = [
        call(function () { return global.WMApi.tasks.list(eid); }).then(function (rows) {
          state.tasks = arr(rows);
        }, function (err) {
          state.tasks = [];
          state.error = errText(err, 'Could not load tasks for this event.');
        }),
        call(function () { return global.WMApi.volunteers.list({ eventId: eid }); }).then(function (rows) {
          state.volunteers = arr(rows);
        }, function () {
          state.volunteers = [];
        }),
        call(function () { return global.WMApi.scheduling.sessions(eid); }).then(function (rows) {
          state.sessions = arr(rows);
        }, function () {
          state.sessions = [];
        }),
        call(function () { return global.WMApi.tasks.dependencies(eid); }).then(function (data) {
          state.deps = data && typeof data === 'object' ? data : null;
        }, function () {
          state.deps = null;
        }),
      ];
      return Promise.all(jobs).then(function () { refresh(); });
    }

    function resetForEvent() {
      state.tasks = [];
      state.volunteers = [];
      state.sessions = [];
      state.deps = null;
      state.rec = null;
      state.recSessionId = '';
      state.recTaskId = '';
      state.recError = '';
      state.assignOpen = '';
      state.assignId = '';
      state.editingId = '';
      state.form = blankForm();
      state.errors = {};
      state.message = '';
      state.error = '';
    }

    function submitForm() {
      if (state.busy) return;
      const form = state.form;
      const errors = {};
      if (!String(form.title || '').trim()) errors.title = 'A task title is required.';
      if (form.dueAt && !DUE_RE.test(String(form.dueAt))) {
        errors.dueAt = 'Use the date/time picker \u2014 the API rejects natural-language dates.';
      }
      state.errors = errors;
      if (Object.keys(errors).length) { refresh(); return; }

      const payload = {
        title: String(form.title).trim(),
        description: String(form.description || ''),
        priority: PRIORITIES.indexOf(form.priority) !== -1 ? form.priority : 'Normal',
        dueAt: String(form.dueAt || ''),
        assigneeType: form.assigneeType === 'user' ? 'user' : 'volunteer',
        assigneeId: String(form.assigneeId || ''),
        sessionId: String(form.sessionId || ''),
      };
      const editingId = state.editingId;
      state.busy = true;
      state.message = '';
      refresh();
      const request = editingId
        ? call(function () { return global.WMApi.tasks.update(editingId, payload); })
        : call(function () { return global.WMApi.tasks.create(state.eventId, payload); });
      request.then(function () {
        state.busy = false;
        state.editingId = '';
        state.form = blankForm();
        state.errors = {};
        state.message = 'Task saved.';
        WM.toast('Task saved.');
        reloadAll();
      }, function (err) {
        state.busy = false;
        state.errors = { form: errText(err, 'Could not save the task.') };
        refresh();
      });
    }

    function loadRecommendations() {
      if (!state.eventId) return;
      if (!state.recSessionId && !state.recTaskId) {
        state.recError = 'Pick a session or a task first.';
        refresh();
        return;
      }
      const params = {};
      if (state.recSessionId) params.sessionId = state.recSessionId;
      if (state.recTaskId) params.taskId = state.recTaskId;
      state.recBusy = true;
      state.recError = '';
      refresh();
      call(function () {
        return global.WMApi.tasks.recommendations(state.eventId, params);
      }).then(function (data) {
        state.rec = data && typeof data === 'object' ? data : null;
        state.recBusy = false;
        refresh();
      }, function (err) {
        state.rec = null;
        state.recBusy = false;
        state.recError = errText(err, 'Could not load volunteer recommendations.');
        refresh();
      });
    }

    function wire() {
      const eventSel = byId('tsk-event');
      if (eventSel) eventSel.addEventListener('change', function () {
        state.eventId = eventSel.value;
        resetForEvent();
        reloadAll();
      });

      const bindInput = function (id, key) {
        const el = byId(id);
        if (!el) return;
        el.addEventListener('input', function () {
          state.form[key] = el.value;
          state.errors[key] = '';
        });
      };
      bindInput('tsk-f-title', 'title');
      bindInput('tsk-f-desc', 'description');
      bindInput('tsk-f-due', 'dueAt');
      bindInput('tsk-f-assignee', 'assigneeId');

      const prioritySel = byId('tsk-f-priority');
      if (prioritySel) prioritySel.addEventListener('change', function () {
        state.form.priority = prioritySel.value;
      });
      const typeSel = byId('tsk-f-assignee-type');
      if (typeSel) typeSel.addEventListener('change', function () {
        state.form.assigneeType = typeSel.value === 'user' ? 'user' : 'volunteer';
        state.form.assigneeId = '';
        refresh();
      });
      const sessionSel = byId('tsk-f-session');
      if (sessionSel) sessionSel.addEventListener('change', function () {
        state.form.sessionId = sessionSel.value;
      });

      qsAll('[data-form-submit]').forEach(function (b) {
        b.addEventListener('click', submitForm);
      });
      qsAll('[data-form-cancel]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.editingId = '';
          state.form = blankForm();
          state.errors = {};
          state.message = '';
          refresh();
        });
      });

      qsAll('[data-status-filter]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.filterStatus = b.getAttribute('data-status-filter') || 'All';
          refresh();
        });
      });
      const priorityFilter = byId('tsk-priority-filter');
      if (priorityFilter) priorityFilter.addEventListener('change', function () {
        state.filterPriority = priorityFilter.value;
        refresh();
      });
      const assigneeFilter = byId('tsk-assignee-filter');
      if (assigneeFilter) assigneeFilter.addEventListener('change', function () {
        state.filterAssignee = assigneeFilter.value;
        refresh();
      });

      qsAll('[data-status]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          const id = sel.getAttribute('data-status');
          sel.disabled = true;
          call(function () { return global.WMApi.tasks.update(id, { status: sel.value }); })
            .then(function () {
              WM.toast('Task status updated.');
              reloadAll();
            }, function (err) {
              sel.disabled = false;
              WM.toast(errText(err, 'Could not update the status.'), 'error');
              refresh();
            });
        });
      });

      qsAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          const task = findTask(b.getAttribute('data-edit'));
          if (!task) return;
          state.editingId = String(task.id);
          state.form = {
            title: task.title || '',
            description: task.description || '',
            priority: PRIORITIES.indexOf(task.priority) !== -1 ? task.priority : 'Normal',
            dueAt: toInputValue(task.dueAt),
            assigneeType: task.assigneeType === 'user' ? 'user' : 'volunteer',
            assigneeId: task.assigneeId || '',
            sessionId: task.sessionId || '',
          };
          state.errors = {};
          state.message = '';
          state.assignOpen = '';
          refresh();
        });
      });

      qsAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!global.confirm('Delete this task? Tasks that depend on it must be removed first.')) return;
          const id = b.getAttribute('data-del');
          b.disabled = true;
          call(function () { return global.WMApi.tasks.remove(id); }).then(function () {
            state.editingId = '';
            WM.toast('Task deleted.');
            reloadAll();
          }, function (err) {
            b.disabled = false;
            WM.toast(errText(err, 'Could not delete the task.'), 'error');
          });
        });
      });

      qsAll('[data-assign-toggle]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = String(b.getAttribute('data-assign-toggle'));
          state.assignOpen = state.assignOpen === id ? '' : id;
          state.assignId = '';
          const task = findTask(id);
          state.assignType = task && task.assigneeType === 'user' ? 'user' : 'volunteer';
          refresh();
        });
      });
      qsAll('[data-assign-type]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.assignType = b.getAttribute('data-assign-type') === 'user' ? 'user' : 'volunteer';
          state.assignId = '';
          refresh();
        });
      });
      const assignIdEl = byId('tsk-assign-id');
      if (assignIdEl) {
        assignIdEl.addEventListener('input', function () { state.assignId = assignIdEl.value; });
        assignIdEl.addEventListener('change', function () { state.assignId = assignIdEl.value; });
      }
      qsAll('[data-assign-go]').forEach(function (b) {
        b.addEventListener('click', function () {
          const taskId = b.getAttribute('data-assign-go');
          const assigneeId = String(state.assignId || '').trim();
          if (!assigneeId) {
            WM.toast('Choose or enter an assignee id first.', 'warning');
            return;
          }
          b.disabled = true;
          call(function () {
            return global.WMApi.tasks.assign(taskId, {
              assigneeId: assigneeId,
              assigneeType: state.assignType,
            });
          }).then(function () {
            state.assignOpen = '';
            state.assignId = '';
            WM.toast('Task assigned.');
            reloadAll();
          }, function (err) {
            b.disabled = false;
            WM.toast(errText(err, 'Could not assign the task.'), 'error');
          });
        });
      });
      qsAll('[data-assign-cancel]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.assignOpen = '';
          state.assignId = '';
          refresh();
        });
      });

      qsAll('[data-deps-reload]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!state.eventId) return;
          b.disabled = true;
          call(function () { return global.WMApi.tasks.dependencies(state.eventId); })
            .then(function (data) {
              state.deps = data && typeof data === 'object' ? data : null;
              refresh();
            }, function (err) {
              b.disabled = false;
              state.error = errText(err, 'Could not load the dependency graph.');
              refresh();
            });
        });
      });

      const recSession = byId('rec-session');
      if (recSession) recSession.addEventListener('change', function () {
        state.recSessionId = recSession.value;
      });
      const recTask = byId('rec-task');
      if (recTask) recTask.addEventListener('change', function () {
        state.recTaskId = recTask.value;
      });
      qsAll('[data-rec-load]').forEach(function (b) {
        b.addEventListener('click', loadRecommendations);
      });
      qsAll('[data-rec-assign]').forEach(function (b) {
        b.addEventListener('click', function () {
          const taskId = state.recTaskId || (state.rec && state.rec.taskId) || '';
          if (!taskId) {
            WM.toast('Pick a task to assign this volunteer to.', 'warning');
            return;
          }
          b.disabled = true;
          call(function () {
            return global.WMApi.tasks.assign(taskId, {
              assigneeId: b.getAttribute('data-rec-assign'),
              assigneeType: 'volunteer',
            });
          }).then(function () {
            WM.toast('Volunteer assigned.');
            reloadAll();
          }, function (err) {
            b.disabled = false;
            WM.toast(errText(err, 'Could not assign the volunteer.'), 'error');
          });
        });
      });
      qsAll('[data-rec-log]').forEach(function (b) {
        b.addEventListener('click', function () {
          const volunteerId = b.getAttribute('data-rec-log');
          const input = byId('rec-hours-' + volunteerId);
          const hours = parseFloat(input ? input.value : '');
          if (!isFinite(hours) || hours <= 0) {
            WM.toast('Enter hours greater than zero.', 'warning');
            return;
          }
          b.disabled = true;
          call(function () {
            return global.WMApi.tasks.logHours(state.eventId, volunteerId, { hours: hours });
          }).then(function () {
            WM.toast('Hours logged.');
            reloadAll();
          }, function (err) {
            b.disabled = false;
            WM.toast(errText(err, 'Could not log hours.'), 'error');
          });
        });
      });
    }

    function load() {
      return call(function () { return global.WMApi.events.list(); }).then(function (events) {
        state.events = arr(events);
        if (state.events.length) state.eventId = String(state.events[0].id);
        if (!state.eventId) return null;
        return reloadAll();
      }).catch(function (err) {
        state.events = [];
        state.error = errText(err, 'Could not load events.');
      });
    }

    WM.page({ route: '/tasks', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.tasksBoard = tasksBoard;
})(window);
