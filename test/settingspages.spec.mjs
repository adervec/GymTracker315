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

// feat 402 — two new settings pages (Device, Analytics) + sections now default EXPANDED.
test('feat 402 — Device and Analytics pages are registered and in the Settings menu', async ({ page }) => {
  const r = await page.evaluate(() => ({
    device: !!PAGES['set-device'], analytics: !!PAGES['set-analytics'],
    inMenu: PAGES.settings.children.includes('set-device') && PAGES.settings.children.includes('set-analytics'),
    deviceSecs: SETTINGS_PAGE_SECS['set-device'], analyticsSecs: SETTINGS_PAGE_SECS['set-analytics'],
    prefsSecs: SETTINGS_PAGE_SECS['set-prefs'],
  }));
  expect(r.device).toBe(true);
  expect(r.analytics).toBe(true);
  expect(r.inMenu).toBe(true);
  expect(r.deviceSecs).toContain('device');
  expect(r.analyticsSecs).toContain('analytics');
  expect(r.prefsSecs).not.toContain('live-dashboard'); // moved onto the Analytics page
});

test('feat 402 — settings sections default to EXPANDED with no remembered collapse state', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.settingsCollapse = {};
    navTo('set-analytics');
    const secs = [...document.querySelectorAll('#trk-main .drawer-section')];
    return { count: secs.length, anyCollapsed: secs.some(s => s.classList.contains('collapsed')) };
  });
  expect(r.count).toBeGreaterThan(0);
  expect(r.anyCollapsed).toBe(false);
});

test('feat 402 — the live-score + pace settings live on Analytics, not Preferences, and still wire up', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('set-analytics');
    const onAnalytics = !!document.querySelector('#trk-main #drawer-live-score-after') && !!document.querySelector('#trk-main #drawer-pace-start');
    const inp = document.querySelector('#trk-main #drawer-pace-start');
    inp.value = '35'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    const wired = (state.workoutControls || {}).paceAnalysisStartMin;
    navTo('set-prefs');
    const onPrefs = !!document.querySelector('#trk-main #drawer-live-score-after') || !!document.querySelector('#trk-main #drawer-pace-start');
    return { onAnalytics, wired, onPrefs };
  });
  expect(r.onAnalytics).toBe(true);
  expect(r.wired).toBe(35);        // the moved input's handler still fires
  expect(r.onPrefs).toBe(false);   // no longer duplicated on Preferences
});

test('feat 405 — Data is a normal settings page and Cowork/Strava split onto their own page', async ({ page }) => {
  const r = await page.evaluate(() => {
    const dataRender = typeof PAGES['set-data'].render === 'function' && !PAGES['set-data'].open;
    const coworkReg = !!PAGES['set-cowork'] && PAGES.settings.children.includes('set-cowork');
    // Data page: no cowork/strava sections, no overlay
    navTo('set-data');
    const dataSecs = [...document.querySelectorAll('#trk-main .drawer-section')].map(s => s.dataset.sec);
    const overlayGone = !document.getElementById('data-page');
    // Cowork page: carries the cowork + reconciliation sections
    navTo('set-cowork');
    const coworkSecs = [...document.querySelectorAll('#trk-main .drawer-section')].map(s => s.dataset.sec);
    return { dataRender, coworkReg, dataSecs, overlayGone, coworkSecs };
  });
  expect(r.dataRender).toBe(true);            // renders into #trk-main like the others (no overlay opener)
  expect(r.coworkReg).toBe(true);
  expect(r.overlayGone).toBe(true);           // the old Data overlay + its "Done" header are gone
  expect(r.dataSecs).toContain('data');
  expect(r.dataSecs).toContain('danger-zone');
  expect(r.dataSecs).not.toContain('ai-cowork');       // cowork moved off the Data page
  expect(r.dataSecs).not.toContain('strava-reconcile'); // reconciliation moved off too
  expect(r.coworkSecs).toContain('strava-reconcile');  // …onto the Cowork page
  expect(r.coworkSecs.some(s => s === 'ai-cowork' || s === 'cowork-autoload-na')).toBe(true);
});

test('feat 402 — the Device page carries the shake / HR section', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('set-device');
    const sec = document.querySelector('#trk-main .drawer-section[data-sec="device"]');
    return { hasSection: !!sec, mentionsShake: !!sec && /Shake to open/i.test(sec.textContent), mentionsHr: !!sec && /heart-rate|HR/i.test(sec.textContent) };
  });
  expect(r.hasSection).toBe(true);
  expect(r.mentionsShake).toBe(true);
  expect(r.mentionsHr).toBe(true);
});
