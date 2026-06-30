// feat 390 — jump-rope plans + "broad-to-specific" plans that mix MOVEMENT steps with MUSCLE / head / regex steps.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const ROPE = ['seed-rope-conditioning', 'seed-rope-iron-hybrid'];
const MIX = ['seed-mix-push-funnel', 'seed-mix-pull-hunt', 'seed-mix-arms-zoom', 'seed-mix-legs-sweep'];
const ALL = [...ROPE, ...MIX];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof planCategory === 'function' && typeof estimatePlanMinutes === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 390 — the new plans exist, seed, and every step (incl. muscle/regex) is satisfiable', async ({ page }) => {
  const r = await page.evaluate((all) => {
    normalizeState();
    const bad = [];
    all.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); if (!p) { bad.push(id + ' MISSING'); return; } (p.steps || []).forEach((st, i) => { if (!stepQualifyingVarSet(st).size) bad.push(`${id} step ${i} (${st.options.map(o => o.type).join('/')})`); }); });
    return { bad, seeded: all.map(id => !!state.plans.find(p => p.id === id)) };
  }, ALL);
  expect(r.bad, `unsatisfiable: ${r.bad.join(', ')}`).toEqual([]);
  r.seeded.forEach((s, i) => expect(s, `${ALL[i]} not seeded`).toBe(true));
});

test('feat 390 — the rope plans are built from the jump-rope family', async ({ page }) => {
  const r = await page.evaluate((rope) => rope.map(id => {
    const p = SEED_PLANS.find(x => x.id === id);
    const ropeSteps = (p.steps || []).filter(st => (st.options || []).some(o => o.type === 'movement' && o.familyId === 'jump-rope-skills')).length;
    return { id, ropeSteps, cat: planCategory(p) };
  }), ROPE);
  r.forEach(x => expect(x.ropeSteps, `${x.id} rope steps`).toBeGreaterThanOrEqual(2));
});

test('feat 390 — the mix plans genuinely mix movement + muscle (and one uses a regex)', async ({ page }) => {
  const r = await page.evaluate((mix) => mix.map(id => {
    const p = SEED_PLANS.find(x => x.id === id);
    const types = new Set();
    (p.steps || []).forEach(st => (st.options || []).forEach(o => types.add(o.type)));
    return { id, types: [...types], cat: planCategory(p), mins: estimatePlanMinutes(p) };
  }), MIX);
  r.forEach(x => {
    expect(x.types).toContain('movement');   // broad
    expect(x.types).toContain('muscle');     // specific
    expect(x.mins).toBeGreaterThan(0);       // estimation doesn't choke on the new option types
    expect(typeof x.cat).toBe('string');     // categorisation doesn't choke either
  });
  // the arms plan shows off the regex wildcard
  expect(r.find(x => x.id === 'seed-mix-arms-zoom').types).toContain('regex');
});

test('feat 390 — no duplicate plan ids or names introduced', async ({ page }) => {
  const dupes = await page.evaluate(() => {
    const ids = {}, names = {}, dupId = [], dupName = [];
    SEED_PLANS.forEach(p => { if (ids[p.id]) dupId.push(p.id); else ids[p.id] = 1; const n = (p.name || '').toLowerCase(); if (names[n]) dupName.push(p.name); else names[n] = 1; });
    return { dupId, dupName };
  });
  expect(dupes.dupId).toEqual([]);
  expect(dupes.dupName).toEqual([]);
});
