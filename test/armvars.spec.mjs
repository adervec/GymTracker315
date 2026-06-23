// feat 312 — a few requested missing arm variations, via EXTRA_VARIATIONS (so each lands in both the loggable
// FAMILIES and the reference docs): Freemotion-cable preacher/hammer/reverse curls, hammer/reverse on the Life
// Fitness preacher, and a single-arm Life Fitness triceps extension.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const VARS = [
  { uuid: 'b1a1000d-000d-400d-800d-aaaaaaaa000d', fam: 'bicep-curl',       re: /Freemotion Cable Preacher Curl/ },
  { uuid: 'b1a1000e-000e-400e-800e-aaaaaaaa000e', fam: 'hammer-curl',      re: /Freemotion Cable Hammer Curl/ },
  { uuid: 'b1a1000f-000f-400f-800f-aaaaaaaa000f', fam: 'reverse-curl',     re: /Freemotion Cable Reverse Curl/ },
  { uuid: 'b1a10010-0010-4010-8010-aaaaaaaa0010', fam: 'hammer-curl',      re: /Hammer Curl \(Life Fitness Preacher\)/ },
  { uuid: 'b1a10011-0011-4011-8011-aaaaaaaa0011', fam: 'reverse-curl',     re: /Reverse Curl \(Life Fitness Preacher\)/ },
  { uuid: 'b1a10012-0012-4012-8012-aaaaaaaa0012', fam: 'tricep-extension', re: /Single-Arm Triceps Extension Machine \(Life Fitness\)/ },
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && typeof varVisibleInPicker === 'function'
    && typeof exMode === 'function' && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('each new variation is loggable in the right family and present in the reference docs', async ({ page }) => {
  const r = await page.evaluate((VARS) => VARS.map(x => {
    const info = VAR_INDEX.get(x.uuid);
    const exFam = exercises.find(e => e.id === x.fam);
    return {
      uuid: x.uuid,
      found: !!info,
      fam: info && info.family.id,
      title: info && info.variation.title,
      visible: info && varVisibleInPicker(info.family, info.variation),
      mode: info && exMode(x.uuid).mode,
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

test('the new variations are findable by search', async ({ page }) => {
  const r = await page.evaluate(() => {
    const search = (q) => {
      modalState.pickerSearch = q; modalState.planStepFilter = null;
      const titles = [];
      filterVariations().forEach(g => { (g.variations || []).forEach(v => titles.push(v.title)); (g.secondaryVars || []).forEach(s => titles.push(s.v.title)); });
      return titles;
    };
    return { freemotion: search('freemotion cable preacher'), lfpreacher: search('life fitness preacher'), onearm: search('single-arm') };
  });
  expect(r.freemotion.some(t => /Freemotion Cable Preacher Curl/.test(t))).toBe(true);
  expect(r.lfpreacher.some(t => /Life Fitness Preacher/.test(t))).toBe(true);
  expect(r.onearm.some(t => /Single-Arm Triceps Extension Machine \(Life Fitness\)/.test(t))).toBe(true);
});
