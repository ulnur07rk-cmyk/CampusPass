Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.

# CampusPass — campus events and clubs (prototype)

CampusPass is the working prototype for the Software Requirements Specification of Team 06 (Business Analysis, 2026–2027).
Students find events and clubs, register in one tap, get a QR ticket and earn Campus Coins; organizers submit events (in English, Kazakh and Russian) and check participants in; the moderator (Student Affairs) approves events and club requests and sees statistics; the administrator (IT office) edits everything and handles complaints. A Telegram bot shows events, registers students and sends reminders.

- **Demo video:** _add the OneDrive link here_
- **SRS:** Team06_FP_Report.pdf (Moodle)

## Main use case (end to end)
1. A **student** opens the events poster, registers for an event and receives a QR ticket (or joins the waitlist if the event is full).
2. The **organizer** of the club opens *Check-in*, scans the QR ticket or enters the code (or finds the student in the participant list).
3. The registration becomes *checked in*, the student receives Campus Coins, and the **moderator** sees the attendance in *Statistics*.

Second scenario (Final release): a student presses **Report a problem** on an event → the **administrator** gets it in the inbox and in Telegram → sets *In review* / *Resolved* with an answer → the student sees the answer in the Profile.

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
| FR-08 | Opt-in reminders (1 day / 1 hour). **Telegram: real messages through the CampusPass bot** (connect in Profile); push is simulated in the in-app inbox | `PUT /api/registrations/:id/reminders`, `POST /api/me/telegram/link` |
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
| FR-20 | Administrator assigns roles | `PUT /api/admin/users/:id`, Administration → Users |
| F21 | Free rooms (fictional lecture timetable): for the organizer in **My events** next to the form (*Use* fills the form), for the moderator in **Moderation**; booking is confirmed by the moderator; conflicts are blocked | `GET /api/rooms/availability`, `POST /api/events` |
| F22 | Map: events on the **2GIS** city map (OpenStreetMap if no key), street route from the student's location, route inside the building on the floor plans | Map tab, `GET /api/places`, `public/maps.js` |
| FR-21 | Notification inbox (simulated e-mail / push / Telegram) | `GET /api/me/notifications`, Profile |

**Final release (after the Endterm defense).** FR-28 … FR-33 (Coin redemption in the merch shop) are planned for Release 2.0 and are not in the prototype.

| ID | Requirement (short) | Where |
|---|---|---|
| FR-34 | Telegram bot commands `/today`, `/events`, `/my`, `/help`, `/lang`, `/stop`; command menu in EN/KK/RU | `server/bot.js` |
| FR-35 | Inline buttons: menu, event list → event card, back | `server/bot.js` |
| FR-36 | A linked student registers for an event from the bot and gets the ticket code; same rules as the website | `botApi.register` in `server/app.js`, `netlify/core.js` |
| FR-37 | Bot language: chosen in the bot, else the language of the Telegram app; saved per chat | table `telegram_chats` |
| FR-38 | Reminders in Telegram in the chat language with buttons; close to the start only the 1-hour reminder; on Netlify a scheduled function sends them every 10 minutes | `sendDueReminders`, `netlify/functions/reminders.mjs` |
| FR-39 | Organizer writes the title and description in EN, KK and/or RU (at least one complete language); users see their language, otherwise the original | `POST /api/events` (`i18n`), My events |
| FR-40 | Separate roles: moderator (moderation, statistics, check-in, free rooms) and administrator (everything) | `ROLES` in `server/app.js` |
| FR-41 | Administrator edits any event (texts in 3 languages, time, seats, coins, status), cancels or deletes it; registered students are told | `PUT/DELETE /api/admin/events/:id` |
| FR-42 | Administrator adds and edits clubs and users (name, role, club); search over all users | `/api/admin/clubs`, `/api/admin/users` |
| FR-43 | Any user (not the administrator) reports an event or a club with a reason and text; one open report per target | `POST /api/complaints` |
| FR-44 | New report → administrator's inbox and Telegram (if linked) | `alert()` in `server/app.js` |
| FR-45 | Report statuses new → in review → resolved / rejected; closing needs an answer; the author sees status and answer in the Profile | `PUT /api/admin/complaints/:id`, `GET /api/me/complaints` |
| FR-46 | The bot is different for each role: own menu buttons and own command list (set for the chat when the account is linked) | `MENU`, `ROLE_CMDS` in `server/bot.js` |
| FR-47 | Organizer in the bot: events of the club (status, seats, waitlist), participant list, **check-in by sending the ticket code** | `/club`, `/checkin` |
| FR-48 | Moderator in the bot: new events arrive with **Approve / Reject** buttons (reject asks for a reason), `/pending`, club requests ✅/❌, `/stats`; the organizer is told the decision | `/pending`, `/requests`, `/stats` |
| FR-49 | Administrator in the bot: new complaints arrive with buttons (in review / resolve / reject with an answer), `/complaints`; the author is told the status; student: `/my` with cancel, `/coins`, a message when a waitlist seat is free | `/complaints`, `/my`, `/coins` |
| C08 | Consent screen at the first sign-in (what is kept, why, who sees it, how long, where); without consent a student cannot register; consent can be withdrawn in the Profile | `POST/DELETE /api/me/consent` |
| F4 / F13 | **Open events** (concerts, fairs): no registration limit and no ticket — students press “I plan to come”, the organizer sees how many to expect | `open` in `POST /api/events`, status `planned` |
| State diagram | When an event is cancelled, all its Confirmed / Waitlisted / Planned registrations become Cancelled | `PUT /api/admin/events/:id` |
| C10 | Telegram messages to staff contain no student IDs; complaint alerts do not name the author | `server/bot.js` |
| UI01 | At most six menu sections for every role (Database is a tab inside Administration) | `NAV` in `public/app.js` |
| NFR-UI | Green–beige design, day/night theme (choice saved in the browser), text contrast WCAG AA ≥ 4.5:1 | `public/theme.js`, `npm run contrast` |

