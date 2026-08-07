// feat 466 — the bare weight plate. The catalogue was full of plate-LOADED machines and had only eight
// movements where you actually hold the plate. 51 rows land the rest — deliberately spread across 23
// movement families rather than gathered into one "Plate Work" family, because a variation inherits its
// family's body part and one family would book a plate front raise and a plate squat as the same muscle.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof PLATE_SETS !== 'undefined' && typeof VAR_INDEX !== 'undefined'
    && VAR_INDEX.size > 0 && typeof autoSetupKind === 'function', null, { timeout: 15000 });
});

test('feat 466 — every plate movement is indexed in its declared family, documented and animates', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bad = []; let base = 0x24A, n = 0;
    PLATE_SETS.forEach(([famId, rows]) => {
      const fam = FAMILIES.find(f => f.id === famId);
      if (!fam) { bad.push(famId + ' (no such family)'); base += rows.length; return; }
      const ref = exercises.find(e => e.id === famId);
      rows.forEach((row, i) => {
        n++;
        const h = (base + i).toString(16).padStart(4, '0');
        const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
        const idx = VAR_INDEX.get(uuid);
        if (!idx || idx.variation.id !== row[0] || idx.family.id !== famId) { bad.push(famId + '/' + row[0] + ' (index)'); return; }
        if (!motionForVariation(uuid)) bad.push(row[0] + ' (no motion)');
        if (!varVisibleInPicker(fam, idx.variation)) bad.push(row[0] + ' (hidden in picker)');
        const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
        if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
          || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
        if (!/^Plate |^Single-Arm Plate /.test(row[1])) bad.push(row[0] + ' (title must start with Plate — that is how they are found as a set)');
      });
      base += rows.length;
    });
    const ids = PLATE_SETS.flatMap(([, rows]) => rows.map(r => r[0]));
    return { bad, n, lastSlot: (base - 1).toString(16), dupIds: ids.length - new Set(ids).size,
      fams: PLATE_SETS.length, ref: buildReferenceHtml() };
  });
  expect(r.bad).toEqual([]);
  expect(r.n, 'the full plate set').toBe(51);
  expect(r.fams, 'spread across the families that own the body parts').toBe(23);
  expect(r.dupIds, 'no id reused').toBe(0);
  expect(r.lastSlot, 'slots 0x24a-0x27c — next free 0x27d').toBe('27c');
  ['Plate Halo', 'Plate Thruster', 'Plate Windmill', 'Plate Pinch Carry'].forEach(t =>
    expect(r.ref.includes(t), t + ' missing from the reference export').toBe(true));
});

test('feat 466 — a plate is the loading tool everywhere, and the mode follows the movement', async ({ page }) => {
  const r = await page.evaluate(() => {
    const byId = {};
    PLATE_SETS.forEach(([famId, rows]) => rows.forEach(row => {
      const fam = FAMILIES.find(f => f.id === famId);
      const v = fam.variations.find(x => x.id === row[0]);
      byId[row[0]] = { loader: autoSetupKind(v.uuid), mode: exMode(v.uuid).mode };
    }));
    return byId;
  });
  const notPlate = Object.entries(r).filter(([, v]) => v.loader !== 'plate').map(([k]) => k);
  expect(notPlate, 'you pick which plate you are holding, in every family').toEqual([]);

  // holds are timed, carries are measured in distance, everything else counts reps
  expect(r['plate-front-hold'].mode).toBe('time');
  expect(r['plate-overhead-hold'].mode).toBe('time');
  expect(r['plate-bear-hug-carry'].mode).toBe('distance');
  expect(r['plate-overhead-carry'].mode).toBe('distance');
  expect(r['plate-pinch-carry'].mode).toBe('distance');
  expect(r['plate-front-carry'].mode).toBe('distance');
  expect(r['plate-sled-push'].mode, 'a sled substitute is measured in ground covered').toBe('distance');
  ['plate-curl', 'plate-thruster', 'plate-bear-hug-squat', 'plate-hip-thrust', 'plate-shrug']
    .forEach(id => expect(r[id].mode, id).toBe('standard'));
});

test('feat 466 — body part follows the FAMILY, which is the whole reason there is no plate family', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bp = id => { for (const [, i] of VAR_INDEX) if (i.variation.id === id) return i.bp; return null; };
    const all = new Set();
    PLATE_SETS.forEach(([, rows]) => rows.forEach(row => all.add(bp(row[0]))));
    return { raise: bp('plate-lateral-raise'), squat: bp('plate-bear-hug-squat'), curl: bp('plate-curl'),
      calf: bp('plate-calf-raise'), thrust: bp('plate-hip-thrust'), distinct: all.size, anyNull: all.has(null) };
  });
  expect(r.anyNull).toBe(false);
  expect(r.distinct, 'one plate family would have collapsed these into a single body part').toBeGreaterThan(6);
  expect(r.raise).not.toBe(r.squat);
  expect(r.curl).not.toBe(r.calf);
  expect(r.squat).not.toBe(r.thrust);
});

