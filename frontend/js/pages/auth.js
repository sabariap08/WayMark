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
    const DEMO_EMAIL = (global.WM_CONFIG && global.WM_CONFIG.DEMO_EMAIL) || '';
    const state = { email: '', password: '', showPassword: false, errors: {}, loading: false, success: false, resetMessage: '' };

    function body() {
      const heading = '<div class="auth-heading"><div class="auth-mobile-brand">' + brand() + '</div>'
        + '<div class="eyebrow">Welcome back</div><h2>Sign in to WayMark</h2>'
        + '<p>Continue your event journey from wherever you left off.</p></div>';

      if (state.success) {
        return heading + '<div class="auth-success"><div class="success-icon">' + ic('shield-check', 24) + '</div>'
          + '<h3>You\u2019re signed in.</h3>'
          + '<p>Continue to your workspace to pick up where you left off.</p>'
          + '<a class="button button-primary" href="index.html">Continue to workspace ' + ic('arrow-right', 16) + '</a></div>';
      }

      return heading + '<form class="auth-form" id="login-form" novalidate>'
        + '<div class="field-group"><label for="email">Email or username</label>'
        + '<div class="auth-input' + (state.errors.email ? ' input-error' : '') + '">' + ic('user', 17)
        + '<input id="email" type="text" placeholder="you@example.com or admin" autocomplete="username" value="' + esc(state.email) + '" /> </div>'
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
        + (DEMO_EMAIL ? '<div class="auth-divider"><span>or</span></div>'
        + '<button type="button" class="demo-button" id="demo-btn">Use demo account <span>' + esc(DEMO_EMAIL) + '</span></button>' : '')
        + '</form>'
        + '<div class="auth-switch">New to WayMark? <a href="signup.html">Create an account ' + ic('arrow-right', 14) + '</a></div>'
        + (state.resetMessage === '' ? '<button class="auth-help" id="help-btn">Need help signing in?</button>' : '');
    }

    function validate() {
      const e = {};
      const v = state.email.trim();
      if (!v) e.email = 'Enter the email or username you use for WayMark.';
      else if (v.indexOf('@') !== -1 && !/^\S+@\S+\.\S+$/.test(v)) e.email = 'Enter a valid email address.';
      else if (v.indexOf('@') === -1 && v.length < 3) e.email = 'Enter your username.';
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
      if (demo) demo.addEventListener('click', function () {
        state.email = (global.WM_CONFIG && global.WM_CONFIG.DEMO_EMAIL) || '';
        state.password = (global.WM_CONFIG && global.WM_CONFIG.DEMO_PASSWORD) || '';
        state.errors = {}; draw();
      });
      const help = root.querySelector('#help-btn');
      if (help) help.addEventListener('click', function () { window.location.href = 'password-reset.html'; });
      const form = root.querySelector('#login-form');
      if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        state.resetMessage = '';
        const next = validate();
        state.errors = next;
        if (Object.keys(next).length) { draw(); return; }
        state.loading = true; draw();
        WM.Auth.login(state.email, state.password).then(function () {
          state.loading = false; state.success = true; draw();
        }, function (err) {
          state.loading = false;
          state.errors = { form: (err && err.message) || 'Sign in failed. Please try again.' };
          draw();
        });
      });
    }

    draw();
  }

  /* ===================== Signup (form) ===================== */
  function signupForm() {
    const state = {
      fullName: '', email: '', password: '', showPassword: false, role: 'user', agree: false,
      errors: {}, status: 'idle', statusMsg: '', loading: false, success: false,
    };

    function body() {
      if (state.success) {
        return '<div class="auth-success"><div class="success-icon">' + ic('check', 24) + '</div>'
          + '<h3>Welcome to WayMark.</h3><p>' + esc(state.statusMsg) + '</p>'
          + '<a class="button button-primary" href="login.html">Continue to sign in ' + ic('arrow-right', 16) + '</a></div>';
      }

      return '<form class="auth-form" id="signup-form" novalidate>'
        + WM.forms.textField({ id: 'su-name', label: 'Full name', value: state.fullName, placeholder: 'Maya Chen', required: true, error: state.errors.fullName, icon: ic('user', 16) })
        + WM.forms.textField({ id: 'su-email', label: 'Email address', value: state.email, placeholder: 'you@example.com', required: true, type: 'email', error: state.errors.email, icon: ic('mail', 16) })
        + '<div class="form-field-group"><div class="form-field-label-row"><label for="su-pw">Password<span class="form-req">*</span></label></div>'
        + '<div class="form-input-wrap' + (state.errors.password ? ' form-input-error' : '') + '">' + ic('lock-keyhole', 16)
        + '<input id="su-pw" type="' + (state.showPassword ? 'text' : 'password') + '" placeholder="Minimum 8 characters" value="' + esc(state.password) + '" data-field="su-pw" />'
        + '<button type="button" class="password-toggle" id="su-pw-toggle">' + (state.showPassword ? ic('eye-off', 16) : ic('eye', 16)) + '</button></div>'
        + (state.errors.password ? '<span class="field-error">' + esc(state.errors.password) + '</span>' : '') + '</div>'
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
      WM.Auth.signup({ name: s.fullName, email: s.email, password: s.password, role: s.role }).then(function () {
        s.loading = false; s.status = 'success'; s.success = true;
        s.statusMsg = 'Account created successfully. You can now sign in.';
        draw();
      }, function (err) {
        s.loading = false; s.status = 'error';
        s.statusMsg = (err && err.message) || 'We could not create your account. Please try again.';
        draw();
      });
    });
  }

  /* ===================== Password reset ===================== */
  function passwordReset() {
    const state = {
      email: '', step: 'email', code: '', password: '', confirm: '',
      fallback: '', loading: false, error: '',
    };

    function heading(sub) {
      return '<div class="auth-heading"><div class="auth-mobile-brand">' + brand() + '</div>'
        + '<div class="eyebrow">Account recovery</div>'
        + '<h2>' + (state.step === 'otp' ? 'Enter the code' : 'Reset your password') + '</h2>'
        + '<p>' + sub + '</p></div>';
    }

    function body() {
      if (state.step === 'done') {
        return heading('All set.') + '<div class="auth-success"><div class="success-icon">' + ic('shield-check', 24) + '</div>'
          + '<h3>Password updated</h3><p>Your password has been changed. Sign in with your new password to continue.</p>'
          + '<a class="button button-primary" href="login.html">' + ic('arrow-left', 16) + ' Return to sign in</a></div>';
      }
      if (state.step === 'otp') {
        const note = state.fallback
          ? '<div class="form-info">Email is not configured in this environment, so use this code: <strong>' + esc(state.fallback) + '</strong>. It is also kept in the app\u2019s message outbox.</div>'
          : '<div class="form-info">We sent a verification code to <strong>' + esc(state.email) + '</strong>. It expires in 15 minutes.</div>';
        return heading('Enter the code we sent, then choose a new password.')
          + '<form class="auth-form" id="otp-form">' + note
          + '<div class="field-group"><label for="reset-code">Verification code</label>'
          + '<div class="auth-input">' + ic('shield-check', 17)
          + '<input id="reset-code" inputmode="numeric" autocomplete="one-time-code" value="' + esc(state.code) + '" placeholder="Enter code" required /></div></div>'
          + '<div class="field-group"><label for="reset-password">New password</label>'
          + '<div class="auth-input">' + ic('lock', 17)
          + '<input id="reset-password" type="password" value="' + esc(state.password) + '" placeholder="At least 8 characters" required /></div></div>'
          + '<div class="field-group"><label for="reset-confirm">Confirm password</label>'
          + '<div class="auth-input">' + ic('lock', 17)
          + '<input id="reset-confirm" type="password" value="' + esc(state.confirm) + '" placeholder="Repeat the new password" required /></div></div>'
          + (state.error ? '<div class="form-error">' + esc(state.error) + '</div>' : '')
          + '<button class="button button-primary auth-submit" type="submit"' + (state.loading ? ' disabled' : '') + '>'
          + (state.loading ? '<span class="loading-spinner"></span> Verifying...' : 'Reset password ' + ic('arrow-right', 16)) + '</button></form>'
          + '<div class="auth-switch"><button class="auth-help" type="button" id="otp-resend">Resend code</button></div>';
      }
      return heading('Enter your email address and we\u2019ll send a verification code.')
        + '<form class="auth-form" id="reset-form"><div class="field-group"><label for="reset-email">Email address</label>'
        + '<div class="auth-input">' + ic('mail', 17)
        + '<input id="reset-email" type="email" value="' + esc(state.email) + '" placeholder="you@example.com" required /></div></div>'
        + (state.error ? '<div class="form-error">' + esc(state.error) + '</div>' : '')
        + '<button class="button button-primary auth-submit" type="submit"' + (state.loading ? ' disabled' : '') + '>'
        + (state.loading ? '<span class="loading-spinner"></span> Sending...' : 'Send verification code ' + ic('arrow-right', 16)) + '</button></form>'
        + '<div class="auth-switch">Remembered your password? <a href="login.html">Sign in ' + ic('arrow-right', 14) + '</a></div>';
    }

    function requestCode() {
      state.loading = true; state.error = ''; draw();
      return global.WMApi.auth.requestPasswordReset(state.email).then(function (data) {
        state.loading = false; state.step = 'otp';
        state.fallback = (data && data.otpFallback) || '';
        draw();
      }, function (err) {
        state.loading = false;
        state.error = (err && err.message) || 'We could not send the reset code. Please try again.';
        draw();
      });
    }

    function draw() { mountShell(body(), bind); }
    function bind(root) {
      const emailInput = root.querySelector('#reset-email');
      if (emailInput) emailInput.addEventListener('input', function () { state.email = emailInput.value; state.error = ''; });
      const emailForm = root.querySelector('#reset-form');
      if (emailForm) emailForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!state.email) return;
        requestCode();
      });
      const codeInput = root.querySelector('#reset-code');
      if (codeInput) codeInput.addEventListener('input', function () { state.code = codeInput.value; state.error = ''; });
      const pwInput = root.querySelector('#reset-password');
      if (pwInput) pwInput.addEventListener('input', function () { state.password = pwInput.value; state.error = ''; });
      const cfInput = root.querySelector('#reset-confirm');
      if (cfInput) cfInput.addEventListener('input', function () { state.confirm = cfInput.value; state.error = ''; });
      const otpForm = root.querySelector('#otp-form');
      if (otpForm) otpForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!state.code) { state.error = 'Enter the verification code.'; draw(); return; }
        if ((state.password || '').length < 8) { state.error = 'Password must be at least 8 characters.'; draw(); return; }
        if (state.password !== state.confirm) { state.error = 'Passwords do not match.'; draw(); return; }
        state.loading = true; state.error = ''; draw();
        global.WMApi.auth.verifyOtp(state.email, 'password_reset', state.code).then(function (data) {
          const token = (data && data.token) || '';
          if (!token) throw new Error('Verification failed. Request a new code.');
          return global.WMApi.auth.resetPassword(token, state.password);
        }).then(function () {
          state.loading = false; state.step = 'done'; draw();
        }, function (err) {
          state.loading = false;
          state.error = (err && err.message) || 'We could not reset your password. Please try again.';
          draw();
        });
      });
      const resend = root.querySelector('#otp-resend');
      if (resend) resend.addEventListener('click', function () {
        requestCode().then(function () { WM.toast('A new code is on its way.'); });
      });
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
