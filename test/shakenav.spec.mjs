// feat 348 — opt-in "shake to open current exercise". A vigorous phone shake opens the current exercise's log
// sheet (openLogModal). These specs cover the pure spike detector (vigorous fires / gentle doesn't / cooldown /
// window expiry), the support+enabled predicates, that a detected shake opens the modal (and only when enabled +
// not already open), and the settings toggle.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof makeShakeDetector === 'function' && typeof triggerShakeNav === 'function'
    && typeof shakeNavEnabled === 'function' && typeof renderSettingsDrawer === 'function', null, { timeout: 15000 });
});

test('makeShakeDetector fires on a vigorous shake but ignores gentle motion', async ({ page }) => {
  const r = await page.evaluate(() => {
    // gentle: magnitude wobbles by a few m/s² around gravity — never a spike
    const gentle = makeShakeDetector();
    let gentleFires = 0;
    for (let i = 0; i < 40; i++) gentleFires += gentle(9.8 + (i % 2 ? 3 : -3), i * 50) ? 1 : 0;
    // vigorous: big alternating swings (deltas ~30) → spikes accumulate and fire once
    const vig = makeShakeDetector();
    let vigFires = 0, firstFireAt = -1;
    for (let i = 0; i < 8; i++) { const t = i * 80; if (vig(i % 2 ? 35 : 2, t)) { vigFires++; if (firstFireAt < 0) firstFireAt = i; } }
    return { gentleFires, vigFires, firstFireAt };
  });
  expect(r.gentleFires).toBe(0);
  expect(r.vigFires).toBe(1);              // one shake → exactly one fire
  expect(r.firstFireAt).toBeGreaterThanOrEqual(2); // needs ≥3 spikes (a real shake), not the first wobble
});

test('makeShakeDetector respects the cooldown and the rolling window', async ({ page }) => {
  const r = await page.evaluate(() => {
    // Cooldown: keep shaking hard right after a fire → no second fire until cooldown elapses
    const d = makeShakeDetector({ cooldownMs: 1500 });
    let fires = 0; const swings = [];
    for (let i = 0; i < 15; i++) swings.push(d(i % 2 ? 35 : 2, i * 80) ? 1 : 0); // ≤1120ms total → all inside the 1500ms cooldown
    fires = swings.reduce((a, b) => a + b, 0);

    // After the cooldown passes, another vigorous burst fires again
    const d2 = makeShakeDetector({ cooldownMs: 500 });
    let f2 = 0;
    for (let i = 0; i < 6; i++) f2 += d2(i % 2 ? 35 : 2, i * 80) ? 1 : 0;      // first fire ~ t=320
    for (let i = 0; i < 6; i++) f2 += d2(i % 2 ? 35 : 2, 2000 + i * 80) ? 1 : 0; // well past cooldown → fires again

    // Window: spikes spaced far apart (one per 2s, > 900ms window) never reach the count
    const dW = makeShakeDetector({ windowMs: 900 });
    let fW = 0;
    for (let i = 0; i < 6; i++) fW += dW(i % 2 ? 35 : 2, i * 2000) ? 1 : 0;
    return { cooldownFires: fires, acrossCooldown: f2, windowFires: fW };
  });
  expect(r.cooldownFires).toBe(1);   // continuous shaking still only one trigger within the cooldown
  expect(r.acrossCooldown).toBe(2);  // a fresh burst after the cooldown fires again
  expect(r.windowFires).toBe(0);     // spikes too spread out never accumulate
});

test('shakeNavSupported/Enabled reflect the platform and the saved setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    const supported = shakeNavSupported();
    state.workoutControls = state.workoutControls || {};
    state.workoutControls.shakeNav = false; const off = shakeNavEnabled();
    state.workoutControls.shakeNav = true; const on = shakeNavEnabled();
    return { supported, off, on };
  });
  expect(typeof r.supported).toBe('boolean');
  expect(r.off).toBe(false);
  expect(r.on).toBe(true);
});

test('a detected shake opens the current-exercise log sheet — only when enabled and not already open', async ({ page }) => {
  const r = await page.evaluate(() => {
    try { if (typeof closeLogModal === 'function') closeLogModal(); } catch (_) {}
    modalState.open = false;
    state.workoutControls = state.workoutControls || {};

    // disabled → no-op
    state.workoutControls.shakeNav = false;
    triggerShakeNav();
    const whenDisabled = modalState.open;

    // enabled → opens the log modal
    state.workoutControls.shakeNav = true;
    triggerShakeNav();
    const whenEnabled = modalState.open;

    // already open → triggering again is a no-op (doesn't throw / re-init)
    triggerShakeNav();
    const stillOpen = modalState.open;
    return { whenDisabled, whenEnabled, stillOpen };
  });
  expect(r.whenDisabled).toBe(false);
  expect(r.whenEnabled).toBe(true);
  expect(r.stillOpen).toBe(true);
});

test('the settings drawer offers the shake toggle with an iOS-permission note', async ({ page }) => {
  const r = await page.evaluate(() => {
    if (!shakeNavSupported()) return { supported: false };
    state.workoutControls = state.workoutControls || {}; state.workoutControls.shakeNav = false;
    renderSettingsDrawer();
    const html = document.getElementById('settings-drawer-body').innerHTML;
    return { supported: true, has: html.includes('Shake to open current exercise'),
      toggle: html.includes('data-shakenav="on"') && html.includes('data-shakenav="off"'),
      notesIOS: html.toLowerCase().includes('ios') && html.toLowerCase().includes('motion') };
  });
  if (!r.supported) { test.skip(true, 'DeviceMotion not present in this engine'); return; }
  expect(r.has).toBe(true);
  expect(r.toggle).toBe(true);
  expect(r.notesIOS).toBe(true);
});
