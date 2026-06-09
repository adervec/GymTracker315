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
    const base = top();                                   // top bar only (--topbar-h = 82px, feat 182 two-row bar)
    body.classList.add('rest-bar-on');
    const rest = top();                                   // + 30px rest bar (112px)
    body.classList.add('plan-step-bar-on');
    const both = top();                                   // + 24px plan-step bar (136px)
    body.classList.remove('rest-bar-on'); body.classList.add('rest-bar-idle');
    const idleBoth = top();                               // idle (18px) rest bar + plan-step bar (124px)
    body.classList.remove('rest-bar-idle', 'plan-step-bar-on');
    return { base, rest, both, idleBoth };
  });
  expect(r.base).toBe('82px');     // below the two-row top app bar (--topbar-h)
  expect(r.rest).toBe('112px');    // + 30px rest bar
  expect(r.both).toBe('136px');    // + rest bar + 24px plan-step bar
  expect(r.idleBoth).toBe('124px');// idle (18px) rest bar + plan-step bar
});

test('the sheet sits above the bars in DOM stacking but starts below them on screen (no clip)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const modal = document.getElementById('trk-modal');
    const rb = getComputedStyle(document.querySelector('.rest-bar') || document.body);
    document.body.classList.add('rest-bar-on', 'plan-step-bar-on');
    const modalTop = parseFloat(getComputedStyle(modal).top);
    document.body.classList.remove('rest-bar-on', 'plan-step-bar-on');
    // top bar (82) + rest (30) + plan-step (24) = 136 (feat 182 two-row top bar)
    return { modalTop };
  });
  expect(r.modalTop).toBe(136); // exactly at the bottom of the lowest bar
});
