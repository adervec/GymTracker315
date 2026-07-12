// feat 423 — hold auto-stop: the timed-hold count-up can stop itself. Two independent opt-in triggers,
// armed only while a hold-timer button is live: 📴 accelerometer (picking the phone back up) and 🎙 a
// configurable spoken stop word — each with its OWN buffer subtracted from the elapsed reading (picked
// up at 31s with a 1s buffer → 30s logged). None / either / both may be enabled.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof makePickupDetector === 'function' && typeof _holdAutoStop === 'function'
    && typeof holdVoiceWordCfg === 'function' && typeof ensureHoldTimers === 'function'
    && typeof renderSettingsDrawer === 'function', null, { timeout: 15000 });
});

const timedVar = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'time') return u; return null; });

const openHold = (page, startAgoMs, wc) => page.evaluate(({ startAgoMs, wc }) => {
  state.readonly = false;
  state.workoutControls = Object.assign(state.workoutControls || {}, wc);
  const v = (() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'time') return u; })();
  pending = { varUuid: v, subUuid: null, sets: [{ w: 0, r: '', wTs: new Date(Date.now() - startAgoMs).toISOString(), ts: undefined }] };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
}, { startAgoMs, wc });

test('makePickupDetector: settle grace, brief bumps ignored, a real pickup fires once', async ({ page }) => {
  const r = await page.evaluate(() => {
    // wild motion inside the settle window never fires (the phone is still being put down)
    const settling = makePickupDetector({ settleMs: 1000 });
    let settleFires = 0;
    for (let i = 0; i < 30; i++) settleFires += settling(i % 2 ? 20 : 2, i * 30) ? 1 : 0; // all < 1000ms

    // after settling at gravity, a 3-sample bump (someone knocks the bench) stays quiet
    const bumped = makePickupDetector({ settleMs: 100 });
    for (let i = 0; i < 20; i++) bumped(9.8, i * 30);            // settle + quiet baseline
    let bumpFires = 0;
    for (let i = 0; i < 3; i++) bumpFires += bumped(15, 700 + i * 30) ? 1 : 0;
    for (let i = 0; i < 10; i++) bumpFires += bumped(9.8, 800 + i * 30) ? 1 : 0; // back to still

    // a real pickup: sustained off-baseline samples → exactly one fire, then the counter resets
    const picked = makePickupDetector({ settleMs: 100 });
    for (let i = 0; i < 20; i++) picked(9.8, i * 30);
    let fires = 0, firstAt = -1;
    for (let i = 0; i < 12; i++) { if (picked(i % 2 ? 14 : 5, 700 + i * 30)) { fires++; if (firstAt < 0) firstAt = i; } }
    return { settleFires, bumpFires, fires, firstAt };
  });
  expect(r.settleFires).toBe(0);
  expect(r.bumpFires).toBe(0);
  expect(r.fires).toBe(1);
  expect(r.firstAt).toBeGreaterThanOrEqual(7);   // needs a sustained burst (8 deviant samples), not a jolt
});

// stop the hold at EXACTLY elapsedMs after its start (render latency would otherwise blur the rounding)
const stopAt = (page, kind, elapsedMs) => page.evaluate(({ kind, elapsedMs }) => {
  const start = parseInt(document.querySelector('.hold-timer-btn').dataset.holdStart, 10);
  const realNow = Date.now.bind(Date);
  Date.now = () => start + elapsedMs;
  _holdAutoStop(kind);
  Date.now = realNow;
  const s = pending.sets[0];
  return { r: s.r, done: !!s.ts, buttonGone: !document.querySelector('.hold-timer-btn') };
}, { kind, elapsedMs });

test('accel trigger logs elapsed minus ITS buffer; ts stamped (set done)', async ({ page }) => {
  await openHold(page, 5000, { holdAccelStop: true, holdAccelBufferS: 1, holdVoiceBufferS: 5 });
  const r = await stopAt(page, 'accel', 31000);
  expect(r.r).toBe(30);            // picked up at 31s − 1s pickup buffer → 30 (voice's 5s buffer NOT used)
  expect(r.done).toBe(true);
  expect(r.buttonGone).toBe(true); // completed set drops its timer, sensors disarm with it
});

