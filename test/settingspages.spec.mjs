// feat 187 — Settings split: Profile / Cosmetic / Preferences are router pages. Each relocates a *bucket* of
// the existing settings-drawer sections (DOM nodes + live bindings) into #trk-main, the same trick as the Data
// Management page. A toggle whose binding re-renders the drawer refreshes the page in place.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function'
    && typeof renderSettingsPage === 'function'
    && typeof renderSettingsDrawer === 'function', null, { timeout: 15000 });
});

const secIdsOf = (page) => page.evaluate(() =>
  [...document.getElementById('trk-main').querySelectorAll('.drawer-section')].map(s => s.dataset.sec));

test('each Settings sub-page renders its own disjoint bucket of sections into #trk-main', async ({ page }) => {
  const prof = await page.evaluate(() => { navTo('set-profile'); return currentPage; });
  expect(prof).toBe('set-profile');
  const profSecs = await secIdsOf(page);
  expect(profSecs).toContain('profile');
  expect(profSecs).toContain('biometrics');

  const cos = await page.evaluate(() => { navTo('set-cosmetic'); return currentPage; });
  expect(cos).toBe('set-cosmetic');
  const cosSecs = await secIdsOf(page);
  expect(cosSecs).toContain('theme');
  expect(cosSecs).toContain('branding');                 // branding moved out of Preferences into Cosmetic
  expect(await page.evaluate(() => !!document.getElementById('trk-main').querySelector('[data-brand-emoji]'))).toBe(true); // feat 290 — the emoji picker (hide toggle retired)

  const prefs = await page.evaluate(() => { navTo('set-prefs'); return currentPage; });
  expect(prefs).toBe('set-prefs');
  const prefSecs = await secIdsOf(page);
  expect(prefSecs).toContain('preferences');
  expect(prefSecs).toContain('categories');
  expect(prefSecs).toContain('reference');

  // buckets are disjoint
  expect(prefSecs).not.toContain('profile');
  expect(prefSecs).not.toContain('theme');
  expect(cosSecs).not.toContain('preferences');
});

test('the leaves are render-pages under Settings (no longer drawer openers)', async ({ page }) => {
  const r = await page.evaluate(() => ['set-profile', 'set-cosmetic', 'set-prefs'].map(id => ({
    parent: PAGES[id].parent, isRender: typeof PAGES[id].render === 'function', noOpen: !PAGES[id].open,
  })));
  for (const d of r) { expect(d.parent).toBe('settings'); expect(d.isRender).toBe(true); expect(d.noOpen).toBe(true); }
});

test('a control on a Settings page updates the page in place (binding re-render is re-projected)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.brandMark = '';
    navTo('set-cosmetic');
    const main = document.getElementById('trk-main');
    main.querySelector('[data-brand-emoji="💪"]').click();      // pick a brand emoji (re-renders the drawer → re-projects)
    const after = document.getElementById('trk-main');
    const active = after.querySelector('[data-brand-emoji="💪"]').classList.contains('active'); // re-queried after the in-place re-render
    return { mark: brandMark(), active, stillCosmetic: currentPage === 'set-cosmetic', stillHasTheme: !!after.querySelector('.drawer-section[data-sec="theme"]') };
  });
  expect(r.mark).toBe('💪');             // the pick took effect
  expect(r.active).toBe(true);           // and the page reflected it in place (not the hidden drawer)
  expect(r.stillCosmetic).toBe(true);
  expect(r.stillHasTheme).toBe(true);    // the rest of the bucket survived the re-render
});

// the legacy all-in-one drawer still works (⚙️ long-press / sound-menu entry points) and renders every section.
test('the legacy settings drawer still renders every section (compat)', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const body = document.getElementById('settings-drawer-body');
    return {
      hasBrandEmoji: body.innerHTML.includes('data-brand-emoji'),   // feat 290 — emoji picker (hide toggle retired)
      hasTheme: !!body.querySelector('.drawer-section[data-sec="theme"]'),
      hasProfile: !!body.querySelector('.drawer-section[data-sec="profile"]'),
      hasBranding: !!body.querySelector('.drawer-section[data-sec="branding"]'),
    };
  });
  expect(r.hasBrandEmoji).toBe(true);
  expect(r.hasTheme).toBe(true);
  expect(r.hasProfile).toBe(true);
  expect(r.hasBranding).toBe(true);
});
