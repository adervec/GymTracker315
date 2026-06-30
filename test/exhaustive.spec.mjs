// feat 388 — "exhaustive" seed plans that hit EVERY relevant muscle head for each split. Verified head-by-head against
// MUSCLE_CONTRIB: for each plan, the union of the GUARANTEED heads (the intersection of each step's options, so coverage
// holds no matter which option the lifter picks) must cover the category's required head set.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const PLANS = ['seed-exh-full', 'seed-exh-upper', 'seed-exh-lower', 'seed-exh-push', 'seed-exh-pull', 'seed-exh-arms', 'seed-exh-chestback', 'seed-exh-anterior', 'seed-exh-posterior'];

// required leaf-head sets per category
const H = {
  chest: ['upper-chest', 'mid-lower-chest'],
  backNoErc: ['lats', 'traps-upper', 'traps-mid', 'traps-lower', 'rhomboids'],
  erectors: ['erectors'],
  delts: ['front-delt', 'side-delt', 'rear-delt'],
  biceps: ['biceps-long', 'biceps-short', 'brachialis'],
  triceps: ['tri-long', 'tri-lateral', 'tri-medial'],
  quads: ['rectus-femoris', 'vastus-lateralis', 'vastus-medialis', 'vastus-intermedius'],
  hams: ['hamstrings'],
  glutes: ['glute-max', 'glute-med-min'],
  calves: ['gastrocnemius', 'soleus'],
  core: ['rectus-abdominis', 'obliques'],
};
const U = (...xs) => [...new Set([].concat(...xs))];
const REQUIRED = {
  'seed-exh-full': U(H.chest, H.backNoErc, H.erectors, H.delts, H.biceps, H.triceps, H.quads, H.hams, H.glutes, H.calves, H.core),
  'seed-exh-upper': U(H.chest, H.backNoErc, H.erectors, H.delts, H.biceps, H.triceps, H.core),
  'seed-exh-lower': U(H.quads, H.hams, H.glutes, H.calves, H.erectors),
  'seed-exh-push': U(H.chest, ['front-delt', 'side-delt'], H.triceps),
  'seed-exh-pull': U(H.backNoErc, H.erectors, ['rear-delt'], H.biceps),
  'seed-exh-arms': U(H.delts, H.biceps, H.triceps),
  'seed-exh-chestback': U(H.chest, H.backNoErc, H.erectors),
  'seed-exh-anterior': U(H.chest, ['front-delt'], H.biceps, H.quads, H.core),
  'seed-exh-posterior': U(H.backNoErc, H.erectors, ['rear-delt'], H.hams, H.glutes, H.calves),
};

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof toHeadContrib === 'function' && typeof muscleContribForVar === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 388 — the exhaustive plans exist and seed into state', async ({ page }) => {
  const r = await page.evaluate((ids) => { normalizeState(); return ids.map(id => ({ id, inSeed: !!SEED_PLANS.find(p => p.id === id), seeded: !!state.plans.find(p => p.id === id) })); }, PLANS);
  r.forEach(x => { expect(x.inSeed, `${x.id} missing`).toBe(true); expect(x.seeded, `${x.id} not seeded`).toBe(true); });
});

test('feat 388 — every step of every exhaustive plan resolves to a qualifying variation', async ({ page }) => {
  const bad = await page.evaluate((ids) => {
    const out = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); (p.steps || []).forEach((st, i) => { if (!stepQualifyingVarSet(st).size) out.push(`${id} step ${i}`); }); });
    return out;
  }, PLANS);
  expect(bad, `unsatisfiable steps: ${bad.join(', ')}`).toEqual([]);
});

test('feat 388 — each plan covers EVERY required muscle head (guaranteed regardless of option chosen)', async ({ page }) => {
  const cover = await page.evaluate((req) => {
    const headSetForOption = (o) => {
      let c = null;
      if (o.type === 'movement') { const fid = resolveFamilyId(o.familyId); const fam = FAMILIES.find(f => f.id === fid); c = MUSCLE_CONTRIB[fid] || (fam ? defaultGroupContrib(getBP(fam)) : null); }
      else if (o.type === 'variation') { c = muscleContribForVar(o.uuid); }
      const h = c ? toHeadContrib(c) : {};
      return new Set(Object.keys(h).filter(k => h[k] > 0));
    };
    const guaranteedHeads = (plan) => {
      const set = new Set();
      (plan.steps || []).forEach(st => {
        const opts = (st.options || []).map(headSetForOption);
        if (!opts.length) return;
        let inter = opts[0];
        for (let i = 1; i < opts.length; i++) inter = new Set([...inter].filter(x => opts[i].has(x)));
        inter.forEach(h => set.add(h));
      });
      return set;
    };
    const out = {};
    Object.keys(req).forEach(id => {
      const plan = SEED_PLANS.find(p => p.id === id);
      const covered = guaranteedHeads(plan);
      out[id] = req[id].filter(h => !covered.has(h)); // the missing heads (should be empty)
    });
    return out;
  }, REQUIRED);
  for (const id of PLANS) expect(cover[id], `${id} missing heads: ${(cover[id] || []).join(', ')}`).toEqual([]);
});

test('feat 388 — no duplicate plan ids or names introduced', async ({ page }) => {
  const dupes = await page.evaluate(() => {
    const ids = {}, names = {}, dupId = [], dupName = [];
    SEED_PLANS.forEach(p => { if (ids[p.id]) dupId.push(p.id); else ids[p.id] = 1; const n = (p.name || '').toLowerCase(); if (names[n]) dupName.push(p.name); else names[n] = 1; });
    return { dupId, dupName };
  });
  expect(dupes.dupId).toEqual([]);
  expect(dupes.dupName).toEqual([]);
});
