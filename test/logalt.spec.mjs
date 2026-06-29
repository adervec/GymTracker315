// feat 372 — on the Log page each workout's background mildly alternates (every other session gets `.alt`) so adjacent
// sessions read as distinct.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof renderSession === 'function', null, { timeout: 15000 });
});

test('feat 372 — every other session card carries the .alt class on the Log', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null; for (const [id] of VAR_INDEX) { if (exMode(id).mode === 'standard') { u = id; break; } }
    const day = 86400000, now = Date.now();
    state.sessions = Array.from({ length: 5 }, (_, i) => ({
      id: 's' + i, date: new Date(now - i * day).toISOString(), endedAt: new Date(now - i * day + 3600000).toISOString(),
      exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] }],
    }));
    _logView = 'list'; _logMinGrade = ''; _sessionsLogPage = 0;
    navTo('log', { replace: true });
    const items = [...document.querySelectorAll('#trk-main .session-item')];
    return { count: items.length, altFlags: items.map(el => el.classList.contains('alt')) };
  });
  expect(r.count).toBe(5);
  // newest-first; index 0,2,4 plain · 1,3 alternated
  expect(r.altFlags).toEqual([false, true, false, true, false]);
});

test('feat 372 — the alt class only appears on the Log list, not on the single "today" card', async ({ page }) => {
  const onlyToday = await page.evaluate(() => {
    const html = renderSession({ id: 't', date: new Date().toISOString(), exercises: [] }, true); // no index → no alternation
    const d = document.createElement('div'); d.innerHTML = html;
    return d.querySelector('.session-item').classList.contains('alt');
  });
  expect(onlyToday).toBe(false);
});
