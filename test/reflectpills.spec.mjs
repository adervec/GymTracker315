// feat 309 — an optional pill bar to navigate within the Reflect area only. Injected by renderCurrentPage
// on Reflect leaves (one pill per Reflect child, current highlighted); hidden elsewhere and toggleable.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof renderCurrentPage === 'function'
    && typeof PAGES !== 'undefined' && typeof reflectPillsEnabled === 'function', null, { timeout: 15000 });
});

test('Reflect leaves show the quick-nav pills (one per child, current active); other areas do not', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.reflectPills = true;
    navTo('summary', { replace: true });
    const onReflect = document.querySelectorAll('#trk-main .reflect-pill').length;
    const activeIsSummary = !!document.querySelector('#trk-main .reflect-pill.active[data-reflect-go="summary"]');
    const childCount = PAGES.reflect.children.length;
    navTo('gyms', { replace: true }); // a Prepare leaf — outside Reflect
    const onGyms = document.querySelectorAll('#trk-main .reflect-pill').length;
    navTo('summary', { replace: true });
    return { onReflect, activeIsSummary, childCount, onGyms };
  });
  expect(r.onReflect).toBe(r.childCount); // one pill per Reflect page
  expect(r.activeIsSummary).toBe(true);   // the current page is highlighted
  expect(r.onGyms).toBe(0);               // not shown outside Reflect
});

test('a pill navigates within Reflect', async ({ page }) => {
  const cur = await page.evaluate(() => {
    navTo('summary', { replace: true });
    document.querySelector('#trk-main .reflect-pill[data-reflect-go="trends"]').click();
    return currentPage;
  });
  expect(cur).toBe('trends');
});

test('the pills are optional — the setting hides them', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.reflectPills = false;
    navTo('summary', { replace: true });
    const off = document.querySelectorAll('#trk-main .reflect-pill').length;
    state.reflectPills = true;
    renderCurrentPage();
    const on = document.querySelectorAll('#trk-main .reflect-pill').length;
    return { off, on };
  });
  expect(r.off).toBe(0);
  expect(r.on).toBeGreaterThan(0);
});