test('feat 466 — the cross-links resolve, are additive, and satisfy the other family\'s plan step', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = id => { for (const [uuid, i] of VAR_INDEX) if (i.variation.id === id) return uuid; return null; };
    const home = id => VAR_INDEX.get(u(id)).family.id;
    const matches = (fam, id) => optionMatchesVar({ type: 'movement', familyId: fam }, u(id));
    return {
      // a grip-limited curl and a front hold both satisfy a grip step
      gripCurl: matches('grip-training', 'plate-pinch-curl'), gripHold: matches('grip-training', 'plate-front-hold'),
      gluteThrust: matches('glute-accessories', 'plate-hip-thrust'),
      pressThruster: matches('shoulder-press', 'plate-thruster'),
      squatThruster: matches('squat', 'plate-thruster'),
      coreWindmill: matches('core-stability', 'plate-windmill'),
      hingeGM: matches('back-extension', 'plate-good-morning'),
      // additive: the home family keeps them
      homes: { curl: home('plate-pinch-curl'), thrust: home('plate-hip-thrust'), thruster: home('plate-thruster'),
        windmill: home('plate-windmill'), gm: home('plate-good-morning') },
      homeStillOffers: matches('bicep-curl', 'plate-pinch-curl') && matches('hip-thrust', 'plate-hip-thrust'),
      // a plate front raise is NOT a lateral raise, so no accidental blanket cross-link
      notEverything: matches('lateral-raise', 'plate-front-hold'),
    };
  });
  expect(r.gripCurl).toBe(true);
  expect(r.gripHold).toBe(true);
  expect(r.gluteThrust).toBe(true);
  expect(r.pressThruster).toBe(true);
  expect(r.squatThruster, 'a thruster contains a front squat').toBe(true);
  expect(r.coreWindmill).toBe(true);
  expect(r.hingeGM).toBe(true);
  expect(r.homes).toEqual({ curl: 'bicep-curl', thrust: 'hip-thrust', thruster: 'crossfit-moves',
    windmill: 'obliques', gm: 'deadlift' });
  expect(r.homeStillOffers, 'cross-linking is additive').toBe(true);
  expect(r.notEverything, 'cross-links are chosen, not blanket').toBe(false);
});

test('feat 466 — the third copy of the Svend press is folded into the one that was already kept', async ({ page }) => {
  const r = await page.evaluate(() => {
    const KEEP = '32592786-2fd3-4ec7-baf0-8744caca298a';   // chest-fly/svend-press
    const HACK = '73c314b8-1ed7-407d-9c92-bc5b2ec197e1';   // equipment-hacks/plate-press
    const PULL = '54f42acf-91e7-41cd-83d4-663459956d5b';   // pullover/svend-press (folded by feat 462)
    return {
      keepVisible: varVisibleInPicker(VAR_INDEX.get(KEEP).family, VAR_INDEX.get(KEEP).variation),
      hackSuppressed: isSuppressedVar(HACK), pullSuppressed: isSuppressedVar(PULL),
      hackStillResolves: !!displayName(HACK),   // old logged sets must never orphan
      // and the hacks family still offers the movement, so nothing is lost from that page
      hacksStillOffer: optionMatchesVar({ type: 'movement', familyId: 'equipment-hacks' }, KEEP),
      // around-the-world is a DIFFERENT plate movement and must survive untouched
      atwLive: !isSuppressedVar([...VAR_INDEX.keys()].find(k => VAR_INDEX.get(k).variation.id === 'around-the-world')),
    };
  });
  expect(r.keepVisible).toBe(true);
  expect(r.hackSuppressed, 'Plate Press / Svend Press was a third copy of one movement').toBe(true);
  expect(r.pullSuppressed).toBe(true);
  expect(r.hackStillResolves).toBe(true);
  expect(r.hacksStillOffer).toBe(true);
  expect(r.atwLive).toBe(true);
});

test('feat 466 — the cues that decide whether these actually work are in the content', async ({ page }) => {
  const r = await page.evaluate(() => {
    const txt = (fam, id) => {
      const ref = exercises.find(e => e.id === fam);
      return JSON.stringify((ref.variations || []).find(v => v.id === id) || {}).toLowerCase();
    };
    return {
      // a plate loads by lever, not by mass — the content has to say the number lies
      leverWarning: /heavier|bigger ask|far from the hands|lever/.test(txt('front-raise', 'plate-front-hold'))
        && /heavier|feels heavier|start light/.test(txt('bicep-curl', 'plate-curl')),
      // the RDL's entire coaching point is plate-on-thighs contact
      rdlContact: /contact|slide down the thighs|leaves the thighs/.test(txt('deadlift', 'plate-rdl')),
      // an overhead squat with a plate is a screen, not a strength lift
      ohSquatIsAScreen: /mobility|position|restriction/.test(txt('squat', 'plate-overhead-squat')),
      // the side bend only works one side at a time
      sideBendOneSide: /one side at a time|two plates balance|cancels the load/.test(txt('obliques', 'plate-side-bend')),
      // the pinch carry ends when the grip does
      pinchIsGrip: /tilt|smooth/.test(txt('loaded-carries', 'plate-pinch-carry')),
      // the floor push warns about the floor, because plates mark most of them
      floorWarning: /floor|turf|scratch|mark/.test(txt('conditioning', 'plate-sled-push')),
      // sissy squat: hips must not move back or the glutes take over
      sissyHips: /hips (must not|stay)|hips do not move/.test(txt('squat', 'plate-sissy-squat')),
    };
  });
  Object.entries(r).forEach(([k, v]) => expect(v, k).toBe(true));
});
