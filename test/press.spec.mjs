// feat 96 — Tracker-tab button press timing: a configurable short-press (tap; default instant) vs
// press-and-hold long-press (default 2s) that fires a separate shortcut. `attachTrackerPress`
// classifies the press; the long-press time also drives the existing hold-to-confirm.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.attachTrackerPress === 'function', null, { timeout: 15000 });
});

test('trackerPress defaults to instant/2s and is a preserved setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    saveState();
    const persisted = JSON.parse(localStorage.getItem('overload_tracker_v2')).trackerPress;
    const inKeys = typeof SETTINGS_KEYS !== 'undefined' && SETTINGS_KEYS.includes('trackerPress');
    return { persisted, inKeys };
  });
  expect(r.persisted).toEqual({ shortMs: 0, longMs: 2000 });
  expect(r.inKeys).toBe(true);
});

test('long-press is always kept at least 1s beyond short-press', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.trackerPress = { shortMs: 2000, longMs: 2000 }; // long not > short + 1s
    const cfg = trackerPressCfg();
    state.trackerPress = { shortMs: -100, longMs: 50 };   // out-of-range
    normalizeState();
    return { cfg, norm: { ...state.trackerPress } };
  });
  expect(r.cfg.shortMs).toBe(2000);
  expect(r.cfg.longMs).toBe(3000);              // bumped to short + 1s
  expect(r.norm.shortMs).toBe(0);               // clamped >= 0
  expect(r.norm.longMs).toBeGreaterThanOrEqual(r.norm.shortMs + 1000);
});

test('attachTrackerPress: a tap fires onShort, a hold fires onLong (not both)', async ({ page }) => {
  const r = await page.evaluate(async () => {
    // longMs is floored to >= shortMs + 1000 (the 1s rule), so the hold must clear ~1s.
    state.trackerPress = { shortMs: 0, longMs: 1000 };
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    let shortN = 0, longN = 0;
    attachTrackerPress(btn, () => shortN++, () => longN++, 'Test');
    const pd = () => btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const pu = () => btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    pd(); pu(); await wait(40);          // quick tap -> short
    const afterTap = { shortN, longN };

    pd(); await wait(1150); pu(); await wait(20); // hold past longMs -> long
    return { afterTap, final: { shortN, longN } };
  });
  expect(r.afterTap).toEqual({ shortN: 1, longN: 0 });
  expect(r.final.shortN).toBe(1); // the hold did NOT also fire a tap
  expect(r.final.longN).toBe(1);
});

test('progress indicator: a non-instant short press shows a charging fill that then arms', async ({ page }) => {
  const r = await page.evaluate(async () => {
    state.trackerPress = { shortMs: 300, longMs: 2000 };
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    attachTrackerPress(btn, () => {}, null, ''); // short-only, non-instant
    const snap = () => ({ holding: btn.classList.contains('lp-holding'), armed: btn.classList.contains('lp-armed'), lp: parseFloat(btn.style.getPropertyValue('--lp')) || 0 });
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 130));
    const charging = snap();   // before shortMs: holding, not yet armed, fill growing
    await new Promise((r) => setTimeout(r, 260));
    const armed = snap();      // past shortMs: armed
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const released = snap();   // cleared on release
    return { charging, armed, released };
  });
  expect(r.charging.holding).toBe(true);
  expect(r.charging.armed).toBe(false);
  expect(r.charging.lp).toBeGreaterThan(0);
  expect(r.armed.armed).toBe(true);
  expect(r.released.holding).toBe(false);
});

test('progress indicator: an instant tap with no long action shows nothing', async ({ page }) => {
  const holding = await page.evaluate(async () => {
    state.trackerPress = { shortMs: 0, longMs: 2000 };
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    attachTrackerPress(btn, () => {}, null, ''); // instant + no long -> no indicator
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const h = btn.classList.contains('lp-holding');
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return h;
  });
  expect(holding).toBe(false);
});

test('a press shorter than shortMs is ignored (accidental-tap guard)', async ({ page }) => {
  const fired = await page.evaluate(async () => {
    state.trackerPress = { shortMs: 300, longMs: 2000 };
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    let shortN = 0;
    attachTrackerPress(btn, () => shortN++, () => {}, '');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80)); // release well under 300ms
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    return shortN;
  });
  expect(fired).toBe(0);
});
