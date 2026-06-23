// feat 331 — the first set always opens BLANK. Archived the two behaviors that pre-populated it:
// prefill-from-last-session (feat 58) and the plan suggested-weight seed (feat 82). The suggested target is
// still available as the one-tap feat-234 prog-target hint; it just no longer auto-fills the set.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const stdVar = () => { for (const [uu, i] of VAR_INDEX) if (!i.variation.subvariation) return uu; return null; }; // eslint-disable-line

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof startExerciseFromSuggestion === 'function'
    && typeof startExerciseFromPlanOption === 'function' && typeof getLastSetForExercise === 'function', null, { timeout: 15000 });
});

test('first set opens blank even with prefill-from-history forced ON and prior history (archived feat 58)', async ({ page }) => {
  const r = await page.evaluate((src) => {
    const u = eval('(' + src + ')')();
    state.workoutControls = { ...(state.workoutControls || {}), prefillFromHistory: true }; // even if forced on
    state.sessions = [{ id: 'h', date: '2026-06-01T10:00:00.000Z', endedAt: '2026-06-01T11:00:00.000Z',
      exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 135, r: 8, ts: '2026-06-01T10:30:00.000Z' }] }] }];
    const last = getLastSetForExercise(u, null);            // a prior set exists to (formerly) copy
    startExerciseFromSuggestion(u);
    return { hadHistory: !!(last && last.w === 135), n: pending.sets.length, w: pending.sets[0].w, rr: pending.sets[0].r };
  }, stdVar.toString());
  expect(r.hadHistory).toBe(true);   // there WAS a prior set to copy…
  expect(r.n).toBe(1);
  expect(r.w).toBe('');              // …but the first set still opens blank
  expect(r.rr).toBe('');
});

test('first set opens blank when starting from a plan step with a load target (archived feat 82)', async ({ page }) => {
  const r = await page.evaluate((src) => {
    const u = eval('(' + src + ')')();
    state.sessions = [{ id: 'h', date: '2026-06-01T10:00:00.000Z', endedAt: '2026-06-01T11:00:00.000Z',
      exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 135, r: 8, ts: '2026-06-01T10:30:00.000Z' }] }] }];
    const sug = (typeof suggestedWeightForVar === 'function') ? suggestedWeightForVar(u, 'heavy') : null; // old code would have seeded this
    startExerciseFromPlanOption({ type: 'variation', uuid: u }, 'heavy');
    return { sug, n: pending.sets.length, w: pending.sets[0].w, rr: pending.sets[0].r };
  }, stdVar.toString());
  expect(r.sug).not.toBeNull();   // a suggestion existed → the old code would have pre-filled it
  expect(r.n).toBe(1);
  expect(r.w).toBe('');           // first set still opens blank
  expect(r.rr).toBe('');
});

test('the Settings "Prefill from last session" toggle is gone', async ({ page }) => {
  const present = await page.evaluate(() => {
    renderSettingsDrawer();
    return !!document.querySelector('[data-wc="prefillFromHistory"]');
  });
  expect(present).toBe(false);
});
