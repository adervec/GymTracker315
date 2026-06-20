// feat 282 — a split can be LONGER than a calendar week. ≤7 days keeps the familiar weekday program; >7 days
// saves as a rotating N-day cycle anchored to a start date ("today" computed by rotation, repeats every N days
// regardless of weekday). Hybrid: both modes resolve a date → planId through one path, so adherence works for
// either. Max split length 28.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildProgramFromSplit === 'function' && typeof scheduledPlanIdForDate === 'function'
    && typeof rotationDayIndex === 'function' && typeof cycleProgramRotDay === 'function'
    && typeof renderSplitPlannerPage === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('buildProgramFromSplit builds a rotating cycle when the split exceeds 7 days', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const split = buildRecommendedSplit({ sessions: 4, minutes: 60 });
    const prog = buildProgramFromSplit(split, 4, 60, 10);
    return {
      mode: prog.mode, splitLen: prog.splitLen, rotLen: prog.rotation.length,
      trainingDays: prog.rotation.filter(Boolean).length, rest: prog.rotation.filter(x => !x).length,
      hasStart: /^\d{4}-\d{2}-\d{2}$/.test(prog.start), hasWeek: !!prog.week, pool: prog.pool.length,
    };
  });
  expect(r.mode).toBe('rotation');
  expect(r.splitLen).toBe(10);
  expect(r.rotLen).toBe(10);
  expect(r.trainingDays).toBe(4);   // four sessions placed across the cycle
  expect(r.rest).toBe(6);           // 10 − 4 rest days
  expect(r.hasStart).toBe(true);
  expect(r.hasWeek).toBe(false);    // a rotation has no Mon–Sun week[7]
  expect(r.pool).toBeGreaterThanOrEqual(1);
});

test('a ≤7-day split still builds the weekday program (no rotation)', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const prog = buildProgramFromSplit(buildRecommendedSplit({ sessions: 3, minutes: 60 }), 3, 60, 5);
    return { hasWeek: Array.isArray(prog.week) && prog.week.length === 7, mode: prog.mode || 'week' };
  });
  expect(r.hasWeek).toBe(true);
  expect(r.mode).toBe('week');
});

test('scheduledPlanIdForDate rotates by the cycle length; rest days are null; it wraps both directions', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.program = { name: 't', createdAt: '', sessions: 3, minutes: 60, mode: 'rotation', splitLen: 8,
      start: '2026-06-15', pool: ['A', 'B', 'C'], rotation: ['A', null, 'B', null, 'C', null, null, null] };
    const at = (k) => { const d = new Date('2026-06-15T00:00:00'); d.setDate(d.getDate() + k); return scheduledPlanIdForDate(d); };
    return {
      d0: at(0), d1: at(1), d2: at(2), d4: at(4),
      wrap0: at(8), wrap2: at(10), back: at(-8),
      idx4: rotationDayIndex(state.program, new Date('2026-06-19T00:00:00')),
    };
  });
  expect(r.d0).toBe('A');
  expect(r.d1).toBeNull();   // a rest slot
  expect(r.d2).toBe('B');
  expect(r.d4).toBe('C');
  expect(r.wrap0).toBe('A'); // start + 8 wraps back to Day 1
  expect(r.wrap2).toBe('B'); // start + 10 → Day 3
  expect(r.back).toBe('A');  // 8 days before the start also lands on Day 1
  expect(r.idx4).toBe(4);
});

test('cycleProgramRotDay cycles a rotation slot Rest → each pool plan → Rest', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.program = { name: 't', createdAt: '', sessions: 2, minutes: 60, mode: 'rotation', splitLen: 8,
      start: '2026-06-15', pool: ['A', 'B'], rotation: new Array(8).fill(null) };
    const seq = [];
    for (let i = 0; i < 3; i++) { cycleProgramRotDay(0); seq.push(state.program.rotation[0]); }
    return seq;
  });
  expect(r).toEqual(['A', 'B', null]);
});

test('normalizeState keeps a valid rotation program and drops a malformed one', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.program = { name: 't', createdAt: '', sessions: 3, minutes: 60, mode: 'rotation', splitLen: 9,
      start: '2026-06-15', pool: ['A'], rotation: new Array(9).fill(null).map((_, i) => (i === 0 ? 'A' : null)) };
    normalizeState();
    const survived = !!state.program && state.program.mode === 'rotation';
    state.program = { mode: 'rotation', splitLen: 9, start: 'x', pool: ['A'], rotation: [null, null] }; // length mismatch
    normalizeState();
    const dropped = state.program === null;
    return { survived, dropped };
  });
  expect(r.survived).toBe(true);
  expect(r.dropped).toBe(true);
});

test('the planner saves a >7-day split as a rotating cycle and renders a Day 1…N agenda', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.program = null; state.splitPlan = { sessions: 3, days: 10, minutes: 60 };
    navTo('split-planner');
    const host = document.getElementById('trk-main');
    const longNote = (host.textContent || '').includes('rotating cycle'); // the >7 advisory note
    host.querySelector('#pg-save').click();
    const host2 = document.getElementById('trk-main');
    const prog = state.program;
    return {
      longNote,
      rotCells: host2.querySelectorAll('.pg-day[data-pg-rot]').length,
      dowCells: host2.querySelectorAll('.pg-day[data-pg-dow]').length,
      title: host2.querySelector('#sp-program .card-title span')?.textContent || '',
      mode: prog && prog.mode, splitLen: prog && prog.splitLen,
    };
  });
  expect(r.longNote).toBe(true);
  expect(r.mode).toBe('rotation');
  expect(r.splitLen).toBe(10);
  expect(r.rotCells).toBe(10);   // a Day 1…10 agenda
  expect(r.dowCells).toBe(0);    // not a Mon–Sun agenda
  expect(r.title).toContain('10-day');
});

test('the planner offers split lengths beyond 7, up to 28, and the label reads "Days in the split"', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.splitPlan = { sessions: 3, days: 7, minutes: 60 };
    const main = document.getElementById('trk-main');
    renderSplitPlannerPage(main);
    const dayVals = [...main.querySelectorAll('[data-sp-days]')].map(b => +b.dataset.spDays);
    const labels = [...main.querySelectorAll('.sp-input-lbl')].map(e => e.textContent);
    return { dayVals, max: Math.max(...dayVals), hasBeyond7: dayVals.some(d => d > 7), labels };
  });
  expect(r.hasBeyond7).toBe(true);
  expect(r.max).toBe(28);
  expect(r.labels).toContain('Days in the split');
  expect(r.labels).not.toContain('Days / week');
});
