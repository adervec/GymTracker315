// feat 116 — the Log-Sets form shows which plan step the current exercise belongs to, its progress
// (sets logged / target with a bar) and whether the effort is on target.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.planStepForVar === 'function' && typeof window.planStepIndicatorHtml === 'function', null, { timeout: 15000 });
});

test('planStepForVar maps an exercise to its plan step', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null, b = null;
    for (const [u] of VAR_INDEX) { if (exMode(u).mode !== 'standard') continue; if (!a) { a = u; continue; } b = u; break; }
    state.plans = [{ id: 'P', name: 'Plan', steps: [
      { id: 's0', sets: 3, options: [{ type: 'variation', uuid: a }] },
      { id: 's1', sets: 2, options: [{ type: 'variation', uuid: b }] },
    ] }];
    const sess = { id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] };
    state.sessions = [sess];
    return { idxA: planStepForVar(sess, getPlan('P'), a), idxB: planStepForVar(sess, getPlan('P'), b), idxNone: planStepForVar(sess, getPlan('P'), '__nope__') };
  });
  expect(r.idxA).toBe(0);
  expect(r.idxB).toBe(1);
  expect(r.idxNone).toBe(-1);
});

test('the indicator shows the step, progress and falls back when off-plan', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.plans = [{ id: 'P', name: 'Plan', steps: [{ id: 's0', sets: 3, options: [{ type: 'variation', uuid: a }] }, { id: 's1', sets: 2, options: [{ type: 'movement', familyId: '__x__' }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] }];
    modalState.isEditing = false;
    pending = { varUuid: a, subUuid: null, sets: [] };
    const onPlan = planStepIndicatorHtml();
    pending = { varUuid: '__nope__', subUuid: null, sets: [] };
    const offPlan = planStepIndicatorHtml();
    return { onPlan, offPlan };
  });
  expect(r.onPlan).toContain('logstep');
  expect(r.onPlan).toContain('Step 1/2');
  expect(r.onPlan).toContain('1/3 sets');
  expect(r.offPlan).toContain('not part of any plan step');
});
