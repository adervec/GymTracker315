// feat 550 — custom sound clips: render ≤ 5 s of any audio to a small WAV, keep it on the device, and let it
// replace the PR / progress / rest-over / workout-ended sounds.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof saveCustomClip === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  // a 9-second 44.1 kHz stereo tone stands in for an uploaded song
  await page.evaluate(() => {
    const ctx = _clipCtx(), b = ctx.createBuffer(2, 44100 * 9, 44100);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin(i / 44100 * 2 * Math.PI * 440); }
    window._song = b;
  });
});

test('feat 550 — a clip is capped at 5 s, mono 22 kHz, normalised and faded', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const long = await renderClip(_song, 2, 8);           // asked for 8 s — capped at 5
    const tail = await renderClip(_song, 7.5, 5);         // only 1.5 s left in the file
    const s = long.samples; let peak = 0; for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i]));
    const wav = encodeWav16(s, CLIP_RATE), head = new Uint8Array(await wav.slice(0, 44).arrayBuffer());
    return { sec: long.sec, n: s.length, tail: tail.sec, peak, last: Math.abs(s[s.length - 1]), riff: String.fromCharCode(...head.slice(0, 4)), bytes: wav.size };
  });
  expect(r.sec).toBe(5);
  expect(r.n).toBe(5 * 22050);
  expect(r.tail).toBe(1.5);
  expect(r.peak).toBeGreaterThan(0.85);
  expect(r.peak).toBeLessThanOrEqual(0.91);
  expect(r.last).toBeLessThan(0.01);                      // faded out
  expect(r.riff).toBe('RIFF');
  expect(r.bytes).toBe(44 + 5 * 22050 * 2);               // ~220 KB
});

test('feat 550 — saved clips survive a reload, play in place of the PR sound, and can be removed', async ({ page }) => {
  await page.evaluate(async () => { await saveCustomClip('pr', _song, 0, 3, 'airhorn.mp3'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof hasCustomClip === 'function' && hasCustomClip('pr'), null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const played = [];
    const orig = playCustomClip; window.playCustomClip = playCustomClip = (slot) => { played.push(slot); return orig(slot); };
    let melody = 0; playSetQualityTone = () => { melody++; };
    state.workoutControls.setQualityTone = false;
    // a PR set with the melody switched off still plays the custom PR clip
    getOverloadScore = () => ({ level: 'pr' });
    pending = { varUuid: [...VAR_INDEX.keys()][0], subUuid: null, sets: [{ w: 100, r: '' }] }; modalState.isEditing = false;
    commitSetField(0, 'r', 5);
    const meta = _clipMeta.pr;
    renderSettingsDrawer();
    const row = [...document.querySelectorAll('.csnd-row')].find(x => x.textContent.includes('PR set')).textContent;
    await removeCustomClip('pr');
    return { played, melody, meta, row, gone: !hasCustomClip('pr') };
  });
  expect(r.played).toEqual(['pr']);
  expect(r.melody).toBe(0);
  expect(r.meta.sec).toBe(3);
  expect(r.row).toContain('Custom · 3s');
  expect(r.row).toContain('airhorn.mp3');
  expect(r.gone).toBe(true);
});

test('feat 550 — rest-over and workout-ended clips replace their built-in sounds', async ({ page }) => {
  const r = await page.evaluate(async () => {
    await saveCustomClip('restEnd', _song, 0, 1, 'bell.wav');
    let beeps = 0; restBeep = () => { beeps++; };
    state.restCues = { ...(state.restCues || {}), enabled: true, audio: true, voice: false };
    restCueFire('end', 0, 0);
    await removeCustomClip('restEnd');
    restCueFire('end', 0, 0);
    await new Promise(res => setTimeout(res, 450));          // the triad's 2nd and 3rd notes are scheduled
    return { beeps };
  });
  expect(r.beeps).toBe(3);                                // only the second (clip-less) end cue beeped its triad
});
