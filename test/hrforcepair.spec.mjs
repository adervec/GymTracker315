// feat 541 — "make me pair HR": at workout start an unconnected monitor gets the chooser or a tap-to-pair
// toast, and a second nag 90 s in. Off by default.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof hrForcePairOnStart === 'function' && typeof startWorkout === 'function', null, { timeout: 15000 });
  await page.evaluate(() => {
    state.sessions = []; state.readonly = false;
    hrSupported = () => true; window._pairs = 0; hrConnect = async () => { window._pairs++; };
    hrTryReconnect = async () => {};
  });
});

test('feat 541 — off by default: starting a workout never nags', async ({ page }) => {
  await page.evaluate(() => { delete state.workoutControls.hrForcePair; state.hrDevice = { id: 'x', name: 'Strap' }; startWorkout(); });
  await page.clock.fastForward(100000);
  const r = await page.evaluate(() => ({ pairs: _pairs, toast: document.getElementById('trk-toast').textContent }));
  expect(r.pairs).toBe(0);
  expect(r.toast).not.toContain('tap to pair');
});

test('feat 541 — a remembered monitor that does not come back gets a tap-to-pair toast, then a second nag', async ({ page }) => {
  await page.evaluate(() => { state.workoutControls.hrForcePair = true; state.hrDevice = { id: 'x', name: 'Strap' }; _hrConnected = false; startWorkout(); });
  await page.clock.fastForward(4500);
  const first = await page.evaluate(() => document.getElementById('trk-toast').textContent);
  await page.evaluate(() => document.getElementById('trk-toast').click());   // the tap is the gesture the chooser needs
  await page.clock.fastForward(90000);
  const second = await page.evaluate(() => ({ t: document.getElementById('trk-toast').textContent, pairs: _pairs }));
  expect(first).toContain('tap to pair');
  expect(second.pairs).toBe(1);
  expect(second.t).toContain('Still no heart-rate monitor');
});

test('feat 541 — once connected, no nag', async ({ page }) => {
  await page.evaluate(() => { state.workoutControls.hrForcePair = true; state.hrDevice = { id: 'x', name: 'Strap' }; _hrConnected = false; startWorkout(); _hrConnected = true; });
  await page.clock.fastForward(100000);
  const t = await page.evaluate(() => document.getElementById('trk-toast').textContent);
  await page.evaluate(() => { _hrConnected = false; });
  expect(t).not.toContain('tap to pair');
});

test('feat 541 — the setting is in the drawer next to auto-connect', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const on = document.querySelector('[data-wc="hrForcePair"][data-wc-val="on"]');
    on.click();
    return state.workoutControls.hrForcePair;
  });
  expect(r).toBe(true);
});
