// feat 305 — Diamond Gym style workouts: a tranche of old-school hardcore powerbuilding plans (heavy barbell
// basics up front, brutal back-off volume + accessories). Additively seeded like every other SEED_PLANS tranche.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const DIAMOND = ['seed-diamond-chest-back', 'seed-diamond-legs', 'seed-diamond-delts-arms',
  'seed-diamond-powerbuild-upper', 'seed-diamond-powerbuild-lower', 'seed-diamond-heavy-duty'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('the Diamond Gym plans exist in SEED_PLANS and seed into state', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    return ids.map(id => { const p = SEED_PLANS.find(x => x.id === id); return { id, inSeed: !!p, seeded: !!state.plans.find(q => q.id === id), name: p && p.name, intensity: p && p.intensity, steps: p && (p.steps || []).length }; });
  }, DIAMOND);
  r.forEach(x => {
    expect(x.inSeed, `${x.id} missing`).toBe(true);
    expect(x.seeded, `${x.id} not seeded`).toBe(true);
    expect(x.name).toMatch(/Diamond Gym/);
    expect(x.intensity).toBeGreaterThanOrEqual(4);   // hardcore = high intensity
    expect(x.steps).toBeGreaterThanOrEqual(5);
  });
});

test('every step of every Diamond Gym plan resolves to a qualifying variation', async ({ page }) => {
  const bad = await page.evaluate((ids) => {
    const out = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); (p.steps || []).forEach((st, i) => { const s = stepQualifyingVarSet(st); if (!s || s.size === 0) out.push(`${id} step ${i}`); }); });
    return out;
  }, DIAMOND);
  expect(bad, `unsatisfiable steps: ${bad.join(', ')}`).toEqual([]);
});

test('the Diamond Gym plans lead with a heavy barbell compound', async ({ page }) => {
  const r = await page.evaluate((ids) => ids.map(id => {
    const p = SEED_PLANS.find(x => x.id === id);
    const first = p.steps[0];
    return { id, firstLoad: first.load, firstIsCompound: (first.options || []).some(o => /squat|deadlift|bench|press|row/.test(o.familyId || '')) };
  }), DIAMOND);
  r.forEach(x => { expect(x.firstLoad, `${x.id} doesn't open heavy`).toBe('heavy'); expect(x.firstIsCompound, `${x.id} doesn't open on a compound`).toBe(true); });
});

test('the catalogue still has no duplicate plan ids or names', async ({ page }) => {
  const dupes = await page.evaluate(() => {
    const ids = {}, names = {}, dupId = [], dupName = [];
    SEED_PLANS.forEach(p => {
      if (ids[p.id]) dupId.push(p.id); else ids[p.id] = 1;
      const n = (p.name || '').toLowerCase(); if (names[n]) dupName.push(p.name); else names[n] = 1;
    });
    return { dupId, dupName };
  });
  expect(dupes.dupId, `dup ids: ${dupes.dupId.join(', ')}`).toEqual([]);
  expect(dupes.dupName, `dup names: ${dupes.dupName.join(', ')}`).toEqual([]);
});
