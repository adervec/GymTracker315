// feat 557 — the house font standard: Atkinson Hyperlegible by default, a reader-changeable font in Settings,
// the choice kept under the shared `maker-font` key, and the font files served from the app's own ./fonts/.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const bodyFont = page => page.evaluate(() => getComputedStyle(document.body).fontFamily);

test('feat 557 — Atkinson is the default, the Settings picker changes it, and the choice persists', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => window.appFont && typeof openSettingsDrawer === 'function');
  expect(await bodyFont(page)).toMatch(/^"?Atkinson Hyperlegible/);
  expect(await page.evaluate(() => document.fonts.load('16px "Atkinson Hyperlegible"').then(f => f.length))).toBeGreaterThan(0); // the file really loads from ./fonts/

  await page.evaluate(() => openSettingsDrawer());
  const sel = page.locator('app-font-picker select');
  await expect(sel.locator('option')).toHaveCount(4);
  await sel.selectOption('serif');
  expect(await bodyFont(page)).toMatch(/^Georgia/);
  expect(await page.evaluate(() => localStorage.getItem('maker-font'))).toBe('serif');
  // buttons inherit it — the UI follows, not just loose body text
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('trk-fab')).fontFamily)).toMatch(/^Georgia/);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.appFont);
  expect(await bodyFont(page)).toMatch(/^Georgia/);
});
