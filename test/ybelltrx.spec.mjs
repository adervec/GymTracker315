// feat 446 — the YBell as its own family: one tool, four grips (outer = kettlebell, centre =
//   dumbbell, both outer handles inverted = dual-grip med ball, on the floor = push-up stand).
// feat 447 — the rest of the TRX / suspension vocabulary in the existing TRX Work family.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const YBELL = [
  // outer grip — swings, cleans & snatches
  ['Kettlebell Swing', 'yb-swing'], ['Alternating Swing', 'yb-alt-swing'], ['Clean', 'yb-clean'],
  ['Snatch', 'yb-snatch'], ['High Pull', 'yb-high-pull'], ['Deadlift', 'yb-deadlift'],
  // outer grip — squats, presses & get-ups
  ['Clean & Press', 'yb-clean-press'], ['Goblet Squat', 'yb-goblet-squat'],
  ['Front Squat', 'yb-front-squat'], ['Overhead Press', 'yb-overhead-press'],
  ['Push Press', 'yb-push-press'], ['Halo', 'yb-halo'], ['Racked Lunge', 'yb-racked-lunge'],
  ['Turkish Get-Up', 'yb-get-up'], ['Windmill', 'yb-windmill'],
  ['Bottoms-Up Press', 'yb-bottoms-up-press'],
  // centre grip — presses & flys
  ['Dumbbell Press', 'yb-db-press'], ['Arnold Press', 'yb-arnold-press'],
  ['Chest Press', 'yb-chest-press'], ['Chest Fly', 'yb-chest-fly'],
  ['Triceps Extension', 'yb-triceps-extension'],
  // centre grip — rows, curls & raises
  ['Bent-Over Row', 'yb-bent-row'], ['Single-Arm Row', 'yb-single-arm-row'],
  ['Biceps Curl', 'yb-biceps-curl'], ['Hammer Curl', 'yb-hammer-curl'],
  ['Concentration Curl', 'yb-concentration-curl'], ['Lateral Raise', 'yb-lateral-raise'],
  ['Front Raise', 'yb-front-raise'], ['Reverse Fly', 'yb-reverse-fly'], ['Pullover', 'yb-pullover'],
  // under grip — med ball
  ['Med-Ball Press', 'yb-mb-press'], ['Punch Press', 'yb-punch-press'],
  ['Cross-Catch Press', 'yb-cross-catch'], ['Wood Chop', 'yb-wood-chop'],
  ['Rotational Punch', 'yb-rotational-punch'], ['Russian Twist', 'yb-russian-twist'],
  ['Squat to Punch', 'yb-squat-punch'], ['Two-Hand Halo', 'yb-two-hand-halo'],
  ['Around-the-Body', 'yb-around-body'], ['Sit-Up to Press', 'yb-situp-press'],
  // top grip — push-up stand
  ['Push-Up', 'yb-push-up'], ['Single YBell Push-Up', 'yb-single-push-up'],
  ['Push-Up Row', 'yb-push-up-row'], ['Plank', 'yb-plank'],
  ['Pike Push-Up', 'yb-pike-push-up'], ['Spider Push-Up', 'yb-spider-push-up'],
  ['Mountain Climber', 'yb-mountain-climber'], ['Burpee', 'yb-burpee'],
  ['Sit-Up', 'yb-sit-up'], ['Plank Drag', 'yb-plank-drag'],
  // grip change — flow
  ['Clean-Squat-Press', 'yb-clean-squat-press'], ['Grip-Change Complex', 'yb-grip-change-complex'],
  ['Squat to Cross-Catch', 'yb-squat-cross-catch'], ['Snatch to Windmill', 'yb-snatch-windmill'],
  ['Hammer Curl Squat', 'yb-hammer-curl-squat'], ['Flow Sequence', 'yb-flow'],
];

