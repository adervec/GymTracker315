// feat 197 — the default open-set abandon time was ~3x too quick (5 min); the default is now 15 min,
// and stored old-default values migrate forward so existing devices pick the new pace up too.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof normalizeState === 'function' && typeof reapAbandonedSet === 'function', null, { timeout: 15000 });
});

test('the default abandon time is 15 minutes; a stored old default (5) migrates to 15', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    delete state.workoutControls; normalizeState(); out.fresh = state.workoutControls.abandonMinutes;
    state.workoutControls.abandonMinutes = 5; normalizeState(); out.migrated = state.workoutControls.abandonMinutes;
    state.workoutControls.abandonMinutes = 8; normalizeState(); out.kept8 = state.workoutControls.abandonMinutes;
    state.workoutControls.abandonMinutes = 30; normalizeState(); out.kept30 = state.workoutControls.abandonMinutes;
    return out;
  });
  expect(r.fresh).toBe(15);    // new default
  expect(r.migrated).toBe(15); // the old 5-min default is migrated forward
  expect(r.kept8).toBe(8);     // a deliberate non-default choice is preserved
  expect(r.kept30).toBe(30);
});

test('an open set survives 10 minutes at the default, and is reaped after 15+', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
    pending.varUuid = pending.varUuid || (FAMILIES[0].variations[0] || {}).uuid;
    pending.sets = [{ w: '100', r: '', wTs: iso(10) }];
    const reaped10 = reapAbandonedSet();
    const after10 = pending.sets.filter(s => s.w === '100').length;
    pending.sets = [{ w: '100', r: '', wTs: iso(16) }];
    const reaped16 = reapAbandonedSet();
    const after16 = pending.sets.filter(s => s.w === '100').length;
    pending.sets = [{ w: '', r: '' }]; // leave the form clean for other tests
    return { reaped10, after10, reaped16, after16 };
  });
  expect(r.reaped10).toBe(false); // 10 min old — would have been reaped under the old 5-min default
  expect(r.after10).toBe(1);
  expect(r.reaped16).toBe(true);  // past the new 15-min default — reaped
  expect(r.after16).toBe(0);
});
