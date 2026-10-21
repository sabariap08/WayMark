/* Organizations — multi-tenant orgs, members, roles/permissions and event
 * attachment. The backend model carries name/description/website/
 * contactEmail only (no industry/city columns), so the UI sticks to the
 * fields organization_json actually returns. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  const ROLES = ['Owner', 'Manager', 'Member'];
  const PERMS = ['events', 'budget', 'sponsors', 'reports', 'volunteers'];

  function qs(sel) {
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function qsa(sel) {
    let nodes = null;
    try { nodes = document.querySelectorAll(sel); } catch (e) { nodes = null; }
    return (nodes && typeof nodes.forEach === 'function') ? nodes : [];
  }

  function orgForm(o) {
    return '<div class="form-grid-2">'
      + '<div class="form-field-group"><label for="' + o.prefix + '-name">Name<span class="form-req">*</span></label>'
      + '<div class="form-input-wrap"><input id="' + o.prefix + '-name" type="text" value="' + esc(o.value.name) + '" placeholder="Acme Events" /></div></div>'
      + '<div class="form-field-group"><label for="' + o.prefix + '-email">Contact email</label>'
      + '<div class="form-input-wrap"><input id="' + o.prefix + '-email" type="email" value="' + esc(o.value.contactEmail) + '" placeholder="events@acme.example" /></div></div>'
      + '<div class="form-field-group"><label for="' + o.prefix + '-website">Website</label>'
      + '<div class="form-input-wrap"><input id="' + o.prefix + '-website" type="url" value="' + esc(o.value.website) + '" placeholder="https://acme.example" /></div></div>'
      + '<div class="form-field-group"><label for="' + o.prefix + '-desc">Description</label>'
      + '<div class="form-input-wrap"><input id="' + o.prefix + '-desc" type="text" value="' + esc(o.value.description) + '" placeholder="What this organization runs" /></div></div>'
      + '</div>';
  }

  function organizationsPage() {
    const state = {
      orgs: [], events: [],
      selectedId: '', detail: null, members: [], orgEvents: [],
      create: { name: '', description: '', website: '', contactEmail: '' },
      createBusy: false, createError: '',
      editingId: '', edit: { name: '', description: '', website: '', contactEmail: '' },
      add: { email: '', orgRole: 'Member' },
      attach: { eventId: '', orgId: '' },
      message: '', error: '',
    };

    function selectedOrg() {
      return state.orgs.filter(function (o) { return String(o.id) === String(state.selectedId); })[0] || null;
    }

    function eventOptions(selected, placeholder) {
      let opts = '<option value="">' + esc(placeholder || 'Choose an event…') + '</option>';
      opts += state.events.map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (String(e.id) === String(selected) ? ' selected' : '') + '>'
          + esc(e.title) + '</option>';
      }).join('');
      return opts;
    }

    function orgOptions(selected, placeholder) {
      let opts = '<option value="">' + esc(placeholder || 'Choose an organization…') + '</option>';
      opts += state.orgs.map(function (o) {
        return '<option value="' + esc(o.id) + '"' + (String(o.id) === String(selected) ? ' selected' : '') + '>'
          + esc(o.name) + '</option>';
      }).join('');
      return opts;
    }

    /* ------------------------------------------------------------------ *
     * Render                                                              *
     * ------------------------------------------------------------------ */
    function attachPanel() {
      return '<section class="panel"><h3 class="section-title">Attach an event to an organization</h3>'
        + '<p class="lede">Managers and admins only — the server rejects hosts attaching events they do not manage. '
        + 'Detaching sends an empty orgId.</p>'
        + '<div class="form-grid-2">'
        + '<div class="form-field-group"><label for="attach-event">Event</label>'
        + '<div class="form-input-wrap"><select id="attach-event"' + (state.events.length ? '' : ' disabled') + '>'
        + eventOptions(state.attach.eventId) + '</select></div></div>'
        + '<div class="form-field-group"><label for="attach-org">Organization</label>'
        + '<div class="form-input-wrap"><select id="attach-org"' + (state.orgs.length ? '' : ' disabled') + '>'
        + orgOptions(state.attach.orgId) + '</select></div></div>'
        + '</div>'
        + '<div class="modal-actions">'
        + '<button type="button" class="button button-secondary" data-detach-event>Detach (clear org)</button>'
        + '<button type="button" class="button button-primary" data-attach-event>Attach event</button>'
        + '</div></section>';
    }

    function createPanel() {
      return '<section class="panel"><h3 class="section-title">Create an organization</h3>'
        + orgForm({ prefix: 'org-new', value: state.create })
        + WM.forms.formStatus(state.createError ? 'error' : 'idle', state.createError)
        + '<div class="modal-actions"><button type="button" class="button button-primary" data-create-org' + (state.createBusy ? ' disabled' : '') + '>'
        + (state.createBusy ? '<span class="loading-spinner"></span> Creating…' : 'Create organization ' + ic('plus', 16)) + '</button></div>'
        + '</section>';
    }

    function orgList() {
      if (!state.orgs.length) {
        return ui.emptyView({ title: 'No organizations yet', description: 'Create one above — you become its Owner automatically.' });
      }
      const rows = state.orgs.map(function (o) {
        if (String(o.id) === String(state.editingId)) {
          return '<div class="panel" data-edit-panel="' + esc(o.id) + '">'
            + '<h4 class="section-title">Edit ' + esc(o.name) + '</h4>'
            + orgForm({ prefix: 'org-edit', value: state.edit })
            + '<div class="modal-actions">'
            + '<button type="button" class="button button-secondary" data-cancel-edit>Cancel</button>'
            + '<button type="button" class="button button-primary" data-save-org="' + esc(o.id) + '">Save changes</button>'
            + '</div></div>';
        }
        const selected = String(o.id) === String(state.selectedId);
        return '<div class="table-row"><div class="table-event"><strong>' + esc(o.name) + '</strong>'
          + '<small>' + esc(o.contactEmail || 'No contact email') + (o.website ? ' · ' + esc(o.website) : '') + '</small>'
          + '<small>' + esc(o.membersCount != null ? o.membersCount : '?') + ' member(s) · created by ' + esc(o.createdBy || '—') + '</small>'
          + (o.description ? '<small>' + esc(o.description) + '</small>' : '') + '</div>'
          + ui.badge(o.status || 'Active', 'green')
          + '<div class="row-actions">'
          + '<button class="button button-secondary" data-select-org="' + esc(o.id) + '">' + (selected ? 'Selected' : 'Manage') + '</button>'
          + '<button class="button button-ghost" data-edit-org="' + esc(o.id) + '">Edit</button>'
          + '<button class="button button-ghost" data-delete-org="' + esc(o.id) + '">Delete</button>'
          + '</div></div>';
      }).join('');
      return '<section class="panel table-panel"><div class="table-head"><span>Organization</span><span>Status</span><span></span></div>'
        + rows + '</section>';
    }

    function membersPanel() {
      const org = selectedOrg();
      if (!org) return '';

      const addForm = '<form class="panel" id="add-member-form"><h3 class="section-title">Add a member</h3>'
        + '<div class="form-grid-2">'
        + '<div class="form-field-group"><label for="member-email">Email<span class="form-req">*</span></label>'
        + '<div class="form-input-wrap"><input id="member-email" type="email" placeholder="teammate@example.com" value="' + esc(state.add.email) + '" /></div></div>'
        + '<div class="form-field-group"><label for="member-role">Role</label>'
        + '<div class="form-input-wrap form-select-wrap"><select id="member-role">'
        + ROLES.map(function (r) { return '<option' + (r === state.add.orgRole ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('')
        + '</select>' + ic('chevron-down', 16, 'class="form-select-chevron"') + '</div></div>'
        + '</div>'
        + '<p class="lede">The user must already exist on WayMark — unknown emails are rejected with a 409.</p>'
        + '<div class="modal-actions"><button type="submit" class="button button-primary">Add member ' + ic('user-plus', 15) + '</button></div>'
        + '</form>';

      let list;
      if (!state.members.length) {
        list = ui.emptyView({ title: 'No members loaded', description: 'Members appear once the server returns them, or after you add one above.' });
      } else {
        const rows = state.members.map(function (m) {
          const roleOptions = ROLES.map(function (r) {
            return '<option' + (r === m.orgRole ? ' selected' : '') + '>' + esc(r) + '</option>';
          }).join('');
          const permChecks = PERMS.map(function (p) {
            const on = Array.isArray(m.permissions) && m.permissions.indexOf(p) !== -1;
            return '<div class="form-checkbox-row"><button type="button" class="form-checkbox'
              + (on ? ' form-checkbox-on' : '') + '" data-perm="' + esc(m.id) + '" data-perm-key="' + esc(p)
              + '" aria-pressed="' + on + '" aria-label="' + esc(p) + ' permission">' + (on ? ic('check', 13, 'stroke-width="3"') : '') + '</button>'
              + '<div><span>' + esc(p) + '</span></div></div>';
          }).join('');
          return '<div class="table-row" style="flex-wrap:wrap"><div class="table-event"><strong>' + esc(m.name || m.email || 'Member') + '</strong>'
            + '<small>' + esc(m.email || '') + '</small>'
            + ui.badge(m.status || 'Active', 'slate') + '</div>'
            + '<div class="form-input-wrap form-select-wrap"><select data-member-role="' + esc(m.id) + '">' + roleOptions + '</select>'
            + ic('chevron-down', 16, 'class="form-select-chevron"') + '</div>'
            + '<div class="form-grid-2" style="flex:1">' + permChecks + '</div>'
            + '<div class="row-actions"><button class="button button-ghost" data-remove-member="' + esc(m.id) + '">Remove</button></div></div>';
        }).join('');
        list = '<section class="panel table-panel"><div class="table-head"><span>Member</span><span>Role</span><span>Permissions</span><span></span></div>'
          + rows + '</section>';
      }

      let events;
      if (state.error && /permission/i.test(state.error)) {
        events = '<div class="form-error">' + esc(state.error) + '</div>';
      } else if (!state.orgEvents.length) {
        events = ui.emptyView({ title: 'No events for this organization', description: 'Attach events using the panel at the top of the page.' });
      } else {
        const rows = state.orgEvents.map(function (e) {
          return '<div class="table-row"><div class="table-event"><strong>' + esc(e.title) + '</strong>'
            + '<small>' + esc(e.date || '') + (e.time ? ' · ' + esc(e.time) : '') + ' · ' + esc(e.location || '') + '</small></div>'
            + ui.statusChip(e.status)
            + '<div class="row-actions"><button class="button button-ghost" data-detach="' + esc(e.id) + '">Detach</button></div></div>';
        }).join('');
        events = '<section class="panel table-panel"><div class="table-head"><span>Event</span><span>Status</span><span></span></div>' + rows + '</section>';
      }

      return '<section class="panel"><h3 class="section-title">' + esc(org.name) + '</h3>'
        + '<p class="lede">' + esc(org.description || 'No description.') + '</p>'
        + '<p class="lede">' + esc(org.contactEmail || '') + (org.website ? ' · ' + esc(org.website) : '') + '</p></section>'
        + addForm + list
        + ui.sectionHeading({ eyebrow: 'Organization', title: 'Events in this organization' })
        + events;
    }

    function render() {
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Administration', title: 'Organizations' })
        + '<p class="lede">Multi-tenant homes for events, with per-member roles and granular permissions.</p>'
        + WM.forms.formStatus(state.error ? 'error' : 'success', state.error || state.message)
        + attachPanel() + createPanel() + orgList() + membersPanel()
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    /* ------------------------------------------------------------------ *
     * Data loading                                                        *
     * ------------------------------------------------------------------ */
    function reloadOrgs() {
      return global.WMApi.organizations.list().then(function (rows) {
        state.orgs = Array.isArray(rows) ? rows : [];
      }, function (err) {
        state.orgs = [];
        state.error = (err && err.message) || 'Could not load organizations.';
      });
    }

    function reloadEvents() {
      return global.WMApi.events.list().then(function (rows) {
        state.events = Array.isArray(rows) ? rows : [];
      }, function () { state.events = []; });
    }

    function loadDetail(orgId) {
      state.selectedId = String(orgId || '');
      state.members = []; state.orgEvents = [];
      if (!state.selectedId) { refresh(); return; }
      refresh();
      global.WMApi.organizations.get(orgId).then(function (org) {
        state.detail = (org && typeof org === 'object') ? org : null;
        refresh();
      }, function (err) {
        state.detail = null;
        state.error = (err && err.message) || 'Could not load the organization.';
        refresh();
      });
      global.WMApi.organizations.members(orgId).then(function (rows) {
        state.members = Array.isArray(rows) ? rows : [];
        refresh();
      }, function (err) {
        state.members = [];
        state.error = (err && err.message) || 'Could not load members.';
        refresh();
      });
      global.WMApi.organizations.events(orgId).then(function (rows) {
        state.orgEvents = Array.isArray(rows) ? rows : [];
        refresh();
      }, function (err) {
        state.orgEvents = [];
        if (err && err.message) { state.error = err.message; }
        refresh();
      });
    }

    /* ------------------------------------------------------------------ *
     * Wire                                                                *
     * ------------------------------------------------------------------ */
    function bindForm(prefix, target) {
      const map = { name: '-name', contactEmail: '-email', website: '-website', description: '-desc' };
      Object.keys(map).forEach(function (key) {
        const el = document.getElementById(prefix + map[key]);
        if (el) el.addEventListener('input', function () { target[key] = el.value; });
      });
    }

    function wire() {
      bindForm('org-new', state.create);
      bindForm('org-edit', state.edit);

      const createBtn = qs('[data-create-org]');
      if (createBtn) createBtn.addEventListener('click', function () {
        const name = String(state.create.name || '').trim();
        if (!name) { state.createError = 'Name is required.'; refresh(); return; }
        state.createError = ''; state.createBusy = true; state.error = ''; refresh();
        global.WMApi.organizations.create({
          name: name,
          description: String(state.create.description || '').trim(),
          website: String(state.create.website || '').trim(),
          contactEmail: String(state.create.contactEmail || '').trim(),
        }).then(function () {
          state.createBusy = false;
          state.create = { name: '', description: '', website: '', contactEmail: '' };
          state.message = 'Organization created — you are its Owner.';
          reloadOrgs().then(refresh);
        }, function (err) {
          state.createBusy = false;
          state.createError = (err && err.message) || 'Could not create the organization.';
          refresh();
        });
      });

      qsa('[data-select-org]').forEach(function (b) {
        b.addEventListener('click', function () { state.error = ''; state.message = ''; loadDetail(b.getAttribute('data-select-org')); });
      });

      qsa('[data-edit-org]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-edit-org');
          const org = state.orgs.filter(function (o) { return String(o.id) === String(id); })[0];
          if (!org) return;
          state.error = ''; state.message = '';
          state.editingId = String(id);
          state.edit = {
            name: org.name || '', description: org.description || '',
            website: org.website || '', contactEmail: org.contactEmail || '',
          };
          refresh();
        });
      });

      const cancelBtn = qs('[data-cancel-edit]');
      if (cancelBtn) cancelBtn.addEventListener('click', function () { state.editingId = ''; refresh(); });

      qsa('[data-save-org]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-save-org');
          b.disabled = true;
          global.WMApi.organizations.update(id, {
            name: String(state.edit.name || '').trim(),
            description: String(state.edit.description || '').trim(),
            website: String(state.edit.website || '').trim(),
            contactEmail: String(state.edit.contactEmail || '').trim(),
          }).then(function () {
            state.editingId = '';
            state.message = 'Organization updated.';
            reloadOrgs().then(refresh);
          }, function (err) {
            b.disabled = false;
            state.error = (err && err.message) || 'Could not update the organization.';
            refresh();
          });
        });
      });

      qsa('[data-delete-org]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-delete-org');
          const org = state.orgs.filter(function (o) { return String(o.id) === String(id); })[0];
          if (!global.confirm('Delete organization "' + ((org && org.name) || '') + '"? Attached events become unassigned.')) return;
          b.disabled = true;
          global.WMApi.organizations.remove(id).then(function () {
            WM.toast('Organization deleted.');
            if (String(state.selectedId) === String(id)) {
              state.selectedId = ''; state.detail = null; state.members = []; state.orgEvents = [];
            }
            reloadOrgs().then(refresh);
          }, function (err) {
            b.disabled = false;
            /* Backend: 403 "Only organization owner can delete this organization." */
            state.error = (err && err.message) || 'Could not delete the organization.';
            refresh();
          });
        });
      });

      const addForm = document.getElementById('add-member-form');
      if (addForm) addForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!state.selectedId) return;
        const email = String(state.add.email || '').trim().toLowerCase();
        if (!email) { state.error = 'A member email is required.'; refresh(); return; }
        state.error = ''; refresh();
        global.WMApi.organizations.addMember(state.selectedId, { email: email, orgRole: state.add.orgRole })
          .then(function () {
            state.add = { email: '', orgRole: 'Member' };
            state.message = 'Member added.';
            global.WMApi.organizations.members(state.selectedId).then(function (rows) {
              state.members = Array.isArray(rows) ? rows : [];
              refresh();
            }, function () { refresh(); });
          }, function (err) {
            /* 409s: unknown email, or already a member — render backend message. */
            state.error = (err && err.message) || 'Could not add the member.';
            refresh();
          });
      });

      const memberEmail = document.getElementById('member-email');
      if (memberEmail) memberEmail.addEventListener('input', function () { state.add.email = memberEmail.value; });
      const memberRoleNew = document.getElementById('member-role');
      if (memberRoleNew) memberRoleNew.addEventListener('change', function () { state.add.orgRole = memberRoleNew.value; });

      qsa('[data-member-role]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          const id = sel.getAttribute('data-member-role');
          global.WMApi.organizations.updateMember(id, { orgRole: sel.value }).then(function () {
            state.message = 'Role updated.';
            WM.toast('Role updated.');
            global.WMApi.organizations.members(state.selectedId).then(function (rows) {
              state.members = Array.isArray(rows) ? rows : [];
              refresh();
            }, function () { refresh(); });
          }, function (err) { WM.toast((err && err.message) || 'Could not update the role.', 'error'); refresh(); });
        });
      });

      qsa('[data-perm]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = btn.getAttribute('data-perm');
          const key = btn.getAttribute('data-perm-key');
          const member = state.members.filter(function (m) { return String(m.id) === String(id); })[0];
          if (!member) return;
          const perms = Array.isArray(member.permissions) ? member.permissions.slice() : [];
          const i = perms.indexOf(key);
          if (i === -1) perms.push(key); else perms.splice(i, 1);
          global.WMApi.organizations.updateMember(id, { permissions: perms }).then(function () {
            member.permissions = perms;
            WM.toast('Permissions updated.');
            refresh();
          }, function (err) { WM.toast((err && err.message) || 'Could not update permissions.', 'error'); });
        });
      });

      qsa('[data-remove-member]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!global.confirm('Remove this member from the organization?')) return;
          b.disabled = true;
          global.WMApi.organizations.removeMember(b.getAttribute('data-remove-member')).then(function () {
            WM.toast('Member removed.');
            global.WMApi.organizations.members(state.selectedId).then(function (rows) {
              state.members = Array.isArray(rows) ? rows : [];
              refresh();
            }, function () { refresh(); });
          }, function (err) {
            b.disabled = false;
            /* 409: "An organization must keep at least one owner." */
            state.error = (err && err.message) || 'Could not remove the member.';
            refresh();
          });
        });
      });

      const attachEventSel = document.getElementById('attach-event');
      if (attachEventSel) attachEventSel.addEventListener('change', function () { state.attach.eventId = attachEventSel.value; });
      const attachOrgSel = document.getElementById('attach-org');
      if (attachOrgSel) attachOrgSel.addEventListener('change', function () { state.attach.orgId = attachOrgSel.value; });

      const attachBtn = qs('[data-attach-event]');
      if (attachBtn) attachBtn.addEventListener('click', function () {
        if (!state.attach.eventId || !state.attach.orgId) { WM.toast('Pick both an event and an organization.', 'error'); return; }
        attachBtn.disabled = true;
        global.WMApi.organizations.attachEvent(state.attach.eventId, { orgId: state.attach.orgId }).then(function () {
          state.message = 'Event attached to the organization.';
          WM.toast('Event attached.');
          if (String(state.selectedId) === String(state.attach.orgId)) { loadDetail(state.selectedId); } else { refresh(); }
        }, function (err) {
          attachBtn.disabled = false;
          state.error = (err && err.message) || 'Could not attach the event.';
          refresh();
        });
      });

      const detachBtn = qs('[data-detach-event]');
      if (detachBtn) detachBtn.addEventListener('click', function () {
        if (!state.attach.eventId) { WM.toast('Pick the event to detach first.', 'error'); return; }
        if (!global.confirm('Detach this event from its organization?')) return;
        detachBtn.disabled = true;
        global.WMApi.organizations.attachEvent(state.attach.eventId, { orgId: '' }).then(function () {
          state.message = 'Event detached.';
          WM.toast('Event detached.');
          if (state.selectedId) { loadDetail(state.selectedId); } else { refresh(); }
        }, function (err) {
          detachBtn.disabled = false;
          state.error = (err && err.message) || 'Could not detach the event.';
          refresh();
        });
      });

      qsa('[data-detach]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!global.confirm('Detach this event from the organization?')) return;
          b.disabled = true;
          global.WMApi.organizations.attachEvent(b.getAttribute('data-detach'), { orgId: '' }).then(function () {
            WM.toast('Event detached.');
            loadDetail(state.selectedId);
          }, function (err) {
            b.disabled = false;
            state.error = (err && err.message) || 'Could not detach the event.';
            refresh();
          });
        });
      });
    }

    function load() {
      return reloadOrgs().then(function () { return reloadEvents(); });
    }

    WM.page({ route: '/organizations', render: render, mounted: wire, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.organizations = organizationsPage;
})(window);
