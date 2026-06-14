// feat 213 — duplicate-step indicator: when one single variation could satisfy 2+ steps of the same
// plan (overlapping option pools, alias/secondary-parent aware), those steps get a ⧉ badge on the
// dashboard plan card naming their partners.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof planDuplicateSteps === 'function' && typeof navTo === 'function', null, { timeout: 15000 });
});

test('planDuplicateSteps maps overlapping steps (movement×movement and movement×variation)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const curlVar = FAMILIES.find(f => f.id === 'bicep-curl').variations[0].uuid;
    const mk = (steps) => planDuplicateSteps({ id: 'x', steps });
    return {
      twin: mk([
        { id: 'a', sets: 3, options: [{ type: 'movement', familyId: 'bicep-curl' }] },
        { id: 'b', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] },
        { id: 'c', sets: 2, options: [{ type: 'movement', familyId: 'bicep-curl' }] },
      ]),
      mixed: mk([
        { id: 'a', sets: 3, options: [{ type: 'movement', familyId: 'bicep-curl' }] },
        { id: 'b', sets: 3, options: [{ type: 'variation', uuid: curlVar }] },     // one pinned curl
      ]),
      clean: mk([
        { id: 'a', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] },
        { id: 'b', sets: 3, options: [{ type: 'movement', familyId: 'calf-raise' }] },
      ]),
      single: mk([{ id: 'a', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] }]),
    };
  });
  expect(r.twin).toEqual({ 0: [2], 2: [0] });   // the two curl steps point at each other; squat clean
  expect(r.mixed).toEqual({ 0: [1], 1: [0] });  // a pinned variation overlaps its family step
  expect(r.clean).toEqual({});                  // disjoint pools → nothing flagged
  expect(r.single).toEqual({});                 // a 1-step plan can't duplicate
});

test('the plan card badges the duplicate steps and names their partners (feat 246 — on the Plan page)', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.plans = [{ id: 'p-dup', name: 'Dup', steps: [
      { id: 's1', sets: 3, options: [{ type: 'movement', familyId: 'bicep-curl' }] },
      { id: 's2', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] },
      { id: 's3', sets: 2, options: [{ type: 'movement', familyId: 'bicep-curl' }] },
    ] }];
    state.sessions = [{ id: 'sess', date: new Date().toISOString(), updatedAt: new Date().toISOString(), planId: 'p-dup',
      exercises: [] }];
    openPlanLive(); // feat 246 — the interactive plan card lives on the Plan Detail page now
    const flagged = [...document.querySelectorAll('#trk-main .plan-step')].map(el => {
      const b = el.querySelector('.plan-step-dup');
      return b ? b.textContent.trim() : null;
    });
    state.sessions = []; state.plans = [];
    return flagged;
  });
  expect(r).toHaveLength(3);
  expect(r[0]).toContain('⧉');      // step 1 overlaps…
  expect(r[0]).toContain('3');      // …with step 3
  expect(r[1]).toBe(null);          // the squat step is clean
  expect(r[2]).toContain('1');      // step 3 points back at step 1
});
