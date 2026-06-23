// feat 318 — orphan Strava → cardio history + opt-in systemic fatigue. Orphan (non-strength, unlinked)
// activities become cardio sessions (deduped by stravaId). Cardio never touches per-muscle recovery; an
// opt-in toggle lets recent cardio shave a few points off the composite Training Readiness only.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof stravaSportToCardioVar === 'function' && typeof stravaActivityToCardioSession === 'function'
    && typeof coworkStravaOrphans === 'function' && typeof coworkInsertStravaOrphans === 'function'
    && typeof cardioSystemicFatigue === 'function' && typeof trainingReadiness === 'function' && typeof recoveryReadiness === 'function'
    && typeof stravaActivityUrl === 'function', null, { timeout: 15000 });
});

test('feat 323 — unknown sports map to the generic Other Cardio (not a wrong machine); + Strava link', async ({ page }) => {
  const r = await page.evaluate(() => {
    const GEN = 'b1a10013-0013-4013-8013-aaaaaaaa0013';
    const kayak = stravaSportToCardioVar('Kayaking'), swim = stravaSportToCardioVar('Swim'), pickle = stravaSportToCardioVar('Pickleball');
    const info = VAR_INDEX.get(kayak.varUuid);
    return { kayak: kayak.varUuid, swim: swim.varUuid, pickle: pickle.varUuid, GEN, mega: info && info.family.mega, title: info && info.variation.title, url: stravaActivityUrl('123456') };
  });
  expect(r.kayak).toBe(r.GEN);     // kayaking is NOT forced to elliptical anymore
  expect(r.swim).toBe(r.GEN);
  expect(r.pickle).toBe(r.GEN);
  expect(r.mega).toBe('cardio');   // still recovery-neutral
  expect(r.title).toMatch(/Other/);
  expect(r.url).toBe('https://www.strava.com/activities/123456');
});

test('stravaSportToCardioVar maps sports to real cardio variations', async ({ page }) => {
  const r = await page.evaluate(() => {
    const check = sport => { const m = stravaSportToCardioVar(sport); const info = VAR_INDEX.get(m.varUuid); return { uuid: m.varUuid, mega: info && info.family.mega }; };
    return { run: check('Run'), walk: check('Walk'), ride: check('Ride'), row: check('Rowing'), unknown: check('Pickleball') };
  });
  for (const k of ['run', 'walk', 'ride', 'row', 'unknown']) {
    expect(r[k].uuid, k).toBeTruthy();
    expect(r[k].mega, k + ' should map to a cardio variation').toBe('cardio');
  }
  expect(r.run.uuid).not.toBe(r.ride.uuid); // distinct sports → distinct vars
});

test('stravaActivityToCardioSession maps the fields and carries stravaId + origin', async ({ page }) => {
  const s = await page.evaluate(() => {
    state.deviceId = 'dev-A';
    return stravaActivityToCardioSession({ id: 'r1', name: 'Morning Run', sport_type: 'Run', start_date: '2026-06-22T07:00:00.000Z', elapsed_time: 1800, distance: 5000, average_heartrate: 150, max_heartrate: 172, calories: 360 });
  });
  expect(s.stravaId).toBe('r1');
  expect(s.source).toBe('strava-import');
  expect(s.origin).toBe('dev-A');
  expect(s.exercises[0].cardio.elapsedMin).toBe(30);          // 1800s → 30 min
  expect(s.exercises[0].cardio.distance).toBeCloseTo(5, 1);    // 5000 m → 5 km
  expect(s.exercises[0].sets).toEqual([]);                     // cardio has no sets
  expect(s.hr.avg).toBe(150);
  expect(s.endedAt).toBeTruthy();
});

test('orphans are inserted as cardio and never duplicated; linked activities are excluded', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [{ id: 'g1', date: '2026-06-22T18:00:00Z', origin: state.deviceId, stravaId: 'lift-1', exercises: [] }]; // already linked
    state.stravaActivities = [
      { id: 'lift-1', sportType: 'WeightTraining', startDate: '2026-06-22T18:00:00Z', elapsedSec: 3600 }, // strength + linked → not an orphan
      { id: 'run-1', sportType: 'Run', startDate: '2026-06-21T07:00:00Z', elapsedSec: 1800, distance: 5000 }, // orphan
      { id: 'ride-1', sportType: 'Ride', startDate: '2026-06-20T09:00:00Z', elapsedSec: 5400, distance: 30000 }, // orphan
    ];
    const orphans = coworkStravaOrphans().map(a => a.id).sort();
    const first = coworkInsertStravaOrphans(coworkStravaOrphans());
    const again = coworkInsertStravaOrphans(coworkStravaOrphans()); // re-run → no dupes
    const cardioSessions = state.sessions.filter(s => s.source === 'strava-import');
    return { orphans, first, again, cardioCount: cardioSessions.length, ids: cardioSessions.map(s => s.stravaId).sort() };
  });
  expect(r.orphans).toEqual(['ride-1', 'run-1']);   // strength + linked excluded
  expect(r.first).toBe(2);
  expect(r.again).toBe(0);                            // idempotent
  expect(r.cardioCount).toBe(2);
  expect(r.ids).toEqual(['ride-1', 'run-1']);
});

test('cardio fatigue is opt-in: per-muscle recovery is identical; only Training Readiness shifts', async ({ page }) => {
  const r = await page.evaluate(() => {
    const findVar = (fam) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fam) return u; return null; };
    const bench = findVar('flat-bench-press'), squat = findVar('squat'), row = findVar('row');
    const now = Date.now(), day = 86400000;
    const sess = (ago, v) => ({ id: 's' + ago + v.slice(0, 4), date: new Date(now - ago * day).toISOString(), origin: state.deviceId, exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }] });
    state.sessions = [sess(1, bench), sess(2, squat), sess(3, row),
      { id: 'cardioToday', date: new Date(now - 2 * 3600000).toISOString(), origin: state.deviceId, exercises: [{ varUuid: stravaSportToCardioVar('Run').varUuid, subUuid: null, sets: [], cardio: { elapsedMin: 60, effort: 9, distance: 10, distanceUnit: 'km', ts: new Date().toISOString() } }] }];
    state.cowork.cardioFatigue = false;
    const recOff = JSON.stringify(recoveryReadiness(now));
    const trOff = trainingReadiness(now);
    state.cowork.cardioFatigue = true;
    const recOn = JSON.stringify(recoveryReadiness(now));
    const trOn = trainingReadiness(now);
    return { fatigue: cardioSystemicFatigue(now), recSame: recOff === recOn, offScore: trOff && trOff.score, onScore: trOn && trOn.score, onPenalty: trOn && trOn.factors.cardioPenalty };
  });
  expect(r.fatigue).toBeGreaterThan(0);            // recent hard cardio registers
  expect(r.recSame).toBe(true);                    // per-muscle recovery is untouched by the toggle
  expect(r.onScore).toBeLessThan(r.offScore);      // readiness drops when the toggle is on…
  expect(r.onPenalty).toBeGreaterThan(0);          // …by the cardio penalty
});
