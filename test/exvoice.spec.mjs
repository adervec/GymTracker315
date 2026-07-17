// feat 435 — set-quality sound: completing a set plays a short melody tracking its overload level
// (PR fanfare → falling pair), opt-in via Settings › Metronome & Cues.
// feat 436 — voice control scoped to the EXERCISE PAGE: a 🎤 toggle arms one recognition session while
// the sheet is open; "weight N", "reps N", "add set", "save", "close" — and it absorbs the feat-423
// hold stop word so the two never fight over the single mic session.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof playSetQualityTone === 'function' && typeof _exVoiceHandle === 'function'
    && typeof exVoiceToggle === 'function' && typeof openLogModal === 'function', null, { timeout: 15000 });
});

const stdVar = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; });

test('feat 435 — the quality melody data rises for a PR and falls for a down set', async ({ page }) => {
  const r = await page.evaluate(() => ({
    prRises: _SQT_NOTES.pr.every((f, i, a) => i === 0 || f > a[i - 1]),
    downFalls: _SQT_NOTES.down[0] > _SQT_NOTES.down[1],
    levels: Object.keys(_SQT_NOTES).sort(),
  }));
  expect(r.prRises).toBe(true);
  expect(r.downFalls).toBe(true);
  expect(r.levels).toEqual(['baseline', 'down', 'match', 'mild', 'mild-down', 'pr', 'progress'].sort());
});

test('feat 435 — completing a set fires the tone once with the right level, only when enabled', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    state.readonly = false; state.unit = 'lb';
    const now = Date.now();
    state.sessions = [{ id: 's', date: new Date(now - 3 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 100, r: 5 }] }] }];
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.isEditing = false;
    const calls = [];
    const real = playSetQualityTone;
    window.playSetQualityTone = (lvl) => calls.push(lvl);
    state.workoutControls = state.workoutControls || {}; state.workoutControls.setQualityTone = false;
    commitSetField(0, 'w', 120); commitSetField(0, 'r', 5);       // disabled → silent
    const offCalls = calls.length;
    pending.sets = [{ w: '', r: '' }];
    state.workoutControls.setQualityTone = true;
    commitSetField(0, 'w', 120); commitSetField(0, 'r', 5);       // 120×5 e1RM 140 beats 116.7 → PR
    const onLevel = calls[calls.length - 1];
    const onCount = calls.length;
    commitSetField(0, 'r', 6);                                     // editing reps of a DONE set → no re-fire
    const afterEdit = calls.length;
    window.playSetQualityTone = real;
    state.workoutControls.setQualityTone = false;
    return { offCalls, onLevel, onCount, afterEdit };
  }, v);
  expect(r.offCalls).toBe(0);
  expect(r.onLevel).toBe('pr');
  expect(r.onCount).toBe(1);
  expect(r.afterEdit).toBe(1);
});

test('feat 435 — the Metronome & Cues section carries the toggle row', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const body = document.getElementById('settings-drawer-body');
    return { on: !!body.querySelector('[data-sqtone="on"]'), off: !!body.querySelector('[data-sqtone="off"]') };
  });
  expect(r.on).toBe(true);
  expect(r.off).toBe(true);
});

test('feat 436 — voice commands drive weight / reps / add set / close on the open sheet', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    state.readonly = false; state.unit = 'lb';
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; renderModal();
    const w = _exVoiceHandle('weight 120');
    const wVal = pending.sets[0].w;
    const rp = _exVoiceHandle('reps 8');
    const rVal = pending.sets[0].r;
    const before = pending.sets.length;                 // set 1 complete → "add set" grows (feat-65 rule)
    const add = _exVoiceHandle('add set');
    const after = pending.sets.length;
    const w2 = _exVoiceHandle('weight 100');            // targets the fresh incomplete row
    const set2w = pending.sets[1] && pending.sets[1].w;
    const junk = _exVoiceHandle('bananas forever');
    const close = _exVoiceHandle('close please');
    const closed = !modalState.open;
    return { w, wVal, rp, rVal, w2, set2w, added: after > before, add, junk, close, closed };
  }, v);
  expect(r.w).toBe('weight 120');
  expect(r.wVal).toBe(120);
  expect(r.rp).toBe('8 reps');
  expect(r.rVal).toBe(8);
  expect(r.w2).toBe('weight 100');
  expect(r.set2w).toBe(100);
  expect(r.added).toBe(true);
  expect(r.junk).toBeNull();
  expect(r.close).toBe('close');
  expect(r.closed).toBe(true);
});

test('feat 436 — the hold stop word takes precedence on the shared mic; closed sheet ignores commands', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    state.readonly = false;
    state.workoutControls = state.workoutControls || {}; state.workoutControls.holdVoiceStop = true; state.workoutControls.holdVoiceWord = 'stop';
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; renderModal();
    document.getElementById('trk-modal-body').insertAdjacentHTML('beforeend',
      `<button class="hold-timer-btn" data-hold-idx="0" data-hold-start="${Date.now() - 31000}">x</button>`);
    const holdHit = _exVoiceHandle('ok stop now');
    closeLogModal();
    state.workoutControls.holdVoiceStop = false;
    const closedCmd = _exVoiceHandle('weight 120');
    return { holdHit, closedCmd };
  }, v);
  expect(r.holdHit).toBe('hold stop');
  expect(r.closedCmd).toBeNull();
});

test('feat 436 — 🎤 toggle persists, lights the button, and closing the sheet releases the mic', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    state.readonly = false;
    state.workoutControls = state.workoutControls || {}; state.workoutControls.exVoice = false;
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; renderModal();
    const btnBefore = document.getElementById('trk-ex-voice');
    const offText = btnBefore ? btnBefore.textContent.trim() : 'missing';
    exVoiceToggle();
    const on = exVoiceEnabled();
    const btnAfter = document.getElementById('trk-ex-voice');
    const lit = btnAfter && btnAfter.classList.contains('voice-on');
    exVoiceDisarm();
    let stopped = false;
    _exVoiceRec = { stop() { stopped = true; }, onend: () => {} };   // stub a live session
    closeLogModal();
    const released = _exVoiceRec === null && stopped;
    state.workoutControls.exVoice = false;
    return { offText, on, lit, released };
  }, v);
  expect(r.offText).toBe('🎤');
  expect(r.on).toBe(true);
  expect(r.lit).toBe(true);
  expect(r.released).toBe(true);
});
