// feat 448 — the Swiss ball as its own family. The ball trains by subtraction: it removes the
// floor's stability and the body has to manufacture its own, so nearly every entry is a stability
// rep wearing another name. Two entries already had homes elsewhere (the leg curl and stir-the-pot)
// and keep them; the other 77 live in `swiss-ball-work`.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const LEDGER = [
  // supine — crunches & sit-ups
  ['Ball Crunch', 'sb-crunch'], ['Ball Sit-Up', 'sb-situp'],
  ['Weighted Crunch', 'sb-weighted-crunch'], ['Decline Crunch', 'sb-decline-crunch'],
  ['Oblique Crunch', 'sb-oblique-crunch'],
  // supine — leg raises & passes
  ['Ball Pass', 'sb-ball-pass'], ['Dead Bug with Ball', 'sb-dead-bug'],
  ['Reverse Crunch', 'sb-reverse-crunch'], ['Leg Raise with Ball', 'sb-leg-raise'],
  ['Supine Ball Squeeze', 'sb-supine-squeeze'],
  // supine — rotation
  ['Russian Twist with Ball', 'sb-russian-twist'], ['Seated Rotation', 'sb-seated-rotation'],
  ['Windshield Wiper', 'sb-windshield-wiper'],
  // prone — planks & holds
  ['Plank (Feet on Ball)', 'sb-plank-feet'], ['Plank (Forearms on Ball)', 'sb-plank-forearms'],
  ['Side Plank (Feet on Ball)', 'sb-side-plank'], ['Ball Walkout', 'sb-walkout'],
  ['Plank Roll-In', 'sb-plank-roll-in'],
  // prone — pikes & tucks
  ['Pike', 'sb-pike'], ['Knee Tuck', 'sb-knee-tuck'],
  ['Mountain Climber', 'sb-mountain-climber'], ['Single-Leg Pike', 'sb-single-leg-pike'],
  ['Tuck to Pike', 'sb-tuck-to-pike'],
  // prone — rollouts & stir  (stir-the-pot already lives in Core Anti-Movement)
  ['Ball Rollout', 'sb-rollout'], ['Stir the Pot', 'stir-the-pot'],
  ['Standing Rollout', 'sb-standing-rollout'],
  // prone — push-ups
  ['Push-Up (Hands on Ball)', 'sb-push-up-hands'], ['Push-Up (Feet on Ball)', 'sb-push-up-feet'],
  ['Atomic Push-Up', 'sb-atomic-push-up'], ['Walkout Push-Up', 'sb-walkout-push-up'],
  // bridge — bridges & hip thrust
  ['Ball Bridge', 'sb-bridge'], ['Reverse Bridge', 'sb-reverse-bridge'],
  ['Marching Bridge', 'sb-marching-bridge'], ['Single-Leg Bridge', 'sb-single-leg-bridge'],
  ['Bridge Hold', 'sb-bridge-hold'],
  // bridge — hamstring curl  (the two-leg curl already lives in Hamstring Curl)
  ['Hamstring Curl', 'swiss-ball-curl'], ['Single-Leg Curl', 'sb-single-leg-curl'],
  ['Curl to Bridge', 'sb-curl-to-bridge'],
  // bridge — back extension & posterior
  ['Back Extension', 'sb-back-extension'], ['Prone Cobra', 'sb-prone-cobra'],
  ['Prone Y-T-W', 'sb-prone-ytw'], ['Superman', 'sb-superman'],
  ['Hip Extension', 'sb-hip-extension'], ['Reverse Hyper', 'sb-reverse-hyper'],
  // press — chest, shoulder & arm
  ['Dumbbell Chest Press', 'sb-db-chest-press'], ['Incline Press', 'sb-incline-press'],
  ['Dumbbell Fly', 'sb-db-fly'], ['Pullover', 'sb-pullover'],
  ['Seated Shoulder Press', 'sb-seated-shoulder-press'],
  ['Seated Lateral Raise', 'sb-seated-lateral-raise'],
  ['Seated Triceps Extension', 'sb-seated-triceps-ext'],
  ['Seated Biceps Curl', 'sb-seated-biceps-curl'],
  // legs — wall work
  ['Wall Squat', 'sb-wall-squat'], ['Single-Leg Wall Squat', 'sb-single-leg-wall-squat'],
  ['Wall Squat Hold', 'sb-wall-squat-hold'], ['Wall Push-Up', 'sb-wall-push-up'],
  // legs — squats & lunges
  ['Overhead Ball Squat', 'sb-overhead-squat'], ['Split Squat (Rear Foot on Ball)', 'sb-split-squat'],
  ['Ball-Held Squat', 'sb-held-squat'], ['Standing Adductor Squeeze', 'sb-standing-squeeze'],
  ['Lunge (Foot on Ball)', 'sb-lunge-foot-on-ball'],
  // balance — seated
  ['Seated Balance', 'sb-seated-balance'], ['Seated March', 'sb-seated-march'],
  ['Seated Single-Leg Balance', 'sb-seated-single-leg'], ['Seated Bounce', 'sb-seated-bounce'],
  ['Pelvic Tilt', 'sb-pelvic-tilt'], ['Seated Heel Raise', 'sb-seated-heel-raise'],
  // balance — kneeling & standing
  ['Quadruped Hold', 'sb-quadruped-hold'], ['Bird Dog', 'sb-bird-dog'],
  ['Kneeling Balance', 'sb-kneeling-balance'], ['Tall-Kneeling Balance', 'sb-tall-kneeling-balance'],
  ['Standing Balance', 'sb-standing-balance'],
  // mobility
  ['Thoracic Extension', 'sb-thoracic-extension'], ['Lateral Stretch', 'sb-lateral-stretch'],
  ['Spinal Decompression', 'sb-spinal-decompression'], ['Hip Flexor Stretch', 'sb-hip-flexor-stretch'],
  ['Chest Opener', 'sb-chest-opener'], ["Child's Pose on Ball", 'sb-childs-pose'],
  ['Hamstring Stretch', 'sb-hamstring-stretch'],
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('feat 448 — every Swiss-ball movement in the ledger is trackable', async ({ page }) => {
  const missing = await page.evaluate((rows) => {
    const have = new Set();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => have.add(v.id)));
    return rows.filter(([, id]) => !have.has(id)).map(([label, id]) => label + ' → ' + id);
  }, LEDGER);
  expect(missing).toEqual([]);
  expect(LEDGER.length).toBe(79);
});

