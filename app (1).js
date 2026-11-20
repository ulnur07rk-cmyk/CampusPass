// CampusPass — HTTP API and static files. Requirement IDs (FR-xx) refer to SRS section 4.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { tx, iso, reset } = require('./db');
const auth = require('./auth');

const PUBLIC = path.join(__dirname, '..', 'public');
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
const ACCOUNTS = SEED.accounts, ROOMS = SEED.rooms, VENUES = SEED.venues, CAMPUS = SEED.campus;
const { availability } = require('./rooms');
const assistant = require('./assistant');
const bot = require('./bot');
// Place of an event: a room on the campus floor plans or a venue in the city (F3, F22)
function placeOf(e) {
  const r = e.room_code && ROOMS.find((x) => x.code === e.room_code);
  if (r) return { kind: 'room', code: r.code, name: r.name, floor: r.floor, x: r.x, y: r.y, capacity: r.capacity, i18n: r.i18n, lat: CAMPUS.lat, lng: CAMPUS.lng };
  const v = e.venue && VENUES.find((x) => x.id === e.venue);
  if (v) return { kind: 'venue', id: v.id, name: v.name, lat: v.lat, lng: v.lng, i18n: v.i18n };
  return null;
}
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const TYPES = ['sports', 'creative', 'tech', 'intellectual', 'social'];
const LANGS = ['en', 'kk', 'ru'];
// Roles: student, organizer (one club), moderator (Student Affairs: moderation, statistics), admin (everything, complaints)
const ROLES = ['student', 'organizer', 'moderator', 'admin', 'shop'];
const STAFF = ['moderator', 'admin'];
const REASONS = ['wrong_info', 'spam', 'offensive', 'safety', 'other'];
const C_STATUS = ['new', 'in_review', 'resolved', 'rejected'];
// FR-28 … FR-33 Coin redemption in the university merch shop (agreement with the shop, Appendix D)
// BR-07 offers: 5 % for 300 coins, 10 % for 700 coins (agreed with the university) · BR-08 at most 2 000 ₸ discount per purchase, one voucher per purchase
// BR-09 a voucher is valid 7 days and only once; unused coins come back · BR-10 coins expire at the end of the academic year (30 June)
const SHOP = { offers: [{ pct: 5, coins: 300 }, { pct: 10, coins: 700 }], maxDiscount: 2000, validDays: 7 };
const yearStart = (d) => { const x = new Date(d); const y = x.getUTCMonth() >= 7 ? x.getUTCFullYear() : x.getUTCFullYear() - 1; return new Date(Date.UTC(y, 7, 1) - 5 * 3600000); }; // 1 August, Astana time
const yearEnd = (d) => new Date(Date.UTC(yearStart(d).getUTCFullYear() + 1, 5, 30, 23, 59) - 5 * 3600000); // 30 June
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const fail = (status, code, message) => { throw new HttpError(status, code, message); };

