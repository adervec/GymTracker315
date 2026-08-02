// feat 456 — plans and splits as sortable tables with collapsed descriptions, and the fix for a 28-day split
// showing only its 16 sessions. Covers: "All" excluding the Plans of the Day feed, column sorting, one-row-at-
// a-time expansion, the full-rotation split table (rest days included), and the themed-split table.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const seed = (page) => page.evaluate(() => {
  const step = (fam) => ({ id: 's' + fam, sets: 3, options: [{ type: 'movement', familyId: fam }] });
  state.plans = [
    { id: 'a', name: 'Alpha Push', desc: 'A description that only shows when the row is open.', steps: [step('flat-bench-press'), step('shoulder-press')] },
    { id: 'b', name: 'Bravo Legs',  desc: 'Legs.',  steps: [step('squat'), step('leg-curl'), step('calf-raise')] },
    { id: 'c', name: 'Charlie Pull', desc: 'Pull.', steps: [step('row')] },
    { id: 'd1', name: 'POD Monday',  source: 'daily', dailyDate: '2026-06-22', steps: [step('squat')] },
    { id: 'd2', name: 'POD Tuesday', source: 'daily', dailyDate: '2026-06-23', steps: [step('squat')] },
  ];
  state.seededPlanIds = state.plans.map(p => p.id);
  openPlansOverlay();
});
const names = (page) => page.evaluate(() => [...document.querySelectorAll('#trk-main .plan-row .plan-c-name')].map(n => n.textContent.trim()));

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderPlansList === 'function' && typeof splitDayLayout === 'function'
    && typeof PLAN_SORTS !== 'undefined', null, { timeout: 15000 });
});

test('feat 456 — "All" leaves out the Plans of the Day feed; its own chip (and search) still find them', async ({ page }) => {
  await seed(page);
  const all = await names(page);
  expect(all.some(n => n.includes('POD'))).toBe(false);
  expect(all.length).toBe(3);                       // only the three library plans
  const chip = await page.evaluate(() => {
    const n = [...document.querySelectorAll('#trk-main [data-plan-cat]')].find(b => b.dataset.planCat === 'Plans of the Day');
    const allChipCount = document.querySelector('#trk-main [data-plan-cat="all"] .plan-chip-n').textContent;
    n.click();
    return { allChipCount, pods: [...document.querySelectorAll('#trk-main .plan-row .plan-c-name')].map(e => e.textContent.trim()) };
  });
  expect(chip.allChipCount).toBe('3');              // the All count excludes them too
  expect(chip.pods.every(n => n.includes('POD'))).toBe(true);
  expect(chip.pods.length).toBe(2);
  // a search reaches them without needing the chip
  const found = await page.evaluate(() => { _plansCatFilter = new Set(); _plansSearch = 'POD'; renderPlansOverlay();
    return [...document.querySelectorAll('#trk-main .plan-row .plan-c-name')].map(e => e.textContent.trim()); });
  expect(found.length).toBe(2);
});

test('feat 456 — the list is a table with sortable columns; tapping the active one flips direction', async ({ page }) => {
  await seed(page);
  const head = await page.evaluate(() => [...document.querySelectorAll('#trk-main .plan-thead span')].map(s => s.textContent).filter(Boolean));
  expect(head).toEqual(['Plan', 'Category', 'Int', 'Time', 'Sets']);

  const byName = await page.evaluate(() => { document.querySelector('#trk-main [data-plan-sort="name"]').click();
    return [...document.querySelectorAll('#trk-main .plan-row .plan-c-name')].map(e => e.textContent.trim()); });
  expect(byName).toEqual(['Alpha Push', 'Bravo Legs', 'Charlie Pull']);

  const flipped = await page.evaluate(() => { document.querySelector('#trk-main [data-plan-sort="name"]').click(); // same column → reverse
    return { order: [...document.querySelectorAll('#trk-main .plan-row .plan-c-name')].map(e => e.textContent.trim()), desc: _plansSortDesc }; });
  expect(flipped.order).toEqual(['Charlie Pull', 'Bravo Legs', 'Alpha Push']);
  expect(flipped.desc).toBe(true);

  // sorting by sets puts the 3-step plan first, and a flat sort drops the category headers
  const bySets = await page.evaluate(() => { _plansSortDesc = false; document.querySelector('#trk-main [data-plan-sort="sets"]').click();
    return { first: document.querySelector('#trk-main .plan-row .plan-c-name').textContent.trim(), heads: document.querySelectorAll('#trk-main .plan-cat-head').length }; });
  expect(bySets.first).toBe('Bravo Legs');
  expect(bySets.heads).toBe(0);
});

test('feat 456 — exactly one plan description is open at a time, and the ★ stays reachable when collapsed', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const q = () => document.querySelectorAll('#trk-main .plan-row-desc').length;
    const collapsed = { descs: q(), stars: document.querySelectorAll('#trk-main [data-fav-plan]').length };
    document.querySelector('#trk-main [data-plan-expand]').click();
    const one = { descs: q(), text: document.querySelector('#trk-main .plan-row-desc').textContent, acts: document.querySelectorAll('#trk-main .plan-row-actions [data-plan-use]').length };
    // open a different row → the first closes
    const rows = [...document.querySelectorAll('#trk-main .plan-row [data-plan-expand]')];
    rows[rows.length - 1].click();
    const still = { descs: q(), openId: _plansExpandId };
    document.querySelector(`#trk-main [data-plan-expand="${still.openId}"]`).click();  // tap again → closes
    return { collapsed, one, still, after: q() };
  });
  expect(r.collapsed.descs).toBe(0);                       // nothing expanded by default
  expect(r.collapsed.stars).toBe(3);                       // one ★ per row, no expansion needed
  expect(r.one.descs).toBe(1);
  expect(r.one.text).toContain('only shows when the row is open');
  expect(r.one.acts).toBe(1);                              // Use/Edit/Del appear with the description
  expect(r.still.descs).toBe(1);                           // still exactly one
  expect(r.after).toBe(0);
});

