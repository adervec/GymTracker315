// feat 218 — live-workout heatmaps on the feat-217 renderer: "hit so far" (saved + completed pending
// sets) and "when this plan is done" (so far + every remaining step's sets via its first option).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof liveWorkoutMuscleAcc === 'function' && typeof planProjectionMuscleAcc === 'function', null, { timeout: 15000 });
});

const benchUuid = () => {
  const fam = FAMILIES.find(f => f.id === 'flat-bench-press');
  return fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
};

test('hit-so-far counts saved + COMPLETED pending sets; an open set stays out (feat 211 semantics)', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const fam = FAMILIES.find(f => f.id === 'flat-bench-press');
    const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
    state.sessions = [{ id: 'lh', date: new Date().toISOString(), updatedAt: new Date().toISOString(),
      exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] }];
    modalState.isEditing = false;
    pending.varUuid = u; pending.subUuid = null;
    pending.sets = [{ w: '100', r: '5' }, { w: '105', r: '' }];   // 1 complete + 1 open
    const acc = liveWorkoutMuscleAcc('muscle');
    const sum = Object.values(acc).reduce((a, b) => a + b, 0);
    pending.sets = [{ w: '', r: '' }]; pending.varUuid = null;
    return { sum };
  });
  expect(r.sum).toBeCloseTo(3, 5); // 2 saved + 1 completed pending; the open set contributes nothing
});

test('the plan projection adds every remaining step at its first option', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.plans = [{ id: 'p-lh', name: 'LH', steps: [
      { id: 's1', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] },
      { id: 's2', sets: 2, options: [{ type: 'movement', familyId: 'flat-bench-press' }] } ] }];
    state.sessions = [{ id: 'lh2', date: new Date().toISOString(), updatedAt: new Date().toISOString(), planId: 'p-lh', exercises: [] }];
    modalState.isEditing = false; pending.varUuid = null; pending.sets = [];
    const sofar = Object.values(liveWorkoutMuscleAcc('muscle')).reduce((a, b) => a + b, 0);
    const proj = Object.values(planProjectionMuscleAcc('muscle')).reduce((a, b) => a + b, 0);
    const projQuads = planProjectionMuscleAcc('muscle')['quads'] || 0;
    state.sessions = []; state.plans = [];
    return { sofar, proj, projQuads };
  });
  expect(r.sofar).toBe(0);                  // nothing done yet
  expect(r.proj).toBeCloseTo(5, 5);         // 3 squat + 2 bench sets projected
  expect(r.projQuads).toBeGreaterThan(0);   // squats project onto the quads
});

test('the dashboard shows the card during a workout with working mode + level toggles', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const fam = FAMILIES.find(f => f.id === 'flat-bench-press');
    const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
    state.plans = [{ id: 'p-ui', name: 'UI', steps: [{ id: 's1', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] }] }];
    state.sessions = [{ id: 'ui', date: new Date().toISOString(), updatedAt: new Date().toISOString(), planId: 'p-ui',
      exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] }] }];
    _liveHeatMode = 'sofar'; _liveHeatLevel = 'group';
    navTo('workout');
    const card = document.getElementById('live-heatmap');
    const sofarTitle = card.querySelector('.card-title').textContent;
    card.querySelector('[data-lhm-mode="projected"]').click();        // re-renders
    const card2 = document.getElementById('live-heatmap');
    const projTitle = card2.querySelector('.card-title').textContent;
    card2.querySelector('[data-lhm-level="head"]').click();
    const out = {
      had: !!card, sofarTitle, projTitle,
      level: _liveHeatLevel,
      regions: document.querySelectorAll('#live-heatmap .hm-region').length,
    };
    state.sessions = []; state.plans = []; _liveHeatMode = 'sofar'; _liveHeatLevel = 'group';
    return out;
  });
  expect(r.had).toBe(true);
  expect(r.sofarTitle).toContain('so far 1 sets');
  expect(r.projTitle).toContain('projected 4 sets'); // 1 done + 3 squat sets to come
  expect(r.level).toBe('head');
  expect(r.regions).toBeGreaterThan(15);
});

test('no active session → no card; ended session → no card', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.sessions = [];
    navTo('workout');
    const none = !document.getElementById('live-heatmap');
    state.sessions = [{ id: 'e', date: new Date().toISOString(), updatedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      exercises: [] }];
    render();
    const ended = !document.getElementById('live-heatmap');
    state.sessions = [];
    return { none, ended };
  });
  expect(r.none).toBe(true);
  expect(r.ended).toBe(true);
});
