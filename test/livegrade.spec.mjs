// feat 542 — a live grade for the exercise on screen, a next-set ask that banks reserve for what is left in
// the plan, and the end-of-workout sheet charting the grades exercise by exercise.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exerciseLiveGrade === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
    null, { timeout: 15000 });
  await page.evaluate(() => {
    state.unit = 'kg'; state.exerciseMaxW = {};
    const by = id => { for (const [u, i] of VAR_INDEX) if (i.variation.id === id) return u; };
    window._bench = by('bb-flat-bench'); window._db = by('db-flat-bench');
    let row = null; for (const [u, i] of VAR_INDEX) if (i.bp === 'back' && exMode(u).mode === 'standard' && !isCardioVar(u)) { row = u; break; }
    window._row = row;
    const at = d => new Date(Date.now() - d * 864e5).toISOString();
    state.sessions = [{ id: 'old', date: at(5), endedAt: at(5), exercises: [_bench, _db, _row].map(v => ({ varUuid: v, subUuid: null, sets: [{ w: 100, r: 8 }, { w: 100, r: 7 }] })) },
      { id: 'old2', date: at(9), endedAt: at(9), exercises: [_bench, _db, _row].map(v => ({ varUuid: v, subUuid: null, sets: [{ w: 100, r: 7 }, { w: 100, r: 6 }] })) }];
    window._live = { id: 'live', date: new Date(Date.now() - 30 * 60000).toISOString(), exercises: [] };
    state.sessions.push(_live);
    pending = { varUuid: _bench, subUuid: null, sets: [] };
  });
});

test('feat 542 — the live grade matches the workout grade rules and names the next tier', async ({ page }) => {
  const r = await page.evaluate(() => {
    const none = exerciseLiveGrade(_bench, null);
    pending.sets = [{ w: 100, r: 8 }];                 // matched last time
    const matched = exerciseLiveGrade(_bench, null);
    pending.sets.push({ w: 100, r: 10 });              // a new best
    const pr = exerciseLiveGrade(_bench, null);
    // the score the workout itself would give the same exercise
    _live.exercises = [{ varUuid: _bench, subUuid: null, sets: pending.sets.slice() }];
    const ws = computeWorkoutScore(_live);
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    return { none, matched, pr, wsPoints: ws.breakdown[0].points, chip: document.querySelector('#trk-live-grade .session-grade').textContent };
  });
  expect(r.none).toBeNull();
  expect(r.matched.label).toBe('matched');
  expect(r.matched.grade).toBe('C');
  expect(r.matched.next).toEqual({ grade: 'B', w: 100, r: 9 });  // 100×9 beats last time by ≥0.5%
  expect(r.pr.label).toBe('PR');
  expect(r.pr.grade).toBe('S');
  expect(r.pr.next).toBeNull();
  expect(r.wsPoints).toBe(r.pr.points);
  expect(r.chip).toBe('S');
});

test('feat 542 — next set banks reserve for sets still to come and a later same-muscle step', async ({ page }) => {
  const r = await page.evaluate(() => {
    const plan = { id: 'pl', name: 'Push', steps: [
      { id: 'a', sets: 4, options: [{ type: 'variation', uuid: _bench }] },
      { id: 'b', sets: 3, options: [{ type: 'variation', uuid: _db }] },      // more chest later
      { id: 'c', sets: 3, options: [{ type: 'variation', uuid: _row }] }] };
    state.plans.push(plan);
    const free = nextSetCoach(_bench, null);
    _live.planId = 'pl';
    const planned = nextSetCoach(_bench, null);
    // the chest step is done → only the 3 sets left on this step bank reserve
    _live.exercises = [{ varUuid: _db, subUuid: null, sets: [1, 2, 3].map(() => ({ w: 30, r: 10 })) }];
    const chestDone = nextSetCoach(_bench, null);
    return { free: free.rirTarget, planned: planned.rirTarget, chestDone: chestDone.rirTarget, why: planned.why.join(' | '), why2: chestDone.why.join(' | ') };
  });
  expect(r.planned).toBeGreaterThan(r.free);
  expect(r.why).toContain('3 more sets of this after');
  expect(r.why).toMatch(/then .*Dumbbell.* for Chest/i);
  expect(r.why2).not.toMatch(/for Chest/i);
  expect(r.chestDone).toBeLessThan(r.planned);
});

test('feat 542 — the end-workout sheet charts each exercise grade and the running grade', async ({ page }) => {
  const r = await page.evaluate(() => {
    _live.exercises = [
      { varUuid: _bench, subUuid: null, sets: [{ w: 100, r: 10 }] },   // PR → S
      { varUuid: _db, subUuid: null, sets: [{ w: 100, r: 8 }] },       // matched → C
      { varUuid: _row, subUuid: null, sets: [{ w: 90, r: 6 }] }];      // down → D
    pending = { varUuid: null, sets: [] };
    finalizeEndWorkout(_live, false);
    const sheet = document.querySelector('.choice-sheet');
    const dots = [...sheet.querySelectorAll('.wgt-dot')].map(c => c.getAttribute('class'));
    const run = sheet.querySelector('.wgt-run').getAttribute('points').split(' ').length;
    const items = [...sheet.querySelectorAll('.wgt-list li')].map(li => li.textContent.trim());
    return { dots, run, items, end: sheet.querySelector('.wgt-end').textContent };
  });
  expect(r.dots).toEqual(['wgt-dot g-S', 'wgt-dot g-C', 'wgt-dot g-D']);
  expect(r.run).toBe(3);
  expect(r.items[0]).toMatch(/^S/);
  expect(r.end).toBe('C');   // (100 + 60 + 20) / 3 = 60 → C
});
