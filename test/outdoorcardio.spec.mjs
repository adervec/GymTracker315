// feat 524 — the external-database pass: outdoor cardio gets a family (running, cycling, swimming, walking,
// hiking, paddling, skiing), Strava activities land on the outdoor entries instead of the treadmill / bike, and 22
// strength / mobility gaps the wger comparison surfaced are filled.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof PASS3_ROWS !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 524 — the Outdoor Cardio family exists, is cardio, and is in the reference docs', async ({ page }) => {
  const r = await page.evaluate(() => {
    const vars = [...VAR_INDEX].filter(([, i]) => i.family.id === 'outdoor-cardio');
    return { n: vars.length, cardio: vars.every(([u]) => isCardioVar(u)), doc: !!exercises.find(e => e.id === 'outdoor-cardio'),
      titles: vars.map(([, i]) => i.variation.title) };
  });
  expect(r.n).toBe(18); // 17 + skating (feat 525)
  expect(r.cardio).toBe(true);
  expect(r.doc).toBe(true);
  for (const t of ['Outdoor Run', 'Road Cycling', 'Pool Swim (Laps)', 'Hiking', 'Kayaking / Canoeing']) expect(r.titles).toContain(t);
});

test('feat 524 — Strava outdoor sports land outdoors; virtual ones stay on the machines', async ({ page }) => {
  const r = await page.evaluate(() => Object.fromEntries(['Run', 'VirtualRun', 'Ride', 'VirtualRide', 'MountainBikeRide', 'Swim', 'Hike', 'Walk', 'NordicSki', 'Pickleball']
    .map(t => [t, VAR_INDEX.get(stravaSportToCardioVar(t).varUuid).variation.title])));
  expect(r).toEqual({ Run: 'Outdoor Run', VirtualRun: 'Steady-State Run', Ride: 'Road Cycling', VirtualRide: 'Steady-State Bike',
    MountainBikeRide: 'Mountain Biking', Swim: 'Pool Swim (Laps)', Hike: 'Hiking', Walk: 'Outdoor Walk',
    NordicSki: 'Cross-Country Skiing', Pickleball: 'Other / Outdoor Cardio' });
});

test('feat 524 — the strength / mobility gaps are in, unique, and log the right way', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = new Map(), by = {};
    for (const [u, i] of VAR_INDEX) { ids.set(i.variation.id, (ids.get(i.variation.id) || 0) + 1); const m = exMode(u); by[i.variation.title] = m.mode + (m.load ? '/' + m.load : ''); }
    return { n: PASS3_ROWS.length, dup: PASS3_ROWS.filter(r => ids.get(r[1]) !== 1).map(r => r[1]), by };
  });
  expect(r.n).toBe(22);
  expect(r.dup).toEqual([]);
  expect(r.by['Jumping Jacks']).toBe('bodyweight/none');
  expect(r.by['Plank Leg Lifts'], 'a plank you move in is reps').toBe('bodyweight/none');
  expect(r.by['Stomach Vacuum Hold']).toBe('time');
  expect(r.by['Speed Deadlift']).toBe('standard');
  expect(r.by['Dumbbell Hang Power Clean']).toBe('standard');
});

test('feat 525 — the free-exercise-db gaps are in, unique, and log the right way', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = new Map(), by = {};
    for (const [u, i] of VAR_INDEX) { ids.set(i.variation.id, (ids.get(i.variation.id) || 0) + 1); const m = exMode(u); by[i.variation.title] = [i.family.id, m.mode + (m.load ? '/' + m.load : '')]; }
    return { n: PASS4_ROWS.length, dup: PASS4_ROWS.filter(r => ids.get(r[1]) !== 1).map(r => r[1]), by };
  });
  expect(r.n).toBe(29);
  expect(r.dup).toEqual([]);
  expect(r.by['Clean from Blocks']).toEqual(['olympic-lifts', 'standard']);
  expect(r.by['Jerk Dip Squat'], 'a jerk dip is not a dip').toEqual(['olympic-lifts', 'standard']);
  expect(r.by['Seated Leg Tuck']).toEqual(['abs-dynamic', 'bodyweight/none']);
  expect(r.by['Skating (Inline / Ice)'][0]).toBe('outdoor-cardio');
  expect(r.by['Conan’s Wheel'][0]).toBe('strongman');
});
