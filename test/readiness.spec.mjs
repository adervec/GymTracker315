// feat 299 — composite "Today's Readiness": one 0..100 score that folds per-group recovery (feat 262),
// the count of stalled lifts (feat 263/264) and the session RPE trend (feat 261) into a single headline
// with a reactive deload nudge. Pure compute over the log; these tests drive the helpers directly and
// assert the card render. Mirrors the feat-262 seeding idiom in app.spec.mjs.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof trainingReadiness === 'function'
    && typeof compositeRecovery === 'function' && typeof rpeTrend === 'function'
    && typeof renderReadinessCard === 'function', null, { timeout: 15000 });
});

test('too little history → null score and an empty card', async ({ page }) => {
  const r = await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const bench = findVar('flat-bench-press');
    state.sessions = [
      { date: new Date(Date.now() - 6 * 3600000).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 100, r: 5 }] }] },
    ]; // only 1 session — below the ≥3 floor
    return { tr: trainingReadiness(), card: renderReadinessCard() };
  });
  expect(r.tr).toBeNull();
  expect(r.card).toBe('');
});

test('well-rested log reads Primed/Ready and renders the score card', async ({ page }) => {
  const r = await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000;
    const bench = findVar('flat-bench-press'), squat = findVar('squat');
    state.workoutControls = state.workoutControls || {};
    state.workoutControls.rpeMode = 'off';
    state.sessions = [
      { date: new Date(now - 5 * day).toISOString(),  exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 80, r: 5 }, { w: 80, r: 5 }] }] }, // last training 5d ago → recovered
      { date: new Date(now - 12 * day).toISOString(), exercises: [{ varUuid: squat, subUuid: null, sets: [{ w: 120, r: 5 }] }] },
      { date: new Date(now - 20 * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 78, r: 5 }] }] },
    ];
    const tr = trainingReadiness(now);
    return { tr, comp: compositeRecovery(now), card: renderReadinessCard() };
  });
  expect(r.comp).toBeGreaterThan(0.7);
  expect(r.tr.score).toBeGreaterThanOrEqual(60);             // Ready or Primed
  expect(['primed', 'ready']).toContain(r.tr.status.key);
  expect(r.tr.factors.rpeTrend).toBeNull();                  // RPE off
  expect(r.card).toContain("Today's Readiness");
  expect(r.card).toContain(String(r.tr.score));
  expect(r.card).toContain('Recovery');
});

test('a freshly thrashed log reads Back off (deload band)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000;
    const bench = findVar('flat-bench-press'), squat = findVar('squat');
    const heavy = (w) => Array.from({ length: 6 }, () => ({ w, r: 5 }));
    state.sessions = [
      { date: new Date(now - 3 * 3600000).toISOString(), exercises: [
        { varUuid: bench, subUuid: null, sets: heavy(100) },
        { varUuid: squat, subUuid: null, sets: heavy(140) },
      ] }, // trained both hard 3h ago
      { date: new Date(now - 9 * day).toISOString(),  exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 95, r: 5 }] }] },
      { date: new Date(now - 11 * day).toISOString(), exercises: [{ varUuid: squat, subUuid: null, sets: [{ w: 135, r: 5 }] }] },
    ];
    const tr = trainingReadiness(now);
    return { tr, comp: compositeRecovery(now), card: renderReadinessCard() };
  });
  expect(r.comp).toBeLessThan(0.4);
  expect(r.tr.score).toBeLessThan(40);
  expect(r.tr.status.key).toBe('deload');
  expect(r.card).toContain('rdy-deload');
});

test('compositeRecovery is null when nothing was trained recently', async ({ page }) => {
  const comp = await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000;
    const bench = findVar('flat-bench-press');
    state.sessions = [
      { date: new Date(now - 40 * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 80, r: 5 }] }] },
      { date: new Date(now - 50 * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 78, r: 5 }] }] },
    ]; // all > ~10d → outside the readiness window
    return compositeRecovery(now);
  });
  expect(comp).toBeNull();
});

test('rpeTrend: rising effort is positive, off/sparse is null', async ({ page }) => {
  const r = await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000;
    const bench = findVar('flat-bench-press');
    const sess = (ago, rpe) => ({ date: new Date(now - ago * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 90, r: 5, rpe }, { w: 90, r: 5, rpe }] }] });
    // 6 sessions, recent 3 harder (9.5) than the prior 3 (7) → rising
    state.sessions = [sess(2, 9.5), sess(5, 9.5), sess(8, 9.5), sess(12, 7), sess(16, 7), sess(20, 7)];

    state.workoutControls = state.workoutControls || {};
    state.workoutControls.rpeMode = 'off';
    const whenOff = rpeTrend(now);                 // feature off → null even with tags
    state.workoutControls.rpeMode = 'rpe';
    const rising = rpeTrend(now);

    state.sessions = state.sessions.slice(0, 3);   // only 3 tagged → below the ≥4 floor
    const sparse = rpeTrend(now);
    return { whenOff, rising, sparse };
  });
  expect(r.whenOff).toBeNull();
  expect(r.rising).toBeGreaterThan(0);
  expect(r.rising).toBeCloseTo(2.5, 1);
  expect(r.sparse).toBeNull();
});
