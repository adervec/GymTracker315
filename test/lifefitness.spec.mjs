// feat 302 — add the Life Fitness Preacher Curl and Triceps Extension machines (user couldn't find them).
// Injected via EXTRA_VARIATIONS, so they land in BOTH the loggable FAMILIES (picker) and the reference
// `exercises` docs, attached to the existing Bicep Curl / Tricep Extension families.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const PREACHER = 'b1a1000b-000b-400b-800b-aaaaaaaa000b';
const TRICEPS = 'b1a1000c-000c-400c-800c-aaaaaaaa000c';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && typeof varVisibleInPicker === 'function'
    && typeof exMode === 'function' && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('both machines are loggable variations in the right families', async ({ page }) => {
  const r = await page.evaluate(({ PREACHER, TRICEPS }) => {
    const p = VAR_INDEX.get(PREACHER), t = VAR_INDEX.get(TRICEPS);
    return {
      preacher: p ? { fam: p.family.id, title: p.variation.title, visible: varVisibleInPicker(p.family, p.variation), mode: exMode(PREACHER).mode } : null,
      triceps:  t ? { fam: t.family.id, title: t.variation.title, visible: varVisibleInPicker(t.family, t.variation), mode: exMode(TRICEPS).mode } : null,
    };
  }, { PREACHER, TRICEPS });
  expect(r.preacher).not.toBeNull();
  expect(r.preacher.fam).toBe('bicep-curl');
  expect(r.preacher.title).toContain('Life Fitness');
  expect(r.preacher.visible).toBe(true);
  expect(r.preacher.mode).toBe('standard');   // weight × reps loggable
  expect(r.triceps).not.toBeNull();
  expect(r.triceps.fam).toBe('tricep-extension');
  expect(r.triceps.title).toContain('Life Fitness');
  expect(r.triceps.visible).toBe(true);
  expect(r.triceps.mode).toBe('standard');
});

test('both machines also appear in the reference docs', async ({ page }) => {
  const r = await page.evaluate(({ PREACHER, TRICEPS }) => {
    const bf = exercises.find(e => e.id === 'bicep-curl');
    const tf = exercises.find(e => e.id === 'tricep-extension');
    return {
      preacherDoc: !!(bf && (bf.variations || []).some(v => v.uuid === PREACHER)),
      tricepsDoc: !!(tf && (tf.variations || []).some(v => v.uuid === TRICEPS)),
    };
  }, { PREACHER, TRICEPS });
  expect(r.preacherDoc).toBe(true);
  expect(r.tricepsDoc).toBe(true);
});

test('the machines are findable by searching "Life Fitness" / "preacher" in the picker', async ({ page }) => {
  const r = await page.evaluate(() => {
    const search = (q) => {
      modalState.pickerSearch = q; modalState.planStepFilter = null;
      const groups = filterVariations();
      const titles = [];
      groups.forEach(g => {
        (g.variations || []).forEach(v => titles.push(v.title));
        (g.secondaryVars || []).forEach(s => titles.push(s.v.title));
      });
      return titles;
    };
    return {
      lifefitness: search('life fitness'),
      preacher: search('preacher'),
    };
  });
  expect(r.lifefitness.some(t => /Preacher Curl Machine \(Life Fitness\)/.test(t))).toBe(true);
  expect(r.lifefitness.some(t => /Triceps Extension Machine \(Life Fitness\)/.test(t))).toBe(true);
  expect(r.preacher.some(t => /Life Fitness/.test(t))).toBe(true);
});
