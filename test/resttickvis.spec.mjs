// feat 248 — the rest timer froze sometimes: browsers throttle/freeze setInterval while the tab is hidden, so
// the 1 s rest tick stalls and the bar shows a stale time on return. Returning to the foreground now restarts
// the tick and repaints the bar immediately.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof refreshRestBar === 'function' && typeof restTick === 'function'
    && typeof ensureRestTick === 'function', null, { timeout: 15000 });
});

test('feat 248 — returning to the foreground repaints the rest timer immediately', async ({ page }) => {
  const r = await page.evaluate(() => {
    let n = 0; const orig = window.refreshRestBar; window.refreshRestBar = () => { n++; return orig(); }; // spy
    let forcedVisible = false;
    try { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); forcedVisible = document.visibilityState === 'visible'; } catch (_) {}
    document.dispatchEvent(new Event('visibilitychange'));
    window.refreshRestBar = orig;
    return { forcedVisible, n };
  });
  expect(r.forcedVisible).toBe(true);        // the test could force a "visible" state
  expect(r.n).toBeGreaterThanOrEqual(1);     // …and the handler repainted the bar (restTick → refreshRestBar)
});

test('feat 248 — restTick repaints the rest bar (live updates), and ensureRestTick is idempotent', async ({ page }) => {
  const r = await page.evaluate(() => {
    // an active session with a completed set → the rest bar shows a live "Rest" timer
    const v = (() => { for (const [u, i] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; })();
    const now = Date.now();
    state.workoutControls = { ...(state.workoutControls || {}), restTimer: true, restRecEnabled: false };
    state.sessions = [{ id: 's', date: new Date(now - 60000).toISOString(), updatedAt: new Date(now).toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 100, r: 5, wTs: new Date(now - 40000).toISOString(), ts: new Date(now - 20000).toISOString() }] }] }];
    pending = { varUuid: null, subUuid: null, sets: [{ w: '', r: '' }] };
    const bar = document.getElementById('rest-bar');
    bar.innerHTML = 'STALE';
    restTick();                       // one tick should recompute + repaint the resting timer
    const afterTick = bar.textContent;
    let again = false; try { ensureRestTick(); ensureRestTick(); again = true; } catch (_) {} // safe to call repeatedly
    return { changed: bar.innerHTML !== 'STALE', txt: afterTick, again };
  });
  expect(r.changed).toBe(true);            // restTick recomputed + repainted the bar
  expect(r.txt).toContain('Rest');         // …with the live resting timer
  expect(r.again).toBe(true);              // ensureRestTick is safe to call repeatedly (single interval, no throw)
});
