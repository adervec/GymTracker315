// feat 161 — a plan step's suggested working set is a LOOSE weight×reps suggestion: the weight is tuned to
// YOUR recent sets for that exercise (for a movement option, the most-recently-trained variation, not the
// family-wide max), paired with a rep target for the load. Framed as a guide, not a target.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.suggestedSetForOption === 'function' && typeof window.repTargetForLoad === 'function' && typeof window.renderPlanGuide === 'function', null, { timeout: 15000 });
});

test('rep target by load + tuned weight from history', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.unit = 'lb';
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.sessions = [{ id: 's', date: '2026-05-01T00:00:00Z', exercises: [{ varUuid: a, sets: [{ w: 200, r: 5 }] }] }];
    return {
      heavy: repTargetForLoad('heavy'), mod: repTargetForLoad('moderate'), light: repTargetForLoad('light'),
      set: suggestedSetForOption({ type: 'variation', uuid: a }, 'moderate'),
    };
  });
  expect(r.heavy).toBe(5);
  expect(r.mod).toBe(8);
  expect(r.light).toBe(12);
  expect(r.set.w).toBe(170); // 200 × 0.85 = 170, rounded to the 5lb increment
  expect(r.set.r).toBe(8);   // moderate rep target
});

test('a movement suggestion tunes to the most-recently-trained variation, not the family max', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.unit = 'lb';
    let fam = null; for (const f of FAMILIES) { if ((f.variations || []).filter(v => v.uuid).length >= 2) { fam = f; break; } }
    const [v1, v2] = fam.variations.filter(v => v.uuid).slice(0, 2);
    state.sessions = [
      { id: 'old', date: '2026-01-01T00:00:00Z', exercises: [{ varUuid: v1.uuid, sets: [{ w: 200, r: 5 }] }] }, // heaviest, OLD
      { id: 'new', date: '2026-05-01T00:00:00Z', exercises: [{ varUuid: v2.uuid, sets: [{ w: 100, r: 8 }] }] }, // lighter, RECENT
    ];
    const o = { type: 'movement', familyId: fam.id };
    return { base: baselineWeightForOption(o), w: suggestedSetForOption(o, 'moderate').w };
  });
  expect(r.base).toBe(100); // most-recent variation (100), not the family max (200)
  expect(r.w).toBe(85);     // 100 × 0.85 = 85
});

test('no history → suggest reps only (no fabricated weight)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    return suggestedSetForOption({ type: 'variation', uuid: a }, 'heavy');
  });
  expect(r.w).toBe(null); // nothing to base a weight on
  expect(r.r).toBe(5);    // still suggest a rep target
});

test('the plan guide renders the load badge as a suggestion (weight×reps)', async ({ page }) => {
  const html = await page.evaluate(() => {
    state.unit = 'lb';
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 3, load: 'moderate', options: [{ type: 'variation', uuid: a }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] }];
    return renderPlanGuide(state.sessions[0]);
  });
  expect(html).toContain('suggest ≈');     // weight×reps suggestion shown
  expect(html).toMatch(/suggest ≈ \d+lb×\d+/);
  expect(html).toContain('not a target');  // framed as a guide
});
