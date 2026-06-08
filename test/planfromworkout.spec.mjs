// feat 155 — build a new plan seeded from a past "freestyle" (plan-less) workout: one step per logged
// strength exercise, sets = sets logged. Offered in the plans list when such sessions exist.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.newPlanFromSession === 'function' && typeof window._freestyleSessions === 'function' && typeof window.openPlansOverlay === 'function', null, { timeout: 15000 });
});

test('newPlanFromSession makes a step per strength exercise (cardio skipped)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null, b = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode !== 'standard') continue; if (!a) { a = u; continue; } b = u; break; }
    state.plans = [];
    const sess = { id: 'w', date: '2026-03-01T00:00:00Z', exercises: [
      { varUuid: a, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] },
      { varUuid: b, sets: [{ w: 50, r: 8 }, { w: 50, r: 8 }] },
      { varUuid: 'c', cardio: { elapsedMin: 20 }, sets: [] }, // cardio → skipped
    ] };
    const plan = newPlanFromSession(sess);
    return { steps: plan.steps.length, s0: plan.steps[0].sets, s1: plan.steps[1].sets, opt: plan.steps[0].options[0], from: plan.createdFromSession, inState: state.plans.some(p => p.id === plan.id), name: plan.name };
  });
  expect(r.steps).toBe(2);
  expect(r.s0).toBe(3);
  expect(r.s1).toBe(2);
  expect(r.opt).toEqual({ type: 'variation', uuid: expect.any(String) });
  expect(r.from).toBe('w');
  expect(r.inState).toBe(true);
  expect(r.name).toContain('·'); // "<split> · <date>"
});

test('_freestyleSessions excludes plan-attached and cardio-only sessions', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.sessions = [
      { id: 'free', date: '2026-01-01T00:00:00Z', exercises: [{ varUuid: a, sets: [{ w: 1, r: 1 }] }] },
      { id: 'planned', date: '2026-01-02T00:00:00Z', planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 1, r: 1 }] }] },
      { id: 'cardio', date: '2026-01-03T00:00:00Z', exercises: [{ varUuid: 'x', cardio: {}, sets: [] }] },
    ];
    return _freestyleSessions().map(s => s.id);
  });
  expect(r).toEqual(['free']); // only the plan-less strength session
});

test('the plans list offers "From a past workout" when a freestyle session exists', async ({ page }) => {
  const has = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.sessions = [{ id: 'free', date: '2026-01-01T00:00:00Z', exercises: [{ varUuid: a, sets: [{ w: 1, r: 1 }] }] }];
    openPlansOverlay();
    return !!document.getElementById('plan-new-from-workout');
  });
  expect(has).toBe(true);
});

test('the button is hidden when there are no freestyle sessions', async ({ page }) => {
  const has = await page.evaluate(() => {
    state.sessions = [];
    openPlansOverlay();
    return !!document.getElementById('plan-new-from-workout');
  });
  expect(has).toBe(false);
});
