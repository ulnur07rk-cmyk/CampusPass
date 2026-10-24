// CampusPass — frontend (plain JavaScript, no build step). Screens follow wireframes W01–W09 in SRS 3.1.
'use strict';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { me: null, lang: localStorage.getItem('cp.lang') || 'en', day: null, type: 'all', clubCat: 'all', clubQ: '' };
  if (!I18N[S.lang]) S.lang = 'en';
  const VIEWS = {};
  const t = (k, v = {}) => String((I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const LOC = { en: 'en-GB', kk: 'kk-KZ', ru: 'ru-RU' };
  const fmt = (o) => new Intl.DateTimeFormat(LOC[S.lang], o);
  const dateLong = (d) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d));
  const time = (d) => fmt({ hour: '2-digit', minute: '2-digit' }).format(new Date(d));
  const dayKey = (d) => { const x = new Date(d); return x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate(); };

  // ---------- API ----------
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((data.error && data.error.message) || 'Error'); e.code = data.error && data.error.code; e.status = r.status; throw e; }
    return data;
  }
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200); }
  const fail = (e) => { if (e.status === 401) { S.me = null; go('signin'); } toast(e.message); };

  // ---------- navigation ----------
  const NAV = {
    student: [['events', 'nav_events'], ['clubs', 'nav_clubs'], ['tickets', 'nav_tickets'], ['profile', 'nav_profile']],
    organizer: [['events', 'nav_events'], ['myevents', 'nav_myevents'], ['checkin', 'nav_checkin'], ['clubs', 'nav_clubs'], ['profile', 'nav_profile']],
    admin: [['moderation', 'nav_moderation'], ['stats', 'nav_stats'], ['events', 'nav_events'], ['checkin', 'nav_checkin'], ['roles', 'nav_users']]
  };
  const go = (v) => { if (location.hash !== '#/' + v) location.hash = '#/' + v; else render(); };
  function chrome(view) {
    document.documentElement.lang = S.lang;
    $('#tagline').textContent = t('tagline'); $('#foot').textContent = t('footer'); $('#lang').value = S.lang;
    const items = S.me ? NAV[S.me.role] : [];
    const links = items.map(([v, k]) => `<a href="#/${v}" class="${v === view ? 'on' : ''}" ${v === view ? 'aria-current="page"' : ''}>${esc(t(k))}</a>`).join('');
    $('#nav').innerHTML = links; $('#bottom').innerHTML = links;
    const so = $('#signout'); so.hidden = !S.me; so.textContent = t('sign_out');
  }

  async function render() {
    const view = (location.hash.replace('#/', '') || '').split('?')[0];
    if (!S.me) { try { S.me = await api('GET', '/api/me'); if (S.me.lang && !localStorage.getItem('cp.lang')) S.lang = S.me.lang; } catch { S.me = null; } }
    if (!S.me) { chrome('signin'); return viewSignin(); }
    const allowed = NAV[S.me.role].map((x) => x[0]).concat(S.me.role === 'student' ? [] : ['profile']);
    const v = allowed.includes(view) ? view : NAV[S.me.role][0][0];
    chrome(v);
    app.innerHTML = `<p class="sub" style="margin-top:24px">${esc(t('loading'))}</p>`;
    try { await VIEWS[v](); } catch (e) { fail(e); }
  }
  window.addEventListener('hashchange', render);
  $('#lang').addEventListener('change', async (e) => { S.lang = e.target.value; localStorage.setItem('cp.lang', S.lang); if (S.me) api('PUT', '/api/me/lang', { lang: S.lang }).catch(() => {}); render(); });
  $('#signout').addEventListener('click', async () => { await api('POST', '/api/auth/logout').catch(() => {}); S.me = null; go('signin'); });

  // ---------- W01 Sign in (FR-01) ----------
  function viewSignin() {
    const demo = [['student@test.local', 'Student123!', 'role_student'], ['organizer@test.local', 'Organizer123!', 'role_organizer'], ['admin@test.local', 'Admin123!', 'role_admin']];
    app.innerHTML = `<section class="card signin"><h1>${esc(t('signin_title'))}</h1><p class="sub">${esc(t('signin_sub'))}</p>
      <form id="f" novalidate><label for="em">${esc(t('email'))}</label><input id="em" type="email" autocomplete="username" required>
      <label for="pw">${esc(t('password'))}</label><input id="pw" type="password" autocomplete="current-password" required>
      <div id="err"></div><button class="btn" style="width:100%;margin-top:14px">${esc(t('sign_in'))}</button></form>
      <p class="sub" style="margin:16px 0 0">${esc(t('demo_accounts'))}:</p><div class="demo">${demo.map((d) => `<button class="btn ghost small" data-e="${d[0]}" data-p="${d[1]}">${esc(t(d[2]))}</button>`).join('')}</div></section>`;
    app.querySelectorAll('.demo button').forEach((b) => b.addEventListener('click', () => { $('#em').value = b.dataset.e; $('#pw').value = b.dataset.p; }));
    $('#f').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!$('#em').value || !$('#pw').value) { $('#err').innerHTML = `<p class="note bad">${esc(t('required'))}</p>`; return; }
      try { await api('POST', '/api/auth/login', { email: $('#em').value, password: $('#pw').value }); S.me = null; location.hash = ''; render(); }
      catch (e) { $('#err').innerHTML = `<p class="note bad" role="alert">${esc(e.message)}</p>`; }
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
    <h3>${esc(e.title)}</h3><div class="meta">${esc(e.club)} · ${esc(e.location)}</div>${seatsBlock(e)}${actionBlock(e)}</article>`;

  async function register(id) { try { const e = await api('POST', `/api/events/${id}/register`); toast(e.my.status === 'confirmed' ? t('registered') : t('waitlisted', { n: e.my.position })); render(); } catch (err) { fail(err); } }
  async function cancel(id) { try { await api('DELETE', `/api/events/${id}/registration`); render(); } catch (err) { fail(err); } }
  function bindEventButtons(root, list) {
    root.querySelectorAll('[data-reg]').forEach((b) => b.addEventListener('click', () => register(b.dataset.reg)));
    root.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => cancel(b.dataset.cancel)));
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openEvent(list.find((x) => String(x.id) === b.dataset.open))));
  }

  VIEWS.events = async () => {
    const list = await api('GET', '/api/events?days=7');
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
    const byType = list.filter((e) => S.type === 'all' || e.type === S.type);
    const shown = S.day ? byType.filter((e) => dayKey(e.startsAt) === S.day) : byType;
    const dayName = (d, i) => (i === 0 ? t('today') : i === 1 ? t('tomorrow') : fmt({ weekday: 'short' }).format(d));
    app.innerHTML = `<h1>${esc(t('poster_title'))}</h1><p class="sub">${esc(t('poster_sub'))}</p>
      <div class="days">${days.map((d, i) => { const n = byType.filter((e) => dayKey(e.startsAt) === dayKey(d)).length; return `<button class="day ${S.day === dayKey(d) ? 'on' : ''}" data-day="${dayKey(d)}" aria-pressed="${S.day === dayKey(d)}"><small>${esc(dayName(d, i))}</small><b>${d.getDate()}</b><span class="n">${n || ''}</span></button>`; }).join('')}</div>
      <div class="chips">${['all', 'tech', 'sports', 'creative', 'intellectual', 'social'].map((c) => `<button class="chip ${S.type === c ? 'on' : ''}" data-type="${c}">${esc(c === 'all' ? t('all') : t('type_' + c))}</button>`).join('')}</div>
      ${shown.length ? `<div class="grid">${shown.map(eventCard).join('')}</div>` : `<p class="note info">${esc(t('no_events'))}</p>`}`;
    app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { S.day = S.day === b.dataset.day ? null : b.dataset.day; render(); }));
    app.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { S.type = b.dataset.type; render(); }));
    bindEventButtons(app, list);
  };

  function modal(html, onReady) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="card" role="dialog" aria-modal="true">${html}<div class="row"><button class="btn ghost" data-close>${esc(t('close'))}</button></div></div>`;
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey); document.body.appendChild(m); (m.querySelector('button,input,textarea') || m).focus();
    if (onReady) onReady(m, close);
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
    modal(`<span class="pill">${esc(t('type_' + e.type))}</span><h2 style="margin-top:8px">${esc(e.title)}</h2><p class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))}–${esc(time(e.endsAt))} · ${esc(e.location)} · ${esc(e.club)}</p><p>${esc(e.description)}</p>${seatsBlock(e)}${actionBlock(e)}${reminders}${m && m.status !== 'waitlisted' ? calendarLinks(e) : ''}${rating}`, (root, close) => {
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
      <h3>${esc(e.title)}</h3><p class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))} · ${esc(e.location)}</p>${actionBlock(e)}</article>`).join('')}</div>` : `<p class="note info">${esc(t('no_tickets'))}</p>`}`;
    app.querySelectorAll('[data-qr]').forEach((el) => { try { new QRCode(el, { text: el.dataset.qr, width: 176, height: 176, colorDark: '#0f172a', colorLight: '#ffffff' }); } catch { el.textContent = el.dataset.qr; } });
    bindEventButtons(app, active);
  };

  // ---------- W05 Clubs (FR-10) ----------
  VIEWS.clubs = async () => {
    const clubs = await api('GET', '/api/clubs');
    const draw = () => {
      const q = S.clubQ.toLowerCase();
      const shown = clubs.filter((c) => (S.clubCat === 'all' || c.category === S.clubCat) && (!q || c.name.toLowerCase().includes(q)));
      $('#clubs').innerHTML = shown.map((c) => `<article class="card"><div class="spread"><span class="pill">${esc(t('type_' + c.category))}</span><span class="meta">${esc(t('members_n', { n: c.members }))}</span></div>
        <h3 style="margin:8px 0 2px">${esc(c.name)}</h3><p class="meta">${esc(c.room)}</p><p style="font-size:14px">${esc(c.description)}</p>
        ${c.myStatus === 'accepted' ? `<span class="note ok">${esc(t('st_accepted'))}</span>` : c.myStatus === 'pending' ? `<span class="note warn">${esc(t('st_pending'))}</span>` : S.me.role === 'student' ? `${c.myStatus === 'declined' ? `<p class="meta">${esc(t('st_declined'))}</p>` : ''}<button class="btn small" data-join="${c.id}">${esc(t('join'))}</button>` : ''}</article>`).join('');
      app.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => {
        const c = clubs.find((x) => String(x.id) === b.dataset.join);
        modal(`<h2>${esc(t('join'))}: ${esc(c.name)}</h2><label for="msg">${esc(t('why_join'))}</label><textarea id="msg" rows="4" maxlength="500"></textarea><div class="row"><button class="btn" id="send">${esc(t('send_request'))}</button></div>`, (root, close) => {
          $('#send', root).addEventListener('click', async () => { try { await api('POST', `/api/clubs/${c.id}/join`, { message: $('#msg', root).value }); c.myStatus = 'pending'; close(); toast(t('st_pending')); draw(); } catch (err) { fail(err); } });
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
    const [me, coins, notes, clubs] = await Promise.all([api('GET', '/api/me'), api('GET', '/api/me/coins'), api('GET', '/api/me/notifications'), api('GET', '/api/clubs')]);
    const mine = clubs.filter((c) => c.myStatus === 'accepted' || c.myStatus === 'pending');
    app.innerHTML = `<h1>${esc(me.name)}</h1><p class="sub">${esc(me.email)}${me.studentId ? ' · ID ' + esc(me.studentId) : ''}${me.group ? ' · ' + esc(me.group) : ''}${me.club ? ' · ' + esc(me.club.name) : ''}</p>
      <div class="grid"><section class="card"><h2>${esc(t('coins'))}</h2><div class="kpi"><b>${coins.balance}</b></div><ul class="list">${coins.history.map((h) => `<li class="spread"><span>${esc(h.event || h.reason)}<br><span class="meta">${esc(dateLong(h.createdAt))}</span></span><b>+${h.amount}</b></li>`).join('')}</ul></section>
      <section class="card"><h2>${esc(t('notifications'))}</h2>${notes.length ? `<ul class="list">${notes.map((n) => `<li><span class="pill">${esc(n.channel)}</span> ${esc(n.text)}<br><span class="meta">${esc(dateLong(n.createdAt))}, ${esc(time(n.createdAt))}</span></li>`).join('')}</ul>` : `<p class="meta">${esc(t('no_notifications'))}</p>`}</section>
      <section class="card"><h2>${esc(t('my_clubs'))}</h2><ul class="list">${mine.map((c) => `<li class="spread"><span>${esc(c.name)}</span><span class="meta">${esc(t(c.myStatus === 'accepted' ? 'st_accepted' : 'st_pending'))}</span></li>`).join('') || '<li class="meta">—</li>'}</ul>
      <label for="pl">${esc(t('language'))}</label><select id="pl"><option value="en">English</option><option value="kk">Қазақша</option><option value="ru">Русский</option></select></section></div>`;
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
      <label for="fl">${esc(t('f_location'))}</label><input id="fl" maxlength="120" required><label for="fs">${esc(t('f_start'))}</label><input id="fs" type="datetime-local" value="${local}" required>
      <div class="spread"><div style="flex:1"><label for="fd">${esc(t('f_duration'))}</label><input id="fd" type="number" min="15" max="720" value="120"></div><div style="flex:1"><label for="fc">${esc(t('f_capacity'))}</label><input id="fc" type="number" min="1" max="500" value="40"></div></div>
      <label for="fx">${esc(t('f_desc'))}</label><textarea id="fx" rows="4" maxlength="1000" required></textarea><div id="ferr"></div><button class="btn" style="margin-top:12px">${esc(t('send_moderation'))}</button></form>
      <section class="card"><h2>${esc(t('my_submissions'))}</h2><ul class="list">${list.map((e) => `<li class="spread"><span><b>${esc(e.title)}</b><br><span class="meta">${esc(dateLong(e.startsAt))}, ${esc(time(e.startsAt))} · ${e.taken}/${e.capacity}</span>${e.comment ? `<br><span class="meta">${esc(e.comment)}</span>` : ''}</span>${statusPill(e.status)}</li>`).join('')}</ul></section></div>`;
    $('#ef').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = { title: $('#ft').value, type: $('#fy').value, location: $('#fl').value, startsAt: new Date($('#fs').value).toISOString(), durationMinutes: Number($('#fd').value), capacity: Number($('#fc').value), description: $('#fx').value };
      try { await api('POST', '/api/events', body); toast(t('submitted')); render(); } catch (err) { $('#ferr').innerHTML = `<p class="note bad" role="alert">${esc(err.message)}</p>`; }
    });
  };

  // ---------- W08 Check-in: QR code or manual list (FR-14, FR-15) ----------
  VIEWS.checkin = async () => {
    const all = await api('GET', '/api/organizer/events');
    const list = all.filter((e) => e.status === 'approved' && new Date(e.endsAt) > new Date(Date.now() - 86400000));
    if (!S.ci || !list.find((e) => e.id === S.ci)) S.ci = (list.find((e) => new Date(e.endsAt) > new Date()) || list[0] || {}).id;
    app.innerHTML = `<h1>${esc(t('checkin_title'))}</h1><p class="sub">${esc(t('checkin_sub'))}</p><div class="grid"><section class="card">
      <label for="ce">${esc(t('choose_event'))}</label><select id="ce">${list.map((e) => `<option value="${e.id}" ${e.id === S.ci ? 'selected' : ''}>${esc(e.title)} · ${esc(dateLong(e.startsAt))} ${esc(time(e.startsAt))}</option>`).join('')}</select>
      <label for="cc">${esc(t('ticket_code'))}</label><input id="cc" placeholder="CP-…" autocomplete="off"><div class="row"><button class="btn" id="cgo">${esc(t('check'))}</button><button class="btn ghost" id="scan">${esc(t('scan'))}</button></div>
      <video id="cam" playsinline muted style="width:100%;border-radius:10px;margin-top:10px;display:none"></video><div id="cres"></div></section>
      <section class="card"><h2>${esc(t('participants'))}</h2><input id="pq" type="search" placeholder="${esc(t('search_people'))}" aria-label="${esc(t('search_people'))}"><ul class="list" id="pl"></ul></section></div>`;
    let people = [];
    const drawPeople = () => { const q = ($('#pq').value || '').toLowerCase(); $('#pl').innerHTML = people.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.studentId).includes(q)).map((p) => `<li class="spread"><span>${esc(p.name)}<br><span class="meta">ID ${esc(p.studentId)}${p.method ? ' · ' + esc(t(p.method === 'qr' ? 'method_qr' : 'method_manual')) : ''}</span></span>${p.status === 'checked_in' ? `<span class="note ok" style="margin:0;padding:3px 8px">✓ ${esc(t('checked_in'))}</span>` : `<button class="btn small ghost" data-man="${p.id}">${esc(t('check'))}</button>`}</li>`).join(''); app.querySelectorAll('[data-man]').forEach((b) => b.addEventListener('click', () => doCheck({ registrationId: Number(b.dataset.man) }))); };
    const loadPeople = async () => { if (!S.ci) return; people = await api('GET', `/api/events/${S.ci}/participants`); drawPeople(); };
    async function doCheck(extra) {
      try { const r = await api('POST', '/api/checkin', { eventId: S.ci, ...extra }); $('#cres').innerHTML = `<p class="note ok" role="status">${esc(t('checked_ok', { name: r.name, id: r.studentId, coins: r.coins }))}</p>`; $('#cc').value = ''; loadPeople(); }
      catch (err) { $('#cres').innerHTML = `<p class="note bad" role="alert">${esc(err.message)}</p>`; }
    }
    $('#ce').addEventListener('change', (e) => { S.ci = Number(e.target.value); $('#cres').innerHTML = ''; loadPeople(); });
    $('#cgo').addEventListener('click', () => doCheck({ ticketCode: $('#cc').value }));
    $('#cc').addEventListener('keydown', (e) => { if (e.key === 'Enter') doCheck({ ticketCode: $('#cc').value }); });
    $('#pq').addEventListener('input', drawPeople);
    $('#scan').addEventListener('click', async () => { // Uses the browser's BarcodeDetector where available (Chrome on Android, macOS, ChromeOS)
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices) { $('#cres').innerHTML = `<p class="note warn">${esc(t('scan_unsupported'))}</p>`; return; }
      try {
        const v = $('#cam'), stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }), det = new BarcodeDetector({ formats: ['qr_code'] });
        v.srcObject = stream; v.style.display = 'block'; await v.play();
        const stop = () => { stream.getTracks().forEach((x) => x.stop()); v.style.display = 'none'; };
        const tick = async () => { if (!document.body.contains(v)) return stop(); const codes = await det.detect(v).catch(() => []); if (codes.length) { stop(); $('#cc').value = codes[0].rawValue; doCheck({ ticketCode: codes[0].rawValue }); } else requestAnimationFrame(tick); };
        tick();
      } catch { $('#cres').innerHTML = `<p class="note warn">${esc(t('scan_unsupported'))}</p>`; }
    });
    loadPeople();
  };

  // ---------- W09 Moderator: moderation, statistics, roles (FR-12, FR-13, FR-18, FR-20) ----------
  VIEWS.moderation = async () => {
    const [ev, req] = await Promise.all([api('GET', '/api/admin/pending-events'), api('GET', '/api/admin/club-requests')]);
    app.innerHTML = `<h1>${esc(t('moderation_title'))}</h1><section class="card"><div class="tablewrap"><table><thead><tr><th>${esc(t('th_event'))}</th><th>${esc(t('th_club'))}</th><th>${esc(t('th_date'))}</th><th>${esc(t('th_seats'))}</th><th>${esc(t('th_action'))}</th></tr></thead><tbody>
      ${ev.map((e) => `<tr><td><b>${esc(e.title)}</b><br><span class="meta">${esc(e.location)}</span></td><td>${esc(e.club)}</td><td>${esc(dateLong(e.startsAt))} ${esc(time(e.startsAt))}</td><td>${e.capacity}</td><td><div class="row" style="margin:0"><button class="btn small" data-ok="${e.id}">${esc(t('approve'))}</button><button class="btn small danger" data-no="${e.id}">${esc(t('reject'))}</button></div></td></tr>`).join('') || `<tr><td colspan="5" class="meta">${esc(t('nothing_pending'))}</td></tr>`}</tbody></table></div></section>
      <h2 style="margin-top:22px">${esc(t('club_requests'))}</h2><section class="card"><ul class="list">${req.map((r) => `<li class="spread"><span><b>${esc(r.name)}</b> (ID ${esc(r.studentId)}) → ${esc(r.club)}${r.message ? `<br><span class="meta">${esc(r.message)}</span>` : ''}</span><span class="row" style="margin:0"><button class="btn small" data-acc="${r.userId}:${r.clubId}">${esc(t('accept'))}</button><button class="btn small danger" data-dec="${r.userId}:${r.clubId}">${esc(t('decline'))}</button></span></li>`).join('') || `<li class="meta">${esc(t('nothing_pending'))}</li>`}</ul></section>`;
    const decide = async (id, decision, comment) => { try { await api('POST', `/api/admin/events/${id}/decision`, { decision, comment }); render(); } catch (err) { fail(err); } };
    app.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.ok, 'approve')));
    app.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => modal(`<h2>${esc(t('reject'))}</h2><label for="rr">${esc(t('reject_reason'))}</label><textarea id="rr" rows="3"></textarea><div class="row"><button class="btn danger" id="rgo">${esc(t('reject'))}</button></div>`, (root, close) => { $('#rgo', root).addEventListener('click', () => { close(); decide(b.dataset.no, 'reject', $('#rr', root).value); }); })));
    const club = async (v, decision) => { const [userId, clubId] = v.split(':').map(Number); try { await api('POST', '/api/admin/club-requests/decision', { userId, clubId, decision }); render(); } catch (err) { fail(err); } };
    app.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => club(b.dataset.acc, 'accept')));
    app.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => club(b.dataset.dec, 'decline')));
  };
  VIEWS.stats = async () => {
    const s = await api('GET', '/api/admin/stats');
    app.innerHTML = `<h1>${esc(t('stats_title'))}</h1><div class="kpis">${[['t_clubs', s.totals.clubs], ['t_events', s.totals.approvedEvents], ['t_regs', s.totals.registrations], ['t_pending', s.totals.pending]].map(([k, v]) => `<div class="card kpi"><b>${v}</b><span>${esc(t(k))}</span></div>`).join('')}</div>
      <section class="card tablewrap"><table><thead><tr><th>${esc(t('th_event'))}</th><th>${esc(t('th_date'))}</th><th>${esc(t('th_seats'))}</th><th>${esc(t('th_fill'))}</th><th>${esc(t('th_wait'))}</th><th>${esc(t('th_checked'))}</th><th>${esc(t('th_rating'))}</th></tr></thead><tbody>
      ${s.events.map((e) => `<tr><td>${esc(e.title)}</td><td>${esc(dateLong(e.startsAt))}</td><td>${e.registered}/${e.capacity}</td><td><div class="bar" style="width:90px;margin:0"><i style="width:${Math.min(100, e.fillRate)}%"></i></div>${e.fillRate}%</td><td>${e.waitlist}</td><td>${e.checkedIn}</td><td>${e.avgRating ?? '—'}</td></tr>`).join('')}</tbody></table></section>`;
  };
  VIEWS.roles = async () => {
    const [users, clubs] = await Promise.all([api('GET', '/api/admin/users'), api('GET', '/api/clubs')]);
    const opts = clubs.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    app.innerHTML = `<h1>${esc(t('users_title'))}</h1><section class="card tablewrap"><table><thead><tr><th>${esc(t('th_name'))}</th><th>${esc(t('th_role'))}</th><th>${esc(t('th_club'))}</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr data-u="${u.id}"><td>${esc(u.name)}<br><span class="meta">${esc(u.email)}</span></td><td><select class="r">${['student', 'organizer', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${esc(t('role_' + r))}</option>`).join('')}</select></td><td><select class="c">${opts}</select></td><td><button class="btn small" ${u.id === S.me.id ? 'disabled' : ''}>${esc(t('save'))}</button></td></tr>`).join('')}</tbody></table></section>`;
    app.querySelectorAll('tr[data-u]').forEach((row) => {
      const u = users.find((x) => String(x.id) === row.dataset.u), c = clubs.find((x) => x.name === u.club); if (c) row.querySelector('.c').value = c.id;
      row.querySelector('button').addEventListener('click', async () => { try { await api('PUT', `/api/admin/users/${u.id}/role`, { role: row.querySelector('.r').value, clubId: Number(row.querySelector('.c').value) }); toast(t('saved')); } catch (err) { fail(err); } });
    });
  };

  render();
})();
