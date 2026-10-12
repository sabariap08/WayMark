/* Forms hub — ports pages/forms/FormsHubPage.tsx */
(function (global) {
  'use strict';
  const WM = global.WM;
  const ic = WM.ic, esc = WM.esc;

  const forms = [
    { title: 'User registration', description: 'Create a new WayMark account', href: 'forms-signup.html', icon: 'user-plus', group: 'Account' },
    { title: 'Profile management', description: 'Update personal info, preferences, and privacy', href: 'forms-profile.html', icon: 'user', group: 'Account' },
    { title: 'Event registration', description: 'Register for an event with type-specific fields', href: 'forms-event-registration.html', icon: 'calendar', group: 'Participation' },
    { title: 'Host event creation', description: 'Create, edit, preview, and submit events for approval', href: 'forms-host-event.html', icon: 'pencil', group: 'Hosting' },
    { title: 'Event approval & publishing', description: 'Review, approve, reject, or publish submitted events', href: 'forms-approval.html', icon: 'file-text', group: 'Administration' },
    { title: 'Jury management', description: 'Add and manage jury members', href: 'forms-jury-management.html', icon: 'gavel', group: 'Evaluation' },
    { title: 'Jury assignment', description: 'Assign jury panels to events and tracks', href: 'forms-jury-assignment.html', icon: 'scale', group: 'Evaluation' },
    { title: 'Rubric creation', description: 'Build scoring rubrics with weighted criteria', href: 'forms-rubric.html', icon: 'award', group: 'Evaluation' },
    { title: 'Jury scoring', description: 'Score participant submissions using rubrics', href: 'forms-scoring.html', icon: 'scale', group: 'Evaluation' },
    { title: 'Attendance check-in', description: 'Check in participants manually or via QR', href: 'forms-attendance.html', icon: 'clipboard-check', group: 'Operations' },
    { title: 'Event feedback', description: 'Collect post-event ratings and comments', href: 'forms-feedback.html', icon: 'message-square', group: 'Operations' },
    { title: 'Issue certificates', description: 'Generate certificates for eligible participants', href: 'forms-certificates.html', icon: 'award', group: 'Certificates' },
    { title: 'Verify certificate', description: 'Look up and validate a certificate by ID', href: 'forms-certificate-verify.html', icon: 'file-text', group: 'Certificates' },
  ];

  function formsHub() {
    const groups = [];
    forms.forEach(function (f) { if (groups.indexOf(f.group) === -1) groups.push(f.group); });

    const body = groups.map(function (group) {
      const cards = forms.filter(function (f) { return f.group === group; }).map(function (f) {
        return '<a href="' + f.href + '" class="forms-hub-card"><div class="forms-hub-icon">' + ic(f.icon, 20) + '</div>'
          + '<div><strong>' + esc(f.title) + '</strong><span>' + esc(f.description) + '</span></div>'
          + ic('chevron-right', 18, 'class="row-chevron"') + '</a>';
      }).join('');
      return '<div class="forms-hub-group"><span class="eyebrow">' + esc(group) + '</span><div class="forms-hub-grid">' + cards + '</div></div>';
    }).join('');

    const html = '<div class="page-stack">'
      + '<div class="section-heading"><div><span class="eyebrow">WayMark platform</span><h2>Forms & workflows</h2></div>'
      + '<a href="index.html" class="button button-secondary">' + ic('layout-grid', 16) + ' Back to dashboard</a></div>'
      + body + '</div>';

    WM.page({ route: '/forms', render: function () { return html; } });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.formsHub = formsHub;
})(window);
