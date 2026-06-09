// feat 144 — per-step minimum completion %: the min % of a step's sets that counts it "done".
// Default 1% (even 1 set counts), overridable per plan and per step. Crucially the min-% threshold is
// evaluated on SAVED sets only (after a save, not on the live pending set), and the current-step pointer
// keeps using the FULL target — so following the plan exactly never ends a step prematurely.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.stepStatus === 'function'
    && typeof window.stepMinSets === 'function'
    && typeof window.resolveStepMinPct === 'function'
    && typeof window.planExecutionSummary === 'function', null, { timeout: 15000 });
});

const stdUuid = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; return null; });
const twoStd = (page) => page.evaluate(() => { let a=null,b=null; for (const [u] of VAR_INDEX){ if(exMode(u).mode!=='standard')continue; if(!a){a=u;continue;} b=u; break; } return {a,b}; });

test('min% resolution: per-step > per-plan > global default; minSets = ceil(target × %), floor 1', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.planDefaults = { minPct: 1 };
    const plan = { id: 'P', name: 'P', steps: [{ id: 's', sets: 4 }] };
    const step = plan.steps[0];
    const out = {};
    out.globalPct = resolveStepMinPct(plan, step); out.globalMin = stepMinSets(plan, step);  // 1% -> ceil(0.04)=1
    plan.minPct = 50; out.planPct = resolveStepMinPct(plan, step); out.planMin = stepMinSets(plan, step); // 50% -> 2
    step.minPct = 100; out.stepPct = resolveStepMinPct(plan, step); out.stepMin = stepMinSets(plan, step); // 100% -> 4
    return out;
  });
  expect(r.globalPct).toBe(1);  expect(r.globalMin).toBe(1);
  expect(r.planPct).toBe(50);   expect(r.planMin).toBe(2);
  expect(r.stepPct).toBe(100);  expect(r.stepMin).toBe(4);
});

test('min% is checked on SAVED sets after a save, never on the live pending set (no premature end)', async ({ page }) => {
  const a = await stdUuid(page);
  const r = await page.evaluate((a) => {
    state.planDefaults = { minPct: 1 };
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 3, options: [{ type: 'variation', uuid: a }] }] }];
    const sess = { id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] };
    state.sessions = [sess];
    const plan = getPlan('P'), step = plan.steps[0];
    // (a) mid-entry: one PENDING set (weight in) — must NOT satisfy at 1% (checked after save, not during)
    modalState.open = true; modalState.isEditing = false; pending = { varUuid: a, subUuid: null, sets: [{ w: 100, r: '' }] };
    const live = stepStatus(sess, step, plan);
    // (b) after saving 1 set — min% met (1 ≥ 1) but NOT full target (1 < 3); pointer stays on step 0
    pending = { varUuid: null, sets: [] };
    sess.exercises = [{ varUuid: a, sets: [{ w: 100, r: 5 }] }];
    const saved1 = stepStatus(sess, step, plan), curIdx1 = currentPlanStepIndex(sess, plan);
    // (c) after the full 3 sets — done too
    sess.exercises = [{ varUuid: a, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }];
    const saved3 = stepStatus(sess, step, plan);
    return { liveLogged: live.logged, liveSatisfied: live.satisfied, liveDone: live.done, minSets: saved1.minSets,
      s1Sat: saved1.satisfied, s1Done: saved1.done, curIdx1, s3Done: saved3.done };
  }, a);
  expect(r.minSets).toBe(1);          // ceil(3 × 1%) -> 1
  expect(r.liveLogged).toBe(1);       // the pending set still shows in live progress (feat 137)
  expect(r.liveSatisfied).toBe(false);// but min% is NOT met by a pending set — only after a save
  expect(r.liveDone).toBe(false);
  expect(r.s1Sat).toBe(true);         // after saving 1 set, the step counts as done at 1%
  expect(r.s1Done).toBe(false);       // ...but the full target isn't met...
  expect(r.curIdx1).toBe(0);          // ...so the current-step pointer stays on step 0 (no premature end)
  expect(r.s3Done).toBe(true);        // all 3 sets -> full done
});

