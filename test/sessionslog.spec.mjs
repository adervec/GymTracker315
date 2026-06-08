// feat 146 — the default tab is now "Dashboard" (today only); a separate "Log" tab lists every session
// (today + recent + all-time), newest-first and PAGINATED so a long history isn't dumped at once.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSessionsLog === 'function' && typeof window.switchToTab === 'function', null, { timeout: 15000 });
});

// Seed N sessions: index 0 = today, then one per prior day, each with `setsPer` sets of a standard lift.
const seed = (page, n, setsPer = 2) => page.evaluate(({ n, setsPer }) => {
  let u = null; for (const [v] of VAR_INDEX) { if (exMode(v).mode === 'standard') { u = v; break; } }
  const day = 86400000, now = Date.now();
  state.sessions = Array.from({ length: n }, (_, i) => ({
    id: 's' + i,
    date: new Date(now - i * day).toISOString(),
    endedAt: i === 0 ? null : new Date(now - i * day + 3600000).toISOString(),
    exercises: [{ varUuid: u, subUuid: null, sets: Array.from({ length: setsPer }, () => ({ w: 100, r: 5 })) }],
  }));
  _sessionsLogPage = 0;
}, { n, setsPer });

test('the tab bar renames the default to "Dashboard" and adds a separate "Log" tab', async ({ page }) => {
  const r = await page.evaluate(() => ({
    dash: document.querySelector('.tab[data-tab="log"]')?.textContent.trim(),
    log: document.querySelector('.tab[data-tab="sessions"]')?.textContent.trim(),
    history: document.querySelector('.tab[data-tab="history"]')?.textContent.trim(),
  }));
  expect(r.dash).toBe('Dashboard');
  expect(r.log).toBe('Log');
  expect(r.history).toBe('History'); // History stays as its own (filtered) view
});

test('the Dashboard shows only today (not older sessions) + a link to the Log', async ({ page }) => {
  await seed(page, 5);
  const r = await page.evaluate(() => {
    switchToTab('log');
    const main = document.getElementById('trk-main');
    return {
      sessionItems: main.querySelectorAll('.session-item').length, // only today's session
      hasSeeLog: !!main.querySelector('#dash-see-log'),
      noAllTime: !main.textContent.includes('All-Time'),
    };
  });
  expect(r.sessionItems).toBe(1);   // today only
  expect(r.hasSeeLog).toBe(true);   // a jump-to-Log affordance
  expect(r.noAllTime).toBe(true);   // the All-Time block moved off the Dashboard
});

test('the Log tab paginates the full session list newest-first', async ({ page }) => {
  await seed(page, 25);
  const r = await page.evaluate(() => {
    switchToTab('sessions');
    const main = document.getElementById('trk-main');
    const page1 = main.querySelectorAll('.session-item').length;
    const pagerText = main.querySelector('.slog-page')?.textContent;
    const total = main.querySelector('.stat-value')?.textContent; // first stat tile = Sessions
    const prevDisabled = main.querySelector('#slog-prev')?.disabled;
    // go to the next (older) page
    main.querySelector('#slog-next').click();
    const main2 = document.getElementById('trk-main');
    const page2 = main2.querySelectorAll('.session-item').length;
    const pager2 = main2.querySelector('.slog-page')?.textContent;
    // jump forward to the last page
    main2.querySelector('#slog-next').click();
    const main3 = document.getElementById('trk-main');
    const page3 = main3.querySelectorAll('.session-item').length;
    const nextDisabled3 = main3.querySelector('#slog-next')?.disabled;
    return { page1, pagerText, total, prevDisabled, page2, pager2, page3, nextDisabled3 };
  });
  expect(r.total).toBe('25');
  expect(r.page1).toBe(10);            // SESSIONS_PER_PAGE
  expect(r.pagerText).toBe('Page 1 / 3');
  expect(r.prevDisabled).toBe(true);   // newest page → no "Newer"
  expect(r.page2).toBe(10);
  expect(r.pager2).toBe('Page 2 / 3');
  expect(r.page3).toBe(5);             // 25 = 10 + 10 + 5
  expect(r.nextDisabled3).toBe(true);  // oldest page → no "Older"
});

test('with few sessions the Log shows them all with no pager', async ({ page }) => {
  await seed(page, 4);
  const r = await page.evaluate(() => {
    switchToTab('sessions');
    const main = document.getElementById('trk-main');
    return { items: main.querySelectorAll('.session-item').length, hasPager: !!main.querySelector('.slog-pager') };
  });
  expect(r.items).toBe(4);
  expect(r.hasPager).toBe(false); // single page → no pagination controls
});

test('the Dashboard "see Log" link switches to the Log tab', async ({ page }) => {
  await seed(page, 6);
  const r = await page.evaluate(() => {
    switchToTab('log');
    document.getElementById('dash-see-log').click();
    const main = document.getElementById('trk-main');
    return { tab: currentTab, hasSessions: main.querySelectorAll('.session-item').length > 0, tabActive: document.querySelector('.tab[data-tab="sessions"]').classList.contains('active') };
  });
  expect(r.tab).toBe('sessions');
  expect(r.hasSessions).toBe(true);
  expect(r.tabActive).toBe(true);
});
