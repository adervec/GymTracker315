// feat 223 — equipment-true setup tools. Classic movements whose names carry no equipment word used to
// inherit the family's first-listed equipment (Arnold Press → barbell loader!). A per-variation override
// table now pins them to their real implement, the keyword regexes accept spaced names ("trap bar"),
// and bare "Plate" titles get the plate picker. User overrides (state.exerciseSetup) still win.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof autoSetupKind === 'function' && typeof VAR_EQUIP_OVERRIDES !== 'undefined', null, { timeout: 15000 });
});

// Resolve a variation id → its auto setup kind inside the page.
const kindOf = (page, id) => page.evaluate((vid) => {
  for (const [u, i] of VAR_INDEX) if (i.variation.id === vid) return autoSetupKind(u);
  return '«no such variation»';
}, id);

test('the Arnold Press is a dumbbell lift — not a barbell one', async ({ page }) => {
  expect(await kindOf(page, 'arnold-press')).toBe('dumbbell');
  const r = await page.evaluate(() => {
    const u = 'd8b5c9a7-1f6c-4173-bc92-ef3a40517915'; // arnold-press
    const auto = setupKindFor(u);
    state.exerciseSetup[u] = 'kettlebell';            // a user override still wins…
    const overridden = setupKindFor(u);
    delete state.exerciseSetup[u];                    // …and cleans up
    return { auto, overridden, after: setupKindFor(u) };
  });
  expect(r.auto).toBe('dumbbell');
  expect(r.overridden).toBe('kettlebell');
  expect(r.after).toBe('dumbbell');
});

test('the named-movement table pins each classic to its real implement', async ({ page }) => {
  expect(await kindOf(page, 'kroc-row')).toBe('dumbbell');          // heavy DB row
  expect(await kindOf(page, 'batwing-row')).toBe('dumbbell');       // DB hold row
  expect(await kindOf(page, 'tate-press')).toBe('dumbbell');        // DBs face each other
  expect(await kindOf(page, 'half-kneeling-press')).toBe('dumbbell');
  expect(await kindOf(page, 'viking-press')).toBe('landmine');      // landmine handle press
  expect(await kindOf(page, 'turkish-get-up')).toBe('kettlebell');  // KB overhead
  expect(await kindOf(page, 'helen')).toBe('kettlebell');           // the loaded piece is KB swings
  expect(await kindOf(page, 'svend-press')).toBe('plate');          // plate squeeze press
  expect(await kindOf(page, 'weighted-crunch')).toBe('plate');
  expect(await kindOf(page, 'snatch-grip-shrug')).toBe('barbell');  // hands at the ends of a bar
});

test('bare "Plate" titles get the plate picker; keyword and fallback paths are unbroken', async ({ page }) => {
  expect(await kindOf(page, 'plate-front-raise')).toBe('plate');    // feat 224 — \bplate\b rule
  expect(await kindOf(page, 'plate-pinch')).toBe('plate');
  expect(await kindOf(page, 'farmers-walk-trap-bar')).toBe('barbell'); // trap bar loads like a bar
  expect(await kindOf(page, 'close-grip-bench')).toBe('barbell');   // family fallback still sane
  expect(await kindOf(page, 'standard-leg-press')).toBe('pin');
  expect(await kindOf(page, 'y-raise')).toBe('dumbbell');
});

test('every override id exists in the corpus and names a valid kind', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = new Set(); for (const [, i] of VAR_INDEX) ids.add(i.variation.id);
    const VALID = ['barbell', 'dumbbell', 'kettlebell', 'medicineball', 'plate', 'pin', 'landmine', null];
    return {
      missing: Object.keys(VAR_EQUIP_OVERRIDES).filter(id => !ids.has(id)),
      badKind: Object.entries(VAR_EQUIP_OVERRIDES).filter(([, k]) => !VALID.includes(k)).map(([id]) => id),
    };
  });
  expect(r.missing).toEqual([]);  // no dead entries silently no-opping (feat-175 lesson)
  expect(r.badKind).toEqual([]);
});
