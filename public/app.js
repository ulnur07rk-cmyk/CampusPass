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
    student: [['events', 'nav_events'], ['clubs', 'nav_clubs'], ['tickets', 'nav_tickets'], ['profile', 'nav_profile']],
    organizer: [['events', 'nav_events'], ['myevents', 'nav_myevents'], ['checkin', 'nav_checkin'], ['clubs', 'nav_clubs'], ['profile', 'nav_profile']],
    admin: [['moderation', 'nav_moderation'], ['stats', 'nav_stats'], ['events', 'nav_events'], ['checkin', 'nav_checkin'], ['roles', 'nav_users'], ['profile', 'nav_profile']]
  };
  const go = (v) => { if (location.hash !== '#/' + v) location.hash = '#/' + v; else render(); };
  const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = { events: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'), clubs: svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 20c.3-2.5 2-4 4-4 2.2 0 3 1.5 3 4"/>'), tickets: svg('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12" stroke-dasharray="2 2"/>'), profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'), myevents: svg('<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="3"/>'), checkin: svg('<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 12l3 3 5-6"/>'), moderation: svg('<path d="M9 12l2 2 4-4"/><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'), stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'), roles: svg('<circle cx="8" cy="8" r="3"/><path d="M2 20c0-3.3 2.7-6 6-6 1.5 0 2.8.5 3.9 1.4"/><circle cx="18" cy="16" r="3"/><path d="M18 11v2M18 19v2M13 16h2M21 16h2"/>'), out: svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>') };
  function chrome(view) {
    document.documentElement.lang = S.lang;
    $('#tagline').textContent = t('tagline'); $('#foot').textContent = t('footer'); $('#lang').value = S.lang;
    const items = S.me ? NAV[S.me.role] : [];
    const link = (icon) => ([v, k]) => `<a href="#/${v}" class="${v === view ? 'on' : ''}" ${v === view ? 'aria-current="page"' : ''}>${icon ? ICON[v] || '' : ''}<span>${esc(t(k))}</span></a>`;
    $('#nav').innerHTML = items.map(link(false)).join(''); $('#bottom').innerHTML = items.map(link(true)).join('');
    const so = $('#signout'); so.hidden = !S.me; so.innerHTML = `<span class="lbl">${esc(t('sign_out'))}</span>${ICON.out}`; so.setAttribute('aria-label', t('sign_out'));
  }

  async function render(quiet) {
    const view = (location.hash.replace('#/', '') || '').split('?')[0];
    if (!S.me) { try { S.me = await api('GET', '/api/me'); if (S.me.lang && !localStorage.getItem('cp.lang')) S.lang = S.me.lang; } catch { S.me = null; } }
    if (!S.me) { chrome('signin'); return viewSignin(); }
    const allowed = NAV[S.me.role].map((x) => x[0]).concat(S.me.role === 'student' ? [] : ['profile']);
    const v = allowed.includes(view) ? view : NAV[S.me.role][0][0];
    chrome(v);
    if (quiet !== true) app.innerHTML = `<p class="sub" style="margin-top:24px">${esc(t('loading'))}</p>`;
    try { await VIEWS[v](); } catch (e) { fail(e); }
  }
  window.addEventListener('hashchange', () => render());
  // Live updates: every 15 s the open screen reloads its data, so changes made by other users appear without a manual refresh
  setInterval(async () => {
    const a = document.activeElement;
    if (!S.me || document.hidden || document.querySelector('.modal') || pending || (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) return;
    const y = window.scrollY, key = a && a !== document.body ? (a.id ? '#' + a.id : [...a.attributes].filter((x) => x.name.startsWith('data-')).map((x) => `[${x.name}="${x.value}"]`).join('')) : '';
    await render(true); window.scrollTo(0, y);
    if (key) { const el = document.querySelector(key); if (el) el.focus({ preventScroll: true }); }
  }, 15000);
  $('#lang').addEventListener('change', async (e) => { S.lang = e.target.value; localStorage.setItem('cp.lang', S.lang); if (S.me) api('PUT', '/api/me/lang', { lang: S.lang }).catch(() => {}); render(); });
  $('#signout').addEventListener('click', async () => { await api('POST', '/api/auth/logout').catch(() => {}); S.me = null; go('signin'); });

  // ---------- W01 Sign in (FR-01) ----------
  async function viewSignin() {
    let accounts = [];
    try { accounts = await api('GET', '/api/test-accounts'); } catch { accounts = []; }
    const groups = [['student', 'group_students'], ['organizer', 'group_organizers'], ['admin', 'group_moderator']];
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

  // ---------- W02/W03 Events poster and details (FR-02 … FR-09, FR-17) ----------
  function seatsBlock(e) {
    const pct = Math.min(100, Math.round((e.taken / e.capacity) * 100));
    return `<div class="bar ${e.free ? '' : 'full'}"><i style="width:${pct}%"></i></div><div class="spread meta"><span>${e.free ? esc(t('seats_free', { n: e.free, c: e.capacity })) : `<b style="color:var(--bad)">${esc(t('full'))}</b> · ${esc(t('waitlist_n', { n: e.waitlist }))}`}</span><span>${esc(t('coins_n', { n: e.coins }))}</span></div>`;
  }
  function actionBlock(e) {
    if (S.me.role !== 'student') return '';
    const m = e.my;
    if (!m) return `<div class="row"><button class="btn" data-reg="${e.id}">${esc(t(e.free ? 'register' : 'join_waitlist'))}</button><button class="btn ghost" data-open="${e.id}">${esc(t('details'))}</button></div>`;
    if (m.status === 'confirmed') return `<p class="note ok">${esc(t('registered'))}</p><div class="row"><button class="btn ghost" data-open="${e.id}">${esc(t('details'))}</button><button class="btn danger" data-cancel="${e.id}">${esc(t('cant_come'))}</button></div>`;
    if (m.status === 'waitlisted') return `<p class="note warn">${esc(t('waitlisted', { n: m.position }))}</p><div class="row"><button class="btn danger" data-cancel="${e.id}">${esc(t('leave_waitlist'))}</button></div>`;
    return `<p class="note ok">✓ ${esc(t('checked_in'))}</p><div class="row"><button class="btn ghost" data-open="${e.id}">${esc(t('details'))}</button></div>`;
  }
  const eventCard = (e) => `<article class="card ev"><div class="spread"><span class="pill">${esc(t('type_' + e.type))}</span><span class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))}</span></div>
    <h3>${esc(L(e, 'title'))}</h3><div class="meta">${esc(clubName(e))} · ${esc(L(e, 'location'))}</div>${seatsBlock(e)}${actionBlock(e)}</article>`;

  async function register(id, btn) { return act(btn, async () => { try { const e = await api('POST', `/api/events/${id}/register`); toast(e.my.status === 'confirmed' ? t('registered') : t('waitlisted', { n: e.my.position })); render(); } catch (err) { fail(err); } }); }
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
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
    const byType = list.filter((e) => S.type === 'all' || e.type === S.type);
    const shown = S.day ? byType.filter((e) => dayKey(e.startsAt) === S.day) : byType;
    const dayName = (d, i) => (i === 0 ? t('today') : i === 1 ? t('tomorrow') : wdShort(d));
    app.innerHTML = `<h1>${esc(t('poster_title'))}</h1><p class="sub">${esc(t('poster_sub'))}</p>
      <div class="spread" style="margin-top:6px"><span class="meta">${S.day ? esc(dateLong(days.find((d) => dayKey(d) === S.day) || new Date())) : esc(t('whole_week'))}</span>${S.day ? `<button class="chip" id="allweek">✕ ${esc(t('whole_week'))}</button>` : ''}</div>
      <div class="days">${days.map((d, i) => { const n = byType.filter((e) => dayKey(e.startsAt) === dayKey(d)).length; return `<button class="day ${S.day === dayKey(d) ? 'on' : ''}" data-day="${dayKey(d)}" aria-pressed="${S.day === dayKey(d)}"><small>${esc(dayName(d, i))}</small><b>${d.getDate()}</b><span class="n">${n || ''}</span></button>`; }).join('')}</div>
      <div class="chips">${['all', 'tech', 'sports', 'creative', 'intellectual', 'social'].map((c) => `<button class="chip ${S.type === c ? 'on' : ''}" data-type="${c}">${esc(c === 'all' ? t('all') : t('type_' + c))}</button>`).join('')}</div>
      ${shown.length ? `<div class="grid">${shown.map(eventCard).join('')}</div>` : `<p class="note info">${esc(t('no_events'))}</p>`}`;
    const aw = $('#allweek'); if (aw) aw.addEventListener('click', () => { S.day = null; render(); });
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
  function openEvent(e) {
    const m = e.my, rem = m && m.reminder;
    const reminders = m && m.status === 'confirmed' ? `<label>${esc(t('reminders'))}</label><div class="seg" role="group">${['off', 'push', 'telegram'].map((c) => `<button data-ch="${c}" aria-pressed="${rem.channel === c}">${esc(t(c === 'off' ? 'rem_off' : c === 'push' ? 'rem_push' : 'rem_tg'))}</button>`).join('')}</div>
      <div><label class="chk"><input type="checkbox" id="rd" ${rem.day ? 'checked' : ''}> ${esc(t('rem_day'))}</label><label class="chk"><input type="checkbox" id="rh" ${rem.hour ? 'checked' : ''}> ${esc(t('rem_hour'))}</label></div><p class="meta">${esc(t('rem_note'))}</p>` : '';
    const rating = m && m.status === 'checked_in' ? (m.rating ? `<p class="note ok">${esc(t('rated', { n: m.rating }))}</p>` : `<label>${esc(t('rate'))}</label><div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button data-star="${n}" aria-label="${n}">★</button>`).join('')}</div>`) : '';
    modal(`<span class="pill">${esc(t('type_' + e.type))}</span><h2 style="margin-top:8px">${esc(L(e, 'title'))}</h2><p class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))}–${esc(time(e.endsAt))} · ${esc(L(e, 'location'))} · ${esc(clubName(e))}</p><p>${esc(L(e, 'description'))}</p>${seatsBlock(e)}${actionBlock(e)}${reminders}${m && m.status !== 'waitlisted' ? calendarLinks(e) : ''}${rating}`, (root, close) => {
      bindEventButtons(root, [e]); root.querySelectorAll('[data-reg],[data-cancel]').forEach((b) => b.addEventListener('click', close));
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
        ${c.myStatus === 'accepted' ? `<span class="note ok">${esc(t('st_accepted'))}</span>` : c.myStatus === 'pending' ? `<span class="note warn">${esc(t('st_pending'))}</span>` : S.me.role === 'student' ? `${c.myStatus === 'declined' ? `<p class="meta">${esc(t('st_declined'))}</p>` : ''}<button class="btn small" data-join="${c.id}">${esc(t('join'))}</button>` : ''}</article>`).join('');
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
  VIEWS.profile = async () => {
    const [me, coins, notes, clubs, regs] = await Promise.all([api('GET', '/api/me'), api('GET', '/api/me/coins'), api('GET', '/api/me/notifications'), api('GET', '/api/clubs'), S.me.role === 'student' ? api('GET', '/api/me/registrations') : []]);
    const mine = clubs.filter((c) => c.myStatus === 'accepted' || c.myStatus === 'pending');
    const attended = regs.filter((e) => e.my && e.my.status === 'checked_in');
    app.innerHTML = `<h1>${esc(me.name)}</h1><p class="sub">${esc(me.email)}${me.studentId ? ' · ID ' + esc(me.studentId) : ''}${me.group ? ' · ' + esc(me.group) : ''}${me.club ? ' · ' + esc(me.club.name) : ''}</p>
      <div class="grid"><section class="card"><h2>${esc(t('coins'))}</h2><div class="kpi"><b>${coins.balance}</b></div><ul class="list">${coins.history.map((h) => `<li class="spread"><span>${esc(h.event || h.reason)}<br><span class="meta">${esc(dateLong(h.createdAt))}</span></span><b>+${h.amount}</b></li>`).join('')}</ul></section>
      <section class="card"><h2>${esc(t('notifications'))}</h2>${notes.length ? `<ul class="list">${notes.map((n) => `<li><span class="pill">${esc(n.channel)}</span> ${esc(n.text)}<br><span class="meta">${esc(dateLong(n.createdAt))}, ${esc(time(n.createdAt))}</span></li>`).join('')}</ul>` : `<p class="meta">${esc(t('no_notifications'))}</p>`}</section>
      ${S.me.role === 'student' ? `<section class="card"><h2>${esc(t('attended'))}</h2><ul class="list">${attended.map((e) => `<li><b>${esc(L(e, 'title'))}</b><br><span class="meta">${esc(dateLong(e.startsAt))}</span>${e.my.rating ? `<p class="note ok" style="margin:6px 0 0">${esc(t('rated', { n: e.my.rating }))}</p>` : `<div class="stars" aria-label="${esc(t('rate'))}">${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${e.id}" data-star="${n}" aria-label="${n}">★</button>`).join('')}</div>`}</li>`).join('') || '<li class="meta">—</li>'}</ul></section>` : ''}
      <section class="card"><h2>${esc(t('my_clubs'))}</h2><ul class="list">${mine.map((c) => `<li class="spread"><span>${esc(L(c, 'name'))}</span><span class="meta">${esc(t(c.myStatus === 'accepted' ? 'st_accepted' : 'st_pending'))}</span></li>`).join('') || '<li class="meta">—</li>'}</ul>
      <label for="pl">${esc(t('language'))}</label><select id="pl"><option value="en">English</option><option value="kk">Қазақша</option><option value="ru">Русский</option></select></section></div>`;
    app.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', async () => { try { await api('POST', `/api/events/${b.dataset.rate}/feedback`, { rating: Number(b.dataset.star) }); toast(t('rated', { n: b.dataset.star })); render(); } catch (err) { fail(err); } }));
    $('#pl').value = S.lang; $('#pl').addEventListener('change', (e) => { $('#lang').value = e.target.value; $('#lang').dispatchEvent(new Event('change')); });
  };

  // ---------- W07 Organizer: submit event and own events (FR-11) ----------
  const statusPill = (s) => `<span class="note ${s === 'approved' ? 'ok' : s === 'pending' ? 'warn' : 'bad'}" style="padding:3px 8px;margin:0">${esc(t(s === 'pending' ? 'st_wait' : 'st_' + s))}</span>`;
  VIEWS.myevents = async () => {
    const list = await api('GET', '/api/organizer/events');
    const tomorrow = new Date(Date.now() + 86400000); tomorrow.setMinutes(0, 0, 0);
    const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    app.innerHTML = `<h1>${esc(t('submit_title'))}</h1><p class="sub">${esc(S.me.club ? S.me.club.name : '')}</p><div class="grid"><form class="card" id="ef" novalidate>
      <label for="ft">${esc(t('f_title'))}</label><input id="ft" maxlength="120" required><label for="fy">${esc(t('f_type'))}</label><select id="fy">${['tech', 'sports', 'creative', 'intellectual', 'social'].map((c) => `<option value="${c}">${esc(t('type_' + c))}</option>`).join('')}</select>
      <label for="fl">${esc(t('f_location'))}</label><input id="fl" maxlength="120" required><label for="fs">${esc(t('f_start'))}</label><input id="fs" type="datetime-local" value="${local}" min="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required>
      <div class="spread"><div style="flex:1"><label for="fd">${esc(t('f_duration'))}</label><input id="fd" type="number" min="15" max="720" value="120"></div><div style="flex:1"><label for="fc">${esc(t('f_capacity'))}</label><input id="fc" type="number" min="1" max="500" value="40"></div></div>
      <label for="fx">${esc(t('f_desc'))}</label><textarea id="fx" rows="4" maxlength="1000" required></textarea><div id="ferr"></div><button class="btn" style="margin-top:12px">${esc(t('send_moderation'))}</button></form>
      <section class="card"><h2>${esc(t('my_submissions'))}</h2><ul class="list">${list.map((e) => `<li class="spread"><span><b>${esc(L(e, 'title'))}</b><br><span class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))} · ${e.taken}/${e.capacity}</span>${e.comment ? `<br><span class="meta">${esc(e.comment)}</span>` : ''}</span>${statusPill(e.status)}</li>`).join('')}</ul></section></div>`;
    const FIELD = { invalid_title: 'ft', invalid_location: 'fl', invalid_start: 'fs', start_in_past: 'fs', invalid_duration: 'fd', invalid_capacity: 'fc', invalid_description: 'fx', invalid_type: 'fy' };
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
      const len = (id) => $('#' + id).value.trim().length, num = (id) => Number($('#' + id).value), start = new Date($('#fs').value);
      if (len('ft') < 3 || len('ft') > 120) return 'invalid_title';
      if (len('fl') < 2) return 'invalid_location';
      if (isNaN(start)) return 'invalid_start';
      if (start <= new Date()) return 'start_in_past';
      if (!(num('fd') >= 15 && num('fd') <= 720)) return 'invalid_duration';
      if (!Number.isInteger(num('fc')) || num('fc') < 1 || num('fc') > 500) return 'invalid_capacity';
      if (len('fx') < 10) return 'invalid_description';
      return null;
    };
    app.querySelectorAll('#ef input,#ef textarea').forEach((x) => x.addEventListener('input', () => { if (x.getAttribute('aria-invalid')) clearErr(); }));
    $('#ef').addEventListener('submit', async (ev) => {
      ev.preventDefault(); clearErr();
      const bad = check(); if (bad) return showErr(bad, t('err_' + bad));
      const body = { title: $('#ft').value, type: $('#fy').value, location: $('#fl').value, startsAt: new Date($('#fs').value).toISOString(), durationMinutes: Number($('#fd').value), capacity: Number($('#fc').value), description: $('#fx').value };
      await act(ev.submitter || $('#ef button'), async () => { try { await api('POST', '/api/events', body); toast(t('submitted')); render(); } catch (err) { showErr(err.code, err.message); } });
    });
  };

  // ---------- W08 Check-in: QR code or manual list (FR-14, FR-15) ----------
  VIEWS.checkin = async () => {
    const all = await api('GET', '/api/organizer/events');
    const list = all.filter((e) => e.status === 'approved' && new Date(e.endsAt) > new Date(Date.now() - 86400000));
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
    // QR scanning: the browser's BarcodeDetector if available, otherwise the jsQR library (Apache-2.0).
    const msg = (k, cls = 'warn') => { $('#cres').innerHTML = `<p class="note ${cls}" role="alert">${esc(t(k))}</p>`; };
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
          if (code) { stop(); $('#cc').value = code; doCheck({ ticketCode: code }); } else setTimeout(tick, 200);
        };
        tick();
      } catch (e) { if (stream) stream.getTracks().forEach((x) => x.stop()); explain(e); }
    });
    // Alternative without live video: take or choose a photo of the QR code
    $('#photo').addEventListener('change', async (ev) => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      try { const detect = await decoder(); const bmp = await createImageBitmap(f); const code = await detect(bmp); ev.target.value = '';
        if (code) { $('#cc').value = code; doCheck({ ticketCode: code }); } else msg('scan_notfound'); }
      catch (e) { explain(e); }
    });
    loadPeople();
  };

  // ---------- W09 Moderator: moderation, statistics, roles (FR-12, FR-13, FR-18, FR-20) ----------
  VIEWS.moderation = async () => {
    const [ev, req] = await Promise.all([api('GET', '/api/admin/pending-events'), api('GET', '/api/admin/club-requests')]);
    app.innerHTML = `<h1>${esc(t('moderation_title'))}</h1><section class="card"><div class="tablewrap"><table class="stack"><thead><tr><th>${esc(t('th_event'))}</th><th>${esc(t('th_club'))}</th><th>${esc(t('th_date'))}</th><th>${esc(t('th_seats'))}</th><th>${esc(t('th_action'))}</th></tr></thead><tbody>
      ${ev.map((e) => `<tr><td data-label="${esc(t('th_event'))}"><b>${esc(L(e, 'title'))}</b><br><span class="meta">${esc(L(e, 'location'))}</span></td><td data-label="${esc(t('th_club'))}">${esc(clubName(e))}</td><td data-label="${esc(t('th_date'))}">${esc(dateLong(e.startsAt))} ${esc(time(e.startsAt))}</td><td data-label="${esc(t('th_seats'))}">${e.capacity}</td><td><div class="row" style="margin:0"><button class="btn small" data-ok="${e.id}">${esc(t('approve'))}</button><button class="btn small danger" data-no="${e.id}">${esc(t('reject'))}</button></div></td></tr>`).join('') || `<tr><td colspan="5" class="meta">${esc(t('nothing_pending'))}</td></tr>`}</tbody></table></div></section>
      <h2 style="margin-top:22px">${esc(t('club_requests'))}</h2><section class="card"><ul class="list">${req.map((r) => `<li class="spread"><span><b>${esc(r.name)}</b> (ID ${esc(r.studentId)}) → ${esc(clubName(r))}${r.message ? `<br><span class="meta">${esc(r.message)}</span>` : ''}</span><span class="row" style="margin:0"><button class="btn small" data-acc="${r.userId}:${r.clubId}">${esc(t('accept'))}</button><button class="btn small danger" data-dec="${r.userId}:${r.clubId}">${esc(t('decline'))}</button></span></li>`).join('') || `<li class="meta">${esc(t('nothing_pending'))}</li>`}</ul></section>`;
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
    app.innerHTML = `<h1>${esc(t('stats_title'))}</h1><div class="kpis">${[['t_clubs', s.totals.clubs], ['t_events', s.totals.approvedEvents], ['t_regs', s.totals.registrations], ['t_pending', s.totals.pending]].map(([k, v]) => `<div class="card kpi"><b>${v}</b><span>${esc(t(k))}</span></div>`).join('')}</div>
      <section class="card tablewrap"><table class="stack"><thead><tr><th>${esc(t('th_event'))}</th><th>${esc(t('th_date'))}</th><th>${esc(t('th_seats'))}</th><th>${esc(t('th_fill'))}</th><th>${esc(t('th_wait'))}</th><th>${esc(t('th_checked'))}</th><th>${esc(t('th_rating'))}</th></tr></thead><tbody>
      ${s.events.map((e) => `<tr><td data-label="${esc(t('th_event'))}"><b>${esc(L(e, 'title'))}</b></td><td data-label="${esc(t('th_date'))}">${esc(dateLong(e.startsAt))}</td><td data-label="${esc(t('th_seats'))}">${e.registered}/${e.capacity}</td><td data-label="${esc(t('th_fill'))}"><div class="bar" style="width:90px;margin:0;display:inline-block;vertical-align:middle"><i style="width:${Math.min(100, e.fillRate)}%"></i></div> ${e.fillRate}%</td><td data-label="${esc(t('th_wait'))}">${e.waitlist}</td><td data-label="${esc(t('th_checked'))}">${e.checkedIn}</td><td data-label="${esc(t('th_rating'))}">${e.avgRating ?? '—'}</td></tr>`).join('')}</tbody></table></section>`;
  };
  VIEWS.roles = async () => {
    const [users, clubs] = await Promise.all([api('GET', '/api/admin/users'), api('GET', '/api/clubs')]);
    const opts = clubs.map((c) => `<option value="${c.id}">${esc(L(c, 'name'))}</option>`).join('');
    app.innerHTML = `<h1>${esc(t('users_title'))}</h1><section class="card" style="margin-bottom:14px"><div class="spread"><span><b>${esc(t('reset_title'))}</b><br><span class="meta">${esc(t('reset_sub'))}</span></span><button class="btn danger small" id="reset">${esc(t('reset_btn'))}</button></div></section><section class="card tablewrap"><table><thead><tr><th>${esc(t('th_name'))}</th><th>${esc(t('th_role'))}</th><th>${esc(t('th_club'))}</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr data-u="${u.id}"><td>${esc(u.name)}<br><span class="meta">${esc(u.email)}</span></td><td><select class="r">${['student', 'organizer', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${esc(t('role_' + r))}</option>`).join('')}</select></td><td><select class="c">${opts}</select></td><td><button class="btn small" ${u.id === S.me.id ? 'disabled' : ''}>${esc(t('save'))}</button></td></tr>`).join('')}</tbody></table></section>`;
    $('#reset').addEventListener('click', async (ev) => { const btn = ev.currentTarget; if (!(await confirmBox(t('reset_confirm'), t('reset_btn')))) return; await act(btn, async () => { try { await api('POST', '/api/admin/reset', {}); S.me = null; toast(t('reset_done')); go('signin'); } catch (err) { fail(err); } }); });
    app.querySelectorAll('tr[data-u]').forEach((row) => {
      const u = users.find((x) => String(x.id) === row.dataset.u), c = clubs.find((x) => x.name === u.club); if (c) row.querySelector('.c').value = c.id;
      row.querySelector('button').addEventListener('click', (ev) => act(ev.currentTarget, async () => { try { await api('PUT', `/api/admin/users/${u.id}/role`, { role: row.querySelector('.r').value, clubId: Number(row.querySelector('.c').value) }); toast(t('saved')); } catch (err) { fail(err); } }));
    });
  };

  render();
})();
