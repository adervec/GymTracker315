// feat 196 — a heaping helping of new seed plans (tranche 6): implements (KB / landmine / strongman / oly /
// bands / med ball), the feat-194 disciplines as runnable plans (yoga / pilates / mobility / recovery), cardio
// engines, joint-health days and specialty (grip / climbing / posture). Also resurrects the tranche-4
// "Core & Midsection" plan, whose id collided with tranche-1's seed-core so it never actually seeded.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const T6_IDS = ['seed-kettlebell', 'seed-landmine', 'seed-strongman', 'seed-power-oly', 'seed-bands',
  'seed-yoga-flow', 'seed-pilates-core', 'seed-morning-15', 'seed-deep-stretch', 'seed-recovery-day',
  'seed-grip-forge', 'seed-climber', 'seed-desk-reset', 'seed-knee-armor', 'seed-cuff-care',
  'seed-hiit-engine', 'seed-zone2', 'seed-hyrox-sim', 'seed-athletic-power', 'seed-kb-90'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof planCategory === 'function' && typeof cloneSeedPlan === 'function', null, { timeout: 15000 });
});

test('the tranche-6 plans exist, are complete, and every pinned option resolves', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    const present = ids.filter(id => SEED_PLANS.some(p => p.id === id));
    const incomplete = ids.filter(id => { const p = SEED_PLANS.find(x => x.id === id); return !p || !(p.steps || []).length || !p.desc || !(p.intensity >= 1 && p.intensity <= 5); });
    const bad = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); if (!p) return; (p.steps || []).forEach((st, i) => (st.options || []).forEach(o => {
      if (o.type === 'movement' && !FAMILIES.find(f => f.id === o.familyId)) bad.push(`${id} step${i + 1} ${o.familyId}`);
      if (o.type === 'variation' && !VAR_INDEX.get(o.uuid)) bad.push(`${id} var ${o.uuid}`);
    })); });
    return { count: present.length, incomplete, bad, total: SEED_PLANS.length };
  }, T6_IDS);
  expect(r.count).toBe(20);          // all 20 new plans present
  expect(r.incomplete).toEqual([]);  // each has steps + desc + a 1-5 intensity
  expect(r.bad).toEqual([]);         // every pinned familyId / variation uuid resolves
  expect(r.total).toBeGreaterThanOrEqual(60); // the library is now a heaping helping
});

test('seed-plan ids are unique, and Core & Midsection is resurrected under its own id', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = SEED_PLANS.map(p => p.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    const mids = SEED_PLANS.find(p => p.id === 'seed-midsection');
    return { dup, midsName: mids ? mids.name : null, seeded: !!getPlan('seed-midsection'), oldCoreSeeded: !!getPlan('seed-core') };
  });
  expect(r.dup).toEqual([]);                      // the duplicate-id bug stays fixed
  expect(r.midsName).toBe('Core & Midsection');   // tranche-4 plan now has its own id…
  expect(r.seeded).toBe(true);                    // …and actually seeds into state.plans
  expect(r.oldCoreSeeded).toBe(true);             // tranche-1 Core & Conditioning untouched
});

test('the library now spans the discipline categories (Mobility / Recovery / Cardio and friends)', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    const catOf = (id) => planCategory(cloneSeedPlan(SEED_PLANS.find(p => p.id === id)));
    const allCats = [...new Set(SEED_PLANS.map(p => planCategory(cloneSeedPlan(p))))];
    return {
      allCats,
      yoga: catOf('seed-yoga-flow'), stretch: catOf('seed-deep-stretch'), recovery: catOf('seed-recovery-day'),
      pilates: catOf('seed-pilates-core'), grip: catOf('seed-grip-forge'), knees: catOf('seed-knee-armor'),
      climber: catOf('seed-climber'), kb: catOf('seed-kettlebell'), hiit: catOf('seed-hiit-engine'),
    };
  }, T6_IDS);
  expect(r.yoga).toBe('Mobility');         // the feat-194 disciplines are now runnable plans…
  expect(r.stretch).toBe('Mobility');
  expect(r.recovery).toBe('Recovery');
  expect(r.pilates).toBe('Core');
  expect(r.grip).toBe('Pull');             // …and the specialty days land in sensible groups
  expect(r.knees).toBe('Legs');
  expect(r.climber).toBe('Upper');
  expect(r.kb).toBe('Full Body');
  expect(r.hiit).toBe('Cardio');
  expect(r.allCats.length).toBeGreaterThanOrEqual(7); // a genuinely varied library
});

test('length + intensity spread: all buckets covered, the 90m/3h clusters hold, max stays 3h', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    const t6 = ids.map(id => cloneSeedPlan(SEED_PLANS.find(p => p.id === id)));
    const buckets = [...new Set(t6.map(planLengthBucket))].sort();
    const intens = [...new Set(ids.map(id => SEED_PLANS.find(p => p.id === id).intensity))].sort();
    const mins = SEED_PLANS.map(p => estimatePlanMinutes(cloneSeedPlan(p)));
    return { buckets, intens, kb90: estimatePlanMinutes(cloneSeedPlan(SEED_PLANS.find(p => p.id === 'seed-kb-90'))), at90: mins.filter(m => m === 90).length, at180: mins.filter(m => m === 180).length, max: Math.max(...mins) };
  }, T6_IDS);
  expect(r.buckets).toEqual(['long', 'quick', 'standard']); // tranche 6 alone covers all three buckets
  expect(r.intens).toEqual([1, 2, 3, 4, 5]);                // and the full intensity range
  expect(r.kb90).toBe(90);                                  // the new 90-minute entry sits on the mark
  expect(r.at90).toBeGreaterThanOrEqual(4);                 // the feat-175 clusters grew or held…
  expect(r.at180).toBeGreaterThanOrEqual(3);
  expect(r.max).toBe(180);                                  // …and 3 hours stays the ceiling
});

test('the new plans seed for a fresh user and are authored to GymTracker315', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    const missing = ids.filter(id => !getPlan(id));
    const sample = getPlan('seed-yoga-flow');
    return { missing, author: sample ? sample.author : null, ledger: ids.every(id => state.seededPlanIds.includes(id)) };
  }, T6_IDS);
  expect(r.missing).toEqual([]);            // every tranche-6 plan lands in state.plans
  expect(r.author).toBe('GymTracker315');   // seed authorship (feat 162) applies
  expect(r.ledger).toBe(true);              // the additive seededPlanIds ledger recorded them
});
