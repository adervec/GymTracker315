// Zero-dependency static checks for gym-tracker.html (and the Python helpers).
// Fast (~1s), no browser, no npm deps -- runs in CI and (optionally) the
// pre-commit hook. Catches the class of bug that has actually bitten this repo:
// a stray token that breaks the whole inline <script> at parse time.
//
//   node test/check.mjs            -> exits 0 if all checks pass, 1 otherwise
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(join(root, 'gym-tracker.html'), 'utf8');
// The embedded /Guides live in an inert, marker-delimited block (feat 91) near the end of
// the file, after every app <script>. Strip that block so the guides' own scripts/styles
// aren't checked as app code (app line numbers are unaffected since the block comes last).
const appHtml = html.replace(/<!-- GUIDES:START[\s\S]*?GUIDES:END -->/g, '');

let checks = 0, fails = 0;
const ok = (m) => { checks++; console.log('  ✓ ' + m); };
const bad = (m) => { checks++; fails++; console.log('  ✗ ' + m); };
const section = (t) => console.log('\n' + t);

// ---- Extract inline <script> blocks (the app is a single self-contained file) ----
const scripts = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(appHtml))) {
  if (/\bsrc\s*=/i.test(m[1])) continue; // external script -- flagged separately below
  const line = appHtml.slice(0, m.index).split('\n').length;
  scripts.push({ code: m[2], line });
}
console.log(`gym-tracker.html: ${(html.length / 1024 / 1024).toFixed(2)} MB, ${scripts.length} inline app <script> block(s) (excl. embedded guides)`);

// ---- 1. Syntax: every inline block must parse ----
section('Syntax');
if (!scripts.length) bad('no inline <script> blocks found (unexpected)');
for (let i = 0; i < scripts.length; i++) {
  const s = scripts[i];
  try {
    new vm.Script(s.code, { filename: `gym-tracker.html:inline#${i + 1}@L${s.line}` });
    ok(`inline script #${i + 1} (line ${s.line}, ${s.code.split('\n').length} lines) parses`);
  } catch (e) {
    bad(`inline script #${i + 1} (line ${s.line}) SYNTAX ERROR -> ${e.message}`);
  }
}

// ---- 2. Lint (on comment-stripped code so commented mentions don't false-trip) ----
section('Lint');
const allCode = scripts.map(s => s.code).join('\n;\n');
const noComments = allCode
  .replace(/\/\*[\s\S]*?\*\//g, ' ')            // block comments
  .replace(/([^:"'`\\])\/\/[^\n]*/g, '$1');     // line comments (leave URLs like https:// intact)

const nativeDialogs = noComments.match(/\b(?:window\s*\.\s*)?(confirm|alert|prompt)\s*\(/g);
if (nativeDialogs) bad(`native dialog call(s) found -- use the themed choiceDialog/confirmDialog/promptDialog instead: ${[...new Set(nativeDialogs.map(s => s.trim()))].join(', ')}`);
else ok('no native confirm()/alert()/prompt() calls');

if (/\bdebugger\b/.test(noComments)) bad('debugger statement present'); else ok('no debugger statements');

if (/<script\b[^>]*\bsrc\s*=/i.test(appHtml)) bad('external <script src=...> present -- keep the app single-file'); else ok('no external <script src> (single-file preserved)');

// ---- 3. Build stamp: APP_BUILD must exist and be well-formed (the pre-commit hook writes it) ----
section('Build stamp');
const bm = html.match(/const APP_BUILD = '([^']*)';/);
if (bm && /^build \d+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(bm[1])) ok(`APP_BUILD well-formed -> "${bm[1]}"`);
else bad(`APP_BUILD missing or malformed -> ${bm ? '"' + bm[1] + '"' : '(not found)'}`);

// ---- 4. Critical functions still defined (cheap rename/deletion guard) ----
section('Critical functions defined');
const MUST = [
  'normalizeState', 'saveState', 'loadState', 'render', 'parseMediaUrl', 'estimated1RM',
  'lbToKg', 'kgToLb', 'autoLoadSupported', 'solveSetupState', 'autoSetupKind', 'setupTotal',
  'estimatePlanMinutes', 'intensityDots', 'importStravaActivities', 'stravaLoadNow',
  'bioLoadNow', 'choiceDialog', 'confirmDialog', 'promptDialog', 'switchPanel',
];
for (const name of MUST) {
  const declared = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).test(allCode)
    || new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?(?:function|\\()`).test(allCode);
  if (declared) ok(`${name}()`); else bad(`${name}() NOT found (renamed or removed?)`);
}

// ---- 5. Python helper scripts must compile ----
section('Python helper scripts');
const pybin = ['python3', 'python', 'py'].find((bin) => {
  try { return spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0; } catch { return false; }
});
const tools = ['tools/strava-sync.py', 'tools/garmin-sync.py', 'tools/youtube-media.py'];
if (!pybin) {
  console.log('  ! no python interpreter on PATH -- skipping py_compile (JS checks still gate)');
} else {
  for (const t of tools) {
    const r = spawnSync(pybin, ['-m', 'py_compile', join(root, t)], { encoding: 'utf8' });
    if (r.status === 0) ok(`${t} compiles`);
    else bad(`${t} FAILED py_compile -> ${((r.stderr || '').trim().split('\n').pop()) || 'unknown error'}`);
  }
}

// ---- Summary ----
console.log(`\n${fails ? '✗ FAIL' : '✓ PASS'}: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
