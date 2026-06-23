// feat 328 — cross-device sync SCOPE: all user data + plans/progress sync reliably, but device-specific
// settings (theming, audio, folder locations, per-screen UI) never cross devices. The old coarse merge gated
// ALL settings behind a single `savedAt`, so the gym phone (which bumps savedAt on every set) blocked the
// desktop's plans/body from ever propagating — and device settings rode along and DID sync. This verifies the
// fix: collections merge per-record independent of savedAt; device-local keys are not adopted on merge and are
// stripped from the pushed payload; user-data scalars still use coarse last-write-wins.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof applyImport === 'function' && typeof syncPayload === 'function'
    && typeof bodyDayKey === 'function' && typeof tombstonePlan === 'function', null, { timeout: 15000 });
});

test('plans / bodyComp / strava sync even when THIS device has the newer overall savedAt', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.deletedSessions = []; state.deletedPlans = []; state.deletedBody = [];
    state.savedAt = '2026-06-22T20:00:00.000Z';                 // this device saved later (the gym phone logging sets)
    state.plans = [{ id: 'P_LOCAL', rev: 1, name: 'Phone plan', revisions: [{ rev: 1, at: '2026-06-22T00:00:00.000Z' }] }];
    state.bodyComp = []; state.stravaActivities = [];
    // The incoming file is OLDER overall, yet its plans/body/strava must still merge in.
    applyImport({
      savedAt: '2026-06-20T00:00:00.000Z',
      plans: [{ id: 'P_DESK', rev: 1, name: 'Desktop plan', revisions: [{ rev: 1, at: '2026-06-19T00:00:00.000Z' }] }],
      bodyComp: [{ date: '2026-06-19T12:00:00.000Z', weightKg: 80, updatedAt: '2026-06-19T00:00:00.000Z' }],
      stravaActivities: [{ id: 'S1', name: 'Ride' }],
      sessions: [],
    }, 'merge');
    return {
      planIds: state.plans.map(p => p.id).sort(),
      bodyDays: state.bodyComp.length,
      strava: state.stravaActivities.map(a => String(a.id)),
    };
  });
  expect(r.planIds).toEqual(['P_DESK', 'P_LOCAL']); // union — the desktop's plan reached this device despite an older file
  expect(r.bodyDays).toBe(1);                       // body measurement adopted independent of the savedAt race
  expect(r.strava).toContain('S1');
});

test('device-local settings are NOT adopted on merge, even from a newer file; user-data scalars still adopt', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    state.savedAt = '2026-06-01T00:00:00.000Z';                 // this device is OLDER overall
    state.theme = 'dark'; state.sound = { audio: true, haptics: true, volume: 0.5 };
    state.aiExport = { enabled: true, filename: 'mine.md' }; state.autoSave = { enabled: true };
    state.unit = 'kg'; state.bodyCompUnit = 'kg';
    applyImport({
      savedAt: '2026-06-25T00:00:00.000Z',                      // file is NEWER overall...
      theme: 'light', sound: { audio: false, haptics: false, volume: 1 },
      aiExport: { enabled: false, filename: 'theirs.md' }, autoSave: { enabled: false },
      unit: 'lb', bodyCompUnit: 'lb', sessions: [],
    }, 'merge');
    return {
      theme: state.theme, soundAudio: state.sound.audio, aiExportFile: state.aiExport.filename, autoSave: state.autoSave.enabled,
      unit: state.unit, bodyCompUnit: state.bodyCompUnit,
    };
  });
  expect(r.theme).toBe('dark');          // theming stays device-local
  expect(r.soundAudio).toBe(true);       // audio stays device-local
  expect(r.aiExportFile).toBe('mine.md');// folder/export config stays device-local
  expect(r.autoSave).toBe(true);         // folder auto-save config stays device-local
  expect(r.unit).toBe('lb');             // ...but user-data scalars DO adopt from the newer file
  expect(r.bodyCompUnit).toBe('lb');
});

