// feat 339 — capture a standalone daily Sleep & Recovery log from Garmin (every day, not just workout days),
// show it on the Body page + a snapshot on the Recovery card, and have the cowork Garmin channel fetch it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof importBiometrics === 'function' && typeof recoveryLogSorted === 'function'
    && typeof renderRecoveryLog === 'function' && typeof renderBody === 'function' && typeof buildChannelContext === 'function'
    && typeof buildInstructionsMd === 'function' && typeof coworkImportGarmin === 'function' && typeof recoveryDayKey === 'function', null, { timeout: 15000 });
});

test('importBiometrics keeps a daily recovery log for ALL days, including rest days', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.recoveryLog = []; state.bodyComp = [];
    const res = importBiometrics(JSON.stringify({
      sleep: [{ date: '2026-06-01', score: 80, note: '7h30m' }],
      recovery: [
        { date: '2026-06-01', bodyBattery: 75, hrv: 62, restingHr: 50 },
        { date: '2026-06-02', sleepScore: 72, sleepNote: '6h50m', bodyBattery: 60, restingHr: 53 }, // a rest day
      ],
    }), { silent: true });
    const byDay = {}; state.recoveryLog.forEach(x => byDay[recoveryDayKey(x.date)] = x);
    return { recoveryN: res.recoveryN, count: state.recoveryLog.length, d1: byDay[recoveryDayKey('2026-06-01')], d2: byDay[recoveryDayKey('2026-06-02')] };
  });
  expect(r.count).toBe(2);
  expect(r.recoveryN).toBe(2);
  expect(r.d1.sleepScore).toBe(80);    // sleep folded into the day…
  expect(r.d1.bodyBattery).toBe(75);   // …alongside the recovery metrics
  expect(r.d1.hrv).toBe(62);
  expect(r.d2.sleepScore).toBe(72);    // rest-day sleep retained — the whole point
  expect(r.d2.bodyBattery).toBe(60);
});

test('sleep still attaches to a workout that day (back-compat) while also logging recovery', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.recoveryLog = [];
    state.sessions = [{ id: 'w', date: '2026-06-01T10:00:00.000Z', exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }] }];
    importBiometrics(JSON.stringify({ sleep: [{ date: '2026-06-01', score: 88, note: '8h' }] }), { silent: true });
    return { sessSleep: state.sessions[0].sleep || '', logLen: state.recoveryLog.length };
  });
  expect(r.sessSleep).toContain('88');
  expect(r.logLen).toBe(1);
});

test('re-importing the same day merges fields without duplicating the row', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.recoveryLog = [];
    importBiometrics(JSON.stringify({ recovery: [{ date: '2026-06-01', bodyBattery: 70 }] }), { silent: true });
    importBiometrics(JSON.stringify({ recovery: [{ date: '2026-06-01', restingHr: 49 }] }), { silent: true });
    return { len: state.recoveryLog.length, bb: state.recoveryLog[0].bodyBattery, rhr: state.recoveryLog[0].restingHr };
  });
  expect(r.len).toBe(1);
  expect(r.bb).toBe(70);   // first field preserved
  expect(r.rhr).toBe(49);  // second field merged in
});

test('recoveryLog merges across devices (union by day, newer updatedAt wins)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    state.recoveryLog = [{ date: '2026-06-01T12:00:00.000Z', bodyBattery: 50, updatedAt: '2026-06-01T20:00:00.000Z' }];
    applyImport({ sessions: [], recoveryLog: [
      { date: '2026-06-01T12:00:00.000Z', bodyBattery: 80, updatedAt: '2026-06-02T20:00:00.000Z' }, // newer same day
      { date: '2026-06-03T12:00:00.000Z', restingHr: 48, updatedAt: '2026-06-03T20:00:00.000Z' },   // new day
    ] }, 'merge');
    const byDay = {}; state.recoveryLog.forEach(x => byDay[recoveryDayKey(x.date)] = x);
    return { count: state.recoveryLog.length, d1bb: byDay[recoveryDayKey('2026-06-01')].bodyBattery, hasD3: !!byDay[recoveryDayKey('2026-06-03')] };
  });
  expect(r.count).toBe(2);
  expect(r.d1bb).toBe(80);
  expect(r.hasD3).toBe(true);
});

test('the Body page renders the Sleep & Recovery section when there is a log', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.bodyComp = [];
    state.recoveryLog = [{ date: '2026-06-01T12:00:00.000Z', sleepScore: 80, sleepNote: '7h30m', bodyBattery: 72, hrv: 60, restingHr: 50 }];
    const html = renderRecoveryLog();
    const el = document.createElement('div'); renderBody(el);
    return { has: /rcv-card/.test(html), onBody: /rcv-card/.test(el.innerHTML), bits: /🔋/.test(html) && /HRV/.test(html) && /😴/.test(html) };
  });
  expect(r.has).toBe(true);
  expect(r.onBody).toBe(true);
  expect(r.bits).toBe(true);
});

test('the cowork Garmin channel asks for + reports daily recovery', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    state.recoveryLog = [{ date: '2026-06-05T12:00:00.000Z', bodyBattery: 70 }];
    const ctx = buildChannelContext('garmin');
    const ins = buildInstructionsMd('garmin');
    const n = coworkImportGarmin({ recovery: [{ date: '2026-06-06', restingHr: 50 }, { date: '2026-06-07', bodyBattery: 65 }] }).recovery;
    return { lastRec: ctx.lastRecoveryDate, recentLen: (ctx.recentRecovery || []).length, insRecovery: /recovery/i.test(ins) && /bodyBattery/.test(ins), importedN: n };
  });
  expect(r.lastRec).toBe('2026-06-05');
  expect(r.recentLen).toBe(1);
  expect(r.insRecovery).toBe(true);
  expect(r.importedN).toBe(2);
});
