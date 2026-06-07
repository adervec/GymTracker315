// feat 106 — auto-connect the previous HR monitor when a workout starts (default on, toggleable via
// workoutControls.hrAutoConnect). startWorkout() only fires the silent reconnect when it's enabled.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.startWorkout === 'function' && typeof window.hrTryReconnect === 'function', null, { timeout: 15000 });
});

test('hrAutoConnect defaults on', async ({ page }) => {
  const on = await page.evaluate(() => { normalizeState(); return (state.workoutControls || {}).hrAutoConnect; });
  expect(on).toBe(true);
});

test('startWorkout reconnects the last HR device only when the setting is on', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false;
    let calls = 0;
    window.hrTryReconnect = () => { calls++; };           // spy (the real one is async + no-ops without a device)
    state.hrDevice = { id: 'dev1', name: 'Strap' };

    // ON -> reconnect attempted
    state.sessions = []; clearPending && clearPending();
    state.workoutControls.hrAutoConnect = true;
    startWorkout();
    const onCalls = calls;

    // OFF -> not attempted (the gate is before the active-session check, so a clean start each time)
    state.sessions = []; clearPending && clearPending();
    state.workoutControls.hrAutoConnect = false;
    startWorkout();
    const offCalls = calls - onCalls;

    return { onCalls, offCalls };
  });
  expect(r.onCalls).toBe(1);
  expect(r.offCalls).toBe(0);
});
