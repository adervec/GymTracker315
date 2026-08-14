// feat 481 — the rest-cue enrichment. The old timer had ONE number for every lift, which is wrong twice
// over: 90 s is a stall after a heavy squat and a nap after a curl. The target is now resolved per rest —
// per-exercise pin → auto (the recommended-rest band) → the fixed number — plus a live nudge, cues between
// exercises, an overtime nag and a skip. Everything defaults to the old behaviour.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof restCueTarget === 'function' && typeof restCueNudge === 'function'
    && typeof restCueHudHtml === 'function' && VAR_INDEX.size > 100, null, { timeout: 15000 });
  await page.evaluate(() => {
    state.readonly = false;
    state.restCuePins = {};
    state.restCues = { enabled: true, mode: 'down', target: 90, auto: false, interval: 30, countdown: 3,
      endCue: true, audio: true, haptic: false, voice: false, freq: 784, interEx: false, interTarget: 0, overtime: 0 };
    restCueResetPeriod();
    window.__beeps = 0; window.restBeep = () => { window.__beeps++; };
    window.__said = []; window.annunce = (t) => { window.__said.push(String(t)); };
    // a stubbed rest state, so the tests drive the clock instead of waiting on it
    window.__st = { mode: 'resting', restMs: 0, interExercise: false, varUuid: null, subUuid: null, rec: null };
    window.computeRestState = () => ({ ...window.__st });
    window.at = (sec) => { _lastRestCueSec = -1; window.__st.restMs = sec * 1000; restCueTick(); };
  });
});

test('feat 481 — the target resolves pin → auto → fixed, and a pin beats auto', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = [...VAR_INDEX.keys()][0];
    const out = {};
    // 1) nothing configured -> the fixed global number, exactly as before
    out.fixed = restCueTarget({ ...window.__st });
    // 2) auto on, with a recommendation attached -> the band's own target
    state.restCues = { ...restCueCfg(), auto: true };
    out.auto = restCueTarget({ ...window.__st, varUuid: u, rec: { minSec: 150, targetSec: 240, maxSec: 300 } });
    // 3) a pin wins over auto
    setRestCuePin(u, null, 75);
    out.pin = restCueTarget({ ...window.__st, varUuid: u, rec: { minSec: 150, targetSec: 240, maxSec: 300 } });
    out.pinStored = restCuePin(u, null);
    out.inList = restCuePinList().some(e => e.key === u && e.sec === 75);
    // 4) clearing it falls back to auto again
    setRestCuePin(u, null, 0);
    out.cleared = restCueTarget({ ...window.__st, varUuid: u, rec: { minSec: 150, targetSec: 240, maxSec: 300 } }).src;
    // 5) auto off -> back to the fixed number even with a recommendation present
    state.restCues = { ...restCueCfg(), auto: false };
    out.autoOff = restCueTarget({ ...window.__st, varUuid: u, rec: { minSec: 150, targetSec: 240, maxSec: 300 } });
    out.persisted = SETTINGS_KEYS.includes('restCuePins');
    return out;
  });
  expect(r.fixed).toMatchObject({ sec: 90, src: 'fixed' });
  expect(r.auto, 'a heavy lift gets the band, not 90 s for everything').toMatchObject({ sec: 240, src: 'auto' });
  expect(r.pin).toMatchObject({ sec: 75, src: 'pin' });
  expect(r.pinStored).toBe(75);
  expect(r.inList).toBe(true);
  expect(r.cleared).toBe('auto');
  expect(r.autoOff).toMatchObject({ sec: 90, src: 'fixed' });
  expect(r.persisted, 'which exercise needs four minutes is a fact about the lift — it should sync').toBe(true);
});

test('feat 481 — the auto target actually drives the cues, not just the display', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = [...VAR_INDEX.keys()][0];
    state.restCues = { ...restCueCfg(), auto: true, interval: 0, countdown: 0, endCue: true };
    window.__st = { ...window.__st, varUuid: u, rec: { minSec: 150, targetSec: 240, maxSec: 300 } };
    window.__beeps = 0; window.at(90);
    const atOldTarget = window.__beeps;          // 90 s was the fixed target — must be silent now
    window.__beeps = 0; window.at(240);
    const atAutoTarget = window.__beeps;         // the band's target is where the end cue lands
    return { atOldTarget, atAutoTarget };
  });
  expect(r.atOldTarget, 'the fixed number no longer decides when rest is over').toBe(0);
  expect(r.atAutoTarget).toBeGreaterThanOrEqual(1);
});

