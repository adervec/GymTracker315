// feat 401 — the Life Fitness plate-loaded glute kickback machine, via EXTRA_VARIATIONS (loggable in Glute Accessories
// + present in the reference docs). Distinct from the existing Cable Glute Kickback.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const UUID = 'b1a10014-0014-4014-8014-aaaaaaaa0014';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && typeof varVisibleInPicker === 'function'
    && typeof exMode === 'function' && typeof exercises !== 'undefined' && typeof filterVariations === 'function', null, { timeout: 15000 });
});

test('feat 401 — the Life Fitness glute kickback is loggable in Glute Accessories + in the reference', async ({ page }) => {
  const r = await page.evaluate((uuid) => {
    const info = VAR_INDEX.get(uuid);
    const exFam = exercises.find(e => e.id === 'glute-accessories');
    return {
      found: !!info, fam: info && info.family.id, title: info && info.variation.title,
      visible: info && varVisibleInPicker(info.family, info.variation), mode: info && exMode(uuid).mode,
      inDocs: !!(exFam && (exFam.variations || []).some(v => v.uuid === uuid)),
    };
  }, UUID);
  expect(r.found).toBe(true);
  expect(r.fam).toBe('glute-accessories');
  expect(r.title).toMatch(/Glute Kickback Machine \(Life Fitness\)/);
  expect(r.visible).toBe(true);
  expect(r.mode).toBe('standard');
  expect(r.inDocs).toBe(true);
});

test('feat 401 — it is findable by search and does not collide with the cable kickback', async ({ page }) => {
  const r = await page.evaluate(() => {
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerFavOnly = false;
    modalState.pickerExplored = 'all'; modalState.pickerVolStatus = 'all'; modalState.pickerTrend = 'all'; modalState.planStepFilter = null;
    modalState.pickerSearch = 'glute kickback';
    const titles = [];
    filterVariations().forEach(g => { (g.variations || []).forEach(v => titles.push(v.title)); (g.secondaryVars || []).forEach(s => titles.push(s.v.title)); });
    return titles;
  });
  expect(r.some(t => /Glute Kickback Machine \(Life Fitness\)/.test(t))).toBe(true);
  expect(r.some(t => /Cable Glute Kickback/.test(t))).toBe(true);  // the existing one is still there too
});
