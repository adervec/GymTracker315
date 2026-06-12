// feat 180 — calendar view of the Log tab: a List/Calendar toggle, a month grid that highlights workout days
// (grade chip or dot, ×N for multiple sessions), prev/next/Today navigation, and tap-a-day to expand that day's
// session card(s) below.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderLogCalendar === 'function' && typeof renderSessionsLog === 'function' && typeof _shiftMonth === 'function', null, { timeout: 15000 });
});

// March 2026 (_calYM month index 2): two sessions on the 5th (×2), one on the 18th.
async function seedMarch(page) {
  await page.evaluate(() => {
    let u = null; for (const [k] of VAR_INDEX) { u = k; break; }
    state.sessions = [
      { id: 'a', date: '2026-03-05T10:00:00', endedAt: '2026-03-05T11:00:00', exercises: [{ varUuid: u, sets: [{ w: 100, r: 5 }] }] },
      { id: 'b', date: '2026-03-05T18:00:00', endedAt: '2026-03-05T19:00:00', exercises: [{ varUuid: u, sets: [{ w: 100, r: 5 }] }] },
      { id: 'c', date: '2026-03-18T09:00:00', endedAt: '2026-03-18T10:00:00', exercises: [{ varUuid: u, sets: [{ w: 100, r: 5 }] }] },
    ];
    _logView = 'calendar'; _calYM = { y: 2026, m: 2 }; _calSelDay = null;
  });
}

test('the Log tab offers a List/Calendar toggle that routes to the calendar', async ({ page }) => {
  await seedMarch(page);
  const r = await page.evaluate(() => {
    const main = document.createElement('div');
    renderSessionsLog(main); // _logView === 'calendar' → calendar
    return { hasToggle: !!main.querySelector('[data-log-view="calendar"]'), hasGrid: !!main.querySelector('.cal-grid.cal-days'), month: (main.querySelector('.cal-month') || {}).textContent };
  });
  expect(r.hasToggle).toBe(true);
  expect(r.hasGrid).toBe(true);
  expect(r.month).toMatch(/March 2026/);
});

test('the grid marks workout days (and only those), with ×N for multiple sessions', async ({ page }) => {
  await seedMarch(page);
  const r = await page.evaluate(() => {
    const main = document.createElement('div'); renderLogCalendar(main);
    const dow = main.querySelectorAll('.cal-dowh').length;
    const has = [...main.querySelectorAll('.cal-cell.has')];
    const day5 = main.querySelector('[data-cal-day="2026-2-5"]');
    const day6 = main.querySelector('[data-cal-day="2026-2-6"]'); // no workout
    return {
      dow, hasCount: has.length,
      day5Clickable: !!(day5 && day5.getAttribute('role') === 'button'),
      day5Multi: day5 ? /×2/.test(day5.textContent) : null,
      day6: day6, // should be null (not a button)
      numCells: main.querySelectorAll('.cal-days .cal-cell:not(.empty)').length, // 31 days in March
    };
  });
  expect(r.dow).toBe(7);
  expect(r.hasCount).toBe(2);          // only the 5th and the 18th
  expect(r.day5Clickable).toBe(true);
  expect(r.day5Multi).toBe(true);      // two sessions that day
  expect(r.day6).toBeNull();
  expect(r.numCells).toBe(31);
});

test('selecting a workout day expands that day’s session card(s); no selection shows a hint', async ({ page }) => {
  await seedMarch(page);
  const r = await page.evaluate(() => {
    const main = document.createElement('div');
    renderLogCalendar(main);
    const hintFirst = !!main.querySelector('.cal-hint') && !main.querySelector('.cal-detail');
    _calSelDay = '2026-2-5'; // the ×2 day
    const main2 = document.createElement('div'); renderLogCalendar(main2);
    const detail = main2.querySelector('.cal-detail');
    return { hintFirst, hasDetail: !!detail, detailCards: detail ? detail.querySelectorAll('[data-share-session]').length : 0, selMarked: !!main2.querySelector('.cal-cell.sel') };
  });
  expect(r.hintFirst).toBe(true);   // nothing selected → hint, no detail
  expect(r.hasDetail).toBe(true);
  expect(r.detailCards).toBe(2);    // both sessions on the 5th render as cards
  expect(r.selMarked).toBe(true);   // the selected cell is highlighted
});

test('month navigation wraps correctly across year boundaries', async ({ page }) => {
  const r = await page.evaluate(() => ({
    prevFromJan: _shiftMonth({ y: 2026, m: 0 }, -1),  // → Dec 2025
    nextFromDec: _shiftMonth({ y: 2026, m: 11 }, 1),  // → Jan 2027
    plus3: _shiftMonth({ y: 2026, m: 10 }, 3),        // Nov 2026 +3 → Feb 2027
  }));
  expect(r.prevFromJan).toEqual({ y: 2025, m: 11 });
  expect(r.nextFromDec).toEqual({ y: 2027, m: 0 });
  expect(r.plus3).toEqual({ y: 2027, m: 1 });
});

test('prev / next / Today controls are present', async ({ page }) => {
  await seedMarch(page);
  const r = await page.evaluate(() => {
    const main = document.createElement('div'); renderLogCalendar(main);
    return { prev: !!main.querySelector('#cal-prev'), next: !!main.querySelector('#cal-next'), today: !!main.querySelector('#cal-today') };
  });
  expect(r.prev).toBe(true);
  expect(r.next).toBe(true);
  expect(r.today).toBe(true);
});
