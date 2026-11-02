// feat 521 — the plyo + calisthenics sweep: 54 variations (bodyweight and loaded jumps, landing and sprint drills,
// upper-body plyo, the lever / planche / flag / handstand skills, harder pull-ups and dips, single-leg squat skills).
// Pins that they exist where they belong and log the right way: holds as time, unloaded jumps reps-only, loaded
// jumps as loaded lifts, pull-ups and dips ±.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof PLYO_CALI_ROWS !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const look = page => page.evaluate(() => {
  const by = {}; for (const [u, i] of VAR_INDEX) { const m = exMode(u); by[i.variation.title] = { fam: i.family.id, how: m.mode + (m.load ? '/' + m.load : ''), kind: autoSetupKind(u) }; }
  return { by, n: PLYO_CALI_ROWS.length, found: PLYO_CALI_ROWS.filter(r => [...VAR_INDEX.values()].some(i => i.variation.id === r[1])).length };
});

test('feat 521 — all 54 are in the catalogue', async ({ page }) => {
  const r = await look(page);
  expect(r.n).toBe(54);
  expect(r.found).toBe(54);
});

test('feat 521 — each logs the way the movement works', async ({ page }) => {
  const { by } = await look(page);
  const want = {
    'Pogo Hops': ['plyometrics', 'bodyweight/none'], 'Box Jump-Over': ['plyometrics', 'bodyweight/none'],
    'Kneeling Jump': ['plyometrics', 'bodyweight/none'], 'Depth Drop (Landing Drill)': ['plyometrics', 'bodyweight/none'],
    'Trap Bar Jump': ['plyometrics', 'standard'], 'KB Goblet Jump Squat': ['plyometrics', 'standard'], 'Plate Jump Squat': ['plyometrics', 'standard'],
    'Hop-Overs (Plate Target)': ['plyometrics', 'bodyweight/none'], 'Lateral Bell Hops': ['plyometrics', 'bodyweight/none'],
    'KB Alternating Plyo Push-Up': ['plyo-advanced', 'bodyweight/vest'], 'Explosive Pull-Up': ['plyo-advanced', 'bodyweight/assist'],
    'Chest-to-Bar Pull-Up': ['pull-up', 'bodyweight/assist'], 'Skin the Cat': ['pull-up', 'bodyweight/none'],
    'Straight Bar Dip': ['dips', 'bodyweight/assist'],
    'Front Lever Hold': ['gymnastics-core', 'time'], 'Tuck Planche Hold': ['gymnastics-core', 'time'], 'Human Flag Hold': ['gymnastics-core', 'time'],
    'Freestanding Handstand Hold': ['gymnastics-core', 'time'], 'Crow Pose Hold': ['gymnastics-core', 'time'],
    'Shrimp Squat': ['squat', 'bodyweight/vest'], 'Dragon Pistol Squat': ['squat', 'bodyweight/vest'],
  };
  for (const [t, [fam, how]] of Object.entries(want)) {
    expect(by[t], t).toBeDefined();
    expect(by[t].fam, t + ' family').toBe(fam);
    expect(by[t].how, t + ' logs as').toBe(how);
  }
  // a target is not a load: no loading tool where the bell / plate is only a marker or a hand position
  for (const t of ['Lateral Bell Hops', 'Hop-Overs (Plate Target)', 'KB Alternating Plyo Push-Up', 'Plate Push-Up Hops']) expect(by[t].kind, t).toBeNull();
  expect(by['KB Goblet Jump Squat'].kind).toBe('kettlebell');
  expect(by['Trap Bar Jump'].kind).toBe('barbell');
});
