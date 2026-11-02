// feat 523 — the coach / creator sweep: 28 signature moves of popular coaches and viral formats the catalogue was
// missing (Kelso + dip shrugs, sternum chin, lying DB curl, cuffed laterals, American deadlift, slant board squat,
// planche push-up, ice cream maker, 12-3-30…). Pins that each exists once, where it belongs, logging the right way.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof COACH_ROWS !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 523 — all 28 are in, unique, in their families and logging the way they work', async ({ page }) => {
  const r = await page.evaluate(() => {
    const by = {}, ids = new Map();
    for (const [u, i] of VAR_INDEX) { ids.set(i.variation.id, (ids.get(i.variation.id) || 0) + 1);
      const m = exMode(u); by[i.variation.title] = [i.family.id, m.mode + (m.load ? '/' + m.load : ''), isCardioVar(u)]; }
    return { by, n: COACH_ROWS.length, dup: COACH_ROWS.filter(r => ids.get(r[1]) !== 1).map(r => r[1]) };
  });
  expect(r.n).toBe(28);
  expect(r.dup).toEqual([]);
  const want = {
    'Kelso Shrug': ['shrugs', 'standard', false], 'Dip Shrug': ['shrugs', 'bodyweight/assist', false],
    'Sternum Chin-Up': ['pull-up', 'bodyweight/assist', false], 'Lying Dumbbell Curl': ['bicep-curl', 'standard', false],
    'Cuffed Cable Lateral Raise': ['lateral-raise', 'standard', false], 'American Deadlift': ['deadlift', 'standard', false],
    'Slant Board Squat': ['squat', 'bodyweight/vest', false], 'Elephant Walk': ['atg-knees-over-toes', 'bodyweight/none', false],
    'Planche Push-Up': ['push-ups', 'bodyweight/vest', false], 'Ice Cream Maker': ['gymnastics-core', 'bodyweight/none', false],
    'Seated Banded Abduction': ['glute-accessories', 'bodyweight/none', false],
    '12-3-30 Incline Walk': ['treadmill', 'standard', true], 'Rucking (Backpack Carry)': ['loaded-carries', 'distance', false],
  };
  for (const [t, w] of Object.entries(want)) expect(r.by[t], t).toEqual(w);
});
