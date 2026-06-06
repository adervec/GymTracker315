// feat 108 — End Workout: a tap asks for confirmation (endWorkout(false)); a long-press skips the
// confirm popup and ends immediately (endWorkout(true)), via the tracker-press gesture.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && typeof window.newSession === 'function', null, { timeout: 15000 });
});

test('tap End Workout confirms; long-press skips the confirm popup', async ({ page }) => {
  const r = await page.evaluate(async () => {
    // an active (un-ended) session so the End Workout button renders on the Log tab
    state.sessions = [newSession({ startedManually: true })];
    if (typeof currentTab !== 'undefined') currentTab = 'log';
    state.trackerPress = { shortMs: 0, longMs: 1000 }; // shorten the hold threshold for the test
    state.readonly = false;
    render();
    const btn = document.getElementById('wc-end-btn');
    if (!btn) return { err: 'no end button' };

    const calls = [];
    window.endWorkout = (skip) => { calls.push(skip === true); }; // spy (avoid the real dialog/end)
    const pd = () => btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const pu = () => btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    pd(); await wait(40); pu(); await wait(20);     // quick tap
    const afterTap = calls.slice();

    pd(); await wait(1150); pu(); await wait(20);    // hold past 1s
    const afterHold = calls.slice();

    return { afterTap, afterHold };
  });
  expect(r.err).toBeUndefined();
  expect(r.afterTap).toEqual([false]);            // tap -> confirm (skipConfirm=false)
  expect(r.afterHold).toEqual([false, true]);     // hold -> skip the popup (skipConfirm=true)
});
