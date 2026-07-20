// feat 445 — the whole kettlebell vocabulary is trackable: swings, cleans, snatches, presses,
// jerks and the sport lifts, squats, hinges, lunges, get-ups, carries, rotation, rows, grinds,
// mobility drills, juggling and complexes. Most new entries live in the Kettlebell-Specific
// family; movements the catalogue already carries implement-agnostically (goblet/cossack/pistol
// squat, RDL, russian twist, carries, floor/Z/arnold press…) map to those existing variations.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const LEDGER = [
  // ballistic — swings
  ['Two-Hand Swing', 'kb-swing-detailed'], ['One-Arm Swing', 'kb-one-arm-swing'],
  ['Hand-to-Hand Swing', 'kb-alt-swing'], ['American Swing', 'kb-american-swing'],
  ['Dead-Stop Swing', 'kb-dead-stop-swing'], ['Double Swing', 'kb-double-swing'],
  ['Staggered-Stance Swing', 'kb-staggered-swing'], ['Walking Swing', 'kb-walking-swing'],
  ['Pendulum Swing', 'kb-pendulum-swing'],
  // ballistic — cleans
  ['Kettlebell Clean', 'kb-clean-detailed'], ['Dead Clean', 'kb-dead-clean'],
  ['Hang Clean', 'kb-hang-clean'], ['Double Clean', 'kb-double-clean'],
  ['Bottoms-Up Clean', 'kb-bottoms-up-clean'], ['Hand-to-Hand Clean', 'kb-hand-to-hand-clean'],
  // ballistic — snatches
  ['Kettlebell Snatch', 'kb-snatch-detailed'], ['Dead Snatch', 'kb-dead-snatch'],
  ['Hang Snatch', 'kb-hang-snatch'], ['Half Snatch', 'kb-half-snatch'],
  ['Double Snatch', 'kb-double-snatch'],
  // overhead — presses
  ['Military Press', 'kb-press'], ['Double Press', 'kb-double-press'],
  ['See-Saw Press', 'kb-see-saw-press'], ['Push Press', 'kb-push-press'],
  ['Bottoms-Up Press', 'kb-bottoms-up-press'], ['Sots Press', 'kb-sots-press'],
  ['Half-Kneeling Press', 'half-kneeling-press'], ['Tall-Kneeling Press', 'kb-tall-kneeling-press'],
  ['Z-Press', 'z-press'], ['Floor Press', 'floor-press'],
  ['Arnold Press', 'arnold-press'], ['Bent Press', 'kb-bent-press'],
  // overhead — jerks & sport lifts
  ['Jerk', 'kb-jerk'], ['Double Jerk', 'kb-double-jerk'], ['Long Cycle', 'kb-long-cycle'],
  ['Push Jerk', 'push-jerk'], ['Thruster', 'thruster'], ['Biathlon Set', 'kb-biathlon'],
  // grounded — squats
  ['Goblet Squat', 'kb-goblet-squat-v'], ['Front Squat', 'kb-front-squat'],
  ['Double Front Squat', 'kb-double-front-squat'], ['Overhead Squat', 'kb-overhead-squat'],
  ['Double Overhead Squat', 'kb-double-overhead-squat'],
  ['Bottoms-Up Goblet Squat', 'kb-bottoms-up-goblet-squat'],
  ['Sumo Squat', 'sumo-squat-narrow'], ['Cossack Squat', 'cossack-squat'],
  // grounded — hinges & deadlifts
  ['Kettlebell Deadlift', 'kb-deadlift'], ['Sumo Deadlift', 'sumo-dl'],
  ['Suitcase Deadlift', 'kb-suitcase-deadlift'], ['Single-Leg Deadlift', 'single-leg-rdl'],
  ['Romanian Deadlift', 'romanian-dl'], ['Staggered-Stance Deadlift', 'kb-staggered-deadlift'],
  ['Double Deadlift', 'kb-double-deadlift'], ['Hip Thrust', 'bb-hip-thrust'],
  ['Glute Bridge', 'bw-glute-bridge'], ['Kettlebell Good Morning', 'good-morning'],
  // grounded — lunges & single-leg
  ['Racked Reverse Lunge', 'reverse-lunge'], ['Racked Forward Lunge', 'walking-lunge'],
  ['Walking Lunge', 'walking-lunge'], ['Overhead Lunge', 'kb-overhead-lunge'],
  ['Lateral Lunge', 'lateral-lunge'], ['Curtsy Lunge', 'curtsy-lunge'],
  ['Bulgarian Split Squat', 'bulgarian-split-squat'], ['Pistol Squat', 'pistol-squat'],
  // structural — get-ups
  ['Turkish Get-Up', 'kb-turkish-get-up-v'], ['Half Get-Up', 'kb-half-getup'],
  ['Get-Up Sit-Up', 'kb-getup-situp'], ['Bottoms-Up Get-Up', 'kb-bottoms-up-getup'],
  ['Bent-Arm Get-Up', 'kb-bent-arm-getup'],
  // structural — loaded carries
  ["Farmer's Carry", 'farmers-walk'], ['Suitcase Carry', 'suitcase-carry'],
  ['Rack Carry', 'kb-rack-walk'], ['Overhead Carry', 'overhead-carry'],
  ['Bottoms-Up Carry', 'kb-bottoms-up-carry'], ['Cross Carry', 'kb-cross-carry'],
  ['Goblet Carry', 'kb-goblet-carry'],
  // structural — rotation & core
  ['Windmill', 'kb-windmill-v'], ['Low Windmill', 'kb-low-windmill'], ['Halo', 'kb-halo'],
  ['Around the Body Pass', 'kb-around-the-world'], ['Figure-8', 'kb-figure-8'],
  ['Figure-8 to Hold', 'kb-figure-8-hold'], ['Russian Twist', 'russian-twist'],
  ['Kettlebell Wood Chop', 'kb-wood-chop'], ['Plank Drag', 'kb-plank-drag'],
  ['Renegade Row', 'kb-renegade-row'],
  // accessory — rows & pulls
  ['Bent-Over Row', 'single-arm-db-row'], ['Gorilla Row', 'gorilla-row'],
  ['High Pull', 'kb-high-pull'], ['Upright Row', 'kb-upright-row'],
  ['Pullover', 'db-pullover'], ['Reverse Fly', 'rear-delt-fly-db'],
  // accessory — grinds & isolation
  ['Kettlebell Curl', 'kb-curl'], ['Double Curl', 'kb-curl'],
  ['Bottoms-Up Curl', 'kb-bottoms-up-curl'], ['Overhead Triceps Extension', 'db-overhead-ext'],
  ['Skull Crusher', 'skull-crusher'], ['Lateral Raise', 'db-lateral'],
  ['Front Raise', 'db-front-raise'], ['Chest Press', 'floor-press'],
  ['Kettlebell Push-Up', 'kb-push-up'],
  // accessory — mobility & stability
  ['Arm Bar', 'kb-armbar'], ['Bent Arm Bar', 'kb-bent-arm-bar'],
  ['Prying Goblet Squat', 'kb-prying-goblet'], ['Bottoms-Up Hold', 'kb-bottoms-up-hold'],
  ['Turkish Stand', 'kb-turkish-stand'], ['Deck Squat', 'kb-deck-squat'],
  // dynamic — flow & juggling
  ['Kettlebell Flip', 'kb-juggle-flip'], ['Swing Toss', 'kb-swing-toss'],
  ['Around-the-Back Pass', 'kb-around-back-pass'], ['Clean Flip', 'kb-clean-flip'],
  ['Juggling Flow', 'kb-juggling-flow'],
  // dynamic — complexes & chains
  ['Clean-Squat-Press', 'kb-clean-and-press-complex'], ['Armor Building Complex', 'kb-armor-building'],
  ['Swing-Clean-Snatch', 'kb-swing-clean-snatch'], ['Clean & Press Ladder', 'kb-clean-press-ladder'],
  ['Double Clean-Squat-Press', 'kb-double-clean-squat-press'], ['Man Maker', 'kb-man-maker'],
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('feat 445 — every kettlebell movement in the ledger is trackable', async ({ page }) => {
  const missing = await page.evaluate((rows) => {
    const have = new Set();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => have.add(v.id)));
    return rows.filter(([, id]) => !have.has(id)).map(([label, id]) => label + ' → ' + id);
  }, LEDGER);
  expect(missing).toEqual([]);
  expect(LEDGER.length).toBe(118);
});

