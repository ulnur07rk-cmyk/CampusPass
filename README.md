Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.

# CampusPass — campus events and clubs (prototype)

CampusPass is the working prototype for the Software Requirements Specification of Team 06 (Business Analysis, 2026–2027).
Students find events and clubs, register in one tap, get a QR ticket and earn Campus Coins; organizers submit events (in English, Kazakh and Russian) and check participants in; the moderator (Student Affairs) approves events and club requests and sees statistics; the administrator (IT office) edits everything and handles complaints. A Telegram bot shows events, registers students and sends reminders.

- **Demo video:** _add the OneDrive link here_
- **SRS:** Team06_FP_Report.pdf (Moodle)
- **Product backlog:** https://docs.google.com/spreadsheets/d/1Le3d2LIvsIF1ub6BgNCJ2U6lOVJ0m71tfM_AGOumkUU/edit?usp=sharing (48 user stories, MoSCoW, story points, release, status, links to FR and tests)

## Main use case (end to end)
1. A **student** opens the events poster, registers for an event and receives a QR ticket (or joins the waitlist if the event is full).
2. The **organizer** of the club opens *Check-in*, scans the QR ticket or enters the code (or finds the student in the participant list).
3. The registration becomes *checked in*, the student receives Campus Coins, and the **moderator** sees the attendance in *Statistics*.

Second scenario (Final release): a student presses **Report a problem** on an event → the **administrator** gets it in the inbox and in Telegram → sets *In review* / *Resolved* with an answer → the student sees the answer in the Profile.

What one user does is saved in the database and is immediately visible to the others.

## Implemented requirements

The IDs are the same as in the SRS (Team06_FP_Report, Section 4 and Appendix F). All 49 functional requirements of the SRS are implemented, plus FR-50 (built-in assistant) added after the report; FR-01, FR-08 and FR-21 use a simulated external service (test accounts instead of SSO; push and e-mail shown in the in-app inbox).

**4.1 Access, roles and languages**

| ID | Requirement (short) | Where | Test |
|---|---|---|---|
| FR-01 | Sign in with a test account (SSO in production); only the menu of the role | `POST /api/auth/login`, W01 | AT-01 |
| FR-19 | Interface, dates and event/club content in Kazakh, Russian or English; choice kept | language switch, `PUT /api/me/lang` | MT-02 |
| FR-20 | Administrator assigns one of five roles and a club; new rights at next sign-in | `PUT /api/admin/users/:id`, Administration → Users | AT-17 |
| FR-40 | Moderator and administrator are separate roles | `ROLES` in `server/app.js` | AT-17 |

**4.2 Event discovery and maps**

| ID | Requirement (short) | Where | Test |
|---|---|---|---|
| FR-02 | Poster of approved events for 7 days, filters by day and type, keyword search | `GET /api/events`, Events | AT-02 |
| FR-03 | Date, time, place, free seats with a bar, waitlist size and coins on every card | Events, event details | AT-02 |
| FR-09 | Export to Google Calendar, Outlook or .ics; share link | `GET /api/events/:id/ics` | MT-01 |
| FR-24 | 2GIS city map (OpenStreetMap without a key) and a walking/driving route; location stays in the browser; a student sees only the events they registered for, an organizer only the own club's events | Map, `GET /api/places`, `public/maps.js` | MT-03 |
| FR-25 | Route inside the building on the floor plans | “Route inside”, `public/maps.js` | MT-04 |

**4.3 Registration, tickets and waitlist**

| ID | Requirement (short) | Where | Test |
|---|---|---|---|
| FR-04 | Register (with consent) before the start; Confirmed + unique ticket code as QR | `POST /api/events/:id/register`, Tickets | AT-03 |
| FR-05 | Waitlist with position when the event is full | same endpoint | AT-04 |
| FR-06 | Cancel after confirmation; the seat goes to the first waitlisted student | `DELETE /api/events/:id/registration` | AT-05 |
| FR-07 | No second active registration (`already_registered`) | same as FR-04 | AT-03 |
| FR-08 | Opt-in reminders 1 day / 1 hour before, once, through the chosen channel | `PUT /api/registrations/:id/reminders` | AT-06, AT-15 |
| FR-27 | Open events without seats or tickets: “I plan to come” | event form, event details | AT-22 |

**4.4 Event submission, moderation and free rooms**

