// feat 283 — the Split Planner gets: collapsible sections (themed splits collapsed by default, persisted), a
// searchable + length-filterable themed-split list, and MANY more themed splits spanning the new up-to-28-day
// rotation range (each theme carries its own `days`). Picking a long theme sets the split length and saves a
// rotating cycle.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof THEMED_SPLITS !== 'undefined' && typeof themeDays === 'function'
    && typeof renderSplitPlannerPage === 'function' && typeof navTo === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 283 — many more themed splits, each with a valid day length up to 28', async ({ page }) => {
  const r = await page.evaluate(() => ({
    count: THEMED_SPLITS.length,
    long: THEMED_SPLITS.filter(t => themeDays(t) > 7).length,
    max: Math.max(...THEMED_SPLITS.map(t => themeDays(t))),
    allValid: THEMED_SPLITS.every(t => themeDays(t) >= t.slots.length && themeDays(t) <= 28),
    uniqueIds: new Set(THEMED_SPLITS.map(t => t.id)).size,
  }));
  expect(r.count).toBeGreaterThanOrEqual(25);     // "many, many more"
  expect(r.long).toBeGreaterThanOrEqual(10);      // a healthy set of >1-week rotations
  expect(r.max).toBe(28);                         // up to the new maximum
  expect(r.allValid).toBe(true);
  expect(r.uniqueIds).toBe(r.count);              // no duplicate theme ids
});

test('feat 283 — picking a long themed split sets the split length and saves a rotating cycle', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.program = null; state.splitPlan = { sessions: 3, days: 7, minutes: 60 };
    const main = document.getElementById('trk-main');
    navTo('split-planner');
    const t = THEMED_SPLITS.find(x => themeDays(x) >= 12);
    main.querySelector(`[data-sp-theme="${t.id}"]`).click();   // click works even while the section is collapsed
    const cfgDays = state.splitPlan.days, picked = state.splitPlan.theme === t.id;
    document.querySelector('#trk-main #pg-save').click();
    const prog = state.program;
    return { themeDays: themeDays(t), cfgDays, picked, mode: prog && prog.mode, splitLen: prog && prog.splitLen };
  });
  expect(r.picked).toBe(true);
  expect(r.cfgDays).toBe(r.themeDays);    // the theme drove the split length
  expect(r.mode).toBe('rotation');        // >7 days → a rotation
  expect(r.splitLen).toBe(r.themeDays);
});

test('feat 283 — sections are collapsible; themed splits default collapsed and the toggle persists', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    delete state.spUI;                       // fresh defaults
    state.program = null; state.splitPlan = { sessions: 3, days: 7, minutes: 60 };
    const main = document.getElementById('trk-main');
    navTo('split-planner');
    const startCollapsed = main.querySelector('[data-sp-coll="themes"]').closest('.sp-sec').classList.contains('collapsed');
    const inputsCollapsed = main.querySelector('[data-sp-coll="inputs"]').closest('.sp-sec').classList.contains('collapsed');
    main.querySelector('[data-sp-coll="themes"]').click();     // expand it
    const afterToggle = document.querySelector('[data-sp-coll="themes"]').closest('.sp-sec').classList.contains('collapsed');
    const persisted = !!(JSON.parse(localStorage.getItem('overload_tracker_v2')).spUI || {}).collapse;
    return { startCollapsed, inputsCollapsed, afterToggle, persisted, secCount: document.querySelectorAll('#trk-main .sp-sec').length };
  });
  expect(r.startCollapsed).toBe(true);    // themed splits collapsed by default
  expect(r.inputsCollapsed).toBe(false);  // other sections expand by default
  expect(r.afterToggle).toBe(false);      // tapping the header expands it
  expect(r.persisted).toBe(true);         // travels with settings
  expect(r.secCount).toBeGreaterThanOrEqual(5);
});

test('feat 283 — the themed-split search hides non-matching chips without removing them', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.spUI = { collapse: { themes: false }, themeFilter: 'all' };
    state.splitPlan = { sessions: 3, days: 7, minutes: 60 };
    const main = document.getElementById('trk-main');
    navTo('split-planner');
    const total = main.querySelectorAll('.sp-themes .sp-theme').length;
    const input = main.querySelector('#sp-theme-search');
    input.value = 'lunar';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const visible = [...main.querySelectorAll('.sp-themes .sp-theme')].filter(el => el.style.display !== 'none').length;
    return { total, visible, stillInDom: main.querySelectorAll('.sp-themes .sp-theme').length };
  });
  expect(r.total).toBeGreaterThanOrEqual(25);
  expect(r.visible).toBe(1);              // only "The Lunar Cycle"
  expect(r.stillInDom).toBe(r.total);     // search hides, never removes
});

test('feat 283 — the length filter narrows the themed list to a bucket', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.spUI = { collapse: { themes: false }, themeFilter: 'all' };
    state.splitPlan = { sessions: 3, days: 7, minutes: 60 };
    const main = document.getElementById('trk-main');
    navTo('split-planner');
    const all = main.querySelectorAll('.sp-themes .sp-theme').length;
    main.querySelector('[data-theme-filter="long"]').click();   // 15–28d bucket
    const m2 = document.getElementById('trk-main');
    const chips = [...m2.querySelectorAll('.sp-themes .sp-theme')];
    const allLong = chips.every(el => { const t = THEMED_SPLITS.find(x => x.id === el.dataset.spTheme); return themeDays(t) >= 15; });
    return { all, longOnly: chips.length, allLong };
  });
  expect(r.all).toBeGreaterThanOrEqual(25);
  expect(r.longOnly).toBeLessThan(r.all);
  expect(r.longOnly).toBeGreaterThanOrEqual(1);
  expect(r.allLong).toBe(true);
});
