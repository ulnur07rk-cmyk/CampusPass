// CampusPass — shared API core for the Netlify version (Netlify Functions + Netlify Blobs).
// Same business rules as server/app.js. Educational project. Not a real product or service. All data are fictional.
'use strict';
const { availability } = require('../server/rooms.js');
const bot = require('../server/bot.js');
function createCore(SEED, state) {
  const ROOMS = SEED.rooms || [], VENUES = SEED.venues || [], CAMPUS = SEED.campus;
  const placeOf = (e) => { const r = e.room_code && ROOMS.find((x) => x.code === e.room_code); if (r) return { kind: 'room', code: r.code, name: r.name, floor: r.floor, x: r.x, y: r.y, capacity: r.capacity, i18n: r.i18n, lat: CAMPUS.lat, lng: CAMPUS.lng };
    const v = e.venue && VENUES.find((x) => x.id === e.venue); return v ? { kind: 'venue', id: v.id, name: v.name, lat: v.lat, lng: v.lng, i18n: v.i18n } : null; };
  const TYPES = ['sports', 'creative', 'tech', 'intellectual', 'social'], LANGS = ['en', 'kk', 'ru'];
  const ROLES = ['student', 'organizer', 'moderator', 'admin'], STAFF = ['moderator', 'admin'];
  const REASONS = ['wrong_info', 'spam', 'offensive', 'safety', 'other'], C_STATUS = ['new', 'in_review', 'resolved', 'rejected'];
  const siteUrl = () => (typeof process !== 'undefined' && process.env && (process.env.SITE_URL || process.env.URL)) || '';
  const iso = (d) => new Date(d).toISOString();
  const rnd = () => 'CP-' + Array.from(globalThis.crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  class E extends Error { constructor(s, c, m) { super(m); this.s = s; this.c = c; } }
  const fail = (s, c, m) => { throw new E(s, c, m); };

  function seed() {
    const now = new Date(), t = iso(now), D = { users: [], clubs: [], events: [], regs: [], members: [], feedback: [], coins: [], notes: [], complaints: [], tgChats: {}, sessions: {}, seq: 1, created: t };
    const id = () => D.seq++;
    SEED.clubs.forEach((c) => D.clubs.push({ id: id(), ...c }));
    const club = (n) => D.clubs.find((c) => c.name === n).id;
    const gdsc = club('GDSC (Google Developer Student Club)');
    const U = (email, pw, name, sid, group, role, clubId) => { const u = { id: id(), email, pw, name, student_id: sid, group_name: group, role, club_id: clubId, lang: 'en', consent_at: /^s\d{3}@|^student1@/.test(email) ? t : null }; D.users.push(u); return u.id; };
    const ids = {};
    for (const a of SEED.accounts) ids[a.email] = U(a.email, a.password, a.name, a.studentId, a.group, a.role, a.club ? club(a.club) : null);
    const me = ids['student1@test.local'], org = ids['organizer1@test.local'];
    const F = SEED.first, L = SEED.last, crowd = [];
    for (let i = 0; i < 120; i++) crowd.push(U(`s${String(i + 1).padStart(3, '0')}@test.local`, 'Student123!', F[i % F.length] + ' ' + L[(i * 7 + 3) % L.length], String(240100 + i), 'ST-24' + String(i % 9 + 1).padStart(2, '0'), 'student', null));
    // Times are set in Astana time (UTC+5): Netlify servers run in UTC
    const TZ = 5, local = new Date(now.getTime() + TZ * 3600000);
    const at = (o, h, m) => new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + o, h - TZ, m));
    const all = [...SEED.events,
      { title: 'Open Lab Demo Day', room: 'C1.3.370L', club: 'GDSC (Google Developer Student Club)', location: 'Coworking Space, 1st Floor', type: 'tech', capacity: 30, taken: 8, coins: 25, description: 'Short demos of student projects. Check-in opens one hour before the start.', status: 'approved', waitlist: 0, demoSoon: true },
      { title: 'Welcome Fair of Clubs', room: 'C1.2.AT', club: 'Volunteers Club', location: 'Main Atrium', type: 'social', capacity: 200, taken: 60, coins: 20, description: 'Meet all student clubs in one place.', status: 'approved', waitlist: 0, past: -3, me: 'checked_in' },
      // past events for the attendance history of student1: one missed (no-show) and one cancelled
      { title: 'Board Games Evening', room: 'C1.2.CW', club: 'Board Games', location: 'Board games corner, coworking', type: 'intellectual', capacity: 24, taken: 20, coins: 15, description: 'An evening of strategy and party board games.', status: 'approved', waitlist: 0, past: -6, me: 'confirmed' },
      { title: 'Campus Photo Walk', room: 'C1.2.AT', club: 'ART Club', location: 'Main entrance', type: 'creative', capacity: 25, taken: 18, coins: 15, description: 'A walk around the campus to photograph its architecture.', status: 'approved', waitlist: 0, past: -10, me: 'cancelled' }];
    let ci = 0;
    for (const e of all) {
      const start = e.demoSoon ? new Date(now.getTime() + 30 * 60000) : e.past ? at(e.past, 12, 0) : at(e.dayOffset, e.hour, e.minute);
      const ev = { id: id(), room_code: e.room || null, venue: e.venue || null, title: e.title, i18n: e.i18n || (SEED.extraEventI18n || {})[e.title] || null, is_open: !!e.open, description: e.description, club_id: club(e.club), location: e.location, type: e.type, starts_at: iso(start), ends_at: iso(start.getTime() + 7200000), capacity: e.capacity, coins: e.coins, status: e.status, created_by: e.club === 'GDSC (Google Developer Student Club)' ? org : null, comment: null };
      D.events.push(ev);
      if (e.status !== 'approved') continue;
      for (let k = 0; k < e.taken; k++) { const st = e.open ? 'planned' : e.past ? 'checked_in' : 'confirmed'; D.regs.push(reg(id(), ev.id, crowd[(ci++) % 120], st, st === 'planned' ? null : rnd(), t)); }
      for (let k = 0; k < e.waitlist; k++) D.regs.push(reg(id(), ev.id, crowd[(ci++) % 120], 'waitlisted', null, t));
      if (e.past) { const r = reg(id(), ev.id, me, e.me, rnd(), t); if (e.me === 'checked_in') { r.method = 'qr'; D.coins.push({ user_id: me, amount: e.coins, reason: 'Check-in', event_id: ev.id, created_at: iso(start) }); } D.regs.push(r); }
    }
    D.coins.push({ user_id: me, amount: 100, reason: 'Welcome bonus', event_id: null, created_at: t });
    D.members.push({ user_id: me, club_id: gdsc, status: 'accepted', message: '', created_at: t });
    D.clubs.forEach((c, k) => { const n = 6 + ((k * 13) % 35); for (let j = 0; j < n; j++) { const uid = crowd[(k * 17 + j) % crowd.length]; if (!D.members.find((m) => m.user_id === uid && m.club_id === c.id)) D.members.push({ user_id: uid, club_id: c.id, status: 'accepted', message: '', created_at: t }); } });
    D.members.push({ user_id: crowd[0], club_id: club('Music Club'), status: 'pending', message: 'I play guitar and would like to join the acoustic nights.', created_at: t });
    for (const c of SEED.complaints || []) { const tg = c.targetType === 'event' ? D.events.find((e) => e.title === c.target) : D.clubs.find((x) => x.name === c.target); if (tg) D.complaints.push({ id: id(), user_id: ids[c.from], target_type: c.targetType, target_id: tg.id, reason: c.reason, text: c.text, status: c.status, admin_comment: null, handled_by: null, created_at: t, updated_at: t }); }
    return D;
  }
  function reg(id, event_id, user_id, status, ticket, t) { return { id, event_id, user_id, status, ticket, channel: 'off', day: true, hour: true, day_sent: false, hour_sent: false, method: null, created_at: t, updated_at: t }; }

  const astanaDay = (d) => new Date(new Date(d).getTime() + 5 * 3600000).toISOString().slice(0, 10);
  let D = state && state.created && astanaDay(state.created) === astanaDay(new Date()) ? state : seed();
  let TOKEN = null, NEW_TOKEN;

  // ---------- helpers mirroring server/app.js ----------
  const now = () => new Date();
  // Telegram messages are queued in D.outbox and sent by the Netlify Function after the data are saved
  const queue = (chatId, m) => (D.outbox || (D.outbox = [])).push({ chatId, text: m.text, reply_markup: m.reply_markup });
  const chatLang = (chatId) => (chatId && D.tgChats && D.tgChats[chatId]) || null;
  const notify = (uid, channel, text, tgMsg) => {
    D.notes.unshift({ user_id: uid, channel, text, createdAt: iso(now()) });
    const usr = D.users.find((x) => x.id === uid); if (channel === 'telegram' && usr && usr.telegram_chat_id) queue(usr.telegram_chat_id, tgMsg || { text: '🔔 CampusPass: ' + text });
  };
  const alert = (uid, text, tgMsgFor) => {
    D.notes.unshift({ user_id: uid, channel: 'app', text, createdAt: iso(now()) });
    const usr = D.users.find((x) => x.id === uid); if (usr && usr.telegram_chat_id && tgMsgFor) queue(usr.telegram_chat_id, tgMsgFor(chatLang(usr.telegram_chat_id) || usr.lang));
  };
  const user = () => { const s = TOKEN && D.sessions[TOKEN]; if (!s || s.exp < Date.now()) return null; return D.users.find((u) => u.id === s.uid) || null; };
  const need = (u, ...roles) => { if (!u) fail(401, 'auth_required', 'Please sign in.'); if (roles.length && !roles.includes(u.role)) fail(403, 'forbidden', 'You do not have access to this action.'); };
  const ev = (id) => { const e = D.events.find((x) => x.id === Number(id)); if (!e) fail(404, 'event_not_found', 'Event not found.'); return e; };
  const taken = (eid) => D.regs.filter((r) => r.event_id === eid && (r.status === 'confirmed' || r.status === 'checked_in')).length;
  const waitQ = (eid) => D.regs.filter((r) => r.event_id === eid && r.status === 'waitlisted').sort((a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : a.id - b.id));
  const canManage = (u, e) => STAFF.includes(u.role) || (u.role === 'organizer' && u.club_id === e.club_id);
  const balance = (uid) => D.coins.filter((c) => c.user_id === uid).reduce((a, c) => a + c.amount, 0);
  const str = (v, n, a, b) => { const s = typeof v === 'string' ? v.trim() : ''; if (s.length < a || s.length > b) fail(400, 'invalid_' + n, `${n[0].toUpperCase() + n.slice(1)} must be ${a}–${b} characters.`); return s; };
  function view(e, u) {
    const c = D.clubs.find((x) => x.id === e.club_id), tk = taken(e.id), q = waitQ(e.id);
    const o = { id: e.id, title: e.title, description: e.description, clubId: e.club_id, club: c.name, location: e.location, type: e.type, startsAt: e.starts_at, endsAt: e.ends_at, capacity: e.capacity, taken: tk, free: Math.max(0, e.capacity - tk), waitlist: q.length, coins: e.coins, status: e.status, i18n: e.i18n || null, clubI18n: c.i18n || null , place: placeOf(e), open: !!e.is_open, planned: e.is_open ? D.regs.filter((r) => r.event_id === e.id && r.status === 'planned').length : 0 };
    if (u) { const r = D.regs.find((x) => x.event_id === e.id && x.user_id === u.id); if (r && r.status !== 'cancelled') {
      o.my = { id: r.id, status: r.status, ticketCode: ['waitlisted', 'planned'].includes(r.status) ? null : r.ticket, reminder: { channel: r.channel, day: r.day, hour: r.hour } };
      if (r.status === 'waitlisted') o.my.position = q.indexOf(r) + 1;
      const f = D.feedback.find((x) => x.event_id === e.id && x.user_id === u.id); if (f) o.my.rating = f.rating; } }
    return o;
  }
  function reminders() {
    const t = now();
    for (const r of D.regs) {
      if (!['confirmed', 'planned'].includes(r.status) || r.channel === 'off') continue;
      const e = D.events.find((x) => x.id === r.event_id), mins = (new Date(e.starts_at) - t) / 60000; if (mins <= 0) continue;
      const tgMsg = (kind) => { if (r.channel !== 'telegram') return undefined; const usr = D.users.find((x) => x.id === r.user_id); return bot.reminder(chatLang(usr && usr.telegram_chat_id) || (usr && usr.lang), view(e, null), kind, siteUrl()); };
      const hourDue = r.hour && !r.hour_sent && mins <= 60;
      if (r.day && !r.day_sent && mins <= 1440) { if (!hourDue) notify(r.user_id, r.channel, `Reminder: ${e.title} starts in less than a day.`, tgMsg('day')); r.day_sent = true; }
      if (hourDue) { notify(r.user_id, r.channel, `Reminder: ${e.title} starts in less than an hour.`, tgMsg('hour')); r.hour_sent = true; }
    }
  }

  // FR-39 Event texts in EN / KK / RU (same rule as server/app.js)
  function eventTexts(b, room, venue) {
    const src = b.i18n && typeof b.i18n === 'object' ? b.i18n : { en: { title: b.title, description: b.description } };
    const i18n = {}, languages = [];
    for (const l of LANGS) {
      const x = src[l] || {}, title = typeof x.title === 'string' ? x.title.trim() : '', description = typeof x.description === 'string' ? x.description.trim() : '';
      if (!title && !description) continue;
      if (title.length < 3 || title.length > 120) fail(400, 'invalid_title', `Title (${l.toUpperCase()}) must be 3–120 characters.`);
      if (description.length < 10 || description.length > 1000) fail(400, 'invalid_description', `Description (${l.toUpperCase()}) must be 10–1000 characters.`);
      const pl = room || venue; i18n[l] = { title, description, location: pl ? (l !== 'en' && pl.i18n && pl.i18n[l] && pl.i18n[l].name) || pl.name : '' }; languages.push(l);
    }
    if (!languages.length) fail(400, 'invalid_title', 'Write the title and the description in at least one language.');
    const base = i18n[languages[0]]; return { title: base.title, description: base.description, location: (room || venue).name, i18n, languages };
  }
  function registerStudent(u, eventId) {
    const e = ev(eventId);
    if (e.status !== 'approved') fail(409, 'not_open', 'Registration is not open for this event.');
    if (e.starts_at <= iso(now())) fail(409, 'already_started', 'The event has already started.');
    let r = D.regs.find((x) => x.event_id === e.id && x.user_id === u.id);
    if (r && r.status !== 'cancelled') fail(409, 'already_registered', 'You are already registered or on the waitlist.');
    if (!u.consent_at) fail(403, 'consent_required', 'Accept the data processing terms first (C08).');
    const st = e.is_open ? 'planned' : taken(e.id) < e.capacity ? 'confirmed' : 'waitlisted', t = iso(now());
    if (r) Object.assign(r, { status: st, ticket: st === 'confirmed' ? rnd() : null, updated_at: t, day_sent: false, hour_sent: false });
    else { r = reg(D.seq++, e.id, u.id, st, st === 'confirmed' ? rnd() : null, t); D.regs.push(r); }
    notify(u.id, 'email', st === 'confirmed' ? `Registration confirmed: ${e.title}. Ticket ${r.ticket}.` : st === 'planned' ? `You plan to come to ${e.title}.` : `You joined the waitlist for ${e.title}.`);
    return view(e, u);
  }
  const targetTitle = (type, id) => { const x = type === 'event' ? D.events.find((e) => e.id === id) : D.clubs.find((c) => c.id === id); return x ? x.title || x.name : null; };
  const complaintOut = (c) => { const f = D.users.find((x) => x.id === c.user_id), h = c.handled_by && D.users.find((x) => x.id === c.handled_by); return { id: c.id, targetType: c.target_type, targetId: c.target_id, targetTitle: targetTitle(c.target_type, c.target_id), reason: c.reason, text: c.text, status: c.status, comment: c.admin_comment, createdAt: c.created_at, updatedAt: c.updated_at, fromName: f ? f.name : '', fromEmail: f ? f.email : '', handledBy: h ? h.name : null }; };
  function setUser(u, x, b) {
    const role = b.role === undefined ? x.role : b.role; if (!ROLES.includes(role)) fail(400, 'invalid_role', 'Role must be student, organizer, moderator or admin.');
    if (x.id === u.id && role !== x.role) fail(409, 'own_role', 'You cannot change your own role.');
    const name = b.name === undefined ? x.name : str(b.name, 'name', 2, 80);
    const clubId = role === 'organizer' ? Number(b.clubId === undefined ? x.club_id : b.clubId) : null;
    if (role === 'organizer' && !D.clubs.find((c) => c.id === clubId)) fail(404, 'club_not_found', 'Club not found.');
    const changed = role !== x.role || clubId !== x.club_id; Object.assign(x, { role, club_id: clubId, name });
    if (changed) for (const k of Object.keys(D.sessions)) if (D.sessions[k].uid === x.id) delete D.sessions[k];
    return { id: x.id, role, clubId, name };
  }
  function clubFields(b, old) {
    const name = str(b.name === undefined ? old.name : b.name, 'name', 2, 80), category = b.category === undefined ? old.category : b.category; if (!TYPES.includes(category)) fail(400, 'invalid_type', 'Choose a category.');
    const room = str(b.room === undefined ? old.room : b.room, 'room', 2, 120), description = str(b.description === undefined ? old.description : b.description, 'description', 10, 1000);
    let i18n = old.i18n || {};
    if (b.i18n && typeof b.i18n === 'object') { i18n = {}; for (const l of ['kk', 'ru']) { const x = b.i18n[l] || {}; const v = Object.fromEntries(['name', 'room', 'description'].map((f) => [f, typeof x[f] === 'string' ? x[f].trim().slice(0, 1000) : '']).filter(([, val]) => val)); if (Object.keys(v).length) i18n[l] = v; } }
    return { name, category, room, description, i18n };
  }

  // ---------- routes ----------
  const R = [];
  const on = (m, p, h) => R.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), h });
  on('GET', '/api/test-accounts', () => SEED.accounts.map((a) => ({ email: a.email, password: a.password, name: a.name, role: a.role, club: a.club })));
  // FR-08 / SW02 Telegram: link with a one-time code, test message, disconnect
  const hex = (n) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
  on('GET', '/api/me/telegram', (b, u) => { need(u); return { connected: !!u.telegram_chat_id }; });
  on('POST', '/api/me/telegram/link', (b, u) => { need(u); u.telegram_code = hex(12); return { code: u.telegram_code }; });
  on('POST', '/api/me/telegram/test', (b, u) => { need(u); if (!u.telegram_chat_id) fail(400, 'telegram_not_connected', 'Connect Telegram first.'); queue(u.telegram_chat_id, { text: '🔔 CampusPass: this is a test message. Reminders for your events will arrive here.' }); return { sent: true }; });
  on('DELETE', '/api/me/telegram', (b, u) => { need(u); u.telegram_chat_id = null; u.telegram_code = null; return { connected: false }; });
  // Database overview for the moderator: the collections of the shared store, with secrets masked
  on('GET', '/api/admin/db', (b, u) => {
    need(u, 'admin'); const SECRET = /pw|password|token|telegram_/;
    return Object.entries(D).filter(([, v]) => Array.isArray(v)).map(([k, v]) => ({ table: k, count: v.length,
      columns: [...new Set(v.slice(0, 20).flatMap((r) => Object.keys(r)))].map((c) => ({ name: c, type: typeof (v.find((r) => r[c] != null) || {})[c], pk: c === 'id', ref: /_id$/.test(c) && c !== 'student_id' ? c.replace(/_id$/, 's') : null })),
      sample: v.slice(0, 3).map((r) => Object.fromEntries(Object.entries(r).map(([c, x]) => [c, SECRET.test(c) && x != null ? '•••' : x]))) }));
  });
  on('POST', '/api/admin/reset', (b, u) => { need(u, 'admin'); D = seed(); NEW_TOKEN = ''; return { ok: true }; });
  on('POST', '/api/auth/login', (b) => { const u = D.users.find((x) => x.email === String(b.email || '').trim().toLowerCase()); if (!u || u.pw !== b.password) fail(401, 'invalid_credentials', 'Wrong e-mail or password.'); const tk = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''); D.sessions[tk] = { uid: u.id, exp: Date.now() + 12 * 3600000 }; NEW_TOKEN = tk; return { user: { id: u.id, name: u.name, email: u.email, role: u.role } }; });
  on('POST', '/api/auth/logout', () => { if (TOKEN) delete D.sessions[TOKEN]; NEW_TOKEN = ''; return { ok: true }; });
  on('GET', '/api/me', (b, u) => { need(u); const c = u.club_id ? D.clubs.find((x) => x.id === u.club_id) : null; return { id: u.id, name: u.name, email: u.email, studentId: u.student_id, group: u.group_name, role: u.role, lang: u.lang, club: c ? { id: c.id, name: c.name } : null, coins: balance(u.id), consentAt: u.consent_at || null }; });
  on('POST', '/api/me/consent', (b, u) => { need(u); u.consent_at = iso(now()); return { consentAt: u.consent_at }; });
  on('DELETE', '/api/me/consent', (b, u) => { need(u); Object.assign(u, { consent_at: null, telegram_chat_id: null, telegram_code: null }); return { consentAt: null }; });
  on('PUT', '/api/me/lang', (b, u) => { need(u); u.lang = b.lang; return { lang: b.lang }; });
  on('GET', '/api/events', (b, u, p, q) => { const days = Math.min(60, Number(q.get('days')) || 7), f = iso(now()), to = iso(now().getTime() + days * 86400000); return D.events.filter((e) => e.status === 'approved' && e.ends_at > f && e.starts_at < to).sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => view(e, u)); });
  on('GET', '/api/events/:id', (b, u, p) => view(ev(p.id), u));
  on('GET', '/api/events/:id/ics', (b, u, p) => { const e = ev(p.id), f = (s) => s.replace(/[-:]/g, '').replace(/\.\d{3}/, ''); return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CampusPass//Demo//EN', 'BEGIN:VEVENT', `UID:event-${e.id}@campuspass.local`, `DTSTAMP:${f(iso(now()))}`, `DTSTART:${f(e.starts_at)}`, `DTEND:${f(e.ends_at)}`, `SUMMARY:${e.title}`, `LOCATION:${e.location}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'); });
  on('POST', '/api/events/:id/register', (b, u, p) => { need(u, 'student'); return registerStudent(u, Number(p.id)); });
  on('DELETE', '/api/events/:id/registration', (b, u, p) => {
    need(u, 'student'); const e = ev(p.id), r = D.regs.find((x) => x.event_id === e.id && x.user_id === u.id && ['confirmed', 'waitlisted', 'planned'].includes(x.status));
    if (!r) fail(404, 'not_registered', 'You are not registered for this event.');
    if (e.starts_at <= iso(now())) fail(409, 'already_started', 'The event has already started.');
    const was = r.status; r.status = 'cancelled'; r.updated_at = iso(now()); let promoted = null;
    if (was === 'confirmed') { const n = waitQ(e.id)[0]; if (n) { n.status = 'confirmed'; n.ticket = rnd(); n.updated_at = iso(now()); alert(n.user_id, `A seat became free: you are now registered for ${e.title}. Ticket ${n.ticket}.`, (lang) => bot.promotedMsg(lang, view(e, null), n.ticket)); promoted = n.user_id; } }
    return { ok: true, promotedUserId: promoted };
  });
  on('PUT', '/api/registrations/:id/reminders', (b, u, p) => { need(u, 'student'); const r = D.regs.find((x) => x.id === Number(p.id) && x.user_id === u.id); if (!r) fail(404, 'not_found', 'Registration not found.'); if (!['off', 'push', 'telegram'].includes(b.channel)) fail(400, 'invalid_channel', 'Channel must be off, push or telegram.'); Object.assign(r, { channel: b.channel, day: !!b.day, hour: !!b.hour }); return { channel: r.channel, day: r.day, hour: r.hour }; });
  on('GET', '/api/me/registrations', (b, u) => { need(u); return D.regs.filter((r) => r.user_id === u.id && r.status !== 'cancelled').map((r) => ev(r.event_id)).sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => view(e, u)); });
  on('GET', '/api/me/history', (b, u) => {
    need(u); const t = iso(now());
    const items = D.regs.filter((r) => r.user_id === u.id).map((r) => ({ r, e: ev(r.event_id) })).filter(({ r, e }) => e.starts_at <= t || r.status === 'cancelled')
      .sort((a, c) => (a.e.starts_at < c.e.starts_at ? 1 : -1)).map(({ r, e }) => {
        const ended = e.ends_at <= t; const result = r.status === 'checked_in' ? 'attended' : r.status === 'cancelled' ? 'cancelled' : r.status === 'waitlisted' ? 'expired' : r.status === 'planned' ? (ended ? 'planned' : 'ongoing') : ended ? 'missed' : 'ongoing';
        return { ...view(e, u), result, coinsEarned: result === 'attended' ? e.coins : 0 };
      }).filter((x) => x.result !== 'ongoing');
    return { items, attended: items.filter((x) => x.result === 'attended').length, missed: items.filter((x) => x.result === 'missed').length };
  });
  on('GET', '/api/me/coins', (b, u) => { need(u); return { balance: balance(u.id), history: D.coins.filter((c) => c.user_id === u.id).sort((a, c) => (a.created_at < c.created_at ? 1 : -1)).map((c) => ({ amount: c.amount, reason: c.reason, createdAt: c.created_at, event: c.event_id ? ev(c.event_id).title : null })) }; });
  on('GET', '/api/me/notifications', (b, u) => { need(u); return D.notes.filter((n) => n.user_id === u.id).slice(0, 30); });
  on('POST', '/api/events/:id/feedback', (b, u, p) => {
    need(u, 'student'); const eid = Number(p.id), rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, 'invalid_rating', 'Rating must be 1–5.');
    if (!D.regs.find((r) => r.event_id === eid && r.user_id === u.id && r.status === 'checked_in')) fail(409, 'not_attended', 'You can rate only events you attended.');
    if (D.feedback.find((f) => f.event_id === eid && f.user_id === u.id)) fail(409, 'already_rated', 'You have already rated this event.');
    D.feedback.push({ event_id: eid, user_id: u.id, rating }); return { rating };
  });
  on('GET', '/api/clubs', (b, u) => D.clubs.map((c) => { const m = u && D.members.find((x) => x.user_id === u.id && x.club_id === c.id); return { ...c, members: D.members.filter((x) => x.club_id === c.id && x.status === 'accepted').length, myStatus: m ? m.status : null }; }).sort((a, c) => a.name.localeCompare(c.name)));
  on('POST', '/api/clubs/:id/join', (b, u, p) => {
    need(u, 'student'); const cid = Number(p.id); if (!D.clubs.find((c) => c.id === cid)) fail(404, 'club_not_found', 'Club not found.');
    const m = D.members.find((x) => x.user_id === u.id && x.club_id === cid);
    if (m && m.status !== 'declined') fail(409, 'already_requested', 'You already sent a request or are a member.');
    if (m) Object.assign(m, { status: 'pending', message: String(b.message || '').slice(0, 500), created_at: iso(now()) });
    else D.members.push({ user_id: u.id, club_id: cid, status: 'pending', message: String(b.message || '').slice(0, 500), created_at: iso(now()) });
    return { status: 'pending' };
  });
  on('GET', '/api/places', (b, u) => { need(u); return { campus: CAMPUS, rooms: ROOMS, venues: VENUES }; });
  on('GET', '/api/rooms/availability', (b, u, p, q) => {
    need(u, 'organizer', ...STAFF); const start = new Date(q.get('start')); if (isNaN(start)) fail(400, 'invalid_start', 'Enter a valid date and time.');
    const minutes = Math.min(720, Math.max(15, Number(q.get('minutes')) || 120)), end = new Date(start.getTime() + minutes * 60000);
    return ROOMS.map((r) => ({ ...r, ...availability(r, ROOMS, start, end, D.events) }));
  });
  on('POST', '/api/events', (b, u) => {
    need(u, 'organizer', 'admin');
    const room = b.roomCode ? ROOMS.find((x) => x.code === b.roomCode) : null, venue = b.venueId ? VENUES.find((x) => x.id === b.venueId) : null;
    if (!room && !venue) fail(400, 'place_required', 'Choose a free room on campus or a place in the city.');
    const texts = eventTexts(b, room, venue);
    if (!TYPES.includes(b.type)) fail(400, 'invalid_type', 'Choose an event type.');
    const s = new Date(b.startsAt); if (isNaN(s)) fail(400, 'invalid_start', 'Enter a valid date and time.'); if (s <= now()) fail(400, 'start_in_past', 'The event must start in the future.');
    const mins = Number(b.durationMinutes) || 120; if (mins < 15 || mins > 720) fail(400, 'invalid_duration', 'Duration must be 15–720 minutes.');
    const cap = Number(b.capacity); if (!Number.isInteger(cap) || cap < 1 || cap > 500) fail(400, 'invalid_capacity', 'Seats must be 1–500.');
    if (room && cap > room.capacity) fail(400, 'room_too_small', `This room has ${room.capacity} seats.`);
    if (room && !availability(room, ROOMS, s, new Date(s.getTime() + mins * 60000), D.events).free) fail(409, 'room_busy', 'The room is not free at this time.');
    const clubId = u.role === 'admin' ? Number(b.clubId) : u.club_id; if (!D.clubs.find((c) => c.id === clubId)) fail(404, 'club_not_found', 'Club not found.');
    const e = { id: D.seq++, room_code: room ? room.code : null, venue: venue ? venue.id : null, title: texts.title, i18n: texts.i18n, description: texts.description, club_id: clubId, location: texts.location, type: b.type, starts_at: iso(s), ends_at: iso(s.getTime() + mins * 60000), capacity: cap, coins: b.open === true ? 0 : 20, is_open: b.open === true, status: 'pending', created_by: u.id, comment: null };
    D.events.push(e); const newEv = view(e, null); D.users.filter((x) => STAFF.includes(x.role)).forEach((a) => alert(a.id, `New event waiting for review: ${texts.title}.`, (lang) => bot.newEventAlert(lang, newEv, siteUrl()))); return { id: e.id, status: 'pending', languages: texts.languages };
  });
  on('GET', '/api/organizer/events', (b, u) => { need(u, 'organizer', ...STAFF); return D.events.filter((e) => STAFF.includes(u.role) || e.club_id === u.club_id).sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => ({ ...view(e, null), comment: e.comment })); });
  on('GET', '/api/events/:id/participants', (b, u, p) => { need(u, 'organizer', ...STAFF); const e = ev(p.id); if (!canManage(u, e)) fail(403, 'forbidden', "You can manage only your club's events."); return D.regs.filter((r) => r.event_id === e.id && (r.status === 'confirmed' || r.status === 'checked_in')).map((r) => { const s = D.users.find((x) => x.id === r.user_id); return { id: r.id, status: r.status, method: r.method, name: s.name, studentId: s.student_id }; }).sort((a, c) => a.name.localeCompare(c.name)); });
  on('POST', '/api/checkin', (b, u) => {
    need(u, 'organizer', ...STAFF); const e = ev(b.eventId); if (!canManage(u, e)) fail(403, 'forbidden', "You can check in only at your club's events.");
    const t = now(); if (t < new Date(new Date(e.starts_at).getTime() - 3600000) || t > new Date(e.ends_at)) fail(409, 'checkin_closed', 'Check-in is open from 1 hour before the start until the end of the event.');
    let r, method;
    if (b.ticketCode) { r = D.regs.find((x) => x.ticket === String(b.ticketCode).trim().toUpperCase()); method = 'qr'; if (!r) fail(404, 'ticket_not_found', 'Ticket not found.'); if (r.event_id !== e.id) fail(409, 'wrong_event', 'This ticket is for another event.'); }
    else if (b.registrationId) { r = D.regs.find((x) => x.id === Number(b.registrationId) && x.event_id === e.id); method = 'manual'; if (!r) fail(404, 'registration_not_found', 'Registration not found.'); }
    else fail(400, 'code_required', 'Enter the ticket code or choose a student from the list.');
    if (r.status === 'checked_in') fail(409, 'already_checked_in', 'This student is already checked in.');
    if (r.status !== 'confirmed') fail(409, 'not_confirmed', 'This registration is not confirmed.');
    Object.assign(r, { status: 'checked_in', method, updated_at: iso(t) }); D.coins.push({ user_id: r.user_id, amount: e.coins, reason: 'Check-in', event_id: e.id, created_at: iso(t) });
    const s = D.users.find((x) => x.id === r.user_id); return { ok: true, name: s.name, studentId: s.student_id, coins: e.coins, method };
  });
  on('GET', '/api/admin/pending-events', (b, u) => { need(u, ...STAFF); return D.events.filter((e) => e.status === 'pending').map((e) => view(e, null)); });
  on('POST', '/api/admin/events/:id/decision', (b, u, p) => {
    need(u, ...STAFF); const e = ev(p.id); if (e.status !== 'pending') fail(409, 'not_pending', 'This event is not waiting for review.');
    if (!['approve', 'reject'].includes(b.decision)) fail(400, 'invalid_decision', 'Decision must be approve or reject.');
    const c = String(b.comment || '').trim().slice(0, 500); if (b.decision === 'reject' && c.length < 5) fail(400, 'comment_required', 'Write a short reason for the rejection.');
    if (b.decision === 'approve' && e.room_code) { const r = ROOMS.find((x) => x.code === e.room_code); if (r && !availability(r, ROOMS, e.starts_at, e.ends_at, D.events.filter((x) => x.status === 'approved'), e.id).free) fail(409, 'room_busy', 'The room is not free at this time.'); }
    e.status = b.decision === 'approve' ? 'approved' : 'rejected'; e.comment = c || null; if (e.created_by) alert(e.created_by, `Your event "${e.title}" was ${e.status}.${c ? ' Comment: ' + c : ''}`, (lang) => bot.decisionMsg(lang, view(e, null), e.status, c)); return { id: e.id, status: e.status };
  });
  on('GET', '/api/admin/club-requests', (b, u) => { need(u, ...STAFF); return D.members.filter((m) => m.status === 'pending').map((m) => { const s = D.users.find((x) => x.id === m.user_id); return { userId: m.user_id, clubId: m.club_id, message: m.message, createdAt: m.created_at, name: s.name, studentId: s.student_id, club: D.clubs.find((c) => c.id === m.club_id).name, clubI18n: D.clubs.find((c) => c.id === m.club_id).i18n || null }; }); });
  on('POST', '/api/admin/club-requests/decision', (b, u) => {
    need(u, ...STAFF); const m = D.members.find((x) => x.user_id === Number(b.userId) && x.club_id === Number(b.clubId) && x.status === 'pending'); if (!m) fail(404, 'request_not_found', 'Request not found.');
    if (!['accept', 'decline'].includes(b.decision)) fail(400, 'invalid_decision', 'Decision must be accept or decline.');
    m.status = b.decision === 'accept' ? 'accepted' : 'declined'; const cl = D.clubs.find((c) => c.id === m.club_id);
    alert(m.user_id, `Your request to join ${cl.name} was ${m.status}.`, (lang) => bot.clubDecisionMsg(lang, (cl.i18n && cl.i18n[lang] && cl.i18n[lang].name) || cl.name, m.status)); return { status: m.status };
  });
  on('GET', '/api/admin/stats', (b, u) => {
    need(u, ...STAFF);
    const events = D.events.filter((e) => e.status === 'approved').sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => { const v = view(e, null), f = D.feedback.filter((x) => x.event_id === e.id); return { id: e.id, title: e.title, i18n: e.i18n || null, startsAt: e.starts_at, capacity: e.capacity, registered: v.taken, fillRate: Math.round((v.taken / e.capacity) * 100), waitlist: v.waitlist, checkedIn: D.regs.filter((r) => r.event_id === e.id && r.status === 'checked_in').length, avgRating: f.length ? Math.round((f.reduce((a, x) => a + x.rating, 0) / f.length) * 10) / 10 : null }; });
    return { totals: { clubs: D.clubs.length, approvedEvents: events.length, registrations: events.reduce((a, e) => a + e.registered, 0), pending: D.events.filter((e) => e.status === 'pending').length + D.members.filter((m) => m.status === 'pending').length, complaints: D.complaints.filter((c) => c.status === 'new' || c.status === 'in_review').length }, events };
  });
  on('GET', '/api/admin/users', (b, u, p, q) => {
    need(u, 'admin'); const k = String(q.get('q') || '').trim().toLowerCase(), rank = { admin: 0, moderator: 1, organizer: 2, student: 3 };
    const rows = D.users.slice().sort((a, c) => rank[a.role] - rank[c.role] || a.name.localeCompare(c.name)).map((x) => ({ id: x.id, name: x.name, email: x.email, role: x.role, clubId: x.club_id, studentId: x.student_id, grp: x.group_name, club: x.club_id ? (D.clubs.find((c) => c.id === x.club_id) || {}).name : null, telegram: !!x.telegram_chat_id }));
    return k ? rows.filter((x) => (x.name + ' ' + x.email + ' ' + (x.studentId || '')).toLowerCase().includes(k)).slice(0, 50) : rows.filter((x) => !/^s\d{3}@test\.local$/.test(x.email));
  });
  on('PUT', '/api/admin/users/:id/role', (b, u, p) => { need(u, 'admin'); const x = D.users.find((y) => y.id === Number(p.id)); if (!x) fail(404, 'user_not_found', 'User not found.'); return setUser(u, x, { role: b.role, clubId: b.clubId }); });
  on('PUT', '/api/admin/users/:id', (b, u, p) => { need(u, 'admin'); const x = D.users.find((y) => y.id === Number(p.id)); if (!x) fail(404, 'user_not_found', 'User not found.'); return setUser(u, x, b); });
  on('GET', '/api/admin/events', (b, u) => { need(u, 'admin'); return D.events.slice().sort((a, c) => (a.starts_at < c.starts_at ? 1 : -1)).map((e) => ({ ...view(e, null), comment: e.comment, roomCode: e.room_code, venueId: e.venue })); });
  on('PUT', '/api/admin/events/:id', (b, u, p) => {
    need(u, 'admin'); const e = ev(p.id);
    const room = e.room_code ? ROOMS.find((x) => x.code === e.room_code) : null, venue = e.venue ? VENUES.find((x) => x.id === e.venue) : null;
    const texts = b.i18n ? eventTexts(b, room, venue) : null;
    const type = b.type === undefined ? e.type : b.type; if (!TYPES.includes(type)) fail(400, 'invalid_type', 'Choose an event type.');
    const s = b.startsAt === undefined ? new Date(e.starts_at) : new Date(b.startsAt); if (isNaN(s)) fail(400, 'invalid_start', 'Enter a valid date and time.');
    const mins = b.durationMinutes === undefined ? (new Date(e.ends_at) - new Date(e.starts_at)) / 60000 : Number(b.durationMinutes); if (!(mins >= 15 && mins <= 720)) fail(400, 'invalid_duration', 'Duration must be 15–720 minutes.');
    const cap = b.capacity === undefined ? e.capacity : Number(b.capacity); if (!Number.isInteger(cap) || cap < 1 || cap > 500) fail(400, 'invalid_capacity', 'Seats must be 1–500.');
    const coins = b.coins === undefined ? e.coins : Number(b.coins); if (!Number.isInteger(coins) || coins < 0 || coins > 100) fail(400, 'invalid_coins', 'Coins must be 0–100.');
    const status = b.status === undefined ? e.status : b.status; if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) fail(400, 'invalid_status', 'Unknown status.');
    if (status === 'cancelled' && e.status !== 'cancelled') D.regs.filter((r) => r.event_id === e.id && ['confirmed', 'waitlisted', 'planned'].includes(r.status)).forEach((r) => { notify(r.user_id, 'app', `The event "${e.title}" was cancelled.`); r.status = 'cancelled'; r.updated_at = iso(now()); });
    if (texts) Object.assign(e, { title: texts.title, description: texts.description, i18n: texts.i18n });
    Object.assign(e, { type, starts_at: iso(s), ends_at: iso(s.getTime() + mins * 60000), capacity: cap, coins, status });
    return { ...view(e, null), comment: e.comment };
  });
  on('DELETE', '/api/admin/events/:id', (b, u, p) => {
    need(u, 'admin'); const e = ev(p.id);
    D.regs = D.regs.filter((r) => r.event_id !== e.id); D.feedback = D.feedback.filter((f) => f.event_id !== e.id); D.coins.forEach((c) => { if (c.event_id === e.id) c.event_id = null; });
    D.complaints = D.complaints.filter((c) => !(c.target_type === 'event' && c.target_id === e.id)); D.events = D.events.filter((x) => x !== e); return { deleted: e.id };
  });
  on('POST', '/api/admin/clubs', (b, u) => { need(u, 'admin'); const f = clubFields(b, {}); if (D.clubs.find((c) => c.name === f.name)) fail(409, 'club_exists', 'A club with this name already exists.'); const c = { id: D.seq++, icon: null, ...f }; D.clubs.push(c); return c; });
  on('PUT', '/api/admin/clubs/:id', (b, u, p) => { need(u, 'admin'); const c = D.clubs.find((x) => x.id === Number(p.id)); if (!c) fail(404, 'club_not_found', 'Club not found.'); const f = clubFields(b, c); if (f.name !== c.name && D.clubs.find((x) => x.name === f.name)) fail(409, 'club_exists', 'A club with this name already exists.'); Object.assign(c, f); return c; });
  // FR-43 … FR-45 Complaints
  on('POST', '/api/complaints', (b, u) => {
    need(u); if (!['event', 'club'].includes(b.targetType)) fail(400, 'invalid_target', 'Choose an event or a club.');
    const tid = Number(b.targetId), title = targetTitle(b.targetType, tid); if (!title) fail(404, b.targetType === 'event' ? 'event_not_found' : 'club_not_found', 'Not found.');
    if (!REASONS.includes(b.reason)) fail(400, 'invalid_reason', 'Choose a reason.');
    const text = str(b.text, 'complaint', 5, 500);
    if (D.complaints.find((c) => c.user_id === u.id && c.target_type === b.targetType && c.target_id === tid && (c.status === 'new' || c.status === 'in_review'))) fail(409, 'already_complained', 'You already reported this.');
    const t = iso(now()), c = { id: D.seq++, user_id: u.id, target_type: b.targetType, target_id: tid, reason: b.reason, text, status: 'new', admin_comment: null, handled_by: null, created_at: t, updated_at: t };
    D.complaints.push(c);
    const info = { id: c.id, targetType: b.targetType, targetTitle: title, reason: b.reason, fromName: u.name, text };
    D.users.filter((x) => x.role === 'admin').forEach((a) => alert(a.id, `New complaint #${c.id} about ${b.targetType} "${title}": ${text}`, (lang) => bot.complaintAlert(lang, info, siteUrl())));
    return { id: c.id, status: 'new' };
  });
  on('GET', '/api/me/complaints', (b, u) => { need(u); return D.complaints.filter((c) => c.user_id === u.id).sort((a, c) => c.id - a.id).map(complaintOut); });
  on('GET', '/api/admin/complaints', (b, u) => { need(u, 'admin'); const rank = { new: 0, in_review: 1, resolved: 2, rejected: 2 }; return D.complaints.slice().sort((a, c) => rank[a.status] - rank[c.status] || c.id - a.id).map(complaintOut); });
  on('PUT', '/api/admin/complaints/:id', (b, u, p) => {
    need(u, 'admin'); const c = D.complaints.find((x) => x.id === Number(p.id)); if (!c) fail(404, 'complaint_not_found', 'Complaint not found.');
    if (!C_STATUS.includes(b.status) || b.status === 'new') fail(400, 'invalid_status', 'Status must be in_review, resolved or rejected.');
    const comment = String(b.comment || '').trim().slice(0, 500); if ((b.status === 'resolved' || b.status === 'rejected') && comment.length < 5) fail(400, 'answer_required', 'Write a short answer to the person (at least 5 characters).');
    Object.assign(c, { status: b.status, admin_comment: comment || c.admin_comment, handled_by: u.id, updated_at: iso(now()) });
    alert(c.user_id, `Your complaint #${c.id} is now: ${b.status.replace('_', ' ')}.${comment ? ' Answer: ' + comment : ''}`, (lang) => bot.complaintStatusMsg(lang, c.id, b.status, comment)); return { id: c.id, status: c.status };
  });
  function handle(method, url, body, token) {
    TOKEN = token || null; NEW_TOKEN = undefined;
    const u = new URL(url, 'http://localhost');
    try {
      const r = R.find((x) => x.m === method && x.re.test(u.pathname)); if (!r) fail(404, 'not_found', 'Unknown API endpoint.');
      reminders();
      const data = r.h(body || {}, user(), r.re.exec(u.pathname).groups || {}, u.searchParams);
      return { status: 200, data, token: NEW_TOKEN };
    } catch (e) { return e instanceof E ? { status: e.s, data: { error: { code: e.c, message: e.message } } } : { status: 500, data: { error: { code: 'server_error', message: 'Something went wrong.' } } }; }
  }
  const linkTelegram = (code, chatId) => { const u = D.users.find((x) => x.telegram_code && x.telegram_code === code); if (!u) return null; D.users.forEach((x) => { if (x.telegram_chat_id === chatId) x.telegram_chat_id = null; }); u.telegram_chat_id = chatId; u.telegram_code = null; return u.name; };
  // Data adapter for the Telegram bot (server/bot.js)
  const botApi = {
    chatInfo: (chatId) => { const u = D.users.find((x) => x.telegram_chat_id === String(chatId)); return { lang: chatLang(String(chatId)), await: (D.tgWait && D.tgWait[String(chatId)]) || null, user: u ? { id: u.id, name: u.name, role: u.role, lang: u.lang } : null }; },
    setAwait: (chatId, value) => { const w = D.tgWait || (D.tgWait = {}); if (value) w[String(chatId)] = value; else delete w[String(chatId)]; },
    call: (userId, method, path, body) => callAs(userId, method, path, body),
    anyEvent: (id) => { const e = D.events.find((x) => x.id === id); return e ? view(e, null) : null; },
    setChatLang: (chatId, lang) => { if (LANGS.includes(lang)) (D.tgChats || (D.tgChats = {}))[String(chatId)] = lang; },
    link: (code, chatId) => linkTelegram(code, String(chatId)),
    unlink: (chatId) => { D.users.forEach((x) => { if (x.telegram_chat_id === String(chatId)) x.telegram_chat_id = null; }); return true; },
    events: (from, to, userId) => { const u = userId && D.users.find((x) => x.id === userId); return D.events.filter((e) => e.status === 'approved' && e.ends_at > iso(from) && e.starts_at < iso(to)).sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => view(e, u || null)); },
    event: (id, userId) => { const e = D.events.find((x) => x.id === id && x.status === 'approved'); const u = userId && D.users.find((x) => x.id === userId); return e ? view(e, u || null) : null; },
    myEvents: (userId) => { const u = D.users.find((x) => x.id === userId); return D.regs.filter((r) => r.user_id === userId && r.status !== 'cancelled').map((r) => D.events.find((e) => e.id === r.event_id)).filter(Boolean).sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => view(e, u)); },
    register: (userId, eventId) => { const u = D.users.find((x) => x.id === userId); try { return registerStudent(u, eventId); } catch (e) { const err = new Error(e.message); err.code = e.c; throw err; } }
  };
  // The bot acts as the linked user through the same routes as the website (rights are checked in one place)
  function callAs(userId, method, url, body) {
    const usr = D.users.find((x) => x.id === userId), u = new URL(url, 'http://bot');
    const r = R.find((x) => x.m === method && x.re.test(u.pathname)); if (!r) fail(404, 'not_found', 'Unknown API endpoint.');
    try { return r.h(body || {}, usr, r.re.exec(u.pathname).groups || {}, u.searchParams); }
    catch (e) { if (e instanceof E) { const err = new Error(e.message); err.code = e.c; throw err; } throw e; }
  }
  // Scheduled run (netlify/functions/reminders.mjs): only the reminders, no request
  const tick = () => { reminders(); };
  return { handle, linkTelegram, botApi, tick, get state() { return D; } };
}
module.exports = { createCore };