test('feat 456 — a 28-day split lists all 28 days, not just its 16 sessions', async ({ page }) => {
  const r = await page.evaluate(() => {
    const theme = themedSplit('odyssey');                                   // 28-day, 16 slots
    const split = buildRecommendedSplit({ sessions: theme.slots.length, minutes: 60, slots: theme.slots });
    const layout = splitDayLayout(split, 28, theme.slots.length);
    // the day numbers must match where saving it as a program actually puts each session
    const prog = buildProgramFromSplit(split, theme.slots.length, 60, 28);
    const fromLayout = layout.map(r2 => r2.s && r2.s.plan ? r2.s.plan.id : null);
    return { slots: theme.slots.length, days: themeDays(theme), rows: layout.length,
      rest: layout.filter(r2 => !r2.s).length, labels: [layout[0].label, layout[27].label],
      matchesProgram: JSON.stringify(fromLayout) === JSON.stringify(prog.rotation) };
  });
  expect(r.slots).toBe(16);
  expect(r.days).toBe(28);
  expect(r.rows).toBe(28);                       // the bug: this used to be 16
  expect(r.rest).toBe(12);
  expect(r.labels).toEqual(['Day 1', 'Day 28']);
  expect(r.matchesProgram, 'the preview must agree with what Save as program produces').toBe(true);
});

test('feat 456 — the split table renders every day, with Use on the row and the description collapsed', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.splitPlan = { sessions: 16, days: 28, minutes: 60, theme: 'odyssey' };
    state.spUI = { collapse: { themes: true }, themeFilter: 'all' };
    navTo('split-planner');
    const main = document.getElementById('trk-main');
    const head = [...main.querySelectorAll('.sp-thead span')].map(s => s.textContent).filter(Boolean);
    const before = { rows: main.querySelectorAll('.sp-days .sp-day').length,
      rest: main.querySelectorAll('.sp-days .sp-day.rest').length,
      use: main.querySelectorAll('.sp-days .sp-use').length,
      descs: main.querySelectorAll('.sp-day-desc').length };
    main.querySelector('.sp-days [data-sp-day]').click();
    const m2 = document.getElementById('trk-main');
    return { head, before, openDescs: m2.querySelectorAll('.sp-day-detail').length, expand: _spExpandDay };
  });
  expect(r.head).toEqual(['Day', 'Focus', 'Plan', 'Time', 'Sets']);
  expect(r.before.rows).toBe(28);
  expect(r.before.rest).toBe(12);
  expect(r.before.use).toBe(16);                 // one-tap Use survives the collapse
  expect(r.before.descs).toBe(0);
  expect(r.openDescs).toBe(1);
  expect(r.expand).toBe('d0');
});

test('feat 456 — themed splits are a sortable table; one tap still selects, the chevron shows the blurb', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.splitPlan = { sessions: 3, days: 7, minutes: 60 };
    state.spUI = { collapse: { themes: false }, themeFilter: 'all' };
    navTo('split-planner');
    const main = document.getElementById('trk-main');
    const ids = () => [...document.querySelectorAll('#trk-main .sp-themes [data-sp-theme]')].map(b => b.dataset.spTheme);
    const blurbs = () => document.querySelectorAll('#trk-main .sp-theme-blurb').length;
    const collapsed = blurbs();
    document.querySelector('#trk-main [data-theme-sort="days"]').click();       // sort by rotation length
    const byDays = [...document.querySelectorAll('#trk-main .sp-themes [data-sp-theme]')]
      .map(b => themeDays(THEMED_SPLITS.find(t => t.id === b.dataset.spTheme)));
    document.querySelector('#trk-main [data-theme-sort="days"]').click();       // flip
    const desc = [...document.querySelectorAll('#trk-main .sp-themes [data-sp-theme]')]
      .map(b => themeDays(THEMED_SPLITS.find(t => t.id === b.dataset.spTheme)));
    document.querySelector('#trk-main [data-sp-theme-exp="oak"]').click();      // chevron → blurb only
    const afterChevron = { blurbs: blurbs(), theme: state.splitPlan.theme };
    document.querySelector('#trk-main [data-sp-theme="oak"]').click();          // row → selects, one tap
    return { count: ids().length, collapsed, byDays, desc, afterChevron, theme: state.splitPlan.theme, sessions: state.splitPlan.sessions };
  });
  expect(r.count).toBeGreaterThanOrEqual(25);
  expect(r.collapsed).toBe(0);                                   // every blurb collapsed by default
  expect(r.byDays).toEqual([...r.byDays].sort((a, b) => a - b)); // ascending
  expect(r.desc).toEqual([...r.desc].sort((a, b) => b - a));     // flipped to descending
  expect(r.afterChevron.blurbs).toBe(1);
  expect(r.afterChevron.theme, 'the chevron must not select the split').toBeFalsy();
  expect(r.theme).toBe('oak');                                   // one tap on the row still selects
  expect(r.sessions).toBe(6);
});
