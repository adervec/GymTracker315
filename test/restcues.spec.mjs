// feat 104 — (a) the metronome only sounds while a set is in progress (setActiveOnly, default on),
// and (b) a separate, configurable audible rest timer (count up / countdown + interval + end cues).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.restCueTick === 'function'
    && typeof window.metroSetActive === 'function'
    && typeof window.restCueCfg === 'function', null, { timeout: 15000 });
});

test('setActiveOnly defaults on and restCues is a persisted setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    return {
      setActiveOnly: metroCfg().setActiveOnly,
      rcDefaults: restCueCfg(),
      rcInKeys: SETTINGS_KEYS.includes('restCues'),
    };
  });
  expect(r.setActiveOnly).toBe(true);
  expect(r.rcDefaults.enabled).toBe(false);
  expect(r.rcDefaults.mode).toBe('down');
  expect(r.rcInKeys).toBe(true);
});

test('metronome is silent unless a set is active (setActiveOnly on)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.metronome = { ...metroCfg(), setActiveOnly: true, mantra: false, audio: true };
    state.sound = { audio: true, haptics: true, volume: 1 };
    let beeps = 0; window.metroBeep = () => { beeps++; };
    window.computeRestState = () => ({ mode: 'resting', restMs: 5000 }); // resting, not an open set
    metroTick();
    const whileResting = beeps;
    window.computeRestState = () => ({ mode: 'open', sinceMs: 1000 });    // a set is in progress
    metroTick();
    return { whileResting, whileOpen: beeps };
  });
  expect(r.whileResting).toBe(0); // gated off — no set active
  expect(r.whileOpen).toBe(1);    // a set is active -> it beeps
});

test('rest cues: countdown fires an interval beep, a final-second tick, and an end cue', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.restCues = { enabled: true, mode: 'down', target: 90, interval: 30, countdown: 3, endCue: true, audio: true, haptic: false, freq: 784 };
    state.sound = { audio: true, haptics: true, volume: 1 };
    let beeps = 0; window.restBeep = () => { beeps++; };
    const at = (sec) => { _lastRestCueSec = -1; window.computeRestState = () => ({ mode: 'resting', restMs: sec * 1000, interExercise: false }); restCueTick(); };
    at(60); const interval = beeps;            // remaining 30 -> interval cue (1)
    beeps = 0; at(88);                          // remaining 2 -> within final countdown -> tick (1)
    const tick = beeps;
    beeps = 0; at(45);                          // remaining 45 -> not a multiple of 30, not in countdown -> silent
    const quiet = beeps;
    beeps = 0; at(90);                          // remaining 0 -> end cue (>=1 synchronous beep)
    const end = beeps;
    return { interval, tick, quiet, end };
  });
  expect(r.interval).toBe(1);
  expect(r.tick).toBe(1);
  expect(r.quiet).toBe(0);
  expect(r.end).toBeGreaterThanOrEqual(1);
});

test('rest cues only fire once per integer second', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.restCues = { enabled: true, mode: 'down', target: 90, interval: 30, countdown: 0, endCue: true, audio: true, haptic: false, freq: 784 };
    let beeps = 0; window.restBeep = () => { beeps++; };
    window.computeRestState = () => ({ mode: 'resting', restMs: 60000, interExercise: false });
    _lastRestCueSec = -1;
    restCueTick(); restCueTick(); restCueTick(); // same second, 3 ticks
    return beeps;
  });
  expect(r).toBe(1); // de-duplicated within the same second
});

test('rest cues stay silent when disabled or between exercises', async ({ page }) => {
  const r = await page.evaluate(() => {
    let beeps = 0; window.restBeep = () => { beeps++; };
    // disabled
    state.restCues = { enabled: false, mode: 'down', target: 90, interval: 30, countdown: 3, endCue: true, audio: true, haptic: false, freq: 784 };
    window.computeRestState = () => ({ mode: 'resting', restMs: 30000, interExercise: false });
    _lastRestCueSec = -1; restCueTick();
    const whenDisabled = beeps;
    // enabled but inter-exercise rest (different exercise) -> no cues
    beeps = 0;
    state.restCues = { ...state.restCues, enabled: true };
    window.computeRestState = () => ({ mode: 'resting', restMs: 30000, interExercise: true });
    _lastRestCueSec = -1; restCueTick();
    const whenInterEx = beeps;
    return { whenDisabled, whenInterEx };
  });
  expect(r.whenDisabled).toBe(0);
  expect(r.whenInterEx).toBe(0);
});

test('count-up mode fires interval beeps and an end cue at the target', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.restCues = { enabled: true, mode: 'up', target: 90, interval: 30, countdown: 3, endCue: true, audio: true, haptic: false, freq: 784 };
    let beeps = 0; window.restBeep = () => { beeps++; };
    const at = (sec) => { _lastRestCueSec = -1; window.computeRestState = () => ({ mode: 'resting', restMs: sec * 1000, interExercise: false }); restCueTick(); };
    at(30); const interval = beeps;   // sec 30 -> interval cue
    beeps = 0; at(90); const end = beeps; // sec 90 == target -> end cue
    return { interval, end };
  });
  expect(r.interval).toBe(1);
  expect(r.end).toBeGreaterThanOrEqual(1);
});
