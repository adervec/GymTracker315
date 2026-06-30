// feat 389 — a comprehensive, loggable Jump Rope family (mega 'cardio', so it logs via the cardio form). Covers the
// techniques, double/triple unders, heavy rope and the cordless/ropeless rope — straddling cardio and plyo.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof FAMILIES !== 'undefined' && typeof VAR_INDEX !== 'undefined'
    && typeof isCardioVar === 'function' && typeof varVisibleInPicker === 'function' && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('feat 389 — the Jump Rope family is loggable, cardio, comprehensive, and in the reference', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'jump-rope-skills');
    const refFam = exercises.find(e => e.id === 'jump-rope-skills');
    const vars = fam ? (fam.variations || []).filter(v => v.uuid) : [];
    return {
      inFamilies: !!fam, inReference: !!refFam, mega: fam && fam.mega, count: vars.length,
      allCardio: vars.every(v => isCardioVar(v.uuid)),
      allVisible: vars.every(v => varVisibleInPicker(fam, v)),
      allInRef: !!refFam && vars.every(v => (refFam.variations || []).some(rv => rv.uuid === v.uuid)),
      titles: vars.map(v => v.title),
    };
  });
  expect(r.inFamilies).toBe(true);
  expect(r.inReference).toBe(true);
  expect(r.mega).toBe('cardio');
  expect(r.count).toBeGreaterThanOrEqual(14);
  expect(r.allCardio).toBe(true);     // every variation logs via the cardio form
  expect(r.allVisible).toBe(true);
  expect(r.allInRef).toBe(true);      // EXTRA_FAMILIES mirrored them into the reference docs
  // the techniques are all there
  ['Basic Bounce', 'Boxer Skip', 'Double Unders', 'Cordless / Ropeless Rope', 'Heavy / Weighted Rope', 'Criss-Cross'].forEach(t =>
    expect(r.titles.some(x => x.includes(t)), `missing "${t}"`).toBe(true));
});

test('feat 389 — jump-rope variations are findable by search (incl. the new cordless rope)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const search = (q) => {
      modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerFavOnly = false;
      modalState.pickerExplored = 'all'; modalState.pickerVolStatus = 'all'; modalState.pickerTrend = 'all'; modalState.planStepFilter = null;
      modalState.pickerSearch = q;
      const titles = [];
      filterVariations().forEach(g => { (g.variations || []).forEach(v => titles.push(v.title)); (g.secondaryVars || []).forEach(s => titles.push(s.v.title)); });
      return titles;
    };
    return { rope: search('jump rope').length, cordless: search('cordless'), doubleUnder: search('double under'), boxer: search('boxer skip') };
  });
  expect(r.rope).toBeGreaterThanOrEqual(10);            // the whole family surfaces on "jump rope"
  expect(r.cordless.some(t => /Cordless/.test(t))).toBe(true);
  expect(r.doubleUnder.some(t => /Double Unders/.test(t))).toBe(true);
  expect(r.boxer.some(t => /Boxer Skip/.test(t))).toBe(true);
});