| ID | Requirement (short) | Where | Test |
|---|---|---|---|
| FR-11 | Organizer submits an event of the own club (optional picture) as Pending | `POST /api/events`, My events | AT-09, AT-24 |
| FR-12 | Moderator approves or rejects (reason required); organizer is told | `POST /api/admin/events/:id/decision`, Moderation | AT-09 |
| FR-22 | Free rooms for the whole chosen time (lectures and events considered); “Use” fills the form | `GET /api/rooms/availability`, My events, Moderation | AT-25 |
| FR-23 | A busy or too small room is refused; booking final on approval | `POST /api/events` | AT-25 |
| FR-39 | Title and description in EN, KK and/or RU; at least one complete language | `POST /api/events` | AT-16 |

**4.5 Check-in, Campus Coins and attendance**

| ID | Requirement (short) | Where | Test |
|---|---|---|---|
| FR-14 | Check-in by QR or code for the selected event in the check-in window; used/foreign ticket refused | `POST /api/checkin`, Check-in | AT-07 |
| FR-15 | Check-in from the participant list, search by name or ID | `GET /api/events/:id/participants` | AT-08 |
| FR-16 | Coins at check-in; balance and coin history of the academic year | `GET /api/me/coins`, Profile | AT-07 |
| FR-17 | One 1–5 star rating per attended event | `POST /api/events/:id/feedback`, History | AT-12 |
| FR-18 | Statistics: seats, registrations, fill rate, waitlist, check-ins, rating | `GET /api/admin/stats`, Statistics | AT-12 |
| FR-26 | Attendance history: attended, missed, cancelled, coins, share attended | `GET /api/me/history`, History | AT-14 |

**4.6 Clubs**

| ID | Requirement (short) | Where | Test |
|---|---|---|---|
| FR-10 | Catalogue of 42 clubs in five categories, search, join request | `GET /api/clubs`, `POST /api/clubs/:id/join` | AT-11 |
| FR-13 | Moderator accepts or declines a join request; student is told | `POST /api/admin/club-requests/decision` | AT-11 |

**4.7 Notifications and the Telegram bot**

| ID | Requirement (short) | Where | Test |
|---|---|---|---|
| FR-21 | In-app inbox with the channel of each message (e-mail and push simulated) | `GET /api/me/notifications`, Profile | AT-05, AT-15 |
| FR-34 | Bot commands /today, /events, /my, /help, /lang, /stop; menu in EN/KK/RU | `server/bot.js` | AT-19 |
| FR-35 | Event list with inline buttons → event card → back to menu | `server/bot.js` | AT-19 |
| FR-36 | Linked student registers in the bot under the website rules | `botApi.register` | AT-19 |
| FR-37 | Bot language: chosen in the bot, else the Telegram app language; kept per chat | table `telegram_chats` | AT-19 |
| FR-38 | Reminders in the chat language with buttons; < 1 day before the start only the 1-hour one | `sendDueReminders` | AT-19 |
| FR-46 | Own menu buttons and command list for each role | `MENU`, `ROLE_CMDS` in `server/bot.js` | AT-21 |
| FR-47 | Organizer: club events, participants, check-in by sending the ticket code | `/club`, `/checkin` | AT-21 |
| FR-48 | Moderator: new events with Approve / Reject, club requests, statistics | `/pending`, `/requests`, `/stats` | AT-21 |
| FR-49 | Administrator: new complaints with status buttons and answer | `/complaints` | AT-21 |
| FR-50 | Assistant chat: AI answers (Google Gemini, when `GEMINI_API_KEY` is set) grounded in the data the user may see; without a key, or if the service fails, the built-in assistant answers (EN/KK/RU, keywords + CampusPass data). Name, e-mail and student ID are never sent | `server/assistant.js`, `POST /api/assistant`, 💬 Assistant button, free text in the bot | AT-26, AT-27 |

**4.8 Administration and complaints**

| ID | Requirement (short) | Where | Test |
|---|---|---|---|
| FR-41 | Administrator edits, cancels or deletes any event; registrations cancelled, students told | `PUT`/`DELETE /api/admin/events/:id` | AT-17, AT-22 |
| FR-42 | Report a problem with an event or club (reason, 5–500 characters, one open report) | `POST /api/complaints` | AT-18 |
| FR-43 | Report → administrator inbox and Telegram; New → In review → Resolved/Rejected, answer required | `PUT /api/admin/complaints/:id` | AT-18 |
| FR-44 | Search accounts, change name, role and club; reset the fictional test data | `/api/admin/users`, `/api/admin/reset` | AT-13, AT-17 |
| FR-45 | Add and edit clubs in three languages | `/api/admin/clubs` | AT-17 |

**4.9 Campus Coins for a merch discount (Release 2.0)**