test('feat 448 — the family exists, is indexed, animates, and is documented', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'swiss-ball-work');
    const ref = exercises.find(e => e.id === 'swiss-ball-work');
    const bad = [], noMotion = [];
    SWISSBALL_ROWS.forEach((row, i) => {
      const h = (0x12E + i).toString(16).padStart(4, '0');
      const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
      const idx = VAR_INDEX.get(uuid);
      const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
      if (!idx || idx.variation.id !== row[0] || idx.family.id !== 'swiss-ball-work') { bad.push(row[0] + ' (index)'); return; }
      // feat 446 lesson: a new family with no FAMILY_MOTION entry silently fails motionfigure's coverage test
      if (!motionForVariation(uuid)) noMotion.push(row[0]);
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
    });
    return { bad, noMotion, rows: SWISSBALL_ROWS.length,
      famCount: fam ? fam.variations.length : -1, refCount: ref ? ref.variations.length : -1,
      mega: fam && fam.mega, hasGeneral: !!(ref && ref.general && ref.general.setup.length),
      inExport: buildReferenceHtml().includes('<h3>Swiss Ball Work</h3>') };
  });
  expect(r.rows).toBe(77);
  expect(r.bad).toEqual([]);
  expect(r.noMotion).toEqual([]);
  expect(r.famCount).toBe(77);
  expect(r.refCount).toBe(77);
  expect(r.mega).toBe('full');
  expect(r.hasGeneral).toBe(true);
  expect(r.inExport).toBe(true);
});

test('feat 448 — the compact-row uuid ranges still never overlap', async ({ page }) => {
  const r = await page.evaluate(() => {
    const seen = new Map(), clash = [];
    [['mace', MACE_CLUB_ROWS, 0x30], ['kb', KB_ROWS, 0x89], ['ybell', YBELL_ROWS, 0xC0],
     ['trx', TRX_ROWS, 0xF8], ['swissball', SWISSBALL_ROWS, 0x12E]]
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
  expect(r.slots).toBe(89 + 55 + 56 + 54 + 77);
});
