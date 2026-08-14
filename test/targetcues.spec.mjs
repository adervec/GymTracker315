// feat 482 — the target-button flow and the rest-cue timer learn to cooperate:
// (a) prefilling a weight from a target tile STARTS the set (wTs), so rest cues stand down during it,
// (b) the target tiles are sortable (order / weight / reps / e1RM / vulnerability) and go green live,
// (c) a configurable slow-set nag fires while a set runs long,
// (d) spoken interval cues say two consecutive seconds ("30, 29" / "30, 31") so one utterance tells
//     you which way the clock is running,
// (e) the numpad keeps the value a field opened with visible as "was N" while you retype.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.restCueTick === 'function'
    && typeof window.prefillTargetWeight === 'function'
    && typeof window.sortTargetDefs === 'function', null, { timeout: 15000 });
});

// Pick a standard-mode variation (bodyweight/time modes route weight entry differently).
const PICK_STANDARD_VAR = `(() => {
  for (const v of VAR_INDEX.keys()) { try { if (exMode(v).mode === 'standard') return v; } catch (_) {} }
  return null;
})()`;

test('a target-button prefill stamps wTs: the set counts as STARTED and rest cues stand down', async ({ page }) => {
  const r = await page.evaluate((pickExpr) => {
    normalizeState();
    const v = eval(pickExpr);
    window.getActiveSession = () => ({ exercises: [] });
    window.renderModal = () => {}; window.updateFAB = () => {}; window.updateSaveBtn = () => {};
    window.seedSetupForWeight = () => {}; window.annunceSetStart = () => {};
    pending = { varUuid: v, subUuid: null, sets: [] };
    prefillTargetWeight(100);
    const s = pending.sets[0];
    const st = computeRestState();                       // the REAL one — this is the point of the test
    // and with cues enabled the tick is silent during the set (setNag off)
    state.restCues = { ...restCueCfg(), enabled: true, target: 5, interval: 5, countdown: 3, audio: true };
    const calls = []; window.restCueFire = (k) => calls.push(k);
    _lastRestCueSec = -1; _lastSetNagSec = -1;
    restCueTick();
    return { w: s.w, hasWTs: !!s.wTs, mode: st.mode, fired: calls.length };
  }, PICK_STANDARD_VAR);
  expect(r.w).toBe(100);
  expect(r.hasWTs).toBe(true);   // the old path skipped this → computeRestState stayed 'resting'
  expect(r.mode).toBe('open');
  expect(r.fired).toBe(0);       // a set in progress → no rest cues
});

test('slow-set nag fires every setNag seconds while a set is open, and 0 keeps the old silence', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.restCues = { ...restCueCfg(), enabled: true, setNag: 45 };
    const calls = []; window.restCueFire = (k, s) => calls.push([k, s]);
    window.holdCueActive = () => false;
    const at = (sec) => { window.computeRestState = () => ({ mode: 'open', sinceMs: sec * 1000 }); restCueTick(); };
    at(44); const before = calls.length;
    at(45); const first = calls.slice();
    at(45); const deduped = calls.length;                 // same second twice → once
    at(46); const between = calls.length;
    at(90); const second = calls.length;
    calls.length = 0;
    state.restCues = { ...restCueCfg(), enabled: true, setNag: 0 };
    _lastSetNagSec = -1; at(45); at(90);
    return { before, first, deduped, between, second, whenOff: calls.length };
  });
  expect(r.before).toBe(0);
  expect(r.first).toEqual([['slow', 45]]);
  expect(r.deduped).toBe(1);
  expect(r.between).toBe(1);
  expect(r.second).toBe(2);      // 90 = 2 × 45 → nags again
  expect(r.whenOff).toBe(0);     // default: exactly the pre-482 behaviour
});

test('spoken interval cues say two consecutive seconds, telling the direction', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const said = []; window.annunce = (t) => said.push(t);
    window.restBeep = () => {}; window.holdCueActive = () => false;
    const at = (sec) => { _lastRestCueSec = -1; window.computeRestState = () => ({ mode: 'resting', restMs: sec * 1000, interExercise: false }); restCueTick(); };
    state.restCues = { ...restCueCfg(), enabled: true, voice: true, haptic: false, mode: 'down', target: 90, interval: 30, countdown: 0 };
    at(60);                                               // remaining 30, counting DOWN
    state.restCues = { ...state.restCues, mode: 'up' };
    _lastRestCueSec = -1; at(30);                         // second 30, counting UP
    state.restCues = { ...state.restCues, mode: 'down', target: 240, interval: 60 };
    at(120);                                              // remaining 120 → minute name + clock form
    return said;
  });
  expect(r[0]).toBe('30, 29');
  expect(r[1]).toBe('30, 31');
  expect(r[2]).toBe('2 minutes, 1:59');
});

