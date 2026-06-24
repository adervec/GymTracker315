// feat 356 — historical-warrior-archetype seed plans: strength & conditioning templates themed on the physical
// training of classic warrior types (Spartan, Roman legionary, knight, samurai, Norse raider, Mongol horse archer,
// gladiator, shinobi, longbow archer, Celt, Persian Immortal, Amazon). Each must be well-formed + reference real families.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const WARRIORS = ['spartan', 'legionary', 'knight', 'samurai', 'viking', 'mongol', 'gladiator', 'ninja', 'archer',
  'celt', 'immortal', 'amazon'].map(w => 'seed-warrior-' + w);

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof FAMILIES !== 'undefined', null, { timeout: 15000 });
});

test('all 12 warrior plans exist, are well-formed, and reference only real families', async ({ page }) => {
  const r = await page.evaluate((WARRIORS) => {
    const famIds = new Set(FAMILIES.map(f => f.id));
    const out = { missing: [], badIntensity: [], emptySteps: [], badFamilies: [] };
    WARRIORS.forEach(id => {
      const p = SEED_PLANS.find(x => x.id === id);
      if (!p) { out.missing.push(id); return; }
      if (!(p.intensity >= 1 && p.intensity <= 5)) out.badIntensity.push(id);
      if (!(p.steps && p.steps.length)) { out.emptySteps.push(id); return; }
      p.steps.forEach((st, i) => {
        if (!(st.options && st.options.length)) out.emptySteps.push(id + ':step' + i);
        (st.options || []).forEach(o => { if (o.type === 'movement' && !famIds.has(o.familyId)) out.badFamilies.push(id + ':' + o.familyId); });
      });
    });
    return out;
  }, WARRIORS);
  expect(r.missing).toEqual([]);
  expect(r.badIntensity).toEqual([]);
  expect(r.emptySteps).toEqual([]);
  expect(r.badFamilies).toEqual([]);
});

test('warrior plan ids are unique within SEED_PLANS (no collisions introduced)', async ({ page }) => {
  const dupes = await page.evaluate(() => { const ids = SEED_PLANS.map(p => p.id); return ids.length - new Set(ids).size; });
  expect(dupes).toBe(0);
});

test('every warrior plan is runnable and themed (Spartan leans on legs + carries)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const famHas = id => { const f = FAMILIES.find(x => x.id === id); return !!(f && (f.variations || []).length > 0); };
    const ws = SEED_PLANS.filter(p => p.id.indexOf('seed-warrior-') === 0);
    const runnable = ws.every(p => p.steps.every(st => (st.options || []).some(o => famHas(o.familyId))));
    const sp = SEED_PLANS.find(p => p.id === 'seed-warrior-spartan');
    const fams = sp.steps.flatMap(st => (st.options || []).map(o => o.familyId));
    return { count: ws.length, runnable, spName: sp.name, hasSquat: fams.includes('squat'), hasCarries: fams.includes('loaded-carries') };
  });
  expect(r.count).toBe(12);
  expect(r.runnable).toBe(true);
  expect(r.spName).toContain('Spartan');
  expect(r.hasSquat).toBe(true);
  expect(r.hasCarries).toBe(true);
});