test('plan completes at min% (1 set/step) while stepsFull tracks full-target steps', async ({ page }) => {
  const { a, b } = await twoStd(page);
  const r = await page.evaluate(({ a, b }) => {
    state.planDefaults = { minPct: 1 };
    state.plans = [{ id: 'P', name: 'P', steps: [
      { id: 's0', sets: 3, options: [{ type: 'variation', uuid: a }] },
      { id: 's1', sets: 2, options: [{ type: 'variation', uuid: b }] },
    ] }];
    const sess = { id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [
      { varUuid: a, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }, // full
      { varUuid: b, sets: [{ w: 50, r: 8 }] },                                       // 1/2 -> min only
    ] };
    state.sessions = [sess]; pending = { varUuid: null, sets: [] }; modalState.open = false;
    const sum = planExecutionSummary(sess, getPlan('P'));
    return { stepsDone: sum.stepsDone, stepsFull: sum.stepsFull, complete: sum.complete };
  }, { a, b });
  expect(r.stepsDone).toBe(2);  // both steps met their 1% minimum
  expect(r.stepsFull).toBe(1);  // only step 0 hit its full target
  expect(r.complete).toBe(true);// all steps min-satisfied -> plan complete
});

test('a per-step 100% override requires the full target before the step counts done', async ({ page }) => {
  const a = await stdUuid(page);
  const r = await page.evaluate((a) => {
    state.planDefaults = { minPct: 1 };
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 3, minPct: 100, options: [{ type: 'variation', uuid: a }] }] }];
    const sess = { id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] };
    state.sessions = [sess]; pending = { varUuid: null, sets: [] };
    const plan = getPlan('P'), step = plan.steps[0];
    const at1 = stepStatus(sess, step, plan).satisfied;
    sess.exercises[0].sets = [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }];
    const at3 = stepStatus(sess, step, plan).satisfied;
    return { minSets: stepMinSets(plan, step), at1, at3 };
  }, a);
  expect(r.minSets).toBe(3);  // 100% of 3 sets
  expect(r.at1).toBe(false);  // 1 saved set isn't enough under the override
  expect(r.at3).toBe(true);
});

test('the plan editor exposes per-plan + per-step min% and persists the overrides', async ({ page }) => {
  await page.evaluate(() => {
    state.planDefaults = { minPct: 1 };
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 4, options: [] }] }];
  });
  const r = await page.evaluate(() => {
    openPlanFull('P'); // feat 184 — renders the full plan editor into #trk-main as the plan-creator page
    const body = document.getElementById('trk-main');
    const planInp = body.querySelector('#plan-minpct-input');
    const stepInp = body.querySelector('[data-step-minpct="0"]');
    const has = { plan: !!planInp, step: !!stepInp, placeholderPlan: planInp ? planInp.getAttribute('placeholder') : null };
    planInp.value = '50'; planInp.dispatchEvent(new Event('change', { bubbles: true }));     // re-renders the body
    const stepInp2 = document.getElementById('trk-main').querySelector('[data-step-minpct="0"]');
    stepInp2.value = '75'; stepInp2.dispatchEvent(new Event('change', { bubbles: true }));
    const p = getPlan('P');
    return { ...has, planMinPct: p.minPct, stepMinPct: p.steps[0].minPct };
  });
  expect(r.plan).toBe(true);
  expect(r.step).toBe(true);
  expect(r.placeholderPlan).toBe('1');     // blank shows the global default (1%)
  expect(r.planMinPct).toBe(50);
  expect(r.stepMinPct).toBe(75);
});

test('the global default min% is a persisted setting (planDefaults.minPct in SETTINGS_KEYS)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.planDefaults = { minPct: 25 };
    normalizeState(); saveState();
    return {
      def: planMinPctDefault(),
      persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).planDefaults.minPct,
      inKeys: SETTINGS_KEYS.includes('planDefaults'),
    };
  });
  expect(r.def).toBe(25);
  expect(r.persisted).toBe(25);
  expect(r.inKeys).toBe(true);
});
