// English-safety snapshot for the translation work (house standard 20). It renders every page in
// English with seeded data, a pinned clock and a pinned time zone, and records the text and the
// title / aria-label / placeholder / alt attributes. Run it before and after a translation change;
// the two outputs must match exactly.
//   node tools/en-snapshot.mjs <out.json> [baseUrl]     (start the server first: node test/serve.mjs 4321)
//   node tools/en-snapshot.mjs --diff a.json b.json
import { chromium } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';

if (process.argv[2] === '--diff') {
  const a = JSON.parse(readFileSync(process.argv[3], 'utf8')), b = JSON.parse(readFileSync(process.argv[4], 'utf8'));
  let bad = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    bad++;
    const la = (a[k] || []), lb = (b[k] || []);
    const onlyA = la.filter((x) => !lb.includes(x)), onlyB = lb.filter((x) => !la.includes(x));
    console.log(`✘ ${k}`); onlyA.slice(0, 8).forEach((x) => console.log('   - ' + x.slice(0, 160))); onlyB.slice(0, 8).forEach((x) => console.log('   + ' + x.slice(0, 160)));
  }
  console.log(bad ? `${bad} screen(s) differ` : `✓ all ${Object.keys(a).length} screens identical`);
  process.exit(bad ? 1 : 0);
}

const out = process.argv[2], base = process.argv[3] || 'http://127.0.0.1:4321';
if (!out) { console.error('usage: node tools/en-snapshot.mjs <out.json> [baseUrl]'); process.exit(2); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'en-US', timezoneId: 'America/Toronto', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date('2026-06-15T10:00:00-04:00'));
await page.addInitScript(() => { Math.random = (() => { let s = 42; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); });
await page.goto(base + '/gym-tracker.html', { waitUntil: 'load' });
await page.waitForFunction(() => typeof navTo === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 20000 });

// a few weeks of training, body measurements and wearable nights, so the data screens have content
await page.evaluate(() => {
  const vs = []; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') vs.push(u); if (vs.length >= 6) break; }
  state.sessions = [];
  for (let d = 1; d <= 40; d += 2) {
    const day = new Date(2026, 4, 6 + d, 18), end = new Date(day.getTime() + 3600e3);
    state.sessions.push({ id: 's' + d, date: day.toISOString(), endedAt: end.toISOString(),
      exercises: vs.slice(d % 3, d % 3 + 3).map((v, i) => ({ varUuid: v, subUuid: null, sets: [{ w: 100 + d + i * 10, r: 8 }, { w: 105 + d + i * 10, r: 6 }] })) });
  }
  state.bodyComp = [{ date: '2026-06-01', weightKg: 82, bodyFatPct: 18 }, { date: '2026-06-14', weightKg: 81.4, bodyFatPct: 17.6 }];
  const rec = []; for (let d = 2; d <= 15; d++) rec.push({ date: `2026-06-${String(d).padStart(2, '0')}`, sleepScore: 70 + d, sleepMin: 400 + d * 3, hrv: 55 + d, bedtime: '23:30', wakeTime: '06:45' });
  importBiometrics(JSON.stringify({ recovery: rec }), { silent: true });
  saveState();
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof navTo === 'function' && VAR_INDEX.size > 0, null, { timeout: 20000 });

const grab = () => page.evaluate(() => {
  const lines = [];
  const vis = (el) => el.getClientRects().length > 0;
  const toast = document.getElementById('trk-toast'); if (toast) toast.textContent = ''; // timer-driven, not a screen's content
  const txt = (document.body.innerText || '').split('\n').map((s) => s.trim()).filter((s) => s && !/^Build [A-Z][a-z]{2} \d/.test(s)); // the build stamp is the file's own time
  lines.push(...txt);
  document.querySelectorAll('[title],[aria-label],[placeholder],img[alt]').forEach((el) => {
    if (!vis(el)) return;
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v) lines.push(`@${a}=${v}`); }
  });
  return lines;
});
const snap = {};
const ids = await page.evaluate(() => Object.keys(PAGES));
for (const id of ids) {
  await page.evaluate((id) => { try { navTo(id); } catch (e) { /* page needs context */ } }, id);
  await page.waitForTimeout(250);
  snap['page:' + id] = await grab();
}
// the settings drawer and the overlays the top bar opens
for (const [name, fn] of [['drawer', 'openSettingsDrawer'], ['help', 'openHelp'], ['glossary', 'openGloss'], ['navtree', 'openNavTree']]) {
  await page.evaluate(() => navTo('home'));
  await page.evaluate((fn) => { try { window[fn] && window[fn](); } catch (e) {} }, fn);
  await page.waitForTimeout(300);
  snap['overlay:' + name] = await grab();
}
await browser.close();
writeFileSync(out, JSON.stringify(snap, null, 1));
console.log(`wrote ${Object.keys(snap).length} screens, ${Object.values(snap).reduce((n, l) => n + l.length, 0)} lines -> ${out}`);
