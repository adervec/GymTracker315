// feat 190 — Glossary + Anatomy are Study router pages. The glossary panel shows full-page (the slide-in mode is
// retired); navTo('glossary')/navTo('anatomy') open it, the ✕ / Escape go Back through the router, and navigating
// away auto-hides it (_syncGlossOverlay). External entry points (openGloss / openGlossaryTo) are router shims.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof renderGlossaryPage === 'function'
    && typeof renderAnatomyPage === 'function' && typeof renderGlossary === 'function', null, { timeout: 15000 });
});

const glossOpen  = (page) => page.evaluate(() => document.getElementById('ref-gloss-panel').classList.contains('open'));
const glossChart = (page) => page.evaluate(() => document.getElementById('ref-gloss-panel').classList.contains('chart-open'));

test('Glossary opens the full-page panel (list); Anatomy opens it with the chart', async ({ page }) => {
  await page.evaluate(() => navTo('glossary'));
  expect(await page.evaluate(() => currentPage)).toBe('glossary');
  expect(await glossOpen(page)).toBe(true);
  await expect(page.locator('#ref-gloss-panel')).toHaveClass(/as-page/); // full-page, not a slide-in
  expect(await glossChart(page)).toBe(false);                            // Glossary → the term list

  await page.evaluate(() => navTo('anatomy'));
  expect(await page.evaluate(() => currentPage)).toBe('anatomy');
  expect(await glossOpen(page)).toBe(true);
  expect(await glossChart(page)).toBe(true);                             // Anatomy → the chart pane open
});

test('the ✕ goes Back through the router and hides the overlay', async ({ page }) => {
  await page.evaluate(() => { navTo('study'); navTo('glossary'); });
  expect(await glossOpen(page)).toBe(true);
  await page.click('#ref-gloss-close');
  expect(await glossOpen(page)).toBe(false);
  expect(await page.evaluate(() => currentPage)).toBe('study'); // back to the Study menu
});

test('navigating to another page hides the glossary overlay', async ({ page }) => {
  await page.evaluate(() => navTo('glossary'));
  expect(await glossOpen(page)).toBe(true);
  await page.evaluate(() => navTo('workout'));
  expect(await glossOpen(page)).toBe(false);
  expect(await page.evaluate(() => currentPage)).toBe('workout');
});

test('openGloss + openGlossaryTo are router shims to the Glossary page', async ({ page }) => {
  const r = await page.evaluate(() => {
    openGloss();
    const a = currentPage;
    openGlossaryTo('Hypertrophy'); // e.g. highlight-to-glossary / a Reference link
    return { a, b: currentPage, search: document.getElementById('ref-gloss-search').value, open: document.getElementById('ref-gloss-panel').classList.contains('open') };
  });
  expect(r.a).toBe('glossary');
  expect(r.b).toBe('glossary');
  expect(r.search).toBe('Hypertrophy');
  expect(r.open).toBe(true);
});
