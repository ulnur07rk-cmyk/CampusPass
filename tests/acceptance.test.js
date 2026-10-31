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
const login = async (email, password) => (await call('POST', '/api/auth/login', { email, password })).cookie;
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
  const reg = await call('POST', `/api/events/${eventId('Open Lab Demo Day')}/register`, {}, s);
  const r = await call('PUT', `/api/registrations/${reg.body.my.id}/reminders`, { channel: 'telegram', day: true, hour: true }, s);
  assert.equal(r.status, 200);
  assert.equal(app.sendDueReminders(), 2); assert.equal(app.sendDueReminders(), 0, 'no duplicates');
  const n = await call('GET', '/api/me/notifications', null, s);
  assert.equal(n.body.filter((x) => x.channel === 'telegram').length, 2);
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
  const r = await call('POST', '/api/events', { title: 'Flutter Study Jam', type: 'tech', location: 'Lab 3.201', startsAt: start, durationMinutes: 90, capacity: 30, description: 'Build your first Flutter app together.' }, org);
  assert.equal(r.status, 200); assert.equal(r.body.status, 'pending');
  const st = await login('student1@test.local', 'Student123!');
  assert.ok(!(await call('GET', '/api/events', null, st)).body.some((e) => e.id === r.body.id));
  const adm = await login('moderator@test.local', 'Moderator123!');
  const noReason = await call('POST', `/api/admin/events/${r.body.id}/decision`, { decision: 'reject' }, adm);
  assert.equal(noReason.status, 400);
  assert.equal((await call('POST', `/api/admin/events/${r.body.id}/decision`, { decision: 'approve' }, adm)).status, 200);
  assert.ok((await call('GET', '/api/events', null, st)).body.some((e) => e.id === r.body.id));
});

test('AT-10 (NFR, role rights) a student cannot moderate, check in or see statistics', async () => {
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

test('AT-13 (testing support) 14 fictional test accounts are listed; a new student starts clean; only the moderator can reset', async () => {
  const list = (await call('GET', '/api/test-accounts')).body;
  assert.equal(list.length, 14);
  assert.deepEqual(['student', 'organizer', 'admin'].map((r) => list.filter((a) => a.role === r).length), [10, 3, 1]);
  const s3 = await login('student3@test.local', 'Student123!');
  assert.equal((await call('GET', '/api/me/registrations', null, s3)).body.length, 0);
  assert.equal((await call('POST', '/api/admin/reset', {}, s3)).status, 403);
});

test('AT-14 (F10) attendance history shows attended, missed and cancelled events', async () => {
  const s1 = await login('student1@test.local', 'Student123!');
  const h = (await call('GET', '/api/me/history', null, s1)).body;
  const res = h.items.map((x) => x.result).sort();
  assert.deepEqual(res, ['attended', 'cancelled', 'missed']);
  assert.equal(h.attended, 1); assert.equal(h.missed, 1);
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
