// feat 309/368 — section quick-nav pills: a pill bar to navigate between sibling pages within a group. Injected by
// renderCurrentPage on leaves of Reflect / Prepare / Study / Settings, into whichever surface that page renders into
// (#trk-main, the Data overlay, the Reference panel, or the Glossary/Anatomy overlay). Toggleable; default on.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof renderCurrentPage === 'function'
    && typeof PAGES !== 'undefined' && typeof reflectPillsEnabled === 'function', null, { timeout: 15000 });
  await page.evaluate(() => { state.reflectPills = true; });
});

test('Reflect leaves show the quick-nav pills (one per child, current active)', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('summary', { replace: true });
    return {
      count: document.querySelectorAll('#trk-main .reflect-pill').length,
      activeIsSummary: !!document.querySelector('#trk-main .reflect-pill.active[data-reflect-go="summary"]'),
      childCount: PAGES.reflect.children.length,
    };
  });
  expect(r.count).toBe(r.childCount);
  expect(r.activeIsSummary).toBe(true);
});

test('a pill navigates within the section', async ({ page }) => {
  const cur = await page.evaluate(() => {
    navTo('summary', { replace: true });
    document.querySelector('#trk-main .reflect-pill[data-reflect-go="trends"]').click();
    return currentPage;
  });
  expect(cur).toBe('trends');
});

test('the pills are optional — the setting hides them everywhere', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.reflectPills = false;
    navTo('summary', { replace: true });
    const offReflect = document.querySelectorAll('#trk-main .reflect-pill').length;
    navTo('gyms', { replace: true });
    const offPrepare = document.querySelectorAll('#trk-main .reflect-pill').length;
    state.reflectPills = true; navTo('summary', { replace: true });
    const on = document.querySelectorAll('#trk-main .reflect-pill').length;
    return { offReflect, offPrepare, on };
  });
  expect(r.offReflect).toBe(0);
  expect(r.offPrepare).toBe(0);
  expect(r.on).toBeGreaterThan(0);
});

test('feat 368 — Prepare / Study / Settings leaves all get sibling pills, in their own surface', async ({ page }) => {
  const r = await page.evaluate(() => {
    const countIn = (sel) => document.querySelectorAll(sel + ' .reflect-pill').length;
    const probe = (pageId, parent, sel) => {
      navTo(pageId, { replace: true });
      return { n: countIn(sel), want: PAGES[parent].children.length, active: !!document.querySelector(`${sel} .reflect-pill.active[data-reflect-go="${pageId}"]`) };
    };
    return {
      gyms:      probe('gyms', 'prepare', '#trk-main'),        // Prepare, in #trk-main
      prefs:     probe('set-prefs', 'settings', '#trk-main'),  // Settings, relocated into #trk-main
      data:      probe('set-data', 'settings', '#data-page-body'), // Settings, Data overlay surface
      advice:    probe('advice', 'study', '#trk-main'),        // Study, in #trk-main
      reference: probe('reference', 'study', '#panel-reference'),  // Study, Reference panel surface
      glossary:  probe('glossary', 'study', '#ref-gloss-panel'),   // Study, Glossary overlay surface
    };
  });
  for (const k of Object.keys(r)) {
    expect(r[k].n, `${k} pill count`).toBe(r[k].want);
    expect(r[k].active, `${k} active pill`).toBe(true);
  }
});

test('feat 379 — pills are compact (emoji + short abbreviation) and the bar is sticky / single-row', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('summary', { replace: true });
    const bar = document.querySelector('#trk-main .reflect-pills');
    const cs = getComputedStyle(bar);
    const summaryPill = [...bar.querySelectorAll('.reflect-pill')].find(p => p.dataset.reflectGo === 'summary');
    return {
      label: summaryPill.textContent.trim(),
      title: summaryPill.getAttribute('title'),
      position: cs.position,
      noWrap: cs.flexWrap,
      scrolls: cs.overflowX,
    };
  });
  expect(r.label).toBe('📋 Sum');     // emoji + very short abbreviation, not "Summary"
  expect(r.title).toBe('Summary');    // full name kept as the tooltip
  expect(r.position).toBe('sticky');  // always visible
  expect(r.noWrap).toBe('nowrap');    // single row…
  expect(r.scrolls).toBe('auto');     // …that scrolls horizontally
});

test('feat 368 — no duplicate pill bars after re-rendering the same page', async ({ page }) => {
  const bars = await page.evaluate(() => {
    navTo('set-data', { replace: true });
    renderCurrentPage(); renderCurrentPage();              // re-render twice
    return document.querySelectorAll('#data-page-body > .reflect-pills').length;
  });
  expect(bars).toBe(1);
});
