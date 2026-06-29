// feat 319 — Plan of the Day: validate agent-proposed plans against real movements, import as source:'daily'
// (same-date replace + age prune), render them in a pinned "Plans of the Day" section, run like any plan.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof validateImportedPlan === 'function' && typeof coworkImportPlanOfDay === 'function'
    && typeof planCategory === 'function' && typeof planCatRank === 'function' && typeof renderPlansList === 'function'
    && typeof planUseForWorkout === 'function', null, { timeout: 15000 });
});

test('validateImportedPlan keeps real options, drops unknown ones, rejects empty plans', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ok = validateImportedPlan({ name: 'X', steps: [{ sets: 4, load: 'heavy', options: [{ type: 'movement', familyId: 'squat' }] }] });
    const partial = validateImportedPlan({ steps: [{ options: [{ type: 'movement', familyId: 'squat' }, { type: 'movement', familyId: 'NOT-REAL' }] }] });
    const empty = validateImportedPlan({ steps: [{ options: [{ type: 'movement', familyId: 'NOT-REAL' }] }, { options: [{ type: 'variation', uuid: 'nope' }] }] });
    return {
      okSteps: ok.plan && ok.plan.steps.length,
      okHasId: !!(ok.plan && ok.plan.steps[0].id),
      partialOpts: partial.plan && partial.plan.steps[0].options.length,
      emptyNull: empty.plan === null,
    };
  });
  expect(r.okSteps).toBe(1);
  expect(r.okHasId).toBe(true);
  expect(r.partialOpts).toBe(1);   // the unknown familyId was dropped
  expect(r.emptyNull).toBe(true);  // nothing valid → rejected
});

test('coworkImportPlanOfDay imports as source:daily, rejects bad, replaces same-date, prunes old', async ({ page }) => {
  const r = await page.evaluate(() => {
    const today = new Date().toISOString().slice(0, 10);
    const oldDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    state.cowork = { ...state.cowork, podKeepDays: 7 };
    state.plans = [{ id: 'old-daily', name: 'Stale', source: 'daily', dailyDate: oldDate, steps: [{ id: 's', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] }] }];
    const res = coworkImportPlanOfDay({ date: today, rationale: 'fresh legs', plans: [
      { name: 'Leg Focus', intensity: 4, steps: [{ sets: 4, load: 'heavy', options: [{ type: 'movement', familyId: 'squat' }] }] },
      { name: 'Garbage', steps: [{ options: [{ type: 'movement', familyId: 'NOPE' }] }] }, // rejected
    ] });
    const dailies = state.plans.filter(p => p.source === 'daily');
    const kept = dailies.find(p => p.name === 'Leg Focus');
    // re-import same date → replaces, doesn't accumulate
    coworkImportPlanOfDay({ date: today, plans: [{ name: 'Leg Focus v2', steps: [{ sets: 3, options: [{ type: 'movement', familyId: 'deadlift' }] }] }] });
    const afterReplace = state.plans.filter(p => p.source === 'daily' && p.dailyDate === today).map(p => p.name);
    return { added: res.added, rejected: res.rejected, dailyCount: dailies.length, keptSource: kept && kept.source, keptDate: kept && kept.dailyDate, rationale: kept && kept.dailyRationale, oldPruned: !state.plans.some(p => p.id === 'old-daily'), afterReplace };
  });
  expect(r.added).toBe(1);
  expect(r.rejected).toBe(1);
  expect(r.dailyCount).toBe(1);          // only the valid one (old pruned, garbage rejected)
  expect(r.keptSource).toBe('daily');
  expect(r.keptDate).toBeTruthy();
  expect(r.rationale).toBe('fresh legs');
  expect(r.oldPruned).toBe(true);
  expect(r.afterReplace).toEqual(['Leg Focus v2']); // same-date replace
});

test('daily plans are pinned in their own category and run like any plan', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false; state.sessions = [];
    const today = new Date().toISOString().slice(0, 10);
    coworkImportPlanOfDay({ date: today, plans: [{ name: 'POD Legs', intensity: 4, steps: [{ sets: 4, options: [{ type: 'movement', familyId: 'squat' }] }] }] });
    const daily = state.plans.find(p => p.source === 'daily');
    const cat = planCategory(daily), rank = planCatRank('Plans of the Day');
    // render the list and confirm the pinned section header appears
    _plansSearch = ''; _plansCatFilter = new Set(); _plansLenRange = { min: 5, max: 120 }; _plansFavOnly = false; _plansPage = 0;
    const el = document.getElementById('trk-main'); renderPlansList(el);
    const html = el.innerHTML;
    // it starts like any plan
    planUseForWorkout(daily.id);
    const active = getActiveSession();
    return { cat, rank, headerShown: /Plans of the Day/.test(html), nameShown: /POD Legs/.test(html), dayShown: /plan-day-tag/.test(html), planId: active && active.planId, expected: daily.id };
  });
  expect(r.cat).toBe('Plans of the Day');
  expect(r.rank).toBe(0);                 // pinned first
  expect(r.headerShown).toBe(true);
  expect(r.nameShown).toBe(true);
  expect(r.dayShown).toBe(true);          // feat 322 — the row indicates the day
  expect(r.planId).toBe(r.expected);      // runs like a normal plan
});
