// CampusPass — shared API core for the Netlify version (Netlify Functions + Netlify Blobs).
// Same business rules as server/app.js. Educational project. Not a real product or service. All data are fictional.
'use strict';
function createCore(SEED, state) {
  const TYPES = ['sports', 'creative', 'tech', 'intellectual', 'social'];
  const iso = (d) => new Date(d).toISOString();
  const rnd = () => 'CP-' + Array.from(globalThis.crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  class E extends Error { constructor(s, c, m) { super(m); this.s = s; this.c = c; } }
  const fail = (s, c, m) => { throw new E(s, c, m); };

  function seed() {
    const now = new Date(), t = iso(now), D = { users: [], clubs: [], events: [], regs: [], members: [], feedback: [], coins: [], notes: [], sessions: {}, seq: 1, created: t };
    const id = () => D.seq++;
    SEED.clubs.forEach((c) => D.clubs.push({ id: id(), ...c }));
    const club = (n) => D.clubs.find((c) => c.name === n).id;
    const gdsc = club('GDSC (Google Developer Student Club)');
    const U = (email, pw, name, sid, group, role, clubId) => { const u = { id: id(), email, pw, name, student_id: sid, group_name: group, role, club_id: clubId, lang: 'en' }; D.users.push(u); return u.id; };
    const me = U('student@test.local', 'Student123!', 'Aruzhan Bekova', '230001', 'SE-2301', 'student', null);
    U('student2@test.local', 'Student123!', 'Dias Akhmetov', '230002', 'CS-2302', 'student', null);
    const org = U('organizer@test.local', 'Organizer123!', 'Madina Omarova', '220010', 'IT-2201', 'organizer', gdsc);
    U('organizer2@test.local', 'Organizer123!', 'Timur Bekov', '220011', 'SE-2202', 'organizer', club('Chess Club'));
    U('admin@test.local', 'Admin123!', 'Saule Ermekova (Student Affairs)', null, null, 'admin', null);
    const F = SEED.first, L = SEED.last, crowd = [];
    for (let i = 0; i < 120; i++) crowd.push(U(`s${String(i + 1).padStart(3, '0')}@test.local`, 'Student123!', F[i % F.length] + ' ' + L[(i * 7 + 3) % L.length], String(240100 + i), 'ST-24' + String(i % 9 + 1).padStart(2, '0'), 'student', null));
    const at = (o, h, m) => { const d = new Date(now); d.setDate(d.getDate() + o); d.setHours(h, m, 0, 0); return d; };
    const all = [...SEED.events,
      { title: 'Open Lab Demo Day', club: 'GDSC (Google Developer Student Club)', location: 'Coworking Space, 1st Floor', type: 'tech', capacity: 30, taken: 8, coins: 25, description: 'Short demos of student projects. Check-in opens one hour before the start.', status: 'approved', waitlist: 0, demoSoon: true },
      { title: 'Welcome Fair of Clubs', club: 'Volunteers Club', location: 'Main Atrium', type: 'social', capacity: 200, taken: 60, coins: 20, description: 'Meet all student clubs in one place.', status: 'approved', waitlist: 0, past: true }];
    let ci = 0;
    for (const e of all) {
      const start = e.demoSoon ? new Date(now.getTime() + 30 * 60000) : e.past ? at(-3, 12, 0) : at(e.dayOffset, e.hour, e.minute);
      const ev = { id: id(), title: e.title, description: e.description, club_id: club(e.club), location: e.location, type: e.type, starts_at: iso(start), ends_at: iso(start.getTime() + 7200000), capacity: e.capacity, coins: e.coins, status: e.status, created_by: e.club === 'GDSC (Google Developer Student Club)' ? org : null, comment: null };
      D.events.push(ev);
      if (e.status !== 'approved') continue;
      for (let k = 0; k < e.taken; k++) D.regs.push(reg(id(), ev.id, crowd[(ci++) % 120], e.past ? 'checked_in' : 'confirmed', rnd(), t));
      for (let k = 0; k < e.waitlist; k++) D.regs.push(reg(id(), ev.id, crowd[(ci++) % 120], 'waitlisted', null, t));
      if (e.past) { const r = reg(id(), ev.id, me, 'checked_in', rnd(), t); r.method = 'qr'; D.regs.push(r); D.coins.push({ user_id: me, amount: e.coins, reason: 'Check-in', event_id: ev.id, created_at: iso(start) }); }
    }
    D.coins.push({ user_id: me, amount: 100, reason: 'Welcome bonus', event_id: null, created_at: t });
    D.members.push({ user_id: me, club_id: gdsc, status: 'accepted', message: '', created_at: t });
    D.members.push({ user_id: crowd[0], club_id: club('Music Club'), status: 'pending', message: 'I play guitar and would like to join the acoustic nights.', created_at: t });
    return D;
  }
  function reg(id, event_id, user_id, status, ticket, t) { return { id, event_id, user_id, status, ticket, channel: 'off', day: true, hour: true, day_sent: false, hour_sent: false, method: null, created_at: t, updated_at: t }; }

  let D = state || seed();
  let TOKEN = null, NEW_TOKEN;

  // ---------- helpers mirroring server/app.js ----------
  const now = () => new Date();
  const notify = (uid, channel, text) => D.notes.unshift({ user_id: uid, channel, text, createdAt: iso(now()) });
  const user = () => { const s = TOKEN && D.sessions[TOKEN]; if (!s || s.exp < Date.now()) return null; return D.users.find((u) => u.id === s.uid) || null; };
  const need = (u, ...roles) => { if (!u) fail(401, 'auth_required', 'Please sign in.'); if (roles.length && !roles.includes(u.role)) fail(403, 'forbidden', 'You do not have access to this action.'); };
  const ev = (id) => { const e = D.events.find((x) => x.id === Number(id)); if (!e) fail(404, 'event_not_found', 'Event not found.'); return e; };
  const taken = (eid) => D.regs.filter((r) => r.event_id === eid && (r.status === 'confirmed' || r.status === 'checked_in')).length;
  const waitQ = (eid) => D.regs.filter((r) => r.event_id === eid && r.status === 'waitlisted').sort((a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : a.id - b.id));
  const canManage = (u, e) => u.role === 'admin' || (u.role === 'organizer' && u.club_id === e.club_id);
  const balance = (uid) => D.coins.filter((c) => c.user_id === uid).reduce((a, c) => a + c.amount, 0);
  const str = (v, n, a, b) => { const s = typeof v === 'string' ? v.trim() : ''; if (s.length < a || s.length > b) fail(400, 'invalid_' + n, `${n[0].toUpperCase() + n.slice(1)} must be ${a}–${b} characters.`); return s; };
  function view(e, u) {
    const c = D.clubs.find((x) => x.id === e.club_id), tk = taken(e.id), q = waitQ(e.id);
    const o = { id: e.id, title: e.title, description: e.description, clubId: e.club_id, club: c.name, location: e.location, type: e.type, startsAt: e.starts_at, endsAt: e.ends_at, capacity: e.capacity, taken: tk, free: Math.max(0, e.capacity - tk), waitlist: q.length, coins: e.coins, status: e.status };
    if (u) { const r = D.regs.find((x) => x.event_id === e.id && x.user_id === u.id); if (r && r.status !== 'cancelled') {
      o.my = { id: r.id, status: r.status, ticketCode: r.status === 'waitlisted' ? null : r.ticket, reminder: { channel: r.channel, day: r.day, hour: r.hour } };
      if (r.status === 'waitlisted') o.my.position = q.indexOf(r) + 1;
      const f = D.feedback.find((x) => x.event_id === e.id && x.user_id === u.id); if (f) o.my.rating = f.rating; } }
    return o;
  }
  function reminders() {
    const t = now();
    for (const r of D.regs) {
      if (r.status !== 'confirmed' || r.channel === 'off') continue;
      const e = D.events.find((x) => x.id === r.event_id), mins = (new Date(e.starts_at) - t) / 60000; if (mins <= 0) continue;
      if (r.day && !r.day_sent && mins <= 1440) { notify(r.user_id, r.channel, `Reminder: ${e.title} starts in less than a day.`); r.day_sent = true; }
      if (r.hour && !r.hour_sent && mins <= 60) { notify(r.user_id, r.channel, `Reminder: ${e.title} starts in less than an hour.`); r.hour_sent = true; }
    }
  }

  // ---------- routes ----------
  const R = [];
  const on = (m, p, h) => R.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), h });
  on('POST', '/api/auth/login', (b) => { const u = D.users.find((x) => x.email === String(b.email || '').trim().toLowerCase()); if (!u || u.pw !== b.password) fail(401, 'invalid_credentials', 'Wrong e-mail or password.'); const tk = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''); D.sessions[tk] = { uid: u.id, exp: Date.now() + 12 * 3600000 }; NEW_TOKEN = tk; return { user: { id: u.id, name: u.name, email: u.email, role: u.role } }; });
  on('POST', '/api/auth/logout', () => { if (TOKEN) delete D.sessions[TOKEN]; NEW_TOKEN = ''; return { ok: true }; });
  on('GET', '/api/me', (b, u) => { need(u); const c = u.club_id ? D.clubs.find((x) => x.id === u.club_id) : null; return { id: u.id, name: u.name, email: u.email, studentId: u.student_id, group: u.group_name, role: u.role, lang: u.lang, club: c ? { id: c.id, name: c.name } : null, coins: balance(u.id) }; });
  on('PUT', '/api/me/lang', (b, u) => { need(u); u.lang = b.lang; return { lang: b.lang }; });
  on('GET', '/api/events', (b, u, p, q) => { const days = Math.min(60, Number(q.get('days')) || 7), f = iso(now()), to = iso(now().getTime() + days * 86400000); return D.events.filter((e) => e.status === 'approved' && e.ends_at > f && e.starts_at < to).sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => view(e, u)); });
  on('GET', '/api/events/:id', (b, u, p) => view(ev(p.id), u));
  on('GET', '/api/events/:id/ics', (b, u, p) => { const e = ev(p.id), f = (s) => s.replace(/[-:]/g, '').replace(/\.\d{3}/, ''); return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CampusPass//Demo//EN', 'BEGIN:VEVENT', `UID:event-${e.id}@campuspass.local`, `DTSTAMP:${f(iso(now()))}`, `DTSTART:${f(e.starts_at)}`, `DTEND:${f(e.ends_at)}`, `SUMMARY:${e.title}`, `LOCATION:${e.location}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'); });
  on('POST', '/api/events/:id/register', (b, u, p) => {
    need(u, 'student'); const e = ev(p.id);
    if (e.status !== 'approved') fail(409, 'not_open', 'Registration is not open for this event.');
    if (e.starts_at <= iso(now())) fail(409, 'already_started', 'The event has already started.');
    let r = D.regs.find((x) => x.event_id === e.id && x.user_id === u.id);
    if (r && r.status !== 'cancelled') fail(409, 'already_registered', 'You are already registered or on the waitlist.');
    const st = taken(e.id) < e.capacity ? 'confirmed' : 'waitlisted', t = iso(now());
    if (r) Object.assign(r, { status: st, ticket: st === 'confirmed' ? rnd() : null, updated_at: t, day_sent: false, hour_sent: false });
    else { r = reg(D.seq++, e.id, u.id, st, st === 'confirmed' ? rnd() : null, t); D.regs.push(r); }
    notify(u.id, 'email', st === 'confirmed' ? `Registration confirmed: ${e.title}. Ticket ${r.ticket}.` : `You joined the waitlist for ${e.title}.`);
    return view(e, u);
  });
  on('DELETE', '/api/events/:id/registration', (b, u, p) => {
    need(u, 'student'); const e = ev(p.id), r = D.regs.find((x) => x.event_id === e.id && x.user_id === u.id && (x.status === 'confirmed' || x.status === 'waitlisted'));
    if (!r) fail(404, 'not_registered', 'You are not registered for this event.');
    if (e.starts_at <= iso(now())) fail(409, 'already_started', 'The event has already started.');
    const was = r.status; r.status = 'cancelled'; r.updated_at = iso(now()); let promoted = null;
    if (was === 'confirmed') { const n = waitQ(e.id)[0]; if (n) { n.status = 'confirmed'; n.ticket = rnd(); n.updated_at = iso(now()); notify(n.user_id, 'app', `A seat became free: you are now registered for ${e.title}. Ticket ${n.ticket}.`); promoted = n.user_id; } }
    return { ok: true, promotedUserId: promoted };
  });
  on('PUT', '/api/registrations/:id/reminders', (b, u, p) => { need(u, 'student'); const r = D.regs.find((x) => x.id === Number(p.id) && x.user_id === u.id); if (!r) fail(404, 'not_found', 'Registration not found.'); if (!['off', 'push', 'telegram'].includes(b.channel)) fail(400, 'invalid_channel', 'Channel must be off, push or telegram.'); Object.assign(r, { channel: b.channel, day: !!b.day, hour: !!b.hour }); return { channel: r.channel, day: r.day, hour: r.hour }; });
  on('GET', '/api/me/registrations', (b, u) => { need(u); return D.regs.filter((r) => r.user_id === u.id && r.status !== 'cancelled').map((r) => ev(r.event_id)).sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => view(e, u)); });
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
  on('POST', '/api/events', (b, u) => {
    need(u, 'organizer', 'admin');
    const title = str(b.title, 'title', 3, 120), description = str(b.description, 'description', 10, 1000), location = str(b.location, 'location', 2, 120);
    if (!TYPES.includes(b.type)) fail(400, 'invalid_type', 'Choose an event type.');
    const s = new Date(b.startsAt); if (isNaN(s)) fail(400, 'invalid_start', 'Enter a valid date and time.'); if (s <= now()) fail(400, 'start_in_past', 'The event must start in the future.');
    const mins = Number(b.durationMinutes) || 120; if (mins < 15 || mins > 720) fail(400, 'invalid_duration', 'Duration must be 15–720 minutes.');
    const cap = Number(b.capacity); if (!Number.isInteger(cap) || cap < 1 || cap > 500) fail(400, 'invalid_capacity', 'Seats must be 1–500.');
    const e = { id: D.seq++, title, description, club_id: u.role === 'admin' ? Number(b.clubId) : u.club_id, location, type: b.type, starts_at: iso(s), ends_at: iso(s.getTime() + mins * 60000), capacity: cap, coins: 20, status: 'pending', created_by: u.id, comment: null };
    D.events.push(e); D.users.filter((x) => x.role === 'admin').forEach((a) => notify(a.id, 'app', `New event waiting for review: ${title}.`)); return { id: e.id, status: 'pending' };
  });
  on('GET', '/api/organizer/events', (b, u) => { need(u, 'organizer', 'admin'); return D.events.filter((e) => u.role === 'admin' || e.club_id === u.club_id).sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => ({ ...view(e, null), comment: e.comment })); });
  on('GET', '/api/events/:id/participants', (b, u, p) => { need(u, 'organizer', 'admin'); const e = ev(p.id); if (!canManage(u, e)) fail(403, 'forbidden', "You can manage only your club's events."); return D.regs.filter((r) => r.event_id === e.id && (r.status === 'confirmed' || r.status === 'checked_in')).map((r) => { const s = D.users.find((x) => x.id === r.user_id); return { id: r.id, status: r.status, method: r.method, name: s.name, studentId: s.student_id }; }).sort((a, c) => a.name.localeCompare(c.name)); });
  on('POST', '/api/checkin', (b, u) => {
    need(u, 'organizer', 'admin'); const e = ev(b.eventId); if (!canManage(u, e)) fail(403, 'forbidden', "You can check in only at your club's events.");
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
  on('GET', '/api/admin/pending-events', (b, u) => { need(u, 'admin'); return D.events.filter((e) => e.status === 'pending').map((e) => view(e, null)); });
  on('POST', '/api/admin/events/:id/decision', (b, u, p) => {
    need(u, 'admin'); const e = ev(p.id); if (e.status !== 'pending') fail(409, 'not_pending', 'This event is not waiting for review.');
    if (!['approve', 'reject'].includes(b.decision)) fail(400, 'invalid_decision', 'Decision must be approve or reject.');
    const c = String(b.comment || '').trim().slice(0, 500); if (b.decision === 'reject' && c.length < 5) fail(400, 'comment_required', 'Write a short reason for the rejection.');
    e.status = b.decision === 'approve' ? 'approved' : 'rejected'; e.comment = c || null; if (e.created_by) notify(e.created_by, 'app', `Your event "${e.title}" was ${e.status}.${c ? ' Comment: ' + c : ''}`); return { id: e.id, status: e.status };
  });
  on('GET', '/api/admin/club-requests', (b, u) => { need(u, 'admin'); return D.members.filter((m) => m.status === 'pending').map((m) => { const s = D.users.find((x) => x.id === m.user_id); return { userId: m.user_id, clubId: m.club_id, message: m.message, createdAt: m.created_at, name: s.name, studentId: s.student_id, club: D.clubs.find((c) => c.id === m.club_id).name }; }); });
  on('POST', '/api/admin/club-requests/decision', (b, u) => { need(u, 'admin'); const m = D.members.find((x) => x.user_id === Number(b.userId) && x.club_id === Number(b.clubId) && x.status === 'pending'); if (!m) fail(404, 'request_not_found', 'Request not found.'); m.status = b.decision === 'accept' ? 'accepted' : 'declined'; notify(m.user_id, 'app', `Your request to join ${D.clubs.find((c) => c.id === m.club_id).name} was ${m.status}.`); return { status: m.status }; });
  on('GET', '/api/admin/stats', (b, u) => {
    need(u, 'admin');
    const events = D.events.filter((e) => e.status === 'approved').sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1)).map((e) => { const v = view(e, null), f = D.feedback.filter((x) => x.event_id === e.id); return { id: e.id, title: e.title, startsAt: e.starts_at, capacity: e.capacity, registered: v.taken, fillRate: Math.round((v.taken / e.capacity) * 100), waitlist: v.waitlist, checkedIn: D.regs.filter((r) => r.event_id === e.id && r.status === 'checked_in').length, avgRating: f.length ? Math.round((f.reduce((a, x) => a + x.rating, 0) / f.length) * 10) / 10 : null }; });
    return { totals: { clubs: D.clubs.length, approvedEvents: events.length, registrations: events.reduce((a, e) => a + e.registered, 0), pending: D.events.filter((e) => e.status === 'pending').length + D.members.filter((m) => m.status === 'pending').length }, events };
  });
  on('GET', '/api/admin/users', (b, u) => { need(u, 'admin'); return D.users.filter((x) => !/^s\d{3}@/.test(x.email)).map((x) => ({ id: x.id, name: x.name, email: x.email, role: x.role, club: x.club_id ? D.clubs.find((c) => c.id === x.club_id).name : null })); });
  on('PUT', '/api/admin/users/:id/role', (b, u, p) => { need(u, 'admin'); const x = D.users.find((y) => y.id === Number(p.id)); if (!x) fail(404, 'user_not_found', 'User not found.'); if (x.id === u.id) fail(409, 'own_role', 'You cannot change your own role.'); if (!['student', 'organizer', 'admin'].includes(b.role)) fail(400, 'invalid_role', 'Invalid role.'); x.role = b.role; x.club_id = b.role === 'organizer' ? Number(b.clubId) : null; return { id: x.id, role: x.role }; });

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
  return { handle, get state() { return D; } };
}
module.exports = { createCore };
