// feat 336 — the End-Workout confirm popup ends with a coach sign-off: a verdict keyed to the session grade,
// the new e1RM bests it produced (ties into the trends theme), and an encouraging close.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof endWorkoutCoachComment === 'function' && typeof sessionPRCount === 'function'
    && typeof finalizeEndWorkout === 'function', null, { timeout: 15000 });
});

const stdU = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; return null; });

test('sessionPRCount: new high over an established history counts; first-ever and declines do not', async ({ page }) => {
  const u = await stdU(page);
  const r = await page.evaluate((u) => {
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: 'prior', date: iso(7), exercises: [{ varUuid: u, sets: [{ w: 100, r: 5 }] }] },
      { id: 'today', date: iso(0), exercises: [{ varUuid: u, sets: [{ w: 130, r: 5 }] }] },
    ];
    const pr = sessionPRCount(state.sessions[1]);
    state.sessions = [{ id: 't', date: iso(0), exercises: [{ varUuid: u, sets: [{ w: 130, r: 5 }] }] }];
    const firstEver = sessionPRCount(state.sessions[0]);
    state.sessions = [
      { id: 'p', date: iso(7), exercises: [{ varUuid: u, sets: [{ w: 140, r: 5 }] }] },
      { id: 't', date: iso(0), exercises: [{ varUuid: u, sets: [{ w: 100, r: 5 }] }] },
    ];
    const declined = sessionPRCount(state.sessions[1]);
    return { pr, firstEver, declined };
  }, u);
  expect(r.pr).toBe(1);
  expect(r.firstEver).toBe(0);  // no prior day → not a PR (it's a baseline)
  expect(r.declined).toBe(0);
});

test('endWorkoutCoachComment: grade-keyed verdict, PR mention, and the empty-session case', async ({ page }) => {
  const u = await stdU(page);
  const r = await page.evaluate((u) => {
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const noSets = endWorkoutCoachComment({ exercises: [] }, { totalSets: 0 }, null);
    state.sessions = [
      { id: 'prior', date: iso(7), exercises: [{ varUuid: u, sets: [{ w: 100, r: 5 }] }] },
      { id: 'today', date: iso(0), exercises: [{ varUuid: u, sets: [{ w: 130, r: 5 }] }] },
    ];
    const hi = endWorkoutCoachComment(state.sessions[1], { totalSets: 3 }, { points: 90, grade: 'A' });
    state.sessions = [{ id: 't', date: iso(0), exercises: [{ varUuid: u, sets: [{ w: 50, r: 5 }] }] }];
    const lo = endWorkoutCoachComment(state.sessions[0], { totalSets: 3 }, { points: 40, grade: 'D' });
    return { noSets, hi, lo };
  }, u);
  expect(r.noSets.toLowerCase()).toContain('no sets logged');
  expect(r.hi).toContain('Outstanding');
  expect(r.hi).toMatch(/new e1RM best/);          // the new high is called out
  expect(r.hi).toContain('Refuel');               // the encouraging close
  expect(r.lo.toLowerCase()).toContain('every session counts');
  expect(r.lo).toMatch(/banked toward your trends/); // no PR → the sets-banked line instead
});

test('the End-Workout popup message carries the coach final comment', async ({ page }) => {
  const u = await stdU(page);
  const captured = await page.evaluate((u) => {
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const active = { id: 'active', date: new Date().toISOString(), exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 130, r: 5, ts: new Date().toISOString() }] }] };
    state.sessions = [
      { id: 'prior', date: iso(7), exercises: [{ varUuid: u, sets: [{ w: 100, r: 5 }] }] },
      active,
    ];
    let msg = ''; const real = window.choiceDialog; window.choiceDialog = (o) => { msg = o.message; return Promise.resolve('cancel'); };
    finalizeEndWorkout(active, false);   // opens the confirm popup; we cancel via the stub
    window.choiceDialog = real;
    return msg;
  }, u);
  expect(captured).toMatch(/End workout\?/);   // the base summary…
  expect(captured).toContain('Refuel');        // …plus the coach's final comment
  expect(captured).toMatch(/🏁/);
});
