// feat 241 — a refresh / PWA restart always lands on the Workout page. The router (currentPage) is the source
// of truth; the legacy gt_panel restore used to re-surface a stale non-tracker panel (e.g. the Reference) on
// boot, leaving a blank/wrong screen until you tapped the brand. Boot now navigates straight to Workout.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test('feat 241 — a refresh lands on Workout even after last browsing the Reference', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof switchPanel === 'function', null, { timeout: 15000 });
  // browse to the Reference (this persists the legacy gt_panel='panel-reference' that used to hijack boot)
  await page.evaluate(() => navTo('reference'));
  const before = await page.evaluate(() => ({ page: currentPage, gt_panel: localStorage.getItem('gt_panel'), active: document.querySelector('.panel.active')?.id }));
  expect(before.page).toBe('reference');
  expect(before.gt_panel).toBe('panel-reference');
  expect(before.active).toBe('panel-reference');
  // a hard refresh
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof currentPage !== 'undefined', null, { timeout: 15000 });
  const after = await page.evaluate(() => ({
    page: currentPage,
    active: document.querySelector('.panel.active')?.id,
    trkContent: /\S/.test(document.getElementById('trk-main')?.textContent || ''),
  }));
  expect(after.page).toBe('workout');          // …yet a refresh opens to Workout
  expect(after.active).toBe('panel-tracker');  // the tracker panel is surfaced (not the stale Reference)
  expect(after.trkContent).toBe(true);         // …and it actually rendered (no blank screen)
});

test('feat 241 — switchPanel tolerates a missing nav-tab button and still surfaces the panel', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof switchPanel === 'function', null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active')); // stale "no active panel" state
    let threw = false;
    try { switchPanel('panel-tracker', null); } catch (_) { threw = true; } // the router surfaces panels with no btn
    return { threw, active: document.querySelector('.panel.active')?.id };
  });
  expect(r.threw).toBe(false);
  expect(r.active).toBe('panel-tracker');
});
