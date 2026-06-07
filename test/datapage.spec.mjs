// feat 109 — data management moved to its own full-screen page. The data sections render in the
// settings drawer then get relocated (DOM nodes + their live bindings) into #data-page-body, leaving
// only an entry button in Settings.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSettingsDrawer === 'function' && typeof window.openDataPage === 'function', null, { timeout: 15000 });
});

test('data sections are relocated out of Settings into the Data page', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    renderSettingsDrawer();
    const sb = document.getElementById('settings-drawer-body');
    const dpb = document.getElementById('data-page-body');
    return {
      entryInSettings: !!sb.querySelector('#open-data-page-btn'),
      wrapInSettings: !!sb.querySelector('#drawer-data-wrap'),
      wrapInPage: !!dpb.querySelector('#drawer-data-wrap'),
      exportInPage: !!dpb.querySelector('#drawer-export-btn'),
      resetInPage: !!dpb.querySelector('#drawer-reset-btn'),
      stravaInPage: !!dpb.querySelector('#strava-import-btn'),
      exmediaInPage: !!dpb.querySelector('#exmedia-export-btn'),
    };
  });
  expect(r.entryInSettings).toBe(true);
  expect(r.wrapInSettings).toBe(false);  // not in Settings anymore
  expect(r.wrapInPage).toBe(true);
  expect(r.exportInPage && r.resetInPage && r.stravaInPage && r.exmediaInPage).toBe(true);
});

test('openDataPage / closeDataPage toggle the page', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    openDataPage();
    const opened = document.getElementById('data-page').classList.contains('open');
    closeDataPage();
    const closed = !document.getElementById('data-page').classList.contains('open');
    return { opened, closed };
  });
  expect(r.opened).toBe(true);
  expect(r.closed).toBe(true);
});

test('relocated buttons keep their bindings (Export JSON still calls exportData)', async ({ page }) => {
  const calls = await page.evaluate(() => {
    let n = 0; window.exportData = () => { n++; };   // spy BEFORE bind so addEventListener captures it
    renderSettingsDrawer();
    document.querySelector('#data-page-body #drawer-export-btn').click();
    return n;
  });
  expect(calls).toBe(1);
});