| ID | Requirement (short) | Where | Test |
|---|---|---|---|
| FR-28 | 5% for 300 coins, 10% for 700 coins (BR-07) | `GET /api/shop`, Merch shop | AT-23 |
| FR-29 | Voucher with QR, coins taken at once, valid 7 days, one active voucher | `POST /api/shop/vouchers` | AT-23 |
| FR-30 | Coins returned for a cancelled or expired voucher (BR-09) | `DELETE /api/shop/vouchers/:id` | AT-23 |
| FR-31 | Cashier scans the code, enters the amount, sees the discount (max 2 000 ₸) and the total | `POST /api/shop/redeem`, Check-out | AT-23 |
| FR-32 | Voucher used on confirmation; used, expired or unknown code refused; student told | `POST /api/shop/redeem` | AT-23 |
| FR-33 | Coins expire on 30 June; expiry date in the Profile (BR-10) | Profile, Merch shop | AT-23 |

**Constraints and interface rules shown in the prototype:** C08 consent at the first sign-in (can be withdrawn in the Profile); C10 no student IDs in staff Telegram messages; UI01 at most six menu sections per role; UI06 confirmation before actions that cannot be undone; NFR-12 contrast ≥ 4.5:1 in the day and night themes (`npm run contrast`). The checks for NFR-01, NFR-04 and NFR-09 run with `npm run nfr`.

## AI chat (optional, free)

1. Open https://aistudio.google.com → **Get API key** (a free key, no payment card).
2. Put it in `.env` (never commit it): `GEMINI_API_KEY=...` (optional: `GEMINI_MODEL=gemini-2.5-flash`, `AI_MAX_PER_HOUR=30`).
3. Restart `npm start`. On Netlify add the same variable in *Site configuration → Environment variables* and redeploy.

The assistant then answers free questions with Gemini, using only public event and club data plus the student's own coins and registrations. Name, e-mail and student ID are never sent (C10). Without a key, over the hourly limit, or when the service fails, the built-in assistant answers.

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
- `npm test` — run the 25 automated acceptance tests (AT-01 … AT-24; AT-20 checks that the Netlify version has the same rules, AT-21 the bot for every role).
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
| Merch shop cashier | shop@test.local | Shop123! |

`student1` (Aruzhan Bekova) already has some history, 370 coins (enough for a 5% merch voucher) and has given consent; all other accounts see the **consent screen** (C08) at the first sign-in. `student2` … `student10` start clean, so each usability tester can get an own account. *Acoustic Night* is an **open event** (“I plan to come”).
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
scripts/  build-demo.js, contrast.js, record-demo.py (records the demo video with captions)
tests/    acceptance.test.js
```

## Credits and licences
- QR code generation: `vendor/qrcode.js` is a browser bundle of the QR encoder from [qrcode-terminal](https://github.com/gtanner/qrcode-terminal) (Apache-2.0), which is based on *QRCode for JavaScript* by Kazuhiko Arase (MIT).
- QR scanning in browsers without the built-in BarcodeDetector: [jsQR](https://github.com/cozmo/jsQR) 1.4.0 (Apache-2.0), loaded from the jsDelivr CDN only when the organizer presses *Scan with camera* (needs internet and HTTPS or localhost).
- City map: base map tiles from Esri World Street Map (© Esri, HERE, Garmin, © OpenStreetMap contributors), shown with Leaflet 1.9.4 (BSD-2-Clause) loaded from cdnjs; street routes from the public routing service of routing.openstreetmap.de (no key, demo use only).
- 2GIS city map: MapGL JS API (© 2GIS), free demo key; the key is stored in `.env` and in Netlify environment variables, not in the repository.
- Telegram reminders: Telegram Bot API (bot created by the team with @BotFather).
- ER diagram and the state diagrams (Registration, Merch voucher) drawn with Graphviz from `public/diagrams/*.dot`.
- Event covers in `public/covers/` are original artwork made for this project.
- Floor plans (`public/floors/`): screenshots made by the team from the student-made campus map https://yuujiso.github.io/aitumap/; rooms, capacities and the lecture timetable in the prototype are fictional.
- Club names and descriptions are based on public information; events, people and numbers are invented.

## AI use
Parts of the code were written with the help of Claude (Anthropic), model Claude Opus 5.5, with the instructor's permission; see the AI Disclosure Statement in the report. Every team member reviewed the code and can explain it.

## Team 06
Nietbai Ulnur (team lead), Aliaskarova Ulpana — group ITM-2401. Supervisor: Nurkhat Ibadildin, Associate Professor.
