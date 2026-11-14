// feat 566 — the sleep-tracking hole: the wearable log the Garmin cowork channel imports becomes a sleep analysis
// (average against need, sleep debt, bed/wake spread across midnight, weekend shift, stage mix, training ⇄ sleep),
// a 30-night stage chart, and the agent's own weekly sleep review, validated and reviewable like any cowork reply.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
test.use({ timezoneId: 'America/Toronto' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00-04:00'));
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof sleepAnalysis === 'function' && typeof coworkImportGarmin === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// 14 nights (dated by the wake-up morning, Jun 2 – Jun 15): weekdays 23:30 → 06:30, 6h30 asleep; weekends
// 01:30 → 09:30, 7h30. Workouts on Jun 1, 3, 5, 8, 10, 12, 14 — the nights after them score 70, the rest 80.
const seed = (page) => page.evaluate(() => {
  let v; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { v = u; break; } }
  const train = new Set(['01', '03', '05', '08', '10', '12', '14']);
  state.sessions = [...train].map(d => ({ id: 'w' + d, date: `2026-06-${d}T18:00:00-04:00`, endedAt: `2026-06-${d}T19:00:00-04:00`,
    exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 100, r: 5 }] }] }));
  state.recoveryLog = []; state.sleepReviews = {};
  const recovery = [];
  for (let d = 2; d <= 15; d++) {
    const day = String(d).padStart(2, '0'), wd = new Date(2026, 5, d).getDay(), wkend = wd === 0 || wd === 6;
    const prev = String(d - 1).padStart(2, '0');
    recovery.push(wkend
      ? { date: `2026-06-${day}`, sleepScore: train.has(prev) ? 70 : 80, bedtime: '01:30', wakeTime: '09:30', deepSleepMin: 60, remSleepMin: 100, lightSleepMin: 290, awakeMin: 30, hrv: 60 }
      : { date: `2026-06-${day}`, sleepScore: train.has(prev) ? 70 : 80, sleepStart: '2026-06-01T23:30:00', wakeUpTime: '6:30 AM', deepSleepSec: 3000, remMin: 80, lightMin: 260, awakeMin: 30, hrv: 60 });
  }
  importBiometrics(JSON.stringify({ recovery }), { silent: true });
});

test('feat 566 — the importer keeps stages, naps, need and the wall-clock bed and wake times', async ({ page }) => {
  const r = await page.evaluate(() => [
    normRecoveryFields({ deepSleepSec: 3600, remSleepMin: 90, lightSleepMin: 240, sleepStart: '2026-06-01T23:40:00.000', sleepEnd: '7:05 am', napMin: 20, sleepNeed: 470 }),
    normRecoveryFields({ bedtime: '25:10', wakeTime: 'soon' }),
  ]);
  expect(r[0]).toMatchObject({ deepMin: 60, remMin: 90, lightMin: 240, sleepMin: 390, bedtime: '23:40', wakeTime: '07:05', napMin: 20, sleepNeedMin: 470 });
  expect(r[1].bedtime).toBeUndefined();   // nonsense clock times are dropped, not stored
  expect(r[1].wakeTime).toBeUndefined();
});

test('feat 566 — the analysis: debt against need, a bedtime averaged across midnight, the weekend shift, training effect', async ({ page }) => {
  await seed(page);
  const A = await page.evaluate(() => { const a = sleepAnalysis(); return { ...a, bedClock: _fmtClock(a.bed), wakeClock: _fmtClock(a.wake), texts: a.findings.map(f => f.text).join(' | ') }; });
  expect(A.nights).toBe(14);
  expect(A.need).toBe(480);                    // no sleep need sent → the 8 h default
  expect(A.debt).toBeGreaterThanOrEqual(120);
  expect(A.bedClock).toMatch(/^00:0\d$/);      // 23:30 ×10 and 01:30 ×4 average just after midnight, not at noon
  expect(A.jetlag).toBeGreaterThanOrEqual(120); // weekend midpoint 05:30 against weekday 03:00
  expect(A.deep).toBeGreaterThan(10);
  expect(A.train.score).toEqual([70, 80]);
  expect(A.texts).toMatch(/sleep debt/);
  expect(A.texts).toMatch(/Weekends shift your sleep/);
  expect(A.texts).toMatch(/After a training day your sleep score averages 70, against 80/);
  expect(A.findings[0].tone).toBe('bad');      // worst first
});

test('feat 566 — the Body page card shows the tiles, a stacked 30-night chart with readouts, and the findings', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const el = document.createElement('div'); el.innerHTML = renderRecoveryLog(); document.body.appendChild(el);
    return { tiles: el.querySelectorAll('.slp-tile').length, bars: el.querySelectorAll('.slp-chart .slp-bar').length,
      stacked: el.querySelector('.slp-chart .slp-bar').querySelectorAll('rect').length, tip: el.querySelector('.slp-chart .slp-bar title').textContent,
      legend: el.querySelector('.slp-legend').textContent, finds: el.querySelectorAll('.slp-finds li').length };
  });
  expect(r.tiles).toBeGreaterThanOrEqual(5);
  expect(r.bars).toBe(14);
  expect(r.stacked).toBe(5);                    // hit area + deep, REM, light, awake
  expect(r.tip).toMatch(/asleep · score \d+ · \d\d:\d\d–\d\d:\d\d · Deep/);
  expect(r.legend).toContain('REM');
  expect(r.finds).toBeGreaterThanOrEqual(3);
});

test('feat 566 — the Garmin channel sends the analysis, asks for the detail and a weekly review, and stores a valid one', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const ctx = buildChannelContext('garmin'), md = buildInstructionsMd('garmin');
    coworkImportGarmin({ sleepReview: { date: 'not-a-date', summary: 'x y' } });            // rejected
    const afterBad = Object.keys(state.sleepReviews).length;
    coworkImportGarmin({ recovery: [], sleepReview: { date: '2026-06-15', title: 'Weekends are costing you', summary: 'You sleep <b>late</b> at weekends.', patterns: ['a', 'b'], suggestions: ['Bed by 23:30'], extra: 'dropped' } });
    const el = document.createElement('div'); el.innerHTML = renderRecoveryLog();
    return { hasA: !!ctx.sleepAnalysis && Array.isArray(ctx.sleepAnalysis.findings) && typeof ctx.sleepAnalysis.findings[0] === 'string',
      wants: ctx.sleepDetailWanted, md: /sleepReview/.test(md) && /deepMin/.test(md) && /never instructions/.test(md), afterBad,
      stored: state.sleepReviews['2026-06-15'], shown: el.querySelector('.slp-review') && el.querySelector('.slp-review').textContent,
      injected: !!el.querySelector('.slp-review b'), label: COWORK_ROW_LABEL.sleepReviews, synced: SYNC_COLLECTION_KEYS.has('sleepReviews') };
  });
  expect(r.hasA).toBe(true);
  expect(r.wants).toEqual(expect.arrayContaining(['deepMin', 'remMin', 'bedtime', 'wakeTime', 'sleepNeedMin']));
  expect(r.md).toBe(true);
  expect(r.afterBad).toBe(0);
  expect(r.stored.extra).toBeUndefined();
  expect(r.stored.suggestions).toEqual(['Bed by 23:30']);
  expect(r.shown).toContain('Weekends are costing you');
  expect(r.shown).toContain('Bed by 23:30');
  expect(r.injected).toBe(false);                // the agent's text is escaped, never markup
  expect(r.label).toBe('Sleep review');
  expect(r.synced).toBe(true);
});
