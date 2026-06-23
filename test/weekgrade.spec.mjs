// feat 310 — each weekly summary gets an overall letter grade (S…D, the session-score scale via gradeFor),
// from work done, consistency/adherence, progression vs last week and best-session quality.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof weekSummary === 'function' && typeof renderSummaryPage === 'function'
    && typeof gradeFor === 'function' && typeof weekGradeBreakdown === 'function', null, { timeout: 15000 });
});

// feat 313 — option to see the weighting + rationale behind each grade
test('weekGradeBreakdown itemises the four weighted ingredients and matches the grade', async ({ page }) => {
  const r = await page.evaluate(() => {
    const agg = { sets: 12, volume: 6000, bestScore: { points: 82, grade: 'A' } };
    const pAgg = { volume: 5000 };
    const gb = weekGradeBreakdown(4, agg, pAgg, null);
    const sum = gb.parts.reduce((s, p) => s + p.earned, 0);
    return {
      keys: gb.parts.map(p => p.key),
      allWithinMax: gb.parts.every(p => p.earned >= 0 && p.earned <= p.max),
      allHaveNote: gb.parts.every(p => typeof p.note === 'string' && p.note.length > 0),
      maxTotal: gb.parts.reduce((s, p) => s + p.max, 0),
      sum, points: gb.points, grade: gb.grade, gradeForPoints: gradeFor(gb.points),
    };
  });
  expect(r.keys).toEqual(['work', 'consistency', 'progression', 'quality']);
  expect(r.allWithinMax).toBe(true);
  expect(r.allHaveNote).toBe(true);
  expect(r.maxTotal).toBe(100);                 // 45 + 25 + 20 + 10
  expect(Math.abs(r.sum - r.points)).toBeLessThanOrEqual(1); // rounded parts ≈ the grade points
  expect(r.grade).toBe(r.gradeForPoints);
});

test('weekSummary carries gradeParts that explain the grade', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = (() => { for (const [x] of VAR_INDEX) if (exMode(x).mode === 'standard') return x; })();
    state.program = null;
    state.sessions = [1, 2, 3].map(d => ({ id: 's' + d, date: new Date(Date.now() - d * 86400000).toISOString(), exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] }] }));
    const w = weekSummary(1);
    return { hasParts: Array.isArray(w.gradeParts), n: w.gradeParts && w.gradeParts.length, adheresToGrade: !!w.grade };
  });
  expect(r.hasParts).toBe(true);
  expect(r.n).toBe(4);
  expect(r.adheresToGrade).toBe(true);
});

test('the Summary page reveals the breakdown on tapping a grade badge', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = (() => { for (const [x] of VAR_INDEX) if (exMode(x).mode === 'standard') return x; })();
    state.program = null;
    state.sessions = [1, 2, 3].map(d => ({ id: 's' + d, date: new Date(Date.now() - d * 86400000).toISOString(), exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] }] }));
    const main = document.getElementById('trk-main');
    renderSummaryPage(main);
    const badge = main.querySelector('.summary-grade[data-grade-toggle]');
    const detail = main.querySelector('.summary-grade-detail');
    const hiddenBefore = detail.hidden;
    badge.click();
    const hiddenAfter = detail.hidden;
    return { hasBadge: !!badge, hiddenBefore, hiddenAfter, rows: detail.querySelectorAll('.sgd-row').length, hasTotal: !!detail.querySelector('.sgd-total') };
  });
  expect(r.hasBadge).toBe(true);
  expect(r.hiddenBefore).toBe(true);   // hidden by default — it's an OPTION to see it
  expect(r.hiddenAfter).toBe(false);   // tapping reveals it
  expect(r.rows).toBe(4);              // one row per weighted ingredient
  expect(r.hasTotal).toBe(true);       // …and the total → grade line
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
