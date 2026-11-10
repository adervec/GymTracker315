// feat 560 — the FULL shared font.js is embedded (tools/embed-fontjs.mjs), so GymTracker gets every house
// standard it carries: the About panel and diagnostics, the pinch-zoom option, the crash notice, the offline
// pill and what's new — while the app keeps its own update toast and stays a single offline file.
import { test, expect } from '@playwright/test';
import fs from 'fs';

const APP = '/gym-tracker.html';

test('feat 560 — the embedded font.js is the real shared script, verbatim and current', async ({ page }) => {
  const html = fs.readFileSync('gym-tracker.html', 'utf8');
  expect(html).toMatch(/<script data-house="font\.js">/);
  expect(html).not.toMatch(/<script[^>]*\ssrc=["']https?:/);   // still one file: nothing loaded from elsewhere
  const local = '../CoworkSyncHub/font.js';
  if (fs.existsSync(local)) {   // on the maker's machine, the embed matches the shared source exactly
    const embedded = html.slice(html.indexOf('<script data-house="font.js">') + 29, html.indexOf('<!-- FONTJS:END -->')).replace(/\s*<\/script>\s*$/, '').trim();
    expect(embedded).toBe(fs.readFileSync(local, 'utf8').trim());
  }
  await page.goto(APP, { waitUntil: 'load' });
  const r = await page.evaluate(() => ({ api: ['about', 'whatsNew', 'crashNotice', 'systemTheme', 'zoomAllowed'].every(k => typeof window.appFont[k === 'about' ? 'diagnostics' : k] === 'function'), update: window.appUpdateNotice }));
  expect(r.api).toBe(true);
  expect(r.update, 'the app keeps its own update toast').toBe(false);
});

test('feat 560 — Settings carries the shared picker: font, pinch-zoom (off), build stamp and About', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => window.appFont && typeof openSettingsDrawer === 'function');
  await page.evaluate(() => openSettingsDrawer());
  const pick = page.locator('app-font-picker');
  await expect(pick.locator('select option')).toHaveCount(4);
  const zoom = pick.locator('input[type=checkbox]').first();
  await expect(zoom).not.toBeChecked();
  expect(await page.evaluate(() => document.querySelector('meta[name=viewport]').content)).toMatch(/user-scalable=no/);
  await zoom.check();
  expect(await page.evaluate(() => document.querySelector('meta[name=viewport]').content)).not.toMatch(/user-scalable=no/);
  await expect(pick.locator('app-build-info')).not.toBeEmpty();
  await pick.locator('app-about summary').click();
  await expect(pick.locator('app-about')).toContainText('Licence');
  await expect(pick.locator('app-about')).toContainText('Copy diagnostics');
  await expect(pick.locator('app-about')).toContainText("What's new");   // read from whatsnew.json
});

test('feat 560 — a crash is shown, not swallowed, and going offline is visible', async ({ page, context }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => window.appFont);
  await page.evaluate(() => setTimeout(() => { throw new Error('house crash probe'); }, 0));
  await expect(page.locator('#app-crash-notice')).toContainText('Your saved data is safe');
  await context.setOffline(true);
  await expect(page.locator('#app-offline')).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('#app-offline')).toHaveCount(0);
});
