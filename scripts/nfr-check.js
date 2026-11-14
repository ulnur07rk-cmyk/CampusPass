// CampusPass — checks for NFR-01 (response time), NFR-04 (no overbooking) and NFR-09 (sign-in lockout).
// Run: npm run nfr. Uses an in-memory database with the fictional seed data; nothing is written to data/.
'use strict';
const http = require('node:http');
const { open, seed } = require('../server/db');
const { createApp } = require('../server/app');

(async () => {
  const NOW = new Date(); NOW.setHours(8, 0, 0, 0);
  const db = open(':memory:'); seed(db, NOW);
  const app = createApp(db, { clock: () => new Date(NOW) });
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, path, body, cookie) => {
    const r = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };
  const login = async (email) => { const ck = (await call('POST', '/api/auth/login', { email, password: 'Student123!' })).cookie; await call('POST', '/api/me/consent', {}, ck); return ck; };

  // NFR-01: 10 rounds of 100 parallel poster requests
  const ck = await login('student1@test.local'); const times = [];
  for (let round = 0; round < 10; round++) {
    await Promise.all(Array.from({ length: 100 }, async () => { const t = performance.now(); const r = await call('GET', '/api/events', null, ck); if (r.status !== 200) throw new Error('poster ' + r.status); times.push(performance.now() - t); }));
  }
  times.sort((a, b) => a - b); const pct = (p) => times[Math.ceil(p * times.length) - 1].toFixed(0);
  console.log(`NFR-01  ${times.length} poster requests: median ${pct(0.5)} ms, 95th percentile ${pct(0.95)} ms, max ${times[times.length - 1].toFixed(0)} ms → ${Number(pct(0.95)) <= 1000 ? 'Pass' : 'Fail'}`);

  // NFR-04: 10 students send 5 registrations each, all at once, for an event with 5 seats
  const ev = db.prepare("SELECT id FROM events WHERE status = 'approved' AND is_open = 0 AND starts_at > ? ORDER BY starts_at DESC LIMIT 1").get(new Date(NOW.getTime() + 86400000).toISOString()).id;
  db.prepare('DELETE FROM registrations WHERE event_id = ?').run(ev); db.prepare('UPDATE events SET capacity = 5 WHERE id = ?').run(ev);
  const cks = []; for (let i = 1; i <= 10; i++) cks.push(await login(`student${i}@test.local`));
  const res = await Promise.all(cks.flatMap((c) => Array.from({ length: 5 }, () => call('POST', `/api/events/${ev}/register`, {}, c))));
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM registrations WHERE event_id = ? GROUP BY status').all(ev);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])); const refused = res.filter((r) => r.status === 409).length;
  console.log(`NFR-04  50 parallel registrations for 5 seats: ${by.confirmed || 0} confirmed, ${by.waitlisted || 0} waitlisted, ${refused} refused as duplicates → ${by.confirmed === 5 && by.waitlisted === 5 && refused === 40 ? 'Pass' : 'Fail'}`);

  // NFR-09: 11 wrong passwords from one address
  let last; for (let i = 0; i < 11; i++) last = await call('POST', '/api/auth/login', { email: 'student2@test.local', password: 'wrong-password' });
  const ok = await call('POST', '/api/auth/login', { email: 'student2@test.local', password: 'Student123!' });
  console.log(`NFR-09  11th wrong sign-in → ${last.status}; then the right password → ${ok.status} (blocked for 5 minutes) → ${last.status === 429 && ok.status === 429 ? 'Pass' : 'Fail'}`);
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