test('feat 481 — ±30 nudges this rest only, clamps at 5 s, and clears when the rest period changes', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    window.__st.restMs = 10000;
    out.up = restCueNudge(30) && restCueTarget(window.__st).sec;      // 90 + 30
    out.down = restCueNudge(-60) && restCueTarget(window.__st).sec;   // 90 - 30
    for (let i = 0; i < 10; i++) restCueNudge(-30);                   // hammer it below zero
    out.floor = restCueTarget(window.__st).sec;
    // a NEW rest period (a different anchoring set) drops the nudge
    window.__st.restMs = 3000;                                        // anchor moved by 7 s -> new period
    _lastRestCueSec = -1; restCueTick();
    out.afterNew = restCueTarget(window.__st).sec;
    out.thenNudge = restCueNudge(60) && restCueTarget(window.__st).sec; // and the new period nudges freely
    // a nudge is refused when you're not resting
    window.__st.mode = 'open';
    out.refused = restCueNudge(30);
    return out;
  });
  expect(r.up).toBe(120);
  expect(r.down).toBe(60);
  expect(r.floor, 'never below the 5 s floor').toBe(5);
  expect(r.afterNew, 'the nudge belongs to the rest you were in').toBe(90);
  expect(r.thenNudge).toBe(150);
  expect(r.refused).toBe(false);
});

test('feat 481 — cues between exercises are opt-in and can carry their own target', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    state.restCues = { ...restCueCfg(), interval: 30, countdown: 0, endCue: true };
    window.__st = { ...window.__st, interExercise: true };
    window.__beeps = 0; window.at(60);
    out.offByDefault = window.__beeps;                     // feat 104 behaviour: silent between exercises
    state.restCues = { ...restCueCfg(), interEx: true };
    window.__beeps = 0; window.at(60);                     // remaining 30 -> interval cue
    out.onWhenEnabled = window.__beeps;
    // its own target: 45 s changeover -> the end cue lands at 45, not 90
    state.restCues = { ...restCueCfg(), interEx: true, interTarget: 45 };
    out.src = restCueTarget(window.__st).src;
    out.sec = restCueTarget(window.__st).sec;
    window.__beeps = 0; window.at(45);
    out.endAtInter = window.__beeps;
    return out;
  });
  expect(r.offByDefault, 'unchanged unless you ask for it').toBe(0);
  expect(r.onWhenEnabled).toBe(1);
  expect(r.src).toBe('inter');
  expect(r.sec).toBe(45);
  expect(r.endAtInter).toBeGreaterThanOrEqual(1);
});

test('feat 481 — past the target the nag fires on its own period, and 0 keeps the old silence', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    state.restCues = { ...restCueCfg(), interval: 0, countdown: 0, overtime: 0 };
    window.__beeps = 0; window.at(150);
    out.silentByDefault = window.__beeps;                  // feat 104: past target = quiet forever
    state.restCues = { ...restCueCfg(), overtime: 30 };
    window.__beeps = 0; window.at(120);                    // 30 s over -> nag
    out.nag = window.__beeps;
    window.__beeps = 0; window.at(135);                    // 45 s over -> not a multiple
    out.between = window.__beeps;
    window.__beeps = 0; window.at(150);                    // 60 s over -> nag again
    out.nagAgain = window.__beeps;
    // count-up mode nags past its target too
    state.restCues = { ...restCueCfg(), mode: 'up', overtime: 30, interval: 0 };
    window.__beeps = 0; window.at(120);
    out.upNag = window.__beeps;
    return out;
  });
  expect(r.silentByDefault).toBe(0);
  expect(r.nag).toBeGreaterThanOrEqual(1);
  expect(r.between).toBe(0);
  expect(r.nagAgain).toBeGreaterThanOrEqual(1);
  expect(r.upNag).toBeGreaterThanOrEqual(1);
});

test('feat 481 — spoken cues say the time and stand the interval beeps down', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.restCues = { ...restCueCfg(), voice: true, target: 180, interval: 30, countdown: 3, endCue: true };
    const out = {};
    window.__said = []; window.__beeps = 0;
    window.at(60);  out.twoMin = window.__said.slice();     // remaining 120
    window.__said = []; window.at(150); out.thirty = window.__said.slice();
    window.__said = []; window.at(178); out.tick = window.__said.slice();
    out.beepsSoFar = window.__beeps;                        // words, not beeps
    window.__said = []; window.__beeps = 0; window.at(180);
    out.end = window.__said.slice(); out.endBeeps = window.__beeps;
    return out;
  });
  // feat 482 — interval cues now speak TWO consecutive seconds so one utterance tells the direction
  expect(r.twoMin).toEqual(['2 minutes, 1:59']);
  expect(r.thirty).toEqual(['30, 29']);
  expect(r.tick).toEqual(['2']);
  expect(r.beepsSoFar, "the beeps would talk over the words").toBe(0);
  expect(r.end.length).toBe(1);
  expect(r.endBeeps, 'the end triad survives as a landmark').toBeGreaterThanOrEqual(1);
});

