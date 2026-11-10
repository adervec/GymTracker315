// feat 559 — house standards: the default theme follows the device (a saved choice always wins), and the app
// declares a reader-facing whatsnew.json, newest first.
import { test, expect } from '@playwright/test';
import fs from 'fs';

const APP = '/gym-tracker.html';
const theme = page => page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'dark');

test('feat 559 — with no saved theme, light mode starts light and dark mode starts dark; a choice wins', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof effectiveTheme === 'function');
  expect(await theme(page)).toBe('light');

  // the device flips while nothing is chosen: the app follows
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(page)).toBe('dark');

  // an older save that stored the old default 'dark' without ever choosing still follows the device
  await page.evaluate(() => { state.theme = 'dark'; state.themeChosen = false; saveState(); });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload({ waitUntil: 'load' });
  expect(await theme(page)).toBe('light');

  // the reader picks dark in Settings: it sticks even in light mode, across a reload
  await page.evaluate(() => openSettingsDrawer());
  await page.evaluate(() => document.querySelector('.theme-swatch[data-theme-id="dark"]').click());
  expect(await theme(page)).toBe('dark');
  await page.reload({ waitUntil: 'load' });
  expect(await theme(page)).toBe('dark');

  // "Match device" hands it back
  await page.evaluate(() => openSettingsDrawer());
  await page.evaluate(() => document.querySelector('.theme-swatch[data-theme-id="__device"]').click());
  expect(await theme(page)).toBe('light');
  expect(await page.evaluate(() => [state.theme, state.themeChosen])).toEqual([null, false]);
});

test('feat 559 — whatsnew.json is declared, served, newest first, and written for the lifter', async ({ page, request }) => {
  await page.goto(APP, { waitUntil: 'load' });
  const url = await page.evaluate(() => document.querySelector('meta[name="app-whatsnew"]').content);
  expect(url).toBe('whatsnew.json');
  const res = await request.get('/' + url);
  expect(res.ok()).toBe(true);
  const list = await res.json();
  expect(Array.isArray(list) && list.length).toBeTruthy();
  const dates = list.map(e => e.date);
  dates.forEach(d => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  expect([...dates].sort().reverse()).toEqual(dates);
  list.forEach(e => { expect(e.items.length).toBeGreaterThan(0); e.items.forEach(t => expect(t).not.toMatch(/\bfeat \d+|\.spec\b|\bcommit\b|localStorage/)); });
  // and the deploy ships it
  expect(fs.readFileSync('.github/workflows/deploy.yml', 'utf8')).toMatch(/whatsnew\.json/);
});
