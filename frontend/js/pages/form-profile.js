/* Profile management form — ports ProfileForm from pages/forms/ProfileForms.tsx */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, F = WM.forms;

  function formProfile() {
    const s = {
      fullName: '', email: '', phone: '', org: '', role: '', bio: '',
      website: '', location: '', birthDate: '', pronouns: '',
      emailUpdates: false, smsReminders: false, publicProfile: false,
      errors: {}, status: 'idle', statusMsg: '', loading: false,
    };

    function apply(user) {
      if (!user || typeof user !== 'object') return;
      const u = user.user || user.profile || user;
      s.fullName = u.name || u.fullName || '';
      s.email = u.email || '';
      s.phone = u.phone || '';
      s.org = u.org || '';
      s.role = u.role || '';
      s.bio = u.bio || '';
      s.website = u.website || '';
      s.location = u.location || '';
      s.birthDate = u.birthDate || '';
      s.pronouns = u.pronouns || '';
      s.emailUpdates = !!u.emailUpdates;
      s.smsReminders = !!u.smsReminders;
      s.publicProfile = !!u.publicProfile;
    }

    function payload() {
      return {
        name: s.fullName, email: s.email, phone: s.phone, org: s.org, role: s.role,
        bio: s.bio, website: s.website, location: s.location, birthDate: s.birthDate,
        pronouns: s.pronouns, emailUpdates: s.emailUpdates, smsReminders: s.smsReminders,
        publicProfile: s.publicProfile,
      };
    }

    function render() {
      return '<div class="page-stack">'
        + '<div class="section-heading"><div><span class="eyebrow">Your account</span><h2>Profile settings</h2></div></div>'
        + F.formSection({ title: 'Personal information', eyebrow: 'Identity', children:
          '<div class="form-grid-2">'
          + F.textField({ id: 'pf-name', label: 'Full name', value: s.fullName, required: true, error: s.errors.fullName, icon: ic('user', 16) })
          + F.textField({ id: 'pf-email', label: 'Email address', value: s.email, required: true, type: 'email', error: s.errors.email, icon: ic('mail', 16) })
          + F.textField({ id: 'pf-phone', label: 'Phone number', value: s.phone, hint: 'For event reminders', icon: ic('phone', 16) })
          + F.textField({ id: 'pf-pronouns', label: 'Pronouns', value: s.pronouns })
          + F.textField({ id: 'pf-dob', label: 'Date of birth', value: s.birthDate, type: 'date', icon: ic('calendar', 16) })
          + F.textField({ id: 'pf-location', label: 'Location', value: s.location, icon: ic('map-pin', 16) })
          + '</div>'
          + F.textArea({ id: 'pf-bio', label: 'Bio', value: s.bio, maxLength: 300, rows: 3, error: s.errors.bio, hint: 'Shown on your public profile' }) })
        + F.formSection({ title: 'Professional details', eyebrow: 'Background', children:
          '<div class="form-grid-2">'
          + F.textField({ id: 'pf-org', label: 'Organization', value: s.org, icon: ic('building-2', 16) })
          + F.textField({ id: 'pf-role', label: 'Role / title', value: s.role, icon: ic('briefcase', 16) })
          + F.textField({ id: 'pf-website', label: 'Website', value: s.website, error: s.errors.website, icon: ic('globe', 16) })
          + '</div>' })
        + F.formSection({ title: 'Communication preferences', eyebrow: 'Notifications', children:
          F.toggleField({ id: 'pf-email-updates', label: 'Email updates', checked: s.emailUpdates, hint: 'Receive event confirmations, reminders, and announcements.' })
          + F.toggleField({ id: 'pf-sms', label: 'SMS reminders', checked: s.smsReminders, hint: 'Get text reminders 24 hours before events start.' })
          + F.toggleField({ id: 'pf-public', label: 'Public profile', checked: s.publicProfile, hint: 'Allow other participants to view your profile.' }) })
        + F.formStatus(s.status, s.statusMsg)
        + F.formActions({ onSave: true, onSubmit: true, submitLabel: 'Save changes', saveLabel: 'Save draft', loading: s.loading })
        + '</div>';
    }

    function draw(focusId, sel) {
      WM.refreshContent(render, focusId, sel);
      wire();
    }

    function validate() {
      const e = {};
      if (!s.fullName.trim()) e.fullName = 'Full name is required.';
      if (!s.email.trim()) e.email = 'Email is required.';
      else if (!/^\S+@\S+\.\S+$/.test(s.email)) e.email = 'Enter a valid email address.';
      if (s.website && !/^https?:\/\//.test(s.website)) e.website = 'Website must start with http:// or https://';
      if (s.bio.length > 300) e.bio = 'Bio must be 300 characters or fewer.';
      return e;
    }

    const map = {
      'pf-name': 'fullName', 'pf-email': 'email', 'pf-phone': 'phone', 'pf-pronouns': 'pronouns',
      'pf-dob': 'birthDate', 'pf-location': 'location', 'pf-bio': 'bio', 'pf-org': 'org',
      'pf-role': 'role', 'pf-website': 'website',
    };
    const toggles = { 'pf-email-updates': 'emailUpdates', 'pf-sms': 'smsReminders', 'pf-public': 'publicProfile' };

    function wire() {
      Object.keys(map).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', function () {
          const key = map[id]; s[key] = el.value;
          if (s.errors[key]) { s.errors[key] = undefined; draw(id, el.selectionStart); }
        });
      });
      Object.keys(toggles).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', function () { s[toggles[id]] = !s[toggles[id]]; draw(); });
      });
      document.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const action = b.getAttribute('data-action');
          if (action === 'cancel') { s.status = 'idle'; s.statusMsg = ''; draw(); }
          else if (action === 'save' || action === 'submit') {
            if (action === 'submit') {
              const e = validate(); s.errors = e;
              if (Object.keys(e).length) { draw(); return; }
            }
            s.loading = true; s.status = 'loading'; draw();
            global.WMApi.users.updateMe(payload()).then(function () {
              s.loading = false; s.status = 'success';
              s.statusMsg = action === 'save' ? 'Profile saved successfully.' : 'Profile updated and published.';
              draw();
            }, function (err) {
              s.loading = false; s.status = 'error';
              s.statusMsg = (err && err.message) || 'We could not save your profile. Please try again.';
              draw();
            });
          }
        });
      });
    }

    WM.page({
      route: '/forms/profile',
      render: render,
      mounted: function () { wire(); },
      load: function () { return global.WMApi.users.me().then(apply); },
    });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.formProfile = formProfile;
})(window);