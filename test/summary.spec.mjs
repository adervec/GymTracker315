// feat 284 — Weekly Summary (Reflect › Summary): distils each COMPLETE calendar week (Mon–Sun) into a few
// highlights (🌟) and lowlights (⚠️). The current, in-progress week is intentionally skipped.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof weekSummary === 'function' && typeof summaryWeeks === 'function'
    && typeof renderSummaryPage === 'function' && typeof startOfWeek === 'function' && typeof navTo === 'function', null, { timeout: 15000 });
});

// build a session N days ago with a single exercise (uses the first standard variation), w×r sets.
const seedWeeks = (page) => page.evaluate(() => {
  let v = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { v = u; break; } }
  const mk = (daysAgo, nSets, w, r, ended) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - daysAgo);
    const e = new Date(d.getTime() + 40 * 60000);
    return { id: 's' + daysAgo + '_' + Math.random(), date: d.toISOString(), updatedAt: e.toISOString(),
      endedAt: ended ? e.toISOString() : undefined, finalScore: ended ? { points: 80, grade: 'A' } : undefined,
      exercises: [{ varUuid: v, subUuid: null, sets: Array.from({ length: nSets }, () => ({ w, r })) }] };
  };
  // last complete week (≈8 days ago): a big week. The week before (≈15 days ago): a smaller week.
  state.program = null;
  state.sessions = [
    mk(8, 5, 100, 5, true), mk(9, 4, 100, 5, true), mk(10, 4, 100, 5, true), // last week: 3 sessions, 13 sets
    mk(15, 3, 80, 5, true),                                                   // week before: 1 session, 3 sets
  ];
  return v;
});

test('feat 284 — summaryWeeks skips the current week and summarises complete weeks most-recent-first', async ({ page }) => {
  await seedWeeks(page);
  const r = await page.evaluate(() => {
    const weeks = summaryWeeks(12);
    return {
      n: weeks.length,
      firstOffset: weeks[0].weekOffset,
      firstSessions: weeks[0].sessions,
      ordered: weeks.every((w, i) => i === 0 || weeks[i - 1].weekOffset < w.weekOffset),
    };
  });
  expect(r.n).toBeGreaterThanOrEqual(2);
  expect(r.firstOffset).toBeGreaterThanOrEqual(1);  // never the current (in-progress) week
  expect(r.firstSessions).toBe(3);                  // the most recent complete week had 3 sessions
  expect(r.ordered).toBe(true);                     // most-recent (smallest offset) first
});

test('feat 284 — a week produces sensible highlights (sets, top lift, score) and week-over-week deltas', async ({ page }) => {
  await seedWeeks(page);
  const r = await page.evaluate(() => {
    const weeks = summaryWeeks(12);
    const last = weeks[0];                       // 3 sessions, 13 sets, more than the prior week
    const txt = last.highlights.join(' | ');
    return {
      hasSets: /3 sessions · 13 sets/.test(txt),
      hasTop: /Top lift/.test(txt),
      hasScore: /Best session score: A/.test(txt),
      moreSessions: txt.includes('more session'),
      lowOfPrior: weeks[1].lowlights.join(' | '),
    };
  });
  expect(r.hasSets).toBe(true);
  expect(r.hasTop).toBe(true);
  expect(r.hasScore).toBe(true);
  expect(r.moreSessions).toBe(true);            // 3 vs 1 the week before → a highlight
});

test('feat 284 — the page renders one card per week with highlight/lowlight bullets', async ({ page }) => {
  await seedWeeks(page);
  const r = await page.evaluate(() => {
    navTo('summary');
    const main = document.getElementById('trk-main');
    return {
      page: currentPage,
      title: /Weekly Summary/.test(main.innerHTML),
      weekCards: main.querySelectorAll('.summary-week').length,
      hiBullets: main.querySelectorAll('.summary-list li.sm-hi').length,
      anyLo: main.querySelectorAll('.summary-list li.sm-lo').length,
    };
  });
  expect(r.page).toBe('summary');
  expect(r.title).toBe(true);
  expect(r.weekCards).toBeGreaterThanOrEqual(2);
  expect(r.hiBullets).toBeGreaterThan(0);
});

test('feat 284 — a no-training week shows a single "no training" lowlight', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { v = u; break; } }
    const mk = (daysAgo) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - daysAgo);
      return { id: 'x' + daysAgo, date: d.toISOString(), updatedAt: d.toISOString(), endedAt: d.toISOString(),
        exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 100, r: 5 }] }] }; };
    state.program = null;
    state.sessions = [mk(8), mk(22)];   // trained 8 and 22 days ago → the week ~15 days ago is empty (rest)
    const weeks = summaryWeeks(12);
    const rest = weeks.find(w => w.empty);
    return { hasRest: !!rest, restLow: rest ? rest.lowlights.join('') : '', restHi: rest ? rest.highlights.length : -1 };
  });
  expect(r.hasRest).toBe(true);
  expect(r.restLow).toContain('No training');
  expect(r.restHi).toBe(0);
});
