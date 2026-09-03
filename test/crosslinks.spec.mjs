// feat 497 — the cross-link refresh. Feats 454-496 added whole families (sliders, roman chair, pilates,
// gymnastics core, specialty implements/bars, pin lifts, equipment hacks, climbing, ATG) whose movements ARE
// a base pattern performed on a different apparatus, but none of them were cross-listed, so a plan step for
// the base movement never offered them. Same rule as feat 453: ADDITIVE — nothing is suppressed, the
// variation stays in its own family and also answers the base movement's step.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

// one representative per newly-swept family: [homeFamily, variationId, baseMovement]
const CASES = [
  ['slider-work', 'slider-hamstring-curl', 'leg-curl'],
  ['slider-work', 'slider-chest-fly', 'chest-fly'],
  ['slider-work', 'slider-reverse-lunge', 'lunge'],
  ['roman-chair', 'ghd-sit-up', 'abs-dynamic'],
  ['roman-chair', 'roman-single-leg-back-ext', 'back-extension'],
  ['roman-chair', 'roman-russian-twist', 'obliques'],
  ['roman-chair', 'roman-hip-thrust', 'hip-thrust'],
  ['pilates-mat', 'pilates-teaser', 'abs-dynamic'],
  ['gymnastics-core', 'l-sit', 'core-stability'],
  ['gymnastics-core', 'arch-hold', 'back-extension'],
  ['climbing', 'hangboard-half-crimp', 'grip-training'],
  ['specialty-bars', 'cambered-bar-squat', 'squat'],
  ['specialty-implements', 'expander-curl', 'bicep-curl'],
  ['pin-lifts', 'rack-pull-from-knee', 'deadlift'],
  ['equipment-hacks', 'smith-inverted-row', 'row'],
  ['equipment-hacks', 'tibialis-leg-extension', 'tibialis'],
  ['atg-knees-over-toes', 'atg-split-squat', 'lunge'],
  ['serratus-scap', 'push-up-plus', 'push-ups'],
  ['plyo-advanced', 'skater-jump', 'plyometrics'],
  ['hyrox', 'hyrox-farmers-carry', 'loaded-carries'],
];

// base movements that carried NO cross-links at all before feat 497
const NEWLY_LINKED = ['obliques', 'leg-extension', 'tibialis', 'calf-raise', 'pull-up', 'dips',
  'lat-pulldown', 'rower', 'plyometrics', 'treadmill', 'neck-training'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof FAMILIES !== 'undefined' && typeof optionMatchesVar === 'function'
    && typeof secondaryParentsOf === 'function' && typeof secondaryVarsForFamily === 'function',
  null, { timeout: 15000 });
});

test('feat 497 — a swept variation answers the base movement step AND stays in its own family', async ({ page }) => {
  const rows = await page.evaluate((cases) => cases.map(([fam, id, base]) => {
    const f = FAMILIES.find(x => x.id === fam);
    const v = f && (f.variations || []).find(x => x.id === id);
    if (!v) return { spec: fam + '/' + id, err: 'missing variation' };
    return {
      spec: fam + '/' + id, base,
      secondaries: secondaryParentsOf(v.uuid),
      matchesBase: optionMatchesVar({ type: 'movement', familyId: base }, v.uuid),
      matchesHome: optionMatchesVar({ type: 'movement', familyId: fam }, v.uuid),
      stillVisible: varVisibleInPicker(f, v),   // additive: never suppressed from its home family
      inBaseSecondary: secondaryVarsForFamily(base).some(s => s.uuid === v.uuid),
    };
  }), CASES);
  rows.forEach(r => {
    expect(r.err, r.spec).toBeUndefined();
    expect(r.secondaries, r.spec).toContain(r.base);
    expect(r.matchesBase, r.spec + ' must satisfy a ' + r.base + ' plan step').toBe(true);
    expect(r.matchesHome, r.spec + ' must still satisfy its own family step').toBe(true);
    expect(r.stillVisible, r.spec + ' cross-linking is additive, not a suppression').toBe(true);
    expect(r.inBaseSecondary, r.spec + ' must list under ' + r.base).toBe(true);
  });
});

test('feat 497 — the base movements that had no cross-links now have some', async ({ page }) => {
  const counts = await page.evaluate((bases) => bases.map(b => ({
    base: b, n: secondaryVarsForFamily(b).length, known: !!FAMILIES.find(f => f.id === b),
  })), NEWLY_LINKED);
  counts.forEach(c => {
    expect(c.known, c.base + ' must be a real family').toBe(true);
    expect(c.n, c.base + ' should carry cross-links after feat 497').toBeGreaterThan(0);
  });
});

test('feat 497 — a Back Extension plan step now offers the roman chair and reverse-hyper work', async ({ page }) => {
  const r = await page.evaluate(() => {
    const set = stepQualifyingVarSet({ options: [{ type: 'movement', familyId: 'back-extension' }] });
    const roman = FAMILIES.find(f => f.id === 'roman-chair');
    const pick = id => (roman.variations.find(v => v.id === id) || {}).uuid;
    return {
      bwBackExt: set.has(pick('roman-back-ext-bw')),
      romanReverseHyper: set.has(pick('roman-reverse-hyper')),
      twisting: set.has(pick('roman-twisting-back-ext')),
      // a roman chair SIT-UP is abs work, not a back extension — it must not leak into this step
      sitUpExcluded: !set.has(pick('roman-sit-up')),
    };
  });
  expect(r.bwBackExt).toBe(true);
  expect(r.romanReverseHyper).toBe(true);
  expect(r.twisting).toBe(true);
  expect(r.sitUpExcluded).toBe(true);
});
