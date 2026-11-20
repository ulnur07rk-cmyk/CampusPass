// Checks WCAG 2.1 AA contrast (4.5:1 for normal text) of the colour pairs used in public/styles.css,
// for the day and the night theme. Run: node scripts/contrast.js  (exit code 1 if a pair fails)
// Educational project for the course Business Analysis. Not a real product or service. All data are fictional.
'use strict';
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
const vars = (selector) => {
  const i = css.indexOf(selector + '{'); const block = css.slice(i, css.indexOf('}', i));
  return Object.fromEntries([...block.matchAll(/--([a-z0-9]+):(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
};
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// [text, background] pairs that appear in the interface
const PAIRS = [['ink', 'bg'], ['ink', 'card'], ['ink2', 'bg'], ['ink2', 'card'], ['accent', 'card'], ['accent', 'bg'], ['onaccent', 'accent'], ['onaccent', 'accent2'],
  ['accent', 'soft'], ['accent2', 'soft'], ['ink', 'soft'], ['ok', 'okbg'], ['warn', 'warnbg'], ['bad', 'badbg'], ['bad', 'card'], ['ink', 'top'], ['ink2', 'top']];
let bad = 0;
for (const [name, sel] of [['Day', ':root'], ['Night', ':root[data-theme=dark]']]) {
  const v = vars(sel);
  console.log(`\n${name} theme`);
  for (const [fg, bg] of PAIRS) {
    const r = ratio(v[fg], v[bg]), ok = r >= 4.5; if (!ok) bad++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${(fg + ' on ' + bg).padEnd(22)} ${r.toFixed(2)}:1`);
  }
}
console.log(bad ? `\n${bad} pair(s) below 4.5:1` : '\nAll pairs meet WCAG AA (4.5:1).');
process.exit(bad ? 1 : 0);
