// feat 113/114 — after saving sets, route to the exercise PICKER (not the dashboard): blank with no
// plan, or pre-filtered to the earliest incomplete step with a plan. EXCEPTION: if the save just
// completed the plan, close to the dashboard and show the plan-complete dialog. Ending a workout
// (endingWorkout=true) keeps the old close-to-dashboard behavior.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.saveSets === 'function' && typeof window.showPlanCompleteDialog === 'function', null, { timeout: 15000 });
});

async function setup(page) {
  return await page.evaluate(() => {
    let a = null, b = null;
    for (const [u] of VAR_INDEX) { if (exMode(u).mode !== 'standard') continue; if (!a) { a = u; continue; } b = u; break; }
    state.readonly = false; state.alwaysConfirm = false;
    return { a, b };
  });
}

test('no plan: save routes to a blank picker (modal stays open)', async ({ page }) => {
  const { a } = await setup(page);
  const r = await page.evaluate(async (a) => {
    state.sessions = [{ id: 'today', date: new Date().toISOString(), exercises: [] }]; // active, no plan
    pending = { varUuid: a, subUuid: null, sets: [{ w: 100, r: 5 }] };
    modalState.open = true; modalState.isEditing = false; modalState.showPicker = false; modalState.planStepFilter = null;
    const ok = await saveSets();
    return { ok, showPicker: modalState.showPicker, filter: modalState.planStepFilter, open: modalState.open };
  }, a);
  expect(r.ok).toBe(true);
  expect(r.showPicker).toBe(true);
  expect(r.filter).toBe(null);   // unfiltered
  expect(r.open).toBe(true);     // modal stays open on the picker
});

test('plan active (not finished): save routes to the picker filtered to the earliest incomplete step', async ({ page }) => {
  const { a, b } = await setup(page);
  const r = await page.evaluate(async ({ a, b }) => {
    state.plans = [{ id: 'P', name: 'P', steps: [
      { id: 's0', sets: 3, options: [{ type: 'variation', uuid: a }] },
      { id: 's1', sets: 2, options: [{ type: 'variation', uuid: b }] },
    ] }];
    state.sessions = [{ id: 'today', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    pending = { varUuid: a, subUuid: null, sets: [{ w: 100, r: 5 }] }; // 1 of 3 for step 0 -> still incomplete
    modalState.open = true; modalState.isEditing = false; modalState.showPicker = false; modalState.planStepFilter = null;
    await saveSets();
    return { showPicker: modalState.showPicker, filter: modalState.planStepFilter, open: modalState.open };
  }, { a, b });
  expect(r.showPicker).toBe(true);
  expect(r.filter).toBe(0);      // earliest incomplete step
  expect(r.open).toBe(true);
});

test('plan just finished: close to the dashboard and show the plan-complete dialog', async ({ page }) => {
  const { a } = await setup(page);
  const r = await page.evaluate(async (a) => {
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 1, options: [{ type: 'variation', uuid: a }] }] }];
    state.sessions = [{ id: 'today', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    pending = { varUuid: a, subUuid: null, sets: [{ w: 100, r: 5 }] }; // 1 set finishes the only step
    modalState.open = true; modalState.isEditing = false; modalState.showPicker = false;
    await saveSets();
    await new Promise((res) => setTimeout(res, 30));
    const dialog = [...document.querySelectorAll('div')].some((d) => d.textContent === '🎉 Plan complete!');
    return { open: modalState.open, dialog };
  }, a);
  expect(r.open).toBe(false);  // closed to the dashboard
  expect(r.dialog).toBe(true); // plan-complete popup shown
});

test('ending a workout: save closes the modal without rerouting to the picker', async ({ page }) => {
  const { a } = await setup(page);
  const r = await page.evaluate(async (a) => {
    state.sessions = [{ id: 'today', date: new Date().toISOString(), exercises: [] }];
    pending = { varUuid: a, subUuid: null, sets: [{ w: 100, r: 5 }] };
    modalState.open = true; modalState.isEditing = false; modalState.showPicker = false;
    await saveSets(true); // endingWorkout
    return { open: modalState.open, showPicker: modalState.showPicker };
  }, a);
  expect(r.open).toBe(false);       // modal closed
  expect(r.showPicker).toBe(false); // no picker reroute
});
