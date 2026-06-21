// feat 301 — a hack squat SATISFIES a 'squat' plan step (it's a squat movement pattern) without counting
// toward the BARBELL squat achievement. Implemented as an additive secondary-parent cross-listing (feat 167):
// the hack-squat variants keep leg-press as their primary but are cross-listed under the squat movement, so
// optionMatchesVar / stepQualifyingVarSet accept them for a squat step. The achievement exclusion is a
// separate, name-regex mechanism (feat 253) and is unchanged.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const HACK = '5d630c7c-26fd-4cab-a033-3c5c6640956b';        // Hack Squat (primary: leg-press)
const HACK_HIGH = 'b1a10003-0003-4003-8003-aaaaaaaa0003';  // Hack Squat — High & Wide Feet (extra-injected)

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof optionMatchesVar === 'function' && typeof stepQualifyingVarSet === 'function'
    && typeof secondaryParentsOf === 'function' && typeof ACHIEVEMENT_PATHS !== 'undefined', null, { timeout: 15000 });
});

test('hack squat satisfies a squat plan step but keeps leg-press as its primary', async ({ page }) => {
  const r = await page.evaluate(({ HACK }) => {
    const info = VAR_INDEX.get(HACK);
    return {
      primary: info ? info.family.id : null,
      secondaries: secondaryParentsOf(HACK),
      matchesSquat: optionMatchesVar({ type: 'movement', familyId: 'squat' }, HACK),
      inSquatStepSet: stepQualifyingVarSet({ options: [{ type: 'movement', familyId: 'squat' }] }).has(HACK),
      stillMatchesLegPress: optionMatchesVar({ type: 'movement', familyId: 'leg-press' }, HACK),
    };
  }, { HACK });
  expect(r.primary).toBe('leg-press');     // unchanged — it still lives in leg-press
  expect(r.secondaries).toContain('squat');
  expect(r.matchesSquat).toBe(true);       // a squat plan step is now satisfied by a hack squat
  expect(r.inSquatStepSet).toBe(true);     // and a squat step offers it as a qualifying choice
  expect(r.stillMatchesLegPress).toBe(true);
});

test('the extra-injected foot-placement hack squat is also cross-listed (runs after applyExtraVariations)', async ({ page }) => {
  const r = await page.evaluate(({ HACK_HIGH }) => ({
    exists: !!VAR_INDEX.get(HACK_HIGH),
    matchesSquat: optionMatchesVar({ type: 'movement', familyId: 'squat' }, HACK_HIGH),
  }), { HACK_HIGH });
  expect(r.exists).toBe(true);
  expect(r.matchesSquat).toBe(true);
});

test('hack squat is STILL excluded from the barbell squat achievement (name-regex, unchanged)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const squat = ACHIEVEMENT_PATHS.find(p => p.id === 'squat-plates');
    return {
      excludesHack: squat.exclude.test('Hack Squat'),
      excludesHackMachine: squat.exclude.test('Hack Squat Machine'),
      keepsBarbell: !squat.exclude.test('Barbell Back Squat') && squat.kw.test('Barbell Back Squat'),
    };
  });
  expect(r.excludesHack).toBe(true);        // the achievement still drops hack squats…
  expect(r.excludesHackMachine).toBe(true);
  expect(r.keepsBarbell).toBe(true);        // …while a real barbell squat still counts
});
