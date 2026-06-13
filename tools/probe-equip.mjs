// Reusable audit (feat 223) — flag variations whose resolved setup tool (autoSetupKind) contradicts the
// implement named in their OWN text (cue/setup/movement/tip). The Arnold-Press class of bug: a name with
// no equipment word falls through to the family's first-listed equipment (barbell) on a dumbbell lift.
// Run after adding/editing content: `node tools/probe-equip.mjs` should print "total flagged: 0".
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const srv = spawn(process.execPath, ['test/serve.mjs', '4329'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4329/gym-tracker.html', { waitUntil: 'load' });
await page.waitForFunction(() => typeof FAMILIES !== 'undefined' && typeof autoSetupKind === 'function', null, { timeout: 15000 });
const rows = await page.evaluate(() => {
  const out = [];
  FAMILIES.forEach(f => (f.variations || []).forEach(v => {
    const kind = autoSetupKind(v.uuid);
    const own = [v.cue, v.tip, ...(v.setup || []), ...(v.movement || []), ...(v.mistakes || [])].filter(Boolean).join(' ');
    const t = (own).toLowerCase(), titleLc = (v.title || '').toLowerCase();
    const saysDb = /dumbbell|\bdbs?\b/.test(t), saysKb = /kettlebell|\bkb\b/.test(t);
    const flags = [];
    if (kind === 'barbell' && saysDb && !/barbell|\bbar\b/.test(titleLc)) flags.push('barbell loader but text says DB');
    if (kind === 'barbell' && saysKb && !/barbell|\bbar\b/.test(titleLc + ' ' + t)) flags.push('barbell loader but text says KB');
    if (kind === 'dumbbell' && /barbell/.test(t) && !saysDb && !/dumbbell/.test(titleLc)) flags.push('dumbbell loader but text says barbell');
    if (flags.length) out.push({ fam: f.id, id: v.id, title: v.title, kind, flags, own: own.slice(0, 100) });
  }));
  return out;
});
rows.forEach(r => console.log(`[${r.kind}] ${r.fam} :: ${r.title} (${r.id}) — ${r.flags.join('; ')}\n    "${r.own}"`));
console.log('\ntotal flagged:', rows.length);
await browser.close();
srv.kill();
process.exit(0);
