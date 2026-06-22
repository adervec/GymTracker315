// feat 210 — the gruff coach TTS voice: by default every spoken cue (annunciations, Mantranome,
// tip narration) uses a deeper male English voice (ranked heuristics over getVoices()) at pitch 0.8.
// state.ttsVoice: 'auto' (default, the coach pick) | 'system' (device default untouched).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coachify === 'function' && typeof pickCoachVoice === 'function', null, { timeout: 15000 });
});

test('ttsVoice defaults to auto (a settings key), and coachify deepens the pitch', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const def = state.ttsVoice;
    const u = new SpeechSynthesisUtterance('x');
    const before = u.pitch;
    coachify(u);
    const coachPitch = u.pitch;
    state.coachPersona = 'neutral'; state.ttsVoice = 'system'; // feat 303 — the neutral persona is the source of truth for "system/untouched"
    const u2 = new SpeechSynthesisUtterance('x');
    coachify(u2);
    const systemPitch = u2.pitch;
    state.coachPersona = 'gruff'; state.ttsVoice = 'auto';
    return { def, before, coachPitch, systemPitch, inKeys: SETTINGS_KEYS.includes('ttsVoice') };
  });
  expect(r.def).toBe('auto');
  expect(r.before).toBe(1);        // utterance default
  expect(r.coachPitch).toBeCloseTo(0.8, 5); // the coach profile deepens it
  expect(r.systemPitch).toBe(1);   // 'system' leaves the utterance untouched
  expect(r.inKeys).toBe(true);
});

test('pickCoachVoice prefers a deep male English voice and shuns female-named ones', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fake = [
      { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true, default: true, voiceURI: 'zira' },
      { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true, default: false, voiceURI: 'david' },
      { name: 'Google Deutsch', lang: 'de-DE', localService: false, default: false, voiceURI: 'de' },
    ];
    window.speechSynthesis.getVoices = () => fake;   // shadow the native getter
    _coachVoice = null;
    const pick = pickCoachVoice();
    const cached = coachVoice();
    _coachVoice = null;
    return { pick: pick && pick.name, cached: cached && cached.name };
  });
  expect(r.pick).toMatch(/David/);    // male beats the female-named default
  expect(r.cached).toMatch(/David/);  // coachVoice() resolves + caches the same pick
});

test('a per-coach explicit voice wins; the persona picker switches voice mode (feat 296/297)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fake = [
      { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true, default: false, voiceURI: 'david' },
      { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true, default: true, voiceURI: 'zira' },
    ];
    window.speechSynthesis.getVoices = () => fake;
    state.coachPersona = 'gruff'; state.coachVoices = { gruff: 'zira' }; _coachVoice = null;  // explicit per-coach override
    const overridden = coachVoice();
    state.coachVoices = {}; _coachVoice = null;
    renderSettingsDrawer();
    const has = document.body.innerHTML.includes('Coach personality');
    document.querySelector('[data-coach-persona="neutral"]').click();   // neutral → device voice untouched
    const sys = { persona: state.coachPersona, voice: state.ttsVoice };
    document.querySelector('[data-coach-persona="gruff"]').click();      // back to the gruff coach
    const coach = { persona: state.coachPersona, voice: state.ttsVoice };
    return { overridden: overridden && overridden.name, has, sys, coach };
  });
  expect(r.overridden).toMatch(/Zira/);  // the per-coach voice override is honored verbatim
  expect(r.has).toBe(true);
  expect(r.sys).toEqual({ persona: 'neutral', voice: 'system' });   // neutral persona ⇒ system voice untouched
  expect(r.coach).toEqual({ persona: 'gruff', voice: 'auto' });
});

test('all three speech paths run through coachify (annunce, Mantranome, tips)', async ({ page }) => {
  const pitches = await page.evaluate(() => {
    normalizeState();
    state.ttsVoice = 'auto';
    state.sound = { ...state.sound, audio: true, volume: 1 };
    state.audioHeadphonesOnly = false;
    const seen = [];
    const RealU = window.SpeechSynthesisUtterance;
    // capture every utterance the app builds
    window.SpeechSynthesisUtterance = function (t) { const u = new RealU(t); seen.push(u); return u; };
    annunce('cue');                                   // path 1 — annunciations
    let ex = null; for (const [u] of VAR_INDEX) { if (collectExerciseTips(u).length) { ex = u; break; } }
    pending.varUuid = ex; _metroMantraIdx = 0; _metroSpeaking = false;
    metroSpeakNextTip();                              // path 2 — Mantranome
    state.ttsTips = true; speakRandomTip(ex);         // path 3 — tip narration
    window.SpeechSynthesisUtterance = RealU;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    _annDuckOff(); _metroSpeaking = false; pending.varUuid = null;
    return seen.map(u => u.pitch);
  });
  expect(pitches.length).toBe(3);
  for (const p of pitches) expect(p).toBeCloseTo(0.8, 5); // every path got the coach profile
});
