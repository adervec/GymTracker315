// feat 205 — "Mantranome": the mantra mode rename, metronome controls in the audio dropdown
// (run / bpm / 🧘 toggle), and the 4-cycle cap — all cues chant at most 4 full cycles per set,
// then the metronome reverts to normal ticks; a new set restarts the cycles.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof metroTick === 'function' && typeof renderSoundMenu === 'function', null, { timeout: 15000 });
});

test('chants under the cap, reverts to regular ticks once all cues ran 4 cycles', async ({ page }) => {
  const r = await page.evaluate(() => {
    let ex = null, n = 0;
    for (const [u] of VAR_INDEX) { const t = collectExerciseTips(u); if (t.length >= 2) { ex = u; n = t.length; break; } }
    pending.varUuid = ex;
    state.metronome = { ...metroCfg(), mantra: true, audio: true, setActiveOnly: false };
    let spoke = 0, beeps = 0;
    window.metroSpeakNextTip = () => { spoke++; _metroMantraIdx++; };  // spy advances like the real one
    window.metroBeep = () => { beeps++; };
    window.metroSetActive = () => false;                                // free-run; no set edge
    _metroMantraIdx = 0; _metroWasActive = false;
    metroTick();                                                        // under cap → chant
    const one = { spoke, beeps };
    _metroMantraIdx = n * 4;                                            // cap reached for this set
    metroTick(); metroTick();                                           // → normal metronome ticks
    return { one, spoke, beeps, n };
  });
  expect(r.n).toBeGreaterThanOrEqual(2);
  expect(r.one).toEqual({ spoke: 1, beeps: 0 }); // mantra branch, no beep
  expect(r.spoke).toBe(1);                       // chanting stopped at the cap…
  expect(r.beeps).toBe(2);                       // …and regular ticks took over
});

test('a NEW set (rising edge of set-active) restarts the chant cycles', async ({ page }) => {
  const r = await page.evaluate(() => {
    let ex = null;
    for (const [u] of VAR_INDEX) { if (collectExerciseTips(u).length >= 2) { ex = u; break; } }
    pending.varUuid = ex;
    state.metronome = { ...metroCfg(), mantra: true, audio: true, setActiveOnly: false };
    let spoke = 0;
    window.metroSpeakNextTip = () => { spoke++; _metroMantraIdx++; };
    window.metroBeep = () => {};
    window.metroSetActive = () => true;        // a set just became active
    _metroMantraIdx = 999; _metroWasActive = false;  // exhausted from the previous set
    metroTick();                                // rising edge → reset → chant again
    return { spoke, idx: _metroMantraIdx };
  });
  expect(r.spoke).toBe(1);  // the cap reset let it chant
  expect(r.idx).toBe(1);    // counter restarted from 0 (now 1 after one chant)
});

test('the audio dropdown controls the metronome: run toggle, bpm stepper, Mantranome chip', async ({ page }) => {
  await page.evaluate(() => { state.metronome = { ...metroCfg(), mantra: false, bpm: 60 }; openSoundMenu(); });
  const bpmUp = async () => { await page.click('#snd-metro-bpm-up'); return page.evaluate(() => ({ bpm: metroCfg().bpm, label: document.getElementById('snd-metro-bpm').textContent })); };
  const after = await bpmUp();
  expect(after.bpm).toBe(65);
  expect(after.label).toBe('65 bpm');
  await page.click('#snd-metro-mantra');
  expect(await page.evaluate(() => metroCfg().mantra)).toBe(true);   // 🧘 toggled Mantranome on
  expect(await page.evaluate(() => document.getElementById('snd-metro-mantra').classList.contains('active'))).toBe(true);
  await page.click('#snd-metro-run');                                 // start…
  expect(await page.evaluate(() => metronomeRunning())).toBe(true);
  await page.click('#snd-metro-run');                                 // …and stop
  expect(await page.evaluate(() => metronomeRunning())).toBe(false);
  await page.evaluate(() => { closeSoundMenu(); state.metronome = { ...metroCfg(), mantra: false }; saveState(); });
});

test('the setting is named Mantranome everywhere (no more "Mantra mode")', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const html = document.body.innerHTML;
    return { mantranome: html.includes('Mantranome'), legacy: html.includes('Mantra mode') };
  });
  expect(r.mantranome).toBe(true);
  expect(r.legacy).toBe(false);
});
