// CampusPass — HTTP API and static files. Requirement IDs (FR-xx) refer to SRS section 4.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { tx, iso } = require('./db');
const auth = require('./auth');

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = ['sports', 'creative', 'tech', 'intellectual', 'social'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const fail = (status, code, message) => { throw new HttpError(status, code, message); };

function createApp(db, opts = {}) {
  const ttlHours = opts.sessionTtlHours || 12;
  const now = () => (opts.clock ? opts.clock() : new Date());
  const q = (sql) => db.prepare(sql);
  const notify = (userId, channel, text) => q('INSERT INTO notifications (user_id, channel, text, created_at) VALUES (?,?,?,?)').run(userId, channel, text, iso(now()));
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
  const canManage = (u, e) => u.role === 'admin' || (u.role === 'organizer' && u.club_id === e.club_id);
  const balance = (uid) => q('SELECT COALESCE(SUM(amount),0) AS b FROM coin_transactions WHERE user_id = ?').get(uid).b;

  function eventView(e, u) {
    const c = q('SELECT name, category FROM clubs WHERE id = ?').get(e.club_id);
    const tk = taken(e.id);
    const wait = q("SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'waitlisted'").get(e.id).n;
    const out = { id: e.id, title: e.title, description: e.description, clubId: e.club_id, club: c.name, location: e.location, type: e.type,
      startsAt: e.starts_at, endsAt: e.ends_at, capacity: e.capacity, taken: tk, free: Math.max(0, e.capacity - tk), waitlist: wait, coins: e.coins, status: e.status };
    if (u) {
      const r = q('SELECT * FROM registrations WHERE event_id = ? AND user_id = ?').get(e.id, u.id);
      if (r && r.status !== 'cancelled') {
        out.my = { id: r.id, status: r.status, ticketCode: r.status === 'waitlisted' ? null : r.ticket_code, reminder: { channel: r.reminder_channel, day: !!r.remind_day, hour: !!r.remind_hour } };
        if (r.status === 'waitlisted') out.my.position = q("SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'waitlisted' AND (updated_at < ? OR (updated_at = ? AND id <= ?))").get(e.id, r.updated_at, r.updated_at, r.id).n;
        const fb = q('SELECT rating FROM feedback WHERE event_id = ? AND user_id = ?').get(e.id, u.id);
        if (fb) out.my.rating = fb.rating;
      }
    }
    return out;
  }

  // ---------- routes ----------
  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

  // FR-01 Sign in with a test account; session cookie
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
    return { id: user.id, name: user.name, email: user.email, studentId: user.student_id, group: user.group_name, role: user.role, lang: user.lang, club, coins: balance(user.id) };
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
  route('POST', '/api/events/:id/register', ({ user, params }) => {
    need(user, 'student');
    return tx(db, () => {
      const e = eventRow(int(params.id));
      if (e.status !== 'approved') fail(409, 'not_open', 'Registration is not open for this event.');
      if (e.starts_at <= iso(now())) fail(409, 'already_started', 'The event has already started.');
      const r = q('SELECT * FROM registrations WHERE event_id = ? AND user_id = ?').get(e.id, user.id);
      if (r && r.status !== 'cancelled') fail(409, 'already_registered', 'You are already registered or on the waitlist.');
      const status = taken(e.id) < e.capacity ? 'confirmed' : 'waitlisted';
      const code = status === 'confirmed' ? newTicket() : null, t = iso(now());
      if (r) q('UPDATE registrations SET status = ?, ticket_code = ?, updated_at = ?, day_sent = 0, hour_sent = 0 WHERE id = ?').run(status, code, t, r.id);
      else q('INSERT INTO registrations (event_id, user_id, status, ticket_code, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(e.id, user.id, status, code, t, t);
      notify(user.id, 'email', status === 'confirmed' ? `Registration confirmed: ${e.title}. Ticket ${code}.` : `You joined the waitlist for ${e.title}.`);
      return eventView(e, user);
    });
  });

  // FR-06 Cancel before start; the first waitlisted student gets the seat
  route('DELETE', '/api/events/:id/registration', ({ user, params }) => {
    need(user, 'student');
    return tx(db, () => {
      const e = eventRow(int(params.id));
      const r = q("SELECT * FROM registrations WHERE event_id = ? AND user_id = ? AND status IN ('confirmed','waitlisted')").get(e.id, user.id);
      if (!r) fail(404, 'not_registered', 'You are not registered for this event.');
      if (e.starts_at <= iso(now())) fail(409, 'already_started', 'The event has already started.');
      q("UPDATE registrations SET status = 'cancelled', updated_at = ? WHERE id = ?").run(iso(now()), r.id);
      let promoted = null;
      if (r.status === 'confirmed') {
        const next = q("SELECT * FROM registrations WHERE event_id = ? AND status = 'waitlisted' ORDER BY updated_at, id LIMIT 1").get(e.id);
        if (next) {
          const code = newTicket();
          q("UPDATE registrations SET status = 'confirmed', ticket_code = ?, updated_at = ? WHERE id = ?").run(code, iso(now()), next.id);
          notify(next.user_id, 'app', `A seat became free: you are now registered for ${e.title}. Ticket ${code}.`);
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
  // FR-16 Coin balance and history
  route('GET', '/api/me/coins', ({ user }) => {
    need(user);
    return { balance: balance(user.id), history: q('SELECT t.amount, t.reason, t.created_at AS createdAt, e.title AS event FROM coin_transactions t LEFT JOIN events e ON e.id = t.event_id WHERE t.user_id = ? ORDER BY t.created_at DESC, t.id DESC').all(user.id) };
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
    .map((c) => { if (user) { const m = q('SELECT status FROM memberships WHERE user_id = ? AND club_id = ?').get(user.id, c.id); c.myStatus = m ? m.status : null; } return c; }));
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
  route('POST', '/api/events', ({ user, body }) => {
    need(user, 'organizer', 'admin');
    const title = str(body.title, 'title', 3, 120), description = str(body.description, 'description', 10, 1000), location = str(body.location, 'location', 2, 120);
    if (!TYPES.includes(body.type)) fail(400, 'invalid_type', 'Choose an event type.');
    const start = new Date(body.startsAt); if (isNaN(start)) fail(400, 'invalid_start', 'Enter a valid date and time.');
    if (start <= now()) fail(400, 'start_in_past', 'The event must start in the future.');
    const minutes = Number(body.durationMinutes) || 120; if (minutes < 15 || minutes > 720) fail(400, 'invalid_duration', 'Duration must be 15–720 minutes.');
    const capacity = Number(body.capacity); if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) fail(400, 'invalid_capacity', 'Seats must be 1–500.');
    const clubId = user.role === 'admin' ? int(body.clubId) : user.club_id;
    const id = q(`INSERT INTO events (title, description, club_id, location, type, starts_at, ends_at, capacity, coins, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`)
      .run(title, description, clubId, location, body.type, iso(start), iso(start.getTime() + minutes * 60000), capacity, 20, user.id, iso(now())).lastInsertRowid;
    for (const a of q("SELECT id FROM users WHERE role = 'admin'").all()) notify(a.id, 'app', `New event waiting for review: ${title}.`);
    return { id, status: 'pending' };
  });
  route('GET', '/api/organizer/events', ({ user }) => {
    need(user, 'organizer', 'admin');
    const rows = user.role === 'admin' ? q('SELECT * FROM events ORDER BY starts_at').all() : q('SELECT * FROM events WHERE club_id = ? ORDER BY starts_at').all(user.club_id);
    return rows.map((e) => ({ ...eventView(e, null), comment: e.moderation_comment }));
  });

  // FR-14, FR-15 Participants and check-in (organizer of the club or admin)
  route('GET', '/api/events/:id/participants', ({ user, params }) => {
    need(user, 'organizer', 'admin'); const e = eventRow(int(params.id)); if (!canManage(user, e)) fail(403, 'forbidden', 'You can manage only your club\'s events.');
    return q("SELECT r.id, r.status, r.checkin_method AS method, u.name, u.student_id AS studentId FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.status IN ('confirmed','checked_in') ORDER BY u.name").all(e.id);
  });
  route('POST', '/api/checkin', ({ user, body }) => {
    need(user, 'organizer', 'admin');
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

  // FR-12 Moderation of events (admin = Student Affairs moderator)
  route('GET', '/api/admin/pending-events', ({ user }) => { need(user, 'admin'); return q("SELECT * FROM events WHERE status = 'pending' ORDER BY starts_at").all().map((e) => eventView(e, null)); });
  route('POST', '/api/admin/events/:id/decision', ({ user, params, body }) => {
    need(user, 'admin'); const e = eventRow(int(params.id));
    if (e.status !== 'pending') fail(409, 'not_pending', 'This event is not waiting for review.');
    if (!['approve', 'reject'].includes(body.decision)) fail(400, 'invalid_decision', 'Decision must be approve or reject.');
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : '';
    if (body.decision === 'reject' && comment.length < 5) fail(400, 'comment_required', 'Write a short reason for the rejection.');
    const status = body.decision === 'approve' ? 'approved' : 'rejected';
    q('UPDATE events SET status = ?, moderation_comment = ? WHERE id = ?').run(status, comment || null, e.id);
    if (e.created_by) notify(e.created_by, 'app', `Your event "${e.title}" was ${status}.${comment ? ' Comment: ' + comment : ''}`);
    return { id: e.id, status };
  });
  // FR-13 Club join requests
  route('GET', '/api/admin/club-requests', ({ user }) => { need(user, 'admin'); return q("SELECT m.user_id AS userId, m.club_id AS clubId, m.message, m.created_at AS createdAt, u.name, u.student_id AS studentId, c.name AS club FROM memberships m JOIN users u ON u.id = m.user_id JOIN clubs c ON c.id = m.club_id WHERE m.status = 'pending' ORDER BY m.created_at").all(); });
  route('POST', '/api/admin/club-requests/decision', ({ user, body }) => {
    need(user, 'admin'); const uid = int(body.userId), cid = int(body.clubId);
    if (!['accept', 'decline'].includes(body.decision)) fail(400, 'invalid_decision', 'Decision must be accept or decline.');
    const m = q("SELECT 1 FROM memberships WHERE user_id = ? AND club_id = ? AND status = 'pending'").get(uid, cid); if (!m) fail(404, 'request_not_found', 'Request not found.');
    const status = body.decision === 'accept' ? 'accepted' : 'declined';
    q('UPDATE memberships SET status = ?, decided_at = ? WHERE user_id = ? AND club_id = ?').run(status, iso(now()), uid, cid);
    const club = q('SELECT name FROM clubs WHERE id = ?').get(cid).name;
    notify(uid, 'app', `Your request to join ${club} was ${status}.`);
    return { status };
  });
  // FR-18 Statistics
  route('GET', '/api/admin/stats', ({ user }) => {
    need(user, 'admin');
    const events = q("SELECT * FROM events WHERE status = 'approved' ORDER BY starts_at").all().map((e) => {
      const v = eventView(e, null);
      const checked = q("SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'checked_in'").get(e.id).n;
      const fb = q('SELECT AVG(rating) AS a, COUNT(*) AS n FROM feedback WHERE event_id = ?').get(e.id);
      return { id: e.id, title: e.title, startsAt: e.starts_at, capacity: e.capacity, registered: v.taken, fillRate: Math.round((v.taken / e.capacity) * 100), waitlist: v.waitlist, checkedIn: checked, avgRating: fb.n ? Math.round(fb.a * 10) / 10 : null, ratings: fb.n };
    });
    const clubs = q('SELECT category, COUNT(*) AS n FROM clubs GROUP BY category').all();
    const pending = q("SELECT COUNT(*) AS n FROM events WHERE status = 'pending'").get().n + q("SELECT COUNT(*) AS n FROM memberships WHERE status = 'pending'").get().n;
    return { totals: { clubs: clubs.reduce((a, c) => a + c.n, 0), approvedEvents: events.length, registrations: events.reduce((a, e) => a + e.registered, 0), pending }, clubsByCategory: clubs, events };
  });
  // FR-20 Role management
  route('GET', '/api/admin/users', ({ user }) => { need(user, 'admin'); return q("SELECT u.id, u.name, u.email, u.role, c.name AS club FROM users u LEFT JOIN clubs c ON c.id = u.club_id WHERE u.email NOT LIKE 's___@test.local' ORDER BY u.role, u.name").all(); });
  route('PUT', '/api/admin/users/:id/role', ({ user, params, body }) => {
    need(user, 'admin'); const id = int(params.id);
    if (id === user.id) fail(409, 'own_role', 'You cannot change your own role.');
    if (!['student', 'organizer', 'admin'].includes(body.role)) fail(400, 'invalid_role', 'Role must be student, organizer or admin.');
    const clubId = body.role === 'organizer' ? int(body.clubId) : null;
    const r = q('UPDATE users SET role = ?, club_id = ? WHERE id = ?').run(body.role, clubId, id); if (!r.changes) fail(404, 'user_not_found', 'User not found.');
    q('DELETE FROM sessions WHERE user_id = ?').run(id); // new rights apply at next sign-in
    return { id, role: body.role, clubId };
  });

  // Simulated reminder delivery (FR-08): called every minute by index.js and directly by tests
  function sendDueReminders() {
    const t = now(), rows = q("SELECT r.*, e.title, e.starts_at FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.status = 'confirmed' AND r.reminder_channel <> 'off' AND e.starts_at > ?").all(iso(t));
    let sent = 0;
    for (const r of rows) {
      const mins = (new Date(r.starts_at) - t) / 60000;
      if (r.remind_day && !r.day_sent && mins <= 24 * 60) { notify(r.user_id, r.reminder_channel, `Reminder: ${r.title} starts in less than a day.`); q('UPDATE registrations SET day_sent = 1 WHERE id = ?').run(r.id); sent++; }
      if (r.remind_hour && !r.hour_sent && mins <= 60) { notify(r.user_id, r.reminder_channel, `Reminder: ${r.title} starts in less than an hour.`); q('UPDATE registrations SET hour_sent = 1 WHERE id = ?').run(r.id); sent++; }
    }
    return sent;
  }

  // ---------- request handling ----------
  async function readJson(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 100000) fail(413, 'too_large', 'Request body is too large.'); chunks.push(c); }
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
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
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
  handler.sendDueReminders = sendDueReminders;
  return handler;
}

module.exports = { createApp };
