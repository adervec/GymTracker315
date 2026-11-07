// feat 552 — End Workout (and every press-and-hold button) takes ONE tap even when the finger drifts: the press
// keeps its pointer, "slid off" means 24 px past the edge, the button never hands the gesture to scrolling, and the
// minute re-render waits while a press is in progress.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof attachTrackerPress === 'function', null, { timeout: 15000 });
});

const press = (page, moves) => page.evaluate((moves) => {
  state.trackerPress = { shortMs: 0, longMs: 2000 };
  const b = document.createElement('button'); b.className = 'wc-btn end';
  b.style.cssText = 'position:fixed;left:100px;top:100px;width:200px;height:50px;';
  document.body.appendChild(b);
  let taps = 0; attachTrackerPress(b, () => taps++, () => {}, 'Hold to end');
  const ev = (type, x, y) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  ev('pointerdown', 150, 120);
  moves.forEach(([x, y]) => ev('pointermove', x, y));
  ev('pointerup', ...(moves.length ? moves[moves.length - 1] : [150, 120]));
  const ta = getComputedStyle(b).touchAction; b.remove();
  return { taps, ta };
}, moves);

test('feat 552 — a tap that drifts a little (even just past the edge) still counts, once', async ({ page }) => {
  const still = await press(page, []);
  const drift = await press(page, [[160, 125], [305, 152]]);   // 5 px past the right edge and 2 px below
  expect(still.taps).toBe(1);
  expect(drift.taps).toBe(1);
  expect(still.ta).toBe('none');                                // never handed to page scrolling
});

test('feat 552 — sliding well off the button still cancels', async ({ page }) => {
  const r = await press(page, [[200, 120], [400, 260]]);
  expect(r.taps).toBe(0);
});

test('feat 552 — End Workout ends on one tap through to its confirm sheet', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false; state.sessions = []; state.trackerPress = { shortMs: 0, longMs: 2000 };
    startWorkout(); navTo('workout', { replace: true });
    const b = document.getElementById('wc-end-btn'), r0 = b.getBoundingClientRect();
    const ev = (type, x, y) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    ev('pointerdown', r0.left + 10, r0.top + 10); ev('pointermove', r0.right + 6, r0.top + 12); ev('pointerup', r0.right + 6, r0.top + 12);
    const sheet = [...document.querySelectorAll('.choice-sheet')].pop();
    return { asked: !!sheet && /End workout/.test(sheet.textContent) };
  });
  expect(r.asked).toBe(true);
});
