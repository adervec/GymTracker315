// feat 355 — profession seed plans: strength & conditioning templates tuned to physically demanding jobs
// (firefighter, military, police, construction, farmer, nurse, warehouse, lineman, logger, miner, deckhand,
// roofer, mason, dancer). Each must be well-formed and reference only real movement families.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const JOBS = ['firefighter', 'military', 'police', 'construction', 'farmer', 'nurse', 'warehouse', 'lineman',
  'logger', 'miner', 'deckhand', 'roofer', 'mason', 'dancer'].map(j => 'seed-job-' + j);

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof FAMILIES !== 'undefined', null, { timeout: 15000 });
});

test('all 14 profession plans exist, are well-formed, and reference only real families', async ({ page }) => {
  const r = await page.evaluate((JOBS) => {
    const famIds = new Set(FAMILIES.map(f => f.id));
    const out = { missing: [], badIntensity: [], emptySteps: [], badFamilies: [] };
    JOBS.forEach(id => {
      const p = SEED_PLANS.find(x => x.id === id);
      if (!p) { out.missing.push(id); return; }
      if (!(p.intensity >= 1 && p.intensity <= 5)) out.badIntensity.push(id);
      if (!(p.steps && p.steps.length)) { out.emptySteps.push(id); return; }
      p.steps.forEach((st, i) => {
        if (!(st.options && st.options.length)) out.emptySteps.push(id + ':step' + i);
        (st.options || []).forEach(o => { if (o.type === 'movement' && !famIds.has(o.familyId)) out.badFamilies.push(id + ':' + o.familyId); });
      });
    });
    return out;
  }, JOBS);
  expect(r.missing).toEqual([]);
  expect(r.badIntensity).toEqual([]);
  expect(r.emptySteps).toEqual([]);
  expect(r.badFamilies).toEqual([]);
});

test('profession plan ids are unique within SEED_PLANS (no collisions introduced)', async ({ page }) => {
  const dupes = await page.evaluate(() => { const ids = SEED_PLANS.map(p => p.id); return ids.length - new Set(ids).size; });
  expect(dupes).toBe(0);
});

test('the occupational staples (carries / strength) resolve to families with real variations', async ({ page }) => {
  const r = await page.evaluate(() => {
    // every job plan should be runnable: each step has at least one option whose family has loggable variations
    const famHas = id => { const f = FAMILIES.find(x => x.id === id); return !!(f && (f.variations || []).length > 0); };
    const jobs = SEED_PLANS.filter(p => p.id.indexOf('seed-job-') === 0);
    const runnable = jobs.every(p => p.steps.every(st => (st.options || []).some(o => famHas(o.familyId))));
    const ff = SEED_PLANS.find(p => p.id === 'seed-job-firefighter');
    const usesCarries = ff.steps.some(st => (st.options || []).some(o => o.familyId === 'loaded-carries'));
    return { count: jobs.length, runnable, usesCarries, ffName: ff.name };
  });
  expect(r.count).toBe(14);
  expect(r.runnable).toBe(true);
  expect(r.usesCarries).toBe(true);              // firefighter plan leans on loaded carries
  expect(r.ffName).toContain('Firefighter');
});
