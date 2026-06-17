// feat 230 — scheduled weekly program: save a recommended split as a day-by-day program (state.program),
// show a Monday-first agenda (editable per day), and surface "today's session" on the planner + the
// dashboard plan bar. JS day-of-week (0=Sun…6=Sat) week array.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildProgramFromSplit === 'function' && typeof programForDow === 'function'
    && typeof renderSplitPlannerPage === 'function', null, { timeout: 15000 });
});

test('buildProgramFromSplit places sessions on spaced days with a distinct plan pool', async ({ page }) => {
  const r = await page.evaluate(() => {
    const split = buildRecommendedSplit({ sessions: 3, minutes: 60 });
    const prog = buildProgramFromSplit(split, 3, 60);
    return {
      weekLen: prog.week.length,
      onDays: prog.week.map((id, d) => id ? d : null).filter(d => d !== null), // JS DOWs that have a session
      restDays: prog.week.filter(id => !id).length,
      pool: prog.pool.length,
      sessions: prog.sessions,
    };
  });
  expect(r.weekLen).toBe(7);
  expect(r.onDays).toEqual([1, 3, 5]); // Mon / Wed / Fri — spaced for recovery
  expect(r.restDays).toBe(4);
  expect(r.pool).toBe(3);              // PPL → three distinct plans
  expect(r.sessions).toBe(3);
});

test('programForDow / programToday resolve the scheduled plan; rest days are null', async ({ page }) => {
  const r = await page.evaluate(() => {
    const split = buildRecommendedSplit({ sessions: 3, minutes: 60 });
    state.program = buildProgramFromSplit(split, 3, 60);
    const todayDow = new Date().getDay();
    const planId = state.program.week[1] || (state.program.pool && state.program.pool[0]);
    state.program.week[1] = planId;                 // Monday: a known scheduled plan
    // Pick a rest day that can't collide with the forced "today" slot below — keeps this
    // deterministic on any weekday (forcing week[todayDow] used to clobber a hardcoded rest day).
    let restDow = -1;
    for (let d = 0; d < 7; d++) { if (d !== todayDow && d !== 1) { state.program.week[d] = null; restDow = d; break; } }
    state.program.week[todayDow] = planId;          // force TODAY to a known scheduled plan
    return {
      mon: programForDow(1)?.planId,
      rest: programForDow(restDow), // a guaranteed rest day, never == today
      today: programToday()?.planId,
      todayPlanIsReal: !!(programToday() && programToday().plan && programToday().plan.name),
    };
  });
  expect(r.mon).toBeTruthy();
  expect(r.rest).toBeNull();
  expect(r.today).toBe(r.mon);
  expect(r.todayPlanIsReal).toBe(true);
});

test('cycleProgramDay rotates a day through Rest → each pool plan → Rest', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.program = buildProgramFromSplit(buildRecommendedSplit({ sessions: 3, minutes: 60 }), 3, 60);
    const pool = state.program.pool, d = 2; // Tuesday starts as rest
    const seq = [];
    state.program.week[d] = null;
    for (let i = 0; i < pool.length + 1; i++) { cycleProgramDay(d); seq.push(state.program.week[d]); }
    return { pool, seq };
  });
  // rest → pool[0] → pool[1] → pool[2] → back to rest
  expect(r.seq.slice(0, r.pool.length)).toEqual(r.pool);
  expect(r.seq[r.pool.length]).toBeNull();
});

test('programNextUp finds the next scheduled session within the coming week', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.program = buildProgramFromSplit(buildRecommendedSplit({ sessions: 3, minutes: 60 }), 3, 60);
    const today = new Date().getDay();
    // schedule a session exactly 2 days out and clear everything sooner so "next up" must be it
    state.program.week = [null, null, null, null, null, null, null];
    const target = (today + 2) % 7, id = state.plans[0].id;
    state.program.week[target] = id;
    state.program.pool = [id];
    const next = programNextUp();
    return { inDays: next ? next.inDays : null, planId: next ? next.planId : null, id };
  });
  expect(r.inDays).toBe(2);
  expect(r.planId).toBe(r.id);
});

test('the planner saves a program, renders a 7-day agenda, and Clear removes it', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.program = null; state.splitPlan = { sessions: 3, days: 5, minutes: 60 };
    navTo('split-planner');
    const host = document.getElementById('trk-main');
    const before = !!host.querySelector('#sp-program');
    host.querySelector('#pg-save').click();                 // save the recommended split as a program
    const host2 = document.getElementById('trk-main');
    const saved = { card: !!host2.querySelector('#sp-program'), cells: host2.querySelectorAll('.pg-day').length, today: host2.querySelectorAll('.pg-day.today').length, persisted: !!JSON.parse(localStorage.getItem('overload_tracker_v2')).program };
    host2.querySelector('#pg-clear').click();               // clear it
    const after = { card: !!document.getElementById('sp-program'), program: state.program, inKeys: SETTINGS_KEYS.includes('program') };
    return { before, saved, after };
  });
  expect(r.before).toBe(false);          // no program card before saving
  expect(r.saved.card).toBe(true);
  expect(r.saved.cells).toBe(7);          // a Mon–Sun agenda
  expect(r.saved.today).toBe(1);          // today highlighted exactly once
  expect(r.saved.persisted).toBe(true);   // travels with settings
  expect(r.after.card).toBe(false);       // Clear removed it
  expect(r.after.program).toBeNull();
  expect(r.after.inKeys).toBe(true);
});

test('tapping an agenda day reassigns it; the planner re-renders', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.program = buildProgramFromSplit(buildRecommendedSplit({ sessions: 3, minutes: 60 }), 3, 60);
    state.splitPlan = { sessions: 3, days: 5, minutes: 60 };
    navTo('split-planner');
    const before = state.program.week[2]; // Tuesday (rest)
    document.querySelector('#trk-main .pg-day[data-pg-dow="2"]').click();
    return { before, after: state.program.week[2], poolHas: state.program.pool.includes(state.program.week[2]) };
  });
  expect(r.before).toBeNull();   // was a rest day
  expect(r.after).toBeTruthy();  // …now holds a plan
  expect(r.poolHas).toBe(true);  // from the program's pool
});

test('the dashboard plan bar surfaces the session scheduled for today with a Start button', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const pid = state.plans[0].id;
    state.program = { name: 't', createdAt: '', sessions: 3, minutes: 60, pool: [pid], week: [null, null, null, null, null, null, null] };
    state.program.week[new Date().getDay()] = pid;                 // schedule TODAY
    const now = new Date().toISOString();
    state.sessions = [{ id: 'a', date: now, updatedAt: now, exercises: [] }]; // an active, plan-less session
    navTo('workout');
    const btn = document.querySelector('#trk-main #plan-today-btn');
    const planId = btn ? btn.dataset.todayPlan : null;
    if (btn) btn.click();
    return { hasBtn: !!btn, planId, sessionPlan: getActiveSession()?.planId, pid };
  });
  expect(r.hasBtn).toBe(true);
  expect(r.planId).toBe(r.pid);
  expect(r.sessionPlan).toBe(r.pid); // Start attached the scheduled plan to the workout
});
