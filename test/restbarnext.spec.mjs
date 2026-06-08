// feat 177 — the rest-timer bar (between sets) shows the prev exercise and the NEXT one, chosen by priority:
// (1) an exercise already selected but not started, (2) the next incomplete explicit-plan step, (3) an implicit
// "pseudo-step" (the least-trained main split this session), (4) nothing.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof restBarNextExercise === 'function' && typeof implicitNextSuggestion === 'function' && typeof refreshRestBar === 'function', null, { timeout: 15000 });
});

async function uuids(page) {
  return page.evaluate(() => {
    let squat = null, bench = null; for (const [u, i] of VAR_INDEX) { if (!squat && i.family.id === 'squat') squat = u; if (!bench && i.family.id === 'flat-bench-press') bench = u; }
    return { squat, bench };
  });
}

test('1) a queued pick (selected but not started) wins', async ({ page }) => {
  const { squat, bench } = await uuids(page);
  const r = await page.evaluate(({ squat, bench }) => {
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), exercises: [{ varUuid: squat, sets: [{ w: 225, r: 5 }] }] }];
    pending.varUuid = bench; pending.subUuid = null; pending.sets = [{ w: '', r: '' }]; // bench selected, not started
    const nx = restBarNextExercise(squat, null); // prev = squat (just finished)
    return nx;
  }, { squat, bench });
  expect(r.kind).toBe('selected');
  expect(r.label.toLowerCase()).toContain('bench');
});

test('2) else the next incomplete explicit-plan step', async ({ page }) => {
  const { squat, bench } = await uuids(page);
  const r = await page.evaluate(({ squat, bench }) => {
    state.plans = [{ id: 'P', name: 'PP', steps: [
      { id: 's1', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] },
      { id: 's2', sets: 3, options: [{ type: 'movement', familyId: 'flat-bench-press' }] },
    ] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: squat, sets: [{ w: 225, r: 5 }] }] }];
    pending.varUuid = squat; pending.subUuid = null; pending.sets = [{ w: 225, r: 5 }]; // same exercise → no queued pick
    return restBarNextExercise(squat, null); // prev squat → next plan step = bench
  }, { squat, bench });
  expect(r.kind).toBe('plan');
  expect(r.label.toLowerCase()).toContain('bench');
});

test('3) else an implicit pseudo-step (least-trained split, different from what you just did)', async ({ page }) => {
  const { squat } = await uuids(page);
  const r = await page.evaluate(({ squat }) => {
    state.plans = [];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), exercises: [{ varUuid: squat, sets: [{ w: 225, r: 5 }, { w: 225, r: 5 }] }] }];
    pending.varUuid = squat; pending.subUuid = null; pending.sets = [{ w: 225, r: 5 }];
    return { nx: restBarNextExercise(squat, null), prevMega: megaOf(squat) };
  }, { squat });
  expect(r.nx.kind).toBe('implicit');
  expect(r.nx.label).toMatch(/suggested/);
  expect(r.nx.label.toLowerCase()).not.toContain(String(r.prevMega)); // suggests a different split than 'lower'
});

test('4) nothing to suggest → null', async ({ page }) => {
  const { squat } = await uuids(page);
  const r = await page.evaluate(({ squat }) => {
    state.plans = [];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), exercises: [] }]; // nothing logged
    pending.varUuid = squat; pending.subUuid = null; pending.sets = [{ w: '', r: '' }];
    return restBarNextExercise(squat, null);
  }, { squat });
  expect(r).toBeNull();
});

test('the rest bar renders prev → next during between-sets rest', async ({ page }) => {
  const { squat } = await uuids(page);
  const txt = await page.evaluate(({ squat }) => {
    state.plans = [];
    const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
    state.sessions = [{ id: 'cur', date: ago(120), exercises: [{ varUuid: squat, sets: [{ w: 225, r: 5, wTs: ago(45), ts: ago(30) }] }] }];
    pending.varUuid = squat; pending.subUuid = null; pending.sets = []; // resting after squat, same exercise
    if (!state.workoutControls) state.workoutControls = {};
    state.workoutControls.restTimer = true;
    refreshRestBar();
    return document.getElementById('rest-bar').textContent;
  }, { squat });
  expect(txt).toMatch(/Squat/i);     // prev exercise shown
  expect(txt).toContain('→');         // arrow to the next
  expect(txt).toMatch(/suggested/);   // implicit pseudo-step (no plan, squat logged)
});
