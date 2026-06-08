// feat 163 — deep plan-execution analytics: actual step sequence, rest within vs between exercises, active
// (under-tension) time, %active for completed steps, per-step est-vs-actual time, ETC drift + delta, and an
// off-plan summary. computePlanExecutionDetail reads set timestamps (wTs = start, ts = done).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof computePlanExecutionDetail === 'function' && typeof renderPlanExecutionView === 'function', null, { timeout: 15000 });
});

// Build a deterministic session: Squat (step 1, 2 sets), Bench (step 2, 2 sets), then an off-plan Curl (1 set),
// with hand-placed wTs/ts so every duration is exactly known.
async function seed(page) {
  return page.evaluate(() => {
    let squat = null, bench = null, off = null;
    for (const [u, i] of VAR_INDEX) {
      if (!squat && i.family.id === 'squat') squat = u;
      if (!bench && i.family.id === 'flat-bench-press') bench = u;
      if (!off && i.family.id === 'bicep-curl') off = u;
    }
    const T = (s) => `2026-06-01T10:${s}Z`;
    state.plans = [{ id: 'P', name: 'Detail Plan', intensity: 3, steps: [
      { id: 's1', sets: 2, load: 'moderate', options: [{ type: 'movement', familyId: 'squat' }] },
      { id: 's2', sets: 2, load: 'moderate', options: [{ type: 'movement', familyId: 'flat-bench-press' }] },
    ] }];
    state.sessions = [{
      id: 'S', date: T('00:00.000'), endedAt: T('11:20.000'), planId: 'P', planRev: 1,
      exercises: [
        { varUuid: squat, sets: [
          { w: 225, r: 5, wTs: T('00:30.000'), ts: T('01:00.000') },  // active 30s
          { w: 225, r: 5, wTs: T('03:00.000'), ts: T('03:40.000') },  // active 40s; within = 120s
        ] },
        { varUuid: bench, sets: [
          { w: 135, r: 5, wTs: T('06:00.000'), ts: T('06:45.000') },  // active 45s; between(squat→bench)=140s
          { w: 135, r: 5, wTs: T('09:00.000'), ts: T('09:30.000') },  // active 30s; within = 135s
        ] },
        { varUuid: off, sets: [
          { w: 30, r: 12, wTs: T('11:00.000'), ts: T('11:20.000') },  // active 20s; between(bench→off)=90s
        ] },
      ],
    }];
    const d = computePlanExecutionDetail(state.sessions[0], state.plans[0]);
    return { d, foundAll: !!(squat && bench && off) };
  });
}

test('totals: active, rest-within, rest-between, %active for completed steps', async ({ page }) => {
  const { d, foundAll } = await seed(page);
  expect(foundAll).toBe(true);
  expect(d.totals.activeSec).toBe(165);        // 70 + 75 + 20
  expect(d.totals.withinRestSec).toBe(255);    // 120 + 135
  expect(d.totals.betweenRestSec).toBe(230);   // 140 + 90
  expect(d.totals.pctActiveCompleted).toBe(36); // 145 active / 400 tracked across the two done steps
  expect(d.hasTiming).toBe(true);
});

test('per-step estimated vs actual time', async ({ page }) => {
  const { d } = await seed(page);
  expect(d.stepStats[0].estMin).toBe(5);   // 2 sets × 140s ≈ 4.67 → 5
  expect(d.stepStats[0].actualMin).toBe(3); // (70+120)s ≈ 3.17 → 3
  expect(d.stepStats[1].actualMin).toBe(4); // (75+135)s = 3.5 → 4
  expect(d.stepStats[0].pctActive).toBe(37); // 70/190
});

test('actual sequence reflects performance order, off-plan flagged', async ({ page }) => {
  const { d } = await seed(page);
  expect(d.seq.map(s => s.off ? 'off' : 'S' + (s.stepIdx + 1))).toEqual(['S1', 'S2', 'off']);
});

test('off-plan summary counts the curl', async ({ page }) => {
  const { d } = await seed(page);
  expect(d.offPlan.count).toBe(1);
  expect(d.offPlan.sets).toBe(1);
  expect(d.offPlan.activeSec).toBe(20);
  expect(d.offPlan.names.length).toBe(1);
});

test('ETC delta vs the plan original estimate + a drift series', async ({ page }) => {
  const { d } = await seed(page);
  expect(d.eta.finished).toBe(true);
  expect(d.eta.originalMin).toBe(15);  // estimatePlanMinutes(2 steps, 4 sets)
  expect(d.eta.etcMin).toBe(11);       // actual elapsed (ended at 11:20)
  expect(d.eta.deltaMin).toBe(-4);     // 4 min under the estimate
  expect(d.eta.series.length).toBe(5); // one projection per completed set
});

test('the execution view renders the analytics panel (sequence, off-plan, ETC)', async ({ page }) => {
  await seed(page);
  const html = await page.evaluate(() => {
    const body = document.createElement('div');
    renderPlanExecutionView(body, state.plans[0], state.sessions[0]);
    return body.innerHTML;
  });
  expect(html).toContain('pexec-stats');
  expect(html).toContain('Actual sequence');
  expect(html).toContain('pexec-seq-chip');
  expect(html).toMatch(/Off-plan/);
  expect(html).toMatch(/Rest within|Rest between/);
  expect(html).toContain('pexec-time'); // per-step est/actual line
});

test('a session with no timestamps degrades gracefully (no stats panel, no throw)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let squat = null; for (const [u, i] of VAR_INDEX) { if (i.family.id === 'squat') { squat = u; break; } }
    state.plans = [{ id: 'P2', name: 'NT', steps: [{ id: 'a', sets: 2, options: [{ type: 'movement', familyId: 'squat' }] }] }];
    const sess = { id: 'NS', date: '2026-06-02T00:00:00Z', planId: 'P2', exercises: [{ varUuid: squat, sets: [{ w: 1, r: 1 }] }] };
    const d = computePlanExecutionDetail(sess, state.plans[0]);
    const body = document.createElement('div');
    renderPlanExecutionView(body, state.plans[0], sess);
    return { hasTiming: d.hasTiming, hasPanel: /pexec-stats/.test(body.innerHTML) };
  });
  expect(r.hasTiming).toBe(false);
  expect(r.hasPanel).toBe(false); // panel suppressed when there's no timing data
});
