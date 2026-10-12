/* Platform settings page — admin defaults */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui, F = WM.forms;

  const DEFAULTS = {
    platformName: 'WayMark',
    supportEmail: 'support@waymark.example',
    timezone: 'UTC',
    defaultCapacity: 100,
    registrationWindowDays: 14,
    waitlistEnabled: true,
    defaultRubricName: '',
    certificateIssuer: 'WayMark Platform',
    autoIssueCertificates: false,
    aiEnabled: false,
    monthlyTokenBudget: 200000,
  };
  const TIMEZONES = ['UTC', 'Europe/London', 'Africa/Kampala', 'America/New_York', 'Asia/Singapore'];
  const FIELD_MAP = {
    'set-platform-name': { key: 'platformName' },
    'set-support-email': { key: 'supportEmail' },
    'set-rubric-name': { key: 'defaultRubricName' },
    'set-cert-issuer': { key: 'certificateIssuer' },
    'set-capacity': { key: 'defaultCapacity' },
    'set-window': { key: 'registrationWindowDays' },
    'set-token-budget': { key: 'monthlyTokenBudget' },
    'set-timezone': { key: 'timezone' },
  };
  const TOGGLE_MAP = {
    'set-waitlist': 'waitlistEnabled',
    'set-auto-cert': 'autoIssueCertificates',
    'set-ai': 'aiEnabled',
  };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function settingValue(data, key) {
    if (!data || typeof data !== 'object') return undefined;
    if (data[key] !== undefined) return data[key];
    const snake = key.replace(/[A-Z]/g, function (m) { return '_' + m.toLowerCase(); });
    if (data[snake] !== undefined) return data[snake];
    return undefined;
  }

  function settingsPage() {
    const state = { settings: clone(DEFAULTS) };

    function load() { return D.ready(); }

    function mounted() {
      wire();
      global.WMApi.admin.settings().then(function (data) {
        const next = {};
        Object.keys(DEFAULTS).forEach(function (k) {
          const v = settingValue(data, k);
          next[k] = v === undefined ? DEFAULTS[k] : v;
        });
        state.settings = next;
        refresh();
      }, function () { /* keep defaults */ });
    }

    function render() {
      const s = state.settings;
      const dark = WM.theme.get() === 'dark';
      return '<div class="page-stack">'
        + ui.sectionHeading({ eyebrow: 'Admin workspace', title: 'Platform settings' })
        + '<p class="lede">Defaults that shape every new event on WayMark.</p>'
        + F.formSection({ title: 'Platform identity', eyebrow: 'General', children:
            F.textField({ id: 'set-platform-name', label: 'Platform name', value: s.platformName })
            + F.textField({ id: 'set-support-email', label: 'Support email', value: s.supportEmail, type: 'email' })
            + F.selectInput({ id: 'set-timezone', label: 'Default timezone', value: s.timezone, options: TIMEZONES }) })
        + F.formSection({ title: 'Registration defaults', eyebrow: 'Registration', children:
            '<div class="form-grid-2">'
            + F.textField({ id: 'set-capacity', label: 'Default capacity', value: String(s.defaultCapacity), type: 'number' })
            + F.textField({ id: 'set-window', label: 'Registration window (days)', value: String(s.registrationWindowDays), type: 'number' })
            + '</div>'
            + F.toggleField({ id: 'set-waitlist', label: 'Waitlist enabled', checked: !!s.waitlistEnabled, hint: 'Allow waitlisting when capacity is full.' }) })
        + F.formSection({ title: 'Evaluation & certificates', eyebrow: 'Certificates', children:
            F.textField({ id: 'set-rubric-name', label: 'Default rubric name', value: s.defaultRubricName })
            + F.textField({ id: 'set-cert-issuer', label: 'Certificates issuer name', value: s.certificateIssuer })
            + F.toggleField({ id: 'set-auto-cert', label: 'Auto-issue certificates', checked: !!s.autoIssueCertificates, hint: 'Issue certificates automatically when results are released.' }) })
        + F.formSection({ title: 'AI', eyebrow: 'Intelligence', children:
            F.toggleField({ id: 'set-ai', label: 'AI features enabled', checked: !!s.aiEnabled, hint: 'Enable AI drafting and feedback summaries.' })
            + F.textField({ id: 'set-token-budget', label: 'Monthly token budget', value: String(s.monthlyTokenBudget), type: 'number' }) })
        + F.formSection({ title: 'Appearance', eyebrow: 'Theme', children:
            '<div class="form-toggle-row"><button type="button" class="button button-secondary" data-theme-toggle-btn>Dark mode: ' + (dark ? 'On' : 'Off') + '</button>'
            + '<div><strong>Dark mode</strong><small>Switch between the light and dark interface.</small></div></div>' })
        + '<div class="form-actions-bar"><div class="form-actions-right">'
        + '<button type="button" class="button button-secondary" data-reset-settings>' + ic('rotate-ccw', 15) + 'Reset to defaults</button>'
        + '<button type="button" class="button button-primary" data-save-settings>' + ic('save', 15) + 'Save changes</button>'
        + '</div></div>'
        + '<p class="lede">Settings persist via PATCH /admin/settings.</p>'
        + '</div>';
    }

    function refresh() { WM.refreshContent(render); wire(); }

    function collect() {
      const s = state.settings;
      return {
        platformName: s.platformName,
        supportEmail: s.supportEmail,
        timezone: s.timezone,
        defaultCapacity: Number(s.defaultCapacity) || 0,
        registrationWindowDays: Number(s.registrationWindowDays) || 0,
        waitlistEnabled: !!s.waitlistEnabled,
        defaultRubricName: s.defaultRubricName,
        certificateIssuer: s.certificateIssuer,
        autoIssueCertificates: !!s.autoIssueCertificates,
        aiEnabled: !!s.aiEnabled,
        monthlyTokenBudget: Number(s.monthlyTokenBudget) || 0,
      };
    }

    function wire() {
      Object.keys(FIELD_MAP).forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        const key = FIELD_MAP[id].key;
        el.addEventListener('input', function () { state.settings[key] = el.value; });
        el.addEventListener('change', function () { state.settings[key] = el.value; });
      });

      document.querySelectorAll('[data-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const key = TOGGLE_MAP[btn.getAttribute('data-toggle')];
          if (!key) return;
          state.settings[key] = !state.settings[key];
          refresh();
        });
      });

      const themeBtn = document.querySelector('[data-theme-toggle-btn]');
      if (themeBtn) themeBtn.addEventListener('click', function () { WM.theme.toggle(); refresh(); });

      const saveBtn = document.querySelector('[data-save-settings]');
      if (saveBtn) saveBtn.addEventListener('click', function () {
        global.WMApi.admin.updateSettings(collect()).then(function () {
          WM.toast('Settings saved.');
        }, function (err) {
          WM.toast((err && err.message) || 'Something went wrong.', 'error');
        });
      });

      const resetBtn = document.querySelector('[data-reset-settings]');
      if (resetBtn) resetBtn.addEventListener('click', function () {
        state.settings = clone(DEFAULTS);
        refresh();
      });
    }

    WM.page({ route: '/settings', render: render, mounted: mounted, load: load });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.settings = settingsPage;
})(window);
