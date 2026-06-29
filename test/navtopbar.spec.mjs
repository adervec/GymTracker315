// feat 182 — top-bar redesign: the GymTracker315 brand is the topmost, centered element; Back/Forward buttons
// (disabled when N/A) drive the page router; the brand → Home, ⚙️ → Settings; the legacy panel switcher is hidden.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof updateTopbarChrome === 'function' && !!document.getElementById('app-brand'), null, { timeout: 15000 });
});

test('the brand is the topmost, centered element inside the top bar', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bar = document.getElementById('app-topbar');
    const brand = document.getElementById('app-brand');
    const brandRow = bar.firstElementChild;
    const bb = brand.getBoundingClientRect(), br = brandRow.getBoundingClientRect();
    return {
      inBar: !!brand.closest('#app-topbar'),
      rowIsFirst: brandRow.classList.contains('topbar-brand-row'),
      brandInRow: brandRow.contains(brand),
      display: getComputedStyle(brandRow).display,
      // feat 363 — centred via a 3-col grid (identity · brand · live), so check the geometry, not justify-content
      centerOffset: Math.abs((bb.left + bb.right) / 2 - (br.left + br.right) / 2),
      hasNum: !!brand.querySelector('.gt-brand-num'),
    };
  });
  expect(r.inBar).toBe(true);
  expect(r.rowIsFirst).toBe(true);   // the brand row is the FIRST (topmost) child of the bar
  expect(r.brandInRow).toBe(true);
  expect(r.display).toBe('grid');    // 3-column grid layout
  expect(r.centerOffset).toBeLessThan(2); // brand horizontally centred in the row
  expect(r.hasNum).toBe(true);       // wordmark intact (branding.spec contract)
});

test('feat 290 — branding is mandatory: the brand row stays visible and the offset is the full bar', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.hideBranding = true; applyBranding();   // the retired flag can no longer hide branding
    const rowDisp = getComputedStyle(document.querySelector('.topbar-brand-row')).display;
    const topbarH = getComputedStyle(document.body).getPropertyValue('--topbar-h').trim();
    const panelPad = getComputedStyle(document.querySelector('.panel')).paddingTop;
    return { rowDisp, topbarH, panelPad, forcedOff: state.hideBranding };
  });
  expect(r.rowDisp).not.toBe('none');  // the brand row is always visible
  expect(r.topbarH).toBe('82px');      // full offset (brand row + controls)
  expect(r.panelPad).toBe('82px');     // …and the panel inherits it
  expect(r.forcedOff).toBe(false);     // applyBranding forces the retired flag off
});

test('Back / Forward buttons reflect the router history (disabled when N/A)', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('workout', { replace: true }); _pageBack.length = 0; _pageFwd.length = 0; updateTopbarChrome();
    const backStart = document.getElementById('nav-back').disabled, fwdStart = document.getElementById('nav-fwd').disabled;
    navTo('history'); // now there's back history
    const backAfter = document.getElementById('nav-back').disabled;
    navBack();        // now there's forward history
    const fwdAfter = document.getElementById('nav-fwd').disabled;
    return { backStart, fwdStart, backAfter, fwdAfter };
  });
  expect(r.backStart).toBe(true);  // empty back stack → disabled
  expect(r.fwdStart).toBe(true);
  expect(r.backAfter).toBe(false); // navigated → back enabled
  expect(r.fwdAfter).toBe(false);  // went back → forward enabled
});

test('the top-bar title shows the current page emoji + name', async ({ page }) => {
  const txt = await page.evaluate(() => { navTo('volume'); return document.getElementById('topbar-title').textContent; });
  expect(txt).toContain('Volume');
  expect(txt).toContain('🧮');
});

test('the brand goes Home and the gear goes to Settings (feat 221: menus land on their primary leaf)', async ({ page }) => {
  const r = await page.evaluate(() => {
    document.getElementById('app-brand-btn').click(); const home = currentPage;
    document.getElementById('app-settings-btn').click(); const settings = currentPage;
    return { home, settings, settingsIsMenu: PAGES.settings.kind === 'menu' };
  });
  expect(r.home).toBe('workout');      // home forwards to the Workout dashboard
  expect(r.settings).toBe('set-prefs'); // settings forwards to Preferences
  expect(r.settingsIsMenu).toBe(true);
});

test('the legacy panel switcher is hidden but present (compat); top-bar Back exits a slide-in panel', async ({ page }) => {
  const r = await page.evaluate(() => {
    const sw = document.querySelector('#app-topbar .nav-tabs');
    const hidden = getComputedStyle(sw).display === 'none';
    const count = document.querySelectorAll('.nav-tab').length; // still in DOM (app.spec contract)
    goPanel('panel-reference'); // enter a slide-in
    const inPanel = document.getElementById('panel-reference').classList.contains('active');
    topbarBack(); // ← should exit back to the tracker
    const back = document.getElementById('panel-tracker').classList.contains('active');
    return { hidden, count, inPanel, back };
  });
  expect(r.hidden).toBe(true);
  expect(r.count).toBeGreaterThan(0);
  expect(r.inPanel).toBe(true);
  expect(r.back).toBe(true); // Back returned to the app from the panel
});
