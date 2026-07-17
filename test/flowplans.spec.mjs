// feat 430/431 — new seed-plan tranches: single-implement mace & kettlebell FLOW sessions (one mace /
// one kettlebell, nothing else), and the 100-minute morning Pull/Push/Lower trio that together covers
// every major muscle group. Additively seeded like every other SEED_PLANS tranche.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const MACE = ['seed-mace-flow-found', 'seed-mace-flow-fullbody', 'seed-mace-flow-engine'];
const KB = ['seed-kb-flow-sinister', 'seed-kb-flow-armor', 'seed-kb-flow-ballistic', 'seed-kb-flow-control'];
const MORNING = ['seed-morning-pull-100', 'seed-morning-push-100', 'seed-morning-lower-100'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof normalizeState === 'function' && typeof estimatePlanMinutes === 'function', null, { timeout: 15000 });
});

test('feat 430/431 — all ten plans exist, seed into state, and every step resolves', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    const bad = [];
    ids.forEach(id => {
      const p = SEED_PLANS.find(x => x.id === id);
      if (!p) { bad.push(id + ' missing'); return; }
      if (!state.plans.find(q => q.id === id)) bad.push(id + ' not seeded');
      (p.steps || []).forEach((st, i) => { const s = stepQualifyingVarSet(st); if (!s || s.size === 0) bad.push(`${id} step ${i} unsatisfiable`); });
    });
    return bad;
  }, [...MACE, ...KB, ...MORNING]);
  expect(r, r.join(', ')).toEqual([]);
});

test('feat 430 — flow plans are single-implement: every pinned variation lives in the right family', async ({ page }) => {
  const r = await page.evaluate(({ MACE, KB }) => {
    const famsOf = (ids) => ids.flatMap(id => (SEED_PLANS.find(x => x.id === id).steps || [])
      .flatMap(st => (st.options || []).map(o => {
        if (o.type !== 'variation') return 'NOT-A-VARIATION-PIN';
        const i = VAR_INDEX.get(o.uuid);
        return i ? i.family.id : 'UNRESOLVED:' + o.uuid;
      })));
    return { mace: [...new Set(famsOf(MACE))], kb: [...new Set(famsOf(KB))] };
  }, { MACE, KB });
  expect(r.mace).toEqual(['mace-club-work']);
  expect(r.kb).toEqual(['kettlebell-specific']);
});

test('feat 431 — each morning plan reads ~105 min (the closest step to 100)', async ({ page }) => {
  const r = await page.evaluate((ids) => ids.map(id => {
    const p = SEED_PLANS.find(x => x.id === id);
    return { id, min: estimatePlanMinutes(p) };
  }), MORNING);
  r.forEach(x => expect(x.min, `${x.id} is ${x.min} min`).toBe(105));
});

test('feat 431 — the trio together covers every major muscle family', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    const fams = new Set();
    ids.forEach(id => (SEED_PLANS.find(x => x.id === id).steps || [])
      .forEach(st => (st.options || []).forEach(o => { if (o.familyId) fams.add(o.familyId); })));
    return [...fams];
  }, MORNING);
  const MUST = ['pull-up', 'row', 'rear-delt', 'shrugs', 'bicep-curl', 'hammer-curl', 'reverse-curl', 'back-extension',
    'flat-bench-press', 'incline-bench-press', 'shoulder-press', 'dips', 'chest-fly', 'lateral-raise', 'tricep-extension',
    'squat', 'deadlift', 'leg-curl', 'leg-extension', 'hip-thrust', 'calf-raise',
    'abs-dynamic', 'core-stability', 'obliques'];
  MUST.forEach(f => expect(r, `missing ${f}`).toContain(f));
});

// feat 433 — the Punishment: legs, glutes, abs and BOTH hip lines, intensity 5, ~40 sets
test('feat 433 — the Punishment plan exists, is brutal, and hits legs, glutes, abs and both hip lines', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const p = SEED_PLANS.find(x => x.id === 'seed-punishment-lower');
    if (!p) return null;
    const fams = new Set(); p.steps.forEach(st => (st.options || []).forEach(o => { if (o.familyId) fams.add(o.familyId); }));
    const bad = []; p.steps.forEach((st, i) => { const s = stepQualifyingVarSet(st); if (!s || s.size === 0) bad.push(i); });
    return { seeded: !!state.plans.find(q => q.id === p.id), intensity: p.intensity, sets: p.steps.reduce((n, s) => n + s.sets, 0), fams: [...fams], bad };
  });
  expect(r).not.toBeNull();
  expect(r.seeded).toBe(true);
  expect(r.intensity).toBe(5);
  expect(r.sets).toBeGreaterThanOrEqual(38);
  expect(r.bad, `unsatisfiable steps: ${r && r.bad.join(', ')}`).toEqual([]);
  ['squat', 'leg-press', 'lunge', 'leg-curl', 'leg-extension', 'hip-thrust', 'glute-accessories', 'adductor', 'abs-dynamic', 'obliques']
    .forEach(f => expect(r.fams, `missing ${f}`).toContain(f));
});

test('the catalogue still has no duplicate plan ids or names', async ({ page }) => {
  const dupes = await page.evaluate(() => {
    const ids = {}, names = {}, dupId = [], dupName = [];
    SEED_PLANS.forEach(p => {
      if (ids[p.id]) dupId.push(p.id); else ids[p.id] = 1;
      const n = (p.name || '').toLowerCase(); if (names[n]) dupName.push(p.name); else names[n] = 1;
    });
    return { dupId, dupName };
  });
  expect(dupes.dupId, `dup ids: ${dupes.dupId.join(', ')}`).toEqual([]);
  expect(dupes.dupName, `dup names: ${dupes.dupName.join(', ')}`).toEqual([]);
});
