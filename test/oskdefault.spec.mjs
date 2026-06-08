// feat 150 — the on-screen numpad (OSK) is ON by default for fresh installs, and the settings toggle
// strongly recommends keeping it on.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test('OSK defaults ON for a fresh install', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof normalizeState === 'function' && typeof state !== 'undefined' && !!state.workoutControls, null, { timeout: 15000 });
  const r = await page.evaluate(() => ({
    osk: state.workoutControls.onScreenNumpad,
    normalized: (() => { normalizeState(); return state.workoutControls.onScreenNumpad; })(),
  }));
  expect(r.osk).toBe(true);
  expect(r.normalized).toBe(true);
});

test('the OSK setting strongly recommends keeping it on', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSettingsDrawer === 'function', null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const html = document.getElementById('settings-drawer-body').innerHTML;
    // find the On pill for onScreenNumpad and check it carries the recommended cue
    return {
      hasBadge: html.includes('setting-rec') && html.includes('Recommended'),
      strong: html.includes('Strongly recommended'),
      onStar: /data-wc="onScreenNumpad" data-wc-val="on">On ★/.test(html),
    };
  });
  expect(r.hasBadge).toBe(true);
  expect(r.strong).toBe(true);
  expect(r.onStar).toBe(true);
});

test('toggling the OSK pill off then on persists the choice (off is explicit)', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSettingsDrawer === 'function', null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    state.workoutControls = { ...state.workoutControls, onScreenNumpad: true };
    state.workoutControls.onScreenNumpad = false; saveState();
    const off = JSON.parse(localStorage.getItem('overload_tracker_v2')).workoutControls.onScreenNumpad;
    state.workoutControls.onScreenNumpad = true; saveState();
    const on = JSON.parse(localStorage.getItem('overload_tracker_v2')).workoutControls.onScreenNumpad;
    return { off, on };
  });
  expect(r.off).toBe(false); // an explicit off is respected (not force-migrated)
  expect(r.on).toBe(true);
});
