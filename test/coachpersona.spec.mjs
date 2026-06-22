// feat 296 — coach personalities: the spoken coach is now a selectable persona with its own voice profile
// (pitch/rate) AND phrasing flavour over the key cues. 'neutral' leaves the device voice untouched; the rest each
// reshape the words (e.g. the Drill Sergeant shouts, the Hype Coach hypes).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof COACH_PERSONAS !== 'undefined' && typeof activeCoachPersona === 'function'
    && typeof coachPhrase === 'function' && typeof coachify === 'function' && typeof selectCoachPersona === 'function', null, { timeout: 15000 });
});

test('feat 296 — the persona registry is well-formed (≥6, unique ids, neutral + gruff present)', async ({ page }) => {
  const r = await page.evaluate(() => ({
    count: COACH_PERSONAS.length,
    uniq: new Set(COACH_PERSONAS.map(p => p.id)).size,
    wellFormed: COACH_PERSONAS.every(p => p.id && p.name && p.emoji && p.sample),
    hasNeutral: !!COACH_PERSONAS.find(p => p.id === 'neutral'),
    hasGruff: !!COACH_PERSONAS.find(p => p.id === 'gruff'),
    extras: COACH_PERSONAS.filter(p => p.id !== 'neutral' && p.id !== 'gruff').length,
  }));
  expect(r.count).toBeGreaterThanOrEqual(6);
  expect(r.uniq).toBe(r.count);
  expect(r.wellFormed).toBe(true);
  expect(r.hasNeutral).toBe(true);
  expect(r.hasGruff).toBe(true);
  expect(r.extras).toBeGreaterThanOrEqual(4);   // more than just neutral + gruff
});

test('feat 296 — each persona applies its own pitch/rate via coachify (neutral untouched)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const profile = (id) => {
      selectCoachPersona(id);
      const u = new SpeechSynthesisUtterance('x'); u.rate = 0.95; coachify(u);
      return { pitch: u.pitch, rate: u.rate };
    };
    return { neutral: profile('neutral'), gruff: profile('gruff'), hype: profile('hype'), sergeant: profile('sergeant') };
  });
  expect(r.neutral.pitch).toBe(1);                        // system voice untouched (ttsVoice='system')
  expect(r.neutral.rate).toBeCloseTo(0.95, 4);            // …caller's rate left as-is
  expect(r.gruff.pitch).toBeCloseTo(0.8, 5);
  expect(r.hype.pitch).toBeGreaterThan(1.1);              // higher + faster
  expect(r.hype.rate).toBeGreaterThan(1.05);
  expect(r.sergeant.pitch).toBeLessThan(0.85);
});

test('feat 296 — coachPhrase reshapes the cue wording per persona', async ({ page }) => {
  const r = await page.evaluate(() => {
    const phr = (id, kind, base, ctx) => { state.coachPersona = id; return coachPhrase(kind, base, ctx); };
    return {
      neutralStart: phr('neutral', 'setStart', 'Last set'),
      gruffStart: phr('gruff', 'setStart', 'Last set'),
      hypeStart: phr('hype', 'setStart', 'Last set'),
      sergeantStart: phr('sergeant', 'setStart', 'Last set'),
      sergeantWork: phr('sergeant', 'hiitWork', 'Work — Burpee', { ex: 'Burpee' }),
      hypeWork: phr('hype', 'hiitWork', 'Work — Burpee', { ex: 'Burpee' }),
      zenRest: phr('zen', 'hiitRest', 'Rest'),
      analystGo: phr('analyst', 'go', 'Go'),
    };
  });
  expect(r.neutralStart).toBe('Last set');                 // neutral keeps the base wording
  expect(r.gruffStart).toBe('Last set');                   // gruff: voice only, base wording
  expect(r.hypeStart).toContain('Last set');
  expect(r.hypeStart).not.toBe('Last set');                // …but reshaped
  expect(r.sergeantStart).toBe('LAST SET, MOVE!');         // shouts
  expect(r.sergeantWork).toContain('BURPEE');
  expect(r.hypeWork).toContain('Burpee');
  expect(r.zenRest).toMatch(/breath/i);
  expect(r.analystGo).toBe('Execute.');
});

