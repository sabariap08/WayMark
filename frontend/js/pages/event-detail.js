/* Event detail — full page for a single event (blueprint: Event detail).
 * Replaces the discover modal as the primary detail surface; the modal in
 * workspace.js still exists for quick previews. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  const OPEN_STATUSES = ['Published', 'Registration open'];

  function getParam(name) {
    const match = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : '';
  }

  function findEvent() {
    const id = getParam('id');
    if (!id) return (D.events || [])[0] || null;
    return (D.events || []).find(function (e) { return String(e.id) === String(id); }) || null;
  }

  function registrationState(event) {
    const reg = (D.registrations || []).find(function (r) { return String(r.eventId) === String(event.id); });
    return reg || null;
  }

  function render() {
    const event = findEvent();
    if (!event) {
      return ui.emptyView({
        title: 'Event not found',
        description: 'This event may have been removed or the link is out of date.',
        action: '<a class="button button-secondary" href="discover.html">Back to discover</a>',
      });
    }

    const status = event.approvalStatus || event.status || 'Draft';
    const capacity = event.capacityNum || 0;
    const registered = event.registeredNum || 0;
    const seatsLeft = capacity ? Math.max(capacity - registered, 0) : null;
    const reg = registrationState(event);
    const fullyBooked = seatsLeft === 0;
    const open = OPEN_STATUSES.indexOf(status) !== -1 && !fullyBooked;

    const seatsLabel = seatsLeft == null
      ? esc(event.seats || 'Open registration')
      : (fullyBooked ? 'Waitlist \u2014 event is full' : seatsLeft + ' of ' + capacity + ' seats left');

    const agenda = (event.agenda || []).length
      ? '<section class="panel"><div class="section-heading"><div><div class="eyebrow">Schedule</div><h2>Agenda</h2></div></div>'
        + '<ul class="agenda-list">' + event.agenda.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></section>'
      : '';

    const requirements = (event.requirements || []).length
      ? '<section class="panel"><div class="section-heading"><div><div class="eyebrow">Before you arrive</div><h2>Requirements</h2></div></div>'
        + '<ul class="agenda-list">' + event.requirements.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></section>'
      : '';

    const tags = (event.tags || []).length
      ? '<div class="chip-row">' + event.tags.map(function (t) { return '<span class="status-badge status-slate">' + esc(t) + '</span>'; }).join('') + '</div>'
      : '';

    const regRow = reg
      ? '<div class="form-info">' + ic('ticket-check', 15) + ' You are registered for this event (' + esc(reg.status) + ').'
        + ' <a href="registrations.html">View your ticket</a></div>'
      : '';

    const registerAction = reg
      ? '<a class="button button-secondary" href="registrations.html">' + ic('ticket-check', 16) + ' View my ticket</a>'
      : (open
        ? '<a class="button button-primary" href="forms-event-registration.html?event=' + encodeURIComponent(event.id) + '">Register for event ' + ic('chevron-right', 16) + '</a>'
        : '<a class="button button-primary" href="forms-event-registration.html?event=' + encodeURIComponent(event.id) + '&waitlist=1">Join waitlist ' + ic('clock-3', 16) + '</a>');

    return '<div class="page-stack">'
      + '<div class="result-meta"><a class="button button-ghost" href="discover.html">' + ic('arrow-left', 15) + ' Back to discover</a>'
      + '<span>' + esc(event.category) + ' \u00b7 ' + esc(event.date) + '</span></div>'

      + '<section class="panel panel-wide event-detail-panel">'
      + '<div class="event-detail-banner ' + esc(event.color || 'bg-slate-600') + '"><span class="banner-initials">' + esc(event.initials || '') + '</span>'
      + WM.statusChip(status) + '</div>'
      + '<div class="welcome-row"><div><div class="eyebrow">' + esc(event.category) + '</div>'
      + '<h1>' + esc(event.title) + '</h1>'
      + '<p class="lede">' + esc(event.description || 'Details for this event will be shared by the host.') + '</p>'
      + tags + '</div></div>'
      + regRow
      + '<div class="event-detail-grid">'
      + '<div><span class="eyebrow">Date & time</span><strong>' + esc(event.date) + '</strong><small>' + esc(event.time || '') + '</small></div>'
      + '<div><span class="eyebrow">Location</span><strong>' + esc(event.location) + '</strong></div>'
      + '<div><span class="eyebrow">Host</span><strong>' + esc(event.organizer || 'WayMark Platform') + '</strong></div>'
      + '<div><span class="eyebrow">Availability</span><strong>' + seatsLabel + '</strong></div>'
      + '<div><span class="eyebrow">Registration closes</span><strong>' + esc(event.regDeadline || 'Open until full') + '</strong></div>'
      + '<div><span class="eyebrow">Contact</span><strong>' + esc(event.contactEmail || event.website || '\u2014') + '</strong></div>'
      + '</div>'
      + '<div class="modal-actions event-detail-actions">'
      + '<a class="button button-secondary" href="forms-certificate-verify.html">' + ic('shield-check', 15) + ' Verify certificates</a>'
      + registerAction + '</div>'
      + '</section>'

      + '<div class="content-grid">'
      + '<div class="page-stack">' + agenda + requirements + '</div>'
      + '<div class="page-stack">'
      + '<section class="panel"><div class="section-heading"><div><div class="eyebrow">Venue</div><h2>Location</h2></div></div>'
      + '<div class="map-placeholder">' + ic('map-pin', 22) + '<strong>' + esc(event.location) + '</strong>'
      + '<span>Interactive map available once the venue address is confirmed.</span></div></section>'
      + '<section class="panel"><div class="section-heading"><div><div class="eyebrow">Event format</div><h2>What to expect</h2></div></div>'
      + '<div class="fact-grid">'
      + '<div class="fact-item"><span>Jury evaluation</span><strong>' + (event.juryEnabled ? 'Enabled' : 'Not for this event') + '</strong></div>'
      + '<div class="fact-item"><span>Certificates</span><strong>' + (event.certificatesEnabled ? 'Issued after completion' : 'Not offered') + '</strong></div>'
      + '<div class="fact-item"><span>Feedback form</span><strong>' + (event.feedbackEnabled ? 'Sent after the event' : 'Not offered') + '</strong></div>'
      + '<div class="fact-item"><span>Attendance</span><strong>' + (event.attendanceRequired ? 'QR check-in required' : 'Optional') + '</strong></div>'
      + '</div></section>'
      + '</div></div>'

      + '<div class="sticky-register-bar"><div><strong>' + esc(event.title) + '</strong><small>' + seatsLabel + '</small></div>'
      + registerAction + '</div>'
      + '</div>';
  }

  function eventDetailPage() {
    WM.page({
      route: '/event-detail',
      render: render,
      mounted: function () {},
      load: function () { return D.ready(); },
    });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.eventDetail = eventDetailPage;
})(window);