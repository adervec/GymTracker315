// feat 329 — a workout's export (PNG card + Strava-friendly text) surfaces the plan it ran from, if applicable.
// The plan name is taken from the per-session snapshot (planExec.planName, which survives a later rename/delete)
// or falls back to the live plan; a free-form workout (no plan) shows nothing.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof sessionPlanLabel === 'function' && typeof summarizeSession === 'function'
    && typeof buildWorkoutText === 'function' && typeof getPlan === 'function', null, { timeout: 15000 });
});

const benchUuid = (page) => page.evaluate(() => { const fv = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; }; return fv('flat-bench-press'); });

test('sessionPlanLabel: live plan by id, snapshot fallback, and null when free-form', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.plans = [{ id: 'PL1', name: 'Push Day A', rev: 2, revisions: [{ rev: 2, at: '2026-06-20T00:00:00.000Z' }] }];
    const live = sessionPlanLabel({ planId: 'PL1', planRev: 2 });               // resolves the live plan name
    const snap = sessionPlanLabel({ planId: 'GONE', planExec: { planName: 'Deleted Leg Day' } }); // snapshot wins / survives delete
    const free = sessionPlanLabel({ id: 's', exercises: [] });                   // no plan → null
    return { live, snap, free };
  });
  expect(r.live).toBe('Push Day A');
  expect(r.snap).toBe('Deleted Leg Day');   // snapshot used even though the plan id no longer exists
  expect(r.free).toBeNull();
});

test('summarizeSession carries the plan label (and omits it for a free workout)', async ({ page }) => {
  const u = await benchUuid(page);
  const r = await page.evaluate((u) => {
    state.plans = [{ id: 'PL1', name: 'Upper Power', rev: 1, revisions: [{ rev: 1, at: '2026-06-20T00:00:00.000Z' }] }];
    const planned = { id: 'a', date: '2026-06-22T10:00:00.000Z', endedAt: '2026-06-22T11:00:00.000Z', planId: 'PL1', planRev: 1, exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] }] };
    const free = { id: 'b', date: '2026-06-22T10:00:00.000Z', endedAt: '2026-06-22T11:00:00.000Z', exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] }] };
    return { planned: summarizeSession(planned).plan, free: summarizeSession(free).plan };
  }, u);
  expect(r.planned).toBe('Upper Power');
  expect(r.free).toBeNull();
});

test('the text export includes a Plan line only when the workout ran from a plan', async ({ page }) => {
  const u = await benchUuid(page);
  const r = await page.evaluate((u) => {
    state.plans = [{ id: 'PL1', name: 'Push Day A', rev: 1, revisions: [{ rev: 1, at: '2026-06-20T00:00:00.000Z' }] }];
    const planned = { id: 'a', date: '2026-06-22T10:00:00.000Z', endedAt: '2026-06-22T11:00:00.000Z', planId: 'PL1', planRev: 1, exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] }] };
    const free = { id: 'b', date: '2026-06-22T10:00:00.000Z', endedAt: '2026-06-22T11:00:00.000Z', exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] }] };
    return { planned: buildWorkoutText([planned], { preset: 'session' }), free: buildWorkoutText([free], { preset: 'session' }) };
  }, u);
  expect(r.planned).toContain('Plan: Push Day A');
  expect(r.free).not.toContain('Plan:');
});
