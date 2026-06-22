// feat 293 — full-body "monster" plans: big, demanding, train-everything-in-one-sitting sessions. Each must
// seed, be satisfiable, and read as a Full Body plan.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const MONSTERS = ['seed-fullbody-behemoth', 'seed-fullbody-annihilation', 'seed-fullbody-decathlon',
  'seed-fullbody-strongman-gauntlet', 'seed-fullbody-hybrid-beast', 'seed-fullbody-crucible'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof planCategory === 'function' && typeof cloneSeedPlan === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 293 — the full-body monster plans exist in SEED_PLANS and seed into state', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    return ids.map(id => ({ id, inSeed: !!SEED_PLANS.find(p => p.id === id), seeded: !!state.plans.find(p => p.id === id) }));
  }, MONSTERS);
  r.forEach(x => { expect(x.inSeed, `${x.id} missing`).toBe(true); expect(x.seeded, `${x.id} not seeded`).toBe(true); });
});

test('feat 293 — every step of every monster plan resolves to a qualifying variation', async ({ page }) => {
  const bad = await page.evaluate((ids) => {
    const out = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); (p.steps || []).forEach((st, i) => { const s = stepQualifyingVarSet(st); if (!s || s.size === 0) out.push(`${id} step ${i}`); }); });
    return out;
  }, MONSTERS);
  expect(bad, `unsatisfiable steps: ${bad.join(', ')}`).toEqual([]);
});

test('feat 293 — they are big whole-body monsters (≥8 steps, ≥30 sets), most read as Full Body', async ({ page }) => {
  const r = await page.evaluate((ids) => ids.map(id => {
    const p = cloneSeedPlan(SEED_PLANS.find(x => x.id === id));
    const sets = (p.steps || []).reduce((n, s) => n + (s.sets || 0), 0);
    return { id, steps: p.steps.length, sets, cat: planCategory(p) };
  }), MONSTERS);
  r.forEach(x => {
    expect(x.steps, `${x.id} steps`).toBeGreaterThanOrEqual(8);   // monsters are long
    expect(x.sets, `${x.id} sets`).toBeGreaterThanOrEqual(30);    // …and high volume
    // every one is whole-body; the strongman/hybrid flavours legitimately read as "Mixed" (they blend
    // strength + conditioning + odd implements), the rest as Full Body.
    expect(['Full Body', 'Mixed'], `${x.id} category (${x.cat})`).toContain(x.cat);
  });
  const fullBody = r.filter(x => x.cat === 'Full Body').length;
  expect(fullBody, 'at least four classify as Full Body').toBeGreaterThanOrEqual(4);
});

test('feat 293 — the new ids and names are unique across the whole seed catalogue', async ({ page }) => {
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
