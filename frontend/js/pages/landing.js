/* Landing — public entry page (blueprint: Landing, Discovery, Event detail,
 * Certificate verification entry points, Login, Register). No app layout. */
(function (global) {
  'use strict';
  const WM = global.WM;
  const D = global.WMData;
  const ic = WM.ic, esc = WM.esc, ui = WM.ui;

  const PUBLISHED = ['Published', 'Registration open', 'Ongoing'];

  function isOpen(event) {
    const status = event.approvalStatus || event.status || '';
    return PUBLISHED.indexOf(status) !== -1;
  }

  function render() {
    const featured = (D.events || []).filter(isOpen).slice(0, 6);
    const cards = featured.map(function (event) {
      return '<article class="event-card" data-event="' + esc(event.id) + '">'
        + '<div class="card-art ' + esc(event.color || 'bg-slate-600') + '"><span>' + esc(event.initials || '') + '</span>'
        + ui.badge(event.status, event.tone) + '</div>'
        + '<div class="event-card-body"><div class="eyebrow">' + esc(event.category) + '</div><h3>' + esc(event.title) + '</h3>'
        + '<p>' + ic('calendar-days', 15) + esc(event.date) + (event.time ? ' \u00b7 ' + esc(event.time) : '') + '</p>'
        + '<p>' + ic('map-pin', 15) + esc(event.location) + '</p>'
        + '<div class="card-footer"><span>' + esc(event.seats || '') + '</span>'
        + '<span class="text-link">View details ' + ic('chevron-right', 14) + '</span></div></div></article>';
    }).join('');

    const steps = [
      ['1', 'Discover', 'Browse events by category, date, and format. Save what matters.'],
      ['2', 'Register & attend', 'One participant record carries your ticket, QR pass, and attendance.'],
      ['3', 'Evaluate & certify', 'Juries score with rubrics; certificates are issued and verifiable.'],
    ].map(function (s) {
      return '<div class="landing-step"><span class="landing-step-num">' + s[0] + '</span>'
        + '<strong>' + esc(s[1]) + '</strong><p class="lede">' + esc(s[2]) + '</p></div>';
    }).join('');

    return ''
      + '<div class="landing-shell">'
      + '<header class="landing-nav">'
      + '<div class="brand"><div class="brand-mark"><span></span><span></span><span></span></div><span>waymark</span></div>'
      + '<nav class="landing-nav-links">'
      + '<a class="button button-ghost" href="discover.html">Discover</a>'
      + '<a class="button button-ghost" href="forms-certificate-verify.html">Verify certificate</a>'
      + '<a class="button button-secondary" href="login.html">Sign in</a>'
      + '<a class="button button-primary" href="signup.html">Create account</a>'
      + '</nav></header>'
      + '<section class="landing-hero">'
      + '<span class="eyebrow">Events with intention</span>'
      + '<h1>One participant journey, from discovery to certificate.</h1>'
      + '<p class="lede">WayMark carries a single record through registration, attendance, jury evaluation, and certified results \u2014 so nothing gets lost between the doors.</p>'
      + '<form class="landing-search" id="landing-search">'
      + ic('search', 19)
      + '<input id="landing-query" type="search" placeholder="Search events, topics, or keywords" aria-label="Search events" />'
      + '<button class="button button-primary" type="submit">Search</button></form>'
      + '</section>'
      + '<section class="landing-wrap">'
      + '<div class="section-heading"><div><div class="eyebrow">Upcoming</div><h2>Featured events</h2></div>'
      + '<a class="button button-ghost" href="discover.html">Browse all ' + ic('chevron-right', 15) + '</a></div>'
      + (featured.length ? '<div class="event-grid">' + cards + '</div>'
        : ui.emptyView({ title: 'No published events yet', description: 'Check back soon \u2014 hosts are preparing new events.', action: '<a class="button button-secondary" href="discover.html">Open discovery</a>' }))
      + '</section>'
      + '<section class="landing-wrap">'
      + '<div class="section-heading"><div><div class="eyebrow">How it works</div><h2>Built for meaningful participation</h2></div></div>'
      + '<div class="landing-steps">' + steps + '</div>'
      + '</section>'
      + '<section class="landing-wrap">'
      + '<div class="panel"><div class="section-heading"><div><div class="eyebrow">Trust</div><h2>Verify a certificate</h2></div></div>'
      + '<p class="lede">Every issued credential carries a unique ID. Paste it below to confirm authenticity.</p>'
      + '<form class="landing-search" id="verify-form">' + ic('shield-check', 19)
      + '<input id="verify-id" placeholder="e.g. WM-2026-000123" aria-label="Certificate credential ID" />'
      + '<button class="button button-secondary" type="submit">Verify</button></form></div>'
      + '</section>'
      + '<footer class="landing-wrap"><div class="result-meta"><span>WayMark Platform \u00b7 Events with intention</span>'
      + '<span>One journey. Many possibilities.</span></div></footer>'
      + '</div>';
  }

  function mounted(ref) {
    const root = ref.content || document;

    const search = root.querySelector('#landing-search');
    if (search) search.addEventListener('submit', function (e) {
      e.preventDefault();
      const q = (root.querySelector('#landing-query') || {}).value || '';
      window.location.href = 'discover.html' + (q ? '?q=' + encodeURIComponent(q) : '');
    });

    const verify = root.querySelector('#verify-form');
    if (verify) verify.addEventListener('submit', function (e) {
      e.preventDefault();
      const id = ((root.querySelector('#verify-id') || {}).value || '').trim();
      if (!id) { WM.toast('Enter a credential ID to verify.', 'warning'); return; }
      window.location.href = 'forms-certificate-verify.html?credential=' + encodeURIComponent(id);
    });

    root.querySelectorAll('[data-event]').forEach(function (card) {
      card.addEventListener('click', function () {
        const id = card.getAttribute('data-event');
        window.location.href = 'event-detail.html?id=' + encodeURIComponent(id);
      });
    });
  }

  function landingPage() {
    WM.page({
      route: '/landing',
      requiresLayout: false,
      render: render,
      mounted: mounted,
      load: function () { return D.ready(); },
    });
  }

  global.WMPages = global.WMPages || {};
  global.WMPages.landing = landingPage;
})(window);