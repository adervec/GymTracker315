// feat 522 — the mainstream-gap sweep: 70 everyday lifts the catalogue was missing (the full Olympic lifts and
// pulls, upright rows, rope climb / wall walk / devil press / SDHP, atlas stone and axle, staple accessories).
// Also pins two logging fixes it exposed: a lift FROM THE HANG is not a timed hold, and a plank you move in
// (shoulder taps, up-downs, hip dips) logs reps.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof GAP_ROWS !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const look = page => page.evaluate(() => {
  const by = {}, ids = new Map();
  for (const [u, i] of VAR_INDEX) {
    ids.set(i.variation.id, (ids.get(i.variation.id) || 0) + 1);
    const m = exMode(u); by[i.variation.title] = { fam: i.family.id, how: m.mode + (m.load ? '/' + m.load : ''), kind: autoSetupKind(u) };
  }
  return { by, n: GAP_ROWS.length, dup: GAP_ROWS.filter(r => ids.get(r[1]) !== 1).map(r => r[1]) };
});

test('feat 522 — all 70 are in, each id unique', async ({ page }) => {
  const r = await look(page);
  expect(r.n).toBe(70);
  expect(r.dup).toEqual([]);
});

test('feat 522 — each lands in its family and logs the way it works', async ({ page }) => {
  const { by } = await look(page);
  const want = {
    'Squat Clean': ['olympic-lifts', 'standard', 'barbell'], 'Hang Clean': ['olympic-lifts', 'standard', 'barbell'],
    'Squat Snatch': ['olympic-lifts', 'standard', 'barbell'], 'Clean Pull': ['olympic-lifts', 'standard', 'barbell'],
    'Rope Climb': ['crossfit-moves', 'bodyweight/none', null], 'Wall Walk': ['crossfit-moves', 'bodyweight/none', null],
    'Dumbbell Devil Press': ['crossfit-moves', 'standard', 'dumbbell'], 'Sumo Deadlift High Pull': ['crossfit-moves', 'standard', 'barbell'],
    'Atlas Stone Load': ['strongman', 'standard', null], 'Barbell Upright Row': ['lateral-raise', 'standard', 'barbell'],
    'Cable Triceps Kickback': ['tricep-extension', 'standard', 'pin'], 'Standing Leg Curl (Machine)': ['leg-curl', 'standard', 'pin'],
    'Dumbbell Hip Thrust': ['hip-thrust', 'standard', 'dumbbell'], 'Fire Hydrant': ['glute-accessories', 'bodyweight/none', null],
    'Forward Lunge': ['lunge', 'bodyweight/vest', 'dumbbell'], 'Hanging Knee Raise': ['abs-dynamic', 'bodyweight/none', null],
    'Chest-Supported Rear Delt Raise': ['rear-delt', 'standard', 'dumbbell'], 'Reverse Wrist Curl': ['wrist-curl', 'standard', 'barbell'],
  };
  for (const [t, [fam, how, kind]] of Object.entries(want)) {
    expect(by[t], t).toBeDefined();
    expect([by[t].fam, by[t].how, by[t].kind], t).toEqual([fam, how, kind]);
  }
});

test('feat 522 — a lift from the hang is reps, and so is a plank you move in', async ({ page }) => {
  const { by } = await look(page);
  for (const t of ['Hang Power Clean', 'Hang Power Snatch', 'Hang Clean']) expect(by[t].how, t).toBe('standard');
  for (const t of ['Plank Shoulder Taps', 'Plank Up-Down', 'Side Plank Hip Dips']) expect(by[t].how, t).toBe('bodyweight/none');
  for (const t of ['Plank', 'Side Plank', 'Dead Hang']) expect(by[t].how, t + ' is still a hold').toBe('time');
});
