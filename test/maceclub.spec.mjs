// feat 444 — the whole steel mace & steel club vocabulary is trackable: swings, casts, mills,
// pendulums, presses, pulls, levers, strikes, ground work, flows and the zurkhaneh / akhara
// lineage. Every movement name below maps to exactly one variation in the Mace & Club family
// (or, for a handful, to the pre-existing entries elsewhere).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const LEDGER = [
  // mace — swings
  ['10-to-2', 'mace-10-2'], ['Mace 360', 'mace-360-detailed'],
  ['Front Pendulum', 'mace-front-pendulum'], ['Side Pendulum', 'mace-side-pendulum'],
  ['Insides & Outsides', 'mace-insides-outsides'], ['Hand Switches', 'mace-hand-switch'],
  ['Single-Arm 360', 'mace-360-single'], ['Coiled 360', 'mace-360-coiled'],
  ['Barbarian Swing', 'mace-barbarian-swing'],
  // mace — squats & lower
  ['Front-Rack Squat', 'mace-front-squat'], ['Overhead Squat', 'mace-overhead-squat'],
  ['Barbarian Squat', 'mace-barbarian-squat'], ['Front Lunge', 'mace-front-lunge'],
  ['Reverse Lunge', 'mace-reverse-lunge'], ['Lateral Lunge', 'mace-lateral-lunge'],
  ['Cossack Squat', 'mace-cossack-squat'], ['Good Morning', 'mace-good-morning'],
  // mace — presses
  ['Strict Overhead Press', 'mace-press'], ['Push Press', 'mace-push-press'],
  ['Offset Press', 'mace-offset-press'], ['Z-Press', 'mace-z-press'],
  ['Single-Arm Press', 'mace-single-arm-press'],
  // mace — pulls
  ['Mace Deadlift', 'mace-deadlift'], ['Lawnmower Row', 'mace-lawnmower-row'],
  ['High Pull', 'mace-high-pull'], ['Mace Clean', 'mace-clean'],
  ['Clean & Press', 'mace-clean-press'], ['Mace Snatch', 'mace-snatch'],
  ['Pullover', 'mace-pullover'], ['Renegade Row', 'mace-renegade-row'],
  // mace — arms
  ['Mace Curl', 'mace-curl'], ['Ballistic Curl', 'mace-ballistic-curl'],
  ['Reverse Curl', 'mace-reverse-curl'], ['Skull Crusher', 'mace-skull-crusher'],
  ['Overhead Extension', 'mace-triceps-extension'],
  // mace — levers & grip
  ['Front Leverage Raise', 'mace-front-lever-raise'], ['Side Leverage Raise', 'mace-side-lever-raise'],
  ['Reverse Lever', 'mace-reverse-lever'], ['Pronation & Supination', 'mace-pronation-supination'],
  ['Mace Balance', 'mace-balance'],
  // mace — rotational & strikes
  ['Grave Digger', 'mace-grave-digger'], ['Wood Chop', 'mace-wood-chop'],
  ['Uppercut', 'mace-uppercut'], ['Axe Strike', 'macebell-tomahawk'],
  ['Tire Strike', 'mace-tire-strike'], ['Shovels', 'mace-shovels'],
  ['Rainbow', 'mace-rainbow'], ['Halo', 'mace-halo'], ['Bull Skull', 'mace-bull-skull'],
  // mace — ground & full body
  ['Mace Get-Up', 'mace-get-up'], ['Handle Push-Up', 'mace-grip-pushup'],
  ['Mace Windmill', 'mace-windmill'], ['Side Bend', 'mace-side-bend'],
  ['Kneeling Press', 'mace-kneeling-press'], ['Kneeling 360', 'mace-kneeling-360'],
  ['Seated Twist', 'mace-seated-twist'],
  // mace — flow
  ['Mace Flow', 'mace-flow'], ['360 to Squat', 'mace-360-squat'],
  ['10-to-2 to Press', 'mace-10-2-press'], ['Clean-Squat-Press', 'mace-squat-press'],
  // club — casts
  ['Single-Arm Cast', 'club-single-arm-cast'], ['Double-Arm Cast', 'club-double-arm-cast'],
  ['Inside Cast', 'club-inside-cast'], ['Outside Cast', 'club-outside-cast'],
  ['Gama Cast', 'club-gama-cast'], ['Shield Cast', 'club-shield-cast'],
  ['Order to Shield Cast', 'club-order-shield'],
  // club — mills & circular
  ['Inside Mill', 'club-inside-mill'], ['Outside Mill', 'club-outside-mill'],
  ['Double Mill', 'double-clubbell-mill'], ['Head Cast', 'club-head-cast'],
  ['Club Circles', 'indian-club-circle'],
  // club — pendulums & swings
  ['Order', 'club-order'], ['Club Front Pendulum', 'club-front-pendulum'],
  ['Back Pendulum', 'club-back-pendulum'], ['Inside Pendulum', 'club-inside-pendulum'],
  ['Outside Pendulum', 'club-outside-pendulum'], ['Swipe', 'club-swipe'],
  ['Front Swing', 'clubbell-swing'], ['Side Swing', 'club-side-swing'],
  ['Cross Swing', 'club-cross-swing'], ['Two-Hands-Anyhow', 'club-two-hands-anyhow'],
  // club — presses & holds
  ['Torch Press', 'club-torch-press'], ['Flag Press', 'club-flag-press'],
  ['Side Flag', 'club-side-flag'], ['Military Press', 'club-military-press'],
  ['Snap Press', 'club-snap-press'], ['Booster', 'club-booster'],
  ['Bent Press', 'club-bent-press'],
  // club — squats & lower
  ['Club Barbarian Squat', 'club-barbarian-squat'], ['Clock Squat', 'club-clock-squat'],
  ['Pendulum to Squat', 'club-pendulum-squat'], ['Club Cossack', 'club-cossack'],
  // club — rotational & arm
  ['Club Curl', 'club-curl'], ['Club Grave Digger', 'club-grave-digger'],
  ['Rockit', 'club-rockit'], ['Bull Rush', 'club-bull-rush'],
  ['Cast to Press', 'club-cast-press'],
  // club — flow
  ['Order → Shield → Squat', 'club-order-shield-squat'], ['Mill Flow', 'club-mill-flow'],
  ['Swipe Complex', 'club-swipe-complex'],
  // lineage
  ['Persian Meel Swinging', 'persian-meel'], ['Sang', 'zurkhaneh-sang'],
  ['Mugdar / Jori Swinging', 'mugdar-jori'], ['Gada Swinging', 'gada-swing'],
  ['Light-Club Swinging', 'indian-club-warmup'],
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('feat 444 — every mace & club movement in the ledger is trackable', async ({ page }) => {
  const missing = await page.evaluate((rows) => {
    const have = new Set();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => have.add(v.id)));
    return rows.filter(([, id]) => !have.has(id)).map(([label, id]) => label + ' → ' + id);
  }, LEDGER);
  expect(missing).toEqual([]);
  expect(LEDGER.length).toBe(106);
});

test('feat 444 — the expanded rows land intact and uniquely', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ref = exercises.find(e => e.id === 'mace-club-work');
    const uuids = new Map();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => uuids.set(v.uuid, (uuids.get(v.uuid) || 0) + 1)));
    const bad = [];
    MACE_CLUB_ROWS.forEach((row, i) => {
      const h = (0x30 + i).toString(16).padStart(4, '0');
      const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
      const idx = VAR_INDEX.get(uuid);
      const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
      if (!idx || idx.variation.id !== row[0]) { bad.push(row[0] + ' (not indexed)'); return; }
      if (idx.family.id !== 'mace-club-work') bad.push(row[0] + ' (wrong family)');
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
    });
    return { bad, rows: MACE_CLUB_ROWS.length, dupUuids: [...uuids].filter(([, n]) => n > 1).map(([u]) => u) };
  });
  expect(r.rows).toBe(89);
  expect(r.bad).toEqual([]);
  expect(r.dupUuids).toEqual([]);
});
