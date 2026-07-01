// feat 402 — Settings sections now default EXPANDED (settings span more pages, so open-by-default is more useful);
// whichever sections you collapse/expand are remembered across navigation and reloads (state.settingsCollapse:
// an explicit `true` = "user collapsed this"; missing or `false` = expanded).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof renderSettingsPage === 'function', null, { timeout: 15000 });
});

test('feat 402 — sections default expanded; a collapse persists across leaving and returning', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.settingsCollapse = {};                   // fresh — no remembered state
    navTo('set-cosmetic');
    const main = document.getElementById('trk-main');
    const secs = [...main.querySelectorAll('.drawer-section')];
    const allExpanded = secs.length > 0 && secs.every(s => !s.classList.contains('collapsed'));
    // collapse the Theme section
    main.querySelector('.drawer-section[data-sec="theme"] .drawer-section-header').click();
    const collapsedAfterClick = main.querySelector('.drawer-section[data-sec="theme"]').classList.contains('collapsed');
    const stored = state.settingsCollapse.theme;   // true = collapsed
    // leave the screen, then come back
    navTo('workout'); navTo('set-cosmetic');
    const main2 = document.getElementById('trk-main');
    const themeStillCollapsed = main2.querySelector('.drawer-section[data-sec="theme"]').classList.contains('collapsed');
    const othersExpanded = [...main2.querySelectorAll('.drawer-section')].filter(s => s.dataset.sec !== 'theme').every(s => !s.classList.contains('collapsed'));
    const persisted = (JSON.parse(localStorage.getItem('overload_tracker_v2')).settingsCollapse || {}).theme;
    return { count: secs.length, allExpanded, collapsedAfterClick, stored, themeStillCollapsed, othersExpanded, persisted };
  });
  expect(r.count).toBeGreaterThan(0);
  expect(r.allExpanded).toBe(true);           // every section starts expanded
  expect(r.collapsedAfterClick).toBe(true);   // tapping a header collapses it
  expect(r.stored).toBe(true);                // collapsed state recorded as `true`
  expect(r.themeStillCollapsed).toBe(true);   // …and remembered after leaving + returning
  expect(r.othersExpanded).toBe(true);        // the others stay expanded
  expect(r.persisted).toBe(true);             // travels with settings (survives reload)
});

test('feat 402 — re-expanding a collapsed section is remembered too', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.settingsCollapse = { theme: true };      // theme starts collapsed
    navTo('set-cosmetic');
    const main = document.getElementById('trk-main');
    const collapsedFirst = main.querySelector('.drawer-section[data-sec="theme"]').classList.contains('collapsed');
    main.querySelector('.drawer-section[data-sec="theme"] .drawer-section-header').click(); // expand it again
    const expandedNow = !main.querySelector('.drawer-section[data-sec="theme"]').classList.contains('collapsed');
    navTo('workout'); navTo('set-cosmetic');
    const stillExpanded = !document.querySelector('#trk-main .drawer-section[data-sec="theme"]').classList.contains('collapsed');
    return { collapsedFirst, expandedNow, stored: state.settingsCollapse.theme, stillExpanded };
  });
  expect(r.collapsedFirst).toBe(true);   // an explicit true collapses it
  expect(r.expandedNow).toBe(true);      // tapping expands
  expect(r.stored).toBe(false);          // stored as expanded
  expect(r.stillExpanded).toBe(true);    // remembered on return
});
