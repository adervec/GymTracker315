// feat 315 — Claude Cowork hub, Phase 0 foundations: the versioned exchange envelope, the content hash,
// the idempotency ledger, the loop-guard "new foreign workout" detector, per-device origin stamping, and
// field-preservation across import/normalize (origin / stravaId / source:'daily' must never be stripped).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildCoworkEnvelope === 'function' && typeof parseCoworkEnvelope === 'function'
    && typeof coworkHashText === 'function' && typeof coworkLedgerHas === 'function' && typeof coworkNewWorkoutSince === 'function'
    && typeof newSession === 'function' && typeof normalizeState === 'function' && typeof applyImport === 'function', null, { timeout: 15000 });
});

test('envelope round-trips and rejects bad / newer-than-known files', async ({ page }) => {
  const r = await page.evaluate(() => {
    const env = buildCoworkEnvelope('pod-output', { plans: [] });
    const good = parseCoworkEnvelope(JSON.stringify(env));
    const notJson = parseCoworkEnvelope('{nope');
    const wrong = parseCoworkEnvelope(JSON.stringify({ protocol: 'something-else', kind: 'x' }));
    const newer = parseCoworkEnvelope(JSON.stringify({ protocol: 'gymtracker-cowork', protocolVersion: 99, kind: 'x', payload: {} }));
    return { proto: env.protocol, ver: env.protocolVersion, good, notJsonOk: notJson.ok, wrongOk: wrong.ok, newerOk: newer.ok };
  });
  expect(r.proto).toBe('gymtracker-cowork');
  expect(r.ver).toBe(1);
  expect(r.good.ok).toBe(true);
  expect(r.good.kind).toBe('pod-output');
  expect(r.notJsonOk).toBe(false);
  expect(r.wrongOk).toBe(false);
  expect(r.newerOk).toBe(false); // forward-incompatible files are rejected, not crashed on
});

test('coworkHashText is stable and distinguishes content', async ({ page }) => {
  const r = await page.evaluate(() => ({
    a: coworkHashText('hello world'), a2: coworkHashText('hello world'), b: coworkHashText('hello worle'),
  }));
  expect(r.a).toBe(r.a2);
  expect(r.a).not.toBe(r.b);
});

test('the idempotency ledger records + reports consumed content and prunes', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.coworkLocal = { processed: {} };
    const before = coworkLedgerHas('garmin', 'h1');
    coworkLedgerAdd('garmin', 'h1', { fileName: 'a.json' });
    const after = coworkLedgerHas('garmin', 'h1');
    const otherChannel = coworkLedgerHas('strava', 'h1');
    for (let i = 0; i < 250; i++) coworkLedgerAdd('strava', 'k' + i);
    return { before, after, otherChannel, stravaCount: Object.keys(state.coworkLocal.processed.strava).length };
  });
  expect(r.before).toBe(false);
  expect(r.after).toBe(true);
  expect(r.otherChannel).toBe(false);          // per-channel
  expect(r.stravaCount).toBeLessThanOrEqual(200); // pruned
});

test('newSession stamps this device as origin', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    return { deviceId: state.deviceId, origin: newSession().origin };
  });
  expect(typeof r.deviceId).toBe('string');
  expect(r.deviceId.length).toBeGreaterThan(0);
  expect(r.origin).toBe(r.deviceId);
});

test('coworkNewWorkoutSince fires ONLY for a new, ended, foreign-origin workout', async ({ page }) => {
  const r = await page.evaluate(() => {
    const me = 'device-A', phone = 'device-B';
    const prev = new Set(['s-old']);
    const ended = (id, origin) => ({ id, date: '2026-06-01T10:00:00Z', endedAt: '2026-06-01T11:00:00Z', origin, exercises: [] });
    const open = (id, origin) => ({ id, date: '2026-06-01T10:00:00Z', origin, exercises: [] }); // no endedAt
    return {
      foreignNewEnded: coworkNewWorkoutSince(prev, [ended('s-new', phone)], me),   // YES
      ownNewEnded:     coworkNewWorkoutSince(prev, [ended('s-new', me)], me),       // no — own device
      foreignNewOpen:  coworkNewWorkoutSince(prev, [open('s-new', phone)], me),     // no — not finished
      foreignButOld:   coworkNewWorkoutSince(new Set(['s-new']), [ended('s-new', phone)], me), // no — already present
    };
  });
  expect(r.foreignNewEnded).toBe(true);
  expect(r.ownNewEnded).toBe(false);
  expect(r.foreignNewOpen).toBe(false);
  expect(r.foreignButOld).toBe(false);
});

test('merge + normalize preserve origin / stravaId / source:daily (no field stripping)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    state.plans = [{ id: 'pd-1', name: 'Daily', intensity: 3, source: 'daily', dailyDate: '2026-06-22',
      steps: [{ id: 'st1', sets: 3, options: [{ type: 'movement', familyId: 'squat' }], load: 'heavy' }] }];
    applyImport({ savedAt: new Date().toISOString(), sessions: [
      { id: 's-ext', date: '2026-06-20T10:00:00Z', endedAt: '2026-06-20T11:00:00Z', origin: 'phone', stravaId: '999', exercises: [] },
    ] }, 'merge');
    normalizeState();
    const s = state.sessions.find(x => x.id === 's-ext');
    const p = state.plans.find(x => x.id === 'pd-1');
    return { origin: s && s.origin, strava: s && s.stravaId, planSource: p && p.source, planDate: p && p.dailyDate };
  });
  expect(r.origin).toBe('phone');
  expect(r.strava).toBe('999');
  expect(r.planSource).toBe('daily');
  expect(r.planDate).toBe('2026-06-22');
});
