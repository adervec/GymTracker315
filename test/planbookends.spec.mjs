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

test('planUseForWorkout seeds the confirmation dialog from planDefaults and applies the choice', async ({ page }) => {
  const r = await page.evaluate(async () => {
    state.readonly = false;
    state.planDefaults = { ...(state.planDefaults || {}), warmup: true, cooldown: false };
    state.plans = [{ id: 'p3', name: 'T3', intensity: 3, steps: [{ sets: 3, options: [{ type: 'movement', familyId: 'squat' }], load: 'heavy' }] }];
    state.sessions = [];
    const p = planUseForWorkout('p3');                  // opens the confirm sheet (feat 398)
    const dlgWarmup = document.getElementById('pud-warmup').checked;   // seeded from planDefaults
    const dlgCooldown = document.getElementById('pud-cooldown').checked;
    document.querySelector('[data-pud="ok"]').click();  // accept the defaults (warm-up on, cool-down off, 1× volume)
    await p;
    const s = getActiveSession();
    return { dlgWarmup, dlgCooldown, has: !!s, bk: s && s.bookends, scale: s && s.planScale, warmupInPlan: getActivePlan().steps.some(st => st.bookend === 'warmup') };
  });
  expect(r.dlgWarmup).toBe(true);     // the dialog reflects the planDefaults
  expect(r.dlgCooldown).toBe(false);
  expect(r.has).toBe(true);
  expect(r.bk).toEqual({ warmup: true, cooldown: false });
  expect(r.scale).toBeUndefined();    // 1× → no scale stored
  expect(r.warmupInPlan).toBe(true);
});

test('feat 398 — the dialog can halve or double the plan volume, and cancel does nothing', async ({ page }) => {
  const r = await page.evaluate(async () => {
    // each open() clears any lingering (already-resolved) sheet, then drives the current one
    const open = async (planId, pick) => {
      document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
      state.sessions = [];
      const p = planUseForWorkout(planId);
      const back = [...document.querySelectorAll('.choice-backdrop')].pop();
      if (typeof pick === 'number') back.querySelector(`#pud-scale button[data-scale="${pick}"]`).click();
      back.querySelector(`[data-pud="${pick === 'cancel' ? 'cancel' : 'ok'}"]`).click();
      await p;
    };
    state.readonly = false;
    state.planDefaults = { warmup: false, cooldown: false };
    state.plans = [{ id: 'p4', name: 'T4', intensity: 3, steps: [
      { sets: 4, options: [{ type: 'movement', familyId: 'squat' }], load: 'heavy' },
      { sets: 3, options: [{ type: 'movement', familyId: 'flat-bench-press' }], load: 'heavy' } ] }];
    await open('p4', 2);
    const doubled = getActivePlan().steps.filter(st => !st.bookend).map(st => st.sets);
    await open('p4', 0.5);
    const halved = getActivePlan().steps.filter(st => !st.bookend).map(st => st.sets);
    const halvedScale = getActiveSession().planScale;
    await open('p4', 'cancel');
    const afterCancel = getActiveSession();
    return { doubled, halved, halvedScale, storedUnchanged: getPlan('p4').steps.map(s => s.sets), cancelledNoSession: !afterCancel };
  });
  expect(r.doubled).toEqual([8, 6]);            // 4→8, 3→6
  expect(r.halved).toEqual([2, 2]);             // 4→2, 3→2 (rounds, min 1)
  expect(r.halvedScale).toBe(0.5);
  expect(r.storedUnchanged).toEqual([4, 3]);    // the saved plan is never mutated
  expect(r.cancelledNoSession).toBe(true);      // cancel = no workout started
});

test('feat 426 — quarter-step volume scales (¾× / 1¼× / 1¾×) in the dialog', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const open = async (pick) => {
      document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
      state.sessions = [];
      const p = planUseForWorkout('p5');
      const back = [...document.querySelectorAll('.choice-backdrop')].pop();
      back.querySelector(`#pud-scale button[data-scale="${pick}"]`).click();
      back.querySelector('[data-pud="ok"]').click();
      await p;
      return getActivePlan().steps.filter(st => !st.bookend).map(st => st.sets);
    };
    state.readonly = false;
    state.planDefaults = { warmup: false, cooldown: false };
    state.plans = [{ id: 'p5', name: 'T5', intensity: 3, steps: [
      { sets: 4, options: [{ type: 'movement', familyId: 'squat' }], load: 'heavy' },
      { sets: 3, options: [{ type: 'movement', familyId: 'flat-bench-press' }], load: 'heavy' } ] }];
    const buttons = (() => {
      const p = planUseForWorkout('p5');
      const back = [...document.querySelectorAll('.choice-backdrop')].pop();
      const vals = [...back.querySelectorAll('#pud-scale button')].map(b => parseFloat(b.dataset.scale));
      back.querySelector('[data-pud="cancel"]').click();
      return p.then(() => vals);
    })();
    return { buttons: await buttons, x075: await open(0.75), x125: await open(1.25), x175: await open(1.75),
      scale175: getActiveSession().planScale };
  });
  expect(r.buttons).toEqual([0.5, 0.75, 1, 1.25, 1.75, 2]);
  expect(r.x075).toEqual([3, 2]);   // round(4×.75)=3, round(3×.75)=2
  expect(r.x125).toEqual([5, 4]);   // round(5)=5, round(3.75)=4
  expect(r.x175).toEqual([7, 5]);   // round(7)=7, round(5.25)=5
  expect(r.scale175).toBe(1.75);    // stored on the session like ½/2 always were
});
