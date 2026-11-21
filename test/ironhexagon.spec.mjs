// feat 582 — the Iron Hexagon: six 2.5-hour plans written as one split (Push / Pull / Legs, then Chest & Back /
// Shoulders & Arms / Legs), and a Split Planner theme that uses those exact plans day for day.
// feat 583 — the plan view lists an exercise under the step its sets were counted toward.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const IDS = ['seed-hex-push', 'seed-hex-pull', 'seed-hex-legs-a', 'seed-hex-chest-back', 'seed-hex-shoulders-arms', 'seed-hex-legs-b'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildRecommendedSplit === 'function' && typeof _allocSetsToSteps === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 582 — six plans, 2.5 hours and 15 steps each, every option a real movement', async ({ page }) => {
  const r = await page.evaluate((IDS) => {
    normalizeState();
    const fams = new Set(FAMILIES.map(f => f.id));
    return IDS.map(id => { const p = SEED_PLANS.find(x => x.id === id); if (!p) return { id, missing: true };
      const fam = st => st.options.map(o => o.familyId);
      return { id, seeded: !!state.plans.find(x => x.id === id), min: estimatePlanMinutes(p), steps: p.steps.length, cat: planCategory(p),
        bad: p.steps.flatMap(fam).filter(f => !fams.has(f)), named: /^Iron Hexagon \d — .+\(2\.5h\)$/.test(p.name), descs: p.steps.every(st => st.desc),
        adductor: p.steps.some(st => fam(st).includes('adductor')),
        core: p.steps.filter(st => ['abs-dynamic', 'obliques', 'core-stability'].every(f => fam(st).includes(f))).length,
        choice: p.steps.filter(st => st.options.length > 1).length, lead: fam(p.steps[0])[0], lowBack: p.steps.some(st => fam(st).includes('back-extension') || fam(st).includes('deadlift')) };
    });
  }, IDS);
  for (const p of r) {
    expect(p.missing, p.id).toBeUndefined();
    expect(p.seeded, p.id).toBe(true);
    expect(p.min, p.id).toBe(150);
    expect(p.steps, p.id).toBe(15);
    expect(p.bad, p.id).toEqual([]);
    expect(p.named, p.id).toBe(true);
    expect(p.descs, p.id).toBe(true);
    expect(p.core, p.id).toBe(2);                         // every core step offers dynamic abs, obliques or a hold
    expect(p.choice, p.id).toBeGreaterThanOrEqual(5);      // plenty of either/or steps
  }
  expect(r.map(p => p.cat)).toEqual(['Push', 'Pull', 'Legs', 'Upper', 'Upper', 'Legs']);
  expect(r.map(p => p.adductor)).toEqual([false, false, true, false, false, true]);   // hip adduction on both leg days
  expect(r.map(p => p.lead)).toEqual(['flat-bench-press', 'pull-up', 'squat', 'incline-bench-press', 'shoulder-press', 'deadlift']);   // each day leads with what its twin does not
  expect(r.map(p => p.lowBack)).toEqual([false, false, true, false, false, true]);   // the lower back rests the day before each leg day
});

test('feat 582 — the Iron Hexagon theme lays out those exact plans, day for day', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const t = themedSplit('iron-hexagon');
    const split = buildRecommendedSplit({ sessions: 6, minutes: 60, slots: t.slots, planIds: t.plans });   // the minutes setting does not swap them out
    state.plans = state.plans.filter(p => p.id !== 'seed-hex-pull');                                          // a deleted plan falls back to the usual pick
    const gap = buildRecommendedSplit({ sessions: 6, minutes: 150, slots: t.slots, planIds: t.plans });
    const oak = themedSplit('oak'), plain = buildRecommendedSplit({ sessions: 6, minutes: 60, slots: oak.slots, planIds: oak.plans });
    return { name: t.name, days: themeDays(t), ids: split.map(d => d.plan.id), est: split.map(d => d.est), gap: [gap[1].slot, gap[1].plan && gap[1].plan.id !== 'seed-hex-pull', gap[0].plan.id], plain: plain.length };
  });
  expect(r.name).toBe('The Iron Hexagon');
  expect(r.days).toBe(7);                                  // six sessions and a rest day
  expect(r.ids).toEqual(IDS);
  expect(r.est).toEqual([150, 150, 150, 150, 150, 150]);
  expect(r.gap).toEqual(['Pull', true, 'seed-hex-push']);
  expect(r.plain).toBe(6);                                 // themes without their own plans work as before
});

test('feat 583 — "pulldown or pull-up" then "pulldown": pull-ups take the first step, pulldowns show on the second', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = id => FAMILIES.find(f => f.id === id).variations;
    const P = fam('pull-up')[0].uuid, L = fam('lat-pulldown')[0].uuid, R = fam('row')[0].uuid;
    const plan = { id: 't583', name: 't', steps: [
      { id: 'a', sets: 5, options: [_mvOpt('pull-up'), _mvOpt('lat-pulldown')] }, { id: 'b', sets: 4, options: [_mvOpt('lat-pulldown')] },
      { id: 'c', sets: 3, options: [_mvOpt('row')] }, { id: 'd', sets: 3, options: [_mvOpt('row')] }] };
    const sets = n => Array.from({ length: n }, () => ({ w: 100, r: 8 }));
    const sess = (list) => ({ id: 's' + Math.random(), date: new Date().toISOString(), planId: 't583', exercises: list.map(([v, n]) => ({ varUuid: v, subUuid: null, sets: sets(n) })) });
    const names = (s) => { const el = document.createElement('div'); renderPlanExecutionView(el, plan, s);
      const al = planStepAllocation(s, plan);
      return { counts: al.saved.slice(0, 4), by: plan.steps.map((st, i) => s.exercises.filter((ex, k) => (al.savedBy[i][al.savedEx.indexOf(ex)] || 0) > 0).map(ex => ex.varUuid === P ? 'pullup' : ex.varUuid === L ? 'pulldown' : 'row')),
        shown: (el.innerHTML.match(/pexec-used-name/g) || []).length };
    };
    return {
      first: names(sess([[L, 5]])),                           // only the pulldowns so far: they sit on the first step
      both: names(sess([[L, 5], [P, 5]])),                    // pull-ups arrive later: they take step 1, pulldowns move to step 2
      rows: names(sess([[R, 6]])),                            // one exercise can still span two steps of the same movement
      extra: names(sess([[L, 12]])),                          // surplus sets stay with the last step they match
    };
  });
  expect(r.first.by).toEqual([['pulldown'], [], [], []]);
  expect(r.both.counts).toEqual([5, 5, 0, 0]);
  expect(r.both.by).toEqual([['pullup'], ['pulldown'], [], []]);
  expect(r.both.shown).toBe(2);                              // each listed once, not the pulldowns under both steps
  expect(r.rows.by).toEqual([[], [], ['row'], ['row']]);
  expect(r.rows.shown).toBe(2);
  expect(r.extra.by).toEqual([['pulldown'], ['pulldown'], [], []]);
  expect(r.extra.counts).toEqual([5, 7, 0, 0]);
});
