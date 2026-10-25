// CampusPass — database layer (SQLite, built into Node.js 22+: node:sqlite)
// Educational project. All data are fictional.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  i18n TEXT,
  category TEXT NOT NULL CHECK (category IN ('sports','creative','tech','intellectual','social')),
  room TEXT NOT NULL,
  icon TEXT,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  student_id TEXT,
  group_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('student','organizer','admin')),
  club_id INTEGER REFERENCES clubs(id),
  lang TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','kk','ru')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  i18n TEXT,
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  location TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sports','creative','tech','intellectual','social')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  coins INTEGER NOT NULL DEFAULT 20 CHECK (coins BETWEEN 0 AND 100),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','cancelled')),
  moderation_comment TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('confirmed','waitlisted','cancelled','checked_in')),
  ticket_code TEXT UNIQUE,
  reminder_channel TEXT NOT NULL DEFAULT 'off' CHECK (reminder_channel IN ('off','push','telegram')),
  remind_day INTEGER NOT NULL DEFAULT 1,
  remind_hour INTEGER NOT NULL DEFAULT 1,
  day_sent INTEGER NOT NULL DEFAULT 0,
  hour_sent INTEGER NOT NULL DEFAULT 0,
  checkin_method TEXT CHECK (checkin_method IN ('qr','manual')),
  checked_in_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined')),
  message TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  PRIMARY KEY (user_id, club_id)
);
CREATE TABLE IF NOT EXISTS feedback (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS coin_transactions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  event_id INTEGER REFERENCES events(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('app','push','telegram','email')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reg_event ON registrations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(status, starts_at);
`;

function open(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  return db;
}

// Run several statements atomically
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

const iso = (d) => new Date(d).toISOString();

// ---------- fictional seed data ----------
const SEED_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
const FIRST = SEED_DATA.first, LAST = SEED_DATA.last;

function reset(db) {
  tx(db, () => { for (const tb of ['notifications', 'coin_transactions', 'feedback', 'memberships', 'registrations', 'events', 'sessions', 'users', 'clubs']) db.exec(`DELETE FROM ${tb}`); });
  return seed(db);
}

function seed(db, now = new Date()) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return false;
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
  const t = iso(now);
  return tx(db, () => {
    const addClub = db.prepare('INSERT INTO clubs (name, category, room, icon, description, i18n) VALUES (?,?,?,?,?,?)');
    for (const c of data.clubs) addClub.run(c.name, c.category, c.room, c.icon, c.description, JSON.stringify(c.i18n || null));
    const clubId = (name) => db.prepare('SELECT id FROM clubs WHERE name = ?').get(name).id;

    const addUser = db.prepare('INSERT INTO users (email, password_hash, name, student_id, group_name, role, club_id, created_at) VALUES (?,?,?,?,?,?,?,?)');
    // Test accounts (fictional): 10 students, 3 organizers, 1 moderator — listed in seed-data.json
    const hashes = {}, ids = {};
    for (const a of data.accounts) {
      hashes[a.password] = hashes[a.password] || hashPassword(a.password);
      ids[a.email] = addUser.run(a.email, hashes[a.password], a.name, a.studentId, a.group, a.role, a.club ? clubId(a.club) : null, t).lastInsertRowid;
    }
    const S = hashes['Student123!'];
    const gdsc = clubId('GDSC (Google Developer Student Club)');
    const me = ids['student1@test.local'], org = ids['organizer1@test.local'];
    // 120 extra fictional students who fill seats
    const crowd = [];
    for (let i = 0; i < 120; i++) {
      const name = FIRST[i % FIRST.length] + ' ' + LAST[(i * 7 + 3) % LAST.length];
      crowd.push(addUser.run(`s${String(i + 1).padStart(3, '0')}@test.local`, S, name, String(240100 + i), 'ST-24' + String(i % 9 + 1).padStart(2, '0'), 'student', null, t).lastInsertRowid);
    }

    // Events relative to "now" (local time of the machine that seeds the database)
    const at = (dayOffset, h, m) => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d; };
    const addEvent = db.prepare(`INSERT INTO events (title, description, club_id, location, type, starts_at, ends_at, capacity, coins, status, created_by, created_at, i18n)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const addReg = db.prepare(`INSERT INTO registrations (event_id, user_id, status, ticket_code, created_at, updated_at) VALUES (?,?,?,?,?,?)`);
    let ticketNo = 1;
    const code = () => 'CP-' + String(ticketNo++).padStart(6, '0');

    const all = [...data.events,
      // a demo event that starts 30 minutes after seeding, so check-in can be shown live
      { title: 'Open Lab Demo Day', club: 'GDSC (Google Developer Student Club)', location: 'Coworking Space, 1st Floor', type: 'tech', capacity: 30, taken: 8, coins: 25, description: 'Short demos of student projects. Check-in opens one hour before the start.', status: 'approved', waitlist: 0, demoSoon: true },
      // a past event the main student attended (to show coins and rating)
      { title: 'Welcome Fair of Clubs', club: 'Volunteers Club', location: 'Main Atrium', type: 'social', capacity: 200, taken: 60, coins: 20, description: 'Meet all student clubs in one place.', status: 'approved', waitlist: 0, past: true }];
    let ci = 0;
    for (const e of all) {
      let start = e.demoSoon ? new Date(now.getTime() + 30 * 60000) : e.past ? at(-3, 12, 0) : at(e.dayOffset, e.hour, e.minute);
      const end = new Date(start.getTime() + 2 * 3600000);
      const owner = e.club === 'GDSC (Google Developer Student Club)' ? org : null;
      const ev = addEvent.run(e.title, e.description, clubId(e.club), e.location, e.type, iso(start), iso(end), e.capacity, e.coins, e.status, owner, t, JSON.stringify(e.i18n || (data.extraEventI18n || {})[e.title] || null)).lastInsertRowid;
      if (e.status !== 'approved') continue;
      for (let k = 0; k < e.taken; k++) { addReg.run(ev, crowd[(ci++) % crowd.length], e.past ? 'checked_in' : 'confirmed', code(), t, t); }
      for (let k = 0; k < e.waitlist; k++) { addReg.run(ev, crowd[(ci++) % crowd.length], 'waitlisted', null, t, t); }
      if (e.past) {
        db.prepare(`INSERT INTO registrations (event_id, user_id, status, ticket_code, checkin_method, checked_in_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
          .run(ev, me, 'checked_in', code(), 'qr', iso(start), t, t);
        db.prepare('INSERT INTO coin_transactions (user_id, amount, reason, event_id, created_at) VALUES (?,?,?,?,?)').run(me, e.coins, 'Check-in', ev, iso(start));
      }
    }
    db.prepare('INSERT INTO coin_transactions (user_id, amount, reason, created_at) VALUES (?,?,?,?)').run(me, 100, 'Welcome bonus', t);
    db.prepare("INSERT INTO memberships (user_id, club_id, status, created_at, decided_at) VALUES (?,?, 'accepted', ?, ?)").run(me, gdsc, t, t);
    db.prepare("INSERT INTO memberships (user_id, club_id, status, message, created_at) VALUES (?,?, 'pending', ?, ?)").run(crowd[0], clubId('Music Club'), 'I play guitar and would like to join the acoustic nights.', t);
    return true;
  });
}

module.exports = { open, seed, reset, tx, iso, FIRST, LAST };
