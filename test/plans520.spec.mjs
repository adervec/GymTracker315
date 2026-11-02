// feat 520 — a fresh, granular stack of ten plans: six PPL days as an A/B rotation (B changes angle, implement and
// rep range rather than repeating A), plus one-limb, upper-power, head-by-head and bodyweight sessions. Granular
// means every step resolves to a NARROW, real set of variations, and every step says its reps.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const IDS = ['seed-ppl2-push-a', 'seed-ppl2-pull-a', 'seed-ppl2-legs-a', 'seed-ppl2-push-b', 'seed-ppl2-pull-b', 'seed-ppl2-legs-b',
  'seed-one-limb-full', 'seed-upper-power', 'seed-delts-arms-detail', 'seed-bw-anywhere'];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof SEED_PLANS !== 'undefined' && typeof _optionBaseUuids === 'function' && VAR_INDEX.size > 0,
    null, { timeout: 15000 });
});

test('feat 520 — ten plans, each complete, every step resolving to real variations with its reps spelled out', async ({ page }) => {
  const r = await page.evaluate((IDS) => IDS.map(id => {
    const p = SEED_PLANS.find(x => x.id === id);
    if (!p) return { id, missing: true };
    return { id, intensity: p.intensity, desc: !!p.desc, steps: p.steps.map((st, i) => ({
      n: [...new Set(st.options.flatMap(o => _optionBaseUuids(o)))].length, reps: /\d+\s*[×x-]|\d+\s*s\b|AMRAP|\d+ m\b/.test(st.desc) })) };
  }), IDS);
  for (const p of r) {
    expect(p.missing, p.id).toBeUndefined();
    expect(p.desc).toBe(true);
    expect(p.intensity).toBeGreaterThanOrEqual(1);
    expect(p.steps.length).toBeGreaterThanOrEqual(5);
    p.steps.forEach((s, i) => {
      expect(s.n, `${p.id} step ${i + 1} resolves`).toBeGreaterThan(0);
      expect(s.reps, `${p.id} step ${i + 1} says its reps`).toBe(true);
    });
  }
});

test('feat 520 — granular: no step is a whole-catalogue catch-all', async ({ page }) => {
  const widest = await page.evaluate((IDS) => Math.max(...IDS.flatMap(id => SEED_PLANS.find(x => x.id === id).steps
    .map(st => [...new Set(st.options.flatMap(o => _optionBaseUuids(o)))].length))), IDS);
  expect(widest).toBeLessThan(80);
});

test('feat 520 — the B days are not the A days again', async ({ page }) => {
  const r = await page.evaluate(() => ['push', 'pull', 'legs'].map(d => {
    const set = id => new Set(SEED_PLANS.find(x => x.id === id).steps.flatMap(st => st.options.flatMap(o => _optionBaseUuids(o))));
    const a = set('seed-ppl2-' + d + '-a'), b = set('seed-ppl2-' + d + '-b');
    return [d, [...a].filter(u => b.has(u)).length / Math.min(a.size, b.size)];
  }));
  for (const [d, overlap] of r) expect(overlap, d + ' A/B overlap').toBeLessThan(0.5);
});

test('feat 520 — plan ids stay unique', async ({ page }) => {
  const dup = await page.evaluate(() => { const ids = SEED_PLANS.map(p => p.id); return ids.filter((id, i) => ids.indexOf(id) !== i); });
  expect(dup).toEqual([]);
});
