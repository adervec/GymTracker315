// feat 92 — UI tap feedback: a click sound + short haptic on every interactive control,
// default ON, gated by the master switches + a "Button taps" toggle in the sound menu.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  // stub navigator.vibrate (absent in headless desktop) so we can observe haptic calls
  await page.addInitScript(() => {
    window.__vibes = [];
    try {
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true, writable: true,
        value: function (p) { window.__vibes.push(p); return true; },
      });
    } catch (e) { /* ignore */ }
  });
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.uiTapFeedback === 'function', null, { timeout: 15000 });
});

test('UI tap feedback defaults ON and is a preserved setting', async ({ page }) => {
  const st = await page.evaluate(() => { normalizeState(); saveState(); return JSON.parse(localStorage.getItem('overload_tracker_v2')); });
  expect(st.uiFeedback).toEqual({ audio: true, haptic: true });
  expect(await page.evaluate(() => typeof SETTINGS_KEYS !== 'undefined' && SETTINGS_KEYS.includes('uiFeedback'))).toBe(true);
});

test('feedback targets interactive controls only, and the click sound never throws', async ({ page }) => {
  const r = await page.evaluate(() => {
    const mk = (html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); return d.firstElementChild; };
    return {
      fns: [typeof uiClickSound, typeof uiTapFeedback, typeof _uiFeedbackTarget],
      button: !!_uiFeedbackTarget(mk('<button>x</button>')),
      role: !!_uiFeedbackTarget(mk('<div role="button">x</div>')),
      onclick: !!_uiFeedbackTarget(mk('<div onclick="void 0">x</div>')),
      plainText: !!_uiFeedbackTarget(mk('<p>just text</p>')),
      soundNoThrow: (function () { try { uiClickSound(); return true; } catch (e) { return false; } })(),
    };
  });
  expect(r.fns).toEqual(['function', 'function', 'function']);
  expect(r.button).toBe(true);
  expect(r.role).toBe(true);
  expect(r.onclick).toBe(true);
  expect(r.plainText).toBe(false);
  expect(r.soundNoThrow).toBe(true);
});

test('clicking a button fires a haptic; the toggle gates it', async ({ page }) => {
  // feat 227 — the ⚙️/❓ buttons are hidden now; the always-visible brand button fires the tap haptic
  await page.evaluate(() => { window.__vibes = []; });
  await page.click('#app-brand-btn');
  expect(await page.evaluate(() => window.__vibes.length), 'haptic fires on a button tap by default').toBeGreaterThan(0);

  // turn the Button-taps haptic off -> no buzz
  await page.evaluate(() => { state.uiFeedback.haptic = false; window.__vibes = []; });
  await page.click('#app-brand-btn');
  expect(await page.evaluate(() => window.__vibes.length), 'no haptic once the source is off').toBe(0);

  // master haptics off also suppresses it (re-enable source first)
  await page.evaluate(() => { state.uiFeedback.haptic = true; state.sound.haptics = false; window.__vibes = []; });
  await page.click('#app-brand-btn');
  expect(await page.evaluate(() => window.__vibes.length), 'master haptics gate wins').toBe(0);
});

test('the sound menu exposes a "Button taps" source with audio + haptic toggles', async ({ page }) => {
  const src = await page.evaluate(() => {
    const s = soundSources().find((x) => x.label === 'Button taps');
    return s ? { kinds: s.chips.map((c) => c.kind), on: s.chips.map((c) => c.get()) } : null;
  });
  expect(src).not.toBeNull();
  expect(src.kinds).toEqual(['audio', 'haptic']);
  expect(src.on).toEqual([true, true]); // default ON
});
