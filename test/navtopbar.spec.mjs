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
    return {
      inBar: !!brand.closest('#app-topbar'),
      rowIsFirst: brandRow.classList.contains('topbar-brand-row'),
      brandInRow: brandRow.contains(brand),
      centered: getComputedStyle(brandRow).justifyContent,
      hasNum: !!brand.querySelector('.gt-brand-num'),
    };
  });
  expect(r.inBar).toBe(true);
  expect(r.rowIsFirst).toBe(true);   // the brand row is the FIRST (topmost) child of the bar
  expect(r.brandInRow).toBe(true);
  expect(r.centered).toBe('center'); // horizontally centered
  expect(r.hasNum).toBe(true);       // wordmark intact (branding.spec contract)
});

test('hiding the brand collapses the brand row + shrinks the top bar offset', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.hideBranding = true; applyBranding();
    const rowDisp = getComputedStyle(document.querySelector('.topbar-brand-row')).display;
    // the override lives on body.brand-hidden, so the offsets (panel/modal/bars are body descendants) inherit it
    const topbarH = getComputedStyle(document.body).getPropertyValue('--topbar-h').trim();
    const panelPad = getComputedStyle(document.querySelector('.panel')).paddingTop;
    state.hideBranding = false; applyBranding();
    const topbarH2 = getComputedStyle(document.body).getPropertyValue('--topbar-h').trim();
    return { rowDisp, topbarH, topbarH2, panelPad };
  });
  expect(r.rowDisp).toBe('none');  // brand row hidden
  expect(r.topbarH).toBe('44px');  // offsets collapse to the controls row only
  expect(r.panelPad).toBe('44px'); // ...and the panel actually inherits the shrunk offset
  expect(r.topbarH2).toBe('82px'); // restored when shown
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

test('the brand goes Home and the gear goes to Settings', async ({ page }) => {
  const r = await page.evaluate(() => {
    document.getElementById('app-brand-btn').click(); const home = currentPage;
    document.getElementById('app-settings-btn').click(); const settings = currentPage;
    return { home, settings, settingsIsMenu: PAGES.settings.kind === 'menu' };
  });
  expect(r.home).toBe('home');
  expect(r.settings).toBe('settings');
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
