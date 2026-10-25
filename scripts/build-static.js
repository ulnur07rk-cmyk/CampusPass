// Build the Netlify demo version into dist/ (run by Netlify: node scripts/build-static.js).
// Educational project. Not a real product or service. All data are fictional.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..'), dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(root, 'server', 'seed-data.json'), 'utf8'));
const src = fs.readFileSync(path.join(root, 'server', 'db.js'), 'utf8');
const list = (name) => JSON.parse(src.match(new RegExp('const ' + name + ' = (\\[[^\\]]*\\])'))[1].replace(/'/g, '"'));
const seed = { clubs: data.clubs, events: data.events, first: list('FIRST'), last: list('LAST') };
const tpl = fs.readFileSync(path.join(__dirname, 'demo-api.template.js'), 'utf8').replace('/*__SEED__*/null', JSON.stringify(seed));
fs.writeFileSync(path.join(dist, 'demo-api.js'), tpl);
const indexFile = path.join(dist, 'index.html');
fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace('<script src="/app.js"></script>', '<script src="/demo-api.js"></script>\n<script src="/app.js"></script>'));
console.log('Netlify demo build ready in dist/');
