// feat 464 — the Cuban press. Three movements in one rep: high pull → external rotation → overhead press.
// The middle third is the point, so it lives in `rotator-cuff` (the cuff is the limiter) and the pressing
// variants cross-link into Shoulder Press rather than the other way round.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof CUBAN_ROWS !== 'undefined' && typeof VAR_INDEX !== 'undefined'
    && VAR_INDEX.size > 0 && typeof secondaryParentsOf === 'function', null, { timeout: 15000 });
});

const IDS = ['cuban-rotation-db', 'cuban-press-db', 'cuban-press-prone', 'cuban-press-ez',
  'cuban-press-cable', 'cuban-press-single-arm', 'cuban-press-half-kneeling', 'cuban-press-band'];

test('feat 464 — every variant is indexed in Rotator Cuff, documented, and animates', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    const fam = FAMILIES.find(f => f.id === 'rotator-cuff');
    const ref = exercises.find(e => e.id === 'rotator-cuff');
    const bad = [];
    CUBAN_ROWS.forEach((row, i) => {
      const h = (0x242 + i).toString(16).padStart(4, '0');
      const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
      const idx = VAR_INDEX.get(uuid);
      if (!idx || idx.variation.id !== row[0] || idx.family.id !== 'rotator-cuff') { bad.push(row[0] + ' (index)'); return; }
      if (!motionForVariation(uuid)) bad.push(row[0] + ' (no motion)');
      const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
    });
    const have = new Set(fam.variations.map(v => v.id));
    return { bad, rows: CUBAN_ROWS.length, missing: ids.filter(i => !have.has(i)),
      bp: VAR_INDEX.get(fam.variations.find(v => v.id === 'cuban-press-db').uuid).bp,
      visible: ids.every(i => varVisibleInPicker(fam, fam.variations.find(v => v.id === i))),
      inExport: buildReferenceHtml().includes('Cuban Press') };
  }, IDS);
  expect(r.bad).toEqual([]);
  expect(r.rows).toBe(8);
  expect(r.missing).toEqual([]);
  expect(r.bp, 'a cuff exercise is shoulder volume').toBe('shoulders');
  expect(r.visible).toBe(true);
  expect(r.inExport).toBe(true);
});

test('feat 464 — the load picker matches the implement, including a band having none', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    const fam = FAMILIES.find(f => f.id === 'rotator-cuff');
    const u = id => fam.variations.find(v => v.id === id).uuid;
    return Object.fromEntries(ids.map(id => [id, { loader: autoSetupKind(u(id)), mode: exMode(u(id)).mode }]));
  }, IDS);
  expect(r['cuban-press-db'].loader).toBe('dumbbell');
  expect(r['cuban-rotation-db'].loader, 'named DB so it does not inherit the family\'s cable default').toBe('dumbbell');
  expect(r['cuban-press-prone'].loader).toBe('dumbbell');
  expect(r['cuban-press-ez'].loader).toBe('barbell');
  expect(r['cuban-press-cable'].loader).toBe('pin');
  expect(r['cuban-press-band'].loader, 'a band has no loading tool').toBeNull();
  Object.values(r).forEach(v => expect(v.mode).toBe('standard'));
});

test('feat 464 — the pressing variants satisfy a shoulder-press step; the rotation-only one does not', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'rotator-cuff');
    const u = id => fam.variations.find(v => v.id === id).uuid;
    const presses = ['cuban-press-db', 'cuban-press-prone', 'cuban-press-ez', 'cuban-press-cable',
      'cuban-press-single-arm', 'cuban-press-half-kneeling', 'cuban-press-band'];
    return {
      pressesMatch: presses.map(id => ({ id, ok: optionMatchesVar({ type: 'movement', familyId: 'shoulder-press' }, u(id)) })),
      rotationIsNotAPress: optionMatchesVar({ type: 'movement', familyId: 'shoulder-press' }, u('cuban-rotation-db')),
      rearDelt: ['cuban-rotation-db', 'cuban-press-prone'].map(id => ({ id, ok: optionMatchesVar({ type: 'movement', familyId: 'rear-delt' }, u(id)) })),
      homeKept: presses.every(id => VAR_INDEX.get(u(id)).family.id === 'rotator-cuff'),
      cuffStepOffers: optionMatchesVar({ type: 'movement', familyId: 'rotator-cuff' }, u('cuban-press-db')),
    };
  });
  r.pressesMatch.forEach(x => expect(x.ok, x.id + ' is an overhead press').toBe(true));
  expect(r.rotationIsNotAPress, 'the rotation-only teaching version has no press in it').toBe(false);
  r.rearDelt.forEach(x => expect(x.ok, x.id + ' high-pull is rear-delt work').toBe(true));
  expect(r.homeKept, 'cross-linking is additive — the cuff keeps them').toBe(true);
  expect(r.cuffStepOffers).toBe(true);
});

test('feat 464 — the content carries the two things that make this exercise go wrong', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ref = exercises.find(e => e.id === 'rotator-cuff');
    const txt = id => JSON.stringify((ref.variations || []).find(v => v.id === id)).toLowerCase();
    return {
      // 1. the elbows must not drop during the rotation — that is the cue that decides whether it works
      elbowHeight: /elbow/.test(txt('cuban-rotation-db')) && /(dip|drop|same height|staying put|fixed)/.test(txt('cuban-rotation-db')),
      // 2. it must be loaded for the ROTATION, not the press
      lightLoad: /quarter of your press|light/.test(txt('cuban-press-db')),
      cableLoadWarning: /loading it for the press instead of the rotation/.test(txt('cuban-press-cable')),
      // the teaching order is stated: rotation first, then the full lift
      teachingOrder: /rotation-only version first|own the rotation/.test(txt('cuban-press-db')),
      // the strictest variant explains WHY it is strict
      proneNoCheat: /nothing to cheat|chest.*pad|swing/.test(txt('cuban-press-prone')),
      // the asymmetry variant starts on the worse side
      worseSideFirst: /worse side|restricted side/.test(txt('cuban-press-single-arm')),
    };
  });
  Object.entries(r).forEach(([k, v]) => expect(v, k).toBe(true));
});
