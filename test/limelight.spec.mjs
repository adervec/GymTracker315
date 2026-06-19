// feat 280 — limelight for under-represented movements: three master-crafted plans (Complete Chest,
// Delt Sculpt, Power Athlete) that feature movements the catalogue previously under-used — decline bench,
// front raise, pullover, rotator cuff, Olympic lifts, strongman, medicine ball, gymnastics core, grip.
// Guards: the new plans seed, every step is satisfiable, the once-starved movements now have ≥1 step, and
// the whole seed catalogue stays free of duplicate ids/names.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const NEW_PLANS = ['seed-chest-complete', 'seed-delt-sculpt', 'seed-power-athlete'];
// Movements that had ZERO plan coverage before feat 280 — each must now be featured.
const RESCUED = ['decline-bench-press', 'front-raise', 'gymnastics-core'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 280 — the three limelight plans exist in SEED_PLANS and seed into state', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    return ids.map(id => ({ id, inSeed: !!SEED_PLANS.find(p => p.id === id), seeded: !!state.plans.find(p => p.id === id) }));
  }, NEW_PLANS);
  r.forEach(x => {
    expect(x.inSeed, `${x.id} missing from SEED_PLANS`).toBe(true);
    expect(x.seeded, `${x.id} did not seed into state`).toBe(true);
  });
});

test('feat 280 — every step of the new plans resolves to at least one qualifying variation', async ({ page }) => {
  const bad = await page.evaluate((ids) => {
    const out = [];
    ids.forEach(id => {
      const p = SEED_PLANS.find(x => x.id === id);
      (p.steps || []).forEach((st, i) => { const s = stepQualifyingVarSet(st); if (!s || s.size === 0) out.push(`${id} step ${i}`); });
    });
    return out;
  }, NEW_PLANS);
  expect(bad, `unsatisfiable steps: ${bad.join(', ')}`).toEqual([]);
});

test('feat 280 — the once-starved movements now appear in at least one seed plan step', async ({ page }) => {
  const counts = await page.evaluate((movs) => {
    const out = {};
    movs.forEach(m => {
      out[m] = SEED_PLANS.reduce((n, p) => n + (p.steps || []).filter(st =>
        (st.options || []).some(o => o.type === 'movement' && o.familyId === m)).length, 0);
    });
    return out;
  }, RESCUED);
  RESCUED.forEach(m => expect(counts[m], `${m} still has no plan coverage`).toBeGreaterThanOrEqual(1));
});

test('feat 280 — the seed catalogue has no duplicate plan ids or names', async ({ page }) => {
  const dupes = await page.evaluate(() => {
    const ids = {}, names = {}, dupId = [], dupName = [];
    SEED_PLANS.forEach(p => {
      if (ids[p.id]) dupId.push(p.id); else ids[p.id] = 1;
      const n = (p.name || '').toLowerCase();
      if (names[n]) dupName.push(p.name); else names[n] = 1;
    });
    return { dupId, dupName };
  });
  expect(dupes.dupId, `duplicate plan ids: ${dupes.dupId.join(', ')}`).toEqual([]);
  expect(dupes.dupName, `duplicate plan names: ${dupes.dupName.join(', ')}`).toEqual([]);
});
