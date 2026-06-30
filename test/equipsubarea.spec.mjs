// feat 393 — plan steps can be constrained to an EQUIPMENT category (the dumbbell/kettlebell-only seed plans now use it).
// feat 394 — seed plans confined to one gym sub-area (turf, preacher, squat rack, Roc-It line, Smith machine) via regex/equip.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const DBKB = ['seed-db', 'seed-bench-db', 'seed-kettlebell', 'seed-kb-90'];
const AREA = ['seed-area-turf', 'seed-area-preacher', 'seed-area-rack', 'seed-area-rocit', 'seed-area-smith'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof varMatchesEquip === 'function' && typeof _mvOpt === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 393 — an equip-constrained step resolves ONLY to variations of that equipment', async ({ page }) => {
  const r = await page.evaluate(() => {
    const dbBench = stepQualifyingVarSet({ options: [_mvOpt('flat-bench-press', 'dumbbell')] });
    const anyBench = stepQualifyingVarSet({ options: [_mvOpt('flat-bench-press')] });
    return {
      dbCount: dbBench.size, anyCount: anyBench.size,
      narrower: dbBench.size < anyBench.size,
      allMatch: [...dbBench].every(u => varMatchesEquip(u, 'dumbbell')),
    };
  });
  expect(r.dbCount).toBeGreaterThan(0);          // satisfiable
  expect(r.narrower).toBe(true);                 // the constraint actually drops some variations
  expect(r.allMatch).toBe(true);                 // and every survivor is a dumbbell variation
});

test('feat 393 — every step of the updated DB/KB-only plans is still satisfiable', async ({ page }) => {
  const bad = await page.evaluate((ids) => {
    normalizeState();
    const out = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); (p.steps || []).forEach((st, i) => { if (!stepQualifyingVarSet(st).size) out.push(`${id} step ${i}`); }); });
    return out;
  }, DBKB);
  expect(bad, `unsatisfiable: ${bad.join(', ')}`).toEqual([]);
});

test('feat 393 — the DB plans carry the equip constraint on their movement steps', async ({ page }) => {
  const r = await page.evaluate(() => {
    const p = SEED_PLANS.find(x => x.id === 'seed-db');
    const constrained = (p.steps || []).filter(st => (st.options || []).some(o => o.equip === 'dumbbell')).length;
    return { steps: p.steps.length, constrained };
  });
  expect(r.constrained).toBe(r.steps);   // all 7 dumbbell-corner steps are DB-locked
});

test('feat 394 — the sub-area plans exist, seed, and every (regex/equip) step is satisfiable', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    const bad = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); if (!p) { bad.push(id + ' MISSING'); return; } (p.steps || []).forEach((st, i) => { if (!stepQualifyingVarSet(st).size) bad.push(`${id} step ${i}`); }); });
    return { bad, seeded: ids.map(id => !!state.plans.find(p => p.id === id)) };
  }, AREA);
  expect(r.bad, `unsatisfiable: ${r.bad.join(', ')}`).toEqual([]);
  r.seeded.forEach((s, i) => expect(s, `${AREA[i]} not seeded`).toBe(true));
});

test('feat 394 — each sub-area plan stays inside its zone (no cross-area variation leaks)', async ({ page }) => {
  // every variation a sub-area step resolves to must name that zone — proves the regex/equip confinement holds
  const leaks = await page.evaluate(() => {
    const ZONE = {
      'seed-area-preacher': /preacher/i,
      'seed-area-rocit': /roc-?it/i,
      'seed-area-smith': /smith/i,
    };
    const out = [];
    Object.keys(ZONE).forEach(id => {
      const p = SEED_PLANS.find(x => x.id === id);
      (p.steps || []).forEach((st, i) => {
        [...stepQualifyingVarSet(st)].forEach(u => {
          const info = VAR_INDEX.get(u);
          if (info && !ZONE[id].test(info.variation.title)) out.push(`${id} step ${i}: ${info.variation.title}`);
        });
      });
    });
    return out;
  });
  expect(leaks, `leaked: ${leaks.slice(0, 8).join(' | ')}`).toEqual([]);
});

test('feat 393/394 — no duplicate plan ids or names introduced', async ({ page }) => {
  const dupes = await page.evaluate(() => {
    const ids = {}, names = {}, dupId = [], dupName = [];
    SEED_PLANS.forEach(p => { if (ids[p.id]) dupId.push(p.id); else ids[p.id] = 1; const n = (p.name || '').toLowerCase(); if (names[n]) dupName.push(p.name); else names[n] = 1; });
    return { dupId, dupName };
  });
  expect(dupes.dupId).toEqual([]);
  expect(dupes.dupName).toEqual([]);
});
