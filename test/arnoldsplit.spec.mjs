// feat 510 — the Arnold press was one entry whose own reference said "Seated or standing", so seated and
// standing sets shared one progression line even though standing costs far more trunk and leg stability.
// Split as two SEPARATE variations: the existing entry keeps its uuid (every logged set stays put) and becomes
// the easier "Seated Arnold Press" — per the user's rule that the one already done is the EASIER one — and a
// new "Standing Arnold Press" joins it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const SEATED = 'd8b5c9a7-1f6c-4173-bc92-ef3a40517915';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof exercises !== 'undefined' && typeof autoSetupKind === 'function', null, { timeout: 15000 });
});

const standing = (page) => page.evaluate(() => {
  const f = FAMILIES.find(x => x.id === 'shoulder-press');
  const v = f.variations.find(x => x.id === 'standing-arnold-press');
  return v ? v.uuid : null;
});

test('feat 510 — the existing entry keeps its uuid and becomes the seated one', async ({ page }) => {
  const r = await page.evaluate((SEATED) => {
    const i = VAR_INDEX.get(SEATED);
    const ref = exercises.find(e => e.id === 'shoulder-press').variations.find(v => v.uuid === SEATED);
    return { fam: i && i.family.id, title: i && i.variation.title, id: i && i.variation.id,
      refTitle: ref && ref.title, refSetup: ref ? ref.setup.join(' ') : '' };
  }, SEATED);
  expect(r.fam).toBe('shoulder-press');
  expect(r.id, 'same id, so every plan option and cross-link still resolves').toBe('arnold-press');
  expect(r.title).toBe('Seated Arnold Press');
  expect(r.refTitle).toBe('Seated Arnold Press');
  expect(r.refSetup, 'the reference no longer says "seated or standing"').not.toMatch(/seated or standing/i);
  expect(r.refSetup).toMatch(/back against the pad/i);
});

test('feat 510 — old logged sets stay with the seated entry', async ({ page }) => {
  const r = await page.evaluate((SEATED) => {
    state.sessions = [{ id: 'h', date: new Date(Date.now() - 86400000).toISOString(),
      exercises: [{ varUuid: SEATED, subUuid: null, sets: [{ w: 20, r: 10 }], topSet: { w: 20, r: 10 } }] }];
    return { name: displayName(SEATED, null), hist: getHistoryByKey(SEATED, null).length };
  }, SEATED);
  expect(r.name).toBe('Seated Arnold Press');   // history now reads as the seated lift it was
  expect(r.hist).toBe(1);
});

test('feat 510 — the standing Arnold press is a real, separate, trackable variation', async ({ page }) => {
  const u = await standing(page);
  expect(u, 'standing-arnold-press exists in the shoulder-press family').not.toBeNull();
  const r = await page.evaluate(({ u, SEATED }) => {
    const i = VAR_INDEX.get(u);
    const ref = exercises.find(e => e.id === 'shoulder-press').variations.find(v => v.uuid === u);
    return { title: i.variation.title, fam: i.family.id, distinct: u !== SEATED,
      kind: autoSetupKind(u), seatedKind: autoSetupKind(SEATED), mode: exMode(u).mode,
      hasRef: !!ref, refTip: ref ? ref.tip : '', motion: typeof motionForVariation === 'function' ? !!motionForVariation(u) : true };
  }, { u, SEATED });
  expect(r.title).toBe('Standing Arnold Press');
  expect(r.fam).toBe('shoulder-press');
  expect(r.distinct, 'its own uuid, so the two never share a progression line').toBe(true);
  expect(r.kind, 'a dumbbell lift — not the family\'s barbell loader (the original Arnold-press bug)').toBe('dumbbell');
  expect(r.kind).toBe(r.seatedKind);
  expect(r.mode).toBe('standard');
  expect(r.hasRef, 'documented in the reference').toBe(true);
  expect(r.refTip).toMatch(/harder than the seated/i);
  expect(r.motion, 'draws a motion figure').toBe(true);
});

test('feat 510 — both are offered under the same movement, and search finds each', async ({ page }) => {
  const r = await page.evaluate(() => {
    Object.assign(modalState, { pickerMega: 'all', pickerSub: 'all', pickerEquip: 'all', pickerFavOnly: false,
      pickerExplored: 'all', pickerVolStatus: 'all', pickerTrend: 'all', pickerRecent: 'all', pickerMode: 'all',
      planStepFilter: null });
    const titles = (q) => { modalState.pickerSearch = q; const out = [];
      filterVariations().forEach(g => g.variations.forEach(v => out.push(v.title))); return out; };
    return { arnold: titles('arnold'), seated: titles('seated arnold'), standing: titles('standing arnold') };
  });
  expect(r.arnold).toEqual(expect.arrayContaining(['Seated Arnold Press', 'Standing Arnold Press']));
  expect(r.seated).toContain('Seated Arnold Press');
  expect(r.standing).toContain('Standing Arnold Press');
});