test('sortTargetDefs orders tiles by weight, reps, e1RM or PR odds; targetSort is a persisted setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    const defs = [
      ['a', 'A', { w: 100, r: 5 }, null],
      ['b', 'B', { w: 80, r: 12 }, 40],
      ['c', 'C', { w: 120, r: 2 }, null],
      ['d', 'D', null, null],
    ];
    const ids = (arr) => arr.map(d => d[0]).join('');
    state.targetSort = 'garbage'; normalizeState();
    return {
      order: ids(sortTargetDefs(defs, 'order')),
      byW: ids(sortTargetDefs(defs, 'w')),
      byR: ids(sortTargetDefs(defs, 'r')),
      byE1: ids(sortTargetDefs(defs, 'e1')),
      byVuln: ids(sortTargetDefs(defs, 'vuln')).charAt(0),
      inKeys: SETTINGS_KEYS.includes('targetSort'),
      normalized: state.targetSort,
    };
  });
  expect(r.order).toBe('abcd');   // 'order' = untouched
  expect(r.byW).toBe('cabd');     // 120, 100, 80, missing last
  expect(r.byR).toBe('bacd');     // 12, 5, 2
  expect(r.byE1).toBe('cabd');    // 120×2 ≈ 128 > 100×5 ≈ 117 > 80×12 = 112
  expect(r.byVuln).toBe('b');     // the only tile WITH odds leads
  expect(r.inKeys).toBe(true);
  expect(r.normalized).toBe('order');
});

test('refreshTargetHits turns a hit tile green immediately, without a full re-render', async ({ page }) => {
  const r = await page.evaluate((pickExpr) => {
    normalizeState();
    const v = eval(pickExpr);
    document.body.insertAdjacentHTML('beforeend',
      `<div id="trk-targets"><span class="targets-count">0/2 hit</span>
        <button class="target-btn" data-w="100" data-r="5"></button>
        <button class="target-btn" data-w="120" data-r="3"></button></div>`);
    pending = { varUuid: v, subUuid: null, sets: [{ w: 100, r: 5 }] };
    refreshTargetHits();
    const el = document.getElementById('trk-targets');
    const out = {
      hitClasses: Array.from(el.querySelectorAll('.target-btn')).map(b => b.classList.contains('hit')),
      counter: el.querySelector('.targets-count').textContent,
    };
    el.remove();
    return out;
  }, PICK_STANDARD_VAR);
  expect(r.hitClasses).toEqual([true, false]);  // 100×5 done → hit; 120×3 not
  expect(r.counter).toBe('1/2 hit');
});

test('the numpad keeps the opening value visible as "was N" even after Clear', async ({ page }) => {
  const r = await page.evaluate((pickExpr) => {
    normalizeState();
    const v = eval(pickExpr);
    pending = { varUuid: v, subUuid: null, sets: [{ w: 100, r: 8, wTs: new Date().toISOString(), ts: new Date().toISOString() }] };
    openNumpad(0, 'w');
    const sheet = document.getElementById('trk-numpad');
    const shownAtOpen = sheet.textContent.includes('was 100');
    numpadHandleKey('clear');                       // the edit gesture that used to erase the reference
    const bufAfterClear = modalState.numpad.buf;
    const stillShown = sheet.textContent.includes('was 100');
    const orig = modalState.numpad.orig;
    modalState.numpad.buf = '100';                  // restore before the close-flush writes the buffer back
    closeNumpad();
    // an EMPTY field opens with no reference line
    pending.sets.push({ w: '', r: '' });
    openNumpad(1, 'w');
    const emptyHasWas = sheet.textContent.includes('was ');
    modalState.numpad.open = false;
    return { shownAtOpen, bufAfterClear, stillShown, orig, emptyHasWas };
  }, PICK_STANDARD_VAR);
  expect(r.shownAtOpen).toBe(true);
  expect(r.bufAfterClear).toBe('');
  expect(r.stillShown).toBe(true);   // the whole point: Clear wipes the buffer, not the reference
  expect(r.orig).toBe('100');
  expect(r.emptyHasWas).toBe(false);
});