test('feat 296 — the settings persona picker renders pills and selecting one persists + syncs the voice mode', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sound = { ...(state.sound || {}), audio: false }; // keep the preview silent in the test
    renderSettingsDrawer();
    const body = document.getElementById('settings-drawer-body');
    const pills = body.querySelectorAll('[data-coach-persona]').length;
    body.querySelector('[data-coach-persona="zen"]').click();
    const afterZen = { persona: state.coachPersona, voice: state.ttsVoice, active: !!document.querySelector('[data-coach-persona="zen"].active') };
    document.querySelector('[data-coach-persona="neutral"]').click();
    const persisted = JSON.parse(localStorage.getItem('overload_tracker_v2'));
    return { pills, afterZen, persistedPersona: persisted.coachPersona, persistedVoice: persisted.ttsVoice, inKeys: SETTINGS_KEYS.includes('coachPersona') };
  });
  expect(r.pills).toBeGreaterThanOrEqual(6);
  expect(r.afterZen.persona).toBe('zen');
  expect(r.afterZen.voice).toBe('auto');     // a non-neutral persona uses the coach voice pick
  expect(r.afterZen.active).toBe(true);      // the picked pill re-renders active
  expect(r.persistedPersona).toBe('neutral');
  expect(r.persistedVoice).toBe('system');   // neutral ⇒ system voice
  expect(r.inKeys).toBe(true);
});

test('feat 297 — each persona auto-picks a logical default voice; explicit + system per-coach choices win', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fake = [
      { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true, default: false, voiceURI: 'david' },
      { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true, default: true, voiceURI: 'zira' },
      { name: 'Daniel', lang: 'en-GB', localService: true, default: false, voiceURI: 'daniel' },
    ];
    window.speechSynthesis.getVoices = () => fake;
    state.coachVoices = {}; _coachVoice = null;
    const auto = (id) => { const p = coachPersona(id); const v = coachVoiceFor(p); return v && v.name; };
    const gruffAuto = auto('gruff');        // deep male bias → David/Daniel (male), never Zira
    const zenAuto = auto('zen');            // softer bias → leans to the female-named Zira
    state.coachVoices = { gruff: 'zira' };  // explicit per-coach override
    const gruffExplicit = coachVoiceFor(coachPersona('gruff')).name;
    state.coachVoices = { gruff: 'system' }; // per-coach "device default"
    const gruffSystem = coachVoiceFor(coachPersona('gruff'));
    return { gruffAuto, zenAuto, gruffExplicit, gruffSystem };
  });
  expect(r.gruffAuto).toMatch(/David|Daniel/);   // a male voice for the gruff coach
  expect(r.gruffAuto).not.toMatch(/Zira/);
  expect(r.zenAuto).toMatch(/Zira/);             // the softer-biased default differs from gruff
  expect(r.gruffExplicit).toMatch(/Zira/);       // explicit per-coach voice is honored
  expect(r.gruffSystem).toBeNull();              // 'system' ⇒ device default (no override)
});

test('feat 297 — the settings show a per-coach voice picker for the active persona; choosing one persists', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sound = { ...(state.sound || {}), audio: false };
    const fake = [{ name: 'Microsoft David', lang: 'en-US', localService: true, default: false, voiceURI: 'david' }];
    window.speechSynthesis.getVoices = () => fake;
    state.coachPersona = 'gruff'; state.coachVoices = {};
    renderSettingsDrawer();
    const body = document.getElementById('settings-drawer-body');
    const hasSelect = !!body.querySelector('#coach-voice-select');
    const optionVals = [...body.querySelectorAll('#coach-voice-select option')].map(o => o.value);
    setCoachVoice('gruff', 'david');
    const persisted = (JSON.parse(localStorage.getItem('overload_tracker_v2')).coachVoices || {}).gruff;
    // neutral persona shows no select (it uses the system voice)
    selectCoachPersona('neutral');
    const neutralHasSelect = !!document.getElementById('coach-voice-select');
    return { hasSelect, optionVals, persisted, neutralHasSelect, inKeys: SETTINGS_KEYS.includes('coachVoices') };
  });
  expect(r.hasSelect).toBe(true);
  expect(r.optionVals).toContain('auto');
  expect(r.optionVals).toContain('system');
  expect(r.optionVals).toContain('david');
  expect(r.persisted).toBe('david');
  expect(r.neutralHasSelect).toBe(false);   // neutral has no per-coach voice (system default)
  expect(r.inKeys).toBe(true);
});

test('feat 296 — coachPersona migrates from the legacy ttsVoice toggle', async ({ page }) => {
  const r = await page.evaluate(() => {
    delete state.coachPersona; state.ttsVoice = 'system'; normalizeState();
    const fromSystem = state.coachPersona;
    delete state.coachPersona; state.ttsVoice = 'auto'; normalizeState();
    const fromAuto = state.coachPersona;
    return { fromSystem, fromAuto };
  });
  expect(r.fromSystem).toBe('neutral');
  expect(r.fromAuto).toBe('gruff');
});
