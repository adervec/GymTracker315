// feat 198 — the Freemotion dual-cable chest fly was missing. Two trackable variations join the
// chest-fly family via EXTRA_VARIATIONS: the standard seated fly and the half-dome-on-seat setup
// (unstable surface — lighter load, more core). Both are mirrored into the Reference dataset.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const FLY = 'f8ee0001-0001-4001-8001-000000000001';      // Freemotion Cable Chest Fly
const DOME = 'f8ee0002-0002-4002-8002-000000000002';     // Freemotion Chest Fly — Half-Dome Seat

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && typeof varVisibleInPicker === 'function', null, { timeout: 15000 });
});

test('both Freemotion fly variations are injected, indexed and loggable', async ({ page }) => {
  const r = await page.evaluate(({ FLY, DOME }) => {
    const fam = FAMILIES.find(f => f.id === 'chest-fly');
    const fly = VAR_INDEX.get(FLY), dome = VAR_INDEX.get(DOME);
    const inFam = (u) => !!(fam && fam.variations.some(v => v.uuid === u));
    return {
      flyTitle: fly ? fly.variation.title : null,
      domeTitle: dome ? dome.variation.title : null,
      famHasBoth: inFam(FLY) && inFam(DOME),
      sameFamily: !!(fly && dome && fly.family.id === 'chest-fly' && dome.family.id === 'chest-fly'),
      flyMode: fly ? exMode(FLY).mode : null,
      domeMode: dome ? exMode(DOME).mode : null,
      pickable: !!(fam && fam.variations.filter(v => [FLY, DOME].includes(v.uuid)).every(v => varVisibleInPicker(fam, v))),
    };
  }, { FLY, DOME });
  expect(r.flyTitle).toBe('Freemotion Cable Chest Fly');
  expect(r.domeTitle).toBe('Freemotion Chest Fly — Half-Dome Seat');
  expect(r.famHasBoth).toBe(true);          // attached to the chest-fly family
  expect(r.sameFamily).toBe(true);
  expect(r.flyMode).toBe('standard');       // weight × reps logging
  expect(r.domeMode).toBe('standard');
  expect(r.pickable).toBe(true);            // both pass the picker visibility gate
});

test('the Reference dataset documents both (full setup / movement / mistakes detail)', async ({ page }) => {
  const r = await page.evaluate(({ FLY, DOME }) => {
    const ex = exercises.find(e => e.id === 'chest-fly');
    const get = (u) => ex && ex.variations.find(v => v.uuid === u);
    const fly = get(FLY), dome = get(DOME);
    const full = (v) => !!(v && v.cue && (v.setup || []).length >= 2 && (v.movement || []).length >= 2 && (v.mistakes || []).length >= 2 && v.tip);
    return { flyFull: full(fly), domeFull: full(dome), domeMentionsDome: !!(dome && /dome/i.test(dome.cue + dome.setup.join(' '))) };
  }, { FLY, DOME });
  expect(r.flyFull).toBe(true);
  expect(r.domeFull).toBe(true);
  expect(r.domeMentionsDome).toBe(true); // the half-dome setup is actually described
});
