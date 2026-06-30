// feat 391 — lower-body workouts of "inventive cruelty": creative, brutal leg protocols. Each must seed, be intensity 5,
// satisfiable, and read as a lower-body (Legs) session.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const CRUEL = ['seed-cruel-widowmaker', 'seed-cruel-tempo', 'seed-cruel-unilateral', 'seed-cruel-dropset'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof planCategory === 'function' && typeof cloneSeedPlan === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 391 — the cruel leg plans exist, seed, are intensity 5, and read as lower-body', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    return ids.map(id => {
      const sp = SEED_PLANS.find(p => p.id === id);
      const p = sp ? cloneSeedPlan(sp) : null;
      return { id, inSeed: !!sp, seeded: !!state.plans.find(x => x.id === id), intensity: sp && sp.intensity, cat: p && planCategory(p) };
    });
  }, CRUEL);
  r.forEach(x => {
    expect(x.inSeed, `${x.id} missing`).toBe(true);
    expect(x.seeded, `${x.id} not seeded`).toBe(true);
    expect(x.intensity, `${x.id} intensity`).toBe(5);
    expect(['Legs', 'Lower', 'Full Body', 'Mixed'], `${x.id} category (${x.cat})`).toContain(x.cat);
  });
});

test('feat 391 — every step (incl. the muscle-targeted ones) is satisfiable', async ({ page }) => {
  const bad = await page.evaluate((ids) => {
    const out = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); (p.steps || []).forEach((st, i) => { if (!stepQualifyingVarSet(st).size) out.push(`${id} step ${i}`); }); });
    return out;
  }, CRUEL);
  expect(bad, `unsatisfiable: ${bad.join(', ')}`).toEqual([]);
});

test('feat 391 — the widowmaker is a single brutal set; no duplicate ids/names', async ({ page }) => {
  const r = await page.evaluate(() => {
    const w = SEED_PLANS.find(p => p.id === 'seed-cruel-widowmaker');
    const ids = {}, names = {}, dupId = [], dupName = [];
    SEED_PLANS.forEach(p => { if (ids[p.id]) dupId.push(p.id); else ids[p.id] = 1; const n = (p.name || '').toLowerCase(); if (names[n]) dupName.push(p.name); else names[n] = 1; });
    return { firstSets: w.steps[0].sets, dupId, dupName };
  });
  expect(r.firstSets).toBe(1);   // the 20-rep widowmaker is one set
  expect(r.dupId).toEqual([]);
  expect(r.dupName).toEqual([]);
});
