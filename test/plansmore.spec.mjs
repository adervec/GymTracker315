// feat 225 — tranche 7: more seed plans (aesthetics, specialization, hypertrophy splits, quick hits &
// conditioning). Verifies they seed completely with every pinned option resolving, ids stay unique, the
// categories land sensibly, and the short ones widen the "quick" bucket for the feat-226 recommender.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const T7_IDS = ['seed-express-10', 'seed-beach-pump', 'seed-hourglass', 'seed-back-width', 'seed-ham-focus',
  'seed-push-hyper', 'seed-pull-hyper', 'seed-leg-hyper', 'seed-bench-spec', 'seed-dl-builder',
  'seed-sprint-sled', 'seed-hotel-20', 'seed-total-core', 'seed-emom-30'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof planCategory === 'function' && typeof cloneSeedPlan === 'function', null, { timeout: 15000 });
});

test('the tranche-7 plans exist, are complete, and every pinned option resolves', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    const present = ids.filter(id => SEED_PLANS.some(p => p.id === id));
    const incomplete = ids.filter(id => { const p = SEED_PLANS.find(x => x.id === id); return !p || !(p.steps || []).length || !p.desc || !(p.intensity >= 1 && p.intensity <= 5); });
    const bad = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); if (!p) return; (p.steps || []).forEach((st, i) => (st.options || []).forEach(o => {
      if (o.type === 'movement' && !FAMILIES.find(f => f.id === o.familyId)) bad.push(`${id} step${i + 1} ${o.familyId}`);
      if (o.type === 'variation' && !VAR_INDEX.get(o.uuid)) bad.push(`${id} var ${o.uuid}`);
    })); });
    return { count: present.length, incomplete, bad, total: SEED_PLANS.length };
  }, T7_IDS);
  expect(r.count).toBe(14);          // all 14 new plans present
  expect(r.incomplete).toEqual([]);  // each has steps + desc + a 1-5 intensity
  expect(r.bad).toEqual([]);         // every pinned familyId resolves (feat-175 lesson: no silent no-ops)
  expect(r.total).toBeGreaterThanOrEqual(74); // the library keeps growing
});

test('seed-plan ids stay unique across the whole library', async ({ page }) => {
  const dup = await page.evaluate(() => { const ids = SEED_PLANS.map(p => p.id); return ids.filter((id, i) => ids.indexOf(id) !== i); });
  expect(dup).toEqual([]);
});

test('the new plans seed for a fresh user, authored to GymTracker315 and tracked in the ledger', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    const missing = ids.filter(id => !getPlan(id));
    const sample = getPlan('seed-bench-spec');
    return { missing, author: sample ? sample.author : null, ledger: ids.every(id => state.seededPlanIds.includes(id)) };
  }, T7_IDS);
  expect(r.missing).toEqual([]);            // every tranche-7 plan lands in state.plans
  expect(r.author).toBe('GymTracker315');   // seed authorship (feat 162) applies
  expect(r.ledger).toBe(true);              // the additive seededPlanIds ledger recorded them
});

test('categories land where you would expect them', async ({ page }) => {
  const r = await page.evaluate(() => {
    const catOf = (id) => planCategory(cloneSeedPlan(SEED_PLANS.find(p => p.id === id)));
    return {
      express: catOf('seed-express-10'), beach: catOf('seed-beach-pump'), hourglass: catOf('seed-hourglass'),
      backWidth: catOf('seed-back-width'), ham: catOf('seed-ham-focus'), pushHyper: catOf('seed-push-hyper'),
      pullHyper: catOf('seed-pull-hyper'), legHyper: catOf('seed-leg-hyper'), bench: catOf('seed-bench-spec'),
      core: catOf('seed-total-core'), emom: catOf('seed-emom-30'),
    };
  });
  expect(r.express).toBe('Full Body');
  expect(r.beach).toBe('Push');
  expect(r.hourglass).toBe('Legs');
  expect(r.backWidth).toBe('Pull');
  expect(r.ham).toBe('Legs');
  expect(r.pushHyper).toBe('Push');
  expect(r.pullHyper).toBe('Pull');
  expect(r.legHyper).toBe('Legs');
  expect(r.bench).toBe('Push');
  expect(r.core).toBe('Core');
  expect(r.emom).toBe('Full Body');
});

test('the short hits widen the quick bucket for the recommender', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bucket = (id) => planLengthBucket(cloneSeedPlan(SEED_PLANS.find(p => p.id === id)));
    const est = (id) => estimatePlanMinutes(cloneSeedPlan(SEED_PLANS.find(p => p.id === id)));
    const quickCount = SEED_PLANS.filter(p => planLengthBucket(cloneSeedPlan(p)) === 'quick').length;
    return { express: bucket('seed-express-10'), hotel: bucket('seed-hotel-20'), totalCore: bucket('seed-total-core'), expressMin: est('seed-express-10'), quickCount };
  });
  expect(r.express).toBe('quick');
  expect(r.hotel).toBe('quick');
  expect(r.totalCore).toBe('quick');
  expect(r.expressMin).toBeLessThanOrEqual(20);   // a genuine in-and-out option
  expect(r.quickCount).toBeGreaterThanOrEqual(6); // several short plans to recommend when time is tight
});
