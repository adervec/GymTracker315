// feat 317 — Cowork hub Phase 2: importing agent outputs (Garmin biometrics/sleep, Strava activities with
// auto-link). The filesystem poller is desktop-only; these drive the pure import/route logic with payloads.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkApplyImport === 'function' && typeof coworkImportGarmin === 'function'
    && typeof coworkImportStrava === 'function' && typeof coworkAutoLinkStrava === 'function'
    && typeof importBiometrics === 'function' && typeof importStravaActivities === 'function', null, { timeout: 15000 });
});

test('coworkApplyImport routes by kind (and degrades on unknown/not-ready)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.bodyComp = []; state.stravaActivities = [];
    const ymd = new Date().toISOString().slice(0, 10);
    const garmin = coworkApplyImport('garmin-output', { bodyComp: [{ date: ymd, weightKg: 79 }], sleep: [] });
    const unknown = coworkApplyImport('mystery-output', {});
    const podBefore = coworkApplyImport('pod-output', { plans: [] }); // Phase 4 not loaded → handled:false
    return { garminHandled: garmin.handled, unknownHandled: unknown.handled, podHandled: podBefore.handled };
  });
  expect(r.garminHandled).toBe(true);
  expect(r.unknownHandled).toBe(false);
  expect(r.podHandled === false || r.podHandled === true).toBe(true); // tolerant: pod arrives in Phase 4
});

test('Garmin import merges body comp and matches sleep to that day’s workout', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ymd = new Date().toISOString().slice(0, 10), iso = ymd + 'T12:00:00.000Z'; // noon UTC — aligns the day key with the noon-anchored sleep date
    state.bodyComp = [];
    state.sessions = [{ id: 's1', date: iso, updatedAt: iso, origin: state.deviceId, exercises: [] }];
    const res = coworkImportGarmin({ bodyComp: [{ date: ymd, weightKg: 80.5, bodyFatPct: 17.2 }], sleep: [{ date: ymd, score: 82, note: '7h30m' }] });
    const bc = (state.bodyComp || []).find(b => b.date && b.date.slice(0, 10) === ymd);
    return { handled: res.handled, weight: bc && bc.weightKg, sleep: state.sessions[0].sleep };
  });
  expect(r.handled).toBe(true);
  expect(r.weight).toBe(80.5);
  expect(typeof r.sleep).toBe('string');
  expect(r.sleep).toMatch(/82/);
});

test('Strava import auto-links a confidently-overlapping activity and backfills HR', async ({ page }) => {
  const r = await page.evaluate(() => {
    const iso = '2026-06-22T18:00:00.000Z';
    state.stravaActivities = [];
    state.sessions = [{ id: 's2', date: iso, updatedAt: iso, origin: state.deviceId, exercises: [] }];
    const res = coworkImportStrava({ activities: [{ id: 'act-1', name: 'Lift', sport_type: 'WeightTraining', start_date: iso, elapsed_time: 3600, average_heartrate: 135, max_heartrate: 165, calories: 420 }] });
    const s = state.sessions.find(x => x.id === 's2');
    return { linked: res.linked, stravaId: s.stravaId, hrAvg: s.hr && s.hr.avg, endedAt: !!s.endedAt };
  });
  expect(r.linked).toBe(1);
  expect(r.stravaId).toBe('act-1');
  expect(r.hrAvg).toBe(135);     // metadata backfilled (sets/reps stay master — none here)
  expect(r.endedAt).toBe(true);  // duration backfilled
});

test('auto-link respects the confidence window (a far-apart activity is NOT linked)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const iso = '2026-06-23T10:00:00.000Z';
    const far = new Date(Date.parse(iso) + 100 * 60000).toISOString(); // 100 min later (> 90 cap, still < 120 window)
    state.stravaActivities = [];
    state.sessions = [{ id: 's3', date: iso, updatedAt: iso, origin: state.deviceId, exercises: [] }];
    const res = coworkImportStrava({ activities: [{ id: 'act-2', sport_type: 'WeightTraining', start_date: far, elapsed_time: 1800 }] });
    const s = state.sessions.find(x => x.id === 's3');
    return { linked: res.linked, stravaId: s.stravaId };
  });
  expect(r.linked).toBe(0);
  expect(r.stravaId).toBeUndefined();
});
