// feat 310 — each weekly summary gets an overall letter grade (S…D, the session-score scale via gradeFor),
// from work done, consistency/adherence, progression vs last week and best-session quality.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof weekSummary === 'function' && typeof renderSummaryPage === 'function'
    && typeof gradeFor === 'function', null, { timeout: 15000 });
});

test('weekSummary assigns a letter grade + points; busier weeks score higher; rest weeks are ungraded', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = (() => { for (const [x] of VAR_INDEX) if (exMode(x).mode === 'standard') return x; })();
    state.program = null;
    // N sessions, all within THIS week (hour offsets so weekday alignment can't push them out)
    const mk = (n) => { const a = []; for (let i = 0; i < n; i++) a.push({ id: 's' + i, date: new Date(Date.now() - i * 3600000).toISOString(), exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }] }); return a; };
    state.sessions = mk(4); const strong = weekSummary(0);
    state.sessions = mk(1); const weak = weekSummary(0);
    state.sessions = []; const empty = weekSummary(0);
    return { strong: { g: strong.grade, p: strong.gradePoints }, weak: { g: weak.grade, p: weak.gradePoints }, emptyGrade: empty.grade, emptyFlag: empty.empty };
  });
  expect(['S', 'A', 'B', 'C', 'D']).toContain(r.strong.g);
  expect(r.strong.p).toBeGreaterThanOrEqual(0);
  expect(r.strong.p).toBeLessThanOrEqual(100);
  expect(r.strong.p).toBeGreaterThan(r.weak.p);   // a fuller, progressing week grades higher
  expect(r.emptyFlag).toBe(true);
  expect(r.emptyGrade).toBeUndefined();            // a rest week isn't graded
});

test('the Summary page renders a grade badge on a complete week', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = (() => { for (const [x] of VAR_INDEX) if (exMode(x).mode === 'standard') return x; })();
    state.program = null;
    // sessions dated 1-3 days ago → land in last week (a COMPLETE week the Summary page lists)
    state.sessions = [1, 2, 3].map(d => ({ id: 's' + d, date: new Date(Date.now() - d * 86400000).toISOString(), exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] }));
    const main = document.getElementById('trk-main');
    renderSummaryPage(main);
    const badge = main.querySelector('.summary-grade');
    return { has: !!badge, text: badge ? badge.textContent.trim() : null };
  });
  expect(r.has).toBe(true);
  expect(['S', 'A', 'B', 'C', 'D']).toContain(r.text);
});