test('voice trigger uses the SEPARATE stop-word buffer', async ({ page }) => {
  await openHold(page, 5000, { holdVoiceStop: true, holdAccelBufferS: 1, holdVoiceBufferS: 3, holdVoiceWord: 'stop' });
  expect((await stopAt(page, 'voice', 31000)).r).toBe(28);   // 31s − 3s stop-word buffer → 28
});

test('buffers default to 1s and a hold never logs below 1s', async ({ page }) => {
  await openHold(page, 5000, { holdAccelStop: true, holdAccelBufferS: undefined });
  expect((await stopAt(page, 'accel', 31000)).r).toBe(30);   // default buffer 1s
  await openHold(page, 5000, { holdAccelStop: true, holdAccelBufferS: 10 });
  expect((await stopAt(page, 'accel', 1500)).r).toBe(1);     // 1.5s − 10s → floored at 1s
});

test('arming follows the hold lifecycle: on with a live hold (when enabled), off when it completes', async ({ page }) => {
  const supported = await page.evaluate(() => shakeNavSupported());
  test.skip(!supported, 'DeviceMotion not present in this engine');
  // disabled → a live hold arms nothing
  await openHold(page, 5000, { holdAccelStop: false, holdVoiceStop: false });
  expect(await page.evaluate(() => _haMotionOn)).toBe(false);
  // enabled → the same hold arms the motion listener; completing the set disarms it
  await openHold(page, 5000, { holdAccelStop: true });
  const r = await page.evaluate(() => {
    const armed = _haMotionOn;
    document.querySelector('.hold-timer-btn').click();   // manual tap completes the set
    return { armed, after: _haMotionOn };
  });
  expect(r.armed).toBe(true);
  expect(r.after).toBe(false);
  // closing the sheet also disarms
  await openHold(page, 5000, { holdAccelStop: true });
  expect(await page.evaluate(() => { const a = _haMotionOn; closeLogModal(); return { a, b: _haMotionOn }; })).toEqual({ a: true, b: false });
});

test('the stop word matches inside any transcript, case-insensitive; enable-predicates honour word + toggle', async ({ page }) => {
  const r = await page.evaluate(() => {
    let hits = 0;
    const rec = _holdVoiceMakeRec('banana', () => hits++);
    if (!rec) return { unsupported: true };
    const ev = (t) => ({ resultIndex: 0, results: [[{ transcript: t }]] });
    rec.onresult(ev('ok BANANA please'));   // case-insensitive, mid-sentence
    const afterHit = hits;
    rec.onresult(ev('nothing to see'));     // no match
    state.workoutControls = Object.assign(state.workoutControls || {}, { holdVoiceStop: true, holdVoiceWord: ' Bananas ' });
    const word = holdVoiceWordCfg();        // trimmed + lowercased
    state.workoutControls.holdVoiceWord = '';
    const emptyDisables = !holdVoiceStopEnabled();
    return { afterHit, hits, word, emptyDisables };
  });
  test.skip(!!r.unsupported, 'SpeechRecognition not present in this engine');
  expect(r.afterHit).toBe(1);
  expect(r.hits).toBe(1);
  expect(r.word).toBe('bananas');
  expect(r.emptyDisables).toBe(true);      // no word → the voice trigger stays idle even when toggled on
});

test('settings offer both triggers: toggles, per-trigger buffers, the word field and its 🎙 Test', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const html = document.getElementById('settings-drawer-body').innerHTML;
    return {
      accelRow: html.includes('data-holdaccel="on"') && html.includes('drawer-holdaccel-buf'),
      voiceRow: html.includes('data-holdvoice="on"') || html.includes("doesn't support speech recognition"),
      wordAndTest: !window.webkitSpeechRecognition || (html.includes('drawer-holdvoice-word') && html.includes('drawer-holdvoice-test') && html.includes('drawer-holdvoice-buf')),
    };
  });
  expect(r.accelRow || !(await page.evaluate(() => shakeNavSupported()))).toBe(true);
  expect(r.voiceRow).toBe(true);
  expect(r.wordAndTest).toBe(true);
});
