// feat 258 — prison / cell bodyweight plans: zero equipment, a few square feet. Four varied templates
// (circuit, bodyweight strength, zero-impact isometrics, conditioning ladder). Every step must resolve to at
// least one qualifying variation (a step that points at a missing family/variation would be unsatisfiable),
// and the plans must seed additively for existing users.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const PLAN_IDS = ['seed-cell-circuit', 'seed-yard-strength', 'seed-quiet-cell', 'seed-burpee-ladder'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof normalizeState === 'function' && typeof exMode === 'function', null, { timeout: 15000 });
});

test('feat 258 — the four cell/prison bodyweight plans exist in the seed catalogue', async ({ page }) => {
  const r = await page.evaluate((ids) => ids.map(id => {
    const p = SEED_PLANS.find(s => s.id === id);
    return p ? { id, name: p.name, intensity: p.intensity, steps: p.steps.length } : { id, missing: true };
  }), PLAN_IDS);
  expect(r.find(p => p.id === 'seed-cell-circuit').name).toBe('Cellblock Circuit');
  expect(r.find(p => p.id === 'seed-yard-strength').name).toContain('Yard');
  expect(r.find(p => p.id === 'seed-quiet-cell').name).toContain('Quiet Cell');
  expect(r.find(p => p.id === 'seed-burpee-ladder').name).toBe('Burpee Ladder');
  r.forEach(p => { expect(p.missing).toBeUndefined(); expect(p.steps).toBeGreaterThanOrEqual(5); expect(p.intensity).toBeGreaterThanOrEqual(1); expect(p.intensity).toBeLessThanOrEqual(5); });
});

test('feat 258 — every step of every plan resolves to at least one qualifying variation', async ({ page }) => {
  const r = await page.evaluate((ids) => ids.map(id => {
    const p = SEED_PLANS.find(s => s.id === id);
    const counts = p.steps.map(st => { const set = stepQualifyingVarSet(st); return set ? set.size : 0; });
    return { id, counts, allSatisfiable: counts.every(c => c > 0) };
  }), PLAN_IDS);
  r.forEach(p => expect(p.allSatisfiable, `${p.id} has an unsatisfiable step: ${JSON.stringify(p.counts)}`).toBe(true));
});

test('feat 258 — the plans seed additively into a fresh user state', async ({ page }) => {
  const seeded = await page.evaluate((ids) => {
    // simulate an existing user who has never seen these ids
    state.plans = []; state.seededPlanIds = [];
    normalizeState();
    return ids.map(id => !!state.plans.find(p => p.id === id));
  }, PLAN_IDS);
  expect(seeded).toEqual([true, true, true, true]);
});

test('feat 258 — the quiet-cell plan leans on timed isometric holds (surfaces the hold timer)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const p = SEED_PLANS.find(s => s.id === 'seed-quiet-cell');
    // count steps whose option set includes a timed (Seconds) variation — wall sit + plank are pinned
    let timedSteps = 0;
    p.steps.forEach(st => { const set = stepQualifyingVarSet(st); for (const u of (set || [])) { if (exMode(u).mode === 'time') { timedSteps++; break; } } });
    return { timedSteps };
  });
  expect(r.timedSteps).toBeGreaterThanOrEqual(2); // wall sit + plank at minimum
});

test('feat 258 — the cell circuit centres on bodyweight push-ups + burpees (no equipment)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const p = SEED_PLANS.find(s => s.id === 'seed-cell-circuit');
    const pushSet = stepQualifyingVarSet(p.steps[0]); // step 1 = push-ups family
    const hasPushUp = [...pushSet].some(u => { const fi = VAR_INDEX.get(u); return /push-?up/i.test((fi.variation.title || '')); });
    const burpeeUuid = '7483a88e-9369-4751-a0d2-97727a6c6c97';
    const hasBurpee = p.steps.some(st => stepQualifyingVarSet(st).has(burpeeUuid));
    return { hasPushUp, hasBurpee };
  });
  expect(r.hasPushUp).toBe(true);
  expect(r.hasBurpee).toBe(true);
});
