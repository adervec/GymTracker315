// feat 260 — plan/split coverage pass: round out the catalogue so the split recommender has a well-fitting plan
// for every PPL/upper-lower slot at BOTH ends of the clock (express ~30 min + 2-hour marathons for push & pull,
// which previously had neither). Guards: every seed step is satisfiable; each main category spans quick→long; the
// recommender fills the express + marathon slots at ~100% time fit.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof planCategory === 'function' && typeof planLengthBucket === 'function'
    && typeof buildRecommendedSplit === 'function' && typeof planTimeScore === 'function'
    && typeof cloneSeedPlan === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 260 — EVERY seed plan step resolves to at least one qualifying variation', async ({ page }) => {
  const bad = await page.evaluate(() => {
    const out = [];
    SEED_PLANS.forEach(p => (p.steps || []).forEach((st, i) => {
      const set = stepQualifyingVarSet(st);
      if (!set || set.size === 0) out.push(`${p.id} step ${i}`);
    }));
    return out;
  });
  expect(bad, `unsatisfiable steps: ${bad.join(', ')}`).toEqual([]);
});

test('feat 260 — every PPL / upper category spans the clock (a quick AND a long option exist)', async ({ page }) => {
  const matrix = await page.evaluate(() => {
    const want = ['Push', 'Pull', 'Legs', 'Upper'];
    const m = {};
    SEED_PLANS.map(cloneSeedPlan).forEach(p => {
      const c = planCategory(p); if (!want.includes(c)) return;
      m[c] = m[c] || { quick: 0, standard: 0, long: 0 };
      m[c][planLengthBucket(p)]++;
    });
    return m;
  });
  for (const cat of ['Push', 'Pull', 'Legs', 'Upper']) {
    expect(matrix[cat].quick, `${cat} needs a quick option`).toBeGreaterThanOrEqual(1);
    expect(matrix[cat].standard, `${cat} needs a standard option`).toBeGreaterThanOrEqual(1);
    expect(matrix[cat].long, `${cat} needs a long option`).toBeGreaterThanOrEqual(1);
  }
});

test('feat 260 — the new express + marathon plans seed with the right category and length', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const spec = {
      'seed-express-push': ['Push', 'quick'], 'seed-express-pull': ['Pull', 'quick'],
      'seed-express-legs': ['Legs', 'quick'], 'seed-express-upper': ['Upper', 'quick'],
      'seed-push-marathon': ['Push', 'long'], 'seed-pull-marathon': ['Pull', 'long'],
    };
    return Object.entries(spec).map(([id, [cat, bucket]]) => {
      const p = SEED_PLANS.find(x => x.id === id);
      return { id, ok: !!p, seeded: !!state.plans.find(x => x.id === id), cat: p && planCategory(p), wantCat: cat, bucket: p && planLengthBucket(p), wantBucket: bucket };
    });
  });
  r.forEach(x => {
    expect(x.ok, `${x.id} missing`).toBe(true);
    expect(x.seeded, `${x.id} not seeded`).toBe(true);
    expect(x.cat, `${x.id} category`).toBe(x.wantCat);
    expect(x.bucket, `${x.id} length`).toBe(x.wantBucket);
  });
});

test('feat 260 — the recommender fills the express PPL slots (30 min) and push/pull marathons (120 min) at full fit', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const fit = (sessions, minutes) => buildRecommendedSplit({ sessions, minutes }).map(d => ({ slot: d.slot, name: d.plan && d.plan.name, fit: d.plan ? Math.round(planTimeScore(d.plan, minutes) * 100) : 0 }));
    return { express: fit(3, 30), marathon: fit(6, 120).slice(0, 3) }; // first PPL cycle of the marathon
  });
  // express PPL — every slot fits ~30 min cleanly
  r.express.forEach(d => expect(d.fit, `${d.slot} @30min: ${d.name} (${d.fit}%)`).toBeGreaterThanOrEqual(90));
  // marathon PPL — push/pull/legs each get a 2-hour plan
  r.marathon.forEach(d => expect(d.fit, `${d.slot} @120min: ${d.name} (${d.fit}%)`).toBeGreaterThanOrEqual(90));
});
