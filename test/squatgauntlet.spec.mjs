// feat 357 — "Squat Gauntlet": a single minimal-equipment, squat-only lower-body punisher (goblet, Bulgarian,
// sissy, Cossack, jump, pistol, bodyweight burnout). Must be well-formed, squat-pattern dominant, and runnable.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof FAMILIES !== 'undefined', null, { timeout: 15000 });
});

test('the squat gauntlet exists, is a max-intensity squat-pattern leg punisher, and is runnable', async ({ page }) => {
  const r = await page.evaluate(() => {
    const famIds = new Set(FAMILIES.map(f => f.id));
    const famHas = id => { const f = FAMILIES.find(x => x.id === id); return !!(f && (f.variations || []).length > 0); };
    const p = SEED_PLANS.find(x => x.id === 'seed-squat-gauntlet');
    if (!p) return { missing: true };
    const fams = p.steps.flatMap(st => (st.options || []).map(o => o.familyId));
    const lower = new Set(['squat', 'lunge', 'atg-knees-over-toes', 'adductor', 'plyometrics', 'leg-press', 'leg-extension', 'hip-thrust', 'glute-accessories', 'calf-raise']);
    return {
      missing: false, name: p.name, intensity: p.intensity, steps: p.steps.length,
      allFamiliesReal: fams.every(f => famIds.has(f)),
      runnable: p.steps.every(st => (st.options || []).some(o => famHas(o.familyId))),
      allLower: fams.every(f => lower.has(f)),
      squatSteps: p.steps.filter(st => (st.options || []).some(o => o.familyId === 'squat')).length,
    };
  });
  expect(r.missing).toBe(false);
  expect(r.name).toContain('Squat');
  expect(r.intensity).toBe(5);                 // a punisher
  expect(r.steps).toBeGreaterThanOrEqual(6);
  expect(r.allFamiliesReal).toBe(true);
  expect(r.runnable).toBe(true);
  expect(r.allLower).toBe(true);               // every step is a lower-body movement
  expect(r.squatSteps).toBeGreaterThanOrEqual(2); // genuinely squat-dominant
});
