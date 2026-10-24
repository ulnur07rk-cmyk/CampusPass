// CampusPass — start the local server: npm start  →  http://localhost:3000
// Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

// Minimal .env reader (no external packages). Secrets and settings stay in .env, which is listed in .gitignore.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { open, seed } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = path.resolve(__dirname, '..', process.env.DB_PATH || 'data/campuspass.db');
if (process.argv.includes('--reset') && fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

const db = open(DB_PATH);
if (seed(db)) console.log('Database created with fictional test data:', DB_PATH);
const app = createApp(db, { sessionTtlHours: Number(process.env.SESSION_TTL_HOURS) || 12 });
setInterval(() => app.sendDueReminders(), 60000).unref();

http.createServer(app).listen(PORT, () => {
  console.log(`CampusPass is running: http://localhost:${PORT}`);
  console.log('Test accounts: student@test.local / Student123!   organizer@test.local / Organizer123!   admin@test.local / Admin123!');
});
