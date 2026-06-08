// feat 160 — hold a Screen Wake Lock during an active workout so the display stays on and audio/haptic
// cues keep firing (a web app can't play them when the screen is locked / app closed). Gated by the
// keepAwake setting (default on) and by having an active workout; released on end/discard.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.acquireWakeLock === 'function' && typeof window.wakeLockEnabled === 'function', null, { timeout: 15000 });
});

test('acquires during an active workout and releases cleanly', async ({ page }) => {
  const r = await page.evaluate(async () => {
    let released = 0, requests = 0;
    const fake = { release: async () => { released++; }, addEventListener: () => {} };
    if (!('wakeLock' in navigator)) navigator.wakeLock = {};
    navigator.wakeLock.request = async () => { requests++; return fake; };
    state.workoutControls = { ...state.workoutControls, keepAwake: true };
    state.sessions = [{ id: 't', date: new Date().toISOString(), exercises: [] }]; // active
    await acquireWakeLock();
    const held = !!_wakeLock && requests === 1;
    await releaseWakeLock();
    return { supported: wakeLockSupported(), held, released, cleared: !_wakeLock };
  });
  expect(r.supported).toBe(true);
  expect(r.held).toBe(true);
  expect(r.released).toBe(1);
  expect(r.cleared).toBe(true);
});

test('gated off by the keepAwake setting and by having no active workout', async ({ page }) => {
  const r = await page.evaluate(async () => {
    if (!('wakeLock' in navigator)) navigator.wakeLock = {};
    navigator.wakeLock.request = async () => ({ release: async () => {}, addEventListener: () => {} });
    // setting OFF, with an active session
    state.workoutControls = { ...state.workoutControls, keepAwake: false };
    state.sessions = [{ id: 't', date: new Date().toISOString(), exercises: [] }];
    await acquireWakeLock();
    const offBlocked = !_wakeLock && wakeLockEnabled() === false;
    // setting ON but NO active session
    state.workoutControls.keepAwake = true; state.sessions = [];
    await acquireWakeLock();
    const noSessionBlocked = !_wakeLock;
    return { offBlocked, noSessionBlocked };
  });
  expect(r.offBlocked).toBe(true);
  expect(r.noSessionBlocked).toBe(true);
});

test('the settings drawer offers a Keep-screen-awake toggle with the honest explanation', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const html = document.getElementById('settings-drawer-body').innerHTML;
    return { has: html.includes('Keep screen awake during workout'), explains: html.includes('locked') && html.includes('OS limit'), toggle: html.includes('data-wc="keepAwake"') };
  });
  expect(r.has).toBe(true);
  expect(r.explains).toBe(true);  // honest about the locked-screen limitation
  expect(r.toggle).toBe(true);
});
