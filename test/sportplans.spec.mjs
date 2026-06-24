// feat 344 — sport-specific seed plans: strength & conditioning templates tuned to a sport's demands
// (basketball, soccer, running, sprint, swimming, cycling, climbing, combat, tennis, golf, volleyball, ski,
// baseball, rowing). Each must be well-formed and reference only real movement families.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const SPORTS = ['basketball', 'soccer', 'running', 'sprint', 'swimming', 'cycling', 'climbing', 'combat',
  'tennis', 'golf', 'volleyball', 'ski', 'baseball', 'rowing'].map(s => 'seed-sport-' + s);

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof FAMILIES !== 'undefined', null, { timeout: 15000 });
});

test('all 14 sport plans exist, are well-formed, and reference only real families', async ({ page }) => {
  const r = await page.evaluate((SPORTS) => {
    const famIds = new Set(FAMILIES.map(f => f.id));
    const out = { missing: [], badIntensity: [], emptySteps: [], badFamilies: [] };
    SPORTS.forEach(id => {
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
  }, SPORTS);
  expect(r.missing).toEqual([]);
  expect(r.badIntensity).toEqual([]);
  expect(r.emptySteps).toEqual([]);
  expect(r.badFamilies).toEqual([]);
});

test('sport plan ids are unique within SEED_PLANS (no collisions introduced)', async ({ page }) => {
  const dupes = await page.evaluate(() => {
    const ids = SEED_PLANS.map(p => p.id);
    return ids.length - new Set(ids).size;
  });
  expect(dupes).toBe(0);
});

test('a representative sport plan is fully runnable (steps resolve to real variations)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const p = SEED_PLANS.find(x => x.id === 'seed-sport-climbing');
    // every step has at least one option whose family actually has variations to log
    const allRunnable = p.steps.every(st => (st.options || []).some(o => {
      const f = FAMILIES.find(x => x.id === o.familyId);
      return f && (f.variations || []).length > 0;
    }));
    return { name: p.name, steps: p.steps.length, allRunnable };
  });
  expect(r.name).toContain('Climbing');
  expect(r.steps).toBeGreaterThanOrEqual(5);
  expect(r.allRunnable).toBe(true);
});
