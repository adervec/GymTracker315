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

// feat 441 — one EXERCISE feeds one movement identity: hack squats (leg-press primary, squat secondary
// parent via feat 301) filled BOTH a squat step and a leg-press step — surplus spilled across movements
// and min-% (feat 144) called the second step satisfied. An entry now binds to the identity it first
// feeds; only duplicate steps of that same movement may share it.
test('feat 441 — hack squats fill squat OR leg-press, never both; real pairs still split correctly', async ({ page }) => {
  const r = await page.evaluate(() => {
    const HACK = '5d630c7c-26fd-4cab-a033-3c5c6640956b'; // Hack Squat — leg-press family, squat secondary parent
    let squatUuid = null;
    for (const [u, i] of VAR_INDEX) { if (i.family.id === 'squat' && i.variation.id === 'bb-back-squat') { squatUuid = u; break; } }
    const plan = { id: 't-441', rev: 0, steps: [
      { id: 's1', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] },
      { id: 's2', sets: 3, options: [{ type: 'movement', familyId: 'leg-press' }] },
    ] };
    pending = { varUuid: null, subUuid: null, sets: [] };
    const mk = (exs) => ({ id: 'sess441', date: '2099-01-02',
      exercises: exs.map(([u, n]) => ({ varUuid: u, subUuid: null, sets: Array.from({ length: n }, () => ({ w: '100', r: '8' })) })) });
    const snap = (sess) => plan.steps.map(st => { const ss = stepStatus(sess, st, plan); return { logged: ss.logged, satisfied: ss.satisfied, started: ss.started }; });
    return {
      hackOnly: snap(mk([[HACK, 6]])),                       // 6 hack sets: squat step takes 3 + 3 surplus; leg-press untouched
      hackFew: snap(mk([[HACK, 3]])),                        // exactly one step's worth → squat only
      pair: snap(mk([[squatUuid, 3], [HACK, 3]])),           // real squats take the squat step; hacks land on leg-press
      conservation: planStepAllocation(mk([[HACK, 6]]), plan).saved.reduce((a, b) => a + b, 0),
    };
  });
  expect(r.hackOnly[0].logged).toBe(6);          // 3 target + 3 extra, all on the squat step
  expect(r.hackOnly[1].logged).toBe(0);          // leg-press never touched…
  expect(r.hackOnly[1].satisfied).toBe(false);   // …and NOT satisfied (this was the regression)
  expect(r.hackOnly[1].started).toBe(false);
  expect(r.hackFew[0].logged).toBe(3);
  expect(r.hackFew[1].logged).toBe(0);
  expect(r.pair[0].logged).toBe(3);              // real squats → squat step
  expect(r.pair[1].logged).toBe(3);              // hacks → leg-press step (their own identity, unbound elsewhere)
  expect(r.conservation).toBe(6);                // every set still allocated exactly once
});

// feat 281 — a logged set counts toward exactly ONE step. The bug: in Pull Marathon (three "row" steps),
// rows logged for the first row step also completed the later ones. Fix: sets fill steps to target in plan
// order, then surplus attaches to the LAST matching step — never shared.
test('feat 281 — a set counts toward exactly one step; duplicate steps do not share sets', async ({ page }) => {
  const r = await page.evaluate(() => {
    let rowUuid = null;
    for (const [u, i] of VAR_INDEX) { if (i.family.id === 'row') { rowUuid = u; break; } }
    const plan = { id: 't-dup281', rev: 0, steps: [
      { id: 's1', sets: 3, options: [{ type: 'movement', familyId: 'row' }] },
      { id: 's2', sets: 3, options: [{ type: 'movement', familyId: 'row' }] },
      { id: 's3', sets: 3, options: [{ type: 'movement', familyId: 'row' }] },
    ] };
    // a non-active synthetic session (so pending is never folded in)
    const mk = (n) => ({ id: 'sess281', date: '2099-01-01',
      exercises: [{ varUuid: rowUuid, subUuid: null, sets: Array.from({ length: n }, () => ({ w: '50', r: '8' })) }] });
    pending = { varUuid: null, subUuid: null, sets: [] };
    const snap = (sess) => plan.steps.map(st => { const ss = stepStatus(sess, st, plan); return { logged: ss.logged, done: ss.done }; });
    const sum = (sess) => planStepAllocation(sess, plan).logged.reduce((a, b) => a + b, 0);
    return {
      rowUuid,
      l3: snap(mk(3)).map(s => s.logged), d3: snap(mk(3)).map(s => s.done),
      l5: snap(mk(5)).map(s => s.logged),
      l9: snap(mk(9)).map(s => s.logged), d9: snap(mk(9)).map(s => s.done),
      l11: snap(mk(11)).map(s => s.logged),
      sum9: sum(mk(9)), sum11: sum(mk(11)),
    };
  });
  expect(r.rowUuid).toBeTruthy();
  // 3 row sets → ONLY the first row step is done (the bug marked all three done)
  expect(r.l3).toEqual([3, 0, 0]);
  expect(r.d3).toEqual([true, false, false]);
  // 5 sets → first step full, two spill into the second, third untouched
  expect(r.l5).toEqual([3, 2, 0]);
  // 9 sets → each step gets exactly its three; all done, none shared
  expect(r.l9).toEqual([3, 3, 3]);
  expect(r.d9).toEqual([true, true, true]);
  // surplus beyond every target attaches to the LAST matching step only
  expect(r.l11).toEqual([3, 3, 5]);
  // conservation: every logged set is allocated exactly once
  expect(r.sum9).toBe(9);
  expect(r.sum11).toBe(11);
});
