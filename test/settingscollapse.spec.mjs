// feat 289 — Settings sections now default COLLAPSED, and whichever sections you expand/collapse are remembered
// across navigation and reloads (state.settingsCollapse: an explicit `false` = "user expanded this"; missing or
// `true` = collapsed).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof renderSettingsPage === 'function', null, { timeout: 15000 });
});

test('feat 289 — sections default collapsed; an expand persists across leaving and returning', async ({ page }) => {
  const r = await page.evaluate(() => {
    delete state.settingsCollapse;                 // fresh — no remembered state
    navTo('set-cosmetic');
    const main = document.getElementById('trk-main');
    const secs = [...main.querySelectorAll('.drawer-section')];
    const allCollapsed = secs.length > 0 && secs.every(s => s.classList.contains('collapsed'));
    // expand the Theme section
    main.querySelector('.drawer-section[data-sec="theme"] .drawer-section-header').click();
    const expandedAfterClick = !main.querySelector('.drawer-section[data-sec="theme"]').classList.contains('collapsed');
    const stored = state.settingsCollapse.theme;   // false = expanded
    // leave the screen, then come back
    navTo('workout'); navTo('set-cosmetic');
    const main2 = document.getElementById('trk-main');
    const themeStillOpen = !main2.querySelector('.drawer-section[data-sec="theme"]').classList.contains('collapsed');
    const othersCollapsed = [...main2.querySelectorAll('.drawer-section')].filter(s => s.dataset.sec !== 'theme').every(s => s.classList.contains('collapsed'));
    const persisted = (JSON.parse(localStorage.getItem('overload_tracker_v2')).settingsCollapse || {}).theme;
    return { count: secs.length, allCollapsed, expandedAfterClick, stored, themeStillOpen, othersCollapsed, persisted };
  });
  expect(r.count).toBeGreaterThan(0);
  expect(r.allCollapsed).toBe(true);        // every section starts collapsed
  expect(r.expandedAfterClick).toBe(true);  // tapping a header expands it
  expect(r.stored).toBe(false);             // expanded state recorded as `false`
  expect(r.themeStillOpen).toBe(true);      // …and remembered after leaving + returning
  expect(r.othersCollapsed).toBe(true);     // the others stay collapsed
  expect(r.persisted).toBe(false);          // travels with settings (survives reload)
});

test('feat 289 — re-collapsing an expanded section is remembered too', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.settingsCollapse = { theme: false };     // theme starts expanded
    navTo('set-cosmetic');
    const main = document.getElementById('trk-main');
    const openFirst = !main.querySelector('.drawer-section[data-sec="theme"]').classList.contains('collapsed');
    main.querySelector('.drawer-section[data-sec="theme"] .drawer-section-header').click(); // collapse it again
    const collapsedNow = main.querySelector('.drawer-section[data-sec="theme"]').classList.contains('collapsed');
    navTo('workout'); navTo('set-cosmetic');
    const stillCollapsed = document.querySelector('#trk-main .drawer-section[data-sec="theme"]').classList.contains('collapsed');
    return { openFirst, collapsedNow, stored: state.settingsCollapse.theme, stillCollapsed };
  });
  expect(r.openFirst).toBe(true);       // an explicit false opens it
  expect(r.collapsedNow).toBe(true);    // tapping collapses
  expect(r.stored).toBe(true);          // stored as collapsed
  expect(r.stillCollapsed).toBe(true);  // remembered on return
});
