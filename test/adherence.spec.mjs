// feat 231 — program adherence: match logged sessions back to the scheduled program (state.program). Per
// scheduled day → done / off-plan / missed / today / upcoming; a this-week done/scheduled summary, a
// consecutive-session streak, and a trailing-4-week trend, surfaced in the program card on the planner.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof programWeekAdherence === 'function' && typeof programAdherenceStreak === 'function', null, { timeout: 15000 });
});

// every day scheduled to the same plan, so the test is deterministic whatever weekday it runs.
const seedFullWeekProgram = (page) => page.evaluate(() => {
  normalizeState();
  const pid = state.plans[0].id;
  state.program = { name: 't', createdAt: '', sessions: 7, minutes: 60, pool: [pid], week: [pid, pid, pid, pid, pid, pid, pid] };
  state.sessions = [];
  return pid;
});
const logDaysAgo = (page, days, planId) => page.evaluate(({ days, planId }) => {
  days.forEach(n => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n);
    state.sessions.push({ id: 's' + n + '_' + Math.random(), date: d.toISOString(), updatedAt: d.toISOString(), planId, exercises: [{ varUuid: 'x', sets: [{ w: 100, r: 5 }] }] });
  });
}, { days, planId });

test('a session on the scheduled plan marks the day done; a past empty scheduled day is missed', async ({ page }) => {
  const pid = await seedFullWeekProgram(page);
  await logDaysAgo(page, [0], pid); // train today, on the scheduled plan
  const r = await page.evaluate(() => {
    const adh = programWeekAdherence(0);
    const todayDow = new Date().getDay();
    const todayRow = adh.days.find(d => d.dow === todayDow);
    // the training week runs Monday-first, so Sunday (0) is the LAST day — then there are no later days to be "upcoming"
    const order = [1, 2, 3, 4, 5, 6, 0];
    const isLastDayOfWeek = order.indexOf(todayDow) === order.length - 1;
    return { scheduled: adh.scheduled, done: adh.done, todayStatus: todayRow.status, statuses: adh.days.map(d => d.status), isLastDayOfWeek };
  });
  expect(r.scheduled).toBe(7);
  expect(r.done).toBeGreaterThanOrEqual(1);
  expect(r.todayStatus).toBe('done');            // trained today on plan
  // later days this week are still "upcoming" — unless today IS the last day of the week (Sunday), when none remain
  if (r.isLastDayOfWeek) expect(r.statuses).not.toContain('upcoming');
  else expect(r.statuses).toContain('upcoming');
});

test('a session with a DIFFERENT plan counts as off-plan (trained, not on the scheduled plan)', async ({ page }) => {
  await seedFullWeekProgram(page);
  await page.evaluate(() => {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    state.sessions = [{ id: 'x', date: d.toISOString(), updatedAt: d.toISOString(), planId: 'some-other-plan', exercises: [{ varUuid: 'x', sets: [{ w: 100, r: 5 }] }] }];
  });
  const r = await page.evaluate(() => programWeekAdherence(0).days.find(d => d.dow === new Date().getDay()).status);
  expect(r).toBe('off-plan');
});

test('the streak counts consecutive scheduled days trained, walking back from yesterday', async ({ page }) => {
  const pid = await seedFullWeekProgram(page);
  await logDaysAgo(page, [1, 2, 3], pid); // yesterday, -2, -3 (not -4)
  const r = await page.evaluate(() => ({ streak: programAdherenceStreak(), trend: programAdherenceTrend(4).length }));
  expect(r.streak).toBe(3);   // three back-to-back, then the gap at day-4 stops it
  expect(r.trend).toBe(4);    // four trailing-week buckets
});

test('no program → adherence helpers are null/zero, never throw', async ({ page }) => {
  const r = await page.evaluate(() => { state.program = null; return { adh: programWeekAdherence(0), streak: programAdherenceStreak(), trend: programAdherenceTrend(4).length }; });
  expect(r.adh).toBeNull();
  expect(r.streak).toBe(0);
  expect(r.trend).toBe(4); // trend still returns the buckets (all zero)
});

test('the program card shows the adherence summary + per-day status on the agenda', async ({ page }) => {
  const pid = await seedFullWeekProgram(page);
  await logDaysAgo(page, [0, 1], pid);
  const r = await page.evaluate(() => {
    state.splitPlan = { sessions: 3, days: 5, minutes: 60 };
    navTo('split-planner');
    const host = document.getElementById('trk-main');
    return {
      hasAdh: !!host.querySelector('.pg-adh'),
      adhText: (host.querySelector('.pg-adh')?.textContent || '').replace(/\s+/g, ' '),
      doneCells: host.querySelectorAll('.pg-day.pg-done').length,
      hasStatusIcon: !!host.querySelector('.pg-status'),
      hasTrend: host.querySelectorAll('.pg-dot').length,
    };
  });
  expect(r.hasAdh).toBe(true);
  expect(r.adhText).toContain('done');
  expect(r.doneCells).toBeGreaterThanOrEqual(1); // today shows as done
  expect(r.hasStatusIcon).toBe(true);
  expect(r.hasTrend).toBe(4);                    // four trailing-week dots
});

test('once today is done, the Start button is replaced by a done marker', async ({ page }) => {
  const pid = await seedFullWeekProgram(page);
  const r = await page.evaluate((pid) => {
    state.splitPlan = { sessions: 3, days: 5, minutes: 60 };
    navTo('split-planner');
    const before = !!document.querySelector('#trk-main .pg-today .sp-use'); // Start present before training
    const d = new Date(); d.setHours(12, 0, 0, 0);
    state.sessions = [{ id: 'today', date: d.toISOString(), updatedAt: d.toISOString(), planId: pid, exercises: [{ varUuid: 'x', sets: [{ w: 100, r: 5 }] }] }];
    navTo('workout'); navTo('split-planner'); // re-render
    const host = document.getElementById('trk-main');
    return { before, afterStart: !!host.querySelector('.pg-today .sp-use'), todayLbl: host.querySelector('.pg-today-lbl')?.textContent || '' };
  }, pid);
  expect(r.before).toBe(true);          // Start offered when today isn't done yet
  expect(r.afterStart).toBe(false);     // …gone once today's session is logged
  expect(r.todayLbl).toContain('done'); // and the banner marks it done
});
