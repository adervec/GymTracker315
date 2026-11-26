// feat 596 — when picking or starting a plan: how many days ago it last ran, how many days you have trained since,
// and the volume multiple it ran at.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-25T18:00:00'));
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof planLastRunInfo === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const seed = page => page.evaluate(() => {
  const plan = state.plans.find(p => p.id === 'seed-push');
  const day = (ymd, extra) => ({ id: 's' + ymd, date: ymd + 'T09:00:00', endedAt: ymd + 'T10:00:00', exercises: [{ varUuid: [...VAR_INDEX.keys()][0], subUuid: null, sets: [{ w: 100, r: 5 }] }], ...extra });
  state.sessions = [
    day('2026-11-10', { planId: plan.id }),                       // an older run
    day('2026-11-19', { planId: plan.id, planScale: 1.25 }),      // the last run, 6 days ago, at 1¼×
    day('2026-11-20'), day('2026-11-20'),                         // two sessions on one day = one workout day
    day('2026-11-23'),
    { id: 'empty', date: '2026-11-24T09:00:00', exercises: [] },  // an empty session is not a workout day
  ];
  return plan.id;
});

test('feat 596 — days ago, workout days since and the multiple, counted on local days', async ({ page }) => {
  const id = await seed(page);
  const r = await page.evaluate((id) => ({ i: planLastRunInfo(id), long: planLastRunText(planLastRunInfo(id)), short: planLastRunText(planLastRunInfo(id), true),
    none: planLastRunInfo('seed-pull'), noneText: planLastRunText(null), labels: [planScaleLabel(1), planScaleLabel(0.75), planScaleLabel(1.3)] }), id);
  expect(r.i).toMatchObject({ count: 2, days: 6, active: 2, scale: 1.25 });
  expect(r.long).toBe('Last done 6 days ago · 2 workout days since · at 1¼× volume · 2× in all');
  expect(r.short).toBe('last 6 days ago · 2 workout days since · 1¼×');
  expect(r.none).toBe(null);
  expect(r.noneText).toBe('Not run yet');
  expect(r.labels).toEqual(['1×', '¾×', '1.3×']);
});

test('feat 596 — the Start sheet says when it last ran and tags the volume used last time', async ({ page }) => {
  const id = await seed(page);
  const r = await page.evaluate(async (id) => {
    planUseDialog(getPlan(id));
    await new Promise(res => setTimeout(res, 100));
    const sheet = [...document.querySelectorAll('.choice-backdrop')].pop();
    const out = { line: sheet.querySelector('.pud-last').textContent.trim(), tagged: [...sheet.querySelectorAll('#pud-scale .was-last')].map(b => b.dataset.scale),
      active: sheet.querySelector('#pud-scale .active').dataset.scale };
    sheet.querySelector('[data-pud="cancel"]').click();
    planUseDialog(getPlan('seed-pull')); await new Promise(res => setTimeout(res, 100));
    const s2 = [...document.querySelectorAll('.choice-backdrop')].pop();
    out.first = s2.querySelector('.pud-last').textContent.trim(); out.noTag = !s2.querySelector('.was-last');
    s2.querySelector('[data-pud="cancel"]').click();
    return out;
  }, id);
  expect(r.line).toBe('🕑 Last done 6 days ago · 2 workout days since · at 1¼× volume · 2× in all');
  expect(r.tagged).toEqual(['1.25']);
  expect(r.active).toBe('1');                   // the default is still 1×; last time's is only tagged
  expect(r.first).toBe('🕑 First time with this plan');
  expect(r.noTag).toBe(true);
});
