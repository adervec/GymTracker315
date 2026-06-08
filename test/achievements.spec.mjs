// feat 169 — achievement paths: ladders of classic milestones (plate-count lifts, CoC grip ladder, cardio
// distances) read from your own logged best (not strict on variation/aids), each with a safety note + a
// prominent disclaimer discouraging dangerous behaviour.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.computeAchievement === 'function' && typeof window.renderAchievements === 'function' && typeof ACHIEVEMENT_PATHS !== 'undefined', null, { timeout: 15000 });
});

test('a strength path reaches the right tier from your best lift (any variation)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.unit = 'lb';
    let bench = null; for (const [u, info] of VAR_INDEX) { if (/bench/i.test(info.variation.title + ' ' + info.family.title)) { bench = u; break; } }
    state.sessions = [{ id: '1', date: '2026-01-01T00:00:00Z', exercises: [{ varUuid: bench, sets: [{ w: 230, r: 3 }] }] }];
    const prog = computeAchievement(ACHIEVEMENT_PATHS.find(p => p.id === 'bench-plates'));
    return { reachedIdx: prog.reachedIdx, toGo: prog.toGo, cur: prog.curTxt, foundBench: !!bench };
  });
  expect(r.foundBench).toBe(true);
  expect(r.reachedIdx).toBe(1);        // 230 ≥ 225 (2 plates), < 315
  expect(r.toGo).toContain('3 plates'); // next milestone
  expect(r.toGo).toContain('85 lb');    // 315 − 230 = 85 to go
  expect(r.cur).toContain('230');
});

test('a cardio path reads the longest logged distance', async ({ page }) => {
  const r = await page.evaluate(() => {
    let run = null; for (const [u, info] of VAR_INDEX) { if (/run|jog/i.test(info.variation.title + ' ' + info.family.title)) { run = u; break; } }
    if (!run) return { skip: true };
    state.sessions = [{ id: '1', date: '2026-01-01T00:00:00Z', exercises: [{ varUuid: run, cardio: { distance: 12, distanceUnit: 'km', elapsedMin: 60 }, sets: [] }] }];
    return { reachedIdx: computeAchievement(ACHIEVEMENT_PATHS.find(p => p.id === 'run-distance')).reachedIdx };
  });
  if (!r.skip) expect(r.reachedIdx).toBe(1); // 12 km ≥ 10K, < 21.1K
});

test('renderAchievements shows the disclaimer, every path, and per-path safety notes', async ({ page }) => {
  const r = await page.evaluate(() => { state.sessions = []; return { html: renderAchievements(), n: ACHIEVEMENT_PATHS.length }; });
  expect(r.html).toContain('ach-disclaimer');
  expect(r.html).toMatch(/spotter|safety/);          // bench/squat safety
  expect(r.html).toContain('Captains of Crush');      // grip path
  expect(r.html).toContain('Marathon');               // cardio milestone
  expect(r.html).toMatch(/gradually|build up|\+10%/); // long-run caution
  expect((r.html.match(/ach-card/g) || []).length).toBe(r.n);
  expect(r.html).toContain('not yet');                // no data → not reached
});

test('the Trends tab exposes a Milestones sub-view', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [{ id: '1', date: new Date().toISOString(), exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }] }];
    trendView = 'milestones';
    const main = document.getElementById('trk-main');
    renderTrends(main);
    return { hasTab: !!main.querySelector('[data-trend="milestones"]'), hasAch: !!main.querySelector('.ach-card'), hasDisc: !!main.querySelector('.ach-disclaimer') };
  });
  expect(r.hasTab).toBe(true);
  expect(r.hasAch).toBe(true);
  expect(r.hasDisc).toBe(true);
});
