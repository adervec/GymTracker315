// feat 304 — per-variation "podcast bite": a 30-60s spoken brief on the specific variation (lore/family,
// setup, technique, what makes it unique), in the voice of the coach that best fits the movement. Reuses the
// feat-274 podcast player with its own segments + a per-podcast persona.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const BENCH = '239a5594-2c8b-40c8-a19c-dd8cfa8b58f8';   // Barbell Flat Bench Press (barbell compound → sergeant)
const PREACHER = 'b1a1000b-000b-400b-800b-aaaaaaaa000b'; // Preacher Curl Machine (machine curl → analyst)

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof variationCoachPersona === 'function' && typeof variationPodcast === 'function'
    && typeof startVariationPodcast === 'function' && typeof coachifyAs === 'function', null, { timeout: 15000 });
});

test('variationCoachPersona maps movements to a fitting coach', async ({ page }) => {
  const r = await page.evaluate(({ BENCH, PREACHER }) => {
    const byMega = (mega) => { for (const [u, i] of VAR_INDEX) if ((i.family.mega || '').toLowerCase() === mega) return u; return null; };
    const cardio = byMega('conditioning') || byMega('cardio');
    const core = byMega('core');
    return {
      bench: variationCoachPersona(BENCH),
      preacher: variationCoachPersona(PREACHER),
      cardio: cardio ? variationCoachPersona(cardio) : 'hype',
      core: core ? variationCoachPersona(core) : 'zen',
    };
  }, { BENCH, PREACHER });
  expect(r.bench).toBe('sergeant');   // heavy barbell compound
  expect(r.preacher).toBe('analyst'); // machine isolation
  expect(r.cardio).toBe('hype');
  expect(r.core).toBe('zen');
});

test('variationPodcast builds a tight, on-topic, persona-framed brief', async ({ page }) => {
  const r = await page.evaluate(({ BENCH }) => {
    const built = variationPodcast(BENCH);
    const text = built.segs.map(s => s.text).join(' ');
    return {
      persona: built.persona,
      title: built.title,
      segCount: built.segs.length,
      firstLabel: built.segs[0].label,
      mentionsTitle: /bench/i.test(built.segs[0].text),
      words: text.split(/\s+/).filter(Boolean).length,
      hasSetup: built.segs.some(s => s.label === 'Setup'),
      hasTechnique: built.segs.some(s => s.label === 'Technique'),
    };
  }, { BENCH });
  expect(r.persona).toBe('sergeant');
  expect(r.firstLabel).toBe(r.title);
  expect(r.mentionsTitle).toBe(true);
  expect(r.segCount).toBeGreaterThanOrEqual(2);
  expect(r.words).toBeGreaterThan(35);    // a real brief…
  expect(r.words).toBeLessThan(260);      // …but still ~30-60s, not a monologue
});

test('startVariationPodcast drives the shared player with the movement’s coach', async ({ page }) => {
  const r = await page.evaluate(({ BENCH }) => {
    state.sound = { ...(state.sound || {}), audio: true, volume: 1 };
    state.audioHeadphonesOnly = false;
    startVariationPodcast(BENCH);
    const out = _glossPod ? { kind: _glossPod.kind, persona: _glossPod.persona, segs: _glossPod.segs.length, title: _glossPod.title } : null;
    if (typeof _podStop === 'function') _podStop(); // clean up the running pod
    return out;
  }, { BENCH });
  expect(r).not.toBeNull();
  expect(r.kind).toBe('variation');
  expect(r.persona).toBe('sergeant');
  expect(r.segs).toBeGreaterThanOrEqual(2);
});

test('coachifyAs applies a specific persona’s profile (independent of the active one)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.coachPersona = 'neutral'; // active = system voice
    const u1 = {}; coachifyAs(u1, 'sergeant'); // explicit flavored persona → profile applied
    const u2 = {}; coachifyAs(u2, 'neutral');  // system persona → untouched
    return { sergeantPitch: u1.pitch, neutralPitch: u2.pitch };
  });
  expect(typeof r.sergeantPitch).toBe('number');
  expect(r.neutralPitch).toBeUndefined();
});

test('the log-sets sheet exposes a 🎧 Brief button', async ({ page }) => {
  const has = await page.evaluate(() => {
    const u = (() => { for (const [x] of VAR_INDEX) if (exMode(x).mode === 'standard') return x; })();
    state.sessions = [];
    modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
    pending = { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }] };
    renderModal();
    return !!document.getElementById('trk-podcast-btn');
  });
  expect(has).toBe(true);
});
