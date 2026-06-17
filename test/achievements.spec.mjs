// feat 169 — achievement paths: ladders of classic milestones (plate-count lifts, CoC grip ladder, cardio
// distances) read from your own logged best (not strict on variation/aids), each with a safety note + a
// prominent disclaimer discouraging dangerous behaviour.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.computeAchievement === 'function' && typeof window.renderAchievements === 'function' && typeof ACHIEVEMENT_PATHS !== 'undefined', null, { timeout: 15000 });
});

test('a strength path reaches the right tier from your best barbell lift', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.unit = 'lb';
    const path = ACHIEVEMENT_PATHS.find(p => p.id === 'bench-plates');
    let bench = null; for (const [u, info] of VAR_INDEX) { const n = info.variation.title + ' ' + info.family.title; if (path.kw.test(n) && !path.exclude.test(n)) { bench = u; break; } }
    state.sessions = [{ id: '1', date: '2026-01-01T00:00:00Z', exercises: [{ varUuid: bench, sets: [{ w: 230, r: 3 }] }] }];
    const prog = computeAchievement(path);
    return { reachedIdx: prog.reachedIdx, toGo: prog.toGo, cur: prog.curTxt, foundBench: !!bench };
  });
  expect(r.foundBench).toBe(true);
  expect(r.reachedIdx).toBe(1);        // 230 ≥ 225 (2 plates), < 315
  expect(r.toGo).toContain('3 plates'); // next milestone
  expect(r.toGo).toContain('85 lb');    // 315 − 230 = 85 to go
  expect(r.cur).toContain('230');
});

test('feat 253 — the barbell exclude regexes drop hack/Smith/leg-press/RDL but keep the barbell lift', async ({ page }) => {
  const r = await page.evaluate(() => {
    const sq = ACHIEVEMENT_PATHS.find(p => p.id === 'squat-plates');
    const counts = (s) => sq.kw.test(s) && !sq.exclude.test(s); // counts toward the barbell squat milestone?
    return {
      back: counts('Barbell Back Squat'), front: counts('Barbell Front Squat'),
      hack: counts('Hack Squat'), smith: counts('Smith Machine Squat'), goblet: counts('Goblet Squat'), split: counts('Bulgarian Split Squat'),
      benchSmith: ACHIEVEMENT_PATHS.find(p => p.id === 'bench-plates').exclude.test('Smith Machine Bench Press'),
      deadRdl: ACHIEVEMENT_PATHS.find(p => p.id === 'deadlift-plates').exclude.test('Romanian Deadlift'),
    };
  });
  expect(r.back).toBe(true);
  expect(r.front).toBe(true);
  expect(r.hack).toBe(false);     // the user's example — hack squat no longer counts
  expect(r.smith).toBe(false);
  expect(r.goblet).toBe(false);
  expect(r.split).toBe(false);
  expect(r.benchSmith).toBe(true);
  expect(r.deadRdl).toBe(true);
});

test('feat 253 — an easier variation logged heavier does NOT inflate the barbell milestone', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.unit = 'lb';
    const path = ACHIEVEMENT_PATHS.find(p => p.id === 'squat-plates');
    let bb = null, easy = null;
    for (const [u, info] of VAR_INDEX) {
      const n = info.variation.title + ' ' + info.family.title;
      if (!path.kw.test(n)) continue;
      if (path.exclude.test(n)) { if (!easy) easy = u; } else if (!bb) bb = u;
      if (bb && easy) break;
    }
    if (!bb || !easy) return { skip: true };
    state.sessions = [{ id: '1', date: '2026-01-01T00:00:00Z', exercises: [
      { varUuid: easy, sets: [{ w: 600, r: 5 }] },  // excluded → must not count
      { varUuid: bb, sets: [{ w: 315, r: 3 }] },    // barbell → counts
    ] }];
    const prog = computeAchievement(path);
    return { cur: prog.curTxt, reachedIdx: prog.reachedIdx };
  });
  if (r.skip) return; // catalogue lacks both variation kinds — the regex test above still guards the behaviour
  expect(r.cur).toContain('315');     // the barbell best…
  expect(r.cur).not.toContain('600'); // …not the easier variation
  expect(r.reachedIdx).toBe(2);       // 315 = 3 plates
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
