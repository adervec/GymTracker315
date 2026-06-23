// feat 314 — quick-pick should USE as much of the available time as possible: the time-fit score now scales
// ~proportionally to the budget used (a half-length plan ≈0.5), so a 45-min plan no longer wins a 3-hour window.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof planTimeScore === 'function' && typeof estimatePlanMinutes === 'function'
    && typeof recommendPlans === 'function', null, { timeout: 15000 });
});

test('planTimeScore rewards fuller use of the time window', async ({ page }) => {
  const r = await page.evaluate(() => {
    const mk = (nSteps) => ({ id: 'x', name: 'x', steps: Array.from({ length: nSteps }, () => ({ sets: 5, options: [{ type: 'movement', familyId: 'squat' }] })) });
    const short = mk(2), long = mk(13); // ~30 min vs ~180 min
    const B = 180;
    return { shortEst: estimatePlanMinutes(short), longEst: estimatePlanMinutes(long),
      shortScore: planTimeScore(short, B), longScore: planTimeScore(long, B) };
  });
  expect(r.longEst).toBeGreaterThan(r.shortEst);
  expect(r.longScore).toBeGreaterThan(r.shortScore);   // the fuller-use plan scores higher
  expect(r.shortScore).toBeLessThan(0.45);             // a ~quarter-budget plan is now strongly penalized
  expect(r.longScore).toBeGreaterThan(0.85);           // a plan that ~fills the window scores near the top
});

test('recommendPlans fills a big budget with a longer plan than a small budget', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; // neutral freshness/recovery so time-fit drives the order
    const t180 = recommendPlans(180, 5)[0];
    const t45 = recommendPlans(45, 5)[0];
    return { e180: estimatePlanMinutes(t180.plan), e45: estimatePlanMinutes(t45.plan) };
  });
  expect(r.e180).toBeGreaterThan(r.e45);       // a 3-hour window recommends a longer plan than a 45-min window
  expect(r.e180).toBeGreaterThanOrEqual(90);   // …and actually uses a good chunk of the 180 (not a short plan)
});
