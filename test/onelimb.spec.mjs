// feat 518 — the single-limb sweep: "there is a 1-arm variation for the LF triceps machine but NOT the LF preacher
// machine". Every two-limb variation was checked for a one-sided twin; 30 were added where one limb can drive the
// equipment and the one-sided lift is real. This pins the pairs, so a twin can't silently go missing again.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0 && typeof ONE_LIMB_ROWS !== 'undefined',
    null, { timeout: 15000 });
});

// two-limb variation → its one-sided twin (same family)
const PAIRS = [
  ['Preacher Curl Machine (Life Fitness)', 'Single-Arm Preacher Curl Machine (Life Fitness)'],
  ['Hammer Curl (Life Fitness Preacher)', 'Single-Arm Hammer Curl (Life Fitness Preacher)'],
  ['Reverse Curl (Life Fitness Preacher)', 'Single-Arm Reverse Curl (Life Fitness Preacher)'],
  ['Triceps Extension Machine (Life Fitness)', 'Single-Arm Triceps Extension Machine (Life Fitness)'],
  ['Lat Pulldown (Life Fitness Dual Pulley)', 'Single-Arm Lat Pulldown (Life Fitness Dual Pulley)'],
  ['LF Dual Pulley Row', 'Single-Arm LF Dual Pulley Row'],
  ['Preacher Curl', 'Single-Arm DB Preacher Curl'],
  ['Machine Bicep Curl', 'Single-Arm Machine Bicep Curl'],
  ['Freemotion Cable Preacher Curl', 'Single-Arm Freemotion Cable Preacher Curl'],
  ['Pec Deck Machine', 'Single-Arm Pec Deck'],
  ['Freemotion Cable Crossover', 'Single-Arm Freemotion Cable Crossover'],
  ['Dumbbell Flat Bench', 'Single-Arm DB Bench Press'],
  ['Fixed Chest Press Machine', 'Single-Arm Chest Press Machine'],
  ['Seated Cable Chest Press', 'Single-Arm Seated Cable Chest Press'],
  ['Incline DB Press', 'Single-Arm Incline DB Press'],
  ['Fixed Incline Press Machine', 'Single-Arm Incline Press Machine'],
  ['DB Shoulder Press (Seated)', 'Single-Arm Seated DB Shoulder Press'],
  ['Machine Shoulder Press (Fixed)', 'Single-Arm Shoulder Press Machine'],
  ['Machine Lateral Raise', 'Single-Arm Machine Lateral Raise'],
  ['Cable Front Raise', 'Single-Arm Cable Front Raise'],
  ['Reverse Pec Deck', 'Single-Arm Reverse Pec Deck'],
  ['Face Pull', 'Single-Arm Face Pull'],
  ['Reverse-Grip Pushdown', 'Single-Arm Reverse-Grip Pushdown'],
  ['Freemotion Cable Pushdown', 'Single-Arm Freemotion Cable Pushdown'],
  ['Skull Crusher', 'Single-Arm DB Skull Crusher'],
  ['Straight-Arm Pulldown', 'Single-Arm Straight-Arm Pulldown'],
  ['Cable Shrug', 'Single-Arm Cable Shrug'],
  ['Dumbbell Shrug', 'Single-Arm DB Shrug'],
  ['Hack Squat Machine', 'Single-Leg Hack Squat'],
  ['Glute Drive Machine (Booty Builder)', 'Single-Leg Glute Drive Machine'],
  ['Nautilus Glute Bridge Machine', 'Single-Leg Nautilus Glute Bridge Machine'],
];

test('feat 518 — every pair: the one-sided twin exists in the same family', async ({ page }) => {
  const r = await page.evaluate((PAIRS) => {
    const byTitle = new Map(); for (const [u, i] of VAR_INDEX) byTitle.set(i.variation.title, i.family.id);
    return PAIRS.map(([a, b]) => [a, b, byTitle.get(a) || null, byTitle.get(b) || null]);
  }, PAIRS);
  for (const [a, b, fa, fb] of r) {
    expect(fa, a + ' exists').not.toBeNull();
    expect(fb, b + ' is the one-sided twin of ' + a).toBe(fa);
  }
});

test('feat 518 — the new rows: unique ids + uuids, and judged as one limb by the tier scaling', async ({ page }) => {
  const r = await page.evaluate(() => {
    const mine = [...VAR_INDEX].filter(([, i]) => ONE_LIMB_ROWS.some(row => row[1] === i.variation.id));
    const ids = new Map(); for (const [, i] of VAR_INDEX) ids.set(i.variation.id, (ids.get(i.variation.id) || 0) + 1);
    return { n: mine.length, rows: ONE_LIMB_ROWS.length, dup: mine.filter(([, i]) => ids.get(i.variation.id) > 1).map(([, i]) => i.variation.id),
      notUni: mine.filter(([, i]) => !/(?:^|\W)(?:single|one)[- ]?(?:leg|arm)/i.test(i.variation.title)).map(([, i]) => i.variation.title) };
  });
  expect(r.n).toBe(r.rows);
  expect(r.n).toBe(30);
  expect(r.dup).toEqual([]);
  expect(r.notUni, 'objectiveTierFactors scales a one-limb lift by its title').toEqual([]);
});

test('feat 518 — the Life Fitness preacher grips load as the machine they are', async ({ page }) => {
  const kinds = await page.evaluate(() => {
    const out = {}; for (const [u, i] of VAR_INDEX) if (/^lifefitness-preacher/.test(i.variation.id)) out[i.variation.id] = autoSetupKind(u);
    return out;
  });
  expect(Object.keys(kinds)).toHaveLength(6);
  for (const k of Object.values(kinds)) expect(k).toBe('pin');
});