const TRX = [
  // pull
  ['Low Row', 'trx-row'], ['Mid Row', 'trx-mid-row'], ['High Row', 'trx-high-row'],
  ['Single-Arm Row', 'trx-single-arm-row'], ['Inverted Row', 'trx-inverted-row'],
  ['Face Pull', 'trx-face-pull'], ['Low-to-High Row', 'trx-low-high-row'],
  // press
  ['Chest Press', 'trx-chest-press'], ['Single-Arm Chest Press', 'trx-single-arm-chest-press'],
  ['Chest Fly', 'trx-chest-fly'], ['Clock Press', 'trx-clock-press'],
  ['Suspended Push-Up', 'trx-push-up'], ['Atomic Push-Up', 'trx-atomic-push-up'],
  // legs — squats
  ['TRX Squat', 'trx-squat'], ['Single-Leg Squat', 'trx-single-leg-squat'],
  ['Overhead Squat', 'trx-overhead-squat'], ['Sumo Squat', 'trx-sumo-squat'],
  // legs — lunges
  ['Suspended Lunge', 'trx-split-squat'], ['Balance Lunge', 'trx-balance-lunge'],
  ['Crossing Balance Lunge', 'trx-crossing-balance-lunge'], ['Front Lunge', 'trx-front-lunge'],
  ['Side Lunge', 'trx-side-lunge'], ['Step-Back Lunge', 'trx-step-back-lunge'],
  // legs — hinge
  ['Hamstring Curl', 'trx-hamstring-curl'], ['Hamstring Runner', 'trx-hamstring-runner'],
  ['Hip Press', 'trx-hip-press'], ['Single-Leg Hip Press', 'trx-single-leg-hip-press'],
  ['Hip Hinge', 'trx-hip-hinge'], ['Single-Leg Deadlift', 'trx-single-leg-deadlift'],
  // core — planks
  ['Plank', 'trx-plank'], ['Side Plank', 'trx-side-plank'], ['Body Saw', 'trx-body-saw'],
  ['Fallout', 'trx-fallout'], ['Hip Drop', 'trx-hip-drop'],
  // core — dynamic
  ['Pike', 'trx-pike'], ['Knee Tuck', 'trx-knee-tuck'],
  ['Mountain Climber', 'trx-mountain-climber'], ['Oblique Crunch', 'trx-oblique-crunch'],
  ['Reverse Crunch', 'trx-reverse-crunch'],
  // arms — flys
  ['Y-Fly', 'trx-y-fly'], ['T-Fly', 'trx-t-fly'], ['W-Fly', 'trx-w-fly'],
  ['I-Fly', 'trx-i-fly'], ['Reverse Fly', 'trx-reverse-fly'],
  // arms — iso
  ['Biceps Curl', 'trx-biceps-curl'], ['Overhead Triceps Extension', 'trx-triceps-extension'],
  // power
  ['Power Pull', 'trx-power-pull'], ['Jump Squat', 'trx-jump-squat'],
  ['Sprinter Start', 'trx-sprinter-start'], ['Suspended Burpee', 'trx-burpee'],
  ['Chest Press with Rotation', 'trx-press-rotation'], ['Explosive Row', 'trx-explosive-row'],
  // mobility
  ['Assisted Deep Squat', 'trx-deep-squat'], ['Pec Stretch', 'trx-pec-stretch'],
  ['Hamstring Stretch', 'trx-hamstring-stretch'], ['Thoracic Rotation', 'trx-thoracic-rotation'],
  ['Hip Flexor Stretch', 'trx-hip-flexor-stretch'], ['Lat Stretch', 'trx-lat-stretch'],
  ['Shoulder Opener', 'trx-shoulder-opener'],
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('feat 446/447 — every YBell and TRX movement in the ledgers is trackable', async ({ page }) => {
  const missing = await page.evaluate(({ yb, trx }) => {
    const inFam = (famId) => {
      const f = FAMILIES.find(x => x.id === famId);
      return new Set((f ? f.variations : []).map(v => v.id));
    };
    const ybHave = inFam('ybell-work'), trxHave = inFam('trx-work');
    return [
      ...yb.filter(([, id]) => !ybHave.has(id)).map(([l, id]) => 'YBell ' + l + ' → ' + id),
      ...trx.filter(([, id]) => !trxHave.has(id)).map(([l, id]) => 'TRX ' + l + ' → ' + id),
    ];
  }, { yb: YBELL, trx: TRX });
  expect(missing).toEqual([]);
  expect(YBELL.length).toBe(56);
  expect(TRX.length).toBe(59);
});

test('feat 446 — the YBell family exists, is indexed, and is documented', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'ybell-work');
    const ref = exercises.find(e => e.id === 'ybell-work');
    const bad = [];
    YBELL_ROWS.forEach((row, i) => {
      const h = (0xC0 + i).toString(16).padStart(4, '0');
      const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
      const idx = VAR_INDEX.get(uuid);
      const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
      if (!idx || idx.variation.id !== row[0] || idx.family.id !== 'ybell-work') { bad.push(row[0] + ' (index)'); return; }
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
    });
    return { bad, rows: YBELL_ROWS.length, famCount: fam ? fam.variations.length : -1,
      refCount: ref ? ref.variations.length : -1, mega: fam && fam.mega, sub: fam && fam.sub,
      hasGeneral: !!(ref && ref.general && ref.general.setup.length),
      inExport: buildReferenceHtml().includes('<h3>YBell Work</h3>') };
  });
  expect(r.rows).toBe(56);
  expect(r.bad).toEqual([]);
  expect(r.famCount).toBe(56);
  expect(r.refCount).toBe(56);
  expect(r.mega).toBe('full');
  expect(r.hasGeneral).toBe(true);
  expect(r.inExport).toBe(true);
});

test('feat 447 — the TRX rows land intact and the family stays whole', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'trx-work');
    const ref = exercises.find(e => e.id === 'trx-work');
    const bad = [];
    TRX_ROWS.forEach((row, i) => {
      const h = (0xF8 + i).toString(16).padStart(4, '0');
      const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
      const idx = VAR_INDEX.get(uuid);
      const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
      if (!idx || idx.variation.id !== row[0] || idx.family.id !== 'trx-work') { bad.push(row[0] + ' (index)'); return; }
      if (!rv || !(rv.setup || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
    });
    return { bad, rows: TRX_ROWS.length, famCount: fam.variations.length,
      refCount: ref ? ref.variations.length : -1 };
  });
  expect(r.rows).toBe(54);
  expect(r.bad).toEqual([]);
  expect(r.famCount).toBe(59);   // 5 built-in + 54 new
  expect(r.refCount).toBe(59);
});

test('feat 446/447 — the positional uuid ranges never overlap', async ({ page }) => {
  const r = await page.evaluate(() => {
    const seen = new Map(), clash = [];
    [['mace', MACE_CLUB_ROWS, 0x30], ['kb', KB_ROWS, 0x89], ['ybell', YBELL_ROWS, 0xC0], ['trx', TRX_ROWS, 0xF8]]
      .forEach(([name, rows, base]) => rows.forEach((_, i) => {
        const slot = base + i;
        if (seen.has(slot)) clash.push(name + ' overlaps ' + seen.get(slot) + ' at 0x' + slot.toString(16));
        seen.set(slot, name);
      }));
    const uuids = new Map();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => uuids.set(v.uuid, (uuids.get(v.uuid) || 0) + 1)));
    return { clash, dupUuids: [...uuids].filter(([, n]) => n > 1).map(([u]) => u), slots: seen.size };
  });
  expect(r.clash).toEqual([]);
  expect(r.dupUuids).toEqual([]);
  expect(r.slots).toBe(89 + 55 + 56 + 54);
});
