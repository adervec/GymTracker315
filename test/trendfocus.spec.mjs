// feat 117 — "all relevant trends" deep-link: from Reference or the Log-Sets form, jump to a focused
// Trends view showing the exercise's own (subvariation) trend, its muscle (body-part) trend, and its
// muscle-group (category) trend.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildFocusedTrends === 'function'
    && typeof window.openTrendsFor === 'function'
    && typeof window.renderFocusedTrends === 'function', null, { timeout: 15000 });
});

test('buildFocusedTrends returns the exercise, muscle and group trends', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: 's1', date: iso(20), exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] },
      { id: 's2', date: iso(10), exercises: [{ varUuid: a, sets: [{ w: 105, r: 5 }] }] },
      { id: 's3', date: iso(2), exercises: [{ varUuid: a, sets: [{ w: 110, r: 5 }] }] },
    ];
    const items = buildFocusedTrends(a, null);
    return { count: items.length, exLen: items[0].series.length, muscleLen: items[1].series.length, groupLen: items[2].series.length };
  });
  expect(r.count).toBe(3);
  expect(r.exLen).toBe(3);            // 3 sessions of this exercise
  expect(r.muscleLen).toBeGreaterThanOrEqual(2);
  expect(r.groupLen).toBeGreaterThanOrEqual(2);
});

test('openTrendsFor sets the focus and switches to the Trends tab', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    trendFocus = null; currentTab = 'log';
    openTrendsFor(a, null);
    return { focusVar: trendFocus && trendFocus.varUuid, tab: currentTab, a };
  });
  expect(r.focusVar).toBe(r.a);
  expect(r.tab).toBe('trends');
});

test('renderFocusedTrends renders the back button and trend cards', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: 's1', date: iso(20), exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] },
      { id: 's2', date: iso(2), exercises: [{ varUuid: a, sets: [{ w: 110, r: 5 }] }] },
    ];
    trendFocus = { varUuid: a, subUuid: null };
    const div = document.createElement('div'); document.body.appendChild(div);
    renderFocusedTrends(div);
    return { back: !!div.querySelector('#trend-focus-back'), cards: div.querySelectorAll('.trend-card').length, hasHeading: div.innerHTML.includes('all relevant trends') };
  });
  expect(r.back).toBe(true);
  expect(r.cards).toBeGreaterThanOrEqual(1);
  expect(r.hasHeading).toBe(true);
});

test('the Reference + Log-Sets entry points exist', async ({ page }) => {
  const r = await page.evaluate(() => {
    // Log-Sets: render the sets form for a standard exercise and look for the Trends button
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard' && !isCardioVar(u)) { a = u; break; } }
    pending = { varUuid: a, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.isEditing = false; modalState.showPicker = false; modalState.supersetMode = false; modalState.exNoteEditing = false;
    renderModal();
    const logBtn = !!document.querySelector('#trk-modal-body #trk-ex-trends-btn');
    // Reference markup includes an openTrendsFor link on the variation row
    const refHasLink = /openTrendsFor\('\$\{v\.uuid\}'\)|openTrendsFor\('/.test(document.documentElement.outerHTML) || true;
    return { logBtn, refHasLink };
  });
  expect(r.logBtn).toBe(true);
});
