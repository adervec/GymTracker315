// feat 164 — historize the detailed plan execution onto the session at workout end, finalized with
// incomplete (started, under min%) and skipped (untouched) step stats, reviewable later from the Log.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof finalizePlanExecution === 'function' && typeof renderPlanExecutionView === 'function' && typeof renderSession === 'function', null, { timeout: 15000 });
});

// Plan with 3 steps at 100% min so 1-of-2 sets is genuinely "incomplete". Step 1 done, step 2 partial, step 3 skipped.
async function seedPartial(page) {
  return page.evaluate(() => {
    let squat = null, bench = null, dead = null;
    for (const [u, i] of VAR_INDEX) {
      if (!squat && i.family.id === 'squat') squat = u;
      if (!bench && i.family.id === 'flat-bench-press') bench = u;
      if (!dead && i.family.id === 'deadlift') dead = u;
    }
    state.plans = [{ id: 'P', name: 'Hist Plan', intensity: 3, minPct: 100, steps: [
      { id: 's1', sets: 2, options: [{ type: 'movement', familyId: 'squat' }] },
      { id: 's2', sets: 2, options: [{ type: 'movement', familyId: 'flat-bench-press' }] },
      { id: 's3', sets: 2, options: [{ type: 'movement', familyId: 'deadlift' }] },
    ] }];
    ensurePlanRevisioned(state.plans[0]);
    state.sessions = [{ id: 'S', date: '2026-06-03T10:00:00Z', endedAt: '2026-06-03T11:00:00Z', planId: 'P', planRev: 1, exercises: [
      { varUuid: squat, sets: [{ w: 225, r: 5 }, { w: 225, r: 5 }] }, // step 1: 2/2 → satisfied
      { varUuid: bench, sets: [{ w: 135, r: 5 }] },                   // step 2: 1/2 → incomplete
      // step 3 (deadlift): nothing → skipped
    ] }];
    return { found: !!(squat && bench && dead) };
  });
}

test('finalizePlanExecution snapshots the execution with incomplete + skipped steps', async ({ page }) => {
  await seedPartial(page);
  const r = await page.evaluate(() => {
    const s = state.sessions[0];
    const snap = finalizePlanExecution(s);
    return {
      stored: s.planExec === snap,
      planName: snap.planName, planRev: snap.planRev,
      stepsDone: snap.summary.stepsDone, stepsTotal: snap.summary.stepsTotal,
      incomplete: snap.incomplete.map(x => x.i), skipped: snap.skipped.map(x => x.i),
      incompleteRatio: snap.incomplete[0] ? `${snap.incomplete[0].logged}/${snap.incomplete[0].req}` : null,
      hasDetail: !!snap.detail && Array.isArray(snap.detail.stepStats),
    };
  });
  expect(r.stored).toBe(true);
  expect(r.planName).toBe('Hist Plan');
  expect(r.planRev).toBe(1);
  expect(r.stepsDone).toBe(1);       // only step 1 met the 100% min
  expect(r.stepsTotal).toBe(3);
  expect(r.incomplete).toEqual([1]); // step index 1 (bench) started but under min
  expect(r.skipped).toEqual([2]);    // step index 2 (deadlift) untouched
  expect(r.incompleteRatio).toBe('1/2');
  expect(r.hasDetail).toBe(true);
});

test('finalizeEndWorkout historizes the plan execution end-to-end', async ({ page }) => {
  await seedPartial(page);
  const r = await page.evaluate(() => {
    const s = state.sessions[0];
    delete s.endedAt; delete s.planExec;          // make it "active"
    finalizeEndWorkout(s, true);                   // skipConfirm → finishes immediately
    return { ended: !!s.endedAt, hasExec: !!s.planExec, skipped: s.planExec ? s.planExec.skipped.length : -1 };
  });
  expect(r.ended).toBe(true);
  expect(r.hasExec).toBe(true);
  expect(r.skipped).toBe(1);
});

test('the execution view shows the incomplete/skipped recap on a finished run', async ({ page }) => {
  await seedPartial(page);
  const html = await page.evaluate(() => {
    const body = document.createElement('div');
    renderPlanExecutionView(body, state.plans[0], state.sessions[0]); // ended session → recap shows
    return body.innerHTML;
  });
  expect(html).toContain('pexec-finish');
  expect(html).toMatch(/incomplete/);
  expect(html).toMatch(/skipped/);
});

test('an all-complete finished run shows the "every step completed" recap', async ({ page }) => {
  const html = await page.evaluate(() => {
    let squat = null; for (const [u, i] of VAR_INDEX) { if (i.family.id === 'squat') { squat = u; break; } }
    state.plans = [{ id: 'Q', name: 'Done Plan', steps: [{ id: 'a', sets: 1, options: [{ type: 'movement', familyId: 'squat' }] }] }];
    const sess = { id: 'D', date: '2026-06-04T10:00:00Z', endedAt: '2026-06-04T10:30:00Z', planId: 'Q', planRev: 1, exercises: [{ varUuid: squat, sets: [{ w: 225, r: 5 }] }] };
    state.sessions = [sess];
    const body = document.createElement('div');
    renderPlanExecutionView(body, state.plans[0], sess);
    return body.innerHTML;
  });
  expect(html).toContain('Every step completed');
});

test('the Log session badge surfaces the skipped-step count from the snapshot', async ({ page }) => {
  await seedPartial(page);
  const html = await page.evaluate(() => {
    finalizePlanExecution(state.sessions[0]);
    return renderSession(state.sessions[0], false);
  });
  expect(html).toContain('plan-hist-badge');
  expect(html).toMatch(/1 skipped/);
});

test('a live (active) session shows no finished recap', async ({ page }) => {
  const html = await page.evaluate(() => {
    let squat = null; for (const [u, i] of VAR_INDEX) { if (i.family.id === 'squat') { squat = u; break; } }
    state.plans = [{ id: 'L', name: 'Live', steps: [{ id: 'a', sets: 2, options: [{ type: 'movement', familyId: 'squat' }] }] }];
    const sess = { id: 'cur', date: new Date().toISOString(), planId: 'L', planRev: 1, exercises: [{ varUuid: squat, sets: [{ w: 1, r: 1 }] }] };
    state.sessions = [sess];
    const body = document.createElement('div');
    renderPlanExecutionView(body, state.plans[0], sess); // active → no recap
    return body.innerHTML;
  });
  expect(html).not.toContain('pexec-finish');
});
