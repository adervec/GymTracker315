// feat 148 — the Log-Sets sheet (#trk-modal) must start below the fixed top bar + the rest/plan-step HUD
// bars so they never overlap (clip) its top content. The sheet's `top` tracks whichever bars are showing.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.getElementById('trk-modal'), null, { timeout: 15000 });
});

test('the log sheet top clears the top bar alone, then the rest bar, then the plan-step bar', async ({ page }) => {
  const r = await page.evaluate(() => {
    const modal = document.getElementById('trk-modal');
    const top = () => getComputedStyle(modal).top;
    const body = document.body;
    body.classList.remove('rest-bar-on', 'rest-bar-idle', 'plan-step-bar-on');
    const base = top();                                   // top bar only (48px)
    body.classList.add('rest-bar-on');
    const rest = top();                                   // + rest bar (78px)
    body.classList.add('plan-step-bar-on');
    const both = top();                                   // + plan-step bar (102px)
    body.classList.remove('rest-bar-on'); body.classList.add('rest-bar-idle');
    const idleBoth = top();                               // idle rest bar + plan-step bar (90px)
    body.classList.remove('rest-bar-idle', 'plan-step-bar-on');
    return { base, rest, both, idleBoth };
  });
  expect(r.base).toBe('48px');     // below the 48px top app bar
  expect(r.rest).toBe('78px');     // below top bar + 30px rest bar
  expect(r.both).toBe('102px');    // below top bar + rest bar + 24px plan-step bar
  expect(r.idleBoth).toBe('90px'); // idle (18px) rest bar + plan-step bar
});

test('the sheet sits above the bars in DOM stacking but starts below them on screen (no clip)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const modal = document.getElementById('trk-modal');
    const rb = getComputedStyle(document.querySelector('.rest-bar') || document.body);
    document.body.classList.add('rest-bar-on', 'plan-step-bar-on');
    const modalTop = parseFloat(getComputedStyle(modal).top);
    document.body.classList.remove('rest-bar-on', 'plan-step-bar-on');
    // rest bar bottom = 48 (top bar) + 30 (rest) = 78; plan-step bottom = 78 + 24 = 102
    return { modalTop };
  });
  expect(r.modalTop).toBe(102); // exactly at the bottom of the lowest bar
});
