// feat 292 — Fitness Focus & Archetype (Reflect › Focus): a descriptive read of HOW you train. Each logged
// exercise is classified into an athletic dimension (max strength / hypertrophy / strength-endurance / power /
// endurance / mobility) by its taxonomy + mode + rep range; cosine similarity maps the profile to an archetype.
// Gated behind a minimum amount of data.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof fitnessFocus === 'function' && typeof fitnessArchetype === 'function'
    && typeof _varDimWeights === 'function' && typeof renderArchetypePage === 'function' && typeof navTo === 'function', null, { timeout: 15000 });
});

const benchVar = (page) => page.evaluate(() => FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid);
const mkSessions = (bench) => {
  const days = [2, 5, 9, 12, 16, 20];
  return `state.sessions = ${JSON.stringify(days)}.map(function(da){ var d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-da); var iso=d.toISOString(); return { id:'s'+da, date:iso, updatedAt:iso, endedAt:iso, exercises:[{ varUuid:'${bench}', subUuid:null, sets:[{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3}] }] }; });`;
};

test('feat 292 — _varDimWeights classifies by mode + rep range, and cardio/holds correctly', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bench = FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid;
    let cardio = null; for (const [u, i] of VAR_INDEX) { if (i.family.mega === 'cardio') { cardio = u; break; } }
    const key = (o) => o ? Object.keys(o)[0] : null;
    return {
      strength: key(_varDimWeights(bench, 3, 'standard')),
      hyper: key(_varDimWeights(bench, 9, 'standard')),
      stamina: key(_varDimWeights(bench, 18, 'standard')),
      hold: key(_varDimWeights(bench, 0, 'time')),
      cardio: cardio ? key(_varDimWeights(cardio, 0, 'standard')) : 'endurance',
    };
  });
  expect(r.strength).toBe('strength');
  expect(r.hyper).toBe('muscle');
  expect(r.stamina).toBe('stamina');   // ≥13 reps
  expect(r.hold).toBe('stamina');      // a timed hold
  expect(r.cardio).toBe('endurance');
});

test('feat 292 — fitnessFocus is gated until there is enough data, then reports a profile', async ({ page }) => {
  const bench = await benchVar(page);
  const before = await page.evaluate(() => { state.sessions = []; return fitnessFocus(112).ready; });
  expect(before).toBe(false);
  const r = await page.evaluate((mk) => {
    eval(mk);
    const f = fitnessFocus(112);
    const topDim = _FD_ORDER.slice().sort((a, b) => f.pct[b] - f.pct[a])[0];
    return { ready: f.ready, classified: f.classifiedSets, sessions: f.sessions, topDim, strengthPct: Math.round(f.pct.strength * 100) };
  }, mkSessions(bench));
  expect(r.ready).toBe(true);
  expect(r.classified).toBeGreaterThanOrEqual(30);  // 6 × 7 = 42 strength sets
  expect(r.sessions).toBe(6);
  expect(r.topDim).toBe('strength');
  expect(r.strengthPct).toBeGreaterThan(80);
});

test('feat 292 — fitnessArchetype matches a strength-dominant profile to a powerlifter (cosine)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const strong = fitnessArchetype({ strength: 0.7, muscle: 0.2, stamina: 0.05, power: 0.03, endurance: 0.0, mobility: 0.02 }).primary.id;
    const endur = fitnessArchetype({ strength: 0.1, muscle: 0.1, stamina: 0.15, power: 0.1, endurance: 0.5, mobility: 0.05 }).primary.id;
    const flex = fitnessArchetype({ strength: 0.05, muscle: 0.05, stamina: 0.1, power: 0.05, endurance: 0.15, mobility: 0.6 }).primary.id;
    const balanced = fitnessArchetype({ strength: 0.17, muscle: 0.17, stamina: 0.17, power: 0.16, endurance: 0.17, mobility: 0.16 }).primary.id;
    return { strong, endur, flex, balanced };
  });
  expect(['powerlifter', 'powerbuilder']).toContain(r.strong);
  expect(['endurance', 'hybrid']).toContain(r.endur);
  expect(['yogi', 'yogarunner', 'movement']).toContain(r.flex);
  expect(['allrounder', 'hybrid', 'tactical', 'crossfitter']).toContain(r.balanced);
});

test('feat 292 — the page is gated without data, then shows the archetype card + radar + 6 dimensions', async ({ page }) => {
  const bench = await benchVar(page);
  const gated = await page.evaluate(() => {
    state.sessions = []; navTo('focus');
    const m = document.getElementById('trk-main');
    return { page: currentPage, title: /Fitness Focus/.test(m.innerHTML), gated: /Not enough data/.test(m.innerHTML) };
  });
  expect(gated.page).toBe('focus');
  expect(gated.title).toBe(true);
  expect(gated.gated).toBe(true);

  const ready = await page.evaluate((mk) => {
    eval(mk); navTo('focus');
    const m = document.getElementById('trk-main');
    return {
      hasArch: !!m.querySelector('.focus-arch-name'),
      archName: m.querySelector('.focus-arch-name')?.textContent || '',
      hasRadar: !!m.querySelector('svg.focus-radar'),
      dims: m.querySelectorAll('.focus-dim').length,
      notAJudgment: /not<\/b> a score|not a score|not a judgment/i.test(m.innerHTML),
    };
  }, mkSessions(bench));
  expect(ready.hasArch).toBe(true);
  expect(ready.archName.length).toBeGreaterThan(0);
  expect(ready.hasRadar).toBe(true);
  expect(ready.dims).toBe(6);
});
