// Build CampusPass_demo.html: one self-contained file for showing the prototype without a server.
// The API runs inside the browser (netlify/core.js, the same rules as the server); data are kept in localStorage.
// Educational project for the course Business Analysis. Not a real product or service. All data are fictional.
'use strict';
const fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const b64 = (p) => fs.readFileSync(path.join(__dirname, '..', p)).toString('base64');
const seed = R('server/seed-data.json');
const floors = { 1: 'data:image/png;base64,' + b64('public/floors/floor1.png'), 2: 'data:image/png;base64,' + b64('public/floors/floor2.png'), 3: 'data:image/png;base64,' + b64('public/floors/floor3.png') };
const favicon = 'data:image/svg+xml;base64,' + b64('public/favicon.svg');
const maps = R('public/maps.js').replace('href="/floors/floor${floor}.png"', 'href="${window.__FLOORS[floor]}"');
if (maps === R('public/maps.js')) throw new Error('floor image path not found in maps.js');
const app = R('public/app.js').replace('<a class="btn ghost small" href="/api/events/${e.id}/ics">', '<a class="btn ghost small" href="data:text/calendar;charset=utf-8,${encodeURIComponent(window.__ICS(e.id))}" download="event-${e.id}.ics">');
const shell = R('public/index.html');
const body = shell.slice(shell.indexOf('<body>') + 6, shell.indexOf('<script')).split('src="/favicon.svg"').join('src="' + favicon + '"');
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const backend = `
(function () {
  var module = { exports: {} };
  ${R('server/rooms.js')}
  window.__rooms = module.exports;
})();
(function () {
  var module = { exports: {} }; var require = function () { return window.__rooms; };
  ${R('netlify/core.js')}
  window.__core = module.exports;
})();
(function () {
  var SEED = ${seed};
  var KEY = 'cp.demo.state.v1', TOK = 'cp.demo.token';
  var saved = null; try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { saved = null; }
  var core = window.__core.createCore(SEED, saved);
  function save() { try { localStorage.setItem(KEY, JSON.stringify(core.state)); } catch (e) {} }
  save();
  window.__ICS = function (id) { var r = core.handle('GET', '/api/events/' + id + '/ics', {}, localStorage.getItem(TOK)); return r.status === 200 ? r.data : ''; };
  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var u = String(url);
    if (u.indexOf('/api/') !== 0) return realFetch(url, opts);
    opts = opts || {};
    var body = {}; if (opts.body) { try { body = JSON.parse(opts.body); } catch (e) { body = {}; } }
    var out = core.handle((opts.method || 'GET').toUpperCase(), u, body, localStorage.getItem(TOK));
    if (out.token !== undefined) { if (out.token) localStorage.setItem(TOK, out.token); else localStorage.removeItem(TOK); }
    save();
    var isText = typeof out.data === 'string';
    return Promise.resolve(new Response(isText ? out.data : JSON.stringify(out.data), { status: out.status, headers: { 'Content-Type': isText ? 'text/plain' : 'application/json' } }));
  };
  // reminders are checked on every request; also once a minute while the page is open
  setInterval(function () { core.handle('GET', '/api/me', {}, localStorage.getItem(TOK)); save(); }, 60000);
})();
window.__FLOORS = ${JSON.stringify(floors)};
`;
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>CampusPass — demo (educational prototype)</title>
<link rel="icon" href="${favicon}">
<style>${R('public/styles.css')}</style>
</head>
<body>${body}
<script>${esc(R('public/vendor/qrcode.js'))}</script>
<script>${esc(backend)}</script>
<script>${esc(R('public/i18n.js'))}</script>
<script>${esc(maps)}</script>
<script>${esc(app)}</script>
</body>
</html>`;
const out = process.argv[2] || path.join(__dirname, '..', 'CampusPass_demo.html');
fs.writeFileSync(out, html);
console.log('written', out, Math.round(html.length / 1024) + ' KB');
