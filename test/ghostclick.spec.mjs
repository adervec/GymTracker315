// feat 553 — the ghost click. End Workout acts on pointerup and opens its confirm sheet then; the same tap's
// synthesized click arrives a beat later. It must not land on the brand-new sheet and dismiss it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof endWorkout === 'function' && typeof startWorkout === 'function', null, { timeout: 15000 });
  await page.evaluate(() => {
    state.readonly = false; state.sessions = []; state.trackerPress = { shortMs: 0, longMs: 2000 };
    startWorkout(); navTo('workout', { replace: true });
  });
});

test('feat 553 — a late click from the same tap does not dismiss the End Workout sheet', async ({ page }) => {
  const box = await page.locator('#wc-end-btn').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down(); await page.mouse.up();             // the press acts on pointerup → the sheet opens
  await page.waitForTimeout(80);                               // the sheet turns interactive on the next frame…
  await page.mouse.click(x, y);                                // …then the phone's late click for the same tap lands
  await page.waitForTimeout(300);
  const open = await page.evaluate(() => { const b = [...document.querySelectorAll('.choice-backdrop')].pop(); return !!b && b.classList.contains('open') && /End workout/.test(b.textContent); });
  expect(open).toBe(true);
});

test('feat 553 — a real tap after the guard window still works (backdrop dismisses, buttons act)', async ({ page }) => {
  await page.evaluate(() => endWorkout(false));
  await page.waitForTimeout(500);
  await page.mouse.click(5, 5);                                // on the backdrop, well after opening → dismisses
  await page.waitForTimeout(300);
  const gone = await page.evaluate(() => !document.querySelector('.choice-backdrop.open'));
  await page.evaluate(() => endWorkout(false));
  await page.waitForTimeout(500);
  await page.locator('.choice-backdrop.open .choice-btn.primary').click();   // "🏁 End workout"
  await page.waitForTimeout(300);
  const ended = await page.evaluate(() => !getActiveSession());
  expect(gone).toBe(true);
  expect(ended).toBe(true);
});