function createApp(db, opts = {}) {
  const ttlHours = opts.sessionTtlHours || 12;
  const now = () => (opts.clock ? opts.clock() : new Date());
  const q = (sql) => db.prepare(sql);
  const tg = opts.telegram || { enabled: false, send: async () => false, botName: async () => null };
  // Every notification goes to the in-app inbox; reminders with the Telegram channel are also sent to the real Telegram chat
  const siteUrl = () => process.env.SITE_URL || '';
  const notify = (userId, channel, text, tgMsg) => {
    q('INSERT INTO notifications (user_id, channel, text, created_at) VALUES (?,?,?,?)').run(userId, channel, text, iso(now()));
    if (channel === 'telegram' && tg.enabled) { const u = q('SELECT telegram_chat_id FROM users WHERE id = ?').get(userId); if (u && u.telegram_chat_id) tg.send(u.telegram_chat_id, tgMsg ? tgMsg.text : '🔔 CampusPass: ' + text, tgMsg && tgMsg.reply_markup); }
  };
  // In-app message and, if the person linked Telegram, the same alert in Telegram (used for complaints)
  const alert = (userId, text, tgMsgFor) => {
    q('INSERT INTO notifications (user_id, channel, text, created_at) VALUES (?,?,?,?)').run(userId, 'app', text, iso(now()));
    const u = q('SELECT telegram_chat_id, lang FROM users WHERE id = ?').get(userId);
    if (tg.enabled && u && u.telegram_chat_id && tgMsgFor) { const m = tgMsgFor(chatLang(u.telegram_chat_id) || u.lang); tg.send(u.telegram_chat_id, m.text, m.reply_markup); }
  };
  const chatLang = (chatId) => { const r = chatId && q('SELECT lang FROM telegram_chats WHERE chat_id = ?').get(String(chatId)); return r ? r.lang : null; };
  const newTicket = () => 'CP-' + crypto.randomBytes(5).toString('hex').toUpperCase();

  // ---------- helpers ----------
  function currentUser(req) {
    const m = /(?:^|;\s*)cp_session=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (!m) return null;
    const row = q(`SELECT u.id, u.email, u.name, u.student_id, u.group_name, u.role, u.club_id, u.lang, s.expires_at
                   FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(m[1]);
    if (!row || row.expires_at < iso(now())) return null;
    row.token = m[1];
    return row;
  }
  const need = (u, ...roles) => { if (!u) fail(401, 'auth_required', 'Please sign in.'); if (roles.length && !roles.includes(u.role)) fail(403, 'forbidden', 'You do not have access to this action.'); };
  const int = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) fail(400, 'bad_id', 'Invalid id.'); return n; };
  const str = (v, name, min, max) => { const s = typeof v === 'string' ? v.trim() : ''; if (s.length < min || s.length > max) fail(400, 'invalid_' + name, `${name[0].toUpperCase() + name.slice(1)} must be ${min}–${max} characters.`); return s; };
  const eventRow = (id) => { const e = q('SELECT * FROM events WHERE id = ?').get(id); if (!e) fail(404, 'event_not_found', 'Event not found.'); return e; };
  const taken = (eid) => q("SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status IN ('confirmed','checked_in')").get(eid).n;
  const canManage = (u, e) => STAFF.includes(u.role) || (u.role === 'organizer' && u.club_id === e.club_id);
  const balance = (uid) => q('SELECT COALESCE(SUM(amount),0) AS b FROM coin_transactions WHERE user_id = ? AND created_at >= ?').get(uid, iso(yearStart(now()))).b; // BR-10

  function eventView(e, u) {
    const c = q('SELECT name, category, i18n FROM clubs WHERE id = ?').get(e.club_id);
    const tk = taken(e.id);
    const wait = q("SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'waitlisted'").get(e.id).n;
    const out = { id: e.id, title: e.title, description: e.description, clubId: e.club_id, club: c.name, location: e.location, type: e.type,
      startsAt: e.starts_at, endsAt: e.ends_at, capacity: e.capacity, taken: tk, free: Math.max(0, e.capacity - tk), waitlist: wait, coins: e.coins, status: e.status,
      i18n: parse(e.i18n), clubI18n: parse(c.i18n), place: placeOf(e), open: !!e.is_open, image: e.image || null,
      planned: e.is_open ? q("SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'planned'").get(e.id).n : 0 };
    if (u) {
      const r = q('SELECT * FROM registrations WHERE event_id = ? AND user_id = ?').get(e.id, u.id);
      if (r && r.status !== 'cancelled') {
        out.my = { id: r.id, status: r.status, ticketCode: ['waitlisted', 'planned'].includes(r.status) ? null : r.ticket_code, reminder: { channel: r.reminder_channel, day: !!r.remind_day, hour: !!r.remind_hour } };
        if (r.status === 'waitlisted') out.my.position = q("SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'waitlisted' AND (updated_at < ? OR (updated_at = ? AND id <= ?))").get(e.id, r.updated_at, r.updated_at, r.id).n;
        const fb = q('SELECT rating FROM feedback WHERE event_id = ? AND user_id = ?').get(e.id, u.id);
        if (fb) out.my.rating = fb.rating;
      }
    }
    return out;
  }

  // FR-39 Texts of an event in EN / KK / RU. At least one language with a title (3–120) and a description (10–1000);
  // every language that is started must be complete. The first filled language (EN, then KK, then RU) is the base text.
  function eventTexts(body, room, venue) {
    const src = body.i18n && typeof body.i18n === 'object' ? body.i18n : { en: { title: body.title, description: body.description } };
    const i18n = {}, languages = [];
    for (const l of LANGS) {
      const x = src[l] || {}, title = typeof x.title === 'string' ? x.title.trim() : '', description = typeof x.description === 'string' ? x.description.trim() : '';
      if (!title && !description) continue;
      if (title.length < 3 || title.length > 120) fail(400, 'invalid_title', `Title (${l.toUpperCase()}) must be 3–120 characters.`);
      if (description.length < 10 || description.length > 1000) fail(400, 'invalid_description', `Description (${l.toUpperCase()}) must be 10–1000 characters.`);
      const place = room || venue, placeName = place ? (l !== 'en' && place.i18n && place.i18n[l] && place.i18n[l].name) || place.name : '';
      i18n[l] = { title, description, location: placeName }; languages.push(l);
    }
    if (!languages.length) fail(400, 'invalid_title', 'Write the title and the description in at least one language.');
    const base = i18n[languages[0]];
    return { title: base.title, description: base.description, location: (room || venue).name, i18n, languages };
  }

  const checkImage = (v) => { if (typeof v !== 'string' || !IMG.test(v) || v.length > 150000) fail(400, 'invalid_image', 'The picture must be a JPEG, PNG or WebP up to about 100 KB.'); return v; };

  // ---------- routes ----------
  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

  // FR-01 Sign in with a test account; session cookie
  // Fictional test accounts for the sign-in list (prototype only)
  route('GET', '/api/test-accounts', () => ACCOUNTS.map((a) => ({ email: a.email, password: a.password, name: a.name, role: a.role, club: a.club })));
  route('POST', '/api/auth/login', ({ body, req, res }) => {
    const ip = req.socket.remoteAddress || 'local';
    if (auth.tooManyAttempts(ip)) fail(429, 'too_many_attempts', 'Too many failed attempts. Try again in 5 minutes.');
    const email = str(body.email, 'email', 3, 120).toLowerCase(), password = str(body.password, 'password', 1, 200);
    const u = q('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !auth.verifyPassword(password, u.password_hash)) { auth.recordFailure(ip); fail(401, 'invalid_credentials', 'Wrong e-mail or password.'); }
    auth.clearFailures(ip);
    const token = auth.newToken();
    q('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, u.id, iso(now().getTime() + ttlHours * 3600000));
    res.setHeader('Set-Cookie', `cp_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttlHours * 3600}`);
    return { user: { id: u.id, name: u.name, email: u.email, role: u.role } };
  });
  route('POST', '/api/auth/logout', ({ user, res }) => {
    if (user) q('DELETE FROM sessions WHERE token = ?').run(user.token);
    res.setHeader('Set-Cookie', 'cp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return { ok: true };
  });
  route('GET', '/api/me', ({ user }) => {
    need(user);
    const club = user.club_id ? q('SELECT id, name FROM clubs WHERE id = ?').get(user.club_id) : null;
    const c = q('SELECT consent_at FROM users WHERE id = ?').get(user.id);
    return { id: user.id, name: user.name, email: user.email, studentId: user.student_id, group: user.group_name, role: user.role, lang: user.lang, club, coins: balance(user.id), consentAt: c.consent_at };
  });
  // C08 Consent to the processing of personal data: given at the first sign-in, can be withdrawn in the Profile
  route('POST', '/api/me/consent', ({ user }) => { need(user); const t = iso(now()); q('UPDATE users SET consent_at = ? WHERE id = ?').run(t, user.id); return { consentAt: t }; });
  route('DELETE', '/api/me/consent', ({ user }) => {
    need(user);
    // Withdrawal: future registrations are closed and Telegram is disconnected; what happened stays in the history (C11)
    q('UPDATE users SET consent_at = NULL, telegram_chat_id = NULL, telegram_code = NULL WHERE id = ?').run(user.id);
    return { consentAt: null };
  });
  // FR-19 Save interface language
  route('PUT', '/api/me/lang', ({ user, body }) => {
    need(user); if (!['en', 'kk', 'ru'].includes(body.lang)) fail(400, 'invalid_lang', 'Language must be en, kk or ru.');
    q('UPDATE users SET lang = ? WHERE id = ?').run(body.lang, user.id); return { lang: body.lang };
  });

  // FR-02, FR-03 Event poster: approved, not finished; optional filters
  route('GET', '/api/events', ({ user, query }) => {
    const days = Math.min(60, Math.max(1, Number(query.days) || 7));
    const from = now(), to = new Date(from.getTime() + days * 86400000);
    let rows = q("SELECT * FROM events WHERE status = 'approved' AND ends_at > ? AND starts_at < ? ORDER BY starts_at").all(iso(from), iso(to));
    if (query.type && TYPES.includes(query.type)) rows = rows.filter((e) => e.type === query.type);
    return rows.map((e) => eventView(e, user));
  });
  route('GET', '/api/events/:id', ({ user, params }) => {
    const e = eventRow(int(params.id));
    if (e.status !== 'approved' && !(user && canManage(user, e))) fail(404, 'event_not_found', 'Event not found.');
    return eventView(e, user);
  });

  // FR-04 Register (confirmed + ticket) / FR-05 waitlist when full / FR-07 no duplicates
  route('POST', '/api/events/:id/register', ({ user, params }) => { need(user, 'student'); return registerStudent(user, int(params.id)); });
  function registerStudent(user, eventId) {
    return tx(db, () => {
      const e = eventRow(eventId);
      if (e.status !== 'approved') fail(409, 'not_open', 'Registration is not open for this event.');
      if (e.starts_at <= iso(now())) fail(409, 'already_started', 'The event has already started.');
      const r = q('SELECT * FROM registrations WHERE event_id = ? AND user_id = ?').get(e.id, user.id);
      if (r && r.status !== 'cancelled') fail(409, 'already_registered', 'You are already registered or on the waitlist.');
      if (!q('SELECT consent_at FROM users WHERE id = ?').get(user.id).consent_at) fail(403, 'consent_required', 'Accept the data processing terms first (C08).');
      // F4 / F13 Open event: no seat limit and no ticket, the student only marks "I plan to come"
      const status = e.is_open ? 'planned' : taken(e.id) < e.capacity ? 'confirmed' : 'waitlisted';
      const code = status === 'confirmed' ? newTicket() : null, t = iso(now());
      if (r) q('UPDATE registrations SET status = ?, ticket_code = ?, updated_at = ?, day_sent = 0, hour_sent = 0 WHERE id = ?').run(status, code, t, r.id);
      else q('INSERT INTO registrations (event_id, user_id, status, ticket_code, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(e.id, user.id, status, code, t, t);
      notify(user.id, 'email', status === 'confirmed' ? `Registration confirmed: ${e.title}. Ticket ${code}.` : status === 'planned' ? `You plan to come to ${e.title}.` : `You joined the waitlist for ${e.title}.`);
      return eventView(e, user);
    });
  }

  // FR-06 Cancel before start; the first waitlisted student gets the seat
  route('DELETE', '/api/events/:id/registration', ({ user, params }) => {
    need(user, 'student');
    return tx(db, () => {
      const e = eventRow(int(params.id));
      const r = q("SELECT * FROM registrations WHERE event_id = ? AND user_id = ? AND status IN ('confirmed','waitlisted','planned')").get(e.id, user.id);
      if (!r) fail(404, 'not_registered', 'You are not registered for this event.');
      if (e.starts_at <= iso(now())) fail(409, 'already_started', 'The event has already started.');
      q("UPDATE registrations SET status = 'cancelled', updated_at = ? WHERE id = ?").run(iso(now()), r.id);
      let promoted = null;
      if (r.status === 'confirmed') {
        const next = q("SELECT * FROM registrations WHERE event_id = ? AND status = 'waitlisted' ORDER BY updated_at, id LIMIT 1").get(e.id);
        if (next) {
          const code = newTicket();
          q("UPDATE registrations SET status = 'confirmed', ticket_code = ?, updated_at = ? WHERE id = ?").run(code, iso(now()), next.id);
          alert(next.user_id, `A seat became free: you are now registered for ${e.title}. Ticket ${code}.`, (lang) => bot.promotedMsg(lang, eventView(e, null), code));
          promoted = next.user_id;
        }
      }
      return { ok: true, promotedUserId: promoted };
    });
  });

  // FR-08 Reminder settings (opt-in). Delivery is simulated: messages are written to the notifications table
  route('PUT', '/api/registrations/:id/reminders', ({ user, params, body }) => {
    need(user, 'student');
    const r = q('SELECT * FROM registrations WHERE id = ? AND user_id = ?').get(int(params.id), user.id);
    if (!r) fail(404, 'not_found', 'Registration not found.');
    if (!['off', 'push', 'telegram'].includes(body.channel)) fail(400, 'invalid_channel', 'Channel must be off, push or telegram.');
    q('UPDATE registrations SET reminder_channel = ?, remind_day = ?, remind_hour = ? WHERE id = ?').run(body.channel, body.day ? 1 : 0, body.hour ? 1 : 0, r.id);
    return { channel: body.channel, day: !!body.day, hour: !!body.hour };
  });

  // FR-09 Calendar export (.ics, RFC 5545)
  route('GET', '/api/events/:id/ics', ({ params, res }) => {
    const e = eventRow(int(params.id)); if (e.status !== 'approved') fail(404, 'event_not_found', 'Event not found.');
    const f = (s) => s.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s) => s.replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CampusPass//Educational prototype//EN', 'BEGIN:VEVENT', `UID:event-${e.id}@campuspass.local`, `DTSTAMP:${f(iso(now()))}`,
      `DTSTART:${f(e.starts_at)}`, `DTEND:${f(e.ends_at)}`, `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.location)}`, `DESCRIPTION:${esc(e.description)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="event-${e.id}.ics"` });
    res.end(ics); return undefined;
  });

  // Tickets, coins, notifications of the signed-in student
  route('GET', '/api/me/registrations', ({ user }) => {
    need(user);
    return q("SELECT e.* FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.user_id = ? AND r.status <> 'cancelled' ORDER BY e.starts_at").all(user.id).map((e) => eventView(e, user));
  });
  // Attendance history of the signed-in student (F10): attended, missed, cancelled, waitlist expired
  route('GET', '/api/me/history', ({ user }) => {
    need(user); const t = iso(now());
    const rows = q("SELECT e.*, r.status AS reg_status FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.user_id = ? AND (e.starts_at <= ? OR r.status = 'cancelled') ORDER BY e.starts_at DESC").all(user.id, t);
    const items = rows.map((r) => {
      const ended = r.ends_at <= t; let result;
      if (r.reg_status === 'checked_in') result = 'attended'; else if (r.reg_status === 'cancelled') result = 'cancelled';
      else if (r.reg_status === 'waitlisted') result = 'expired'; else if (r.reg_status === 'planned') result = ended ? 'planned' : 'ongoing'; else result = ended ? 'missed' : 'ongoing';
      const v = eventView(r, user);
      return { ...v, result, coinsEarned: result === 'attended' ? r.coins : 0 };
    }).filter((x) => x.result !== 'ongoing');
    const counted = items.filter((x) => x.result === 'attended' || x.result === 'missed');
    return { items, attended: counted.filter((x) => x.result === 'attended').length, missed: counted.filter((x) => x.result === 'missed').length };
  });

  // FR-16 Coin balance and history
  route('GET', '/api/me/coins', ({ user }) => {
    need(user);
    return { balance: balance(user.id), history: q('SELECT t.amount, t.reason, t.created_at AS createdAt, e.title AS event FROM coin_transactions t LEFT JOIN events e ON e.id = t.event_id WHERE t.user_id = ? AND t.created_at >= ? ORDER BY t.created_at DESC, t.id DESC').all(user.id, iso(yearStart(now()))), expiresAt: iso(yearEnd(now())) };
  });
  // FR-21 Notification inbox (simulated e-mail, push and Telegram messages)
  route('GET', '/api/me/notifications', ({ user }) => { need(user); return q('SELECT channel, text, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(user.id); });

  // FR-17 Rate an attended event once
  route('POST', '/api/events/:id/feedback', ({ user, params, body }) => {
    need(user, 'student');
    const eid = int(params.id), rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, 'invalid_rating', 'Rating must be 1–5.');
    const r = q("SELECT 1 FROM registrations WHERE event_id = ? AND user_id = ? AND status = 'checked_in'").get(eid, user.id);
    if (!r) fail(409, 'not_attended', 'You can rate only events you attended.');
    if (q('SELECT 1 FROM feedback WHERE event_id = ? AND user_id = ?').get(eid, user.id)) fail(409, 'already_rated', 'You have already rated this event.');
    q('INSERT INTO feedback (event_id, user_id, rating, created_at) VALUES (?,?,?,?)').run(eid, user.id, rating, iso(now()));
    return { rating };
  });

  // FR-10 Club catalogue and join requests
  route('GET', '/api/clubs', ({ user }) => q('SELECT c.*, (SELECT COUNT(*) FROM memberships m WHERE m.club_id = c.id AND m.status = \'accepted\') AS members FROM clubs c ORDER BY c.name').all()
    .map((c) => { c.i18n = parse(c.i18n); if (user) { const m = q('SELECT status FROM memberships WHERE user_id = ? AND club_id = ?').get(user.id, c.id); c.myStatus = m ? m.status : null; } return c; }));
  route('POST', '/api/clubs/:id/join', ({ user, params, body }) => {
    need(user, 'student');
    const cid = int(params.id); if (!q('SELECT 1 FROM clubs WHERE id = ?').get(cid)) fail(404, 'club_not_found', 'Club not found.');
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
    const m = q('SELECT status FROM memberships WHERE user_id = ? AND club_id = ?').get(user.id, cid);
    if (m && m.status !== 'declined') fail(409, 'already_requested', 'You already sent a request or are a member.');
    if (m) q("UPDATE memberships SET status = 'pending', message = ?, created_at = ?, decided_at = NULL WHERE user_id = ? AND club_id = ?").run(message, iso(now()), user.id, cid);
    else q("INSERT INTO memberships (user_id, club_id, status, message, created_at) VALUES (?,?, 'pending', ?, ?)").run(user.id, cid, message, iso(now()));
    return { status: 'pending' };
  });

  // FR-11 Organizer submits an event for moderation (own club only)
  // F21, F22 Campus, rooms and city venues for the map; free rooms for organizers and the moderator
  route('GET', '/api/places', ({ user }) => { need(user); return { campus: CAMPUS, rooms: ROOMS, venues: VENUES }; });
  route('GET', '/api/rooms/availability', ({ user, query }) => {
    need(user, 'organizer', ...STAFF);
    const start = new Date(query.start); if (isNaN(start)) fail(400, 'invalid_start', 'Enter a valid date and time.');
    const minutes = Math.min(720, Math.max(15, Number(query.minutes) || 120)), end = new Date(start.getTime() + minutes * 60000);
    const evs = q("SELECT id, title, room_code, status, starts_at, ends_at FROM events WHERE room_code IS NOT NULL").all();
    return ROOMS.map((r) => ({ ...r, ...availability(r, ROOMS, start, end, evs) }));
  });
  // FR-11, FR-39 Organizer submits an event in one, two or three languages (EN / KK / RU); the moderator reviews it
  route('POST', '/api/events', ({ user, body }) => {
    need(user, 'organizer', 'admin');
    const room = body.roomCode ? ROOMS.find((x) => x.code === body.roomCode) : null, venue = body.venueId ? VENUES.find((x) => x.id === body.venueId) : null;
    if (!room && !venue) fail(400, 'place_required', 'Choose a free room on campus or a place in the city.');
    const texts = eventTexts(body, room, venue);
    if (!TYPES.includes(body.type)) fail(400, 'invalid_type', 'Choose an event type.');
    const start = new Date(body.startsAt); if (isNaN(start)) fail(400, 'invalid_start', 'Enter a valid date and time.');
    if (start <= now()) fail(400, 'start_in_past', 'The event must start in the future.');
    const minutes = Number(body.durationMinutes) || 120; if (minutes < 15 || minutes > 720) fail(400, 'invalid_duration', 'Duration must be 15–720 minutes.');
    const capacity = Number(body.capacity); if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) fail(400, 'invalid_capacity', 'Seats must be 1–500.');
    if (room && capacity > room.capacity) fail(400, 'room_too_small', `This room has ${room.capacity} seats.`);
    if (room) { const a = availability(room, ROOMS, start, new Date(start.getTime() + minutes * 60000), q("SELECT id, title, room_code, status, starts_at, ends_at FROM events WHERE room_code IS NOT NULL").all()); if (!a.free) fail(409, 'room_busy', 'The room is not free at this time.'); }
    const image = body.image ? checkImage(body.image) : null; // own photo of the organizer (compressed in the browser); otherwise a cover by type
    const isOpen = body.open === true ? 1 : 0; // F13 open event (concert, fair): no registration limit, "I plan to come"
    const clubId = user.role === 'admin' ? int(body.clubId) : user.club_id;
    if (user.role === 'admin' && !q('SELECT 1 FROM clubs WHERE id = ?').get(clubId)) fail(404, 'club_not_found', 'Club not found.');
    const id = q(`INSERT INTO events (title, description, club_id, location, type, starts_at, ends_at, capacity, coins, status, created_by, created_at, room_code, venue, i18n, is_open, image) VALUES (?,?,?,?,?,?,?,?,?, 'pending', ?, ?, ?, ?, ?, ?, ?)`)
      .run(texts.title, texts.description, clubId, texts.location, body.type, iso(start), iso(start.getTime() + minutes * 60000), capacity, isOpen ? 0 : 20, user.id, iso(now()), room ? room.code : null, venue ? venue.id : null, JSON.stringify(texts.i18n), isOpen, image).lastInsertRowid;
    const newEv = eventView(eventRow(id), null);
    for (const a of q("SELECT id FROM users WHERE role IN ('moderator','admin')").all()) alert(a.id, `New event waiting for review: ${texts.title}.`, (lang) => bot.newEventAlert(lang, newEv, siteUrl()));
    return { id, status: 'pending', languages: texts.languages };
  });
  route('GET', '/api/organizer/events', ({ user }) => {
    need(user, 'organizer', ...STAFF);
    const rows = STAFF.includes(user.role) ? q('SELECT * FROM events ORDER BY starts_at').all() : q('SELECT * FROM events WHERE club_id = ? ORDER BY starts_at').all(user.club_id);
    return rows.map((e) => ({ ...eventView(e, null), comment: e.moderation_comment }));
  });

  // FR-14, FR-15 Participants and check-in (organizer of the club, moderator or admin)
  route('GET', '/api/events/:id/participants', ({ user, params }) => {
    need(user, 'organizer', ...STAFF); const e = eventRow(int(params.id)); if (!canManage(user, e)) fail(403, 'forbidden', 'You can manage only your club\'s events.');
    return q("SELECT r.id, r.status, r.checkin_method AS method, u.name, u.student_id AS studentId FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.status IN ('confirmed','checked_in') ORDER BY u.name").all(e.id);
  });
  route('POST', '/api/checkin', ({ user, body }) => {
    need(user, 'organizer', ...STAFF);
    return tx(db, () => {
      const e = eventRow(int(body.eventId)); if (!canManage(user, e)) fail(403, 'forbidden', 'You can check in only at your club\'s events.');
      const t = now();
      if (t < new Date(new Date(e.starts_at).getTime() - 3600000) || t > new Date(e.ends_at)) fail(409, 'checkin_closed', 'Check-in is open from 1 hour before the start until the end of the event.');
      let r, method;
      if (body.ticketCode) { r = q('SELECT * FROM registrations WHERE ticket_code = ?').get(String(body.ticketCode).trim().toUpperCase()); method = 'qr'; if (!r) fail(404, 'ticket_not_found', 'Ticket not found.'); if (r.event_id !== e.id) fail(409, 'wrong_event', 'This ticket is for another event.'); }
      else if (body.registrationId) { r = q('SELECT * FROM registrations WHERE id = ? AND event_id = ?').get(int(body.registrationId), e.id); method = 'manual'; if (!r) fail(404, 'registration_not_found', 'Registration not found.'); }
      else fail(400, 'code_required', 'Enter the ticket code or choose a student from the list.');
      if (r.status === 'checked_in') fail(409, 'already_checked_in', 'This student is already checked in.');
      if (r.status !== 'confirmed') fail(409, 'not_confirmed', 'This registration is not confirmed.');
      q("UPDATE registrations SET status = 'checked_in', checkin_method = ?, checked_in_at = ?, updated_at = ? WHERE id = ?").run(method, iso(t), iso(t), r.id);
      q('INSERT INTO coin_transactions (user_id, amount, reason, event_id, created_at) VALUES (?,?,?,?,?)').run(r.user_id, e.coins, 'Check-in', e.id, iso(t)); // FR-16
      const s = q('SELECT name, student_id FROM users WHERE id = ?').get(r.user_id);
      return { ok: true, name: s.name, studentId: s.student_id, coins: e.coins, method };
    });
  });

  // FR-12 Moderation of events (moderator = Student Affairs; the administrator can do it too)
  route('GET', '/api/admin/pending-events', ({ user }) => { need(user, ...STAFF); return q("SELECT * FROM events WHERE status = 'pending' ORDER BY starts_at").all().map((e) => eventView(e, null)); });
  route('POST', '/api/admin/events/:id/decision', ({ user, params, body }) => {
    need(user, ...STAFF); const e = eventRow(int(params.id));
    if (e.status !== 'pending') fail(409, 'not_pending', 'This event is not waiting for review.');
    if (!['approve', 'reject'].includes(body.decision)) fail(400, 'invalid_decision', 'Decision must be approve or reject.');
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : '';
    if (body.decision === 'reject' && comment.length < 5) fail(400, 'comment_required', 'Write a short reason for the rejection.');
    const status = body.decision === 'approve' ? 'approved' : 'rejected';
    if (status === 'approved' && e.room_code) { // the booking is confirmed only if no other approved event took the room
      const r = ROOMS.find((x) => x.code === e.room_code), others = q("SELECT id, title, room_code, status, starts_at, ends_at FROM events WHERE room_code = ? AND status = 'approved'").all(e.room_code);
      if (r && !availability(r, ROOMS, e.starts_at, e.ends_at, others, e.id).free) fail(409, 'room_busy', 'The room is not free at this time.'); }
    q('UPDATE events SET status = ?, moderation_comment = ? WHERE id = ?').run(status, comment || null, e.id);
    if (e.created_by) alert(e.created_by, `Your event "${e.title}" was ${status}.${comment ? ' Comment: ' + comment : ''}`, (lang) => bot.decisionMsg(lang, eventView(e, null), status, comment));
    return { id: e.id, status };
  });
  // FR-13 Club join requests
  route('GET', '/api/admin/club-requests', ({ user }) => { need(user, ...STAFF); return q("SELECT m.user_id AS userId, m.club_id AS clubId, m.message, m.created_at AS createdAt, u.name, u.student_id AS studentId, c.name AS club, c.i18n AS clubI18n FROM memberships m JOIN users u ON u.id = m.user_id JOIN clubs c ON c.id = m.club_id WHERE m.status = 'pending' ORDER BY m.created_at").all().map((r) => ({ ...r, clubI18n: parse(r.clubI18n) })); });
  route('POST', '/api/admin/club-requests/decision', ({ user, body }) => {
    need(user, ...STAFF); const uid = int(body.userId), cid = int(body.clubId);
    if (!['accept', 'decline'].includes(body.decision)) fail(400, 'invalid_decision', 'Decision must be accept or decline.');
    const m = q("SELECT 1 FROM memberships WHERE user_id = ? AND club_id = ? AND status = 'pending'").get(uid, cid); if (!m) fail(404, 'request_not_found', 'Request not found.');
    const status = body.decision === 'accept' ? 'accepted' : 'declined';
    q('UPDATE memberships SET status = ?, decided_at = ? WHERE user_id = ? AND club_id = ?').run(status, iso(now()), uid, cid);
    const club = q('SELECT name FROM clubs WHERE id = ?').get(cid).name;
    const ci = parse(q('SELECT i18n FROM clubs WHERE id = ?').get(cid).i18n);
    alert(uid, `Your request to join ${club} was ${status}.`, (lang) => bot.clubDecisionMsg(lang, (ci && ci[lang] && ci[lang].name) || club, status));
    return { status };
  });
  // FR-18 Statistics
  route('GET', '/api/admin/stats', ({ user }) => {
    need(user, ...STAFF);
    const events = q("SELECT * FROM events WHERE status = 'approved' ORDER BY starts_at").all().map((e) => {
      const v = eventView(e, null);
      const checked = q("SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'checked_in'").get(e.id).n;
      const fb = q('SELECT AVG(rating) AS a, COUNT(*) AS n FROM feedback WHERE event_id = ?').get(e.id);
      return { id: e.id, title: e.title, i18n: v.i18n, startsAt: e.starts_at, capacity: e.capacity, registered: v.taken, fillRate: Math.round((v.taken / e.capacity) * 100), waitlist: v.waitlist, checkedIn: checked, avgRating: fb.n ? Math.round(fb.a * 10) / 10 : null, ratings: fb.n };
    });
    const clubs = q('SELECT category, COUNT(*) AS n FROM clubs GROUP BY category').all();
    const pending = q("SELECT COUNT(*) AS n FROM events WHERE status = 'pending'").get().n + q("SELECT COUNT(*) AS n FROM memberships WHERE status = 'pending'").get().n;
    const complaints = q("SELECT COUNT(*) AS n FROM complaints WHERE status IN ('new','in_review')").get().n;
    const shop = q("SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS s FROM vouchers WHERE status = 'used'").get();
    return { totals: { clubs: clubs.reduce((a, c) => a + c.n, 0), approvedEvents: events.length, registrations: events.reduce((a, e) => a + e.registered, 0), pending, complaints, shopStudents: shop.s }, clubsByCategory: clubs, events };
  });
  // FR-20, FR-42 Administrator: users and roles (search over all accounts; the 120 seat-filling students are hidden unless searched)
  route('GET', '/api/admin/users', ({ user, query }) => {
    need(user, 'admin'); const k = String(query.q || '').trim().toLowerCase();
    const rows = q("SELECT u.id, u.name, u.email, u.role, u.club_id AS clubId, u.student_id AS studentId, u.group_name AS grp, c.name AS club, (u.telegram_chat_id IS NOT NULL) AS telegram FROM users u LEFT JOIN clubs c ON c.id = u.club_id ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'moderator' THEN 1 WHEN 'organizer' THEN 2 ELSE 3 END, u.name").all();
    return (k ? rows.filter((u) => (u.name + ' ' + u.email + ' ' + (u.studentId || '')).toLowerCase().includes(k)).slice(0, 50) : rows.filter((u) => !/^s\d{3}@test\.local$/.test(u.email))).map((u) => ({ ...u, telegram: !!u.telegram }));
  });
  function setUser(user, id, body) {
    const x = q('SELECT * FROM users WHERE id = ?').get(id); if (!x) fail(404, 'user_not_found', 'User not found.');
    const role = body.role === undefined ? x.role : body.role;
    if (!ROLES.includes(role)) fail(400, 'invalid_role', 'Role must be student, organizer, moderator or admin.');
    if (id === user.id && role !== x.role) fail(409, 'own_role', 'You cannot change your own role.');
    const name = body.name === undefined ? x.name : str(body.name, 'name', 2, 80);
    const clubId = role === 'organizer' ? int(body.clubId === undefined ? x.club_id : body.clubId) : null;
    if (clubId && !q('SELECT 1 FROM clubs WHERE id = ?').get(clubId)) fail(404, 'club_not_found', 'Club not found.');
    q('UPDATE users SET role = ?, club_id = ?, name = ? WHERE id = ?').run(role, clubId, name, id);
    if (role !== x.role || clubId !== x.club_id) q('DELETE FROM sessions WHERE user_id = ?').run(id); // new rights apply at next sign-in
    return { id, role, clubId, name };
  }
  route('PUT', '/api/admin/users/:id/role', ({ user, params, body }) => { need(user, 'admin'); return setUser(user, int(params.id), { role: body.role, clubId: body.clubId }); });
  route('PUT', '/api/admin/users/:id', ({ user, params, body }) => { need(user, 'admin'); return setUser(user, int(params.id), body); });

  // FR-41 Administrator edits any event: texts in three languages, type, time, seats, coins, status
  route('GET', '/api/admin/events', ({ user }) => { need(user, 'admin'); return q('SELECT * FROM events ORDER BY starts_at DESC').all().map((e) => ({ ...eventView(e, null), comment: e.moderation_comment, roomCode: e.room_code, venueId: e.venue })); });
  route('PUT', '/api/admin/events/:id', ({ user, params, body }) => {
    need(user, 'admin');
    return tx(db, () => {
      const e = eventRow(int(params.id));
      const room = e.room_code ? ROOMS.find((x) => x.code === e.room_code) : null, venue = e.venue ? VENUES.find((x) => x.id === e.venue) : null;
      const texts = body.i18n ? eventTexts(body, room, venue) : null;
      const type = body.type === undefined ? e.type : body.type; if (!TYPES.includes(type)) fail(400, 'invalid_type', 'Choose an event type.');
      const start = body.startsAt === undefined ? new Date(e.starts_at) : new Date(body.startsAt); if (isNaN(start)) fail(400, 'invalid_start', 'Enter a valid date and time.');
      const minutes = body.durationMinutes === undefined ? (new Date(e.ends_at) - new Date(e.starts_at)) / 60000 : Number(body.durationMinutes);
      if (!(minutes >= 15 && minutes <= 720)) fail(400, 'invalid_duration', 'Duration must be 15–720 minutes.');
      const capacity = body.capacity === undefined ? e.capacity : Number(body.capacity); if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) fail(400, 'invalid_capacity', 'Seats must be 1–500.');
      const coins = body.coins === undefined ? e.coins : Number(body.coins); if (!Number.isInteger(coins) || coins < 0 || coins > 100) fail(400, 'invalid_coins', 'Coins must be 0–100.');
      const status = body.status === undefined ? e.status : body.status; if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) fail(400, 'invalid_status', 'Unknown status.');
      const image = body.image === undefined ? e.image : body.image === null ? null : checkImage(body.image);
      q('UPDATE events SET title = ?, description = ?, i18n = ?, type = ?, starts_at = ?, ends_at = ?, capacity = ?, coins = ?, status = ?, image = ? WHERE id = ?')
        .run(texts ? texts.title : e.title, texts ? texts.description : e.description, texts ? JSON.stringify(texts.i18n) : e.i18n, type, iso(start), iso(start.getTime() + minutes * 60000), capacity, coins, status, image, e.id);
      // State diagram: when an event is cancelled, every Confirmed / Waitlisted / Planned registration becomes Cancelled and the student is told
      if (status === 'cancelled' && e.status !== 'cancelled') { for (const r of q("SELECT user_id FROM registrations WHERE event_id = ? AND status IN ('confirmed','waitlisted','planned')").all(e.id)) notify(r.user_id, 'app', `The event "${e.title}" was cancelled.`); q("UPDATE registrations SET status = 'cancelled', updated_at = ? WHERE event_id = ? AND status IN ('confirmed','waitlisted','planned')").run(iso(now()), e.id); }
      return { ...eventView(eventRow(e.id), null), comment: e.moderation_comment };
    });
  });
  route('DELETE', '/api/admin/events/:id', ({ user, params }) => {
    need(user, 'admin'); const e = eventRow(int(params.id));
    tx(db, () => { q('DELETE FROM feedback WHERE event_id = ?').run(e.id); q('UPDATE coin_transactions SET event_id = NULL WHERE event_id = ?').run(e.id); q('DELETE FROM registrations WHERE event_id = ?').run(e.id); q("DELETE FROM complaints WHERE target_type = 'event' AND target_id = ?").run(e.id); q('DELETE FROM events WHERE id = ?').run(e.id); });
    return { deleted: e.id };
  });
  // FR-42 Administrator edits clubs (name, category, room, description; texts in KK / RU are optional)
  function clubFields(body, old) {
    const name = str(body.name === undefined ? old.name : body.name, 'name', 2, 80);
    const category = body.category === undefined ? old.category : body.category; if (!TYPES.includes(category)) fail(400, 'invalid_type', 'Choose a category.');
    const room = str(body.room === undefined ? old.room : body.room, 'room', 2, 120), description = str(body.description === undefined ? old.description : body.description, 'description', 10, 1000);
    let i18n = old.i18n ? parse(old.i18n) || {} : {};
    if (body.i18n && typeof body.i18n === 'object') { i18n = {}; for (const l of ['kk', 'ru']) { const x = body.i18n[l] || {}; const v = Object.fromEntries(['name', 'room', 'description'].map((f) => [f, typeof x[f] === 'string' ? x[f].trim().slice(0, 1000) : '']).filter(([, val]) => val)); if (Object.keys(v).length) i18n[l] = v; } }
    return { name, category, room, description, i18n: JSON.stringify(i18n) };
  }
  route('POST', '/api/admin/clubs', ({ user, body }) => {
    need(user, 'admin'); const f = clubFields(body, {});
    if (q('SELECT 1 FROM clubs WHERE name = ?').get(f.name)) fail(409, 'club_exists', 'A club with this name already exists.');
    const id = q('INSERT INTO clubs (name, category, room, icon, description, i18n) VALUES (?,?,?,?,?,?)').run(f.name, f.category, f.room, null, f.description, f.i18n).lastInsertRowid;
    return { id, ...f, i18n: parse(f.i18n) };
  });
  route('PUT', '/api/admin/clubs/:id', ({ user, params, body }) => {
    need(user, 'admin'); const id = int(params.id), old = q('SELECT * FROM clubs WHERE id = ?').get(id); if (!old) fail(404, 'club_not_found', 'Club not found.');
    const f = clubFields(body, old);
    if (f.name !== old.name && q('SELECT 1 FROM clubs WHERE name = ?').get(f.name)) fail(409, 'club_exists', 'A club with this name already exists.');
    q('UPDATE clubs SET name = ?, category = ?, room = ?, description = ?, i18n = ? WHERE id = ?').run(f.name, f.category, f.room, f.description, f.i18n, id);
    return { id, ...f, i18n: parse(f.i18n) };
  });

  // FR-43 … FR-45 Complaints: any signed-in user reports an event or a club; administrators get it in the inbox and in Telegram
  const targetTitle = (type, id) => { const r = type === 'event' ? q('SELECT title AS t FROM events WHERE id = ?').get(id) : q('SELECT name AS t FROM clubs WHERE id = ?').get(id); return r ? r.t : null; };
  route('POST', '/api/complaints', ({ user, body }) => {
    need(user);
    if (!['event', 'club'].includes(body.targetType)) fail(400, 'invalid_target', 'Choose an event or a club.');
    const targetId = int(body.targetId), title = targetTitle(body.targetType, targetId); if (!title) fail(404, body.targetType === 'event' ? 'event_not_found' : 'club_not_found', 'Not found.');
    if (!REASONS.includes(body.reason)) fail(400, 'invalid_reason', 'Choose a reason.');
    const text = str(body.text, 'complaint', 5, 500);
    if (q("SELECT 1 FROM complaints WHERE user_id = ? AND target_type = ? AND target_id = ? AND status IN ('new','in_review')").get(user.id, body.targetType, targetId)) fail(409, 'already_complained', 'You already reported this. The administrator is looking at it.');
    const t = iso(now());
    const id = q("INSERT INTO complaints (user_id, target_type, target_id, reason, text, status, created_at, updated_at) VALUES (?,?,?,?,?, 'new', ?, ?)").run(user.id, body.targetType, targetId, body.reason, text, t, t).lastInsertRowid;
    const c = { id, targetType: body.targetType, targetTitle: title, reason: body.reason, fromName: user.name, text };
    for (const a of q("SELECT id FROM users WHERE role = 'admin'").all()) alert(a.id, `New complaint #${id} about ${body.targetType} "${title}": ${text}`, (lang) => bot.complaintAlert(lang, c, siteUrl()));
    return { id, status: 'new' };
  });
  route('GET', '/api/me/complaints', ({ user }) => { need(user); return q('SELECT id, target_type AS targetType, target_id AS targetId, reason, text, status, admin_comment AS comment, created_at AS createdAt, updated_at AS updatedAt FROM complaints WHERE user_id = ? ORDER BY id DESC').all(user.id).map((c) => ({ ...c, targetTitle: targetTitle(c.targetType, c.targetId) })); });
  route('GET', '/api/admin/complaints', ({ user }) => {
    need(user, 'admin');
    return q("SELECT c.id, c.target_type AS targetType, c.target_id AS targetId, c.reason, c.text, c.status, c.admin_comment AS comment, c.created_at AS createdAt, c.updated_at AS updatedAt, u.name AS fromName, u.email AS fromEmail, h.name AS handledBy FROM complaints c JOIN users u ON u.id = c.user_id LEFT JOIN users h ON h.id = c.handled_by ORDER BY CASE c.status WHEN 'new' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, c.id DESC").all()
      .map((c) => ({ ...c, targetTitle: targetTitle(c.targetType, c.targetId) }));
  });
  route('PUT', '/api/admin/complaints/:id', ({ user, params, body }) => {
    need(user, 'admin'); const c = q('SELECT * FROM complaints WHERE id = ?').get(int(params.id)); if (!c) fail(404, 'complaint_not_found', 'Complaint not found.');
    if (!C_STATUS.includes(body.status) || body.status === 'new') fail(400, 'invalid_status', 'Status must be in_review, resolved or rejected.');
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : '';
    if (['resolved', 'rejected'].includes(body.status) && comment.length < 5) fail(400, 'answer_required', 'Write a short answer to the person (at least 5 characters).');
    q('UPDATE complaints SET status = ?, admin_comment = ?, handled_by = ?, updated_at = ? WHERE id = ?').run(body.status, comment || c.admin_comment, user.id, iso(now()), c.id);
    alert(c.user_id, `Your complaint #${c.id} is now: ${body.status.replace('_', ' ')}.${comment ? ' Answer: ' + comment : ''}`, (lang) => bot.complaintStatusMsg(lang, c.id, body.status, comment));
    return { id: c.id, status: body.status };
  });

  // ---------- FR-28 … FR-33 Merch shop: discount vouchers for Campus Coins ----------
  const voucherOut = (v) => ({ id: v.id, code: v.code, pct: v.percent, coins: v.coins, status: v.status, createdAt: v.created_at, expiresAt: v.expires_at, usedAt: v.used_at, amount: v.purchase_amount, discount: v.discount });
  // BR-09 Expired vouchers give the coins back (checked lazily on every shop request)
  function expireVouchers() {
    for (const v of q("SELECT * FROM vouchers WHERE status = 'active' AND expires_at <= ?").all(iso(now()))) {
      q("UPDATE vouchers SET status = 'expired' WHERE id = ?").run(v.id);
      q('INSERT INTO coin_transactions (user_id, amount, reason, created_at) VALUES (?,?,?,?)').run(v.user_id, v.coins, `Voucher ${v.code} expired, coins returned`, iso(now()));
    }
  }
  route('GET', '/api/shop', ({ user }) => {
    need(user, 'student'); expireVouchers();
    return { offers: SHOP.offers, maxDiscount: SHOP.maxDiscount, validDays: SHOP.validDays, balance: balance(user.id), coinsExpireAt: iso(yearEnd(now())),
      vouchers: q('SELECT * FROM vouchers WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(user.id).map(voucherOut) };
  });
  route('POST', '/api/shop/vouchers', ({ user, body }) => {
    need(user, 'student');
    return tx(db, () => {
      expireVouchers();
      if (!q('SELECT consent_at FROM users WHERE id = ?').get(user.id).consent_at) fail(403, 'consent_required', 'Accept the data processing terms first (C08).');
      const offer = SHOP.offers.find((o) => o.pct === Number(body.pct)); if (!offer) fail(400, 'invalid_offer', 'Choose 5% or 10%.');
      if (q("SELECT 1 FROM vouchers WHERE user_id = ? AND status = 'active'").get(user.id)) fail(409, 'voucher_active', 'You already have an active voucher. Use it or cancel it first.');
      if (balance(user.id) < offer.coins) fail(409, 'not_enough_coins', `You need ${offer.coins} coins.`);
      const code = 'MERCH-' + crypto.randomBytes(4).toString('hex').toUpperCase(), t = iso(now()), exp = iso(now().getTime() + SHOP.validDays * 86400000);
      const id = q("INSERT INTO vouchers (user_id, code, percent, coins, status, created_at, expires_at) VALUES (?,?,?,?, 'active', ?, ?)").run(user.id, code, offer.pct, offer.coins, t, exp).lastInsertRowid;
      q('INSERT INTO coin_transactions (user_id, amount, reason, created_at) VALUES (?,?,?,?)').run(user.id, -offer.coins, `Merch voucher ${offer.pct}% (${code})`, t);
      return voucherOut(q('SELECT * FROM vouchers WHERE id = ?').get(id));
    });
  });
  route('DELETE', '/api/shop/vouchers/:id', ({ user, params }) => {
    need(user, 'student');
    return tx(db, () => {
      const v = q("SELECT * FROM vouchers WHERE id = ? AND user_id = ? AND status = 'active'").get(int(params.id), user.id); if (!v) fail(404, 'voucher_not_found', 'Voucher not found.');
      q("UPDATE vouchers SET status = 'cancelled' WHERE id = ?").run(v.id);
      q('INSERT INTO coin_transactions (user_id, amount, reason, created_at) VALUES (?,?,?,?)').run(user.id, v.coins, `Voucher ${v.code} cancelled, coins returned`, iso(now()));
      return { status: 'cancelled', balance: balance(user.id) };
    });
  });
  // FR-31 The cashier scans the voucher QR (or types the code) and the purchase amount; confirm = the voucher is used
  route('POST', '/api/shop/redeem', ({ user, body }) => {
    need(user, 'shop', 'admin');
    return tx(db, () => {
      expireVouchers();
      const v = q('SELECT * FROM vouchers WHERE code = ?').get(String(body.code || '').trim().toUpperCase());
      if (!v || v.status === 'cancelled') fail(404, 'voucher_not_found', 'Voucher not found. Check the code.');
      if (v.status === 'used') fail(409, 'voucher_used', 'This voucher was already used.');
      if (v.status === 'expired') fail(409, 'voucher_expired', 'This voucher has expired.');
      const amount = Number(body.amount); if (!Number.isInteger(amount) || amount < 1 || amount > 1000000) fail(400, 'invalid_amount', 'Enter the purchase amount in tenge.');
      const discount = Math.min(Math.round((amount * v.percent) / 100), SHOP.maxDiscount), student = q('SELECT name FROM users WHERE id = ?').get(v.user_id).name;
      if (body.confirm === true) {
        q("UPDATE vouchers SET status = 'used', used_at = ?, purchase_amount = ?, discount = ?, cashier_id = ? WHERE id = ?").run(iso(now()), amount, discount, user.id, v.id);
        alert(v.user_id, `Your merch voucher ${v.code} was used: ${v.percent}% discount, ${discount} ₸ off.`, (lang) => ({ text: bot.tr(lang, 'voucher_used', { code: v.code, pct: v.percent, discount }) }));
      }
      return { code: v.code, pct: v.percent, amount, discount, toPay: amount - discount, student, used: body.confirm === true };
    });
  });
  route('GET', '/api/shop/redemptions', ({ user }) => {
    need(user, 'shop', 'admin');
    const rows = q("SELECT v.*, u.name FROM vouchers v JOIN users u ON u.id = v.user_id WHERE v.status = 'used' ORDER BY v.used_at DESC LIMIT 30").all();
    const all = q("SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS s, COALESCE(SUM(discount),0) AS d FROM vouchers WHERE status = 'used'").get();
    return { items: rows.map((v) => ({ ...voucherOut(v), student: v.name })), totals: { used: all.n, students: all.s, discount: all.d } };
  });

  // Reset all data to the fictional test data (moderator only; used between usability-test sessions)
  // Public settings for the frontend: the 2GIS map key (a browser key restricted to our domains) and whether the bot works
  route('GET', '/api/config', () => ({ mapKey: process.env.MAPGL_KEY || '', telegram: tg.enabled, ai: assistant.aiEnabled(opts.aiKey) }));
  // FR-08 / SW02 Telegram: link the account with a one-time code, send a test message, disconnect
  route('GET', '/api/me/telegram', async ({ user }) => {
    need(user); const u = q('SELECT telegram_chat_id FROM users WHERE id = ?').get(user.id);
    let bot = null; try { bot = await tg.botName(); } catch { bot = null; }
    return { enabled: tg.enabled && !!bot, bot, connected: !!(u && u.telegram_chat_id) };
  });
  route('POST', '/api/me/telegram/link', async ({ user }) => {
    need(user); if (!tg.enabled) fail(503, 'telegram_off', 'The Telegram bot is not configured.');
    let bot; try { bot = await tg.botName(); } catch { fail(503, 'telegram_off', 'The Telegram bot is not reachable.'); }
    const code = crypto.randomBytes(12).toString('hex');
    q('UPDATE users SET telegram_code = ? WHERE id = ?').run(code, user.id);
    return { url: `https://t.me/${bot}?start=${code}` };
  });
  route('POST', '/api/me/telegram/test', async ({ user }) => {
    need(user); const u = q('SELECT telegram_chat_id FROM users WHERE id = ?').get(user.id);
    if (!u || !u.telegram_chat_id) fail(400, 'telegram_not_connected', 'Connect Telegram first.');
    const ok = await tg.send(u.telegram_chat_id, '🔔 CampusPass: this is a test message. Reminders for your events will arrive here.');
    if (!ok) fail(502, 'telegram_failed', 'Telegram did not accept the message. Try again later.');
    return { sent: true };
  });
  route('DELETE', '/api/me/telegram', ({ user }) => { need(user); q('UPDATE users SET telegram_chat_id = NULL, telegram_code = NULL WHERE id = ?').run(user.id); return { connected: false }; });
  // Called by the bot when a student presses Start with the one-time code
  const linkTelegram = (code, chatId) => {
    const u = q('SELECT id, name FROM users WHERE telegram_code = ?').get(code); if (!u) return null;
    q('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = ?').run(chatId); // one chat — one account
    q('UPDATE users SET telegram_chat_id = ?, telegram_code = NULL WHERE id = ?').run(chatId, u.id); return u.name;
  };
  // Database overview for the moderator (shown at the defense): tables, columns, links and row counts; secrets are masked
  route('GET', '/api/admin/db', ({ user }) => {
    need(user, 'admin');
    const SECRET = /password|token|telegram_/;
    return q("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => {
      const cols = q(`PRAGMA table_info(${name})`).all(), fks = q(`PRAGMA foreign_key_list(${name})`).all();
      const rows = q(`SELECT * FROM ${name} ORDER BY rowid LIMIT 3`).all().map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, SECRET.test(k) && v != null ? '•••' : v])));
      return { table: name, count: q(`SELECT COUNT(*) AS n FROM ${name}`).get().n,
        columns: cols.map((c) => ({ name: c.name, type: c.type, pk: !!c.pk, notNull: !!c.notnull, ref: (fks.find((f) => f.from === c.name) || {}).table || null })), sample: rows };
    });
  });
  route('POST', '/api/admin/reset', ({ user, res }) => {
    need(user, 'admin'); reset(db);
    res.setHeader('Set-Cookie', 'cp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return { ok: true };
  });

  // Simulated reminder delivery (FR-08): called every minute by index.js and directly by tests
  function sendDueReminders() {
    const t = now(), rows = q("SELECT r.*, e.title, e.starts_at FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.status IN ('confirmed','planned') AND r.reminder_channel <> 'off' AND e.starts_at > ?").all(iso(t));
    let sent = 0;
    for (const r of rows) {
      const mins = (new Date(r.starts_at) - t) / 60000;
      const tgMsg = (kind) => { if (r.reminder_channel !== 'telegram') return undefined; const u = q('SELECT lang, telegram_chat_id FROM users WHERE id = ?').get(r.user_id); return bot.reminder((u && chatLang(u.telegram_chat_id)) || (u && u.lang), eventView(eventRow(r.event_id), null), kind, siteUrl()); };
      const hourDue = r.remind_hour && !r.hour_sent && mins <= 60;
      if (r.remind_day && !r.day_sent && mins <= 24 * 60) { if (!hourDue) { notify(r.user_id, r.reminder_channel, `Reminder: ${r.title} starts in less than a day.`, tgMsg('day')); sent++; } q('UPDATE registrations SET day_sent = 1 WHERE id = ?').run(r.id); } // close to the start only the 1-hour reminder is sent
      if (hourDue) { notify(r.user_id, r.reminder_channel, `Reminder: ${r.title} starts in less than an hour.`, tgMsg('hour')); q('UPDATE registrations SET hour_sent = 1 WHERE id = ?').run(r.id); sent++; }
    }
    return sent;
  }

  // ---------- request handling ----------
  async function readJson(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 250000) fail(413, 'too_large', 'Request body is too large.'); chunks.push(c); }
    if (!chunks.length) return {};
    if (!/application\/json/.test(req.headers['content-type'] || '')) fail(415, 'json_required', 'Send JSON.');
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'bad_json', 'Invalid JSON.'); }
  }
  function serveStatic(urlPath, res) {
    const rel = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { // single-page app fallback
        return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => { res.writeHead(e2 ? 404 : 200, { 'Content-Type': MIME['.html'] }); res.end(e2 ? 'Not found' : html); });
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(buf);
    });
  }

  async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://mapgl.2gis.com https://*.2gis.com; worker-src 'self' blob:; child-src blob:; connect-src 'self' https://routing.openstreetmap.de https://*.2gis.com https://*.2gis.ru; img-src 'self' data: blob: https://server.arcgisonline.com https://*.2gis.com https://*.2gis.ru; font-src 'self' data: https://*.2gis.com; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.2gis.com; frame-ancestors 'none'");
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) fail(404, 'not_found', 'Unknown API endpoint.');
      const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readJson(req) : {};
      const out = await r.handler({ req, res, body, user: currentUser(req), params: r.re.exec(url.pathname).groups || {}, query: Object.fromEntries(url.searchParams) });
      if (out !== undefined) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(out)); }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: e.code || 'server_error', message: status === 500 ? 'Something went wrong. Please try again.' : e.message } }));
    }
  }
  // Data adapter for the Telegram bot (server/bot.js): the same rules as the website
  const regUser = (id) => q('SELECT id, name, role, lang, club_id FROM users WHERE id = ?').get(id);
  // The bot acts as the linked user through the same routes as the website, so every right is checked by the same code
  // FR-50 Assistant: AI chat (Gemini, when GEMINI_API_KEY is set) grounded in the data this user may see; built-in answers otherwise
  const aiLimited = assistant.limiter(Number(process.env.AI_MAX_PER_HOUR) || 30);
  route('POST', '/api/assistant', async ({ user, body, req }) => {
    const text = String((body && body.q) || '').trim();
    if (text.length > 500) fail(400, 'too_long', 'Please ask in at most 500 characters.');
    const get = (p) => { const url = new URL(p, 'http://assistant'), r = routes.find((x) => x.method === 'GET' && x.re.test(url.pathname));
      return r.handler({ req: { headers: {}, socket: {} }, res: { setHeader() {}, writeHead() {}, end() {} }, body: {}, user, params: r.re.exec(url.pathname).groups || {}, query: Object.fromEntries(url.searchParams) }); };
    const snap = assistant.buildSnapshotSync(get, user && user.role);
    const who = user ? 'u' + user.id : 'ip' + ((req && req.socket && req.socket.remoteAddress) || '');
    return assistant.smartAnswer(text, body && body.history, (body && body.lang) || (user && user.lang) || 'en', snap, now(),
      { key: opts.aiKey, fetch: opts.aiFetch, limited: text ? aiLimited(who) : false });
  });

  async function callAs(userId, method, path, body) {
    const user = q('SELECT id, email, name, student_id, group_name, role, club_id, lang FROM users WHERE id = ?').get(userId);
    const url = new URL(path, 'http://bot'), r = routes.find((x) => x.method === method && x.re.test(url.pathname));
    if (!r) fail(404, 'not_found', 'Unknown API endpoint.');
    const res = { setHeader() {}, writeHead() {}, end() {} };
    return r.handler({ req: { headers: {}, socket: {} }, res, body: body || {}, user, params: r.re.exec(url.pathname).groups || {}, query: Object.fromEntries(url.searchParams) });
  }
  const botApi = {
    chatInfo: (chatId) => { const u = q('SELECT id, name, role, lang FROM users WHERE telegram_chat_id = ?').get(String(chatId)); const c = q('SELECT lang, await_action FROM telegram_chats WHERE chat_id = ?').get(String(chatId)); return { lang: c ? c.lang : null, await: c ? c.await_action : null, user: u || null }; },
    setChatLang: (chatId, lang) => { if (!LANGS.includes(lang)) return; q('INSERT INTO telegram_chats (chat_id, lang, updated_at) VALUES (?,?,?) ON CONFLICT(chat_id) DO UPDATE SET lang = excluded.lang, updated_at = excluded.updated_at').run(String(chatId), lang, iso(now())); },
    setAwait: (chatId, value) => { q("INSERT INTO telegram_chats (chat_id, lang, await_action, updated_at) VALUES (?, 'en', ?, ?) ON CONFLICT(chat_id) DO UPDATE SET await_action = excluded.await_action, updated_at = excluded.updated_at").run(String(chatId), value || null, iso(now())); },
    call: callAs,
    anyEvent: (id) => { const e = q('SELECT * FROM events WHERE id = ?').get(id); return e ? eventView(e, null) : null; },
    link: (code, chatId) => linkTelegram(code, String(chatId)),
    unlink: (chatId) => { q('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = ?').run(String(chatId)); return true; },
    events: (from, to, userId) => q("SELECT * FROM events WHERE status = 'approved' AND ends_at > ? AND starts_at < ? ORDER BY starts_at").all(iso(from), iso(to)).map((e) => eventView(e, userId ? regUser(userId) : null)),
    event: (id, userId) => { const e = q("SELECT * FROM events WHERE id = ? AND status = 'approved'").get(id); return e ? eventView(e, userId ? regUser(userId) : null) : null; },
    myEvents: (userId) => q("SELECT e.* FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.user_id = ? AND r.status <> 'cancelled' ORDER BY e.starts_at").all(userId).map((e) => eventView(e, regUser(userId))),
    register: (userId, eventId) => registerStudent(regUser(userId), eventId)
  };
  handler.sendDueReminders = sendDueReminders;
  handler.linkTelegram = linkTelegram;
  handler.botApi = botApi;
  handler.siteUrl = siteUrl;
  return handler;
}

module.exports = { createApp };
