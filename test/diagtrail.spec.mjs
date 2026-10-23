// feat 514 — diagnostics through the Analysis channel. Ask "why did my timers stop?" like any other analysis
// question; the agent now has evidence: diagnosticsTrail() derives heartbeat GAPS (quiet mid-workout, then back)
// and SILENT ENDS (quiet and never back — the "timers stopped 2.5 h in" shape) from feat 506's heartbeats.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const MIN = 60000;

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof diagnosticsTrail === 'function' && typeof buildChannelContext === 'function'
    && typeof clearLog === 'function', null, { timeout: 15000 });
});

// a 3-hour workout that started 4 h ago: heartbeats every 10 min for the first 150 min, then nothing
const seed = (page, { gap, silent, oldEntry } = {}) => page.evaluate(({ gap, silent, oldEntry, MIN }) => {
  clearLog();
  const start = Date.now() - 240 * MIN;
  const beat = (m) => _eventLog.push({ ts: new Date(start + m * MIN).toISOString(), level: 'info', msg: 'Workout heartbeat',
    detail: 'elapsed ' + m + 'm · idle 2m · sets 9 · page ' + (m > 60 && gap && m <= 90 ? 'hidden' : 'visible') });
  const marks = [];
  for (let m = 0; m <= 150; m += 10) { if (gap && m > 40 && m < 90) continue; marks.push(m); beat(m); }
  if (oldEntry) _eventLog.unshift({ ts: new Date(Date.now() - 30 * 864e5).toISOString(), level: 'warn', msg: 'ancient', detail: '' });
  state.sessions = [{ id: 'w', date: new Date(start).toISOString(),
    endedAt: new Date(start + (silent ? 210 : 155) * MIN).toISOString(), endReason: silent ? null : 'auto-inactivity',
    exercises: [{ varUuid: 'x', subUuid: null, sets: [{ w: 100, r: 5 }] }] }];
  state.workoutControls = { ...(state.workoutControls || {}), autoEndMinutes: 40 };
  return diagnosticsTrail();
}, { gap, silent, oldEntry, MIN });

test('feat 514 — a quiet stretch mid-workout that came back is a heartbeat gap', async ({ page }) => {
  const d = await seed(page, { gap: true });
  expect(d.heartbeatGaps).toHaveLength(1);
  const g = d.heartbeatGaps[0];
  expect(g.gapMin).toBe(50);                 // 40 → 90
  expect(g.elapsedAtResume).toBe(90);
  expect(g.pageBefore).toBe('visible');
});

test('feat 514 — a workout that went quiet and never came back is a silent end', async ({ page }) => {
  const d = await seed(page, { silent: true });
  const s = d.sessions[0];
  expect(s.lastHeartbeat).not.toBeNull();
  expect(s.silentBeforeEndMin, 'last beat at 150 min, ended at 210').toBe(60);
  expect(s.heartbeats).toBe(16);
  expect(s.endReason).toBeNull();
});

test('feat 514 — an inactivity auto-end is reported as such, not as a silent end', async ({ page }) => {
  const d = await seed(page, {});
  const s = d.sessions[0];
  expect(s.endReason).toBe('auto-inactivity');
  expect(s.silentBeforeEndMin, 'ended 5 min after the last beat — nothing went quiet').toBeNull();
  expect(d.autoEndLimitMin).toBe(40);
  expect(d.heartbeatGaps).toEqual([]);
});

test('feat 514 — the trail covers 14 days and no further', async ({ page }) => {
  const d = await seed(page, { oldEntry: true });
  expect(d.log.some(e => e.msg === 'ancient')).toBe(false);
  expect(d.windowDays).toBe(14);
});

test('feat 514 — the Analysis channel carries the trail and tells the agent how to read it', async ({ page }) => {
  await seed(page, { silent: true });
  const r = await page.evaluate(() => ({ ctx: buildChannelContext('analysis'), md: buildInstructionsMd('analysis') }));
  expect(r.ctx.diagnostics.sessions[0].silentBeforeEndMin).toBe(60);
  expect(r.ctx).toHaveProperty('requests');           // the questions are still there alongside it
  expect(r.md).toMatch(/Questions about the app itself/);
  expect(r.md).toMatch(/silentBeforeEndMin/);
  expect(r.md).toMatch(/auto-inactivity/);
});
