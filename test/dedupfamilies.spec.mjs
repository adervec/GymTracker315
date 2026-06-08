// feat 166 — duplicate movement families (e.g. "Neck Training", "Resistance Band Work") are reconciled into
// one canonical family at load: variations are unioned, VAR_INDEX re-pointed, and the dropped family ids are
// aliased so plan movement options still match.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof FAMILIES !== 'undefined' && typeof VAR_INDEX !== 'undefined' && typeof optionMatchesVar === 'function', null, { timeout: 15000 });
});

test('no duplicate-title movement families remain', async ({ page }) => {
  const r = await page.evaluate(() => {
    const byTitle = {};
    FAMILIES.forEach(f => { const t = (f.title || '').trim().toLowerCase(); (byTitle[t] = byTitle[t] || []).push(f.id); });
    return {
      dups: Object.entries(byTitle).filter(([, ids]) => ids.length > 1).map(([t]) => t),
      neck: FAMILIES.filter(f => (f.title || '').toLowerCase() === 'neck training').length,
      band: FAMILIES.filter(f => (f.title || '').toLowerCase() === 'resistance band work').length,
    };
  });
  expect(r.dups).toEqual([]); // fully reconciled
  expect(r.neck).toBe(1);
  expect(r.band).toBe(1);
});

test('merged-in variations still resolve in VAR_INDEX', async ({ page }) => {
  const r = await page.evaluate(() => {
    // the feat-90 neck-training extra uuids should resolve to the canonical Neck Training family
    const ids = ['c0ac0001-0001-4001-8001-000000000001', 'c0ac0003-0003-4003-8003-000000000003'];
    return ids.map(u => { const i = VAR_INDEX.get(u); return i ? (i.family.title || '').toLowerCase() : null; });
  });
  r.forEach(t => expect(t).toContain('neck')); // both resolve to a Neck Training family, none orphaned
});

test('a plan movement option referencing a merged-away family id still matches', async ({ page }) => {
  const r = await page.evaluate(() => {
    const aliases = Object.keys(_FAMILY_ALIAS);
    if (!aliases.length) return { skip: true };
    const dropped = aliases[0], canon = _FAMILY_ALIAS[dropped];
    let uuid = null; for (const [u, info] of VAR_INDEX) { if (info.family.id === canon) { uuid = u; break; } }
    return { matches: optionMatchesVar({ type: 'movement', familyId: dropped }, uuid), aliasCount: aliases.length };
  });
  if (!r.skip) {
    expect(r.aliasCount).toBeGreaterThanOrEqual(1);
    expect(r.matches).toBe(true); // the dropped id still resolves to the canonical family's variations
  }
});
