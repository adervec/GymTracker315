// Coverage for the equipment-setup / plate-math solvers (feat 41/42 + 78-87):
// the pure helpers (greedyPlates, nearestInList, plateSum), the per-kind
// weight solver (solveSetupState) and the per-kind total (setupTotal), plus a
// dataset-wide sweep of autoSetupKind over every real variation.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.solveSetupState === 'function', null, { timeout: 15000 });
});

test('pure plate helpers: greedyPlates / nearestInList / plateSum', async ({ page }) => {
  const r = await page.evaluate(() => ({
    g1: greedyPlates(45, [45, 25, 10, 5, 2.5]),       // exact single plate
    g2: greedyPlates(52.5, [45, 25, 10, 5, 2.5]),     // 45 + 5 + 2.5
    g3: greedyPlates(0, [45, 25, 10, 5, 2.5]),        // nothing
    g4: greedyPlates(-10, [45, 25, 10, 5, 2.5]),      // clamped to 0 -> nothing
    n1: nearestInList(27, [20, 25, 30]),              // 25
    n2: nearestInList(1000, [20, 25, 30]),            // 30 (cap)
    n3: nearestInList(22.5, [20, 25]),                // tie -> first (20)
    p1: plateSum({ 45: 1, 5: 1 }),                    // 50
    p2: plateSum({ 45: 2, 10: 1 }),                   // 100
    p3: plateSum({}),                                 // 0
  }));
  expect(r.g1).toEqual({ 45: 1 });
  expect(r.g2).toEqual({ 45: 1, 5: 1, 2.5: 1 });
  expect(r.g3).toEqual({});
  expect(r.g4).toEqual({});
  expect(r.n1).toBe(25);
  expect(r.n2).toBe(30);
  expect(r.n3).toBe(20);
  expect(r.p1).toBe(50);
  expect(r.p2).toBe(100);
  expect(r.p3).toBe(0);
});

test('greedyPlates never overshoots and leaves < smallest denomination', async ({ page }) => {
  const worst = await page.evaluate(() => {
    const denoms = plateConfig().plates;          // descending
    const min = denoms[denoms.length - 1];
    let worstGap = 0;
    for (let target = 0; target <= 200; target += 1.25) {
      const plates = greedyPlates(target, denoms);
      const sum = plateSum(plates);
      if (sum > target + 1e-9) return { overshoot: true, target, sum };
      worstGap = Math.max(worstGap, target - sum);
    }
    return { overshoot: false, worstGap, min };
  });
  expect(worst.overshoot).toBe(false);
  expect(worst.worstGap).toBeLessThan(worst.min); // remainder is always less than one plate
});

test('solveSetupState hits the requested weight for every kind', async ({ page }) => {
  const r = await page.evaluate(() => {
    const cfg = plateConfig();
    const maxPl = cfg.plates[0];
    const dw = dumbbellWeights(), kw = kettlebellWeights(), mw = medballWeights();
    const out = {};
    let t, s;
    t = cfg.def + 2 * maxPl; s = solveSetupState('barbell', t);
    out.barbell = { target: t, total: s.bar + 2 * plateSum(s.plates) };
    t = dw[6]; s = solveSetupState('dumbbell', t);
    out.dumbbell = { target: t, total: s.perHand ? s.weight : s.weight * 2, perHand: s.perHand };
    t = kw[4]; s = solveSetupState('kettlebell', t);
    out.kettlebell = { target: t, total: s.double ? s.weight * 2 : s.weight };
    t = mw[3]; s = solveSetupState('medicineball', t);
    out.medicineball = { target: t, total: s.weight };
    t = maxPl; s = solveSetupState('plate', t);
    out.plate = { target: t, total: plateSum(s.plates) };
    t = maxPl; s = solveSetupState('landmine', t);
    out.landmine = { target: t, total: plateSum(s.plates) + (s.addBar ? 999 : 0) };
    t = 60; s = solveSetupState('pin', t); // 60 is a multiple of both the kg (5) and lb (10) increment
    out.pin = { target: t, total: (parseFloat(s.stack) || 0) + plateSum(s.toppers) };
    return out;
  });
  for (const kind of Object.keys(r)) {
    expect(r[kind].total, `${kind}: solved loadout should total the target`).toBeCloseTo(r[kind].target, 6);
  }
  expect(r.dumbbell.perHand).toBe(true);
});

test('setupTotal computes each kind from the live setup state', async ({ page }) => {
  const r = await page.evaluate(() => {
    const reset = (kind, props) => { const st = setupState(kind); for (const k in st) delete st[k]; Object.assign(st, props); };
    const out = {};
    reset('dumbbell', { weight: 30, perHand: true }); out.dbPerHand = setupTotal('dumbbell');
    reset('dumbbell', { weight: 30, perHand: false }); out.dbBoth = setupTotal('dumbbell');
    reset('kettlebell', { weight: 24, double: true }); out.kbDouble = setupTotal('kettlebell');
    reset('pin', { stack: 50, toppers: {}, inc: 5 }); out.pin = setupTotal('pin');
    const cfg = plateConfig();
    reset('barbell', { bar: cfg.def, plates: { [cfg.plates[0]]: 1 } });
    out.bbTotal = setupTotal('barbell'); out.bbExpect = cfg.def + 2 * cfg.plates[0];
    return out;
  });
  expect(r.dbPerHand).toBe(30);
  expect(r.dbBoth).toBe(60);
  expect(r.kbDouble).toBe(48);
  expect(r.pin).toBe(50);
  expect(r.bbTotal).toBeCloseTo(r.bbExpect, 6);
});

test('autoSetupKind returns a valid kind (or null) for every variation, never throws', async ({ page }) => {
  const res = await page.evaluate(() => {
    if (typeof FAMILIES === 'undefined') return { reachable: false };
    const valid = new Set(['barbell', 'dumbbell', 'kettlebell', 'medicineball', 'plate', 'landmine', 'pin']);
    const bad = [];
    let n = 0;
    FAMILIES.forEach((f) => (f.variations || []).forEach((v) => {
      if (!v.uuid) return;
      n++;
      let k;
      try { k = autoSetupKind(v.uuid); } catch (e) { bad.push({ uuid: v.uuid, err: String((e && e.message) || e) }); return; }
      if (k !== null && !valid.has(k)) bad.push({ uuid: v.uuid, title: v.title, kind: k });
    }));
    return { reachable: true, n, bad };
  });
  expect(res.reachable, 'FAMILIES dataset not reachable in page scope').toBe(true);
  expect(res.bad, 'autoSetupKind produced an invalid/error result').toEqual([]);
  expect(res.n, 'expected a populated variation dataset').toBeGreaterThan(50);
});
