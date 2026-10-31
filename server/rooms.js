// CampusPass — rooms on campus: fictional lecture timetable and availability (F21).
// Used by server/app.js (localhost) and netlify/core.js (Netlify). Educational project; all data are fictional.
'use strict';
const TZ = 5; // Astana time, UTC+5
const SLOTS = [[9, 0, 10, 50], [11, 0, 12, 50], [14, 0, 15, 50], [16, 0, 17, 50]];

// Local (Astana) date parts of a UTC timestamp
function local(d) { const x = new Date(new Date(d).getTime() + TZ * 3600000); return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), wd: x.getUTCDay() }; }
const utc = (p, h, mi) => new Date(Date.UTC(p.y, p.m, p.d, h - TZ, mi));

// Lectures that block a room on the given day (Monday–Friday only); halls and open spaces have no lectures,
// the sports hall has PE classes in the afternoon
function lectures(room, rooms, day) {
  const p = local(day); if (p.wd === 0 || p.wd === 6) return [];
  const idx = rooms.findIndex((r) => r.code === room.code);
  if (room.kind === 'open' || room.kind === 'hall') return room.code === 'C1.3.SH' ? [{ start: utc(p, 14, 0), end: utc(p, 15, 50) }] : [];
  return SLOTS.filter((s, i) => (idx * 3 + p.wd + i) % 3 !== 0).map(([h1, m1, h2, m2]) => ({ start: utc(p, h1, m1), end: utc(p, h2, m2) }));
}

// Is the room free from start to end? events: [{id, room_code, status, starts_at, ends_at, title}]
function availability(room, rooms, start, end, events, ignoreId) {
  const s = new Date(start), e = new Date(end);
  for (let t = new Date(s); t <= e; t = new Date(t.getTime() + 86400000)) {
    const lec = lectures(room, rooms, t).find((l) => l.start < e && l.end > s);
    if (lec) return { free: false, reason: 'lecture', from: lec.start.toISOString(), to: lec.end.toISOString() };
  }
  const ev = events.find((x) => x.id !== ignoreId && x.room_code === room.code && (x.status === 'approved' || x.status === 'pending') && new Date(x.starts_at) < e && new Date(x.ends_at) > s);
  if (ev) return { free: false, reason: ev.status === 'pending' ? 'requested' : 'event', title: ev.title, from: ev.starts_at, to: ev.ends_at };
  return { free: true };
}

module.exports = { lectures, availability };
