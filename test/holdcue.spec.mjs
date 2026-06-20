// feat 291 — timed-hold count cue. For holds/hangs, on set start the coach voice says "Ready… Set… Go" and the
// set timer (wTs) only starts on "Go", then it counts the seconds aloud at a configurable interval. While active
// it overrides the metronome / rest cues. Opt-in via state.holdCue.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof holdCueCfg === 'function' && typeof startHoldCue === 'function'
    && typeof cancelHoldCue === 'function' && typeof holdCueActive === 'function' && typeof commitSetField === 'function'
    && typeof metroTick === 'function' && typeof exMode === 'function', null, { timeout: 15000 });
});

const timedVar = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'time') return u; return null; });

test('feat 291 — holdCueCfg defaults to off / every 1, and clamps the interval', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.holdCue = undefined; const def = holdCueCfg();
    state.holdCue = { enabled: true, every: 0 }; const lo = holdCueCfg();
    state.holdCue = { enabled: true, every: 999 }; const hi = holdCueCfg();
    return { def, lo: lo.every, hi: hi.every };
  });
  expect(r.def.enabled).toBe(false);
  expect(r.def.every).toBe(1);
  expect(r.lo).toBe(1);     // clamped up to 1
  expect(r.hi).toBe(60);    // clamped down to 60
});

test('feat 291 — with the cue ON, a timed set defers the timer to "Go" (~1.8s); with it OFF it starts immediately', async ({ page }) => {
  const v = await timedVar(page);
  // cue OFF → wTs stamped immediately (unchanged behaviour)
  const off = await page.evaluate((v) => {
    state.holdCue = { enabled: false }; cancelHoldCue();
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    if (typeof modalState !== 'undefined') modalState.isEditing = false;
    commitSetField(0, 'w', 0);
    return { wTs: pending.sets[0].wTs, active: holdCueActive() };
  }, v);
  expect(off.wTs).toBeTruthy();      // started right away
  expect(off.active).toBe(false);

  // cue ON → wTs deferred, hold cue active
  const onNow = await page.evaluate((v) => {
    state.holdCue = { enabled: true, every: 1 }; cancelHoldCue();
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    commitSetField(0, 'w', 0);
    return { wTs: pending.sets[0].wTs, active: holdCueActive() };
  }, v);
  expect(onNow.wTs == null).toBe(true);   // NOT started yet — waiting for "Go"
  expect(onNow.active).toBe(true);

  await page.waitForTimeout(2100);        // let "Ready/Set/Go" play out (Go ≈ 1.8 s)
  const after = await page.evaluate(() => ({ wTs: pending.sets[0].wTs, active: holdCueActive() }));
  expect(typeof after.wTs).toBe('string'); // the timer started on "Go"
  expect(after.active).toBe(true);          // …and it's now counting up

  // completing the set (reps/seconds land) cancels the cue
  const done = await page.evaluate(() => { commitSetField(0, 'r', 30); return { ts: pending.sets[0].ts, active: holdCueActive() }; });
  expect(done.ts).toBeTruthy();
  expect(done.active).toBe(false);
});

test('feat 291 — clearing the weight before "Go" aborts the cue', async ({ page }) => {
  const v = await timedVar(page);
  const r = await page.evaluate((v) => {
    state.holdCue = { enabled: true, every: 1 }; cancelHoldCue();
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    commitSetField(0, 'w', 0); const started = holdCueActive();
    commitSetField(0, 'w', '');                 // clear the weight
    return { started, active: holdCueActive() };
  }, v);
  expect(r.started).toBe(true);
  expect(r.active).toBe(false);                 // aborted
});

test('feat 291 — the metronome tick is suppressed while the hold cue is active', async ({ page }) => {
  const v = await timedVar(page);
  const r = await page.evaluate((v) => {
    let calls = 0; const orig = window.metroBeep; window.metroBeep = () => { calls++; };
    state.metronome = { setActiveOnly: false, audio: true, mantra: false, bpm: 60 };
    pending = { varUuid: v, subUuid: null, sets: [{ w: 50, r: '' }] };
    startHoldCue(0);                 // cue active → metroTick must no-op
    metroTick(); const during = calls;
    cancelHoldCue();                 // …then the metronome ticks again
    metroTick(); const after = calls;
    window.metroBeep = orig;
    return { during, after };
  }, v);
  expect(r.during).toBe(0);   // overridden while the hold cue runs
  expect(r.after).toBe(1);    // resumes once it ends
});

test('feat 291 — the Metronome settings expose the hold-cue toggle + interval', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.holdCue = { enabled: true, every: 5 };
    renderSettingsDrawer();
    const body = document.getElementById('settings-drawer-body');
    return {
      hasToggle: !!body.querySelector('[data-holdcue="enabled"]'),
      onActive: body.querySelector('[data-holdcue="enabled"][data-holdcue-val="on"]').classList.contains('active'),
      every: body.querySelector('#drawer-holdcue-every')?.value,
    };
  });
  expect(r.hasToggle).toBe(true);
  expect(r.onActive).toBe(true);
  expect(r.every).toBe('5');
});
