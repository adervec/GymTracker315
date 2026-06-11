// feat 203 — long-press teaching: while any hold is charging, every OTHER control with its own
// long-press action shimmers (body.lp-teaching + [data-lp-able] tags applied at wire time), passively
// teaching what can be held. A capture-phase pointerup/cancel net guarantees the state can't stick.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof _lpTagHoldable === 'function' && typeof openLogModal === 'function', null, { timeout: 15000 });
});

test('hold-capable controls are tagged [data-lp-able] at wire time', async ({ page }) => {
  const r = await page.evaluate(() => ({
    n: document.querySelectorAll('[data-lp-able]').length,
    save: document.getElementById('trk-save-btn')?.hasAttribute('data-lp-able'),
    clear: document.getElementById('trk-modal-clear')?.hasAttribute('data-lp-able'),
    copy: document.getElementById('trk-copy-last')?.hasAttribute('data-lp-able'),
    sound: document.getElementById('app-sound-btn')?.hasAttribute('data-lp-able'),
    settings: document.getElementById('app-settings-btn')?.hasAttribute('data-lp-able'),
  }));
  expect(r.save).toBe(true);      // feat 199 hold
  expect(r.clear).toBe(true);     // feat 200 hold
  expect(r.copy).toBe(true);      // feat 142 hold
  expect(r.sound).toBe(true);     // feat 99 top-bar shortcuts
  expect(r.settings).toBe(true);
  expect(r.n).toBeGreaterThanOrEqual(5);
});

test('holding one control turns on body.lp-teaching; release turns it off', async ({ page }) => {
  const copy = page.locator('#trk-copy-last');
  await copy.dispatchEvent('pointerdown');
  const during = await page.evaluate(() => ({
    teaching: document.body.classList.contains('lp-teaching'),
    holderExcluded: document.getElementById('trk-copy-last').classList.contains('lp-holding'), // :not(.lp-holding) keeps the held one shimmer-free
  }));
  await copy.dispatchEvent('pointerup');
  const after = await page.evaluate(() => document.body.classList.contains('lp-teaching'));
  expect(during.teaching).toBe(true);
  expect(during.holderExcluded).toBe(true);
  expect(after).toBe(false);
});

test('a pointerup anywhere is a safety net — the teaching state can never stick', async ({ page }) => {
  await page.locator('#trk-save-btn').dispatchEvent('pointerdown'); // disabled buttons do not fire — use Copy instead if needed
  await page.locator('#trk-copy-last').dispatchEvent('pointerdown');
  expect(await page.evaluate(() => document.body.classList.contains('lp-teaching'))).toBe(true);
  // release happens off-button (slid away) — the document-level capture listener still clears it
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  expect(await page.evaluate(() => document.body.classList.contains('lp-teaching'))).toBe(false);
});

test('the shimmer animation targets the other holdables via CSS', async ({ page }) => {
  // with teaching on, a non-held holdable resolves an animation-name from the lp-shimmer rule
  const r = await page.evaluate(() => {
    document.body.classList.add('lp-teaching');
    const other = document.getElementById('app-sound-btn');
    const anim = getComputedStyle(other).animationName;
    document.body.classList.remove('lp-teaching');
    const animOff = getComputedStyle(other).animationName;
    return { anim, animOff };
  });
  expect(r.anim).toBe('lp-shimmer');
  expect(r.animOff).toBe('none');
});