test('feat 445 — the expanded KB rows land intact and uniquely', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ref = exercises.find(e => e.id === 'kettlebell-specific');
    const bad = [];
    KB_ROWS.forEach((row, i) => {
      const h = (0x89 + i).toString(16).padStart(4, '0');
      const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
      const idx = VAR_INDEX.get(uuid);
      const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
      if (!idx || idx.variation.id !== row[0]) { bad.push(row[0] + ' (not indexed)'); return; }
      if (idx.family.id !== 'kettlebell-specific') bad.push(row[0] + ' (wrong family)');
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
    });
    const uuids = new Map();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => uuids.set(v.uuid, (uuids.get(v.uuid) || 0) + 1)));
    return { bad, rows: KB_ROWS.length, dupUuids: [...uuids].filter(([, n]) => n > 1).map(([u]) => u) };
  });
  expect(r.rows).toBe(55);
  expect(r.bad).toEqual([]);
  expect(r.dupUuids).toEqual([]);
});

test('feat 445 — the kettlebell family reached the Reference dataset at all', async ({ page }) => {
  // it never existed there before: extras aimed at it were silently dropped and the 29
  // built-in KB variations were trackable but undocumented.
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'kettlebell-specific');
    const ref = exercises.find(e => e.id === 'kettlebell-specific');
    return {
      present: !!ref, famCount: fam.variations.length, refCount: ref ? ref.variations.length : -1,
      builtIn: ref ? !!ref.variations.find(v => v.id === 'kb-long-cycle') : false,
      inExport: typeof buildReferenceHtml === 'function' && buildReferenceHtml().includes('<h4>Man Maker'),
    };
  });
  expect(r.present).toBe(true);
  expect(r.refCount).toBe(r.famCount);
  expect(r.builtIn).toBe(true);
  expect(r.inExport).toBe(true);
});
