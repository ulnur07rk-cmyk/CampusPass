// CampusPass — frontend (plain JavaScript, no build step). Screens follow wireframes W01–W09 in SRS 3.1.
'use strict';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { me: null, lang: localStorage.getItem('cp.lang') || 'en', day: null, type: 'all', clubCat: 'all', clubQ: '' };
  if (!I18N[S.lang]) S.lang = 'en';
  const VIEWS = {};
  // Content in the chosen language (clubs and seeded events have EN/KZ/RU texts; new events keep the organizer's text)
  const L = (o, f) => (o && o.i18n && o.i18n[S.lang] && o.i18n[S.lang][f]) || (o && o[f]) || '';
  const clubName = (e) => (e.clubI18n && e.clubI18n[S.lang] && e.clubI18n[S.lang].name) || e.club;
  const t = (k, v = {}) => String((I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const LOC = { en: 'en-GB', kk: 'kk-KZ', ru: 'ru-RU' };
  const fmt = (o) => new Intl.DateTimeFormat(LOC[S.lang], o);
  const KK = { wd: ['Жс', 'Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб'], mo: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'] };
  const dateLong = (d) => { const x = new Date(d); return S.lang === 'kk' ? `${KK.wd[x.getDay()]}, ${x.getDate()} ${KK.mo[x.getMonth()]}` : fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(x); };
  const wdShort = (d) => (S.lang === 'kk' ? KK.wd[d.getDay()] : fmt({ weekday: 'short' }).format(d));
  const time = (d) => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d));
  const dayKey = (d) => { const x = new Date(d); return x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate(); };

  // ---------- API ----------
  let pending = 0;
  const busy = (d) => { pending = Math.max(0, pending + d); document.body.classList.toggle('loading', pending > 0); };
  async function api(method, url, body) {
    busy(1);
    try {
      let r;
      try { r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
      catch { const e = new Error(t('err_network')); e.code = 'network'; throw e; }
      const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
      if (!r.ok) { const code = data.error && data.error.code; const k = 'err_' + code; const e = new Error(I18N.en[k] ? t(k) : (data.error && data.error.message) || t('err_server_error')); e.code = code; e.status = r.status; throw e; }
      return data;
    } finally { busy(-1); }
  }
  // (5) Disable a button and show progress while its action runs
  async function act(btn, fn) {
    if (btn && btn.disabled) return;
    const label = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true'); }
    try { return await fn(); } finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); btn.innerHTML = label; } }
  }
  // (2) Styled confirmation dialog
  function confirmBox(text, okLabel) {
    return new Promise((resolve) => modal(`<p style="font-size:16px;margin-top:4px">${esc(text)}</p><div class="row"><button class="btn danger" data-yes>${esc(okLabel)}</button><button class="btn ghost" data-no-btn>${esc(t('keep'))}</button></div>`, (root, close) => {
      root.querySelector('[data-yes]').addEventListener('click', () => { resolve(true); close(); });
      root.querySelector('[data-no-btn]').addEventListener('click', () => { close(); resolve(false); });
      root.addEventListener('cp-close', () => resolve(false));
    }, { noClose: true }));
  }
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200); }
  const fail = (e) => { if (e.status === 401) { S.me = null; go('signin'); } toast(e.message); };

  // ---------- navigation ----------
  const NAV = {
    student: [['events', 'nav_events'], ['map', 'nav_map'], ['clubs', 'nav_clubs'], ['tickets', 'nav_tickets'], ['history', 'nav_history'], ['profile', 'nav_profile']],
    organizer: [['events', 'nav_events'], ['map', 'nav_map'], ['myevents', 'nav_myevents'], ['checkin', 'nav_checkin'], ['clubs', 'nav_clubs'], ['profile', 'nav_profile']],
    moderator: [['moderation', 'nav_moderation'], ['stats', 'nav_stats'], ['events', 'nav_events'], ['map', 'nav_map'], ['checkin', 'nav_checkin'], ['clubs', 'nav_clubs'], ['profile', 'nav_profile']],
    admin: [['admin', 'nav_admin'], ['moderation', 'nav_moderation'], ['stats', 'nav_stats'], ['events', 'nav_events'], ['map', 'nav_map'], ['profile', 'nav_profile']], // UI01: at most six sections
    shop: [['checkout', 'nav_checkout'], ['events', 'nav_events'], ['profile', 'nav_profile']]
  };
  const go = (v) => { if (location.hash !== '#/' + v) location.hash = '#/' + v; else render(); };
  const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = { db: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'), map: svg('<path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'), history: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), events: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'), clubs: svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 20c.3-2.5 2-4 4-4 2.2 0 3 1.5 3 4"/>'), tickets: svg('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12" stroke-dasharray="2 2"/>'), profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'), myevents: svg('<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="3"/>'), checkin: svg('<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 12l3 3 5-6"/>'), moderation: svg('<path d="M9 12l2 2 4-4"/><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'), admin: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'), stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'), roles: svg('<circle cx="8" cy="8" r="3"/><path d="M2 20c0-3.3 2.7-6 6-6 1.5 0 2.8.5 3.9 1.4"/><circle cx="18" cy="16" r="3"/><path d="M18 11v2M18 19v2M13 16h2M21 16h2"/>'), checkout: svg('<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>'), shop: svg('<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>'), out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>') };
  function chrome(view) {
    document.documentElement.lang = S.lang;
    $('#tagline').textContent = t('tagline'); $('#foot').textContent = t('footer'); $('#lang').value = S.lang;
    const items = S.me && S.me.consentAt ? NAV[S.me.role] : []; // no menu until the consent is given (C08)
    const link = (icon) => ([v, k]) => `<a href="#/${v}" class="${v === view ? 'on' : ''}" ${v === view ? 'aria-current="page"' : ''}>${icon ? ICON[v] || '' : ''}<span>${esc(t(k))}</span></a>`;
    $('#nav').innerHTML = items.map(link(false)).join(''); $('#bottom').innerHTML = items.map(link(true)).join('');
    // Day / night switch (theme.js keeps the choice); the label says what the button will do
    const th = $('#theme'), dark = window.CPTheme && CPTheme.get() === 'dark';
    th.innerHTML = dark ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
    th.setAttribute('aria-label', t(dark ? 'theme_light' : 'theme_dark')); th.title = t(dark ? 'theme_light' : 'theme_dark'); th.setAttribute('aria-pressed', String(dark));
    const so = $('#signout'); so.hidden = !S.me; so.innerHTML = `<span class="lbl">${esc(t('sign_out'))}</span>${ICON.out}`; so.setAttribute('aria-label', t('sign_out'));
  }

  async function render(quiet) {
    const view = (location.hash.replace('#/', '') || '').split('?')[0];
    if (!S.me) { try { S.me = await api('GET', '/api/me'); if (S.me.lang && !localStorage.getItem('cp.lang')) S.lang = S.me.lang; } catch { S.me = null; } }
    if (!S.me) { chrome('signin'); return viewSignin(); }
    if (!S.me.consentAt) { chrome('consent'); return viewConsent(); }
    const allowed = NAV[S.me.role].map((x) => x[0]).concat(S.me.role === 'student' ? ['shop'] : ['profile']);
    const v = allowed.includes(view) ? view : NAV[S.me.role][0][0];
    chrome(v);
    if (quiet !== true) app.innerHTML = `<p class="sub" style="margin-top:24px">${esc(t('loading'))}</p>`;
    try { await VIEWS[v](); } catch (e) { fail(e); }
  }
  window.addEventListener('hashchange', () => render());
  // Live updates: every 15 s the open screen reloads its data, so changes made by other users appear without a manual refresh
  setInterval(async () => {
    const a = document.activeElement;
    if (!S.me || document.hidden || document.querySelector('.modal') || pending || /^#\/(map|myevents|admin)/.test(location.hash) || (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) return;
    const y = window.scrollY, key = a && a !== document.body ? (a.id ? '#' + a.id : [...a.attributes].filter((x) => x.name.startsWith('data-')).map((x) => `[${x.name}="${x.value}"]`).join('')) : '';
    await render(true); window.scrollTo(0, y);
    if (key) { const el = document.querySelector(key); if (el) el.focus({ preventScroll: true }); }
  }, 15000);
  $('#lang').addEventListener('change', async (e) => { S.lang = e.target.value; localStorage.setItem('cp.lang', S.lang); if (S.me) api('PUT', '/api/me/lang', { lang: S.lang }).catch(() => {}); render(); });
  // Theme switch: only the colours change, the open screen and form inputs stay as they are
  $('#theme').addEventListener('click', () => { if (window.CPTheme) CPTheme.toggle(); chrome((location.hash.replace('#/', '') || '').split('?')[0]); });
  $('#signout').addEventListener('click', async () => { await api('POST', '/api/auth/logout').catch(() => {}); S.me = null; go('signin'); });

  // ---------- W01 Sign in (FR-01) ----------
  async function viewSignin() {
    let accounts = [];
    try { accounts = await api('GET', '/api/test-accounts'); } catch { accounts = []; }
    const groups = [['student', 'group_students'], ['organizer', 'group_organizers'], ['moderator', 'group_moderator'], ['admin', 'group_admin'], ['shop', 'group_shop']];
    const options = groups.map(([r, k]) => `<optgroup label="${esc(t(k))}">${accounts.filter((x) => x.role === r).map((x) => `<option value="${esc(x.email)}">${esc(x.name)}${x.club ? ' — ' + esc(x.club) : ''} (${esc(x.email)})</option>`).join('')}</optgroup>`).join('');
    app.innerHTML = `<div class="signin-wrap"><section class="hero"><h1>${esc(t('sv_title'))}</h1><ul>${['sv_1', 'sv_2', 'sv_3'].map((k, i) => `<li>${[ICON.events, ICON.tickets, ICON.stats][i]}<span>${esc(t(k))}</span></li>`).join('')}</ul></section><section class="card signin"><h2>${esc(t('signin_title'))}</h2><p class="sub">${esc(t('signin_sub'))}</p>
      <label for="who">${esc(t('sign_in_as'))}</label><select id="who"><option value="">${esc(t('choose_account'))}</option>${options}</select>
      <form id="f" novalidate><label for="em">${esc(t('email'))}</label><input id="em" type="email" autocomplete="username" required>
      <label for="pw">${esc(t('password'))}</label><input id="pw" type="password" autocomplete="current-password" required>
      <div id="err"></div><button class="btn" style="width:100%;margin-top:14px">${esc(t('sign_in'))}</button></form></section></div>`;
    $('#who').addEventListener('change', (ev) => { const a = accounts.find((x) => x.email === ev.target.value); $('#em').value = a ? a.email : ''; $('#pw').value = a ? a.password : ''; $('#err').innerHTML = ''; if (a) $('#f button').focus(); });
    $('#f').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!$('#em').value || !$('#pw').value) { $('#err').innerHTML = `<p class="note bad">${esc(t('required'))}</p>`; return; }
      await act(ev.submitter || $('#f button'), async () => {
        try { await api('POST', '/api/auth/login', { email: $('#em').value, password: $('#pw').value }); S.me = null; location.hash = ''; render(); }
        catch (e) { $('#err').innerHTML = `<p class="note bad" role="alert">${esc(e.message)}</p>`; }
      });
    });
  }

  // ---------- C08 Consent to the processing of personal data (first sign-in) ----------
  function viewConsent() {
    app.innerHTML = `<section class="card signin" style="max-width:640px"><h1 style="margin-top:0">🔒 ${esc(t('consent_title'))}</h1><p class="sub">${esc(t('consent_sub'))}</p>
      <ul class="list">${['consent_what', 'consent_why', 'consent_who', 'consent_long', 'consent_where', 'consent_rights'].map((k) => `<li>${esc(t(k))}</li>`).join('')}</ul>
      <p class="note info">${esc(t('consent_demo'))}</p>
      <label class="chk"><input type="checkbox" id="cagree"> ${esc(t('consent_check'))}</label>
      <div class="row"><button class="btn" id="cok" disabled>${esc(t('consent_accept'))}</button><button class="btn ghost" id="cno">${esc(t('sign_out'))}</button></div></section>`;
    $('#cagree').addEventListener('change', (e) => { $('#cok').disabled = !e.target.checked; });
    $('#cok').addEventListener('click', (ev) => act(ev.currentTarget, async () => { try { const r = await api('POST', '/api/me/consent', {}); S.me.consentAt = r.consentAt; location.hash = ''; render(); } catch (err) { fail(err); } }));
    $('#cno').addEventListener('click', async () => { await api('POST', '/api/auth/logout').catch(() => {}); S.me = null; go('signin'); });
  }

  // ---------- W02/W03 Events poster and details (FR-02 … FR-09, FR-17) ----------
  function seatsBlock(e) {
    if (e.open) return `<div class="spread meta" style="margin-top:10px"><span>🙋 ${esc(t('planned_n', { n: e.planned }))}</span><span class="pill">${esc(t('open_event'))}</span></div>`;
    const pct = Math.min(100, Math.round((e.taken / e.capacity) * 100));
    return `<div class="bar ${e.free ? '' : 'full'}"><i style="width:${pct}%"></i></div><div class="spread meta"><span>${e.free ? esc(t('seats_free', { n: e.free, c: e.capacity })) : `<b style="color:var(--bad)">${esc(t('full'))}</b> · ${esc(t('waitlist_n', { n: e.waitlist }))}`}</span><span>${esc(t('coins_n', { n: e.coins }))}</span></div>`;
  }
  function actionBlock(e) {
    if (S.me.role !== 'student') return '';
    const m = e.my, started = new Date(e.startsAt) <= new Date();
    if (started && (!m || m.status === 'waitlisted')) return `<p class="note info">${esc(t('live_now'))}</p>`;
    if (!m) return `<div class="row"><button class="btn" data-reg="${e.id}">${esc(t(e.open ? 'plan_to_come' : e.free ? 'register' : 'join_waitlist'))}</button><button class="btn ghost" data-open="${e.id}">${esc(t('details'))}</button></div>`;
    if (m.status === 'confirmed') return `<p class="note ok">${esc(t('registered'))}</p><div class="row"><button class="btn ghost" data-open="${e.id}">${esc(t('details'))}</button><button class="btn danger" data-cancel="${e.id}">${esc(t('cant_come'))}</button></div>`;
    if (m.status === 'planned') return `<p class="note ok">🙋 ${esc(t('you_plan'))}</p><div class="row"><button class="btn ghost" data-open="${e.id}">${esc(t('details'))}</button><button class="btn danger" data-cancel="${e.id}">${esc(t('wont_come'))}</button></div>`;
    if (m.status === 'waitlisted') return `<p class="note warn">${esc(t('waitlisted', { n: m.position }))}</p><div class="row"><button class="btn danger" data-cancel="${e.id}">${esc(t('leave_waitlist'))}</button></div>`;
    return `<p class="note ok">✓ ${esc(t('status_checked'))}</p><div class="row"><button class="btn ghost" data-open="${e.id}">${esc(t('details'))}</button></div>`;
  }
  // Picture of an event: the organizer's own photo or a cover by type (original artwork in public/covers)
  const coverOf = (e) => e.image || (window.__COVERS ? window.__COVERS[e.type] : `/covers/${e.type}.svg`);
  const eventCard = (e) => `<article class="card ev"><img class="cover" src="${esc(coverOf(e))}" alt="" loading="lazy"><div class="spread"><span class="pill">${esc(t('type_' + e.type))}</span>${new Date(e.startsAt) <= new Date() ? `<span class="pill live">● ${esc(t('live'))}</span>` : ''}<span class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))}</span></div>
    <h3>${esc(L(e, 'title'))}</h3><div class="meta">${esc(clubName(e))} · ${esc(L(e, 'location'))}</div>${seatsBlock(e)}${actionBlock(e)}</article>`;

  async function register(id, btn) { return act(btn, async () => { try { const e = await api('POST', `/api/events/${id}/register`); toast(e.my.status === 'confirmed' ? t('registered') : e.my.status === 'planned' ? t('you_plan') : t('waitlisted', { n: e.my.position })); render(); } catch (err) { fail(err); } }); }
  async function cancel(id, btn, waitlisted) {
    if (!(await confirmBox(t(waitlisted ? 'confirm_leave' : 'confirm_cancel'), t('yes_cancel')))) return;
    return act(btn, async () => { try { await api('DELETE', `/api/events/${id}/registration`); render(); } catch (err) { fail(err); } });
  }
  function bindEventButtons(root, list) {
    root.querySelectorAll('[data-reg]').forEach((b) => b.addEventListener('click', () => register(b.dataset.reg, b)));
    root.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { const e = list.find((x) => String(x.id) === b.dataset.cancel); cancel(b.dataset.cancel, b, e && e.my && e.my.status === 'waitlisted'); }));
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openEvent(list.find((x) => String(x.id) === b.dataset.open))));
  }

  VIEWS.events = async () => {
    const list = await api('GET', '/api/events?days=7');
    const linked = /[?&]e=(\d+)/.exec(location.hash); if (linked && !S.openedLink) { S.openedLink = true; const ev = list.find((x) => String(x.id) === linked[1]); if (ev) setTimeout(() => openEvent(ev), 50); }
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
    const kw = (S.kw || '').trim().toLowerCase();
    const byType = list.filter((e) => (S.type === 'all' || e.type === S.type) && (!kw || [L(e, 'title'), clubName(e), L(e, 'location'), L(e, 'description'), e.title, e.club].join(' ').toLowerCase().includes(kw)));
    const shown = S.day ? byType.filter((e) => dayKey(e.startsAt) === S.day) : byType;
    const dayName = (d, i) => (i === 0 ? t('today') : i === 1 ? t('tomorrow') : wdShort(d));
    app.innerHTML = `<h1>${esc(t('poster_title'))}</h1><p class="sub">${esc(t('poster_sub'))}</p>
      <input id="kw" type="search" placeholder="${esc(t('search_events'))}" aria-label="${esc(t('search_events'))}" value="${esc(S.kw || '')}" style="margin-top:4px">
      <div class="spread" style="margin-top:6px"><span class="meta">${S.day ? esc(dateLong(days.find((d) => dayKey(d) === S.day) || new Date())) : esc(t('whole_week'))}</span>${S.day ? `<button class="chip" id="allweek">✕ ${esc(t('whole_week'))}</button>` : ''}</div>
      <div class="days">${days.map((d, i) => { const n = byType.filter((e) => dayKey(e.startsAt) === dayKey(d)).length; return `<button class="day ${S.day === dayKey(d) ? 'on' : ''}" data-day="${dayKey(d)}" aria-pressed="${S.day === dayKey(d)}"><small>${esc(dayName(d, i))}</small><b>${d.getDate()}</b><span class="n">${n || ''}</span></button>`; }).join('')}</div>
      <div class="chips">${['all', 'tech', 'sports', 'creative', 'intellectual', 'social'].map((c) => `<button class="chip ${S.type === c ? 'on' : ''}" data-type="${c}">${esc(c === 'all' ? t('all') : t('type_' + c))}</button>`).join('')}</div>
      ${shown.length ? `<div class="grid">${shown.map(eventCard).join('')}</div>` : `<p class="note info">${esc(t('no_events'))}</p>`}`;
    const aw = $('#allweek'); if (aw) aw.addEventListener('click', () => { S.day = null; render(); });
    const kwi = $('#kw'); kwi.addEventListener('input', () => { S.kw = kwi.value; clearTimeout(S.kwT); S.kwT = setTimeout(async () => { await render(true); const n = $('#kw'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { S.day = S.day === b.dataset.day ? null : b.dataset.day; render(); }));
    app.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { S.type = b.dataset.type; render(); }));
    bindEventButtons(app, list);
  };

  // (12) Accessible dialog: focus stays inside, Esc closes, focus returns to the button that opened it
  function modal(html, onReady, opts = {}) {
    const opener = document.activeElement;
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="card" role="dialog" aria-modal="true" tabindex="-1">${html}${opts.noClose ? '' : `<div class="row"><button class="btn ghost" data-close>${esc(t('close'))}</button></div>`}</div>`;
    const dlg = m.firstElementChild;
    const focusables = () => [...dlg.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
    let closed = false;
    const close = () => { if (closed) return; closed = true; m.dispatchEvent(new Event('cp-close')); m.remove(); document.removeEventListener('keydown', onKey); if (opener && document.body.contains(opener)) opener.focus(); };
    const onKey = (e) => {
      if (e.key === 'Escape') return close();
      if (e.key === 'Tab') { const f = focusables(); if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey); document.body.appendChild(m);
    if (onReady) onReady(m, close);
    (focusables()[0] || dlg).focus();
  }
  function calendarLinks(e) {
    const z = (s) => s.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${z(e.startsAt)}/${z(e.endsAt)}&location=${encodeURIComponent(e.location)}`;
    const o = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(e.title)}&startdt=${encodeURIComponent(e.startsAt)}&enddt=${encodeURIComponent(e.endsAt)}&location=${encodeURIComponent(e.location)}`;
    return `<label>${esc(t('calendar'))}</label><div class="row" style="margin-top:0"><a class="btn ghost small" target="_blank" rel="noopener" href="${g}">Google</a><a class="btn ghost small" target="_blank" rel="noopener" href="${o}">Outlook</a><a class="btn ghost small" href="/api/events/${e.id}/ics">${esc(t('ics'))}</a></div>`;
  }
  // Place of an event: a room on the campus floor plans or a venue in the city (F3, F22)
  const roomName = (r) => (r.i18n && r.i18n[S.lang] && r.i18n[S.lang].name) || r.name;
  const placeName = (pl) => (pl ? (pl.i18n && pl.i18n[S.lang] && pl.i18n[S.lang].name) || pl.name : '');
  const indoor = (room, route) => CPMaps.openIndoor(room, { t, esc, modal, roomName, route });
  function placeLine(e) {
    const pl = e.place; if (!pl) return `<p class="note info" style="margin:6px 0">📍 ${esc(L(e, 'location'))}</p>`;
    if (pl.kind === 'room') return `<p class="note info" style="margin:6px 0">📍 ${esc(roomName(pl))} · ${esc(t('floor_n', { n: pl.floor }))} · ${esc(t('campus_c1'))}<br><button class="btn ghost small" type="button" data-indoor style="margin-top:6px">🧭 ${esc(t('route_inside'))}</button> <a class="btn ghost small" href="#/map?e=${e.id}" style="margin-top:6px">🗺 ${esc(t('on_map'))}</a></p>`;
    return `<p class="note info" style="margin:6px 0">📍 ${esc(placeName(pl))}<br><a class="btn ghost small" href="#/map?e=${e.id}" style="margin-top:6px">🗺 ${esc(t('on_map'))}</a></p>`;
  }
  async function shareEvent(e) {
    const url = location.origin + '/#/events?e=' + e.id, text = `${L(e, 'title')} — ${dateLong(e.startsAt)}, ${time(e.startsAt)} · ${L(e, 'location')}`;
    try { if (navigator.share) { await navigator.share({ title: L(e, 'title'), text, url }); return; } await navigator.clipboard.writeText(text + ' ' + url); toast(t('link_copied')); }
    catch { toast(text + ' ' + url); }
  }
  // FR-43 Report a problem with an event or a club (every role except the administrator, who handles reports)
  const canReport = () => S.me && S.me.role !== 'admin';
  const REASONS = ['wrong_info', 'spam', 'offensive', 'safety', 'other'];
  function reportBox(targetType, targetId, title) {
    modal(`<h2>🚩 ${esc(t('report_title'))}</h2><p class="meta">${esc(t('target_' + targetType))} · ${esc(t('report_about', { title }))}</p>
      <label for="rr-reason">${esc(t('report_reason'))}</label><select id="rr-reason">${REASONS.map((r) => `<option value="${r}">${esc(t('reason_' + r))}</option>`).join('')}</select>
      <label for="rr-text">${esc(t('report_text'))}</label><textarea id="rr-text" rows="4" maxlength="500" aria-describedby="rr-hint"></textarea>
      <p class="meta" id="rr-hint">${esc(t('report_hint'))}</p><div id="rr-err"></div><div class="row"><button class="btn" id="rr-send">${esc(t('report_send'))}</button></div>`, (root, close) => {
      $('#rr-send', root).addEventListener('click', (ev) => act(ev.currentTarget, async () => {
        const text = $('#rr-text', root).value.trim();
        if (text.length < 5) { $('#rr-err', root).innerHTML = `<p class="field-err" role="alert">${esc(t('err_invalid_complaint'))}</p>`; $('#rr-text', root).setAttribute('aria-invalid', 'true'); $('#rr-text', root).focus(); return; }
        try { await api('POST', '/api/complaints', { targetType, targetId, reason: $('#rr-reason', root).value, text }); close(); toast(t('report_sent')); }
        catch (err) { $('#rr-err', root).innerHTML = `<p class="note bad" role="alert">${esc(err.message)}</p>`; }
      }));
    });
  }
  // Which languages the texts of an event exist in (FR-39)
  const langsOf = (e) => { const i = e.i18n || {}; const l = ['en', 'kk', 'ru'].filter((x) => i[x] && i[x].title); if (!i.en && e.title && !l.includes('en') && !/[а-яәіңғүұқөһ]/i.test(e.title)) l.unshift('en'); return l; };
  const LANGNAME = { en: 'EN', kk: 'ҚАЗ', ru: 'РУС' };
  function openEvent(e) {
    const m = e.my, rem = m && m.reminder;
    const reminders = m && ['confirmed', 'planned'].includes(m.status) ? `<label>${esc(t('reminders'))}</label><div class="seg" role="group">${['off', 'push', 'telegram'].map((c) => `<button data-ch="${c}" aria-pressed="${rem.channel === c}">${esc(t(c === 'off' ? 'rem_off' : c === 'push' ? 'rem_push' : 'rem_tg'))}</button>`).join('')}</div>
      <div><label class="chk"><input type="checkbox" id="rd" ${rem.day ? 'checked' : ''}> ${esc(t('rem_day'))}</label><label class="chk"><input type="checkbox" id="rh" ${rem.hour ? 'checked' : ''}> ${esc(t('rem_hour'))}</label></div><p class="meta">${esc(t('rem_note'))}</p>` : '';
    const rating = m && m.status === 'checked_in' ? (m.rating ? `<p class="note ok">${esc(t('rated', { n: m.rating }))}</p>` : `<label>${esc(t('rate'))}</label><div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button data-star="${n}" aria-label="${n}">★</button>`).join('')}</div>`) : '';
    modal(`<img class="cover big" src="${esc(coverOf(e))}" alt=""><span class="pill">${esc(t('type_' + e.type))}</span><h2 style="margin-top:8px">${esc(L(e, 'title'))}</h2><p class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))}–${esc(time(e.endsAt))} · ${esc(clubName(e))}</p>${placeLine(e)}<p>${esc(L(e, 'description'))}</p>${seatsBlock(e)}${actionBlock(e)}${reminders}${m && m.status !== 'waitlisted' ? calendarLinks(e) : ''}<div class="row"><button class="btn ghost small" data-share>↗ ${esc(t('share'))}</button>${canReport() ? `<button class="btn ghost small" data-report>🚩 ${esc(t('report'))}</button>` : ''}</div>${rating}`, (root, close) => {
      const rp = root.querySelector('[data-report]'); if (rp) rp.addEventListener('click', () => { close(); reportBox('event', e.id, L(e, 'title')); });
      bindEventButtons(root, [e]); root.querySelectorAll('[data-reg],[data-cancel]').forEach((b) => b.addEventListener('click', close));
      const sh = root.querySelector('[data-share]'); if (sh) sh.addEventListener('click', () => shareEvent(e));
      const ib = root.querySelector('[data-indoor]'); if (ib) ib.addEventListener('click', () => indoor(e.place, true));
      root.querySelectorAll('a[href^="#/map"]').forEach((x) => x.addEventListener('click', () => root.querySelector('[data-close]') && root.querySelector('[data-close]').click()));
      const save = async (channel) => { try { await api('PUT', `/api/registrations/${m.id}/reminders`, { channel, day: $('#rd', root).checked, hour: $('#rh', root).checked }); m.reminder = { channel, day: $('#rd', root).checked, hour: $('#rh', root).checked }; root.querySelectorAll('[data-ch]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ch === channel)); toast(t('saved')); } catch (err) { fail(err); } };
      root.querySelectorAll('[data-ch]').forEach((b) => b.addEventListener('click', () => save(b.dataset.ch)));
      root.querySelectorAll('#rd,#rh').forEach((c) => c.addEventListener('change', () => save(m.reminder.channel)));
      root.querySelectorAll('[data-star]').forEach((b) => b.addEventListener('click', async () => { try { await api('POST', `/api/events/${e.id}/feedback`, { rating: Number(b.dataset.star) }); close(); toast(t('rated', { n: b.dataset.star })); render(); } catch (err) { fail(err); } }));
    });
  }

  // ---------- W04 Tickets (FR-04, FR-05) ----------
  VIEWS.tickets = async () => {
    const list = await api('GET', '/api/me/registrations');
    const active = list.filter((e) => new Date(e.endsAt) > new Date() || e.my.status === 'checked_in');
    app.innerHTML = `<h1>${esc(t('tickets_title'))}</h1><p class="sub">${esc(t('tickets_sub'))}</p>${active.length ? `<div class="grid">${active.map((e) => `<article class="card ticket">
      ${e.my.status === 'confirmed' ? `<div class="qr" data-qr="${esc(e.my.ticketCode)}"></div><p class="code">${esc(e.my.ticketCode)}</p>` : ''}
      <h3>${esc(L(e, 'title'))}</h3><p class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))} · ${esc(L(e, 'location'))}</p>${actionBlock(e)}</article>`).join('')}</div>` : `<p class="note info">${esc(t('no_tickets'))}</p>`}`;
    app.querySelectorAll('[data-qr]').forEach((el) => { try { new QRCode(el, { text: el.dataset.qr, width: 176, height: 176, colorDark: '#0f172a', colorLight: '#ffffff' }); } catch { el.textContent = el.dataset.qr; } });
    bindEventButtons(app, active);
  };

  // ---------- W05 Clubs (FR-10) ----------
  VIEWS.clubs = async () => {
    const clubs = await api('GET', '/api/clubs');
    const draw = () => {
      const q = S.clubQ.toLowerCase();
      const shown = clubs.filter((c) => (S.clubCat === 'all' || c.category === S.clubCat) && (!q || c.name.toLowerCase().includes(q) || L(c, 'name').toLowerCase().includes(q)));
      if (!shown.length) { $('#clubs').innerHTML = `<p class="note info" style="grid-column:1/-1">${esc(t('no_clubs'))}</p>`; return; }
      $('#clubs').innerHTML = shown.map((c) => `<article class="card"><div class="spread"><span class="pill">${esc(t('type_' + c.category))}</span><span class="meta">${esc(t('members_n', { n: c.members }))}</span></div>
        <h3 style="margin:8px 0 2px">${esc(L(c, 'name'))}</h3><p class="meta">${esc(L(c, 'room'))}</p><p style="font-size:14px">${esc(L(c, 'description'))}</p>
        ${c.myStatus === 'accepted' ? `<span class="note ok">${esc(t('st_accepted'))}</span>` : c.myStatus === 'pending' ? `<span class="note warn">${esc(t('st_pending'))}</span>` : S.me.role === 'student' ? `${c.myStatus === 'declined' ? `<p class="meta">${esc(t('st_declined'))}</p>` : ''}<button class="btn small" data-join="${c.id}">${esc(t('join'))}</button>` : ''}${canReport() ? ` <button class="btn ghost small" data-report-club="${c.id}" aria-label="${esc(t('report'))}: ${esc(L(c, 'name'))}">🚩 ${esc(t('report'))}</button>` : ''}</article>`).join('');
      app.querySelectorAll('[data-report-club]').forEach((b) => b.addEventListener('click', () => { const c = clubs.find((x) => String(x.id) === b.dataset.reportClub); reportBox('club', c.id, L(c, 'name')); }));
      app.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => {
        const c = clubs.find((x) => String(x.id) === b.dataset.join);
        modal(`<h2>${esc(t('join'))}: ${esc(L(c, 'name'))}</h2><label for="msg">${esc(t('why_join'))}</label><textarea id="msg" rows="4" maxlength="500"></textarea><div class="row"><button class="btn" id="send">${esc(t('send_request'))}</button></div>`, (root, close) => {
          $('#send', root).addEventListener('click', (ev) => act(ev.currentTarget, async () => { try { await api('POST', `/api/clubs/${c.id}/join`, { message: $('#msg', root).value }); c.myStatus = 'pending'; close(); toast(t('st_pending')); draw(); } catch (err) { fail(err); } }));
        });
      }));
    };
    app.innerHTML = `<h1>${esc(t('clubs_title'))}</h1><p class="sub">${esc(t('clubs_sub', { n: clubs.length }))}</p><input id="q" type="search" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" value="${esc(S.clubQ)}">
      <div class="chips">${['all', 'sports', 'creative', 'tech', 'intellectual', 'social'].map((c) => `<button class="chip ${S.clubCat === c ? 'on' : ''}" data-cat="${c}">${esc(c === 'all' ? t('all') : t('type_' + c))}</button>`).join('')}</div><div class="grid" id="clubs"></div>`;
    $('#q').addEventListener('input', (e) => { S.clubQ = e.target.value; draw(); });
    app.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { S.clubCat = b.dataset.cat; app.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
    draw();
  };

  // ---------- W06 Profile (FR-16, FR-19, FR-21) ----------
  // Attendance history (shared by the History tab and the Profile)
  const RES = { attended: ['ok', 'hist_attended'], missed: ['bad', 'hist_missed'], cancelled: ['warn', 'hist_cancelled'], expired: ['warn', 'hist_expired'], planned: ['info', 'hist_planned'] };
  function historyHTML(regs) { const hist = regs.items, rate = regs.attended + regs.missed ? Math.round((regs.attended / (regs.attended + regs.missed)) * 100) : null; return `<section class="card" style="grid-column:1/-1"><h2>${esc(t('history_title'))}</h2>${rate !== null ? `<p class="meta">${esc(t('hist_summary', { a: regs.attended, t: regs.attended + regs.missed, p: rate }))}</p>` : ''}${hist.length ? `<div class="tablewrap"><table class="stack"><thead><tr><th>${esc(t('th_event'))}</th><th>${esc(t('th_date'))}</th><th>${esc(t('th_status'))}</th><th>${esc(t('coins'))}</th><th>${esc(t('th_rating'))}</th></tr></thead><tbody>${hist.map((e) => `<tr><td data-label="${esc(t('th_event'))}"><b>${esc(L(e, 'title'))}</b><br><span class="meta">${esc(clubName(e))}</span></td><td data-label="${esc(t('th_date'))}">${esc(dateLong(e.startsAt))}</td><td data-label="${esc(t('th_status'))}"><span class="note ${RES[e.result][0]}" style="margin:0;padding:3px 8px;display:inline-block">${esc(t(RES[e.result][1]))}</span></td><td data-label="${esc(t('coins'))}">${e.coinsEarned ? '+' + e.coinsEarned : '—'}</td><td data-label="${esc(t('th_rating'))}">${e.result !== 'attended' ? '—' : e.my && e.my.rating ? '★ ' + e.my.rating + '/5' : `<div class="stars" aria-label="${esc(t('rate'))}">${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${e.id}" data-star="${n}" aria-label="${n}">★</button>`).join('')}</div>`}</td></tr>`).join('')}</tbody></table></div><p class="meta">${esc(t('rate_hint'))}</p>` : `<p class="meta">${esc(t('hist_empty'))}</p>`}</section>`; }
  function bindRating(root) { root.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', async () => { try { await api('POST', `/api/events/${b.dataset.rate}/feedback`, { rating: Number(b.dataset.star) }); toast(t('rated', { n: b.dataset.star })); render(); } catch (err) { fail(err); } })); }
  VIEWS.history = async () => {
    const regs = await api('GET', '/api/me/history');
    app.innerHTML = `<h1>${esc(t('history_title'))}</h1><p class="sub">${esc(t('history_sub'))}</p><div class="grid">${historyHTML(regs)}</div>`;
    bindRating(app);
  };
  VIEWS.profile = async () => {
    const [me, coins, notes, clubs, regs, reports] = await Promise.all([api('GET', '/api/me'), api('GET', '/api/me/coins'), api('GET', '/api/me/notifications'), api('GET', '/api/clubs'), S.me.role === 'student' ? api('GET', '/api/me/history') : { items: [] }, api('GET', '/api/me/complaints').catch(() => [])]);
    const mine = clubs.filter((c) => c.myStatus === 'accepted' || c.myStatus === 'pending');
    const hist = regs.items, rate = regs.attended + regs.missed ? Math.round((regs.attended / (regs.attended + regs.missed)) * 100) : null;
    app.innerHTML = `<h1>${esc(me.name)}</h1><p class="sub">${esc(me.email)}${me.studentId ? ' · ID ' + esc(me.studentId) : ''}${me.group ? ' · ' + esc(me.group) : ''}${me.club ? ' · ' + esc(me.club.name) : ''}</p>
      <div class="grid"><section class="card"><h2>${esc(t('coins'))}</h2><div class="kpi"><b>${coins.balance}</b></div>${S.me.role === 'student' ? `<a class="btn small" href="#/shop" style="display:inline-block;text-decoration:none;margin:6px 0">🛍 ${esc(t('shop_open'))}</a>` : ''}<p class="note info" style="margin:8px 0">${esc(t('coins_info'))}</p><ul class="list">${coins.history.map((h) => `<li class="spread"><span>${esc(h.event || h.reason)}<br><span class="meta">${esc(dateLong(h.createdAt))}</span></span><b>${h.amount > 0 ? '+' : ''}${h.amount}</b></li>`).join('')}</ul></section>
      <section class="card"><h2>${esc(t('notifications'))}</h2><p class="meta">${esc(t('notes_info'))}</p>${notes.length ? `<ul class="list">${notes.map((n) => `<li><span class="pill">${esc(t('ch_' + n.channel))}</span> ${esc(n.text)}<br><span class="meta">${esc(dateLong(n.createdAt))}, ${esc(time(n.createdAt))}</span></li>`).join('')}</ul>` : `<p class="meta">${esc(t('no_notifications'))}</p>`}</section>
      <section class="card"><h2>✈️ Telegram</h2><div id="tgbody"><p class="meta">${esc(t('loading'))}</p></div></section>
      ${reports.length ? `<section class="card"><h2>🚩 ${esc(t('my_complaints'))}</h2><ul class="list">${reports.map((c) => `<li><div class="spread"><b>${esc(c.targetTitle || '—')}</b>${cstPill(c.status)}</div><span class="meta">${esc(t('target_' + c.targetType))} · ${esc(t('reason_' + c.reason))} · ${esc(dateLong(c.createdAt))}</span><br><span style="font-size:14px">${esc(c.text)}</span>${c.comment ? `<p class="note info" style="margin:6px 0 0">💬 ${esc(c.comment)}</p>` : ''}</li>`).join('')}</ul></section>` : ''}
      ${S.me.role === 'student' ? `<section class="card" style="grid-column:1/-1"><h2>${esc(t('history_title'))}</h2>${rate !== null ? `<p class="meta">${esc(t('hist_summary', { a: regs.attended, t: regs.attended + regs.missed, p: rate }))}</p>` : ''}${hist.length ? `<div class="tablewrap"><table class="stack"><thead><tr><th>${esc(t('th_event'))}</th><th>${esc(t('th_date'))}</th><th>${esc(t('th_status'))}</th><th>${esc(t('coins'))}</th><th>${esc(t('th_rating'))}</th></tr></thead><tbody>${hist.map((e) => `<tr><td data-label="${esc(t('th_event'))}"><b>${esc(L(e, 'title'))}</b><br><span class="meta">${esc(clubName(e))}</span></td><td data-label="${esc(t('th_date'))}">${esc(dateLong(e.startsAt))}</td><td data-label="${esc(t('th_status'))}"><span class="note ${RES[e.result][0]}" style="margin:0;padding:3px 8px;display:inline-block">${esc(t(RES[e.result][1]))}</span></td><td data-label="${esc(t('coins'))}">${e.coinsEarned ? '+' + e.coinsEarned : '—'}</td><td data-label="${esc(t('th_rating'))}">${e.result !== 'attended' ? '—' : e.my && e.my.rating ? '★ ' + e.my.rating + '/5' : `<div class="stars" aria-label="${esc(t('rate'))}">${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${e.id}" data-star="${n}" aria-label="${n}">★</button>`).join('')}</div>`}</td></tr>`).join('')}</tbody></table></div><p class="meta">${esc(t('rate_hint'))}</p>` : `<p class="meta">${esc(t('hist_empty'))}</p>`}</section>` : ''}
      <section class="card"><h2>${esc(t('my_clubs'))}</h2><ul class="list">${mine.map((c) => `<li class="spread"><span>${esc(L(c, 'name'))}</span><span class="meta">${esc(t(c.myStatus === 'accepted' ? 'st_accepted' : 'st_pending'))}</span></li>`).join('') || '<li class="meta">—</li>'}</ul>
      <label for="pl">${esc(t('language'))}</label><select id="pl"><option value="en">English</option><option value="kk">Қазақша</option><option value="ru">Русский</option></select></section>
      <section class="card"><h2>🔒 ${esc(t('consent_title'))}</h2><p class="meta">${esc(t('consent_given', { date: me.consentAt ? dateLong(me.consentAt) : '—' }))}</p><p class="meta">${esc(t('consent_withdraw_hint'))}</p><button class="btn danger small" id="cwd">${esc(t('consent_withdraw'))}</button></section></div>`;
    $('#cwd').addEventListener('click', async (ev) => { const b = ev.currentTarget; if (!(await confirmBox(t('consent_withdraw_confirm'), t('consent_withdraw')))) return; await act(b, async () => { try { await api('DELETE', '/api/me/consent'); S.me.consentAt = null; render(); } catch (err) { fail(err); } }); });
    app.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', async () => { try { await api('POST', `/api/events/${b.dataset.rate}/feedback`, { rating: Number(b.dataset.star) }); toast(t('rated', { n: b.dataset.star })); render(); } catch (err) { fail(err); } }));
    $('#pl').value = S.lang; $('#pl').addEventListener('change', (e) => { $('#lang').value = e.target.value; $('#lang').dispatchEvent(new Event('change')); });
    drawTelegram();
  };

  // Database overview for the defense (administrator): tables, columns, links, row counts and a masked sample
  VIEWS.db = async (host = app) => {
    const tables = await api('GET', '/api/admin/db');
    const total = tables.reduce((n, x) => n + x.count, 0);
    host.innerHTML = `${host === app ? `<h1>${esc(t('db_title'))}</h1>` : ''}<p class="sub">${esc(t('db_sub', { n: tables.length, rows: total }))}</p>
      <p><a class="btn ghost small" href="/diagrams/fig_er_diagram.png" target="_blank" rel="noopener">${esc(t('db_er'))}</a></p>
      <div class="grid">${tables.map((x) => `<section class="card"><div class="spread"><h2 style="margin:0">${esc(x.table)}</h2><span class="pill">${x.count} ${esc(t('db_rows'))}</span></div>
        <div class="tablewrap"><table><thead><tr><th>${esc(t('db_col'))}</th><th>${esc(t('db_type'))}</th><th>${esc(t('db_key'))}</th></tr></thead><tbody>${x.columns.map((c) => `<tr><td>${esc(c.name)}</td><td class="meta">${esc(c.type)}</td><td>${c.pk ? '<span class="pill">PK</span>' : ''}${c.ref ? `<span class="pill">FK → ${esc(c.ref)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
        ${x.sample.length ? `<details style="margin-top:8px"><summary class="meta">${esc(t('db_sample'))}</summary><pre style="white-space:pre-wrap;font-size:12px;margin:6px 0 0">${esc(JSON.stringify(x.sample, null, 1))}</pre></details>` : ''}</section>`).join('')}</div>`;
  };

  // FR-08 / SW02 Telegram reminders: connect with a one-time link, send a test message, disconnect
  async function drawTelegram() {
    const box = $('#tgbody'); if (!box) return;
    let st; try { st = await api('GET', '/api/me/telegram'); } catch { st = { enabled: false }; }
    if (!box.isConnected) return;
    if (!st.enabled) { box.innerHTML = `<p class="note info" style="margin:0">${esc(t('tg_off'))}</p>`; return; }
    box.innerHTML = st.connected
      ? `<p class="note ok" style="margin:0 0 8px">✓ ${esc(t('tg_connected', { bot: '@' + st.bot }))}</p><p class="meta" style="margin:0 0 6px">${esc(t('tg_role_' + S.me.role))}</p><div class="row"><button class="btn small" id="tgtest">${esc(t('tg_test'))}</button><button class="btn ghost small" id="tgoff">${esc(t('tg_disconnect'))}</button></div>`
      : `<p class="meta">${esc(t('tg_role_' + S.me.role))}</p><div class="row"><button class="btn small" id="tglink">${esc(t('tg_connect'))}</button></div><p class="meta" style="margin-top:6px">${esc(t('tg_privacy'))}</p>`;
    const go = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', () => act(b, fn)); };
    go('#tglink', async () => {
      const w = window.open('about:blank', '_blank');
      const { url } = await api('POST', '/api/me/telegram/link', {});
      if (w) w.location.href = url; else location.href = url;
      toast(t('tg_wait'));
      for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 3000)); const s2 = await api('GET', '/api/me/telegram'); if (s2.connected) { toast(t('tg_done')); return drawTelegram(); } }
    });
    go('#tgtest', async () => { await api('POST', '/api/me/telegram/test', {}); toast(t('tg_sent')); });
    go('#tgoff', async () => { await api('DELETE', '/api/me/telegram', {}); drawTelegram(); });
  }


  // ---------- Free rooms panel (F21): organizer — in "My events" next to the form; moderator — in "Moderation" ----------
  const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  function freeRooms(host, opts = {}) {
    const d0 = opts.start ? new Date(opts.start) : (() => { const d = new Date(Date.now() + 86400000); d.setHours(18, 0, 0, 0); return d; })();
    host.innerHTML = `<h2>${esc(t('free_rooms'))}</h2><p class="meta" style="margin-top:0">${esc(t('free_rooms_sub'))}</p>
      <div class="spread"><div style="flex:2"><label for="rs">${esc(t('f_start'))}</label><input id="rs" type="datetime-local" value="${toLocal(d0)}"></div><div style="flex:1"><label for="rd">${esc(t('f_duration'))}</label><input id="rd" type="number" min="15" max="720" value="${Number(opts.minutes) || 120}"></div></div>
      <p class="meta" id="rsum" style="margin:8px 0 0"></p><ul class="list" id="rooms" style="margin-top:8px"></ul>`;
    const why = (r) => (r.reason === 'lecture' ? t('busy_lecture', { from: time(r.from), to: time(r.to) }) : r.reason === 'requested' ? t('busy_requested', { title: r.title }) : t('busy_event', { title: r.title }));
    async function load() {
      const st = new Date($('#rs', host).value); if (isNaN(st)) return;
      let rooms; try { rooms = await api('GET', `/api/rooms/availability?start=${encodeURIComponent(st.toISOString())}&minutes=${Number($('#rd', host).value) || 120}`); } catch (err) { return fail(err); }
      $('#rsum', host).textContent = t('rooms_free_n', { n: rooms.filter((r) => r.free).length, all: rooms.length });
      $('#rooms', host).innerHTML = rooms.sort((a, b) => b.free - a.free || a.floor - b.floor).map((r) => `<li class="spread"><span><b>${esc(roomName(r))}</b><br><span class="meta">${esc(t('floor_n', { n: r.floor }))} · ${esc(t('seats_n', { n: r.capacity }))}</span></span><span class="row" style="margin:0"><span class="note ${r.free ? 'ok' : 'bad'}" style="margin:0;padding:3px 8px">${esc(r.free ? t('room_free') : why(r))}</span>${r.free && opts.onPick ? `<button class="btn small" type="button" data-pick="${esc(r.code)}">${esc(t('use_room'))}</button>` : ''}<button class="btn ghost small" type="button" data-plan="${esc(r.code)}" aria-label="${esc(t('show_on_plan'))}">🧭</button></span></li>`).join('');
      host.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => indoor(rooms.find((r) => r.code === b.dataset.plan), false)));
      host.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => opts.onPick(rooms.find((r) => r.code === b.dataset.pick), $('#rs', host).value, Number($('#rd', host).value) || 120)));
    }
    ['#rs', '#rd'].forEach((id) => $(id, host).addEventListener('change', load));
    load();
    return { set: (start, minutes) => { if (start) $('#rs', host).value = start; if (minutes) $('#rd', host).value = minutes; load(); } };
  }

  // ---------- Map: city map with routes (all roles) — F22 ----------
  VIEWS.map = async () => {
    const [list, places] = await Promise.all([api('GET', '/api/events?days=7'), api('GET', '/api/places')]);
    const C = places.campus, campusLL = [C.lat, C.lng], onCampus = list.filter((e) => e.place && e.place.kind === 'room'), inCity = list.filter((e) => e.place && e.place.kind === 'venue');
    if (!S.mapMode) S.mapMode = 'foot';
    const item = (e) => `<li class="mapitem" data-ev="${e.id}"><b>${esc(L(e, 'title'))}</b><br><span class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))} · ${esc(e.place.kind === 'room' ? roomName(e.place) + ' · ' + t('floor_n', { n: e.place.floor }) : placeName(e.place))}</span>
      <div class="row" style="margin-top:6px"><button class="btn small" data-route="${e.id}">${esc(t('route_here'))}</button>${e.place.kind === 'room' ? `<button class="btn ghost small" data-in="${e.id}">🧭 ${esc(t('route_inside'))}</button>` : ''}<button class="btn ghost small" data-det="${e.id}">${esc(t('details'))}</button></div></li>`;
    app.innerHTML = `<h1>${esc(t('map_title'))}</h1><p class="sub">${esc(t('map_sub'))}</p>
      <div class="maplayout"><aside class="card mapside">
        <div id="tab-events">
          <div class="row" style="margin-top:0"><button class="btn ghost small" id="me">📍 ${esc(t('my_location'))}</button><div class="seg"><button data-mode="foot" aria-pressed="${S.mapMode === 'foot'}">🚶 ${esc(t('walk'))}</button><button data-mode="car" aria-pressed="${S.mapMode === 'car'}">🚗 ${esc(t('car'))}</button></div></div>
          <p class="note info" id="rinfo" style="margin:8px 0">${esc(t('route_hint'))}</p>
          <h3 class="maph">${esc(t('on_campus'))} · ${esc(C.i18n && C.i18n[S.lang] ? C.i18n[S.lang].address : C.address)} (${onCampus.length})</h3><ul class="list">${onCampus.map(item).join('')}</ul>
          <h3 class="maph">${esc(t('in_city'))} (${inCity.length})</h3><ul class="list">${inCity.map(item).join('') || `<li class="meta">—</li>`}</ul>
        </div>
      </aside><div class="card mapbox"><div id="map"></div></div></div>`;
    app.querySelectorAll('[data-det]').forEach((b) => b.addEventListener('click', () => openEvent(list.find((x) => String(x.id) === b.dataset.det))));
    app.querySelectorAll('[data-in]').forEach((b) => b.addEventListener('click', () => indoor(list.find((x) => String(x.id) === b.dataset.in).place, true)));
    // city map: 2GIS when a key is configured, otherwise OpenStreetMap (F22)
    if (!S.cfg) { try { S.cfg = await api('GET', '/api/config'); } catch { S.cfg = {}; } }
    let map; try { map = await CPMaps.cityMap($('#map'), { key: S.cfg.mapKey, center: campusLL, zoom: 13 }); } catch { $('#map').innerHTML = `<p class="note warn" style="margin:16px">${esc(t('map_offline'))}</p>`; return; }
    const campusName = C.i18n && C.i18n[S.lang] ? C.i18n[S.lang].name : C.name;
    const markers = {};
    const cm = map.marker({ ll: campusLL, color: '#2e6b45', label: 'C1', html: `<b>${esc(campusName)}</b><br>${esc(t('events_n', { n: onCampus.length }))}` });
    onCampus.forEach((e) => { markers[e.id] = cm; });
    inCity.forEach((e) => { markers[e.id] = map.marker({ ll: [e.place.lat, e.place.lng], color: '#16a34a', label: '★', html: `<b>${esc(L(e, 'title'))}</b><br>${esc(placeName(e.place))}<br>${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))}` }); });
    map.fit([campusLL, ...inCity.map((e) => [e.place.lat, e.place.lng])]);
    let me = null, meMarker = null;
    const setMe = (ll) => { me = ll; if (meMarker) meMarker.move(ll); else meMarker = map.marker({ ll, color: '#1e293b', label: '●', html: esc(t('you_here')) }); };
    const locate = () => new Promise((ok) => { if (!navigator.geolocation) return ok(false); navigator.geolocation.getCurrentPosition((p) => { setMe([p.coords.latitude, p.coords.longitude]); ok(true); }, () => ok(false), { enableHighAccuracy: true, timeout: 8000 }); });
    map.onClick((ll) => { setMe(ll); $('#rinfo').textContent = t('start_set'); });
    $('#me').addEventListener('click', async () => { if (await locate()) map.view(me, 14); else $('#rinfo').textContent = t('loc_denied'); });
    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { S.mapMode = b.dataset.mode; app.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
    async function routeTo(e) {
      if (!me && !(await locate())) { $('#rinfo').textContent = t('loc_denied'); return; }
      const to = [e.place.lat, e.place.lng]; $('#rinfo').textContent = t('loading');
      const r = await CPMaps.cityRoute(me, to, S.mapMode);
      map.line(r.line); map.fit(r.line); markers[e.id].open();
      $('#rinfo').innerHTML = `${esc(t('route_to', { place: e.place.kind === 'room' ? campusName : placeName(e.place) }))}: <b>${r.km.toFixed(1)} km · ${r.min} ${esc(t('min'))}</b>${r.exact ? '' : ' (' + esc(t('route_approx')) + ')'}${e.place.kind === 'room' ? `<br><button class="btn ghost small" id="cont" style="margin-top:6px">🧭 ${esc(t('continue_inside'))}</button>` : ''}`;
      const c = $('#cont'); if (c) c.addEventListener('click', () => indoor(e.place, true));
    }
    app.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', () => routeTo(list.find((x) => String(x.id) === b.dataset.route))));
    app.querySelectorAll('.mapitem').forEach((li) => li.addEventListener('mouseenter', () => { const mk = markers[li.dataset.ev]; if (mk) mk.open(); }));
    const linked = /[?&]e=(\d+)/.exec(location.hash); if (linked) { const ev = list.find((x) => String(x.id) === linked[1]); if (ev && ev.place) { map.view([ev.place.lat, ev.place.lng], 15); markers[ev.id].open(); } }
  };

  // ---------- W07 Organizer: submit event and own events (FR-11) ----------
  const statusPill = (s) => `<span class="note ${s === 'approved' ? 'ok' : s === 'pending' ? 'warn' : 'bad'}" style="padding:3px 8px;margin:0">${esc(t(s === 'pending' ? 'st_wait' : 'st_' + s))}</span>`;
  VIEWS.myevents = async () => {
    const list = await api('GET', '/api/organizer/events');
    const tomorrow = new Date(Date.now() + 86400000); tomorrow.setMinutes(0, 0, 0);
    const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    app.innerHTML = `<h1>${esc(t('submit_title'))}</h1><p class="sub">${esc(S.me.club ? S.me.club.name : '')}</p><div class="grid"><form class="card" id="ef" novalidate>
      ${langFields('f', {})}<label for="fy">${esc(t('f_type'))}</label><select id="fy">${['tech', 'sports', 'creative', 'intellectual', 'social'].map((c) => `<option value="${c}">${esc(t('type_' + c))}</option>`).join('')}</select>
      <label for="fs">${esc(t('f_start'))}</label><input id="fs" type="datetime-local" value="${local}" min="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required>
      <div class="spread"><div style="flex:1"><label for="fd">${esc(t('f_duration'))}</label><input id="fd" type="number" min="15" max="720" value="120"></div><div style="flex:1"><label for="fc">${esc(t('f_capacity'))}</label><input id="fc" type="number" min="1" max="500" value="40"></div></div>
      ${imageField('fimg', null)}
      <label class="chk" style="margin-top:12px"><input type="checkbox" id="fopen"> ${esc(t('f_open'))}</label><p class="meta" style="margin:2px 0 0">${esc(t('f_open_hint'))}</p>
      <label>${esc(t('f_place'))}</label><div class="seg" role="group"><button type="button" data-pk="room" aria-pressed="true">${esc(t('place_campus'))}</button><button type="button" data-pk="venue" aria-pressed="false">${esc(t('place_city'))}</button></div>
      <div id="pk-room"><select id="fr" aria-label="${esc(t('f_place'))}" style="margin-top:8px"></select><div class="row" style="margin-top:6px"><button class="btn ghost small" type="button" id="frshow">🧭 ${esc(t('show_on_plan'))}</button><span class="meta" id="frinfo"></span></div></div>
      <div id="pk-venue" hidden><select id="fv" aria-label="${esc(t('place_city'))}" style="margin-top:8px"></select></div>
      <div id="ferr"></div><button class="btn" style="margin-top:12px">${esc(t('send_moderation'))}</button></form>
      <section class="card"><h2>${esc(t('my_submissions'))}</h2><ul class="list">${list.map((e) => `<li class="spread"><span><b>${esc(L(e, 'title'))}</b> ${langsOf(e).map((l) => `<span class="pill">${LANGNAME[l]}</span>`).join(' ')}<br><span class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))} · ${e.taken}/${e.capacity}</span>${e.comment ? `<br><span class="meta">${esc(e.comment)}</span>` : ''}</span>${statusPill(e.status)}</li>`).join('')}</ul></section>
      <section class="card" id="freebox"></section></div>`;
    // F21 Place: a free room on campus (availability for the chosen time) or a venue in the city
    let PK = 'room', ROOMS = [];
    const places = await api('GET', '/api/places');
    $('#fv').innerHTML = places.venues.map((v) => `<option value="${esc(v.id)}">${esc(placeName(v))}</option>`).join('');
    const why = (r) => (r.reason === 'lecture' ? t('busy_lecture', { from: time(r.from), to: time(r.to) }) : r.reason === 'requested' ? t('busy_requested', { title: r.title }) : t('busy_event', { title: r.title }));
    async function loadRooms() {
      const st = new Date($('#fs').value); if (isNaN(st)) return;
      try { ROOMS = await api('GET', `/api/rooms/availability?start=${encodeURIComponent(st.toISOString())}&minutes=${Number($('#fd').value) || 120}`); } catch (err) { return fail(err); }
      const keep = $('#fr').value, need = Number($('#fc').value) || 1;
      $('#fr').innerHTML = `<option value="">${esc(t('choose_room'))}</option>` + ROOMS.map((r) => `<option value="${esc(r.code)}" ${!r.free || r.capacity < need ? 'disabled' : ''}>${esc(roomName(r))} · ${esc(t('floor_n', { n: r.floor }))} · ${esc(t('seats_n', { n: r.capacity }))}${r.free ? (r.capacity < need ? ' — ' + esc(t('too_small')) : ' — ' + esc(t('room_free'))) : ' — ' + esc(why(r))}</option>`).join('');
      if (keep && ROOMS.find((r) => r.code === keep && r.free && r.capacity >= need)) $('#fr').value = keep;
      $('#frinfo').textContent = t('rooms_free_n', { n: ROOMS.filter((r) => r.free).length, all: ROOMS.length });
    }
    ['#fs', '#fd', '#fc'].forEach((id) => $(id).addEventListener('change', loadRooms));
    app.querySelectorAll('[data-pk]').forEach((b) => b.addEventListener('click', () => { PK = b.dataset.pk; app.querySelectorAll('[data-pk]').forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#pk-room').hidden = PK !== 'room'; $('#pk-venue').hidden = PK !== 'venue'; }));
    $('#frshow').addEventListener('click', () => { const r = ROOMS.find((x) => x.code === $('#fr').value) || ROOMS[0]; if (r) indoor(r, false); });
    await loadRooms();
    // Free rooms next to the form: "Use" fills the time and the room in the form
    const panel = freeRooms($('#freebox'), { start: $('#fs').value, minutes: $('#fd').value, onPick: async (r, start, minutes) => {
      $('#fs').value = start; $('#fd').value = minutes; app.querySelector('[data-pk="room"]').click(); await loadRooms();
      $('#fr').value = r.code; if ($('#fr').value !== r.code) toast(t('err_room_too_small')); else { toast(t('room_chosen', { room: roomName(r) })); const ti = app.querySelector('[data-lpane]:not([hidden]) input'); if (ti) ti.focus(); }
    } });
    ['#fs', '#fd'].forEach((id) => $(id).addEventListener('change', () => panel.set($('#fs').value, $('#fd').value)));
    const LF = bindLangFields(app, 'f'), IMGF = bindImageField(app, 'fimg');
    const FIELD = { place_required: 'fr', room_busy: 'fr', room_too_small: 'fc', invalid_start: 'fs', start_in_past: 'fs', invalid_duration: 'fd', invalid_capacity: 'fc', invalid_type: 'fy' };
    const clearErr = () => { app.querySelectorAll('.field-err').forEach((x) => x.remove()); app.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid')); $('#ferr').innerHTML = ''; };
    const showErr = (code, message) => {
      const el = FIELD[code] && $('#' + FIELD[code]);
      if (!el) { $('#ferr').innerHTML = `<p class="note bad" role="alert">${esc(message)}</p>`; return; }
      el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', el.id + '-err');
      const host = el.closest('div[style*="flex"]') ? el : el;
      host.insertAdjacentHTML('afterend', `<p class="field-err" id="${el.id}-err" role="alert">${esc(message)}</p>`); el.focus();
    };
    // Client-side checks first (same limits as the server), then the server confirms
    const check = () => {
      const num = (id) => Number($('#' + id).value), start = new Date($('#fs').value);
      const lb = LF.check(); if (lb) { FIELD.lang = lb.field; LMSG = lb.msg; return 'lang'; }
      if (PK === 'room' ? !$('#fr').value : !$('#fv').value) return 'place_required';
      if (isNaN(start)) return 'invalid_start';
      if (start <= new Date()) return 'start_in_past';
      if (!(num('fd') >= 15 && num('fd') <= 720)) return 'invalid_duration';
      if (!Number.isInteger(num('fc')) || num('fc') < 1 || num('fc') > 500) return 'invalid_capacity';
      return null;
    };
    let LMSG = '';
    app.querySelectorAll('#ef input,#ef textarea').forEach((x) => x.addEventListener('input', () => { if (x.getAttribute('aria-invalid')) clearErr(); }));
    $('#ef').addEventListener('submit', async (ev) => {
      ev.preventDefault(); clearErr();
      const bad = check(); if (bad) return showErr(bad, bad === 'lang' ? LMSG : t('err_' + bad));
      const body = { i18n: LF.read(), type: $('#fy').value, roomCode: PK === 'room' ? $('#fr').value : undefined, venueId: PK === 'venue' ? $('#fv').value : undefined, startsAt: new Date($('#fs').value).toISOString(), durationMinutes: Number($('#fd').value), capacity: Number($('#fc').value), open: $('#fopen').checked, image: IMGF.get() || undefined };
      await act(ev.submitter || $('#ef button'), async () => { try { await api('POST', '/api/events', body); toast(t('submitted')); render(); } catch (err) { showErr(err.code, err.message); } });
    });
  };

  // ---------- W08 Check-in: QR code or manual list (FR-14, FR-15) ----------
  VIEWS.checkin = async () => {
    const all = await api('GET', '/api/organizer/events');
    const list = all.filter((e) => e.status === 'approved' && !e.open && new Date(e.endsAt) > new Date(Date.now() - 86400000));
    if (!S.ci || !list.find((e) => e.id === S.ci)) S.ci = (list.find((e) => new Date(e.endsAt) > new Date()) || list[0] || {}).id;
    app.innerHTML = `<h1>${esc(t('checkin_title'))}</h1><p class="sub">${esc(t('checkin_sub'))}</p><div class="grid"><section class="card">
      <label for="ce">${esc(t('choose_event'))}</label><select id="ce">${list.map((e) => `<option value="${e.id}" ${e.id === S.ci ? 'selected' : ''}>${esc(L(e, 'title'))} · ${esc(dateLong(e.startsAt))} ${esc(time(e.startsAt))}</option>`).join('')}</select>
      <label for="cc">${esc(t('ticket_code'))}</label><input id="cc" placeholder="CP-…" autocomplete="off"><div class="row"><button class="btn" id="cgo">${esc(t('check'))}</button><button class="btn ghost" id="scan">${esc(t('scan'))}</button><label class="btn ghost" style="margin:0;color:var(--accent)">${esc(t('scan_photo'))}<input id="photo" type="file" accept="image/*" capture="environment" hidden></label></div>
      <video id="cam" playsinline muted style="width:100%;border-radius:10px;margin-top:10px;display:none"></video><div id="cres"></div></section>
      <section class="card"><h2>${esc(t('participants'))}</h2><input id="pq" type="search" placeholder="${esc(t('search_people'))}" aria-label="${esc(t('search_people'))}"><ul class="list" id="pl"></ul></section></div>`;
    let people = [];
    const drawPeople = () => { const q = ($('#pq').value || '').toLowerCase(); $('#pl').innerHTML = people.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.studentId).includes(q)).map((p) => `<li class="spread"><span>${esc(p.name)}<br><span class="meta">ID ${esc(p.studentId)}${p.method ? ' · ' + esc(t(p.method === 'qr' ? 'method_qr' : 'method_manual')) : ''}</span></span>${p.status === 'checked_in' ? `<span class="note ok" style="margin:0;padding:3px 8px">✓ ${esc(t('checked_in'))}</span>` : `<button class="btn small ghost" data-man="${p.id}">${esc(t('check'))}</button>`}</li>`).join(''); app.querySelectorAll('[data-man]').forEach((b) => b.addEventListener('click', () => doCheck({ registrationId: Number(b.dataset.man) }, b))); };
    const loadPeople = async () => { if (!S.ci) return; people = await api('GET', `/api/events/${S.ci}/participants`); drawPeople(); };
    async function doCheck(extra, btn) {
      if ('ticketCode' in extra && !String(extra.ticketCode || '').trim()) { $('#cres').innerHTML = `<p class="note warn" role="alert">${esc(t('enter_code'))}</p>`; $('#cc').focus(); return; }
      return act(btn, async () => { try { const r = await api('POST', '/api/checkin', { eventId: S.ci, ...extra }); $('#cres').innerHTML = `<p class="note ok" role="status">${esc(t('checked_ok', { name: r.name, id: r.studentId, coins: r.coins }))}</p>`; $('#cc').value = ''; loadPeople(); }
      catch (err) { $('#cres').innerHTML = `<p class="note bad" role="alert">${esc(err.message)}</p>`; } });
    }
    $('#ce').addEventListener('change', (e) => { S.ci = Number(e.target.value); $('#cres').innerHTML = ''; loadPeople(); });
    $('#cgo').addEventListener('click', (ev) => doCheck({ ticketCode: $('#cc').value }, ev.currentTarget));
    $('#cc').addEventListener('keydown', (e) => { if (e.key === 'Enter') doCheck({ ticketCode: $('#cc').value }); });
    $('#pq').addEventListener('input', drawPeople);
    const msg = (k, cls = 'warn') => { $('#cres').innerHTML = `<p class="note ${cls}" role="alert">${esc(t(k))}</p>`; };
    bindScanner((code) => { $('#cc').value = code; doCheck({ ticketCode: code }); }, msg);
    loadPeople();
  };

  // QR scanning shared by Check-in and the merch check-out: needs #scan, #photo and #cam on the screen
  function bindScanner(onCode, msg) {
    // QR scanning: the browser's BarcodeDetector if available, otherwise the jsQR library (Apache-2.0).
    const loadJsQR = () => window.jsQR ? Promise.resolve() : new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; sc.onload = ok; sc.onerror = () => no(Object.assign(new Error('lib'), { name: 'LibError' })); document.head.appendChild(sc); });
    async function decoder() {
      if ('BarcodeDetector' in window) { try { const det = new BarcodeDetector({ formats: ['qr_code'] }); return async (src) => { const c = await det.detect(src).catch(() => []); return c.length ? c[0].rawValue : null; }; } catch { /* fall back to jsQR */ } }
      await loadJsQR();
      const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
      return async (src) => { const w = src.videoWidth || src.width, h = src.videoHeight || src.height; if (!w) return null; cv.width = w; cv.height = h; ctx.drawImage(src, 0, 0, w, h); const img = ctx.getImageData(0, 0, w, h); const r = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' }); return r ? r.data : null; };
    }
    const explain = (e) => msg(e && e.name === 'NotAllowedError' ? 'scan_denied' : e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') ? 'scan_nocam' : e && e.name === 'LibError' ? 'scan_lib' : e && e.name === 'NotReadableError' ? 'scan_busy' : 'scan_unsupported');
    $('#scan').addEventListener('click', async () => {
      if (!window.isSecureContext) return msg('scan_https');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return msg('scan_unsupported');
      let stream;
      try {
        const detect = await decoder();
        const v = $('#cam'); stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        v.srcObject = stream; v.style.display = 'block'; await v.play(); msg('scan_hint', 'info');
        const stop = () => { stream.getTracks().forEach((x) => x.stop()); v.style.display = 'none'; };
        const started = Date.now();
        const tick = async () => {
          if (!document.body.contains(v)) return stop();
          if (Date.now() - started > 60000) { stop(); return msg('scan_timeout'); }
          const code = await detect(v);
          if (code) { stop(); onCode(code); } else setTimeout(tick, 200);
        };
        tick();
      } catch (e) { if (stream) stream.getTracks().forEach((x) => x.stop()); explain(e); }
    });
    // Alternative without live video: take or choose a photo of the QR code
    $('#photo').addEventListener('change', async (ev) => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      try { const detect = await decoder(); const bmp = await createImageBitmap(f); const code = await detect(bmp); ev.target.value = '';
        if (code) onCode(code); else msg('scan_notfound'); }
      catch (e) { explain(e); }
    });
  }

  // ---------- W09 Moderator: moderation, statistics, roles (FR-12, FR-13, FR-18, FR-20) ----------
  VIEWS.moderation = async () => {
    const [ev, req] = await Promise.all([api('GET', '/api/admin/pending-events'), api('GET', '/api/admin/club-requests')]);
    app.innerHTML = `<h1>${esc(t('moderation_title'))}</h1><section class="card"><div class="tablewrap"><table class="stack"><thead><tr><th>${esc(t('th_event'))}</th><th>${esc(t('th_club'))}</th><th>${esc(t('th_date'))}</th><th>${esc(t('th_seats'))}</th><th>${esc(t('th_action'))}</th></tr></thead><tbody>
      ${ev.map((e) => `<tr><td data-label="${esc(t('th_event'))}"><span class="cellbox"><b>${esc(L(e, 'title'))}</b><br><span class="meta">${esc(L(e, 'location'))}</span><br>${langsOf(e).map((l) => `<span class="pill">${LANGNAME[l]}</span>`).join(' ')}</span></td><td data-label="${esc(t('th_club'))}">${esc(clubName(e))}</td><td data-label="${esc(t('th_date'))}">${esc(dateLong(e.startsAt))} ${esc(time(e.startsAt))}</td><td data-label="${esc(t('th_seats'))}">${e.capacity}</td><td><div class="row" style="margin:0"><button class="btn small" data-ok="${e.id}">${esc(t('approve'))}</button><button class="btn small danger" data-no="${e.id}">${esc(t('reject'))}</button></div></td></tr>`).join('') || `<tr><td colspan="5" class="meta">${esc(t('nothing_pending'))}</td></tr>`}</tbody></table></div></section>
      <h2 style="margin-top:22px">${esc(t('club_requests'))}</h2><section class="card"><ul class="list">${req.map((r) => `<li class="spread"><span><b>${esc(r.name)}</b> (ID ${esc(r.studentId)}) → ${esc(clubName(r))}${r.message ? `<br><span class="meta">${esc(r.message)}</span>` : ''}</span><span class="row" style="margin:0"><button class="btn small" data-acc="${r.userId}:${r.clubId}">${esc(t('accept'))}</button><button class="btn small danger" data-dec="${r.userId}:${r.clubId}">${esc(t('decline'))}</button></span></li>`).join('') || `<li class="meta">${esc(t('nothing_pending'))}</li>`}</ul></section>
      <section class="card" id="freebox" style="margin-top:22px"></section>`;
    freeRooms($('#freebox'));
    const decide = (id, decision, comment, btn) => act(btn, async () => { try { await api('POST', `/api/admin/events/${id}/decision`, { decision, comment }); render(); } catch (err) { fail(err); } });
    app.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.ok, 'approve', '', b)));
    app.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => modal(`<h2>${esc(t('reject'))}</h2><label for="rr">${esc(t('reject_reason'))}</label><textarea id="rr" rows="3" maxlength="500" aria-describedby="rr-err"></textarea><p class="field-err" id="rr-err" hidden></p><div class="row"><button class="btn danger" id="rgo">${esc(t('reject'))}</button></div>`, (root, close) => {
      $('#rgo', root).addEventListener('click', () => { const v = $('#rr', root).value.trim(); if (v.length < 5) { const e = $('#rr-err', root); e.hidden = false; e.textContent = t('err_comment_required'); $('#rr', root).setAttribute('aria-invalid', 'true'); $('#rr', root).focus(); return; } close(); decide(b.dataset.no, 'reject', v, b); }); })));
    const club = (v, decision, btn) => act(btn, async () => { const [userId, clubId] = v.split(':').map(Number); try { await api('POST', '/api/admin/club-requests/decision', { userId, clubId, decision }); render(); } catch (err) { fail(err); } });
    app.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => club(b.dataset.acc, 'accept', b)));
    app.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', async () => { if (await confirmBox(t('decline') + '?', t('decline'))) club(b.dataset.dec, 'decline', b); }));
  };
  VIEWS.stats = async () => {
    const s = await api('GET', '/api/admin/stats');
    app.innerHTML = `<h1>${esc(t('stats_title'))}</h1><div class="kpis">${[['t_clubs', s.totals.clubs], ['t_events', s.totals.approvedEvents], ['t_regs', s.totals.registrations], ['t_pending', s.totals.pending], ['t_complaints', s.totals.complaints], ['t_shop', s.totals.shopStudents]].filter((x) => x[1] !== undefined).map(([k, v]) => `<div class="card kpi"><b>${v}</b><span>${esc(t(k))}</span></div>`).join('')}</div>
      <section class="card tablewrap"><table class="stack"><thead><tr><th>${esc(t('th_event'))}</th><th>${esc(t('th_date'))}</th><th>${esc(t('th_seats'))}</th><th>${esc(t('th_fill'))}</th><th>${esc(t('th_wait'))}</th><th>${esc(t('th_checked'))}</th><th>${esc(t('th_rating'))}</th></tr></thead><tbody>
      ${s.events.map((e) => `<tr><td data-label="${esc(t('th_event'))}"><b>${esc(L(e, 'title'))}</b></td><td data-label="${esc(t('th_date'))}">${esc(dateLong(e.startsAt))}</td><td data-label="${esc(t('th_seats'))}">${e.registered}/${e.capacity}</td><td data-label="${esc(t('th_fill'))}"><div class="bar" style="width:90px;margin:0;display:inline-block;vertical-align:middle"><i style="width:${Math.min(100, e.fillRate)}%"></i></div> ${e.fillRate}%</td><td data-label="${esc(t('th_wait'))}">${e.waitlist}</td><td data-label="${esc(t('th_checked'))}">${e.checkedIn}</td><td data-label="${esc(t('th_rating'))}">${e.avgRating ?? '—'}</td></tr>`).join('')}</tbody></table></section>`;
  };
  // ---------- FR-28 … FR-33 Merch shop: student buys a 5% / 10% voucher with Campus Coins ----------
  const VST = { active: 'ok', used: 'info', expired: 'warn', cancelled: 'warn' };
  const money = (n) => Number(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ') + ' ₸';
  VIEWS.shop = async () => {
    const sh = await api('GET', '/api/shop'), active = sh.vouchers.find((v) => v.status === 'active');
    app.innerHTML = `<h1>🛍 ${esc(t('shop_title'))}</h1><p class="sub">${esc(t('shop_sub'))}</p>
      <div class="grid"><section class="card"><h2>${esc(t('coins'))}</h2><div class="kpi"><b>${sh.balance}</b><span>${esc(t('coins_expire', { date: dateLong(sh.coinsExpireAt) + ' ' + new Date(sh.coinsExpireAt).getFullYear() }))}</span></div>
        <ul class="list" style="margin-top:8px">${['shop_r1', 'shop_r2', 'shop_r3', 'shop_r4'].map((k) => `<li class="meta">${esc(t(k, { max: money(sh.maxDiscount), days: sh.validDays }))}</li>`).join('')}</ul></section>
      ${sh.offers.map((o) => `<section class="card offer"><div class="big">${o.pct}%</div><h2>${esc(t('shop_offer', { pct: o.pct }))}</h2><p class="meta">${esc(t('shop_cost', { n: o.coins, max: money(sh.maxDiscount) }))}</p>
        <button class="btn" data-buy="${o.pct}" ${active || sh.balance < o.coins ? 'disabled' : ''}>${esc(t('shop_buy', { n: o.coins }))}</button>${active ? `<p class="meta">${esc(t('shop_one'))}</p>` : sh.balance < o.coins ? `<p class="meta">${esc(t('shop_need', { n: o.coins - sh.balance }))}</p>` : ''}</section>`).join('')}</div>
      ${active ? `<section class="card ticket" style="margin-top:14px;max-width:420px"><h2>${esc(t('shop_active'))}</h2><div class="qr" data-qr="${esc(active.code)}"></div><p class="code">${esc(active.code)}</p><p><b>${active.pct}%</b> · ${esc(t('shop_until', { date: dateLong(active.expiresAt) + ', ' + time(active.expiresAt) }))}</p><p class="meta">${esc(t('shop_show'))}</p><button class="btn danger small" data-vcancel="${active.id}">${esc(t('shop_cancel', { n: active.coins }))}</button></section>` : ''}
      <h2 style="margin-top:22px">${esc(t('shop_history'))}</h2><section class="card">${sh.vouchers.length ? `<ul class="list">${sh.vouchers.map((v) => `<li class="spread"><span><b>${esc(v.code)}</b> · ${v.pct}%<br><span class="meta">${esc(dateLong(v.createdAt))}${v.status === 'used' ? ' · ' + esc(t('shop_saved', { d: money(v.discount), a: money(v.amount) })) : ''}</span></span><span class="note ${VST[v.status]}" style="margin:0;padding:3px 8px">${esc(t('vst_' + v.status))}</span></li>`).join('')}</ul>` : `<p class="meta">${esc(t('shop_none'))}</p>`}</section>`;
    app.querySelectorAll('[data-qr]').forEach((el) => { try { new QRCode(el, { text: el.dataset.qr, width: 176, height: 176, colorDark: '#0f172a', colorLight: '#ffffff' }); } catch { el.textContent = el.dataset.qr; } });
    app.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', async () => { const o = sh.offers.find((x) => String(x.pct) === b.dataset.buy); if (!(await confirmBox(t('shop_confirm', { n: o.coins, pct: o.pct }), t('shop_buy', { n: o.coins })))) return; act(b, async () => { try { await api('POST', '/api/shop/vouchers', { pct: o.pct }); toast(t('shop_bought')); render(); } catch (err) { fail(err); } }); }));
    app.querySelectorAll('[data-vcancel]').forEach((b) => b.addEventListener('click', async () => { if (!(await confirmBox(t('shop_cancel_q'), t('yes_cancel')))) return; act(b, async () => { try { await api('DELETE', `/api/shop/vouchers/${b.dataset.vcancel}`); render(); } catch (err) { fail(err); } }); }));
  };
  // FR-31 Cashier of the merch shop: scan the voucher, type the purchase amount, see the discount, confirm
  VIEWS.checkout = async () => {
    const red = await api('GET', '/api/shop/redemptions');
    app.innerHTML = `<h1>🛍 ${esc(t('co_title'))}</h1><p class="sub">${esc(t('co_sub'))}</p><div class="grid"><section class="card">
      <label for="cc">${esc(t('co_code'))}</label><input id="cc" placeholder="MERCH-…" autocomplete="off"><div class="row"><button class="btn ghost" id="scan">${esc(t('scan'))}</button><label class="btn ghost" style="margin:0;color:var(--accent)">${esc(t('scan_photo'))}<input id="photo" type="file" accept="image/*" capture="environment" hidden></label></div>
      <video id="cam" playsinline muted style="width:100%;border-radius:10px;margin-top:10px;display:none"></video>
      <label for="camt">${esc(t('co_amount'))}</label><input id="camt" type="number" min="1" max="1000000" inputmode="numeric" placeholder="15000">
      <div class="row"><button class="btn" id="cchk">${esc(t('co_check'))}</button></div><div id="cres"></div></section>
      <section class="card"><h2>${esc(t('co_done'))}</h2><div class="kpis" style="margin:0 0 8px"><div class="kpi"><b>${red.totals.used}</b><span>${esc(t('co_used'))}</span></div><div class="kpi"><b>${red.totals.students}</b><span>${esc(t('co_students'))}</span></div><div class="kpi"><b>${money(red.totals.discount)}</b><span>${esc(t('co_discount'))}</span></div></div>
        <ul class="list">${red.items.map((v) => `<li class="spread"><span><b>${esc(v.student)}</b> · ${v.pct}%<br><span class="meta">${esc(v.code)} · ${esc(dateLong(v.usedAt))}, ${esc(time(v.usedAt))}</span></span><span>−${money(v.discount)}</span></li>`).join('') || `<li class="meta">—</li>`}</ul></section></div>`;
    const msg = (k, cls = 'warn') => { $('#cres').innerHTML = `<p class="note ${cls}" role="alert">${esc(t(k))}</p>`; };
    const check = (btn) => act(btn, async () => {
      const code = $('#cc').value.trim(), amount = Number($('#camt').value);
      if (!code) { msg('co_need_code'); $('#cc').focus(); return; }
      if (!Number.isInteger(amount) || amount < 1) { msg('err_invalid_amount'); $('#camt').focus(); return; }
      try {
        const r = await api('POST', '/api/shop/redeem', { code, amount });
        $('#cres').innerHTML = `<div class="note info"><b>${esc(r.student)}</b> · ${esc(r.code)} · ${r.pct}%<br>${esc(t('co_sum', { a: money(r.amount), d: money(r.discount), p: money(r.toPay) }))}</div><div class="row"><button class="btn" id="cconf">✓ ${esc(t('co_confirm', { p: money(r.toPay) }))}</button></div>`;
        $('#cconf').addEventListener('click', (ev) => act(ev.currentTarget, async () => { try { await api('POST', '/api/shop/redeem', { code, amount, confirm: true }); toast(t('co_ok')); render(); } catch (err) { $('#cres').innerHTML = `<p class="note bad" role="alert">${esc(err.message)}</p>`; } }));
      } catch (err) { $('#cres').innerHTML = `<p class="note bad" role="alert">${esc(err.message)}</p>`; }
    });
    $('#cchk').addEventListener('click', (ev) => check(ev.currentTarget));
    $('#camt').addEventListener('keydown', (e) => { if (e.key === 'Enter') check($('#cchk')); });
    bindScanner((code) => { $('#cc').value = code; $('#camt').focus(); }, msg);
  };

  // ---------- Administration (administrator only): complaints, events, clubs, users — FR-40 … FR-45 ----------
  const cstPill = (st) => `<span class="note ${st === 'new' ? 'bad' : st === 'in_review' ? 'warn' : st === 'resolved' ? 'ok' : 'info'}" style="margin:0;padding:3px 8px;display:inline-block;font-size:12px;font-weight:700">${esc(t('cst_' + st))}</span>`;
  const estPill = (st) => `<span class="note ${st === 'approved' ? 'ok' : st === 'pending' ? 'warn' : st === 'rejected' ? 'bad' : 'info'}" style="margin:0;padding:3px 8px;display:inline-block;font-size:12px;font-weight:700">${esc(t('est_' + st))}</span>`;
  const TYPESL = ['tech', 'sports', 'creative', 'intellectual', 'social'];
  VIEWS.admin = async () => {
    const tab = (/[?&]tab=(\w+)/.exec(location.hash) || [])[1] || S.adminTab || 'complaints'; S.adminTab = tab;
    const TABS = [['complaints', 'tab_complaints'], ['events', 'tab_events'], ['clubs', 'tab_clubs'], ['users', 'tab_users'], ['db', 'nav_db']];
    app.innerHTML = `<h1>${esc(t('admin_title'))}</h1><p class="sub">${esc(t('admin_sub'))}</p>
      <div class="seg" role="tablist" style="margin-bottom:14px;flex-wrap:wrap">${TABS.map(([k, l]) => `<button role="tab" data-atab="${k}" aria-selected="${tab === k}" aria-pressed="${tab === k}">${esc(t(l))}</button>`).join('')}</div><div id="apanel"><p class="meta">${esc(t('loading'))}</p></div>`;
    app.querySelectorAll('[data-atab]').forEach((b) => b.addEventListener('click', () => { S.adminTab = b.dataset.atab; history.replaceState(null, '', '#/admin?tab=' + b.dataset.atab); render(); }));
    await ADMIN[tab]($('#apanel'));
  };
  const ADMIN = {
    db: (box) => VIEWS.db(box),
    async complaints(box) {
      const list = await api('GET', '/api/admin/complaints');
      if (!list.length) { box.innerHTML = `<p class="note ok">${esc(t('no_complaints'))}</p>`; return; }
      box.innerHTML = `<div class="grid">${list.map((c) => `<section class="card" data-c="${c.id}"><div class="spread"><span class="pill">#${c.id} · ${esc(t('target_' + c.targetType))}</span>${cstPill(c.status)}</div>
        <h3 style="margin:8px 0 2px">${esc(c.targetTitle || '—')}</h3><p class="meta" style="margin:0">${esc(t('reason_' + c.reason))} · ${esc(dateLong(c.createdAt))}, ${esc(time(c.createdAt))}</p>
        <p style="font-size:14px">“${esc(c.text)}”</p><p class="meta">${esc(t('c_from'))}: ${esc(c.fromName)} (${esc(c.fromEmail)})${c.handledBy ? ' · ' + esc(t('c_handled', { name: c.handledBy })) : ''}</p>
        <label for="cs-${c.id}">${esc(t('c_status'))}</label><select id="cs-${c.id}">${['in_review', 'resolved', 'rejected'].map((st) => `<option value="${st}" ${c.status === st ? 'selected' : ''}>${esc(t('cst_' + st))}</option>`).join('')}</select>
        <label for="cc-${c.id}">${esc(t('c_answer'))}</label><textarea id="cc-${c.id}" rows="2" maxlength="500" aria-describedby="ch-${c.id}">${esc(c.comment || '')}</textarea><p class="meta" id="ch-${c.id}" style="margin:2px 0 0">${esc(t('c_answer_hint'))}</p>
        <div class="row"><button class="btn small" data-csave="${c.id}">${esc(t('save'))}</button>${c.targetType === 'event' ? `<button class="btn ghost small" data-cedit="${c.targetId}">✏️ ${esc(t('ev_edit'))}</button>` : `<button class="btn ghost small" data-cclub="${c.targetId}">✏️ ${esc(t('club_edit'))}</button>`}</div></section>`).join('')}</div>`;
      box.querySelectorAll('[data-csave]').forEach((b) => b.addEventListener('click', () => act(b, async () => {
        const id = b.dataset.csave; try { await api('PUT', `/api/admin/complaints/${id}`, { status: $('#cs-' + id).value, comment: $('#cc-' + id).value }); toast(t('saved')); render(); } catch (err) { fail(err); }
      })));
      box.querySelectorAll('[data-cedit]').forEach((b) => b.addEventListener('click', async () => { const all = await api('GET', '/api/admin/events'); const e = all.find((x) => String(x.id) === b.dataset.cedit); if (e) editEvent(e); }));
      box.querySelectorAll('[data-cclub]').forEach((b) => b.addEventListener('click', async () => { const all = await api('GET', '/api/clubs'); const c = all.find((x) => String(x.id) === b.dataset.cclub); if (c) editClub(c); }));
    },
    async events(box) {
      const list = await api('GET', '/api/admin/events');
      box.innerHTML = `<input id="aq" type="search" placeholder="${esc(t('search_events'))}" aria-label="${esc(t('search_events'))}" value="${esc(S.adminQ || '')}"><section class="card tablewrap" style="margin-top:10px"><table class="stack"><thead><tr><th>${esc(t('th_event'))}</th><th>${esc(t('th_club'))}</th><th>${esc(t('th_date'))}</th><th>${esc(t('th_seats'))}</th><th>${esc(t('f_status'))}</th><th></th></tr></thead><tbody id="arows"></tbody></table></section>`;
      const draw = () => { const k = (S.adminQ || '').toLowerCase(); $('#arows').innerHTML = list.filter((e) => !k || (L(e, 'title') + ' ' + e.title + ' ' + e.club).toLowerCase().includes(k)).map((e) => `<tr><td data-label="${esc(t('th_event'))}"><span class="cellbox"><b>${esc(L(e, 'title'))}</b><br>${langsOf(e).map((l) => `<span class="pill">${LANGNAME[l]}</span>`).join(' ')}</span></td><td data-label="${esc(t('th_club'))}">${esc(clubName(e))}</td><td data-label="${esc(t('th_date'))}">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))}</td><td data-label="${esc(t('th_seats'))}">${e.taken}/${e.capacity}</td><td data-label="${esc(t('f_status'))}">${estPill(e.status)}</td><td><button class="btn small" data-eedit="${e.id}">✏️ ${esc(t('ev_edit'))}</button></td></tr>`).join(''); $('#arows').querySelectorAll('[data-eedit]').forEach((b) => b.addEventListener('click', () => editEvent(list.find((x) => String(x.id) === b.dataset.eedit)))); };
      $('#aq').addEventListener('input', (ev) => { S.adminQ = ev.target.value; draw(); }); draw();
    },
    async clubs(box) {
      const list = await api('GET', '/api/clubs');
      box.innerHTML = `<div class="row" style="margin-top:0"><button class="btn" id="cadd">＋ ${esc(t('club_add'))}</button></div><section class="card tablewrap" style="margin-top:10px"><table class="stack"><thead><tr><th>${esc(t('f_name'))}</th><th>${esc(t('f_category'))}</th><th>${esc(t('f_room'))}</th><th></th></tr></thead><tbody>${list.map((c) => `<tr><td data-label="${esc(t('f_name'))}"><b>${esc(L(c, 'name'))}</b><br><span class="meta">${esc(t('members_n', { n: c.members }))}</span></td><td data-label="${esc(t('f_category'))}">${esc(t('type_' + c.category))}</td><td data-label="${esc(t('f_room'))}">${esc(L(c, 'room'))}</td><td><button class="btn small" data-cedit="${c.id}">✏️ ${esc(t('club_edit'))}</button></td></tr>`).join('')}</tbody></table></section>`;
      $('#cadd').addEventListener('click', () => editClub(null));
      box.querySelectorAll('[data-cedit]').forEach((b) => b.addEventListener('click', () => editClub(list.find((x) => String(x.id) === b.dataset.cedit))));
    },
    async users(box) {
      const clubs = await api('GET', '/api/clubs');
      const opts = clubs.map((c) => `<option value="${c.id}">${esc(L(c, 'name'))}</option>`).join('');
      box.innerHTML = `<section class="card" style="margin-bottom:14px"><div class="spread"><span><b>${esc(t('reset_title'))}</b><br><span class="meta">${esc(t('reset_sub'))}</span></span><button class="btn danger small" id="reset">${esc(t('reset_btn'))}</button></div></section>
        <input id="uq" type="search" placeholder="${esc(t('users_search'))}" aria-label="${esc(t('users_search'))}" value="${esc(S.userQ || '')}"><p class="meta">${esc(t('users_hint'))}</p>
        <section class="card tablewrap"><table class="stack"><thead><tr><th>${esc(t('th_name'))}</th><th>${esc(t('th_role'))}</th><th>${esc(t('th_club'))}</th><th></th></tr></thead><tbody id="urows"></tbody></table></section>`;
      $('#reset').addEventListener('click', async (ev) => { const btn = ev.currentTarget; if (!(await confirmBox(t('reset_confirm'), t('reset_btn')))) return; await act(btn, async () => { try { await api('POST', '/api/admin/reset', {}); S.me = null; toast(t('reset_done')); go('signin'); } catch (err) { fail(err); } }); });
      const load = async () => {
        const users = await api('GET', '/api/admin/users' + (S.userQ ? '?q=' + encodeURIComponent(S.userQ) : ''));
        $('#urows').innerHTML = users.map((u) => `<tr data-u="${u.id}"><td data-label="${esc(t('th_name'))}"><span class="cellbox"><input class="n" value="${esc(u.name)}" aria-label="${esc(t('th_name'))}" maxlength="80"><span class="meta">${esc(u.email)}${u.telegram ? ' · ✈️ ' + esc(t('tg_linked')) : ''}</span></span></td><td data-label="${esc(t('th_role'))}"><select class="r" aria-label="${esc(t('th_role'))}" ${u.id === S.me.id ? 'disabled' : ''}>${['student', 'organizer', 'moderator', 'admin', 'shop'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${esc(t('role_' + r))}</option>`).join('')}</select></td><td data-label="${esc(t('th_club'))}"><select class="c" aria-label="${esc(t('th_club'))}">${opts}</select></td><td><button class="btn small">${esc(t('save'))}</button></td></tr>`).join('');
        $('#urows').querySelectorAll('tr[data-u]').forEach((row) => {
          const u = users.find((x) => String(x.id) === row.dataset.u); if (u.clubId) row.querySelector('.c').value = u.clubId;
          const sync = () => { row.querySelector('.c').disabled = row.querySelector('.r').value !== 'organizer'; }; sync(); row.querySelector('.r').addEventListener('change', sync);
          row.querySelector('button').addEventListener('click', (ev) => act(ev.currentTarget, async () => { try { await api('PUT', `/api/admin/users/${u.id}`, { name: row.querySelector('.n').value, role: row.querySelector('.r').value, clubId: Number(row.querySelector('.c').value) }); toast(t('saved')); } catch (err) { fail(err); } }));
        });
      };
      $('#uq').addEventListener('input', (ev) => { S.userQ = ev.target.value; clearTimeout(S.uqT); S.uqT = setTimeout(load, 250); });
      await load();
    }
  };
  // Picture upload: the photo is cut to 16:9 and compressed in the browser (JPEG, about 60 KB), so no file server is needed
  function imageField(id, current) {
    return `<label for="${id}">${esc(t('f_image'))}</label><div class="imgbox"><img id="${id}-prev" class="cover" src="${esc(current || '')}" alt="" ${current ? '' : 'hidden'}>
      <div class="row" style="margin-top:6px"><label class="btn ghost small" style="margin:0">📷 ${esc(t('img_choose'))}<input id="${id}" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><button type="button" class="btn ghost small" id="${id}-del" ${current ? '' : 'hidden'}>✕ ${esc(t('img_remove'))}</button></div><p class="meta" style="margin:4px 0 0">${esc(t('img_hint'))}</p></div>`;
  }
  function bindImageField(root, id) {
    let value; // undefined = not changed, null = removed, string = new picture
    const prev = $('#' + id + '-prev', root), del = $('#' + id + '-del', root);
    $('#' + id, root).addEventListener('change', async (ev) => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      try {
        const bmp = await createImageBitmap(f), W = 960, H = 540, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const k = Math.max(W / bmp.width, H / bmp.height), w = bmp.width * k, h = bmp.height * k;
        cv.getContext('2d').drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
        let q = 0.78, url = cv.toDataURL('image/jpeg', q); while (url.length > 140000 && q > 0.35) { q -= 0.1; url = cv.toDataURL('image/jpeg', q); }
        value = url; prev.src = url; prev.hidden = false; del.hidden = false;
      } catch { toast(t('err_invalid_image')); }
      ev.target.value = '';
    });
    del.addEventListener('click', () => { value = null; prev.hidden = true; del.hidden = true; });
    return { get: () => value };
  }

  // Language tabs for texts in EN / KK / RU (event form and event editor) — FR-39
  function langFields(prefix, values, opts = {}) {
    const first = opts.first || S.lang;
    return `<fieldset class="langbox"><legend>${esc(t('lang_tabs'))}</legend><div class="seg" role="tablist" aria-label="${esc(t('lang_tabs'))}">${['en', 'kk', 'ru'].map((l) => `<button type="button" role="tab" data-ltab="${l}" aria-pressed="${l === first}" aria-selected="${l === first}">${LANGNAME[l]} <span class="lmark" data-lmark="${l}"></span></button>`).join('')}</div>
      ${['en', 'kk', 'ru'].map((l) => `<div data-lpane="${l}" ${l === first ? '' : 'hidden'}><label for="${prefix}t-${l}">${esc(t('f_title'))} (${LANGNAME[l]})</label><input id="${prefix}t-${l}" maxlength="120" lang="${l}" value="${esc((values[l] || {}).title || '')}">
        <label for="${prefix}d-${l}">${esc(t('f_desc'))} (${LANGNAME[l]})</label><textarea id="${prefix}d-${l}" rows="4" maxlength="1000" lang="${l}">${esc((values[l] || {}).description || '')}</textarea>
        <div class="row" style="margin-top:4px">${['en', 'kk', 'ru'].filter((x) => x !== l).map((x) => `<button type="button" class="btn ghost small" data-copy="${x}>${l}">⧉ ${esc(t('copy_from', { lang: LANGNAME[x] }))}</button>`).join('')}</div></div>`).join('')}
      <p class="meta" style="margin:6px 0 0">${esc(t('lang_hint'))}</p></fieldset>`;
  }
  function bindLangFields(root, prefix) {
    const mark = () => ['en', 'kk', 'ru'].forEach((l) => { const full = $('#' + prefix + 't-' + l, root).value.trim() && $('#' + prefix + 'd-' + l, root).value.trim(); $(`[data-lmark="${l}"]`, root).textContent = full ? '✓' : ''; $(`[data-lmark="${l}"]`, root).setAttribute('aria-label', full ? t('lang_filled') : ''); });
    const show = (l) => { root.querySelectorAll('[data-ltab]').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.ltab === l); b.setAttribute('aria-selected', b.dataset.ltab === l); }); root.querySelectorAll('[data-lpane]').forEach((p) => { p.hidden = p.dataset.lpane !== l; }); };
    root.querySelectorAll('[data-ltab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.ltab)));
    root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => { const [from, to] = b.dataset.copy.split('>'); ['t', 'd'].forEach((k) => { const src = $('#' + prefix + k + '-' + from, root).value; if (src) $('#' + prefix + k + '-' + to, root).value = src; }); mark(); }));
    root.querySelectorAll('[data-lpane] input, [data-lpane] textarea').forEach((x) => x.addEventListener('input', mark)); mark();
    // Collect and check: every started language must be complete; at least one language
    return {
      show,
      read: () => Object.fromEntries(['en', 'kk', 'ru'].map((l) => [l, { title: $('#' + prefix + 't-' + l, root).value.trim(), description: $('#' + prefix + 'd-' + l, root).value.trim() }]).filter(([, v]) => v.title || v.description)),
      check() {
        const v = this.read(), ls = Object.keys(v);
        if (!ls.length) return { field: prefix + 't-' + (root.querySelector('[data-ltab][aria-pressed="true"]') || { dataset: { ltab: 'en' } }).dataset.ltab, msg: t('err_no_language') };
        for (const l of ls) {
          if (v[l].title.length < 3 || v[l].title.length > 120) { show(l); return { field: prefix + 't-' + l, msg: t('err_title_lang', { lang: LANGNAME[l] }) }; }
          if (v[l].description.length < 10) { show(l); return { field: prefix + 'd-' + l, msg: t('err_desc_lang', { lang: LANGNAME[l] }) }; }
        }
        return null;
      }
    };
  }
  const toLocalInput = (iso) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  function eventLangValues(e) { const v = {}, i = e.i18n || {}; for (const l of ['en', 'kk', 'ru']) if (i[l] && (i[l].title || i[l].description)) v[l] = { title: i[l].title || '', description: i[l].description || '' }; if (!v.en && !Object.values(i).some((x) => x && x.title === e.title)) v[langsOf(e)[0] || 'en'] = v[langsOf(e)[0] || 'en'] || { title: e.title, description: e.description }; if (!Object.keys(v).length) v.en = { title: e.title, description: e.description }; return v; }
  function editEvent(e) {
    const mins = Math.round((new Date(e.endsAt) - new Date(e.startsAt)) / 60000);
    modal(`<h2>✏️ ${esc(t('ev_edit'))}</h2><p class="meta">#${e.id} · ${esc(clubName(e))} · ${esc(L(e, 'location'))}</p>${langFields('ee', eventLangValues(e))}
      <div class="spread"><div style="flex:1"><label for="ee-type">${esc(t('f_type'))}</label><select id="ee-type">${TYPESL.map((c) => `<option value="${c}" ${e.type === c ? 'selected' : ''}>${esc(t('type_' + c))}</option>`).join('')}</select></div><div style="flex:1"><label for="ee-st">${esc(t('f_status'))}</label><select id="ee-st">${['pending', 'approved', 'rejected', 'cancelled'].map((st) => `<option value="${st}" ${e.status === st ? 'selected' : ''}>${esc(t('est_' + st))}</option>`).join('')}</select></div></div>
      <label for="ee-start">${esc(t('f_start'))}</label><input id="ee-start" type="datetime-local" value="${toLocalInput(e.startsAt)}">
      <div class="spread"><div style="flex:1"><label for="ee-dur">${esc(t('f_duration'))}</label><input id="ee-dur" type="number" min="15" max="720" value="${mins}"></div><div style="flex:1"><label for="ee-cap">${esc(t('f_capacity'))}</label><input id="ee-cap" type="number" min="1" max="500" value="${e.capacity}"></div><div style="flex:1"><label for="ee-coins">${esc(t('f_coins'))}</label><input id="ee-coins" type="number" min="0" max="100" value="${e.coins}"></div></div>
      ${imageField('ee-img', e.image)}
      <div id="ee-err"></div><div class="row"><button class="btn" id="ee-save">${esc(t('save'))}</button><button class="btn danger" id="ee-del">🗑 ${esc(t('ev_delete'))}</button></div>`, (root, close) => {
      const lf = bindLangFields(root, 'ee'), im = bindImageField(root, 'ee-img');
      $('#ee-save', root).addEventListener('click', (ev) => act(ev.currentTarget, async () => {
        const bad = lf.check(); if (bad) { $('#ee-err', root).innerHTML = `<p class="note bad" role="alert">${esc(bad.msg)}</p>`; $('#' + bad.field, root).focus(); return; }
        try { await api('PUT', `/api/admin/events/${e.id}`, { i18n: lf.read(), type: $('#ee-type', root).value, status: $('#ee-st', root).value, startsAt: new Date($('#ee-start', root).value).toISOString(), durationMinutes: Number($('#ee-dur', root).value), capacity: Number($('#ee-cap', root).value), coins: Number($('#ee-coins', root).value), image: im.get() }); close(); toast(t('saved')); render(); }
        catch (err) { $('#ee-err', root).innerHTML = `<p class="note bad" role="alert">${esc(err.message)}</p>`; }
      }));
      $('#ee-del', root).addEventListener('click', async () => { close(); if (!(await confirmBox(t('ev_delete_confirm'), t('ev_delete')))) return; try { await api('DELETE', `/api/admin/events/${e.id}`); toast(t('deleted')); render(); } catch (err) { fail(err); } });
    });
  }
  function editClub(c) {
    const i = (c && c.i18n) || {};
    const tr = (l) => `<details style="margin-top:8px"><summary>${LANGNAME[l]}</summary><label for="cl-${l}-name">${esc(t('f_name'))} (${LANGNAME[l]})</label><input id="cl-${l}-name" lang="${l}" value="${esc((i[l] || {}).name || '')}"><label for="cl-${l}-room">${esc(t('f_room'))} (${LANGNAME[l]})</label><input id="cl-${l}-room" lang="${l}" value="${esc((i[l] || {}).room || '')}"><label for="cl-${l}-desc">${esc(t('f_desc_club'))} (${LANGNAME[l]})</label><textarea id="cl-${l}-desc" lang="${l}" rows="3">${esc((i[l] || {}).description || '')}</textarea></details>`;
    modal(`<h2>${esc(t(c ? 'club_edit' : 'club_add'))}</h2><label for="cl-name">${esc(t('f_name'))} (EN)</label><input id="cl-name" maxlength="80" value="${esc(c ? c.name : '')}">
      <label for="cl-cat">${esc(t('f_category'))}</label><select id="cl-cat">${TYPESL.map((x) => `<option value="${x}" ${c && c.category === x ? 'selected' : ''}>${esc(t('type_' + x))}</option>`).join('')}</select>
      <label for="cl-room">${esc(t('f_room'))} (EN)</label><input id="cl-room" maxlength="120" value="${esc(c ? c.room : '')}"><label for="cl-desc">${esc(t('f_desc_club'))} (EN)</label><textarea id="cl-desc" rows="3" maxlength="1000">${esc(c ? c.description : '')}</textarea>
      <h3 style="margin:14px 0 0;font-size:15px">${esc(t('translations'))}</h3>${tr('kk')}${tr('ru')}<div id="cl-err"></div><div class="row"><button class="btn" id="cl-save">${esc(t('save'))}</button></div>`, (root, close) => {
      $('#cl-save', root).addEventListener('click', (ev) => act(ev.currentTarget, async () => {
        const body = { name: $('#cl-name', root).value, category: $('#cl-cat', root).value, room: $('#cl-room', root).value, description: $('#cl-desc', root).value, i18n: Object.fromEntries(['kk', 'ru'].map((l) => [l, { name: $(`#cl-${l}-name`, root).value, room: $(`#cl-${l}-room`, root).value, description: $(`#cl-${l}-desc`, root).value }])) };
        try { await api(c ? 'PUT' : 'POST', c ? `/api/admin/clubs/${c.id}` : '/api/admin/clubs', body); close(); toast(t('saved')); render(); }
        catch (err) { $('#cl-err', root).innerHTML = `<p class="note bad" role="alert">${esc(err.message)}</p>`; }
      }));
    });
  }

  render();
})();
