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

// feat 578 — several clips per moment, a volume each, clips for any coach line, and recording from the microphone
const wipeClips = (page) => page.evaluate(async () => { for (const k of Object.keys(_clipBufs)) await removeCustomClip(k); _clipTurn = {}; });

test('feat 578 — a moment holds up to five clips, played in turn, each with its own volume', async ({ page }) => {
  await wipeClips(page);
  const r = await page.evaluate(async () => {
    const out = { free: [] };
    for (let i = 0; i < 6; i++) { const k = clipFreeKey('pr'); out.free.push(k); if (k) await saveCustomClip(k, _song, 0, 1 + i * 0.2, 'c' + i + '.mp3'); }
    out.keys = clipKeys('pr'); out.other = clipKeys('progress'); out.has = hasCustomClip('pr');
    const turn = []; for (let i = 0; i < 6; i++) { playCustomClip('pr'); turn.push(Math.round(_clipLastSec * 10) / 10); }
    out.turn = turn;
    await setClipVol('pr#2', 0.4);
    const stored = await _idbReq((await _clipStore('readonly')).get('pr#2'));
    out.vol = [_clipMeta['pr#2'].vol, stored.vol];
    out.exact = playCustomClip('pr#3') && Math.round(_clipLastSec * 10) / 10;
    await removeCustomClip('pr');                        // the first one goes: the rest still play, and its key is free again
    out.afterDel = clipKeys('pr'); out.freeAgain = clipFreeKey('pr'); out.label = clipSlotLabel('pr');
    return out;
  });
  expect(r.free).toEqual(['pr', 'pr#2', 'pr#3', 'pr#4', 'pr#5', null]);       // the sixth has nowhere to go
  expect(r.keys).toEqual(['pr', 'pr#2', 'pr#3', 'pr#4', 'pr#5']);
  expect(r.other).toEqual([]);
  expect(r.has).toBe(true);
  expect(r.turn).toEqual([1, 1.2, 1.4, 1.6, 1.8, 1]);                          // in turn, then round again
  expect(r.vol).toEqual([0.4, 0.4]);                                           // kept in memory and on the device
  expect(r.exact).toBe(1.4);
  expect(r.afterDel).toEqual(['pr#2', 'pr#3', 'pr#4', 'pr#5']);
  expect(r.freeAgain).toBe('pr');
  expect(r.label).toContain('PR set');
  await wipeClips(page);
});

test('feat 578 — the settings rows list each clip with hear, volume and remove; Add and Record while there is room', async ({ page }) => {
  await wipeClips(page);
  const r = await page.evaluate(async () => {
    const el = document.createElement('div');
    el.innerHTML = customSoundsHtml();
    const empty = { rows: el.querySelectorAll('.csnd-slot').length, clips: el.querySelectorAll('.csnd-clip').length, up: el.querySelector('[data-csnd-slot="pr"] [data-csnd-up]').textContent, rec: !!el.querySelector('[data-csnd-slot="pr"] [data-csnd-rec]') };
    await saveCustomClip('pr', _song, 0, 3, 'airhorn.mp3'); await saveCustomClip('pr#2', _song, 0, 2, 'bell.wav');
    el.innerHTML = customSoundsHtml();
    const pr = el.querySelector('[data-csnd-slot="pr"]');
    return { empty, status: pr.querySelector('.csnd-row').textContent, clips: [...pr.querySelectorAll('.csnd-clip .csnd-name')].map(x => x.textContent),
      vols: pr.querySelectorAll('[data-csnd-vol]').length, add: pr.querySelector('[data-csnd-up]').dataset.csndUp, recKey: pr.querySelector('[data-csnd-rec]').dataset.csndRec };
  });
  expect(r.empty).toMatchObject({ rows: 4, clips: 0, up: 'Upload', rec: true });
  expect(r.status).toContain('2 custom clips, played in turn');
  expect(r.clips).toEqual(['3s · airhorn.mp3', '2s · bell.wav']);
  expect(r.vols).toBe(2);
  expect(r.add).toBe('pr#3');                    // the next free place
  expect(r.recKey).toBe('pr#3');
  await wipeClips(page);
});

