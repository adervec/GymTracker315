// feat 176 — the detailed plan-execution view shows an ADVISORY suggested rest between each step, scaled by
// the heavier of the two adjacent steps' loads. It's a guide only: the plan tracks no order, so nothing is
// ever measured against it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof suggestedStepRestRange === 'function' && typeof renderPlanExecutionView === 'function', null, { timeout: 15000 });
});

test('suggested rest scales with the heavier adjacent load', async ({ page }) => {
  const r = await page.evaluate(() => ({
    heavy: suggestedStepRestRange({ load: 'heavy' }, { load: 'light' }).minSec,    // max(heavy,light) → heavy
    moderate: suggestedStepRestRange({ load: 'moderate' }, { load: 'moderate' }).minSec,
    light: suggestedStepRestRange({ load: 'light' }, { load: 'light' }).minSec,
  }));
  expect(r.heavy).toBeGreaterThan(r.moderate);
  expect(r.moderate).toBeGreaterThan(r.light);
});

test('the execution view interleaves a suggested-rest divider between steps (one fewer than steps)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let squat = null, bench = null, dead = null;
    for (const [u, i] of VAR_INDEX) {
      if (!squat && i.family.id === 'squat') squat = u;
      if (!bench && i.family.id === 'flat-bench-press') bench = u;
      if (!dead && i.family.id === 'deadlift') dead = u;
    }
    state.plans = [{ id: 'P', name: 'Rest Plan', steps: [
      { id: 'a', sets: 3, load: 'heavy', options: [{ type: 'movement', familyId: 'squat' }] },
      { id: 'b', sets: 3, load: 'moderate', options: [{ type: 'movement', familyId: 'flat-bench-press' }] },
      { id: 'c', sets: 3, load: 'light', options: [{ type: 'movement', familyId: 'deadlift' }] },
    ] }];
    const sess = { id: 'S', date: '2026-06-05T10:00:00Z', endedAt: '2026-06-05T11:00:00Z', planId: 'P', planRev: 1, exercises: [] };
    state.sessions = [sess];
    const body = document.createElement('div');
    renderPlanExecutionView(body, state.plans[0], sess);
    const dividers = body.querySelectorAll('.pexec-step-rest').length;
    const steps = body.querySelectorAll('.pexec-step').length;
    return { dividers, steps, html: body.innerHTML };
  });
  expect(r.steps).toBe(3);
  expect(r.dividers).toBe(2);                  // between 3 steps → 2 dividers
  expect(r.html).toMatch(/suggested rest/);
});

test('a single-step plan shows no divider', async ({ page }) => {
  const n = await page.evaluate(() => {
    let squat = null; for (const [u, i] of VAR_INDEX) { if (i.family.id === 'squat') { squat = u; break; } }
    state.plans = [{ id: 'Q', name: 'One', steps: [{ id: 'a', sets: 3, load: 'heavy', options: [{ type: 'movement', familyId: 'squat' }] }] }];
    const sess = { id: 'S2', date: '2026-06-06T10:00:00Z', endedAt: '2026-06-06T10:30:00Z', planId: 'Q', planRev: 1, exercises: [] };
    state.sessions = [sess];
    const body = document.createElement('div');
    renderPlanExecutionView(body, state.plans[0], sess);
    return body.querySelectorAll('.pexec-step-rest').length;
  });
  expect(n).toBe(0);
});
