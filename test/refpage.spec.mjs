// feat 191 — Reference is a Study router page hosted in #panel-reference (the last piece of the 3-panel-switcher
// teardown). navTo('reference') surfaces panel-reference + renders the catalog; every other page surfaces
// panel-tracker. goPanel('panel-reference') / openReferenceFor / the hidden 📚 nav-tab are router shims.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof renderReferencePage === 'function'
    && typeof _surfacePanelForPage === 'function' && typeof renderRef === 'function', null, { timeout: 15000 });
});

const activePanel = (page) => page.evaluate(() => { const p = document.querySelector('.panel.active'); return p ? p.id : null; });

test('navTo("reference") surfaces panel-reference + renders the catalog; leaving returns to panel-tracker', async ({ page }) => {
  await page.evaluate(() => navTo('reference'));
  expect(await page.evaluate(() => currentPage)).toBe('reference');
  expect(await activePanel(page)).toBe('panel-reference');
  expect(await page.evaluate(() => document.getElementById('ref-exercises').children.length)).toBeGreaterThan(0);
  await page.evaluate(() => navTo('workout'));
  expect(await page.evaluate(() => currentPage)).toBe('workout');
  expect(await activePanel(page)).toBe('panel-tracker'); // surfaced back automatically
});

test('the top-bar Back leaves the Reference page through the router history', async ({ page }) => {
  await page.evaluate(() => { navTo('workout', { replace: true }); navTo('reference'); });
  expect(await activePanel(page)).toBe('panel-reference');
  await page.evaluate(() => topbarBack());
  expect(await page.evaluate(() => currentPage)).toBe('workout'); // feat 221: Back returns to the previous content page
  expect(await activePanel(page)).toBe('panel-tracker');
});

test('goPanel + openReferenceFor are router shims to the Reference page', async ({ page }) => {
  const r = await page.evaluate(() => {
    goPanel('panel-reference');
    const a = currentPage;
    let uuid = null; for (const [u] of VAR_INDEX) { uuid = u; break; }
    openReferenceFor(uuid); // deep-link from the log sheet → the page, filtered to that exercise
    return { a, b: currentPage, panel: (document.querySelector('.panel.active') || {}).id, search: document.getElementById('ref-search').value };
  });
  expect(r.a).toBe('reference');
  expect(r.b).toBe('reference');
  expect(r.panel).toBe('panel-reference');
  expect(r.search.length).toBeGreaterThan(0); // filtered to the exercise's title
});

test('the top-bar title reflects the Reference page', async ({ page }) => {
  const t = await page.evaluate(() => { navTo('reference'); return document.getElementById('topbar-title').textContent; });
  expect(t).toContain('Reference');
});
