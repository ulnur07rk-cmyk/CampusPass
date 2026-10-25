Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.

# CampusPass — campus events and clubs (prototype)

CampusPass is the working prototype for the Software Requirements Specification of Team 06 (Business Analysis, 2026–2027).
Students find events and clubs, register in one tap, get a QR ticket and earn Campus Coins; organizers submit events and check participants in; the moderator (Student Affairs) approves events and club requests and sees statistics.

- **Demo video:** _add the OneDrive link here_
- **SRS:** Team06_FP_Report.pdf (Moodle)

## Main use case (end to end)
1. A **student** opens the events poster, registers for an event and receives a QR ticket (or joins the waitlist if the event is full).
2. The **organizer** of the club opens *Check-in*, scans the QR ticket or enters the code (or finds the student in the participant list).
3. The registration becomes *checked in*, the student receives Campus Coins, and the **moderator** sees the attendance in *Statistics*.

What one user does is saved in the database and is immediately visible to the others.

## Implemented requirements
| ID | Requirement (short) | Where |
|---|---|---|
| FR-01 | Sign in with a test account; role-based menus | `POST /api/auth/login`, sign-in screen |
| FR-02 | Events poster for 7 days, filters by day and type | `GET /api/events`, Events |
| FR-03 | Free seats and waitlist size on every event | Events |
| FR-04 | Registration with a unique ticket code and QR code | `POST /api/events/:id/register`, Tickets |
| FR-05 | Waitlist with position when the event is full | same endpoint |
| FR-06 | Cancellation; the first waitlisted student gets the seat | `DELETE /api/events/:id/registration` |
| FR-07 | No duplicate registrations | same as FR-04 |
| FR-08 | Opt-in reminders (push / Telegram, 1 day / 1 hour) — **delivery simulated** | `PUT /api/registrations/:id/reminders` |
| FR-09 | Calendar export: Google, Outlook, .ics | `GET /api/events/:id/ics` |
| FR-10 | Club catalogue, search, join requests | `GET /api/clubs`, `POST /api/clubs/:id/join` |
| FR-11 | Organizer submits an event for moderation | `POST /api/events`, My events |
| FR-12 | Moderator approves or rejects (with a reason) | `POST /api/admin/events/:id/decision` |
| FR-13 | Moderator accepts or declines club requests | `POST /api/admin/club-requests/decision` |
| FR-14 | Check-in by QR ticket code (own club only, from 1 h before start) | `POST /api/checkin` |
| FR-15 | Manual check-in from the participant list | Check-in |
| FR-16 | Campus Coins for each check-in; balance and history | `GET /api/me/coins`, Profile |
| FR-17 | One rating (1–5) per attended event | `POST /api/events/:id/feedback` |
| FR-18 | Statistics: fill rate, waitlist, check-ins, rating | `GET /api/admin/stats` |
| FR-19 | Interface in English, Kazakh and Russian | language switch |
| FR-20 | Moderator assigns roles | `PUT /api/admin/users/:id/role`, Roles |
| FR-21 | Notification inbox (simulated e-mail / push / Telegram) | `GET /api/me/notifications`, Profile |

## Technology stack and why
- **Node.js 22 with no external packages:** HTTP server (`node:http`), database (`node:sqlite`), password hashing and tokens (`node:crypto`), tests (`node:test`).
- **SQLite** database in one local file (`data/campuspass.db`).
- **Plain HTML, CSS and JavaScript** frontend, no build step.

This fits the constraints in SRS section 2.5: the prototype runs only on localhost and keeps all (fictional) personal data on the local machine; it needs no payment card, cloud account or API key; it supports three interface languages; and any team member can install it in one minute. External services from the SRS (university SSO, Telegram Bot API, push services) are **simulated**: sign-in uses test accounts and reminders are written to the notification inbox.

## Install and run on localhost
Requirements: **Node.js 22.13 or newer** (`node -v`). No `npm install` is needed for localhost (the only dependency, `@netlify/blobs`, is used by the Netlify version).

```bash
git clone https://github.com/ulnur07rk-cmyk/CampusPass.git
cd CampusPass
cp .env.example .env        # Windows: copy .env.example .env
npm start                   # opens http://localhost:3000
```
- `npm run reset` — delete the database and create fresh test data (do this before a demo: the demo event starts 30 minutes after the reset).
- `npm test` — run the 13 automated acceptance tests (AT-01 … AT-13).

## Netlify version (optional)
Netlify cannot run a permanent Node.js server, so the Netlify version uses:
- **static files** from `public/` (the same screens);
- a **Netlify Function** `netlify/functions/api.mjs` for all `/api/*` requests, with the same business rules (`netlify/core.js`);
- **Netlify Blobs** (built into Netlify, free) as shared storage: what one user does is visible to all other users. Parallel changes are protected by optimistic locking (ETag check and retry).

Settings are in `netlify.toml` (build command `npm install`, publish directory `public`, functions `netlify/functions`). The data are created with fictional test data on the first request. The open screen reloads its data every 15 seconds, so changes from other users appear automatically.
The graded prototype is the localhost version (`npm start`) with the SQLite database; the Netlify version is only a convenient online copy.

## Test accounts (fictional)
| Role | E-mail | Password |
|---|---|---|
| Student | student@test.local | Student123! |
| Student 2 | student2@test.local | Student123! |
| Organizer (GDSC) | organizer@test.local | Organizer123! |
| Organizer (Chess Club) | organizer2@test.local | Organizer123! |
| Moderator (Student Affairs) | admin@test.local | Admin123! |
| Usability testers (clean accounts) | tester1@test.local … tester5@test.local | Student123! |

Before each round of usability testing, the moderator can press **Roles → Reset test data** to restore the starting data (everyone is signed out). Self-registration is intentionally not offered: the prototype must not collect data from real people.

## Security and data
- Passwords are stored as scrypt hashes; sessions use random tokens in an HttpOnly, SameSite cookie; access rights are checked on the server for every API call.
- 10 failed sign-ins from one address within 5 minutes are blocked for 5 minutes.
- All names, IDs and e-mails in the database are invented. Do not enter real personal data.
- Settings live in `.env`, which is listed in `.gitignore` and must never be committed.

## Project structure
```
server/   index.js (start), app.js (API and rules), db.js (schema and seed), auth.js, seed-data.json
netlify/  core.js (API rules for Netlify), functions/api.mjs (Netlify Function)
public/   index.html, app.js (screens), i18n.js (EN/KZ/RU), styles.css, vendor/qrcode.js
tests/    acceptance.test.js
```

## Credits and licences
- QR code generation: `vendor/qrcode.js` is a browser bundle of the QR encoder from [qrcode-terminal](https://github.com/gtanner/qrcode-terminal) (Apache-2.0), which is based on *QRCode for JavaScript* by Kazuhiko Arase (MIT).
- QR scanning in browsers without the built-in BarcodeDetector: [jsQR](https://github.com/cozmo/jsQR) 1.4.0 (Apache-2.0), loaded from the jsDelivr CDN only when the organizer presses *Scan with camera* (needs internet and HTTPS or localhost).
- Club names and descriptions are based on public information; events, people and numbers are invented.

## AI use
Parts of the code were written with the help of Claude (Anthropic), model Claude Opus 5.5, with the instructor's permission; see the AI Disclosure Statement in the report. Every team member reviewed the code and can explain it.

## Team 06
Nietbai Ulnur (team lead), Aliaskarova Ulpana — group ITM-2401. Supervisor: Nurkhat Ibadildin, Associate Professor.
