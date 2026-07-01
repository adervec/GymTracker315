// feat 405 — Data Management is now an ordinary Settings sub-page: renderSettingsPage projects its data sections
// (DOM nodes + their live bindings) into #trk-main like Preferences. The old full-screen overlay + its "Done"
// header are gone, and AI Cowork + Strava reconciliation split onto their own Cowork & Sync page.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSettingsPage === 'function' && typeof window.navTo === 'function' && typeof PAGES !== 'undefined', null, { timeout: 15000 });
});

test('feat 405 — the Data page renders its sections into #trk-main; the overlay is gone', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    navTo('set-data');
    const main = document.getElementById('trk-main');
    return {
      isRender: typeof PAGES['set-data'].render === 'function', noOpen: !PAGES['set-data'].open,
      overlayGone: !document.getElementById('data-page'),          // no #data-page overlay element
      doneGone: !document.getElementById('data-page-close'),        // no "Done" button
      exportIn: !!main.querySelector('#drawer-export-btn'),
      resetIn: !!main.querySelector('#drawer-reset-btn'),
      exmediaIn: !!main.querySelector('#exmedia-export-btn'),
      cloudIn: /☁ Cloud Sync/.test(main.innerHTML),
    };
  });
  expect(r.isRender).toBe(true);
  expect(r.noOpen).toBe(true);
  expect(r.overlayGone).toBe(true);
  expect(r.doneGone).toBe(true);
  expect(r.exportIn && r.resetIn && r.exmediaIn).toBe(true);
  expect(r.cloudIn).toBe(true);
});

test('feat 405 — projected buttons keep their bindings (Export JSON still calls exportData)', async ({ page }) => {
  const calls = await page.evaluate(() => {
    let n = 0; window.exportData = () => { n++; };   // spy BEFORE bind so addEventListener captures it
    navTo('set-data');
    document.querySelector('#trk-main #drawer-export-btn').click();
    return n;
  });
  expect(calls).toBe(1);   // the relocated node's live binding survived the projection into #trk-main
});

test('feat 405 — Cowork & Sync is its own page with the Strava reconciliation section', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('set-cowork');
    const main = document.getElementById('trk-main');
    return {
      isPage: !!PAGES['set-cowork'] && typeof PAGES['set-cowork'].render === 'function',
      hasStrava: !!main.querySelector('#strava-import-btn'),
      dataHasStrava: (() => { navTo('set-data'); return !!document.querySelector('#trk-main #strava-import-btn'); })(),
    };
  });
  expect(r.isPage).toBe(true);
  expect(r.hasStrava).toBe(true);        // reconciliation lives here now
  expect(r.dataHasStrava).toBe(false);   // …and NOT on the Data page
});