test('feat 481 — skip silences the current rest and nothing else', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.restCues = { ...restCueCfg(), interval: 30, countdown: 0 };
    // stay on ONE rest period: skip and tick at the same restMs, or the anchor moves and it counts as a new rest
    window.__st.restMs = 60000;                             // remaining 30 -> an interval cue is due
    const out = { skipped: restCueSkip() };
    window.__beeps = 0; _lastRestCueSec = -1; restCueTick();
    out.quiet = window.__beeps;
    window.__st.restMs = 1000;                              // a different anchoring set -> a new rest period
    _lastRestCueSec = -1; restCueTick();
    window.__beeps = 0; window.__st.restMs = 60000; _lastRestCueSec = -1; restCueTick();
    out.backOn = window.__beeps;
    return out;
  });
  expect(r.skipped).toBe(true);
  expect(r.quiet).toBe(0);
  expect(r.backOn, 'the next rest is a fresh start').toBe(1);
});

test('feat 481 — the log-sheet HUD shows the remaining time, its source, and drives the controls', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = [...VAR_INDEX.keys()][0];
    state.restCues = { ...restCueCfg(), auto: true };
    window.__st = { ...window.__st, restMs: 40000, varUuid: u, rec: { minSec: 90, targetSec: 120, maxSec: 180 } };
    const host = document.createElement('div'); host.id = 'trk-rc-hud'; document.body.appendChild(host);
    refreshRestCueHud();
    const out = { shown: host.style.display, src: host.querySelector('.rc-hud-src').textContent,
      left: host.querySelector('.rc-hud-main').textContent };
    host.querySelector('[data-rc-nudge="30"]').dataset.rcNudge;  // present
    restCueNudge(30); refreshRestCueHud();
    out.afterNudge = host.querySelector('.rc-hud-src').textContent;
    restCuePinToggle(); refreshRestCueHud();
    out.pinnedSec = restCuePin(u, null);
    out.pinnedSrc = host.querySelector('.rc-hud-src').textContent;
    out.pinLit = host.querySelector('[data-rc-pin]').classList.contains('on');
    restCuePinToggle();
    out.unpinned = restCuePin(u, null);
    // hidden when rest cues are off entirely
    state.restCues = { ...restCueCfg(), enabled: false };
    refreshRestCueHud();
    out.hiddenWhenOff = host.style.display;
    host.remove();
    return out;
  });
  expect(r.shown).toBe('flex');
  expect(r.left, '120 s target, 40 s elapsed').toContain('1:20');
  expect(r.src).toContain('auto');
  expect(r.afterNudge).toContain('+30s');
  expect(r.pinnedSec, 'the pin captures what you were actually resting').toBe(150);
  expect(r.pinnedSrc).toContain('pinned');
  expect(r.pinLit).toBe(true);
  expect(r.unpinned).toBeNull();
  expect(r.hiddenWhenOff).toBe('none');
});

test('feat 481 — the rest bar counts against the resolved target and keeps counting past it', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = [...VAR_INDEX.keys()][0];
    state.restCues = { ...restCueCfg(), auto: true, mode: 'down' };
    state.workoutControls = { ...(state.workoutControls || {}), restTimer: true };
    window.getActiveSession = () => ({ id: 'x', date: new Date().toISOString(), exercises: [] });
    const bar = document.getElementById('rest-bar');
    window.__st = { ...window.__st, restMs: 30000, varUuid: u, rec: { minSec: 90, targetSec: 120, maxSec: 180 } };
    refreshRestBar();
    const under = bar.querySelector('.rest-bar-label span').textContent;
    window.__st.restMs = 200000;
    refreshRestBar();
    const over = bar.querySelector('.rest-bar-label span').textContent;
    return { under, over };
  });
  expect(r.under, '120 s auto target, 30 s in').toContain('1:30');
  expect(r.over, 'over the target it counts UP, it does not sit at zero').toContain('+1:20');
});
