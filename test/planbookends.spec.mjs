// feat 311 — optional warm-up (prepend) and cool-down / finisher (append) blocks added to a plan at workout
// start. Stored as session.bookends; getActivePlan() augments the plan's steps with them (tagged `bookend`);
// they don't gate plan completion. Toggled in Settings → plan defaults (state.planDefaults.warmup/cooldown).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof getActivePlan === 'function' && typeof planExecutionSummary === 'function'
    && typeof planUseForWorkout === 'function' && typeof planBookendDefaults === 'function'
    && typeof stepQualifyingVarSet === 'function' && typeof WARMUP_BLOCK !== 'undefined', null, { timeout: 15000 });
});

test('planBookendDefaults reflects the plan-default settings', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.planDefaults = { minPct: 1, warmup: true, cooldown: true };
    const on = planBookendDefaults();
    state.planDefaults = { minPct: 1 };
    const off = planBookendDefaults();
    return { on, off };
  });
  expect(r.on).toEqual({ warmup: true, cooldown: true });
  expect(r.off).toEqual({ warmup: false, cooldown: false });
});

test('the warm-up and cool-down blocks reference real, satisfiable movements', async ({ page }) => {
  const bad = await page.evaluate(() => {
    const out = [];
    [...WARMUP_BLOCK, ...COOLDOWN_BLOCK].forEach((st, i) => { const s = stepQualifyingVarSet(st); if (!s || s.size === 0) out.push(i); });
    return out;
  });
  expect(bad).toEqual([]);
});

test('getActivePlan prepends warm-up + appends cool-down when the session opts in', async ({ page }) => {
  const r = await page.evaluate(() => {
    const today = new Date().toISOString();
    state.plans = [{ id: 'p-test', name: 'T', intensity: 3, steps: [
      { sets: 3, options: [{ type: 'movement', familyId: 'flat-bench-press' }], desc: '', load: 'heavy' },
      { sets: 3, options: [{ type: 'movement', familyId: 'squat' }], desc: '', load: 'heavy' } ] }];
    state.sessions = [{ id: 's', date: today, exercises: [], planId: 'p-test' }];
    const plain = getActivePlan().steps.length;                         // no bookends
    state.sessions[0].bookends = { warmup: true, cooldown: true };
    const aug = getActivePlan();
    return { plain, augLen: aug.steps.length, w: WARMUP_BLOCK.length, c: COOLDOWN_BLOCK.length,
      firstBookend: aug.steps[0].bookend, lastBookend: aug.steps[aug.steps.length - 1].bookend,
      middleMain: aug.steps[WARMUP_BLOCK.length].options[0].familyId, storedUnchanged: getPlan('p-test').steps.length };
  });
  expect(r.plain).toBe(2);
  expect(r.augLen).toBe(2 + r.w + r.c);
  expect(r.firstBookend).toBe('warmup');
  expect(r.lastBookend).toBe('cooldown');
  expect(r.middleMain).toBe('flat-bench-press');  // the original plan steps sit between the bookends
  expect(r.storedUnchanged).toBe(2);              // the saved plan is never mutated
});

test('bookend steps do not gate plan completion', async ({ page }) => {
  const r = await page.evaluate(() => {
    const today = new Date().toISOString();
    const findVar = (fam) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fam) return u; return null; };
    const bench = findVar('flat-bench-press'), squat = findVar('squat');
    state.plans = [{ id: 'p2', name: 'T2', intensity: 3, steps: [
      { sets: 1, options: [{ type: 'movement', familyId: 'flat-bench-press' }], load: 'heavy' },
      { sets: 1, options: [{ type: 'movement', familyId: 'squat' }], load: 'heavy' } ] }];
    state.sessions = [{ id: 's2', date: today, planId: 'p2', bookends: { warmup: true, cooldown: true },
      exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 100, r: 5 }] }, { varUuid: squat, subUuid: null, sets: [{ w: 140, r: 5 }] }] }];
    const plan = getActivePlan();
    const sum = planExecutionSummary(state.sessions[0], plan);
    return { complete: sum.complete, stepsTotal: sum.stepsTotal, mainSteps: plan.steps.filter(s => !s.bookend).length };
  });
  expect(r.complete).toBe(true);                       // main steps satisfied → complete, despite unlogged bookends
  expect(r.mainSteps).toBe(2);
  expect(r.stepsTotal).toBeGreaterThan(r.mainSteps);   // bookends are counted in the total but don't gate completion
});

test('planUseForWorkout applies the planDefaults bookends to the session', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false;
    state.planDefaults = { ...(state.planDefaults || {}), warmup: true, cooldown: false };
    state.plans = [{ id: 'p3', name: 'T3', intensity: 3, steps: [{ sets: 3, options: [{ type: 'movement', familyId: 'squat' }], load: 'heavy' }] }];
    state.sessions = [];
    planUseForWorkout('p3');                            // starts a workout + attaches the plan + bookends
    const s = getActiveSession();
    return { has: !!s, bk: s && s.bookends, warmupInPlan: getActivePlan().steps.some(st => st.bookend === 'warmup') };
  });
  expect(r.has).toBe(true);
  expect(r.bk).toEqual({ warmup: true, cooldown: false });
  expect(r.warmupInPlan).toBe(true);
});
