// feat 382 — a few requested missing machines, via EXTRA_VARIATIONS (loggable FAMILIES + reference docs): the Life
// Fitness dual-pulley pulldown, a padded pec deck, a behind-the-back cable shrug, and the Roc-It biceps machine (which
// also does reverse curls).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const VARS = [
  { uuid: '3471afdd-b534-45d6-a223-fa40b9d8c3e7', fam: 'lat-pulldown',  re: /Lat Pulldown \(Life Fitness Dual Pulley\)/ },
  { uuid: 'f4176dd7-7340-4684-b63e-0bcba833c686', fam: 'chest-fly',     re: /Padded Pec Deck/ },
  { uuid: 'd1e0ffa6-6d95-45ea-b6d7-72410d712218', fam: 'shrugs',        re: /Behind-the-Back Cable Shrug/ },
  { uuid: 'c82778e0-7d3e-4341-bea4-469de5b919a6', fam: 'bicep-curl',    re: /Roc-It Biceps Curl/ },
  { uuid: '7815a34f-8c77-4c93-92b4-e5c57dea8213', fam: 'reverse-curl',  re: /Roc-It Reverse Curl/ },
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && typeof varVisibleInPicker === 'function'
    && typeof exMode === 'function' && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('feat 382 — each requested machine is loggable in the right family + present in reference + standard mode', async ({ page }) => {
  const r = await page.evaluate((VARS) => VARS.map(x => {
    const info = VAR_INDEX.get(x.uuid);
    const exFam = exercises.find(e => e.id === x.fam);
    return {
      found: !!info, fam: info && info.family.id, title: info && info.variation.title,
      visible: info && varVisibleInPicker(info.family, info.variation), mode: info && exMode(x.uuid).mode,
      inDocs: !!(exFam && (exFam.variations || []).some(v => v.uuid === x.uuid)),
    };
  }), VARS);
  r.forEach((x, i) => {
    expect(x.found, `${VARS[i].uuid} missing`).toBe(true);
    expect(x.fam).toBe(VARS[i].fam);
    expect(x.title).toMatch(VARS[i].re);
    expect(x.visible).toBe(true);
    expect(x.mode).toBe('standard');
    expect(x.inDocs, `${VARS[i].uuid} not in reference`).toBe(true);
  });
});

test('feat 382 — the new machines are findable by search', async ({ page }) => {
  const r = await page.evaluate(() => {
    const search = (q) => {
      modalState.pickerSearch = q; modalState.planStepFilter = null; modalState.pickerExplored = 'all';
      const titles = [];
      filterVariations().forEach(g => { (g.variations || []).forEach(v => titles.push(v.title)); (g.secondaryVars || []).forEach(s => titles.push(s.v.title)); });
      return titles;
    };
    return {
      pulldown: search('dual pulley'),
      pec: search('padded pec deck'),
      shrug: search('behind-the-back cable shrug'),
      rocit: search('roc-it'),
    };
  });
  expect(r.pulldown.some(t => /Dual Pulley/.test(t))).toBe(true);
  expect(r.pec.some(t => /Padded Pec Deck/.test(t))).toBe(true);
  expect(r.shrug.some(t => /Behind-the-Back Cable Shrug/.test(t))).toBe(true);
  expect(r.rocit.filter(t => /Roc-It (Biceps|Reverse) Curl/.test(t)).length).toBe(2); // both the curl + reverse on the one machine
});
