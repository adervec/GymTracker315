// feat 551 — estimated calories from heart rate (Keytel), live in the HR bar, stored at workout end, labelled as
// an estimate, never overriding a measured figure, and scalable to match a device you trust.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof estimateSessionCalories === 'function' && typeof VAR_INDEX !== 'undefined', null, { timeout: 15000 });
  await page.evaluate(() => {
    state.bodyComp = [{ date: new Date().toISOString(), weightKg: 82 }];
    state.profile = { ...state.profile, dob: '1990-05-01', gender: 'male', heightCm: 180 };
    state.recoveryLog = []; state.workoutControls = state.workoutControls || {}; delete state.workoutControls.kcalScale;
    window._steady = (hr, mins) => { const S = []; for (let t = 0; t < mins * 60; t++) S.push([t * 1000, hr]);
      return { date: new Date(Date.now() - mins * 60000).toISOString(), endedAt: new Date().toISOString(), hrSamples: S, exercises: [] }; };
  });
});

test('feat 551 — Keytel from HR, weight, age and sex; harder work burns more; easy HR tapers to standing', async ({ page }) => {
  const r = await page.evaluate(() => {
    const run = estimateSessionCalories(_steady(150, 60)), easy = estimateSessionCalories(_steady(95, 60)), rest = estimateSessionCalories(_steady(58, 60));
    const k150 = (-55.0969 + 0.6309 * 150 + 0.1988 * 82 + 0.2017 * ageFromDob('1990-05-01')) / 4.184 * 60;   // the published male equation, per hour
    state.profile.gender = 'female'; const f = estimateSessionCalories(_steady(150, 60));
    state.profile.gender = 'male'; state.recoveryLog = [{ date: new Date().toISOString(), vo2max: 55 }]; const vo2 = estimateSessionCalories(_steady(150, 60));
    return { run, easy, rest, k150: Math.round(k150), f: f.kcal, vo2 };
  });
  expect(Math.abs(r.run.kcal - r.k150)).toBeLessThanOrEqual(2);
  expect(r.run.kcal).toBeGreaterThan(r.easy.kcal);
  expect(r.rest.kcal).toBe(Math.round(82 * 1.3));     // at resting HR: light standing, 1.3 MET for an hour
  expect(r.run.active).toBeLessThan(r.run.kcal);       // active excludes the resting (BMR) share
  expect(r.f).toBeLessThan(r.run.kcal);
  expect(r.vo2.vo2).toBe(true);
});

test('feat 551 — no weight, no estimate; a missing age is assumed and said so', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.bodyComp = []; const none = estimateSessionCalories(_steady(130, 30));
    state.bodyComp = [{ date: new Date().toISOString(), weightKg: 82 }]; delete state.profile.dob;
    return { none, assumed: estimateSessionCalories(_steady(130, 30)).assumed };
  });
  expect(r.none).toBeNull();
  expect(r.assumed).toContain('age 35');
});

test('feat 551 — stored at workout end as an estimate; Strava calories replace it; a logged figure is never touched', async ({ page }) => {
  const r = await page.evaluate(() => {
    const s = _steady(130, 45); hrFinalize(s);
    const stored = { ...s.hr };
    state.stravaActivities = [{ id: 'st1', avgHr: 128, maxHr: 160, calories: 410, elapsedSec: 2700 }];
    state.sessions = [s]; linkStrava(s.date, 'st1');
    const afterStrava = { ...s.hr };
    const m = _steady(130, 45); m.hr = { calories: 300 }; hrFinalize(m);
    return { stored, afterStrava, manual: m.hr.calories, manualEst: !!m.hr.caloriesEst };
  });
  expect(r.stored.caloriesEst).toBe('hr-samples');
  expect(r.stored.calories).toBeGreaterThan(300);
  expect(r.afterStrava.calories).toBe(410);
  expect(r.afterStrava.caloriesEst).toBeUndefined();
  expect(r.manual).toBe(300);
  expect(r.manualEst).toBe(false);
});

test('feat 551 — the calibration scale applies, including to estimates already shown', async ({ page }) => {
  const r = await page.evaluate(() => {
    const s = _steady(130, 45); hrFinalize(s); state.sessions = [s];
    const before = estimateSessionCalories(s).kcal;
    state.workoutControls.kcalScale = 0.8;
    const after = estimateSessionCalories(s).kcal;
    const html = renderWorkoutStats(s);
    return { before, after, shows: html.includes('≈' + after + ' cal') && html.includes('est.') };
  });
  expect(r.after).toBe(Math.round(r.before * 0.8));
  expect(r.shows).toBe(true);
});
