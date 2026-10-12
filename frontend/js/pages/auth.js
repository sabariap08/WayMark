/* Auth pages — ports pages/AuthPages.tsx and the SignupForm from ProfileForms.tsx */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  function brand() {
    return '<a class="auth-brand" href="index.html"><span class="brand-mark"><i></i><i></i><i></i></span><span>waymark</span></a>';
  }

  function shell(children) {
    return '<main class="auth-page">'
      + '<div class="auth-visual">'
      + '<div class="auth-visual-top">' + brand()
      + '<span class="auth-pill">' + ic('shield-check', 13) + ' Built for meaningful participation</span></div>'
      + '<div class="auth-quote"><div class="quote-mark">\u201C</div>'
      + '<h1>Every event is a chance to leave a mark.</h1>'
      + '<p>WayMark carries one participant record through discovery, registration, attendance, evaluation, and beyond.</p>'
      + '<div class="quote-footer"><span class="quote-line"></span><span>One journey. Many possibilities.</span></div></div>'
      + '<div class="auth-orbit orbit-one"></div><div class="auth-orbit orbit-two"></div>'
      + '<div class="auth-visual-footer"><span>WAYMARK PLATFORM</span><span>Events with intention</span></div>'
      + '</div>'
      + '<section class="auth-form-side"><div class="auth-form-wrap">' + children
      + '<p class="auth-legal">By continuing, you agree to WayMark\u2019s terms and privacy policy.</p></div></section>'
      + '</main>';
  }

  function mountShell(children, mounted) {
    const root = document.getElementById('app');
    root.innerHTML = shell(children);
    WM.refreshIcons();
    if (mounted) mounted(root);
  }

  /* ===================== Login ===================== */
  function login() {
    const state = { email: '', password: '', showPassword: false, errors: {}, loading: false, success: false, resetMessage: '' };

    function body() {
      const heading = '<div class="auth-heading"><div class="auth-mobile-brand">' + brand() + '</div>'
        + '<div class="eyebrow">Welcome back</div><h2>Sign in to WayMark</h2>'
        + '<p>Continue your event journey from wherever you left off.</p></div>';

      if (state.success) {
        return heading + '<div class="auth-success"><div class="success-icon">' + ic('shield-check', 24) + '</div>'
          + '<h3>You\u2019re ready to go.</h3>'
          + '<p>This demo sign-in is complete. Continue to your workspace to explore WayMark.</p>'
          + '<a class="button button-primary" href="index.html">Continue to workspace ' + ic('arrow-right', 16) + '</a></div>';
      }

      return heading + '<form class="auth-form" id="login-form" novalidate>'
        + '<div class="field-group"><label for="email">Email address</label>'
        + '<div class="auth-input' + (state.errors.email ? ' input-error' : '') + '">' + ic('mail', 17)
        + '<input id="email" type="email" placeholder="you@example.com" autocomplete="email" value="' + esc(state.email) + '" /> </div>'
        + (state.errors.email ? '<span class="field-error">' + esc(state.errors.email) + '</span>' : '') + '</div>'
        + '<div class="field-group"><div class="field-label-row"><label for="password">Password</label>'
        + '<a href="password-reset.html">Forgot password?</a></div>'
        + '<div class="auth-input' + (state.errors.password ? ' input-error' : '') + '">' + ic('lock-keyhole', 17)
        + '<input id="password" type="' + (state.showPassword ? 'text' : 'password') + '" placeholder="Enter your password" autocomplete="current-password" value="' + esc(state.password) + '" />'
        + '<button type="button" class="password-toggle" id="pw-toggle" aria-label="' + (state.showPassword ? 'Hide password' : 'Show password') + '">'
        + (state.showPassword ? ic('eye-off', 17) : ic('eye', 17)) + '</button></div>'
        + (state.errors.password ? '<span class="field-error">' + esc(state.errors.password) + '</span>' : '') + '</div>'
        + (state.errors.form ? '<div class="form-error">' + esc(state.errors.form) + '</div>' : '')
        + (state.resetMessage ? '<div class="form-info">' + esc(state.resetMessage) + '</div>' : '')
        + '<button class="button button-primary auth-submit" type="submit">'
        + (state.loading ? '<span class="loading-spinner"></span> Signing in...' : 'Sign in ' + ic('arrow-right', 16)) + '</button>'
        + '<div class="auth-divider"><span>or</span></div>'
        + '<button type="button" class="demo-button" id="demo-btn">Use demo account <span>maya@waymark.events</span></button>'
        + '</form>'
        + '<div class="auth-switch">New to WayMark? <a href="signup.html">Create an account ' + ic('arrow-right', 14) + '</a></div>'
        + (state.resetMessage === '' ? '<button class="auth-help" id="help-btn">Need help signing in?</button>' : '');
    }

    function validate() {
      const e = {};
      if (!state.email.trim()) e.email = 'Enter the email address you use for WayMark.';
      else if (!/^\S+@\S+\.\S+$/.test(state.email)) e.email = 'Enter a valid email address.';
      if (!state.password) e.password = 'Enter your password.';
      else if (state.password.length < 8) e.password = 'Your password must be at least 8 characters.';
      return e;
    }

    function draw() { mountShell(body(), bind); }

    function bind(root) {
      const email = root.querySelector('#email');
      const password = root.querySelector('#password');
      if (email) email.addEventListener('input', function () { state.email = email.value; state.errors.email = undefined; state.errors.form = undefined; });
      if (password) password.addEventListener('input', function () { state.password = password.value; state.errors.password = undefined; state.errors.form = undefined; });
      const pwToggle = root.querySelector('#pw-toggle');
      if (pwToggle) pwToggle.addEventListener('click', function () { state.showPassword = !state.showPassword; draw(); });
      const demo = root.querySelector('#demo-btn');
      if (demo) demo.addEventListener('click', function () { state.email = 'maya@waymark.events'; state.password = 'waymark-demo'; state.errors = {}; draw(); });
      const help = root.querySelector('#help-btn');
      if (help) help.addEventListener('click', function () {
        state.resetMessage = 'Password reset is ready for the next authentication step. You can continue exploring the frontend for now.';
        draw();
      });
      const form = root.querySelector('#login-form');
      if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        state.resetMessage = '';
        const next = validate();
        state.errors = next;
        if (Object.keys(next).length) { draw(); return; }
        state.loading = true; draw();
        window.setTimeout(function () { state.loading = false; state.success = true; draw(); }, 850);
      });
    }

    draw();
  }

  /* ===================== Signup (form) ===================== */
  function signupForm() {
    const state = {
      fullName: '', email: '', password: '', showPassword: false, role: '', agree: false,
      errors: {}, status: 'idle', statusMsg: '', loading: false, success: false,
    };

    function body() {
      if (state.success) {
        return '<div class="auth-success"><div class="success-icon">' + ic('check', 24) + '</div>'
          + '<h3>Welcome to WayMark.</h3><p>' + esc(state.statusMsg) + '</p>'
          + '<a class="button button-primary" href="login.html">Continue to sign in ' + ic('arrow-right', 16) + '</a></div>';
      }
      const roleOptions = [
        ['participant', 'Participant', 'Discover and join events'],
        ['host', 'Event host', 'Create and manage events'],
        ['jury', 'Jury member', 'Evaluate event submissions'],
        ['admin', 'Administrator', 'Approve and oversee events'],
      ].map(function (r) {
        const sel = state.role === r[0];
        return '<button type="button" class="form-radio-card' + (sel ? ' form-radio-selected' : '') + '" data-radio="su-role" data-value="' + r[0] + '">'
          + '<span class="form-radio-dot' + (sel ? ' form-radio-dot-on' : '') + '"></span>'
          + '<div><strong>' + r[1] + '</strong><small>' + r[2] + '</small></div></button>';
      }).join('');

      return '<form class="auth-form" id="signup-form" novalidate>'
        + WM.forms.textField({ id: 'su-name', label: 'Full name', value: state.fullName, placeholder: 'Maya Chen', required: true, error: state.errors.fullName, icon: ic('user', 16) })
        + WM.forms.textField({ id: 'su-email', label: 'Email address', value: state.email, placeholder: 'you@example.com', required: true, type: 'email', error: state.errors.email, icon: ic('mail', 16) })
        + '<div class="form-field-group"><div class="form-field-label-row"><label for="su-pw">Password<span class="form-req">*</span></label></div>'
        + '<div class="form-input-wrap' + (state.errors.password ? ' form-input-error' : '') + '">' + ic('lock-keyhole', 16)
        + '<input id="su-pw" type="' + (state.showPassword ? 'text' : 'password') + '" placeholder="Minimum 8 characters" value="' + esc(state.password) + '" data-field="su-pw" />'
        + '<button type="button" class="password-toggle" id="su-pw-toggle">' + (state.showPassword ? ic('eye-off', 16) : ic('eye', 16)) + '</button></div>'
        + (state.errors.password ? '<span class="field-error">' + esc(state.errors.password) + '</span>' : '') + '</div>'
        + '<div class="form-field-group">' + WM.forms.fieldLabel('How will you use WayMark?', true)
        + '<div class="form-radio-grid form-radio-cols-2">' + roleOptions + '</div>'
        + (state.errors.role ? '<span class="field-error">' + esc(state.errors.role) + '</span>' : '') + '</div>'
        + '<div class="form-field-group">' + WM.forms.toggleField({ id: 'su-agree', label: 'I agree to the WayMark terms and privacy policy', checked: state.agree, hint: 'You can review the full terms before continuing.' })
        + (state.errors.agree ? '<span class="field-error">' + esc(state.errors.agree) + '</span>' : '') + '</div>'
        + WM.forms.formStatus(state.status, state.statusMsg)
        + '<button class="button button-primary auth-submit" type="submit">'
        + (state.loading ? '<span class="loading-spinner"></span> Creating account...' : 'Create account ' + ic('arrow-right', 16)) + '</button></form>';
    }

    function validate() {
      const e = {};
      if (!state.fullName.trim()) e.fullName = 'Full name is required.';
      else if (state.fullName.trim().length < 2) e.fullName = 'Name must be at least 2 characters.';
      if (!state.email.trim()) e.email = 'Email address is required.';
      else if (!/^\S+@\S+\.\S+$/.test(state.email)) e.email = 'Enter a valid email address.';
      if (!state.password) e.password = 'Password is required.';
      else if (state.password.length < 8) e.password = 'Password must be at least 8 characters.';
      if (!state.role) e.role = 'Please select how you plan to use WayMark.';
      if (!state.agree) e.agree = 'You must agree to the terms to continue.';
      return e;
    }

    return { body: body, state: state, validate: validate };
  }

  function signupPage() {
    function heading() {
      return '<div class="auth-heading"><div class="auth-mobile-brand">' + brand() + '</div>'
        + '<div class="eyebrow">Start your journey</div><h2>Create your WayMark account</h2>'
        + '<p>One account for discovering, hosting, and showing up.</p></div>';
    }
    const form = signupForm();
    function draw() {
      mountShell(heading() + form.body()
        + '<div class="auth-switch">Already have a WayMark account? <a href="login.html">Sign in ' + ic('arrow-right', 14) + '</a></div>', bind);
    }
    function bind(root) {
      bindSignup(root, form, draw);
    }
    draw();
  }

  function bindSignup(root, form, draw) {
    const s = form.state;
    const name = root.querySelector('#su-name');
    const email = root.querySelector('#su-email');
    const pw = root.querySelector('#su-pw');
    if (name) name.addEventListener('input', function () { s.fullName = name.value; s.errors.fullName = undefined; });
    if (email) email.addEventListener('input', function () { s.email = email.value; s.errors.email = undefined; });
    if (pw) pw.addEventListener('input', function () { s.password = pw.value; s.errors.password = undefined; });
    const tog = root.querySelector('#su-pw-toggle');
    if (tog) tog.addEventListener('click', function () { s.showPassword = !s.showPassword; draw(); });
    root.querySelectorAll('[data-radio]').forEach(function (b) {
      b.addEventListener('click', function () { s.role = b.getAttribute('data-value'); s.errors.role = undefined; draw(); });
    });
    const agree = root.querySelector('#su-agree');
    if (agree) agree.addEventListener('click', function () { s.agree = !s.agree; s.errors.agree = undefined; draw(); });
    const formEl = root.querySelector('#signup-form');
    if (formEl) formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      const errs = form.validate();
      s.errors = errs;
      if (Object.keys(errs).length) { draw(); return; }
      s.loading = true; s.status = 'loading'; draw();
      window.setTimeout(function () {
        s.loading = false; s.status = 'success'; s.success = true;
        s.statusMsg = 'Account created successfully. You can now sign in.';
        draw();
      }, 900);
    });
  }

  /* ===================== Password reset ===================== */
  function passwordReset() {
    const state = { email: '', sent: false };

    function body() {
      const heading = '<div class="auth-heading"><div class="auth-mobile-brand">' + brand() + '</div>'
        + '<div class="eyebrow">Account recovery</div><h2>Reset your password</h2>'
        + '<p>Enter your email address to receive a secure password reset link.</p></div>';
      const content = state.sent
        ? '<div class="auth-success"><div class="success-icon">' + ic('mail', 24) + '</div>'
          + '<h3>Reset link sent</h3><p>We\u2019ve sent a password reset email to <strong>' + esc(state.email) + '</strong>. Check your inbox to continue.</p>'
          + '<a class="button button-primary" href="login.html">' + ic('arrow-left', 16) + ' Return to sign in</a></div>'
        : '<form class="auth-form" id="reset-form"><div class="field-group"><label for="reset-email">Email address</label>'
          + '<div class="auth-input">' + ic('mail', 17)
          + '<input id="reset-email" type="email" value="' + esc(state.email) + '" placeholder="you@example.com" required /></div></div>'
          + '<button class="button button-primary auth-submit" type="submit">Send reset link ' + ic('arrow-right', 16) + '</button></form>';
      return heading + content
        + '<div class="auth-switch">Remembered your password? <a href="login.html">Sign in ' + ic('arrow-right', 14) + '</a></div>';
    }

    function draw() { mountShell(body(), bind); }
    function bind(root) {
      const input = root.querySelector('#reset-email');
      if (input) input.addEventListener('input', function () { state.email = input.value; });
      const f = root.querySelector('#reset-form');
      if (f) f.addEventListener('submit', function (e) { e.preventDefault(); if (state.email) { state.sent = true; draw(); } });
    }
    draw();
  }

  function embeddedSignup() {
    const form = signupForm();
    function draw() {
      WM.refreshContent(function () { return form.body(); });
      bindSignup(document.getElementById('page-content'), form, draw);
    }
    WM.page({
      route: '/forms/signup',
      render: function () { return form.body(); },
      mounted: function () { bindSignup(document.getElementById('page-content'), form, draw); },
    });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.login = login;
  global.WMPages.signup = signupPage;
  global.WMPages.passwordReset = passwordReset;
  global.WMPages.embeddedSignup = embeddedSignup;
})(window);
