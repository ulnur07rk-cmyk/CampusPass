// CampusPass — automated acceptance tests (run: npm test). IDs match Appendix G of the SRS.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { open, seed } = require('../server/db');
const { createApp } = require('../server/app');

let server, base, app, db;
test.before(async () => {
  // Fixed clock: today at 08:00 local time, so the tests do not depend on when they are run
  const NOW = new Date(); NOW.setHours(8, 0, 0, 0);
  db = open(':memory:'); seed(db, NOW);
  app = createApp(db, { clock: () => new Date(NOW) });
  server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, path, body, cookie) {
  const r = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
// Test sign-in also gives the consent of C08 (the consent screen itself is tested in AT-22)
const login = async (email, password) => { const ck = (await call('POST', '/api/auth/login', { email, password })).cookie; await call('POST', '/api/me/consent', {}, ck); return ck; };
const eventId = (title) => db.prepare('SELECT id FROM events WHERE title = ?').get(title).id;

test('AT-01 (FR-01) valid test account signs in; wrong password is rejected', async () => {
  const ok = await call('POST', '/api/auth/login', { email: 'student1@test.local', password: 'Student123!' });
  assert.equal(ok.status, 200); assert.equal(ok.body.user.role, 'student'); assert.match(ok.cookie, /^cp_session=/);
  const bad = await call('POST', '/api/auth/login', { email: 'student1@test.local', password: 'wrong' });
  assert.equal(bad.status, 401);
});

test('AT-02 (FR-02, FR-03) poster lists only approved events with free seats', async () => {
  const s = await login('student1@test.local', 'Student123!');
  const r = await call('GET', '/api/events?days=7', null, s);
  assert.equal(r.status, 200); assert.ok(r.body.length > 0);
  assert.ok(r.body.every((e) => e.status === 'approved' && e.free === Math.max(0, e.capacity - e.taken)));
  assert.ok(!r.body.some((e) => e.title === 'Japanese Tea Ceremony'), 'pending event must be hidden');
});

test('AT-03 (FR-04, FR-07) registration gives a unique ticket; a second registration is refused', async () => {
  const s = await login('student1@test.local', 'Student123!');
  const id = eventId('Cloud Basics Workshop');
  const r = await call('POST', `/api/events/${id}/register`, {}, s);
  assert.equal(r.status, 200); assert.equal(r.body.my.status, 'confirmed'); assert.match(r.body.my.ticketCode, /^CP-[0-9A-F]{10}$/);
  const again = await call('POST', `/api/events/${id}/register`, {}, s);
  assert.equal(again.status, 409); assert.equal(again.body.error.code, 'already_registered');
});

test('AT-04 (FR-05) a full event puts the student on the waitlist with a position', async () => {
  const s = await login('student1@test.local', 'Student123!');
  const r = await call('POST', `/api/events/${eventId('Mafia Night')}/register`, {}, s);
  assert.equal(r.status, 200); assert.equal(r.body.my.status, 'waitlisted'); assert.equal(r.body.my.position, 4); assert.equal(r.body.my.ticketCode, null);
});

test('AT-05 (FR-06) cancelling a confirmed seat promotes the first waitlisted student and notifies them', async () => {
  const id = eventId('Mafia Night');
  const holder = db.prepare("SELECT u.email FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.status = 'confirmed' LIMIT 1").get(id).email;
  const first = db.prepare("SELECT user_id FROM registrations WHERE event_id = ? AND status = 'waitlisted' ORDER BY updated_at, id LIMIT 1").get(id).user_id;
  const s = await login(holder, 'Student123!');
  const r = await call('DELETE', `/api/events/${id}/registration`, {}, s);
  assert.equal(r.status, 200); assert.equal(r.body.promotedUserId, first);
  assert.equal(db.prepare('SELECT status FROM registrations WHERE event_id = ? AND user_id = ?').get(id, first).status, 'confirmed');
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE 'A seat became free%'").get(first));
});

test('AT-06 (FR-08) opt-in reminder is delivered once through the chosen channel', async () => {
  const s = await login('student2@test.local', 'Student123!');
  // Event later today: only the 1-day reminder is due
  const reg = await call('POST', `/api/events/${eventId('Table Tennis Open')}/register`, {}, s);
  const r = await call('PUT', `/api/registrations/${reg.body.my.id}/reminders`, { channel: 'telegram', day: true, hour: true }, s);
  assert.equal(r.status, 200);
  assert.equal(app.sendDueReminders(), 1); assert.equal(app.sendDueReminders(), 0, 'no duplicates');
  // Event in 30 minutes: only the 1-hour reminder (no late "less than a day" message)
  const soon = await call('POST', `/api/events/${eventId('Open Lab Demo Day')}/register`, {}, s);
  await call('PUT', `/api/registrations/${soon.body.my.id}/reminders`, { channel: 'telegram', day: true, hour: true }, s);
  assert.equal(app.sendDueReminders(), 1); assert.equal(app.sendDueReminders(), 0);
  const n = await call('GET', '/api/me/notifications', null, s);
  assert.equal(n.body.filter((x) => x.channel === 'telegram').length, 2);
  assert.ok(n.body.some((x) => /less than an hour/.test(x.text)) && n.body.some((x) => /less than a day/.test(x.text)));
});

test('AT-07 (FR-14, FR-16) organizer checks in by ticket code; coins are added; double check-in is refused', async () => {
  const st = await login('student1@test.local', 'Student123!');
  const id = eventId('Open Lab Demo Day');
  const reg = await call('POST', `/api/events/${id}/register`, {}, st);
  const before = (await call('GET', '/api/me/coins', null, st)).body.balance;
  const org = await login('organizer1@test.local', 'Organizer123!');
  const c = await call('POST', '/api/checkin', { eventId: id, ticketCode: reg.body.my.ticketCode }, org);
  assert.equal(c.status, 200); assert.equal(c.body.method, 'qr');
  assert.equal((await call('GET', '/api/me/coins', null, st)).body.balance, before + 25);
  const again = await call('POST', '/api/checkin', { eventId: id, ticketCode: reg.body.my.ticketCode }, org);
  assert.equal(again.status, 409); assert.equal(again.body.error.code, 'already_checked_in');
});

test('AT-08 (FR-15) manual check-in from the participant list works; a ticket for another event is rejected', async () => {
  const org = await login('organizer1@test.local', 'Organizer123!');
  const id = eventId('Open Lab Demo Day');
  const p = await call('GET', `/api/events/${id}/participants`, null, org);
  const target = p.body.find((x) => x.status === 'confirmed');
  const r = await call('POST', '/api/checkin', { eventId: id, registrationId: target.id }, org);
  assert.equal(r.status, 200); assert.equal(r.body.method, 'manual');
  const other = db.prepare("SELECT r.ticket_code FROM registrations r JOIN events e ON e.id = r.event_id WHERE e.title = 'Campus Hackathon 2026' AND r.status = 'confirmed' LIMIT 1").get().ticket_code;
  const wrong = await call('POST', '/api/checkin', { eventId: id, ticketCode: other }, org);
  assert.equal(wrong.status, 409); assert.equal(wrong.body.error.code, 'wrong_event');
});

test('AT-09 (FR-11, FR-12) organizer submits an event; it stays hidden until the moderator approves it', async () => {
  const org = await login('organizer1@test.local', 'Organizer123!');
  const start = new Date(Date.now() + 3 * 86400000).toISOString();
  const r = await call('POST', '/api/events', { title: 'Flutter Study Jam', type: 'tech', venueId: 'expo', startsAt: start, durationMinutes: 90, capacity: 30, description: 'Build your first Flutter app together.' }, org);
  assert.equal(r.status, 200); assert.equal(r.body.status, 'pending');
  const st = await login('student1@test.local', 'Student123!');
  assert.ok(!(await call('GET', '/api/events', null, st)).body.some((e) => e.id === r.body.id));
  const adm = await login('moderator@test.local', 'Moderator123!');
  const noReason = await call('POST', `/api/admin/events/${r.body.id}/decision`, { decision: 'reject' }, adm);
  assert.equal(noReason.status, 400);
  assert.equal((await call('POST', `/api/admin/events/${r.body.id}/decision`, { decision: 'approve' }, adm)).status, 200);
  assert.ok((await call('GET', '/api/events', null, st)).body.some((e) => e.id === r.body.id));
});

test('AT-10 (NFR-07) a student cannot moderate, check in or see statistics', async () => {
  const st = await login('student1@test.local', 'Student123!');
  assert.equal((await call('GET', '/api/admin/stats', null, st)).status, 403);
  assert.equal((await call('POST', '/api/checkin', { eventId: 1, ticketCode: 'CP-X' }, st)).status, 403);
  assert.equal((await call('GET', '/api/admin/pending-events', null, st)).status, 403);
  assert.equal((await call('GET', '/api/me')).status, 401);
});

test('AT-11 (FR-10, FR-13) student sends a club request; moderator accepts it', async () => {
  const st = await login('student2@test.local', 'Student123!');
  const club = db.prepare("SELECT id FROM clubs WHERE name = 'Chess Club'").get().id;
  assert.equal((await call('POST', `/api/clubs/${club}/join`, { message: 'I play every week.' }, st)).status, 200);
  assert.equal((await call('POST', `/api/clubs/${club}/join`, {}, st)).status, 409);
  const adm = await login('moderator@test.local', 'Moderator123!');
  const uid = db.prepare("SELECT id FROM users WHERE email = 'student2@test.local'").get().id;
  assert.equal((await call('POST', '/api/admin/club-requests/decision', { userId: uid, clubId: club, decision: 'accept' }, adm)).status, 200);
  assert.equal((await call('GET', '/api/clubs', null, st)).body.find((c) => c.id === club).myStatus, 'accepted');
});

test('AT-13 (FR-44) 16 fictional test accounts are listed; a new student starts clean; only the administrator can reset', async () => {
  const list = (await call('GET', '/api/test-accounts')).body;
  assert.equal(list.length, 16);
  assert.deepEqual(['student', 'organizer', 'moderator', 'admin', 'shop'].map((r) => list.filter((a) => a.role === r).length), [10, 3, 1, 1, 1]);
  const s3 = await login('student3@test.local', 'Student123!');
  assert.equal((await call('GET', '/api/me/registrations', null, s3)).body.length, 0);
  assert.equal((await call('POST', '/api/admin/reset', {}, s3)).status, 403);
  assert.equal((await call('POST', '/api/admin/reset', {}, await login('moderator@test.local', 'Moderator123!'))).status, 403);
});

test('AT-14 (FR-26) attendance history shows attended, missed and cancelled events', async () => {
  const s1 = await login('student1@test.local', 'Student123!');
  const h = (await call('GET', '/api/me/history', null, s1)).body;
  const res = h.items.map((x) => x.result).sort();
  assert.deepEqual(res, ['attended', 'cancelled', 'missed']);
  assert.equal(h.attended, 1); assert.equal(h.missed, 1);
});

test('AT-25 (FR-22, FR-23) organizers see free rooms; a busy room or a too small room cannot be booked; approval confirms the booking', async () => {
  const org = await login('organizer1@test.local', 'Organizer123!');
  const d = new Date(Date.now() + 2 * 86400000); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setUTCHours(13, 0, 0, 0); // 18:00 in Astana, after lectures
  const av = (await call('GET', `/api/rooms/availability?start=${d.toISOString()}&minutes=90`, null, org)).body;
  assert.equal(av.length, 15);
  const hall = av.find((r) => r.code === 'C1.1.AH'); assert.equal(hall.free, true);
  const base = { title: 'Robotics Showcase', type: 'tech', startsAt: d.toISOString(), durationMinutes: 90, description: 'Student robots on stage for everyone.' };
  assert.equal((await call('POST', '/api/events', { ...base, capacity: 500, roomCode: 'C1.2.245' }, org)).body.error.code, 'room_too_small');
  const ok = await call('POST', '/api/events', { ...base, capacity: 100, roomCode: 'C1.1.AH' }, org); assert.equal(ok.status, 200);
  const again = await call('POST', '/api/events', { ...base, title: 'Second booking', capacity: 50, roomCode: 'C1.1.AH' }, org);
  assert.equal(again.status, 409); assert.equal(again.body.error.code, 'room_busy');
  const st = await login('student3@test.local', 'Student123!');
  assert.equal((await call('GET', `/api/rooms/availability?start=${d.toISOString()}`, null, st)).status, 403);
  const mod = await login('moderator@test.local', 'Moderator123!');
  assert.equal((await call('POST', `/api/admin/events/${ok.body.id}/decision`, { decision: 'approve' }, mod)).status, 200);
  const ev = (await call('GET', `/api/events/${ok.body.id}`, null, st)).body;
  assert.equal(ev.place.kind, 'room'); assert.equal(ev.place.floor, 1);
});

test('AT-12 (FR-17, FR-18) only attendees can rate once; statistics show the average', async () => {
  const st = await login('student1@test.local', 'Student123!');
  const fair = eventId('Welcome Fair of Clubs');
  assert.equal((await call('POST', `/api/events/${fair}/feedback`, { rating: 5 }, st)).status, 200);
  assert.equal((await call('POST', `/api/events/${fair}/feedback`, { rating: 4 }, st)).status, 409);
  assert.equal((await call('POST', `/api/events/${eventId('Acoustic Night')}/feedback`, { rating: 5 }, st)).status, 409);
  const adm = await login('moderator@test.local', 'Moderator123!');
  const s = await call('GET', '/api/admin/stats', null, adm);
  assert.equal(s.body.events.find((e) => e.id === fair).avgRating, 5);
});

test('AT-15 (FR-08, FR-21, NFR-10) a student links Telegram with a one-time code; reminders and test messages go to that chat only', async () => {
  // Second app with a fake Telegram service, so the test needs no real bot or internet
  const sent = [], fakeTg = { enabled: true, botName: async () => 'campuspass_test_bot', send: async (chat, text) => { sent.push({ chat, text }); return true; } };
  const NOW = new Date(); NOW.setHours(8, 0, 0, 0);
  const db2 = open(':memory:'); seed(db2, NOW);
  const app2 = createApp(db2, { clock: () => new Date(NOW), telegram: fakeTg });
  const srv = http.createServer(app2); await new Promise((r) => srv.listen(0, r));
  const b2 = `http://localhost:${srv.address().port}`;
  const c2 = async (m, p, body, ck) => { const r = await fetch(b2 + p, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(ck ? { Cookie: ck } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json(), cookie: (r.headers.get('set-cookie') || '').split(';')[0] }; };
  try {
    const st = (await c2('POST', '/api/auth/login', { email: 'student4@test.local', password: 'Student123!' })).cookie;
    assert.equal((await c2('GET', '/api/me/telegram', null, st)).body.connected, false);
    const link = (await c2('POST', '/api/me/telegram/link', {}, st)).body.url;
    assert.match(link, /^https:\/\/t\.me\/campuspass_test_bot\?start=[a-f0-9]{24}$/);
    const code = link.split('start=')[1];
    assert.equal(app2.linkTelegram('wrongcode123', '111'), null);                       // a wrong code links nobody
    assert.ok(app2.linkTelegram(code, '555'));                                          // Start with the right code
    assert.equal(app2.linkTelegram(code, '666'), null);                                 // the code works only once
    assert.equal((await c2('GET', '/api/me/telegram', null, st)).body.connected, true);
    assert.equal((await c2('POST', '/api/me/telegram/test', {}, st)).status, 200);
    assert.equal(sent.at(-1).chat, '555');
    // Administrator database overview masks the chat id
    const mod = (await c2('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Admin123!' })).cookie;
    const users = (await c2('GET', '/api/admin/db', null, mod)).body.find((t) => t.table === 'users');
    assert.ok(users.columns.some((c) => c.name === 'telegram_chat_id'));
    assert.ok(users.sample.every((r) => r.password_hash === '•••'));
    assert.equal((await c2('GET', '/api/admin/db', null, st)).status, 403);
    assert.equal((await c2('DELETE', '/api/me/telegram', {}, st)).body.connected, false);
  } finally { srv.close(); }
});

// ---------- Final release: new requirements FR-34 … FR-45 ----------
const { createCore } = require('../netlify/core');
const bot = require('../server/bot');
const SEED = require('../server/seed-data.json');
const at = (h, m = 0, days = 1) => { const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + days); return d.toISOString(); };

test('AT-16 (FR-39) an organizer submits an event in EN, KK and RU; an unfinished language is refused', async () => {
  const org = await login('organizer1@test.local', 'Organizer123!');
  const i18n = { en: { title: 'Python Meetup', description: 'Short talks about Python for beginners.' }, kk: { title: 'Python кездесуі', description: 'Жаңадан бастаушыларға Python туралы қысқа баяндамалар.' }, ru: { title: 'Встреча по Python', description: 'Короткие доклады о Python для начинающих.' } };
  const base = { type: 'tech', venueId: SEED.venues[0].id, startsAt: at(18, 0, 3), durationMinutes: 90, capacity: 30 };
  const half = await call('POST', '/api/events', { ...base, i18n: { en: i18n.en, kk: { title: 'Python' } } }, org);
  assert.equal(half.status, 400); assert.equal(half.body.error.code, 'invalid_description');   // KK started but has no description
  const none = await call('POST', '/api/events', { ...base, i18n: {} }, org);
  assert.equal(none.status, 400);
  const ok = await call('POST', '/api/events', { ...base, i18n }, org);
  assert.equal(ok.status, 200); assert.deepEqual(ok.body.languages, ['en', 'kk', 'ru']);
  const e = (await call('GET', `/api/events/${ok.body.id}`, null, org)).body;
  assert.equal(e.title, 'Python Meetup'); assert.equal(e.i18n.ru.title, 'Встреча по Python'); assert.equal(e.i18n.kk.description, i18n.kk.description);
  assert.ok(e.i18n.ru.location && e.i18n.ru.location !== '', 'place is translated from the venue list');
  // Only Russian: the Russian text becomes the base text
  const ru = await call('POST', '/api/events', { ...base, startsAt: at(12, 0, 4), i18n: { ru: i18n.ru } }, org);
  assert.equal(ru.status, 200); assert.equal((await call('GET', `/api/events/${ru.body.id}`, null, org)).body.title, 'Встреча по Python');
});

test('AT-17 (FR-20, FR-40, FR-41, FR-44, FR-45) moderator and administrator are different roles; the administrator edits events, clubs and users', async () => {
  const mod = await login('moderator@test.local', 'Moderator123!'), adm = await login('admin@test.local', 'Admin123!'), st = await login('student5@test.local', 'Student123!');
  // The moderator moderates and sees statistics, but cannot open the administration
  assert.equal((await call('GET', '/api/admin/pending-events', null, mod)).status, 200);
  assert.equal((await call('GET', '/api/admin/stats', null, mod)).status, 200);
  assert.equal((await call('GET', '/api/organizer/events', null, mod)).status, 200);                  // check-in screen of the moderator
  for (const p of ['/api/admin/users', '/api/admin/events', '/api/admin/complaints', '/api/admin/db']) { assert.equal((await call('GET', p, null, mod)).status, 403, p); assert.equal((await call('GET', p, null, st)).status, 403, p); }
  // The administrator can moderate too
  assert.equal((await call('GET', '/api/admin/pending-events', null, adm)).status, 200);
  // Edit an event: texts in three languages, seats, status
  const id = eventId('Cloud Basics Workshop');
  const ed = await call('PUT', `/api/admin/events/${id}`, { capacity: 45, coins: 35, i18n: { en: { title: 'Cloud Basics Workshop', description: 'Hands-on lab about cloud services.' }, ru: { title: 'Мастер-класс по облакам', description: 'Практика по облачным сервисам.' } } }, adm);
  assert.equal(ed.status, 200); assert.equal(ed.body.capacity, 45); assert.equal(ed.body.coins, 35); assert.equal(ed.body.i18n.ru.title, 'Мастер-класс по облакам');
  assert.equal((await call('PUT', `/api/admin/events/${id}`, { capacity: 0 }, adm)).status, 400);
  // Cancel an event: registered students are told
  const s9 = await login('student9@test.local', 'Student123!'), vol = eventId('Volunteer Orientation');
  await call('POST', `/api/events/${vol}/register`, {}, s9);
  assert.equal((await call('PUT', `/api/admin/events/${vol}`, { status: 'cancelled' }, adm)).body.status, 'cancelled');
  assert.ok((await call('GET', '/api/me/notifications', null, s9)).body.some((n) => /cancelled/.test(n.text)));
  assert.ok(!(await call('GET', '/api/events?days=7', null, s9)).body.some((e) => e.id === vol), 'a cancelled event leaves the poster');
  // Clubs: create and edit
  const cl = await call('POST', '/api/admin/clubs', { name: 'Robotics Club', category: 'tech', room: 'C1.2.252K', description: 'We build small robots and learn Arduino together.', i18n: { ru: { name: 'Клуб робототехники' } } }, adm);
  assert.equal(cl.status, 200);
  assert.equal((await call('POST', '/api/admin/clubs', { name: 'Robotics Club', category: 'tech', room: 'X1', description: 'Duplicate name test text.' }, adm)).status, 409);
  assert.equal((await call('PUT', `/api/admin/clubs/${cl.body.id}`, { room: 'C1.3.235L' }, adm)).body.room, 'C1.3.235L');
  // Users: search all accounts, rename, change role; the administrator cannot change their own role
  const found = (await call('GET', '/api/admin/users?q=s001@', null, adm)).body; assert.equal(found.length, 1);
  const u = found[0];
  const up = await call('PUT', `/api/admin/users/${u.id}`, { name: 'Test Renamed', role: 'organizer', clubId: cl.body.id }, adm);
  assert.equal(up.status, 200); assert.equal(up.body.role, 'organizer');
  const me = (await call('GET', '/api/me', null, adm)).body;
  assert.equal((await call('PUT', `/api/admin/users/${me.id}`, { role: 'student' }, adm)).status, 409);
  assert.equal((await call('PUT', `/api/admin/users/${u.id}`, { role: 'boss' }, adm)).status, 400);
});

test('AT-18 (FR-42, FR-43) a complaint reaches the administrator in the inbox and in Telegram; the author sees the status', async () => {
  const sent = [], fakeTg = { enabled: true, botName: async () => 'campuspass_test_bot', send: async (chat, text, markup) => { sent.push({ chat, text, markup }); return true; } };
  const NOW = new Date(); NOW.setHours(8, 0, 0, 0);
  const db3 = open(':memory:'); seed(db3, NOW);
  const app3 = createApp(db3, { clock: () => new Date(NOW), telegram: fakeTg });
  const srv = http.createServer(app3); await new Promise((r) => srv.listen(0, r));
  const b3 = `http://localhost:${srv.address().port}`;
  const c3 = async (m, p, body, ck) => { const r = await fetch(b3 + p, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(ck ? { Cookie: ck } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json(), cookie: (r.headers.get('set-cookie') || '').split(';')[0] }; };
  try {
    const adm = (await c3('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Admin123!' })).cookie;
    const code = (await c3('POST', '/api/me/telegram/link', {}, adm)).body.url.split('start=')[1];
    assert.ok(app3.linkTelegram(code, '900'));                                                   // the administrator linked Telegram
    const st = (await c3('POST', '/api/auth/login', { email: 'student6@test.local', password: 'Student123!' })).cookie;
    const ev = db3.prepare("SELECT id FROM events WHERE title = 'Bowling Night'").get().id;
    assert.equal((await c3('POST', '/api/complaints', { targetType: 'event', targetId: ev, reason: 'nonsense', text: 'Wrong place on the poster.' }, st)).status, 400);
    assert.equal((await c3('POST', '/api/complaints', { targetType: 'event', targetId: ev, reason: 'wrong_info', text: 'ab' }, st)).status, 400);
    const c = await c3('POST', '/api/complaints', { targetType: 'event', targetId: ev, reason: 'wrong_info', text: 'Wrong place on the poster.' }, st);
    assert.equal(c.status, 200); assert.equal(c.body.status, 'new');
    assert.equal((await c3('POST', '/api/complaints', { targetType: 'event', targetId: ev, reason: 'spam', text: 'Second report of the same.' }, st)).status, 409);
    // Telegram alert to the administrator's chat, with the complaint text
    const tgMsg = sent.find((m) => m.chat === '900'); assert.ok(tgMsg); assert.match(tgMsg.text, /Bowling Night/); assert.match(tgMsg.text, /Wrong place on the poster/);
    assert.ok((await c3('GET', '/api/me/notifications', null, adm)).body.some((n) => /complaint/.test(n.text)));
    // A club can be reported too; a missing target is 404
    const club = db3.prepare("SELECT id FROM clubs WHERE name = 'Chess Club'").get().id;
    assert.equal((await c3('POST', '/api/complaints', { targetType: 'club', targetId: club, reason: 'other', text: 'Meeting time is missing.' }, st)).status, 200);
    assert.equal((await c3('POST', '/api/complaints', { targetType: 'club', targetId: 99999, reason: 'other', text: 'Meeting time is missing.' }, st)).status, 404);
    // Only the administrator handles complaints; closing needs an answer
    const list = (await c3('GET', '/api/admin/complaints', null, adm)).body;
    assert.ok(list.length >= 4); assert.equal(list[0].status, 'new');
    const mod = (await c3('POST', '/api/auth/login', { email: 'moderator@test.local', password: 'Moderator123!' })).cookie;
    assert.equal((await c3('PUT', `/api/admin/complaints/${c.body.id}`, { status: 'in_review' }, mod)).status, 403);
    assert.equal((await c3('PUT', `/api/admin/complaints/${c.body.id}`, { status: 'in_review' }, adm)).status, 200);
    assert.equal((await c3('PUT', `/api/admin/complaints/${c.body.id}`, { status: 'resolved', comment: '' }, adm)).status, 400);
    assert.equal((await c3('PUT', `/api/admin/complaints/${c.body.id}`, { status: 'resolved', comment: 'The room is fixed on the poster.' }, adm)).status, 200);
    const mine = (await c3('GET', '/api/me/complaints', null, st)).body.find((x) => x.id === c.body.id);
    assert.equal(mine.status, 'resolved'); assert.equal(mine.comment, 'The room is fixed on the poster.');
    assert.ok((await c3('GET', '/api/me/notifications', null, st)).body.some((n) => /resolved/.test(n.text)));
    assert.equal((await c3('GET', '/api/admin/stats', null, adm)).body.totals.complaints, list.length - 1);
  } finally { srv.close(); }
});

test('AT-19 (FR-34 … FR-38) Telegram bot: commands, buttons, language, registration and reminders', async () => {
  const sent = [], fakeTg = { enabled: true, botName: async () => 'campuspass_test_bot', send: async (chat, text, markup) => { sent.push({ chat, text, markup }); return true; } };
  const NOW = new Date(); NOW.setHours(8, 0, 0, 0);
  const db4 = open(':memory:'); seed(db4, NOW);
  const app4 = createApp(db4, { clock: () => new Date(NOW), telegram: fakeTg });
  const api = app4.botApi, opts = { now: () => new Date(NOW) };
  let n = 0; const msg = (text) => ({ update_id: ++n, message: { message_id: n, chat: { id: 4242 }, from: { language_code: 'ru' }, text } });
  const press = (data) => ({ update_id: ++n, callback_query: { id: 'cb' + n, data, from: { language_code: 'ru' }, message: { message_id: 1, chat: { id: 4242 } } } });
  const text = (calls) => calls.filter((c) => c.params.text).map((c) => c.params.text).join('\n');
  const buttons = (calls) => calls.flatMap((c) => (c.params.reply_markup ? c.params.reply_markup.inline_keyboard.flat() : []));
  // Not linked: the bot speaks the language of the Telegram app and shows the menu with buttons
  let r = await bot.handle(msg('/start'), api, opts);
  assert.match(text(r), /Привет/); assert.ok(buttons(r).some((b) => b.callback_data === 'week'));
  r = await bot.handle(msg('/today'), api, opts);
  assert.match(text(r), /Сегодня/); assert.ok(buttons(r).some((b) => /^ev:\d+$/.test(b.callback_data)));
  r = await bot.handle(msg('/my'), api, opts); assert.match(text(r), /аккаунт CampusPass/);  // /my needs an account
  // Language choice is kept for the chat
  r = await bot.handle(press('setlang:kk'), api, opts); assert.match(text(r), /Сәлем/);
  assert.ok(r.some((c) => c.method === 'answerCallbackQuery'));
  r = await bot.handle(msg('/help'), api, opts); assert.match(text(r), /Не істей аламын/);
  // Link the account with the one-time code from the Profile
  const u = db4.prepare("SELECT id FROM users WHERE email = 'student7@test.local'").get();
  db4.prepare("UPDATE users SET telegram_code = 'abcdef123456', consent_at = '2026-01-01T00:00:00Z' WHERE id = ?").run(u.id);
  r = await bot.handle(msg('/start abcdef123456'), api, opts); assert.match(text(r), /қосылды/);
  r = await bot.handle(msg('/start abcdef123456'), api, opts); assert.match(text(r), /жарамсыз/);    // the code works once
  // Register from the bot with the inline button
  const ev = db4.prepare("SELECT id FROM events WHERE title = 'Table Tennis Open'").get().id;   // today at 16:00
  r = await bot.handle(press('ev:' + ev), api, opts); assert.ok(buttons(r).some((b) => b.callback_data === 'reg:' + ev));
  r = await bot.handle(press('reg:' + ev), api, opts);
  assert.match(r.find((c) => c.method === 'answerCallbackQuery').params.text, /CP-[0-9A-F]{10}/);
  assert.equal(db4.prepare('SELECT status FROM registrations WHERE event_id = ? AND user_id = ?').get(ev, u.id).status, 'confirmed');
  r = await bot.handle(press('reg:' + ev), api, opts); assert.match(r[0].params.text, /тіркелгенсіз/);   // no double registration
  r = await bot.handle(msg('/my'), api, opts); assert.match(text(r), /теннис/i); assert.match(text(r), /CP-/);
  // Reminder through Telegram arrives in the chat language, with a button
  const reg = db4.prepare('SELECT id FROM registrations WHERE event_id = ? AND user_id = ?').get(ev, u.id).id;
  db4.prepare("UPDATE registrations SET reminder_channel = 'telegram' WHERE id = ?").run(reg);
  app4.sendDueReminders();
  const rem = sent.find((m) => m.chat === '4242'); assert.ok(rem, 'reminder sent'); assert.match(rem.text, /Еске салу/); assert.ok(rem.markup.inline_keyboard.length);
  // /stop disconnects the chat
  r = await bot.handle(msg('/stop'), api, opts); assert.match(text(r), /ажыратылды/);
  assert.equal(db4.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').get(u.id).telegram_chat_id, null);
  // Commands are published in three languages
  assert.deepEqual(bot.commandSets().map((x) => x.language_code || 'en'), ['en', 'kk', 'ru']);
});

test('AT-20 (NFR-15) the Netlify version has the same rules: roles, complaints, three languages and the bot', async () => {
  const core = createCore(SEED, null);
  const tok = (email, pw) => core.handle('POST', '/api/auth/login', { email, password: pw }).token;
  const adm = tok('admin@test.local', 'Admin123!'), mod = tok('moderator@test.local', 'Moderator123!'), org = tok('organizer1@test.local', 'Organizer123!'), st = tok('student8@test.local', 'Student123!');
  assert.equal(core.handle('GET', '/api/admin/complaints', {}, mod).status, 403);
  assert.equal(core.handle('GET', '/api/admin/complaints', {}, adm).data.length, 2);                    // two seeded complaints
  const ev = core.handle('POST', '/api/events', { type: 'social', venueId: SEED.venues[0].id, startsAt: at(15, 0, 2), durationMinutes: 60, capacity: 20, i18n: { kk: { title: 'Достар кеші', description: 'Жаңа студенттермен танысу кеші.' } } }, org);
  assert.equal(ev.status, 200); assert.deepEqual(ev.data.languages, ['kk']);
  const c = core.handle('POST', '/api/complaints', { targetType: 'event', targetId: ev.data.id, reason: 'spam', text: 'This looks like advertising.' }, st);
  assert.equal(c.status, 200);
  assert.equal(core.handle('PUT', `/api/admin/complaints/${c.data.id}`, { status: 'rejected', comment: 'It is a normal club event.' }, adm).status, 200);
  assert.equal(core.handle('GET', '/api/me/complaints', {}, st).data[0].status, 'rejected');
  assert.equal(core.handle('PUT', `/api/admin/events/${ev.data.id}`, { status: 'approved' }, adm).data.status, 'approved');
  // Bot on the Netlify data
  const r = await bot.handle({ message: { chat: { id: 77 }, from: { language_code: 'en' }, text: '/events' } }, core.botApi, {});
  assert.match(r[0].params.text, /This week/);
  assert.ok(r[0].params.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === 'ev:' + ev.data.id));
});

test('AT-21 (FR-46 … FR-49) the bot gives each role its own menu and tools; the website sends role messages to Telegram', async () => {
  const sent = [], fakeTg = { enabled: true, botName: async () => 'campuspass_test_bot', send: async (chat, text, markup) => { sent.push({ chat, text, markup }); return true; } };
  const NOW = new Date(); NOW.setHours(8, 0, 0, 0);
  const db5 = open(':memory:'); seed(db5, NOW);
  const app5 = createApp(db5, { clock: () => new Date(NOW), telegram: fakeTg });
  const api = app5.botApi, opts = { now: () => new Date(NOW) };
  let n = 0;
  const link = async (email, chat) => { db5.prepare("UPDATE users SET telegram_code = ?, consent_at = '2026-01-01T00:00:00Z' WHERE email = ?").run('code' + chat + 'abcdef', email); return bot.handle({ message: { chat: { id: chat }, from: { language_code: 'en' }, text: '/start code' + chat + 'abcdef' } }, api, opts); };
  const msg = (chat, text) => bot.handle({ update_id: ++n, message: { message_id: n, chat: { id: chat }, from: { language_code: 'en' }, text } }, api, opts);
  const press = (chat, data) => bot.handle({ update_id: ++n, callback_query: { id: 'q' + n, data, from: {}, message: { message_id: 1, chat: { id: chat } } } }, api, opts);
  const text = (calls) => calls.filter((c) => c.params.text).map((c) => c.params.text).join('\n');
  const keys = (calls) => calls.flatMap((c) => (c.params.reply_markup ? c.params.reply_markup.inline_keyboard.flat() : [])).map((b) => b.callback_data).filter(Boolean);
  // Each role gets its own menu and its own command list
  const ST = 101, ORG = 102, MOD = 103, ADM = 104;
  let r = await link('student3@test.local', ST);
  assert.ok(keys(r).includes('my') && keys(r).includes('coins') && !keys(r).includes('pending'));
  assert.deepEqual(r.find((c) => c.method === 'setMyCommands').params.commands.map((c) => c.command), bot.ROLE_CMDS.student);
  r = await link('organizer1@test.local', ORG); assert.ok(keys(r).includes('club') && keys(r).includes('checkin') && !keys(r).includes('my'));
  r = await link('moderator@test.local', MOD); assert.ok(keys(r).includes('pending') && keys(r).includes('requests') && !keys(r).includes('complaints'));
  r = await link('admin@test.local', ADM); assert.ok(keys(r).includes('complaints') && keys(r).includes('pending'));
  // A student cannot open moderator tools; a moderator cannot open complaints
  assert.match(text(await msg(ST, '/pending')), /not available for your role/);
  assert.match(text(await msg(MOD, '/complaints')), /not available for your role/);
  // Student: coins, register, my tickets, cancel
  assert.match(text(await msg(ST, '/coins')), /Campus Coins: \d+/);
  const tt = db5.prepare("SELECT id FROM events WHERE title = 'Open Lab Demo Day'").get().id;
  await press(ST, 'reg:' + tt);
  const code = db5.prepare("SELECT r.ticket_code FROM registrations r JOIN users u ON u.id = r.user_id WHERE u.email = 'student3@test.local' AND r.event_id = ?").get(tt).ticket_code;
  assert.match(text(await msg(ST, '/my')), /Open Lab Demo Day/);
  // Organizer of GDSC: club events, participants, check-in by sending the ticket code
  assert.match(text(await msg(ORG, '/club')), /Open Lab Demo Day/);
  r = await press(ORG, 'op:' + tt); assert.match(text(r), /participants/);
  r = await msg(ORG, code); assert.match(text(r), /checked in at “Open Lab Demo Day”/);
  r = await msg(ORG, code); assert.match(text(r), /already checked in/);
  assert.match(text(await msg(ORG, 'CP-000000')), /not found/i);
  // A student's other event: the cancel button works
  const cb = db5.prepare("SELECT id FROM events WHERE title = 'Cloud Basics Workshop'").get().id;
  await press(ST, 'reg:' + cb); r = await press(ST, 'my:' + cb); assert.ok(keys(r).includes('cx:' + cb));
  r = await press(ST, 'cx:' + cb); assert.ok(r.some((c) => c.method === 'answerCallbackQuery' && /cancelled/.test(c.params.text)));
  // Organizer submits an event (same API as the website) → moderator and administrator get it in Telegram with buttons
  const ev = await api.call(db5.prepare("SELECT id FROM users WHERE email = 'organizer1@test.local'").get().id, 'POST', '/api/events', { type: 'tech', venueId: SEED.venues[0].id, startsAt: at(17, 0, 2), durationMinutes: 60, capacity: 20, i18n: { en: { title: 'Bot Review Test', description: 'An event to test the moderation bot.' } } });
  const alertMod = sent.find((m) => m.chat === String(MOD) && /Bot Review Test/.test(m.text));
  assert.ok(alertMod); assert.ok(alertMod.markup.inline_keyboard.flat().some((b) => b.callback_data === 'mod:no:' + ev.id));
  // Moderator rejects from the bot: the bot asks for a reason, a short reason is refused, then the organizer is told
  r = await press(MOD, 'mod:no:' + ev.id); assert.match(text(r), /reason/);
  assert.match(text(await msg(MOD, 'no')), /too short/);
  assert.match(text(await msg(MOD, 'The room is too small for this.')), /Rejected: Bot Review Test/);
  assert.ok(sent.some((m) => m.chat === String(ORG) && /rejected/.test(m.text) && /too small/.test(m.text)));
  // Approve another one with one tap
  const ev2 = await api.call(db5.prepare("SELECT id FROM users WHERE email = 'organizer1@test.local'").get().id, 'POST', '/api/events', { type: 'tech', venueId: SEED.venues[0].id, startsAt: at(18, 0, 3), durationMinutes: 60, capacity: 20, i18n: { en: { title: 'Bot Approve Test', description: 'An event to test one-tap approval.' } } });
  r = await press(MOD, 'mod:ok:' + ev2.id); assert.match(text(r), /Approved: Bot Approve Test/);
  assert.ok(sent.some((m) => m.chat === String(ORG) && /approved/.test(m.text)));
  // Club requests and statistics for the moderator
  r = await msg(MOD, '/requests'); const acc = keys(r).find((k) => k.startsWith('cr:a:')); assert.ok(acc);
  await press(MOD, acc); assert.match(text(await msg(MOD, '/stats')), /Approved events/);
  // Administrator: complaint from the website arrives with buttons; resolve needs an answer; the author is told in Telegram
  const stId = db5.prepare("SELECT id FROM users WHERE email = 'student3@test.local'").get().id;
  const c = await api.call(stId, 'POST', '/api/complaints', { targetType: 'event', targetId: tt, reason: 'wrong_info', text: 'The time on the poster is wrong.' });
  const alertAdm = sent.find((m) => m.chat === String(ADM) && /#\d+/.test(m.text) && /time on the poster/.test(m.text));
  assert.ok(alertAdm.markup.inline_keyboard.flat().some((b) => b.callback_data === 'cs:s:' + c.id));
  r = await press(ADM, 'cs:r:' + c.id); assert.match(text(r), /in review/);
  r = await press(ADM, 'cs:s:' + c.id); assert.match(text(r), /answer/);
  assert.match(text(await msg(ADM, 'Fixed the time. Thank you!')), /resolved/);
  assert.ok(sent.some((m) => m.chat === String(ST) && /complaint #\d+ is now: resolved/.test(m.text) && /Fixed the time/.test(m.text)));
  assert.match(text(await msg(ADM, '/complaints')), /Open complaints/);
});

test('AT-22 (FR-27, C08, C10, FR-41) consent, open events, cancelled event, no student IDs in Telegram', async () => {
  // C08: without consent a student cannot register; withdrawal closes registration again
  const raw = (await call('POST', '/api/auth/login', { email: 'student10@test.local', password: 'Student123!' })).cookie;
  assert.equal((await call('GET', '/api/me', null, raw)).body.consentAt, null);
  const cloud = eventId('Cloud Basics Workshop');
  const no = await call('POST', `/api/events/${cloud}/register`, {}, raw);
  assert.equal(no.status, 403); assert.equal(no.body.error.code, 'consent_required');
  assert.ok((await call('POST', '/api/me/consent', {}, raw)).body.consentAt);
  assert.equal((await call('POST', `/api/events/${cloud}/register`, {}, raw)).status, 200);
  assert.equal((await call('DELETE', '/api/me/consent', {}, raw)).body.consentAt, null);
  assert.equal((await call('GET', '/api/me', null, raw)).body.consentAt, null);
  // F4 / F13: an open event has no ticket and no seat limit — "I plan to come"
  const org = await login('organizer3@test.local', 'Organizer123!');
  const made = await call('POST', '/api/events', { type: 'creative', venueId: SEED.venues[0].id, startsAt: at(19, 0, 5), durationMinutes: 90, capacity: 1, open: true, i18n: { en: { title: 'Open Air Concert', description: 'A free open concert, everybody is welcome.' } } }, org);
  assert.equal(made.status, 200);
  const mod = await login('moderator@test.local', 'Moderator123!');
  await call('POST', `/api/admin/events/${made.body.id}/decision`, { decision: 'approve' }, mod);
  const a = await login('student8@test.local', 'Student123!'), b = await login('student9@test.local', 'Student123!');
  const ra = await call('POST', `/api/events/${made.body.id}/register`, {}, a), rb = await call('POST', `/api/events/${made.body.id}/register`, {}, b);
  assert.equal(ra.body.my.status, 'planned'); assert.equal(ra.body.my.ticketCode, null);
  assert.equal(rb.body.my.status, 'planned', 'no waitlist for an open event even above the expected number');
  assert.equal(rb.body.open, true); assert.equal(rb.body.planned, 2);
  assert.equal((await call('DELETE', `/api/events/${made.body.id}/registration`, {}, b)).status, 200);
  assert.equal((await call('GET', `/api/events/${made.body.id}`, null, a)).body.planned, 1);
  // State diagram: when the administrator cancels an event, its registrations become Cancelled
  const adm = await login('admin@test.local', 'Admin123!');
  await call('PUT', `/api/admin/events/${made.body.id}`, { status: 'cancelled' }, adm);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status <> 'cancelled'").get(made.body.id).n, 0);
  assert.ok((await call('GET', '/api/me/history', null, a)).body.items.some((x) => x.id === made.body.id && x.result === 'cancelled'));
  // C10: Telegram messages to staff contain no student IDs
  const NOW = new Date(); NOW.setHours(8, 0, 0, 0);
  const db6 = open(':memory:'); seed(db6, NOW);
  const app6 = createApp(db6, { clock: () => new Date(NOW), telegram: { enabled: false, send: async () => true, botName: async () => null } });
  db6.prepare("UPDATE users SET telegram_chat_id = '700' WHERE email = 'organizer1@test.local'").run();
  const demo = db6.prepare("SELECT id FROM events WHERE title = 'Open Lab Demo Day'").get().id;
  const r = await bot.handle({ callback_query: { id: 'x', data: 'op:' + demo, from: {}, message: { message_id: 1, chat: { id: 700 } } } }, app6.botApi, { now: () => new Date(NOW) });
  const listText = r.find((c) => c.params.text && /participants/.test(c.params.text)).params.text;
  assert.ok(!/\b2401\d\d\b/.test(listText), 'no student IDs in the participant list sent to Telegram');
});

test('AT-23 (FR-28 … FR-33, BR-07 … BR-10) Campus Coins buy a 5% / 10% merch voucher; the cashier redeems it once', async () => {
  const NOW = new Date(); NOW.setHours(8, 0, 0, 0);
  const db7 = open(':memory:'); seed(db7, NOW);
  const app7 = createApp(db7, { clock: () => new Date(NOW) });
  const srv = http.createServer(app7); await new Promise((r) => srv.listen(0, r));
  const b7 = `http://localhost:${srv.address().port}`;
  const c7 = async (m, p, body, ck) => { const r = await fetch(b7 + p, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(ck ? { Cookie: ck } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json(), cookie: (r.headers.get('set-cookie') || '').split(';')[0] }; };
  try {
    const st = (await c7('POST', '/api/auth/login', { email: 'student1@test.local', password: 'Student123!' })).cookie;
    const uid = db7.prepare("SELECT id FROM users WHERE email = 'student1@test.local'").get().id;
    let shop = (await c7('GET', '/api/shop', null, st)).body;
    assert.deepEqual(shop.offers, [{ pct: 5, coins: 300 }, { pct: 10, coins: 700 }]); assert.equal(shop.maxDiscount, 2000);
    const start = shop.balance; assert.ok(start >= 300 && start < 700);
    assert.match(shop.coinsExpireAt, /-06-30T/);                                                       // BR-10 end of the academic year
    // BR-07 not enough coins for 10% (700); 5% works and takes 300 coins
    assert.equal((await c7('POST', '/api/shop/vouchers', { pct: 10 }, st)).body.error.code, 'not_enough_coins');
    assert.equal((await c7('POST', '/api/shop/vouchers', { pct: 7 }, st)).status, 400);
    const v = (await c7('POST', '/api/shop/vouchers', { pct: 5 }, st)).body;
    assert.match(v.code, /^MERCH-[0-9A-F]{8}$/); assert.equal(v.status, 'active');
    assert.equal((await c7('GET', '/api/shop', null, st)).body.balance, start - 300);
    assert.equal((await c7('POST', '/api/shop/vouchers', { pct: 5 }, st)).body.error.code, 'voucher_active');   // one active voucher
    // FR-31 Only the cashier (or the administrator) redeems; preview first, then confirm; a voucher works once
    assert.equal((await c7('POST', '/api/shop/redeem', { code: v.code, amount: 15000 }, st)).status, 403);
    const cash = (await c7('POST', '/api/auth/login', { email: 'shop@test.local', password: 'Shop123!' })).cookie;
    assert.equal((await c7('POST', '/api/shop/redeem', { code: 'MERCH-00000000', amount: 1000 }, cash)).body.error.code, 'voucher_not_found');
    const pre = (await c7('POST', '/api/shop/redeem', { code: v.code.toLowerCase(), amount: 15000 }, cash)).body;
    assert.deepEqual([pre.discount, pre.toPay, pre.used], [750, 14250, false]);
    const done = (await c7('POST', '/api/shop/redeem', { code: v.code, amount: 15000, confirm: true }, cash)).body;
    assert.equal(done.used, true); assert.equal(done.student, 'Aruzhan Bekova');
    assert.equal((await c7('POST', '/api/shop/redeem', { code: v.code, amount: 15000, confirm: true }, cash)).body.error.code, 'voucher_used');
    assert.ok((await c7('GET', '/api/me/notifications', null, st)).body.some((n) => /750 ₸/.test(n.text)));
    // BR-08 at most 2 000 ₸ off
    db7.prepare("INSERT INTO coin_transactions (user_id, amount, reason, created_at) VALUES (?, 800, 'Test coins', ?)").run(uid, new Date(NOW).toISOString());
    const v10 = (await c7('POST', '/api/shop/vouchers', { pct: 10 }, st)).body;
    assert.equal((await c7('POST', '/api/shop/redeem', { code: v10.code, amount: 50000 }, cash)).body.discount, 2000);
    // BR-09 cancel → coins back; an expired voucher gives the coins back too
    const before = (await c7('GET', '/api/shop', null, st)).body.balance;
    assert.equal((await c7('DELETE', `/api/shop/vouchers/${v10.id}`, {}, st)).body.balance, before + 700);
    const v3 = (await c7('POST', '/api/shop/vouchers', { pct: 5 }, st)).body;
    db7.prepare("UPDATE vouchers SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(v3.id);
    shop = (await c7('GET', '/api/shop', null, st)).body;
    assert.equal(shop.vouchers.find((x) => x.id === v3.id).status, 'expired'); assert.equal(shop.balance, before + 700);
    // BR-10 coins from the previous academic year do not count
    db7.prepare("INSERT INTO coin_transactions (user_id, amount, reason, created_at) VALUES (?, 500, 'Last year', '2020-05-01T00:00:00.000Z')").run(uid);
    assert.equal((await c7('GET', '/api/shop', null, st)).body.balance, before + 700);
    // Statistics for BO6 (students who used the shop) and the cashier's list
    const red = (await c7('GET', '/api/shop/redemptions', null, cash)).body; assert.equal(red.totals.used, 1); assert.equal(red.totals.discount, 750);
    const adm = (await c7('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Admin123!' })).cookie;
    assert.equal((await c7('GET', '/api/admin/stats', null, adm)).body.totals.shopStudents, 1);
  } finally { srv.close(); }
  // The Netlify version follows the same rules
  const core = createCore(SEED, null);
  const tk = (e, p) => core.handle('POST', '/api/auth/login', { email: e, password: p }).token;
  const s1 = tk('student1@test.local', 'Student123!'), cs = tk('shop@test.local', 'Shop123!');
  const cv = core.handle('POST', '/api/shop/vouchers', { pct: 5 }, s1); assert.equal(cv.status, 200);
  assert.equal(core.handle('POST', '/api/shop/redeem', { code: cv.data.code, amount: 60000, confirm: true }, cs).data.discount, 2000);
  assert.equal(core.handle('POST', '/api/shop/redeem', { code: cv.data.code, amount: 100, confirm: true }, cs).data.error.code, 'voucher_used');
});

test('AT-24 (FR-11) an event can have its own picture; a wrong file is refused', async () => {
  const org = await login('organizer2@test.local', 'Organizer123!');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const base = { type: 'intellectual', venueId: SEED.venues[0].id, startsAt: at(16, 0, 6), durationMinutes: 60, capacity: 10, i18n: { en: { title: 'Picture Test', description: 'An event with its own picture.' } } };
  assert.equal((await call('POST', '/api/events', { ...base, image: 'data:text/html;base64,PHNjcmlwdD4=' }, org)).body.error.code, 'invalid_image');
  const ok = await call('POST', '/api/events', { ...base, image: png }, org);
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', `/api/events/${ok.body.id}`, null, org)).body.image, png);
  const adm = await login('admin@test.local', 'Admin123!');
  assert.equal((await call('PUT', `/api/admin/events/${ok.body.id}`, { image: null }, adm)).body.image, null);   // back to the cover by type
});
