// feat 298 — bring up NEGLECTED areas: seven plans that finally feature movements no plan touched (Roman chair,
// CrossFit moves, TRX, specialty bars, pin lifts, mace/club & specialty implements, cable attachments) plus the
// lower-leg / joint prehab family (tibialis, ATG, adductor, neck).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const NEW_PLANS = ['seed-core-fortress', 'seed-functional-throwdown', 'seed-trx-total-body', 'seed-specialty-bar-power',
  'seed-mace-club-flow', 'seed-bulletproof-joints', 'seed-cable-sculpt'];
// Families that had ZERO plan coverage before feat 298 — each must now be featured.
const RESCUED = ['roman-chair', 'crossfit-moves', 'trx-work', 'specialty-bars', 'pin-lifts', 'mace-club-work', 'specialty-implements', 'cable-attachments'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 298 — the seven neglected-area plans exist in SEED_PLANS and seed into state', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    return ids.map(id => ({ id, inSeed: !!SEED_PLANS.find(p => p.id === id), seeded: !!state.plans.find(p => p.id === id) }));
  }, NEW_PLANS);
  r.forEach(x => { expect(x.inSeed, `${x.id} missing`).toBe(true); expect(x.seeded, `${x.id} not seeded`).toBe(true); });
});

test('feat 298 — every step of every new plan resolves to a qualifying variation', async ({ page }) => {
  const bad = await page.evaluate((ids) => {
    const out = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); (p.steps || []).forEach((st, i) => { const s = stepQualifyingVarSet(st); if (!s || s.size === 0) out.push(`${id} step ${i}`); }); });
    return out;
  }, NEW_PLANS);
  expect(bad, `unsatisfiable steps: ${bad.join(', ')}`).toEqual([]);
});

test('feat 298 — the once-zero-coverage families now appear in at least one plan step', async ({ page }) => {
  const counts = await page.evaluate((fams) => {
    const out = {};
    fams.forEach(m => {
      out[m] = SEED_PLANS.reduce((n, p) => n + (p.steps || []).filter(st =>
        (st.options || []).some(o => o.type === 'movement' && o.familyId === m)).length, 0);
    });
    return out;
  }, RESCUED);
  RESCUED.forEach(m => expect(counts[m], `${m} still has no plan coverage`).toBeGreaterThanOrEqual(1));
});

test('feat 298 — the catalogue still has no duplicate plan ids or names', async ({ page }) => {
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