## Technology stack and why
- **Node.js 22 with no external packages:** HTTP server (`node:http`), database (`node:sqlite`), password hashing and tokens (`node:crypto`), tests (`node:test`).
- **SQLite** database in one local file (`data/campuspass.db`).
- **Plain HTML, CSS and JavaScript** frontend, no build step.

This fits the constraints in SRS section 2.5: the prototype runs on localhost and keeps all (fictional) data on the local machine; it needs no payment card or paid plan; it supports three interface languages; and any team member can install it in one minute. Two external services are real and **optional** (free keys in `.env`): the **2GIS map** (MapGL JS API) and the **Telegram Bot API** for reminders. University SSO and push notifications are simulated: sign-in uses test accounts and push messages go to the in-app inbox.

## Install and run on localhost
Requirements: **Node.js 22.13 or newer** (`node -v`). No `npm install` is needed for localhost (the only dependency, `@netlify/blobs`, is used by the Netlify version).

```bash
git clone https://github.com/ulnur07rk-cmyk/CampusPass.git
cd CampusPass
cp .env.example .env        # Windows: copy .env.example .env
npm start                   # opens http://localhost:3000
```
- `npm run reset` — delete the database and create fresh test data (do this before a demo: the demo event starts 30 minutes after the reset).
- `npm test` — run the 23 automated acceptance tests (AT-01 … AT-22; AT-20 checks that the Netlify version has the same rules, AT-21 the bot for every role).
- `npm run demo` — build `CampusPass_demo.html`, one file that works without a server (data in the browser).
- `npm run contrast` — check the colour contrast of both themes (WCAG AA).
- Administrator → **Administration → Database**: all tables, columns, keys and row counts of the live database (passwords and Telegram data are hidden). ER diagram: `public/diagrams/fig_er_diagram.png`.

## Settings in `.env` (never committed)

| Variable | What it does | Where to get it |
|---|---|---|
| `MAPGL_KEY` | 2GIS city map; without it the map uses OpenStreetMap | free demo key at platform.2gis.ru (MapGL JS API), restricted to `localhost` and the Netlify domain |
| `TELEGRAM_BOT_TOKEN` | Real reminders in Telegram; without it reminders stay in the in-app inbox | @BotFather → `/newbot` |
| `TELEGRAM_POLLING` | `1` = localhost receives bot messages (long polling) | — |
| `SITE_URL` | Optional. An `https://` address adds “Open in CampusPass” buttons to bot messages (Netlify fills it automatically) | — |

**Telegram on localhost:** put the token in `.env`, run `npm start` (the console shows *Telegram bot @… is listening*). Sign in as a student → **Profile → Connect Telegram** → press **Start** in the bot → **Send a test message**. Then try the buttons. **Each role sees its own menu:** student — events, register, `/my`, `/coins`; organizer — `/club`, participants, check-in by sending the ticket code `CP-…`; moderator — `/pending` (Approve / Reject), `/requests`, `/stats`; administrator — `/complaints` and the moderator tools. The bot acts through the same API rules as the website, so a role can never do more in the bot than on the website. Sign in as `admin@test.local`, connect Telegram, and report an event as a student: the alert arrives in the administrator's chat. Only the numeric chat id is stored, never a name or phone number; use only the team's own Telegram accounts in demos. **Reset test data** removes every link.

**Telegram and the map on Netlify:** Site configuration → Environment variables → add `MAPGL_KEY` and `TELEGRAM_BOT_TOKEN` → redeploy. The website receives bot messages through the function `netlify/functions/telegram.mjs` (path `/tg-hook`); pressing *Connect Telegram* on the website switches the bot to the website, and starting `npm start` switches it back to localhost — use one at a time.

