/* WayMark core library — vanilla JS port of components/ui.tsx, Charts.tsx,
   FormFields.tsx, context/AuthContext.tsx and layout/AppLayout.tsx */
(function (global) {
  'use strict';

  const D = global.WMData;
  const WM = {};

  /* ------------------------------------------------------------------ *
   * Auth (ports AuthContext.tsx)                                        *
   * ------------------------------------------------------------------ */
  const AUTH = {
    STORAGE_KEY_USER: 'waymark_user',
    STORAGE_KEY_ROLE: 'waymark_role',

    roleKey(role) {
      const r = String(role || '').toLowerCase();
      if (r === 'host' || r === 'event host') return 'host';
      if (r === 'jury' || r === 'jury member') return 'jury';
      if (r === 'admin' || r === 'administrator') return 'admin';
      return 'participant';
    },

    isAuthenticated() {
      return !!(global.WMApi && global.WMApi.getToken());
    },

    getUser() {
      const saved = localStorage.getItem(this.STORAGE_KEY_USER);
      if (!saved) return null;
      try { return JSON.parse(saved); } catch (e) { return null; }
    },

    getRole() {
      return localStorage.getItem(this.STORAGE_KEY_ROLE) || 'participant';
    },

    setUser(user) {
      if (user) localStorage.setItem(this.STORAGE_KEY_USER, JSON.stringify(user));
      else localStorage.removeItem(this.STORAGE_KEY_USER);
    },

    setRole(role) {
      localStorage.setItem(this.STORAGE_KEY_ROLE, role);
      if (global.WMData) global.WMData.reset();
    },

    applyUser(user) {
      if (!user) return null;
      this.setUser(user);
      this.setRole(this.roleKey(user.role));
      return user;
    },

    fetchUser() {
      const self = this;
      return global.WMApi.auth.me().then(function (data) {
        const user = (data && (data.user || data.profile)) || data;
        return self.applyUser(user);
      });
    },

    login(email, password) {
      const self = this;
      return global.WMApi.auth.login(email, password).then(function (data) {
        const user = data && (data.user || data.profile);
        if (user) return self.applyUser(user);
        return self.fetchUser();
      });
    },

    signup(payload) {
      return global.WMApi.auth.signup(payload);
    },

    requireAuth() {
      if (global.WM_CONFIG && global.WM_CONFIG.REQUIRE_AUTH === false) return true;
      if (this.isAuthenticated()) return true;
      window.location.href = 'login.html';
      return false;
    },

    logout() {
      const self = this;
      const done = function () {
        self.setUser(null);
        localStorage.removeItem(self.STORAGE_KEY_ROLE);
        if (global.WMData) global.WMData.reset();
      };
      return global.WMApi.auth.logout().then(done, done);
    },

    clearLocal() {
      localStorage.removeItem(this.STORAGE_KEY_USER);
      localStorage.removeItem(this.STORAGE_KEY_ROLE);
    },
  };
  WM.Auth = AUTH;

  /* ------------------------------------------------------------------ *
   * Small helpers                                                       *
   * ------------------------------------------------------------------ */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function ic(name, size, extra) {
    return '<i data-lucide="' + name + '" width="' + (size || 24) + '" height="' + (size || 24) + '"'
      + (extra ? ' ' + extra : '') + '></i>';
  }

  function initials(name) {
    return (name || '').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  function refreshIcons() {
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  function downloadCSV(filename, text) {
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  WM.esc = esc;
  WM.ic = ic;
  WM.initials = initials;
  WM.refreshIcons = refreshIcons;
  WM.downloadCSV = downloadCSV;

  /* ------------------------------------------------------------------ *
   * UI components (ports components/ui.tsx)                             *
   * ------------------------------------------------------------------ */
  function badge(children, tone) {
    return '<span class="status-badge status-' + (tone || 'slate') + '">' + esc(children) + '</span>';
  }

  function button(children, opts) {
    opts = opts || {};
    const variant = opts.variant || 'primary';
    const cls = 'button button-' + variant + (opts.className ? ' ' + opts.className : '');
    const attrs = [];
    if (opts.attrs) attrs.push(opts.attrs);
    if (opts.disabled) attrs.push('disabled');
    return '<button class="' + cls + '"' + (attrs.length ? ' ' + attrs.join(' ') : '') + '>'
      + (opts.icon || '') + children + '</button>';
  }

  function statCard(o) {
    const dashboard = o.dashboard
      ? '<span class="stat-delta ' + (o.deltaUp ? 'delta-up' : 'delta-down') + '">'
        + ic(o.deltaUp ? 'trending-up' : 'trending-down', 11) + esc(o.delta) + ' vs last month</span>'
      : '';
    return '<div class="stat-card' + (o.dashboard ? ' dashboard-stat' : '') + '">'
      + '<div class="stat-icon stat-' + o.accent + '">' + ic(o.icon, 19, 'stroke-width="2"') + '</div>'
      + '<div class="stat-copy"><span>' + esc(o.label) + '</span><strong>' + esc(o.value) + '</strong>'
      + '<small>' + esc(o.detail) + '</small>' + dashboard + '</div>'
      + (o.dashboard ? '' : ic('chevron-right', 17, 'class="stat-arrow"'))
      + '</div>';
  }

  function sectionHeading(o) {
    return '<div class="section-heading"><div>'
      + (o.eyebrow ? '<div class="eyebrow">' + esc(o.eyebrow) + '</div>' : '')
      + '<h2>' + esc(o.title) + '</h2></div>' + (o.action || '') + '</div>';
  }

  function eventRow(event, attrs) {
    return '<button class="event-row"' + (attrs || '') + '>'
      + '<div class="event-thumb ' + event.color + '">' + esc(event.initials) + '</div>'
      + '<div class="event-row-main"><div class="event-row-title"><strong>' + esc(event.title) + '</strong>'
      + badge(event.status, event.tone) + '</div>'
      + '<span>' + esc(event.category) + ' · ' + esc(event.date) + ' · ' + esc(event.time) + '</span>'
      + '<small>' + esc(event.location) + ' · ' + esc(event.seats) + '</small></div>'
      + ic('chevron-right', 18, 'class="row-chevron"') + '</button>';
  }

  function emptyView(o) {
    return '<div class="empty-view"><div class="empty-icon">' + ic('file-text', 22) + '</div>'
      + '<h3>' + esc(o.title) + '</h3><p>' + esc(o.description) + '</p>' + (o.action || '') + '</div>';
  }

  WM.ui = { badge, button, statCard, sectionHeading, eventRow, emptyView };

  /* ------------------------------------------------------------------ *
   * Charts (ports components/Charts.tsx)                                *
   * ------------------------------------------------------------------ */
  function barChart(data, height) {
    height = height || 180;
    if (!data || !data.length) return '<p class="lede">No data yet.</p>';
    const max = Math.max.apply(null, data.map((d) => d.value || 0)) || 1;
    const bars = data.map((point) => {
      const pct = Math.round(((point.value || 0) / max) * 100);
      return '<div class="chart-bar-col"><div class="chart-bar-track">'
        + '<div class="chart-bar-fill" style="height:' + pct + '%"><span class="chart-bar-value">' + point.value + '</span></div>'
        + '</div><span class="chart-bar-label">' + esc(point.label) + '</span></div>';
    }).join('');
    return '<div class="chart-bar-wrap" style="height:' + height + 'px"><div class="chart-bars">' + bars + '</div></div>';
  }

  function lineChart(data, height) {
    height = height || 180;
    if (!data || !data.length) return '<p class="lede">No data yet.</p>';
    const values = data.map((d) => d.value || 0);
    const max = Math.max.apply(null, values);
    const min = Math.min.apply(null, values) * 0.6;
    const range = (max - min) || 1;
    const w = 520, h = height, padX = 30, padY = 20;
    const stepX = (w - padX * 2) / ((data.length - 1) || 1);
    const points = data.map((d, i) => {
      const x = padX + i * stepX;
      const y = padY + (1 - (d.value - min) / range) * (h - padY * 2);
      return { x: x, y: y, label: d.label, value: d.value };
    });
    const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
    const areaD = pathD + ' L ' + points[points.length - 1].x.toFixed(1) + ' ' + (h - padY)
      + ' L ' + points[0].x.toFixed(1) + ' ' + (h - padY) + ' Z';
    const circles = points.map((p) => '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="#fff" stroke="#2f7a5e" stroke-width="2" />').join('');
    const labels = data.map((d) => '<span>' + esc(d.label) + '</span>').join('');
    return '<div class="chart-line-wrap"><svg class="chart-line-svg" viewBox="0 0 ' + w + ' ' + h
      + '" preserveAspectRatio="none" style="width:100%;height:' + height + 'px">'
      + '<defs><linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="#3a8d72" stop-opacity="0.22" />'
      + '<stop offset="100%" stop-color="#3a8d72" stop-opacity="0" /></linearGradient></defs>'
      + '<path d="' + areaD + '" fill="url(#lineGradient)" />'
      + '<path d="' + pathD + '" fill="none" stroke="#2f7a5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />'
      + circles + '</svg><div class="chart-line-labels">' + labels + '</div></div>';
  }

  function donutChart(data, size) {
    size = size || 160;
    if (!data || !data.length) return '<p class="lede">No data yet.</p>';
    const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
    const safeTotal = total || 1;
    const radius = size / 2 - 14;
    const center = size / 2;
    let offset = 0;
    const circumference = 2 * Math.PI * radius;
    const segments = data.map((d) => {
      const portion = (d.value || 0) / safeTotal;
      const dash = portion * circumference;
      const seg = '<circle cx="' + center + '" cy="' + center + '" r="' + radius + '" fill="none" stroke="' + d.color
        + '" stroke-width="18" stroke-dasharray="' + dash + ' ' + (circumference - dash) + '" stroke-dashoffset="' + (-offset)
        + '" transform="rotate(-90 ' + center + ' ' + center + ')" />';
      offset += dash;
      return seg;
    }).join('');
    const legend = data.map((d) => '<div class="donut-legend-item"><span class="donut-dot" style="background:'
      + d.color + '"></span><span class="donut-legend-label">' + esc(d.label) + '</span><strong>' + d.value + '</strong></div>').join('');
    return '<div class="chart-donut-wrap"><svg class="chart-donut" width="' + size + '" height="' + size
      + '" viewBox="0 0 ' + size + ' ' + size + '">' + segments
      + '<text x="' + center + '" y="' + (center - 4) + '" text-anchor="middle" class="donut-total">' + total + '</text>'
      + '<text x="' + center + '" y="' + (center + 14) + '" text-anchor="middle" class="donut-label">Total</text></svg>'
      + '<div class="donut-legend">' + legend + '</div></div>';
  }

  WM.charts = { barChart, lineChart, donutChart };

  /* ------------------------------------------------------------------ *
   * Form fields (ports components/FormFields.tsx)                       *
   * ------------------------------------------------------------------ */
  function fieldLabel(label, required, hint, htmlFor) {
    return '<div class="form-field-label-row"><label' + (htmlFor ? ' for="' + htmlFor + '"' : '') + '>'
      + esc(label) + (required ? '<span class="form-req">*</span>' : '') + '</label>'
      + (hint ? '<span class="form-hint">' + esc(hint) + '</span>' : '') + '</div>';
  }

  function textField(o) {
    const type = o.type || 'text';
    return '<div class="form-field-group">'
      + fieldLabel(o.label, o.required, o.hint, o.id)
      + '<div class="form-input-wrap' + (o.error ? ' form-input-error' : '') + (o.disabled ? ' form-input-disabled' : '') + '">'
      + (o.icon || '')
      + '<input id="' + o.id + '" type="' + type + '" value="' + esc(o.value) + '"'
      + (o.disabled ? ' disabled' : '') + ' placeholder="' + esc(o.placeholder || '') + '" data-field="' + o.id + '" />'
      + '</div>' + (o.error ? '<span class="field-error">' + esc(o.error) + '</span>' : '') + '</div>';
  }

  function textArea(o) {
    const rows = o.rows || 4;
    return '<div class="form-field-group">'
      + fieldLabel(o.label, o.required, o.hint, o.id)
      + '<textarea id="' + o.id + '" rows="' + rows + '"' + (o.maxLength ? ' maxlength="' + o.maxLength + '"' : '')
      + ' placeholder="' + esc(o.placeholder || '') + '" class="form-textarea' + (o.error ? ' form-textarea-error' : '') + '" data-field="' + o.id + '">'
      + esc(o.value) + '</textarea>'
      + (o.maxLength ? '<span class="form-char-count">' + (o.value || '').length + '/' + o.maxLength + '</span>' : '')
      + (o.error ? '<span class="field-error">' + esc(o.error) + '</span>' : '') + '</div>';
  }

  function selectInput(o) {
    const opts = o.options.map((opt) => '<option value="' + esc(opt) + '"'
      + (opt === o.value ? ' selected' : '') + '>' + esc(opt) + '</option>').join('');
    return '<div class="form-field-group">'
      + fieldLabel(o.label, o.required, o.hint, o.id)
      + '<div class="form-input-wrap form-select-wrap' + (o.error ? ' form-input-error' : '') + (o.disabled ? ' form-input-disabled' : '') + '">'
      + (o.icon || '') + '<select id="' + o.id + '"' + (o.disabled ? ' disabled' : '') + ' data-field="' + o.id + '">' + opts + '</select>'
      + ic('chevron-down', 16, 'class="form-select-chevron"') + '</div>'
      + (o.error ? '<span class="field-error">' + esc(o.error) + '</span>' : '') + '</div>';
  }

  function toggleField(o) {
    return '<div class="form-toggle-row"><button type="button" id="' + o.id + '" class="form-toggle'
      + (o.checked ? ' form-toggle-on' : '') + '" data-toggle="' + o.id + '" aria-pressed="' + !!o.checked
      + '" aria-label="' + esc(o.label) + '"><span class="form-toggle-knob"></span></button>'
      + '<div><strong>' + esc(o.label) + '</strong>' + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</div></div>';
  }

  function radioGroup(o) {
    const cols = o.columns || 1;
    const opts = o.options.map((opt) => '<button type="button" class="form-radio-card'
      + (o.value === opt.value ? ' form-radio-selected' : '') + '" data-radio="' + o.id + '" data-value="' + esc(opt.value) + '">'
      + '<span class="form-radio-dot' + (o.value === opt.value ? ' form-radio-dot-on' : '') + '"></span>'
      + '<div><strong>' + esc(opt.label) + '</strong>' + (opt.detail ? '<small>' + esc(opt.detail) + '</small>' : '') + '</div></button>').join('');
    return '<div class="form-field-group">' + fieldLabel(o.label, o.required)
      + '<div class="form-radio-grid form-radio-cols-' + cols + '">' + opts + '</div>'
      + (o.error ? '<span class="field-error">' + esc(o.error) + '</span>' : '') + '</div>';
  }

  function checkboxField(o) {
    return '<div class="form-checkbox-row"><button type="button" id="' + o.id + '" class="form-checkbox'
      + (o.checked ? ' form-checkbox-on' : '') + '" data-check="' + o.id + '" aria-pressed="' + !!o.checked + '">'
      + (o.checked ? ic('check', 13, 'stroke-width="3"') : '') + '</button>'
      + '<div><span>' + esc(o.label) + '</span>' + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</div></div>';
  }

  function scoreInput(o) {
    const max = o.max || 10;
    let stars = '';
    for (let i = 0; i < max; i++) {
      stars += '<button type="button" class="form-score-btn' + (i < o.value ? ' form-score-active' : '')
        + '" data-score="' + o.id + '" data-index="' + (i + 1) + '" aria-label="' + (i + 1) + ' out of ' + max + '">'
        + '<span class="form-score-pip"></span></button>';
    }
    return '<div class="form-score-row">' + (o.label ? '<span class="form-score-label">' + esc(o.label) + '</span>' : '')
      + '<div class="form-score-stars">' + stars + '</div>'
      + '<span class="form-score-value">' + o.value + '/' + max + '</span></div>';
  }

  function formStatus(status, message) {
    if (status === 'idle' || !message) return '';
    const cls = status === 'success' ? 'form-info' : 'form-error';
    const icon = status === 'success' ? ic('check', 14) : ic('alert-circle', 14);
    return '<div class="' + cls + '">' + icon + ' ' + esc(message) + '</div>';
  }

  function formActions(o) {
    o = o || {};
    const loading = o.loading;
    const showCancel = o.showCancel !== false;
    const showSave = o.showSave !== false;
    const showSubmit = o.showSubmit !== false;
    return '<div class="form-actions-bar">'
      + (showCancel ? '<button type="button" class="button button-secondary" data-action="cancel">Cancel</button>' : '')
      + '<div class="form-actions-right">'
      + (showSave ? '<button type="button" class="button button-secondary" data-action="save"' + (loading ? ' disabled' : '') + '>'
        + (loading ? ic('loader-2', 15, 'class="form-spin"') : '') + ' ' + esc(o.saveLabel || 'Save draft') + '</button>' : '')
      + (showSubmit ? '<button type="button" class="button button-primary" data-action="submit"' + (loading ? ' disabled' : '') + '>'
        + (loading ? ic('loader-2', 15, 'class="form-spin-light"') : '') + ' ' + esc(o.submitLabel || 'Submit') + '</button>' : '')
      + '</div></div>';
  }

  function formSection(o) {
    return '<div class="form-section"><div class="form-section-head">'
      + (o.eyebrow ? '<span class="eyebrow">' + esc(o.eyebrow) + '</span>' : '')
      + '<h3>' + esc(o.title) + '</h3></div><div class="form-section-body">' + o.children + '</div></div>';
  }

  function formPreviewCard(o) {
    return '<div class="form-preview-card"><div class="form-preview-head"><span class="eyebrow">Preview</span>'
      + '<h3>' + esc(o.title) + '</h3></div><div class="form-preview-body">' + o.children + '</div></div>';
  }

  WM.forms = {
    fieldLabel, textField, textArea, selectInput, toggleField, radioGroup,
    checkboxField, scoreInput, formStatus, formActions, formSection, formPreviewCard,
  };

  /* ------------------------------------------------------------------ *
   * Layout (ports layout/AppLayout.tsx)                                 *
   * ------------------------------------------------------------------ */
  const rolesConfig = {
    participant: { label: 'Personal workspace', avatar: 'MC', color: 'avatar-cream' },
    host: { label: 'Host workspace', avatar: 'MC', color: 'avatar-terracotta' },
    jury: { label: 'Jury workspace', avatar: 'SL', color: 'avatar-blue' },
    admin: { label: 'Admin workspace', avatar: 'JL', color: 'avatar-green' },
  };

  const menuGroups = [
    {
      label: 'Workspace', items: [
        { label: 'Overview', icon: 'layout-dashboard', path: '/', href: 'index.html', roles: ['participant', 'host', 'jury', 'admin'] },
        { label: 'Discover events', icon: 'calendar-days', path: '/discover', href: 'discover.html', roles: ['participant', 'host', 'admin'] },
        { label: 'My registrations', icon: 'ticket-check', path: '/registrations', href: 'registrations.html', roles: ['participant'] },
        { label: 'My events', icon: 'clipboard-list', path: '/events', href: 'events.html', roles: ['host', 'admin'] },
      ],
    },
    {
      label: 'Workflows & Forms', items: [
        { label: 'All forms & workflows', icon: 'layout-dashboard', path: '/forms', href: 'forms.html', roles: ['participant', 'host', 'jury', 'admin'] },
        { label: 'Create event', icon: 'plus', path: '/forms/host-event', href: 'forms-host-event.html', roles: ['host', 'admin'] },
        { label: 'Jury evaluation', icon: 'scale', path: '/forms/scoring', href: 'forms-scoring.html', roles: ['jury', 'host', 'admin'] },
        { label: 'Attendance check-in', icon: 'clipboard-list', path: '/forms/attendance', href: 'forms-attendance.html', roles: ['host', 'admin'] },
      ],
    },
    {
      label: 'Account', items: [
        { label: 'Notifications', icon: 'bell', count: 3, path: '/notifications', href: 'notifications.html', roles: ['participant', 'host', 'jury', 'admin'] },
        { label: 'Profile', icon: 'user-round', path: '/profile', href: 'profile.html', roles: ['participant', 'host', 'jury', 'admin'] },
      ],
    },
    {
      label: 'Administration', items: [
        { label: 'Approval queue', icon: 'shield-check', count: 8, path: '/approvals', href: 'approvals.html', roles: ['admin'] },
        { label: 'Users', icon: 'users', path: '/users', href: 'users.html', roles: ['admin'] },
        { label: 'Activity & audit', icon: 'activity', path: '/audit', href: 'audit.html', roles: ['admin', 'host'] },
      ],
    },
  ];

  function renderLayout(route, contentHTML) {
    const user = AUTH.getUser();
    const currentRole = AUTH.getRole();
    const roleInfo = rolesConfig[currentRole] || rolesConfig.participant;
    const userInitials = user && user.name ? initials(user.name) : 'MC';

    const allItems = menuGroups.reduce((acc, g) => acc.concat(g.items), []);
    const activeItem = allItems.find((item) => item.path === route);

    const groups = menuGroups
      .map((g) => ({ label: g.label, items: g.items.filter((i) => i.roles.indexOf(currentRole) !== -1) }))
      .filter((g) => g.items.length > 0);

    const nav = groups.map((g) => {
      const items = g.items.map((it) => {
        const active = it.path === route;
        return '<a class="nav-item' + (active ? ' nav-active' : '') + '" href="' + it.href + '">'
          + ic(it.icon, 18, 'stroke-width="' + (active ? '2.4' : '1.8') + '"')
          + '<span>' + esc(it.label) + '</span>' + (it.count ? '<em>' + it.count + '</em>' : '') + '</a>';
      }).join('');
      return '<div class="nav-group"><span class="nav-label">' + esc(g.label) + '</span>' + items + '</div>';
    }).join('');

    const roleOptions = [
      ['participant', 'user-round', 'Personal Workspace'],
      ['host', 'clipboard-list', 'Host Workspace'],
      ['jury', 'scale', 'Jury Workspace'],
      ['admin', 'shield-check', 'Admin Workspace'],
    ].map((r) => '<button class="role-option' + (currentRole === r[0] ? ' active-role' : '')
      + '" data-switch-role="' + r[0] + '">' + ic(r[1], 15) + ' ' + r[2] + '</button>').join('');

    return ''
      + '<div class="app-shell">'
      + '<aside class="sidebar" id="sidebar">'
      + '<div class="brand"><div class="brand-mark"><span></span><span></span><span></span></div><span>waymark</span></div>'
      + '<div class="workspace-switcher-wrap">'
      + '<button class="workspace-switcher" id="role-switcher">'
      + '<div class="avatar ' + roleInfo.color + '">' + esc(userInitials) + '</div>'
      + '<div><strong>' + esc(user && user.name ? user.name : 'Maya Chen') + '</strong><span>' + esc(roleInfo.label) + '</span></div>'
      + ic('chevron-down', 16) + '</button>'
      + '<div class="role-dropdown-menu" id="role-dropdown" hidden>'
      + '<div class="dropdown-label">Switch Workspace Role</div>' + roleOptions + '</div>'
      + '</div>'
      + '<nav class="side-nav">' + nav + '</nav>'
      + '<div class="sidebar-bottom">'
      + '<div class="upgrade-card"><div class="upgrade-symbol">' + ic('sparkles', 16) + '</div>'
      + '<strong>Make your mark</strong><span>Host events that bring people together.</span>'
      + '<button id="create-event-btn">Create an event ' + ic('chevron-right', 14) + '</button></div>'
      + '<button class="nav-item" data-goto="forms-profile.html">' + ic('settings-2', 18) + '<span>Settings</span></button>'
      + '<button class="nav-item" id="signout-btn">' + ic('log-out', 18) + '<span>Sign out</span></button>'
      + '</div></aside>'
      + '<button class="mobile-scrim" id="mobile-scrim" aria-label="Close navigation" hidden></button>'
      + '<main class="main-shell"><header class="topbar">'
      + '<div class="topbar-left"><button class="mobile-menu" id="mobile-menu" aria-label="Open navigation">' + ic('menu', 21) + '</button>'
      + '<div class="breadcrumb"><span>' + esc(roleInfo.label) + '</span>' + ic('chevron-right', 14)
      + '<strong>' + esc(activeItem ? activeItem.label : 'Overview') + '</strong></div></div>'
      + '<div class="topbar-actions">'
      + '<a class="icon-button notification-button" href="notifications.html" aria-label="Open notifications">' + ic('bell', 19) + '<span></span></a>'
      + '<div class="topbar-user" data-goto="forms-profile.html"><div class="avatar ' + roleInfo.color + '">' + esc(roleInfo.avatar)
      + '</div>' + ic('chevron-down', 15) + '</div>'
      + '</div></header>'
      + '<div class="page-container" id="page-content">' + contentHTML + '</div>'
      + '</main></div>';
  }

  function createEventModalHTML() {
    const eventTypes = (D.eventTypes && D.eventTypes.length)
      ? D.eventTypes
      : (D.eventCategories || []).filter(function (c) { return c !== 'All categories'; })
        .map(function (c) { return [c, 'Start from a template', 'type-slate']; });
    const types = eventTypes.map((t, index) => {
      const icons = ['zap', 'users', 'calendar-days', 'sparkles'];
      return '<button data-create-type="' + esc(t[0]) + '"><span class="type-icon ' + t[2] + '">'
        + ic(icons[index], 18) + '</span><strong>' + esc(t[0]) + '</strong><small>' + esc(t[1]) + '</small></button>';
    }).join('');
    return '<div class="modal-backdrop" id="create-modal" role="presentation">'
      + '<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-event-title">'
      + '<button class="modal-close" data-close-modal aria-label="Close">' + ic('x', 19) + '</button>'
      + '<div class="modal-icon">' + ic('plus', 21) + '</div>'
      + '<div class="eyebrow">Start something new</div><h2 id="create-event-title">Create an event</h2>'
      + '<p>Choose a format to begin. You can save a draft and return to it anytime.</p>'
      + '<div class="event-type-grid">' + types + '</div>'
      + '<div class="modal-actions">' + button('Cancel', { variant: 'secondary', attrs: 'data-close-modal' })
      + button('Continue ' + ic('chevron-right', 16), { attrs: 'data-create-continue' }) + '</div>'
      + '</section></div>';
  }

  function openModal(html) {
    let root = document.getElementById('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    root.innerHTML = html;
    refreshIcons();
  }

  function closeModal() {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }
  WM.openModal = openModal;
  WM.closeModal = closeModal;

  function bindLayout() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('mobile-scrim');
    const menu = document.getElementById('mobile-menu');
    if (menu) menu.addEventListener('click', function () {
      sidebar.classList.add('sidebar-open');
      scrim.hidden = false;
    });
    if (scrim) scrim.addEventListener('click', function () {
      sidebar.classList.remove('sidebar-open');
      scrim.hidden = true;
    });

    const switcher = document.getElementById('role-switcher');
    const dropdown = document.getElementById('role-dropdown');
    if (switcher && dropdown) {
      switcher.addEventListener('click', function () { dropdown.hidden = !dropdown.hidden; });
      dropdown.querySelectorAll('[data-switch-role]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          AUTH.setRole(btn.getAttribute('data-switch-role'));
          WM.reload();
        });
      });
    }

    document.querySelectorAll('[data-goto]').forEach(function (el) {
      el.addEventListener('click', function () { window.location.href = el.getAttribute('data-goto'); });
    });

    const signout = document.getElementById('signout-btn');
    if (signout) signout.addEventListener('click', function () {
      const done = function () { window.location.href = 'login.html'; };
      AUTH.logout().then(done, done);
    });

    const createBtn = document.getElementById('create-event-btn');
    if (createBtn) createBtn.addEventListener('click', function () { openModal(createEventModalHTML()); });
  }

  // Global delegation: modal close/continue/select + create-event type selection.
  document.addEventListener('click', function (e) {
    const closeEl = e.target.closest('[data-close-modal]');
    if (closeEl) { closeModal(); return; }
    const continueEl = e.target.closest('[data-create-continue]');
    if (continueEl) { closeModal(); window.location.href = 'forms-host-event.html'; return; }
    const typeEl = e.target.closest('[data-create-type]');
    if (typeEl) { closeModal(); window.location.href = 'forms-host-event.html'; return; }
    const retryEl = e.target.closest('[data-retry-page]');
    if (retryEl) { WM.reload(); return; }
  });

  WM.layout = renderLayout;
  WM.bindLayout = bindLayout;
  WM.rolesConfig = rolesConfig;
  WM.menuGroups = menuGroups;

  /* ------------------------------------------------------------------ *
   * Page mount                                                          *
   * ------------------------------------------------------------------ */
  let currentPage = null;
  const CONFIG = global.WM_CONFIG || {};

  WM.reload = function () { if (currentPage) WM.page(currentPage); };

  WM.page = function (config) {
    currentPage = config;
    const root = document.getElementById('app');
    const usesLayout = config.requiresLayout !== false;

    if (usesLayout && CONFIG.REQUIRE_AUTH !== false && !AUTH.isAuthenticated()) {
      window.location.href = 'login.html';
      return;
    }

    function paint() {
      const content = config.render();
      if (usesLayout) {
        root.innerHTML = renderLayout(config.route, content);
        bindLayout();
      } else {
        root.innerHTML = content;
      }
      refreshIcons();
      if (config.mounted) {
        config.mounted({
          content: document.getElementById('page-content') || root,
          refresh: function () { WM.page(config); },
        });
      }
    }

    if (typeof config.load === 'function') {
      const loading = '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:72px 16px;color:#6b7c76">'
        + '<span class="loading-spinner"></span><span>Loading\u2026</span></div>';
      if (usesLayout) {
        root.innerHTML = renderLayout(config.route, loading);
        bindLayout();
      } else {
        root.innerHTML = loading;
      }
      refreshIcons();
      config.load().then(paint, function (err) {
        const message = (err && err.message) ? err.message : 'This page could not be loaded.';
        const errorHTML = '<div class="empty-view"><div class="empty-icon">' + ic('alert-circle', 22) + '</div>'
          + '<h3>Something went wrong</h3><p>' + esc(message) + '</p>'
          + '<button class="button button-primary" data-retry-page>Try again</button></div>';
        if (usesLayout) {
          root.innerHTML = renderLayout(config.route, errorHTML);
          bindLayout();
        } else {
          root.innerHTML = errorHTML;
        }
        refreshIcons();
      });
      return;
    }

    paint();
  };

  // Re-render only the page content (keeps layout + focus). Used by forms.
  WM.refreshContent = function (renderFn, focusId, selectionStart) {
    const el = document.getElementById('page-content');
    if (!el) return;
    el.innerHTML = renderFn();
    refreshIcons();
    if (focusId) {
      const input = document.getElementById(focusId);
      if (input) {
        input.focus();
        if (selectionStart != null && input.setSelectionRange) {
          try { input.setSelectionRange(selectionStart, selectionStart); } catch (e) { /* noop */ }
        }
      }
    }
  };

  global.WM = WM;
})(window);
