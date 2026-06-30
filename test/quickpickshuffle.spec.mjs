// feat 395 — Quick Pick can be reshuffled (rotate the recommendation window) and each suggested plan shows how many
// times it's been run and when it was last run.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof recommendPlans === 'function' && typeof quickPickHtml === 'function'
    && typeof findPlanExecutions === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
  await page.evaluate(() => normalizeState());
});

test('feat 395 — reshuffling rotates to a different set of three suggestions', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = (offset) => recommendPlans(45, 3, offset).map(x => x.plan.id);
    const a = ids(0), b = ids(1), c = ids(2);
    return { a, b, c, total: (state.plans || []).length };
  });
  expect(r.total).toBeGreaterThan(6);            // a big enough library to rotate through
  expect(r.a).toHaveLength(3);
  expect(r.b).toHaveLength(3);
  expect(r.a.join()).not.toBe(r.b.join());       // shuffle once → different plans
  expect(r.b.join()).not.toBe(r.c.join());       // shuffle again → different again
});

test('feat 395 — the Quick Pick block has a shuffle button and a per-plan usage line', async ({ page }) => {
  const html = await page.evaluate(() => quickPickHtml());
  expect(html).toContain('id="qp-shuffle"');
  expect(html).toContain('qp-rec-usage');
  expect(html).toContain('Not run yet');         // none of the seed plans have been executed in a fresh state
});

test('feat 395 — a plan that has been executed shows its count and last-run date', async ({ page }) => {
  const r = await page.evaluate(() => {
    const id = recommendPlans(45, 3, 0)[0].plan.id;        // a currently-suggested plan
    state.sessions = state.sessions || [];
    state.sessions.push(
      { id: 'qp-test-1', planId: id, date: '2026-06-20T10:00:00.000Z', endedAt: '2026-06-20T11:00:00.000Z', exercises: [] },
      { id: 'qp-test-2', planId: id, date: '2026-06-28T10:00:00.000Z', endedAt: '2026-06-28T11:00:00.000Z', exercises: [] }
    );
    const ex = findPlanExecutions(id);
    return { count: ex.count, recent: ex.recent && ex.recent.id, html: quickPickHtml() };
  });
  expect(r.count).toBe(2);                        // both completed runs counted
  expect(r.recent).toBe('qp-test-2');             // the newer one is "last"
  expect(r.html).toContain('2× done');            // surfaced in the card
});
