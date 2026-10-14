/* Volunteer management — event-scoped volunteers. Volunteers are guests, not
 * an application role: the event host or an admin adds them, sets a department
 * and shift, and issues an invite link. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;
  const STATUSES = ['Invited', 'Confirmed', 'Active', 'Removed'];

  function volunteers() {
    const state = {
      events: [], eventId: '', rows: [], categoryBusy: false,
      form: { name: '', email: '', department: '', responsibility: '', shiftDate: '', shiftTime: '' },
      errors: {}, message: '', error: '',
    };

    function currentEvent() {
      return state.events.filter(function (e) { return String(e.id) === String(state.eventId); })[0];
    }

    function eventOptions() {
      return state.events.map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(state.eventId) ? ' selected' : '') + '>' + esc(e.title) + '</option>';
      }).join('');
    }

    function field(id, label, key, opts) {
      opts = opts || {};
      return '<div class="form-field-group"><label for="' + id + '">' + esc(label) + (opts.required ? '<span class="form-req">*</span>' : '') + '</label>'
        + '<div class="form-input-wrap' + (state.errors[key] ? ' form-input-error' : '') + '">'
        + '<input id="' + id + '" type="' + (opts.type || 'text') + '" placeholder="' + esc(opts.placeholder || '') + '" value="' + esc(state.form[key]) + '" /></div>'
        + (state.errors[key] ? '<span class="field-error">' + esc(state.errors[key]) + '</span>' : '') + '</div>';
    }

    function render() {
      if (!state.events.length) {
        return '<div class="page-stack">' + ui.sectionHeading({ eyebrow: 'Hosting operations', title: 'Volunteer management' })
          + ui.emptyView({ title: 'No events to staff yet', description: 'Once you have an approved event you can add volunteers here.', action: '<a class="button button-primary" href="host-an-event.html">Host an Event</a>' })
          + '</div>';
      }

      const selectors = '<section class="panel"><div class="form-grid">'
        + '<div class="form-field-group"><label for="vol-event">Event</label>'
        + '<div class="form-input-wrap"><select id="vol-event">' + eventOptions() + '</select></div></div>'
        + '</div></section>';

      const addForm = '<form class="panel" id="vol-form">'
        + '<h3 class="section-title">Add a volunteer</h3>'
        + '<div class="form-grid">'
        + field('vol-name', 'Name', 'name', { required: true, placeholder: 'Priya Nair' })
        + field('vol-email', 'Email', 'email', { type: 'email', placeholder: 'priya@example.com' })
        + field('vol-dept', 'Department', 'department', { placeholder: 'Logistics, Registration, Stage…' })
        + field('vol-resp', 'Responsibility', 'responsibility', { placeholder: 'Check-in desk lead' })
        + field('vol-date', 'Shift date', 'shiftDate', { placeholder: 'Jan 22, 2027' })
        + field('vol-time', 'Shift time', 'shiftTime', { placeholder: '09:00 - 13:00' })
        + '</div>'
        + (state.errors.form ? '<div class="form-error">' + esc(state.errors.form) + '</div>' : '')
        + (state.message ? '<div class="form-info">' + esc(state.message) + '</div>' : '')
        + '<div class="modal-actions"><button type="submit" class="button button-primary"' + (state.categoryBusy ? ' disabled' : '') + '>'
        + (state.categoryBusy ? '<span class="loading-spinner"></span> Adding…' : 'Add volunteer ' + ic('plus', 16)) + '</button></div>'
        + '</form>';

      let table;
      if (state.error) {
        table = '<div class="queue-callout"><div class="callout-icon">' + ic('shield-alert', 20) + '</div><div><strong>Not your event</strong><span>' + esc(state.error) + '</span></div></div>';
      } else if (!state.rows.length) {
        table = ui.emptyView({ title: 'No volunteers yet', description: 'Add your first volunteer using the form above.' });
      } else {
        const rows = state.rows.map(function (v) {
          const statusOptions = STATUSES.map(function (s) {
            return '<option' + (s === v.status ? ' selected' : '') + '>' + esc(s) + '</option>';
          }).join('');
          const invite = v.inviteToken ? 'volunteer.html?token=' + encodeURIComponent(v.inviteToken) : '';
          return '<div class="table-row"><div class="table-event"><strong>' + esc(v.name) + '</strong>'
            + '<small>' + esc(v.department || 'No department') + (v.responsibility ? ' · ' + esc(v.responsibility) : '') + '</small>'
            + '<small>' + esc(v.email || '') + (v.shiftDate ? ' · ' + esc(v.shiftDate) + ' ' + esc(v.shiftTime || '') : '') + '</small></div>'
            + '<div class="form-input-wrap"><select data-status="' + esc(v.id) + '">' + statusOptions + '</select></div>'
            + ui.badge(v.status, v.status === 'Active' || v.status === 'Confirmed' ? 'green' : v.status === 'Removed' ? 'slate' : 'amber')
            + '<div class="row-actions"><button class="button button-secondary" data-invite="' + esc(v.id) + '"' + (invite ? ' data-invite-url="' + esc(invite) + '"' : '') + '>Invite link</button>'
            + '<button class="button button-ghost" data-remove="' + esc(v.id) + '">Remove</button></div></div>';
        }).join('');
        table = '<section class="panel table-panel"><div class="table-head"><span>Volunteer</span><span>Status</span><span>State</span><span></span></div>' + rows + '</section>';
      }

      const ev = currentEvent();
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Hosting operations', title: 'Volunteer management',
          action: ev ? '<span class="chip">' + esc(ev.title) + '</span>' : '' })
        + selectors + addForm + table + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function reloadVolunteers() {
      state.error = '';
      if (!state.eventId) { state.rows = []; refresh(); return Promise.resolve(); }
      return global.WMApi.volunteers.list({ eventId: state.eventId }).then(function (rows) {
        state.rows = Array.isArray(rows) ? rows : [];
        refresh();
      }, function (err) {
        state.rows = [];
        state.error = (err && err.message) || 'Could not load volunteers for this event.';
        refresh();
      });
    }

    function wire() {
      const sel = document.getElementById('vol-event');
      if (sel) sel.addEventListener('change', function () {
        state.eventId = sel.value; state.message = ''; state.errors = {};
        reloadVolunteers();
      });

      const bind = function (id, key) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', function () { state.form[key] = el.value; state.errors[key] = undefined; });
      };
      bind('vol-name', 'name'); bind('vol-email', 'email'); bind('vol-dept', 'department');
      bind('vol-resp', 'responsibility'); bind('vol-date', 'shiftDate'); bind('vol-time', 'shiftTime');

      const form = document.getElementById('vol-form');
      if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!state.form.name.trim()) { state.errors = { name: 'Volunteer name is required.' }; refresh(); return; }
        state.errors = {}; state.categoryBusy = true; refresh();
        const payload = {
          eventId: state.eventId, name: state.form.name.trim(), email: state.form.email.trim(),
          department: state.form.department.trim(), responsibility: state.form.responsibility.trim(),
          shiftDate: state.form.shiftDate.trim(), shiftTime: state.form.shiftTime.trim(),
        };
        global.WMApi.volunteers.create(payload).then(function () {
          state.categoryBusy = false;
          state.form = { name: '', email: '', department: '', responsibility: '', shiftDate: '', shiftTime: '' };
          state.message = 'Volunteer added. An invite link is ready to share.';
          reloadVolunteers();
        }, function (err) {
          state.categoryBusy = false;
          state.errors = { form: (err && err.message) || 'Could not add the volunteer.' };
          refresh();
        });
      });

      document.querySelectorAll('[data-status]').forEach(function (s) {
        s.addEventListener('change', function () {
          global.WMApi.volunteers.update(s.getAttribute('data-status'), { status: s.value }).then(function () { WM.toast('Volunteer updated.'); reloadVolunteers(); },
            function (err) { WM.toast((err && err.message) || 'Could not update.', 'error'); });
        });
      });
      document.querySelectorAll('[data-invite]').forEach(function (b) {
        b.addEventListener('click', function () {
          const url = b.getAttribute('data-invite-url');
          global.WMApi.volunteers.invite(b.getAttribute('data-invite')).then(function (data) {
            const link = (data && data.inviteUrl) || url || '';
            if (link && global.navigator && global.navigator.clipboard) {
              global.navigator.clipboard.writeText(link).then(function () { WM.toast('Invite link copied to clipboard.'); },
                function () { WM.toast('Invite ready: ' + link); });
            } else {
              WM.toast(link ? 'Invite ready: ' + link : 'Invite email sent.');
            }
          }, function (err) { WM.toast((err && err.message) || 'Could not send invite.', 'error'); });
        });
      });
      document.querySelectorAll('[data-remove]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!global.confirm('Remove this volunteer?')) return;
          b.disabled = true;
          global.WMApi.volunteers.remove(b.getAttribute('data-remove')).then(function () { WM.toast('Volunteer removed.'); reloadVolunteers(); },
            function (err) { b.disabled = false; WM.toast((err && err.message) || 'Could not remove.', 'error'); });
        });
      });
    }

    function load() {
      return global.WMApi.events.list().then(function (events) {
        state.events = Array.isArray(events) ? events : [];
        if (state.events.length) state.eventId = String(state.events[0].id);
        if (!state.eventId) { state.rows = []; return; }
        return global.WMApi.volunteers.list({ eventId: state.eventId }).then(function (rows) {
          state.rows = Array.isArray(rows) ? rows : [];
        }, function (err) {
          state.rows = []; state.error = (err && err.message) || 'Could not load volunteers for this event.';
        });
      });
    }

    WM.page({ route: '/volunteers', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.volunteers = volunteers;
})(window);
