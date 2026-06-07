// feat 98 — History extreme-outlier review: findOutlierSets() flags likely data-entry slips
// (weight over the limit, absurd reps, or e1RM far above this exercise's own baseline) for the
// user to keep (set._ok, never re-flagged) or delete. Only weighted standard-mode sets count.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.findOutlierSets === 'function'
    && typeof window.keepOutlierSet === 'function'
    && typeof window.deleteOutlierSet === 'function', null, { timeout: 15000 });
});

// Build one standard-mode exercise with a clean history plus two obvious typos and a legit PR.
async function seed(page) {
  return await page.evaluate(() => {
    let stdUuid = null;
    for (const [uuid] of VAR_INDEX) { if (exMode(uuid).mode === 'standard') { stdUuid = uuid; break; } }
    state.unit = 'lb';
    state.maxWeightLb = 1500;
    state.deletedSessions = [];
    const mk = (date, sets) => ({ id: 'S-' + date, date, updatedAt: date, exercises: [{ varUuid: stdUuid, sets }] });
    state.sessions = [
      mk('2026-05-01T00:00:00.000Z', [{ w: 100, r: 5 }, { w: 100, r: 5 }]),
      mk('2026-05-08T00:00:00.000Z', [{ w: 105, r: 5 }, { w: 110, r: 5 }]),
      mk('2026-05-15T00:00:00.000Z', [{ w: 130, r: 3 }]),               // genuine PR — must NOT flag
      mk('2026-05-22T00:00:00.000Z', [{ w: 1350, r: 5 }]),              // 135 -> 1350 weight typo
      mk('2026-05-29T00:00:00.000Z', [{ w: 100, r: 150 }]),            // rep typo
    ];
    return stdUuid;
  });
}

test('flags the weight typo and the rep typo, but not a legit PR', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const o = findOutlierSets();
    return {
      count: o.length,
      weights: o.map((x) => x.set.w).sort((a, b) => a - b),
      flaggedThePR: o.some((x) => x.set.w === 130),
      everyOneHasReasons: o.every((x) => Array.isArray(x.reasons) && x.reasons.length > 0),
    };
  });
  expect(r.count).toBe(2);
  expect(r.weights).toEqual([100, 1350]); // the rep-typo set (w=100) and the weight-typo set (w=1350)
  expect(r.flaggedThePR).toBe(false);
  expect(r.everyOneHasReasons).toBe(true);
});

test('a weight over the configured limit is flagged on absolute grounds', async ({ page }) => {
  const flagged = await page.evaluate(() => {
    state.unit = 'lb'; state.maxWeightLb = 500; state.deletedSessions = [];
    let stdUuid = null;
    for (const [uuid] of VAR_INDEX) { if (exMode(uuid).mode === 'standard') { stdUuid = uuid; break; } }
    // Only two sets (below the >=4 relative-baseline threshold) so the limit is the sole trigger.
    state.sessions = [{ id: 'X', date: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z',
      exercises: [{ varUuid: stdUuid, sets: [{ w: 200, r: 5 }, { w: 900, r: 5 }] }] }];
    const o = findOutlierSets();
    return { count: o.length, w: o[0] && o[0].set.w };
  });
  expect(flagged.count).toBe(1);
  expect(flagged.w).toBe(900);
});

test('Keep marks the set vetted (set._ok) so it is never re-flagged', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const before = findOutlierSets().length;
    const rec = findOutlierSets().find((x) => x.set.w === 1350);
    keepOutlierSet(rec);
    return { before, ok: rec.set._ok === true, after: findOutlierSets().length };
  });
  expect(r.before).toBe(2);
  expect(r.ok).toBe(true);
  expect(r.after).toBe(1); // the kept one is gone from the list; the rep typo remains
});

test('Delete removes the offending set from history', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const totalBefore = state.sessions.reduce((c, s) => c + s.exercises.reduce((c2, e) => c2 + e.sets.length, 0), 0);
    const rec = findOutlierSets().find((x) => x.set.w === 1350);
    deleteOutlierSet(rec);
    const totalAfter = state.sessions.reduce((c, s) => c + s.exercises.reduce((c2, e) => c2 + e.sets.length, 0), 0);
    // the session that held only the typo set is now empty -> pruned + tombstoned
    return { totalBefore, totalAfter, stillFlagged: findOutlierSets().some((x) => x.set.w === 1350), tomb: state.deletedSessions.some((t) => t.id === 'S-2026-05-22T00:00:00.000Z') };
  });
  expect(r.totalAfter).toBe(r.totalBefore - 1);
  expect(r.stillFlagged).toBe(false);
  expect(r.tomb).toBe(true);
});

test('non-standard modes (time/distance/bodyweight) are not outlier-checked', async ({ page }) => {
  const count = await page.evaluate(() => {
    state.unit = 'lb'; state.maxWeightLb = 1500; state.deletedSessions = [];
    let timeUuid = null;
    for (const [uuid] of VAR_INDEX) { if (exMode(uuid).mode === 'time') { timeUuid = uuid; break; } }
    if (!timeUuid) return -1; // no time-mode exercise available -> skip assertion
    // 600 "reps" (= seconds) would trip the rep guard if it were treated as standard.
    state.sessions = [{ id: 'T', date: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z',
      exercises: [{ varUuid: timeUuid, sets: [{ w: 0, r: 600 }] }] }];
    return findOutlierSets().length;
  });
  expect(count === 0 || count === -1).toBe(true);
});
