// feat 392 — upper-body "inventive cruelty": push/pull/arms/shoulders mirrors of the cruel leg plans. Each must seed,
// be intensity 5, satisfiable (incl. the muscle/head/regex steps), and read as an upper-body session.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const CRUEL = ['seed-cruel-push', 'seed-cruel-pull', 'seed-cruel-arms', 'seed-cruel-shoulders'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof stepQualifyingVarSet === 'function'
    && typeof planCategory === 'function' && typeof cloneSeedPlan === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 392 — the cruel upper plans exist, seed, are intensity 5, and read as upper-body', async ({ page }) => {
  const r = await page.evaluate((ids) => {
    normalizeState();
    return ids.map(id => {
      const sp = SEED_PLANS.find(p => p.id === id);
      const p = sp ? cloneSeedPlan(sp) : null;
      return { id, inSeed: !!sp, seeded: !!state.plans.find(x => x.id === id), intensity: sp && sp.intensity, cat: p && planCategory(p) };
    });
  }, CRUEL);
  r.forEach(x => {
    expect(x.inSeed, `${x.id} missing`).toBe(true);
    expect(x.seeded, `${x.id} not seeded`).toBe(true);
    expect(x.intensity, `${x.id} intensity`).toBe(5);
    expect(['Push', 'Pull', 'Arms', 'Shoulders', 'Upper', 'Chest', 'Back', 'Mixed'], `${x.id} category (${x.cat})`).toContain(x.cat);
  });
});

test('feat 392 — every step (incl. the muscle/head/regex ones) is satisfiable', async ({ page }) => {
  const bad = await page.evaluate((ids) => {
    const out = [];
    ids.forEach(id => { const p = SEED_PLANS.find(x => x.id === id); (p.steps || []).forEach((st, i) => { if (!stepQualifyingVarSet(st).size) out.push(`${id} step ${i}`); }); });
    return out;
  }, CRUEL);
  expect(bad, `unsatisfiable: ${bad.join(', ')}`).toEqual([]);
});

test('feat 392 — the arms plan ends on a "curl" regex wildcard', async ({ page }) => {
  const r = await page.evaluate(() => {
    const p = SEED_PLANS.find(x => x.id === 'seed-cruel-arms');
    const last = p.steps[p.steps.length - 1];
    return { hasRegex: (last.options || []).some(o => o.type === 'regex' && /curl/.test(o.pattern)) };
  });
  expect(r.hasRegex).toBe(true);
});
