// feat 154 — an active workout can be discarded (with confirmation): the whole session is removed as if
// it never happened, and tombstoned so cross-device sync won't resurrect it. Distinct from End Workout.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.discardActiveWorkout === 'function' && typeof window.render === 'function', null, { timeout: 15000 });
});

const seedActive = (page) => page.evaluate(() => {
  let u = null; for (const [v] of VAR_INDEX) { if (exMode(v).mode === 'standard') { u = v; break; } }
  const now = new Date().toISOString();
  state.readonly = false;
  state.sessions = [{ id: 'today', date: now, exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5, wTs: now, ts: now }] }] }];
  state.deletedSessions = [];
  pending = { varUuid: null, sets: [] };
});

test('confirming discard removes the session and tombstones it', async ({ page }) => {
  await seedActive(page);
  const r = await page.evaluate(async () => {
    discardActiveWorkout();
    const dialog = !!document.querySelector('.choice-backdrop');
    document.querySelector('.choice-backdrop .choice-btn.danger').click(); // "Discard workout"
    await new Promise(r => setTimeout(r, 40));
    return { dialog, sessions: state.sessions.length, tombstones: (state.deletedSessions || []).length, active: !!getActiveSession() };
  });
  expect(r.dialog).toBe(true);
  expect(r.sessions).toBe(0);     // session gone
  expect(r.tombstones).toBe(1);   // recorded for sync
  expect(r.active).toBe(false);   // no active workout left
});

test('cancelling discard keeps the workout intact', async ({ page }) => {
  await seedActive(page);
  const r = await page.evaluate(async () => {
    discardActiveWorkout();
    document.querySelector('.choice-backdrop .choice-btn:not(.danger)').click(); // "Keep it"
    await new Promise(r => setTimeout(r, 40));
    return { sessions: state.sessions.length, tombstones: (state.deletedSessions || []).length };
  });
  expect(r.sessions).toBe(1);
  expect(r.tombstones).toBe(0);
});

test('the active workout controls render a Discard button', async ({ page }) => {
  await seedActive(page);
  const has = await page.evaluate(() => { currentTab = 'log'; render(); return !!document.getElementById('wc-discard-btn'); });
  expect(has).toBe(true);
});
