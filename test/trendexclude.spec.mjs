// feat 165 — the overall progress trend can exclude chosen muscle groups (e.g. an injured area dragging
// the average down), with a loud, persistent reminder banner so you remember to restore it once recovered.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.computeOverallProgress === 'function' && typeof window.toggleTrendExclude === 'function' && typeof window.renderTrends === 'function', null, { timeout: 15000 });
});

test('excluding a muscle group drops its exercises from the overall progress', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null, b = null, bpA = null, bpB = null;
    for (const [u, info] of VAR_INDEX) { if (exMode(u).mode !== 'standard') continue; if (!a) { a = u; bpA = info.bp; continue; } if (info.bp && info.bp !== bpA) { b = u; bpB = info.bp; break; } }
    state.sessions = [
      { id: 's1', date: '2026-01-01T00:00:00Z', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }, { varUuid: b, sets: [{ w: 50, r: 5 }] }] },
      { id: 's2', date: '2026-02-01T00:00:00Z', exercises: [{ varUuid: a, sets: [{ w: 110, r: 5 }] }, { varUuid: b, sets: [{ w: 55, r: 5 }] }] },
    ];
    state.trendExclude = [];
    const before = computeOverallProgress().exerciseCount;
    toggleTrendExclude(bpB); // exclude b's muscle group
    const after = computeOverallProgress().exerciseCount;
    return { before, after, excl: state.trendExclude.slice(), bpB };
  });
  expect(r.before).toBe(2);
  expect(r.after).toBe(1);          // only a's group counts now
  expect(r.excl).toContain(r.bpB);  // persisted on state (a setting, so it survives)
});

test('toggling the same group twice restores it', async ({ page }) => {
  const r = await page.evaluate(() => {
    let bp = null; for (const [u, info] of VAR_INDEX) { if (info.bp) { bp = info.bp; break; } }
    state.trendExclude = [];
    toggleTrendExclude(bp); const on = state.trendExclude.includes(bp);
    toggleTrendExclude(bp); const off = state.trendExclude.includes(bp);
    return { on, off };
  });
  expect(r.on).toBe(true);
  expect(r.off).toBe(false);
});

test('the overall trend renders the reminder banner + exclusion chips when active', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null, bpA = null; for (const [u, info] of VAR_INDEX) { if (exMode(u).mode === 'standard' && info.bp) { a = u; bpA = info.bp; break; } }
    state.sessions = [
      { id: 's1', date: '2026-01-01T00:00:00Z', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] },
      { id: 's2', date: '2026-02-01T00:00:00Z', exercises: [{ varUuid: a, sets: [{ w: 110, r: 5 }] }] },
    ];
    state.trendExclude = [bpA];
    trendView = 'overall';
    const main = document.getElementById('trk-main');
    renderTrends(main);
    return { html: main.innerHTML, hasBanner: !!main.querySelector('.trend-excl-banner'), hasRestore: !!main.querySelector('#trend-excl-restore'), offChip: !!main.querySelector('.trend-excl-chip.off') };
  });
  expect(r.hasBanner).toBe(true);    // the reminder is visible
  expect(r.hasRestore).toBe(true);   // one-tap restore
  expect(r.offChip).toBe(true);      // the excluded group's chip is struck/off
  expect(r.html).toContain('reminder to restore');
});

test('trendExclude is a persisted setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.trendExclude = ['chest'];
    normalizeState(); saveState();
    return { inKeys: SETTINGS_KEYS.includes('trendExclude'), persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).trendExclude };
  });
  expect(r.inKeys).toBe(true);
  expect(r.persisted).toContain('chest');
});
