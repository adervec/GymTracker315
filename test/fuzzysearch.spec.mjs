// feat 487 — forgiving search (state.fuzzySearch, DEFAULT ON): every main search bar folds
// punctuation, forgives query plurals, expands gym shorthand and tolerates one typo per word.
// Off = exactly the pre-487 strict token behaviour.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof searchMatchTokens === 'function'
    && typeof filterVariations === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 487 — the matcher forgives punctuation, plurals, shorthand and one typo', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.fuzzySearch = true;
    return {
      punct: searchMatchTokens('pushup', 'Deep Push-Up'),
      plural: searchMatchTokens('curls', 'Bicep Curl'),
      typoDel: searchMatchTokens('dumbell', 'Dumbbell Flat Bench'),
      typoSwap: searchMatchTokens('pulldwon', 'Lat Pulldown Machine'),
      shorthand: searchMatchTokens('ohp', 'Overhead Press'),
      shorthandTwo: searchMatchTokens('rdl', 'Romanian Deadlift'),
      tokensStillOrderFree: searchMatchTokens('fitness life glute', 'Glute Kickback Machine (Life Fitness)'),
      shortStaysStrict: searchMatchTokens('cat', 'Curl'),        // 3 letters: no fuzz, no match
      garbage: searchMatchTokens('xyzzyq', 'Dumbbell Flat Bench'),
      empty: searchMatchTokens('', 'anything'),
    };
  });
  expect(r.punct).toBe(true);
  expect(r.plural).toBe(true);
  expect(r.typoDel).toBe(true);
  expect(r.typoSwap).toBe(true);
  expect(r.shorthand).toBe(true);
  expect(r.shorthandTwo).toBe(true);
  expect(r.tokensStillOrderFree).toBe(true);
  expect(r.shortStaysStrict).toBe(false);
  expect(r.garbage).toBe(false);
  expect(r.empty).toBe(true);
});

test('feat 487 — off restores the strict pre-487 behaviour, and the toggle is a persisted default-on setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    delete state.fuzzySearch; normalizeState();
    const defaultOn = state.fuzzySearch === true;
    state.fuzzySearch = false;
    return {
      defaultOn,
      inKeys: SETTINGS_KEYS.includes('fuzzySearch'),
      strictPunct: searchMatchTokens('pushup', 'Deep Push-Up'),      // strict substring: no fold
      strictTypo: searchMatchTokens('dumbell', 'Dumbbell Flat Bench'),
      strictExact: searchMatchTokens('push-up', 'Deep Push-Up'),     // exact still works
    };
  });
  expect(r.defaultOn).toBe(true);
  expect(r.inKeys).toBe(true);
  expect(r.strictPunct).toBe(false);
  expect(r.strictTypo).toBe(false);
  expect(r.strictExact).toBe(true);
});

test('feat 487 — the exercise picker finds "dumbell press" and reaches family keywords', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState(); state.fuzzySearch = true;
    const titlesFor = (q) => {
      modalState.pickerSearch = q;
      return filterVariations().flatMap(g => g.variations.map(v => v.title)).slice(0, 200);
    };
    const typo = titlesFor('dumbell press');
    const kw = titlesFor('stability ball');      // lives only in the swiss-ball family KEYWORDS
    modalState.pickerSearch = '';
    return {
      typoHit: typo.some(t => /dumbbell/i.test(t) && /press/i.test(t)),
      kwHit: kw.length > 0,
    };
  });
  expect(r.typoHit).toBe(true);
  expect(r.kwHit).toBe(true);
});