test('syncPayload carries user data but strips device-local + connection/identity state', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.theme = 'dark'; state.aiExport = { enabled: true }; state.cowork = { enabled: true };
    state.cloudSync = { provider: 'google', perProvider: { google: { token: 'SECRET' } } };
    state.deviceId = 'dev-1'; state.coworkLocal = { processed: {} };
    state.plans = [{ id: 'P1' }]; state.bodyComp = [{ date: 'd' }]; state.sessions = []; state.unit = 'kg';
    state.savedAt = '2026-06-20T00:00:00.000Z';
    const p = syncPayload(state);
    return { keys: Object.keys(p) };
  });
  // device-local + connection/identity must NOT be in the pushed file
  ['theme', 'aiExport', 'cowork', 'cloudSync', 'deviceId', 'coworkLocal'].forEach(k => expect(r.keys).not.toContain(k));
  // user data + sync markers MUST be present
  ['plans', 'bodyComp', 'sessions', 'unit', 'savedAt'].forEach(k => expect(r.keys).toContain(k));
});

test('a deleted plan propagates across devices (tombstone), but an edit newer than the delete survives', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.deletedPlans = [];
    state.plans = [{ id: 'P1', rev: 1, revisions: [{ rev: 1, at: '2026-06-01T00:00:00.000Z' }] }];
    applyImport({ sessions: [], deletedPlans: [{ id: 'P1', deletedAt: '2026-06-05T00:00:00.000Z' }] }, 'merge');
    const afterDelete = state.plans.length;

    state.deletedPlans = [];
    state.plans = [{ id: 'P2', rev: 3, revisions: [{ rev: 3, at: '2026-06-10T00:00:00.000Z' }] }]; // edited AFTER the delete
    applyImport({ sessions: [], deletedPlans: [{ id: 'P2', deletedAt: '2026-06-05T00:00:00.000Z' }] }, 'merge');
    const afterStaleDelete = state.plans.length;
    return { afterDelete, afterStaleDelete };
  });
  expect(r.afterDelete).toBe(0);      // delete newer than the plan's last revision -> removed everywhere
  expect(r.afterStaleDelete).toBe(1); // a revision newer than the delete -> the plan survives
});

test('same-day bodyComp merges by recency (no duplicate) and a deleted measurement propagates', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.deletedBody = [];
    state.bodyComp = [{ date: '2026-06-19T08:00:00.000Z', weightKg: 80, updatedAt: '2026-06-19T08:00:00.000Z' }];
    applyImport({ sessions: [], bodyComp: [{ date: '2026-06-19T20:00:00.000Z', weightKg: 82, updatedAt: '2026-06-19T20:00:00.000Z' }] }, 'merge');
    const merged = { count: state.bodyComp.length, weight: state.bodyComp[0] && state.bodyComp[0].weightKg };

    state.deletedBody = [];
    state.bodyComp = [{ date: '2026-06-19T08:00:00.000Z', weightKg: 80, updatedAt: '2026-06-19T08:00:00.000Z' }];
    const k = bodyDayKey({ date: '2026-06-19T12:00:00.000Z' });
    applyImport({ sessions: [], deletedBody: [{ id: k, deletedAt: '2026-06-20T00:00:00.000Z' }] }, 'merge');
    return { ...merged, afterDelete: state.bodyComp.length };
  });
  expect(r.count).toBe(1);        // same calendar day collapses to one entry
  expect(r.weight).toBe(82);      // the more recently edited entry wins
  expect(r.afterDelete).toBe(0);  // a delete (newer than the entry) removes it on the other device
});

test('classification sanity: device keys are device-local; user-data keys are not', async ({ page }) => {
  const r = await page.evaluate(() => ({
    deviceLocal: ['theme', 'sound', 'aiExport', 'autoSave', 'cowork', 'hrDevice'].map(k => DEVICE_LOCAL_KEYS.has(k)),
    userData: ['plans', 'bodyComp', 'profile', 'unit', 'stravaActivities', 'customVariations'].map(k => DEVICE_LOCAL_KEYS.has(k)),
  }));
  expect(r.deviceLocal.every(Boolean)).toBe(true);   // all genuinely device-specific
  expect(r.userData.some(Boolean)).toBe(false);      // none of the user data is treated as device-local
});
