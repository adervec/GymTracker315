// feat 170 — a generic GymTracker315 wordmark brands the top of the app (hideable via a setting); image
// and PDF exports always carry the brand regardless of the setting.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.applyBranding === 'function' && typeof window.brandLogoHtml === 'function', null, { timeout: 15000 });
});

test('the app header shows the GymTracker315 wordmark', async ({ page }) => {
  const r = await page.evaluate(() => {
    const el = document.getElementById('app-brand');
    return { exists: !!el, num: el && !!el.querySelector('.gt-brand-num'), text: el ? el.textContent.replace(/\s+/g, '') : '' };
  });
  expect(r.exists).toBe(true);
  expect(r.num).toBe(true);
  expect(r.text).toContain('GymTracker315');
});

test('hide-branding toggles the body class; exports keep the brand', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.hideBranding = true; applyBranding();
    const hidden = document.body.classList.contains('brand-hidden');
    state.hideBranding = false; applyBranding();
    const shown = !document.body.classList.contains('brand-hidden');
    return { hidden, shown, logo: brandLogoHtml(true) };
  });
  expect(r.hidden).toBe(true);
  expect(r.shown).toBe(true);
  expect(r.logo).toContain('Tracker');
  expect(r.logo).toContain('315');
  expect(r.logo).toContain('gt-brand-print');
});

test('the PDF export header carries the brand even when in-app branding is hidden', async ({ page }) => {
  const html = await page.evaluate(() => {
    state.hideBranding = true; applyBranding();
    document.getElementById('trk-main').innerHTML = '<div>chart</div>';
    const orig = window.print; window.print = () => {};
    try { exportCurrentViewPdf(); } finally { window.print = orig; }
    const pr = document.getElementById('print-root');
    const out = pr ? pr.innerHTML : '';
    document.body.classList.remove('printing'); if (pr) pr.innerHTML = '';
    return out;
  });
  expect(html).toContain('gt-brand'); // the wordmark is in the print header
  expect(html).toContain('315');
});

test('the settings drawer offers a branding toggle, persisted', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const hasToggle = document.getElementById('settings-drawer-body').innerHTML.includes('data-pref-brand');
    state.hideBranding = true; normalizeState(); saveState();
    return { hasToggle, inKeys: SETTINGS_KEYS.includes('hideBranding'), persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).hideBranding };
  });
  expect(r.hasToggle).toBe(true);
  expect(r.inKeys).toBe(true);
  expect(r.persisted).toBe(true);
});
