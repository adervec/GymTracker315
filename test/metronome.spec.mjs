// feat 103 — metronome "mantra mode": chant the current exercise's setup cues on each beat, cycling
// through them on a loop instead of beeping. Tests the cue-cycling logic + the config plumbing.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.metroNextMantraTip === 'function'
    && typeof window.collectExerciseTips === 'function'
    && typeof window.metroCfg === 'function', null, { timeout: 15000 });
});

test('mantra defaults off and is a persisted metronome setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    const def = metroCfg().mantra;
    state.metronome = { ...metroCfg(), mantra: true };
    saveState();
    const persisted = JSON.parse(localStorage.getItem('overload_tracker_v2')).metronome.mantra;
    const inKeys = SETTINGS_KEYS.includes('metronome');
    return { def, persisted, inKeys };
  });
  expect(r.def).toBe(false);
  expect(r.persisted).toBe(true);
  expect(r.inKeys).toBe(true);
});

test('metroNextMantraTip cycles through the exercise cues and loops', async ({ page }) => {
  const r = await page.evaluate(() => {
    // find an exercise with at least 2 setup cues
    let ex = null, tips = null;
    for (const [uuid] of VAR_INDEX) { const t = collectExerciseTips(uuid); if (t.length >= 2) { ex = uuid; tips = t; break; } }
    _metroMantraIdx = 0;
    const seq = [];
    for (let i = 0; i < tips.length + 1; i++) seq.push(metroNextMantraTip(ex));
    return { tips, seq };
  });
  // first pass walks the tips in order, then loops back to the first
  expect(r.seq.slice(0, r.tips.length)).toEqual(r.tips);
  expect(r.seq[r.tips.length]).toBe(r.tips[0]); // looped
});

test('metroNextMantraTip returns null when there are no cues', async ({ page }) => {
  const got = await page.evaluate(() => metroNextMantraTip(null));
  expect(got).toBe(null);
});

test('a mantra tick advances a chant and does not beep; stop cancels speech', async ({ page }) => {
  const r = await page.evaluate(() => {
    // pick an exercise with cues and make it the pending log exercise
    let ex = null;
    for (const [uuid] of VAR_INDEX) { if (collectExerciseTips(uuid).length) { ex = uuid; break; } }
    pending = { varUuid: ex, subUuid: null, sets: [] };
    state.metronome = { ...metroCfg(), mantra: true, audio: true, setActiveOnly: false }; // free-run to isolate the mantra branch
    state.sound = { audio: true, haptics: true, volume: 1 };
    _metroMantraIdx = 0; _metroSpeaking = false;
    let beeps = 0; const realBeep = window.metroBeep; window.metroBeep = () => { beeps++; };
    metroTick();                 // mantra branch -> speaks, no beep
    const idxAfter = _metroMantraIdx;
    window.metroBeep = realBeep;
    stopMetronome();             // should clear the speaking flag
    return { beeps, idxAfter, speakingAfterStop: _metroSpeaking };
  });
  expect(r.beeps).toBe(0);       // mantra mode does not beep
  expect(r.idxAfter).toBe(1);    // one cue consumed
  expect(r.speakingAfterStop).toBe(false);
});