## Netlify version (optional)
Netlify cannot run a permanent Node.js server, so the Netlify version uses:
- **static files** from `public/` (the same screens);
- a **Netlify Function** `netlify/functions/api.mjs` for all `/api/*` requests, with the same business rules (`netlify/core.js`);
- a **scheduled function** `netlify/functions/reminders.mjs` (every 10 minutes) that sends due Telegram reminders;
- **Netlify Blobs** (built into Netlify, free) as shared storage: what one user does is visible to all other users. Parallel changes are protected by optimistic locking (ETag check and retry).

Settings are in `netlify.toml` (build command `npm install`, publish directory `public`, functions `netlify/functions`). The data are created with fictional test data on the first request. The open screen reloads its data every 15 seconds, so changes from other users appear automatically.
The graded prototype is the localhost version (`npm start`) with the SQLite database; the Netlify version is only a convenient online copy.

## Test accounts (fictional)
All accounts are fictional. On the sign-in screen, choose an account in the list **“Sign in as”**: the e-mail and password are filled in automatically.

| Role | E-mail | Password |
|---|---|---|
| Students (10) | student1@test.local … student10@test.local | Student123! |
| Organizer, GDSC | organizer1@test.local | Organizer123! |
| Organizer, Chess Club | organizer2@test.local | Organizer123! |
| Organizer, Music Club | organizer3@test.local | Organizer123! |
| Moderator (Student Affairs) | moderator@test.local | Moderator123! |
| Administrator (IT office) | admin@test.local | Admin123! |

`student1` (Aruzhan Bekova) already has some history and has given consent; all other accounts see the **consent screen** (C08) at the first sign-in. `student2` … `student10` start clean, so each usability tester can get an own account. *Acoustic Night* is an **open event** (“I plan to come”).
Before each round of usability testing, the administrator can press **Administration → Users → Reset test data** to restore the starting data (everyone is signed out). Self-registration is intentionally not offered: the prototype must not collect data from real people.

## Security and data
- Passwords are stored as scrypt hashes; sessions use random tokens in an HttpOnly, SameSite cookie; access rights are checked on the server for every API call.
- 10 failed sign-ins from one address within 5 minutes are blocked for 5 minutes.
- All names, IDs and e-mails in the database are invented. Do not enter real personal data.
- Settings live in `.env`, which is listed in `.gitignore` and must never be committed.

## Project structure
```
server/   index.js (start), app.js (API and rules), db.js (11 tables, seed), auth.js, rooms.js,
          bot.js (Telegram bot logic, shared), telegram.js (long polling), seed-data.json
netlify/  core.js (API rules for Netlify), functions/api.mjs, telegram.mjs (webhook), reminders.mjs (schedule)
public/   index.html, app.js (screens), i18n.js (EN/KZ/RU), theme.js (day/night), styles.css, maps.js, vendor/qrcode.js
scripts/  build-demo.js, contrast.js
tests/    acceptance.test.js
```

## Credits and licences
- QR code generation: `vendor/qrcode.js` is a browser bundle of the QR encoder from [qrcode-terminal](https://github.com/gtanner/qrcode-terminal) (Apache-2.0), which is based on *QRCode for JavaScript* by Kazuhiko Arase (MIT).
- QR scanning in browsers without the built-in BarcodeDetector: [jsQR](https://github.com/cozmo/jsQR) 1.4.0 (Apache-2.0), loaded from the jsDelivr CDN only when the organizer presses *Scan with camera* (needs internet and HTTPS or localhost).
- City map: base map tiles from Esri World Street Map (© Esri, HERE, Garmin, © OpenStreetMap contributors), shown with Leaflet 1.9.4 (BSD-2-Clause) loaded from cdnjs; street routes from the public routing service of routing.openstreetmap.de (no key, demo use only).
- 2GIS city map: MapGL JS API (© 2GIS), free demo key; the key is stored in `.env` and in Netlify environment variables, not in the repository.
- Telegram reminders: Telegram Bot API (bot created by the team with @BotFather).
- ER diagram drawn with Graphviz from `public/diagrams/fig_er_diagram.dot`.
- Floor plans (`public/floors/`): screenshots made by the team from the student-made campus map https://yuujiso.github.io/aitumap/; rooms, capacities and the lecture timetable in the prototype are fictional.
- Club names and descriptions are based on public information; events, people and numbers are invented.

## AI use
Parts of the code were written with the help of Claude (Anthropic), model Claude Opus 5.5, with the instructor's permission; see the AI Disclosure Statement in the report. Every team member reviewed the code and can explain it.

## Team 06
Nietbai Ulnur (team lead), Aliaskarova Ulpana — group ITM-2401. Supervisor: Nurkhat Ibadildin, Associate Professor.
