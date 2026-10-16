// feat 506 — "timer functions appeared to stop working about 2.5h into a workout", seen once with no repro.
// A render-driven heartbeat timestamps that the UI was alive, so a freeze is bounded by the last entry, and
// the inactivity auto-end (the leading suspect) now toasts and logs the idle minutes that triggered it
// instead of stopping every timer silently.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof workoutHeartbeat === 'function' && typeof maybeAutoEndActive === 'function'
    && typeof shouldAutoEnd === 'function' && typeof clearLog === 'function', null, { timeout: 15000 });
});

const live = (page, minsAgoLastSet) => page.evaluate((mins) => {
  clearLog();
  _hbAt = 0;
  const started = new Date(Date.now() - 150 * 60000).toISOString();     // 2.5 h in, as reported
  const lastSet = new Date(Date.now() - mins * 60000).toISOString();
  state.sessions = [{ id: 'cur', date: started, exercises: [
    { varUuid: 'x', subUuid: null, sets: [{ w: 100, r: 5, ts: lastSet }] } ] }];
  state.workoutControls = { ...(state.workoutControls || {}), autoEndMinutes: 40 };
}, minsAgoLastSet);

test('feat 506 — a live workout leaves a heartbeat, throttled to 10 minutes', async ({ page }) => {
  await live(page, 5);
  const r = await page.evaluate(() => {
    workoutHeartbeat();                      // first call logs
    const after1 = _eventLog.filter(e => e.msg === 'Workout heartbeat').length;
    workoutHeartbeat(); workoutHeartbeat();  // throttled — still one
    const afterMore = _eventLog.filter(e => e.msg === 'Workout heartbeat').length;
    _hbAt = Date.now() - 11 * 60000;         // 11 minutes later
    workoutHeartbeat();
    const beats = _eventLog.filter(e => e.msg === 'Workout heartbeat');
    return { after1, afterMore, n: beats.length, detail: beats[0].detail, level: beats[0].level };
  });
  expect(r.after1).toBe(1);
  expect(r.afterMore, 'throttled inside the window').toBe(1);
  expect(r.n, 'and beats again once the window passes').toBe(2);
  expect(r.level).toBe('info');
  expect(r.detail).toMatch(/elapsed 150m/);   // the session really is 2.5 h in
  expect(r.detail).toMatch(/idle 5m/);
  expect(r.detail).toMatch(/sets 1/);
  expect(r.detail).toMatch(/page /);
});

test('feat 506 — an ended workout stops beating', async ({ page }) => {
  await live(page, 5);
  const r = await page.evaluate(() => {
    // one atomic step: a render in between would beat while the session was still live
    state.sessions[0].endedAt = new Date().toISOString();
    clearLog(); _hbAt = 0;
    workoutHeartbeat();
    return _eventLog.filter(e => e.msg === 'Workout heartbeat').length;
  });
  expect(r).toBe(0);
});

test('feat 506 — the inactivity auto-end announces itself and records the idle minutes', async ({ page }) => {
  await live(page, 55);   // 55 min since the last set, limit 40 → auto-end
  const r = await page.evaluate(() => {
    const ended = maybeAutoEndActive();
    const warn = _eventLog.find(e => e.msg === 'Workout auto-ended (inactivity)');
    return { ended, reason: state.sessions[0].endReason, level: warn && warn.level,
      detail: warn ? warn.detail : null, toast: (document.querySelector('.toast') || {}).textContent || '' };
  });
  expect(r.ended).toBe(true);
  expect(r.reason).toBe('auto-inactivity');
  expect(r.level, 'a warning, not buried as info').toBe('warn');
  expect(r.detail).toMatch(/55m since the last set/);
  expect(r.detail).toMatch(/limit 40m/);
  expect(r.toast, 'and the user is told, instead of the timers just stopping').toMatch(/auto-ended/i);
});

test('feat 506 — a workout inside the limit is left alone and silent', async ({ page }) => {
  await live(page, 20);   // 20 min idle, limit 40
  const r = await page.evaluate(() => {
    const ended = maybeAutoEndActive();
    return { ended, endedAt: state.sessions[0].endedAt || null,
      warned: _eventLog.some(e => e.msg === 'Workout auto-ended (inactivity)'),
      beat: _eventLog.some(e => e.msg === 'Workout heartbeat') };
  });
  expect(r.ended).toBe(false);
  expect(r.endedAt).toBeNull();
  expect(r.warned).toBe(false);
  expect(r.beat, 'but the heartbeat still rides the render path').toBe(true);
});
