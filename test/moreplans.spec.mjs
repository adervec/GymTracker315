// feat 168 — more seed workout plans of various flavours. Validates the new plans exist and that EVERY
// option in EVERY seed plan resolves to a real movement family / variation (catches a typo'd familyId).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof FAMILIES !== 'undefined', null, { timeout: 15000 });
});

test('the new tranche-4 plans exist and every seed-plan option resolves', async ({ page }) => {
  const r = await page.evaluate(() => {
    const newIds = ['seed-5x5-a', 'seed-5x5-b', 'seed-calisthenics', 'seed-deadlift-day', 'seed-armday', 'seed-core', 'seed-lunch20', 'seed-chest-spec', 'seed-shoulder-sculpt', 'seed-back-biceps'];
    const present = newIds.filter(id => SEED_PLANS.some(p => p.id === id));
    const bad = [];
    SEED_PLANS.forEach(p => (p.steps || []).forEach((st, i) => (st.options || []).forEach(o => {
      if (o.type === 'movement' && !FAMILIES.find(f => f.id === o.familyId)) bad.push(`${p.id} step${i + 1} ${o.familyId}`);
      if (o.type === 'variation' && !VAR_INDEX.get(o.uuid)) bad.push(`${p.id} var ${o.uuid}`);
    })));
    // each new plan has steps + a description
    const incomplete = newIds.filter(id => { const p = SEED_PLANS.find(x => x.id === id); return !p || !(p.steps || []).length || !p.desc; });
    return { count: present.length, bad, incomplete, total: SEED_PLANS.length };
  });
  expect(r.count).toBe(10);        // all 10 new plans present
  expect(r.bad).toEqual([]);       // no broken movement/variation references in ANY seed plan
  expect(r.incomplete).toEqual([]);// each has steps + a description
  expect(r.total).toBeGreaterThanOrEqual(30);
});

test('the new plans categorize into the picker', async ({ page }) => {
  const r = await page.evaluate(() => {
    const cats = SEED_PLANS.map(p => planCategory(p));
    return { uniqueCats: [...new Set(cats)].length, allHaveCat: cats.every(c => typeof c === 'string' && c.length) };
  });
  expect(r.allHaveCat).toBe(true);
  expect(r.uniqueCats).toBeGreaterThan(2); // spread across multiple categories
});
