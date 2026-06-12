// feat 204 — linking from the current exercise to the full Reference lands ON the exact variation:
// the family card and the precise variation are expanded, flashed, and scrolled into view (previously
// the search just narrowed the list and left everything collapsed).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openReferenceFor === 'function' && typeof _refRevealVariation === 'function', null, { timeout: 15000 });
});

test('openReferenceFor expands the family card AND the exact variation', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.refView = 'detailed';
    const fam = FAMILIES.find(f => f.id === 'chest-fly');
    const v = fam.variations.find(x => x.id === 'freemotion-chest-fly');
    openReferenceFor(v.uuid);
    const card = document.querySelector('.exercise[data-id="ref-chest-fly"]');
    const vr = document.querySelector(`.variation[data-uuid="${v.uuid}"]`);
    return {
      page: currentPage,
      search: document.getElementById('ref-search').value,
      cardOpen: !!(card && card.classList.contains('open')),
      varOpen: !!(vr && vr.classList.contains('open')),
      flashed: !!(vr && vr.classList.contains('coach-flash')),
      modalClosed: !modalState.open,
    };
  });
  expect(r.page).toBe('reference');                       // routed to the Reference page
  expect(r.search).toBe('Freemotion Cable Chest Fly');    // filtered to the variation
  expect(r.cardOpen).toBe(true);                          // family accordion expanded…
  expect(r.varOpen).toBe(true);                           // …and the exact variation expanded
  expect(r.flashed).toBe(true);                           // highlight flash marks the landing spot
  expect(r.modalClosed).toBe(true);                       // the log sheet was closed on the way
});

test('the expanded variation body is actually visible (setup/movement detail on screen)', async ({ page }) => {
  await page.evaluate(() => {
    state.refView = 'detailed';
    const fam = FAMILIES.find(f => f.id === 'chest-fly');
    openReferenceFor(fam.variations.find(x => x.id === 'freemotion-chest-fly').uuid);
  });
  const body = page.locator('.variation[data-uuid="f8ee0001-0001-4001-8001-000000000001"] .variation-body');
  await expect(body).toBeVisible();
  await expect(body.locator('.var-section-title', { hasText: 'Setup' })).toBeVisible();
});

test('reveal reports success in the detailed view and no-ops gracefully in the table view', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'chest-fly');
    const u = fam.variations.find(x => x.id === 'freemotion-chest-fly').uuid;
    state.refView = 'table'; openReferenceFor(u);           // table view: no .variation nodes
    const tableLanded = _refRevealVariation('chest-fly', u);
    state.refView = 'detailed'; openReferenceFor(u);        // back to detailed: lands
    const detailLanded = _refRevealVariation('chest-fly', u);
    return { tableLanded, detailLanded };
  });
  expect(r.tableLanded).toBe(false);   // silent no-op, no crash
  expect(r.detailLanded).toBe(true);
});