test('feat 578 — any coach line can be a sound: voice, the clip instead, or the clip and then the voice', async ({ page }) => {
  await wipeClips(page);
  const r = await page.evaluate(async () => {
    window._said = []; window.annunce = (txt) => { window._said.push(String(txt)); };
    state.coachTalk = { ev: {}, minGap: 0, perMin: 0 }; coachMute('off'); _coachSaid = []; _coachLastText = ''; _coachLastAt = 0;
    setCoachEvent('record.new', { on: true });
    const played = []; const real = playCustomClip; window.playCustomClip = (sl) => { const ok = real(sl); if (ok) played.push(sl); return ok; };
    const out = {};
    const fire = async (txt) => { window._said = []; played.length = 0; _coachLastText = ''; _coachLastAt = 0; coachSay('record.new', txt); await new Promise(res => setTimeout(res, 1500)); return { said: window._said.slice(), played: played.slice() }; };
    setCoachEvent('record.new', { snd: 'clip' });
    out.clipModeNoClip = await fire('A');                      // set to "clip" but none added: the voice still speaks
    await saveCustomClip('ev:record.new', _song, 0, 1, 'yeah.mp3');
    out.clipOnly = await fire('B');
    setCoachEvent('record.new', { snd: 'both' });
    out.both = await fire('C');
    setCoachEvent('record.new', { snd: 'voice' });
    out.voice = await fire('D');
    out.cfg = coachEventCfg('record.new').snd; out.label = clipSlotLabel('ev:record.new');
    window.playCustomClip = real;
    return out;
  });
  expect(r.clipModeNoClip).toEqual({ said: ['A'], played: [] });
  expect(r.clipOnly).toEqual({ said: [], played: ['ev:record.new'] });
  expect(r.both).toEqual({ said: ['C'], played: ['ev:record.new'] });        // the words come after the clip
  expect(r.voice).toEqual({ said: ['D'], played: [] });
  expect(r.cfg).toBe('voice');
  expect(r.label).toContain('New record');
  await wipeClips(page);
});

test('feat 578 — the sound sheet on a coach line picks the sound and manages the clips of that line', async ({ page }) => {
  await wipeClips(page);
  await page.evaluate(() => { state.coachTalk = { ev: {}, minGap: 0, perMin: 0 }; openSettingsDrawer(); });
  await page.waitForSelector('.ct-card [data-ct-snd="set.end"]');
  const r = await page.evaluate(async () => {
    document.querySelector('.ct-card [data-ct-snd="set.end"]').click();
    const sheet = () => [...document.querySelectorAll('.choice-backdrop')].pop();
    const out = { modes: [...sheet().querySelectorAll('[data-cs-mode]')].map(b => b.dataset.csMode), active: sheet().querySelector('[data-cs-mode].active').dataset.csMode,
      slot: sheet().querySelector('.csnd-slot').dataset.csndSlot, rec: !!sheet().querySelector('[data-csnd-rec]') };
    sheet().querySelector('[data-cs-mode="clip"]').click();
    out.saved = coachEventCfg('set.end').snd;
    out.warns = /No clip yet/.test(sheet().textContent);
    await saveCustomClip('ev:set.end', _song, 0, 1, 'ding.wav');
    sheet().querySelector('[data-cs-mode="clip"]').click();            // redraws
    out.listed = sheet().querySelectorAll('.csnd-clip').length; out.warnsAfter = /No clip yet/.test(sheet().textContent);
    sheet().querySelector('[data-cs-close]').click();
    await new Promise(res => setTimeout(res, 350));
    out.lit = document.querySelector('.ct-card [data-ct-snd="set.end"]').classList.contains('active');
    closeSettingsDrawer();
    return out;
  });
  expect(r.modes).toEqual(['voice', 'clip', 'both']);
  expect(r.active).toBe('voice');
  expect(r.slot).toBe('ev:set.end');
  expect(r.rec).toBe(true);
  expect(r.saved).toBe('clip');
  expect(r.warns).toBe(true);               // chosen, but nothing to play yet
  expect(r.listed).toBe(1);
  expect(r.warnsAfter).toBe(false);
  expect(r.lit).toBe(true);                 // the row shows this line has its own sound
  await wipeClips(page);
});

test('feat 578 — recording: press to start, press to stop, and the take opens in the clip editor', async ({ page }) => {
  await wipeClips(page);
  const r = await page.evaluate(async () => {
    // a stand-in microphone and recorder: the take is a short WAV made from the test tone
    const { samples } = await renderClip(_song, 0, 2), wav = encodeWav16(samples, CLIP_RATE);
    let stopped = 0;
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop: () => { stopped++; } }] });
    window.MediaRecorder = class { constructor() { this.mimeType = 'audio/wav'; } start() {} stop() { this.ondataavailable({ data: wav }); this.onstop(); } };
    const btn = document.createElement('button'); document.body.appendChild(btn);
    await recordClip('finish', () => {}, btn);
    const during = { label: btn.textContent, rec: btn.classList.contains('rec'), busy: !!_clipRec };
    await recordClip('finish', () => {}, btn);                     // the second press stops it
    await new Promise(res => setTimeout(res, 600));
    const ed = [...document.querySelectorAll('.choice-backdrop')].pop();
    const out = { during, after: btn.textContent, micReleased: stopped, editor: !!(ed && ed.querySelector('.clip-wave')), title: ed ? ed.querySelector('.choice-title').textContent : '' };
    ed.querySelector('[data-clip="save"]').click();
    await new Promise(res => setTimeout(res, 800));
    out.saved = hasCustomClip('finish'); out.name = (_clipMeta.finish || {}).name;
    btn.remove();
    return out;
  });
  expect(r.during).toEqual({ label: '■ Stop', rec: true, busy: true });
  expect(r.after).toBe('● Record');
  expect(r.micReleased).toBe(1);             // the microphone is let go
  expect(r.editor).toBe(true);
  expect(r.title).toContain('Workout ended');
  expect(r.saved).toBe(true);
  expect(r.name).toBe('Recording');
  await wipeClips(page);
});
