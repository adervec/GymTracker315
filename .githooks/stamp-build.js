// feat 53 — stamp the build number (commit count) + a full timestamp into the
// single APP_BUILD constant in gym-tracker.html. Invoked by .githooks/pre-commit
// on every commit; also safe to run manually:  node .githooks/stamp-build.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'gym-tracker.html');
if (!fs.existsSync(file)) process.exit(0);

let count = 0;
try {
  count = parseInt(execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 10) || 0;
} catch (e) { /* no commits yet → count stays 0 */ }
const build = count + 1; // the number this commit will become

const d = new Date();
const p = n => String(n).padStart(2, '0');
const ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
const stamp = `build ${build} · ${ts}`; // · = "·"

const html = fs.readFileSync(file, 'utf8');
const re = /(const APP_BUILD = ')[^']*(';)/;
if (!re.test(html)) { console.error('stamp-build: APP_BUILD line not found — skipping'); process.exit(0); }
const next = html.replace(re, `$1${stamp}$2`);
if (next !== html) { fs.writeFileSync(file, next); console.log('stamp-build: ' + stamp); }
