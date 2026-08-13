// feat 480 — Log ▸ Plans. The List view answers "what did I lift"; this one answers "which plans have I
// actually done, and when" — the question you ask when deciding what to run next. Two readings of the same
// history: BY DATE (one row per run) and BY PLAN (one row per plan, with run count and last date).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderLogPlans === 'function' && typeof planLogRuns === 'function'
    && (state.plans || []).length > 2, null, { timeout: 15000 });
  await page.evaluate(() => {
    state.readonly = false;
    _planLogMode = 'date'; _planLogSort = 'date'; _planLogDesc = true; _planLogUnplanned = false; _planLogOnly = null;
    const P = state.plans.slice(0, 3);
    const uuid = [...VAR_INDEX.keys()][0];
    const mk = (d, plan, nSets) => ({ id: 'S' + d, date: new Date(Date.now() - d * 86400000).toISOString(),
      endedAt: new Date(Date.now() - d * 86400000 + 3600000).toISOString(), planId: plan ? plan.id : undefined,
      exercises: [{ varUuid: uuid, subUuid: null, sets: Array.from({ length: nSets }, () => ({ w: 100, r: 8 })) }] });
    // Push ×3, Pull ×1, Legs ×1, plus one unplanned workout
    state.sessions = [mk(1, P[0], 18), mk(3, P[1], 14), mk(6, P[0], 20), mk(9, null, 9), mk(12, P[2], 16), mk(15, P[0], 17)];
    window.__P = P.map(p => ({ id: p.id, name: p.name }));
    navTo('log'); _logView = 'plans'; render();
  });
});

test('feat 480 — Plans is a third log view, alongside List and Calendar', async ({ page }) => {
  const r = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('[data-log-view]')].map(b => b.dataset.logView);
    const activeNow = document.querySelector('[data-log-view="plans"]').classList.contains('active');
    // switching away and back is lossless
    document.querySelector('[data-log-view="list"]').click();
    const listShown = _logView === 'list' && !document.querySelector('.pl-row');
    document.querySelector('[data-log-view="plans"]').click();
    return { chips, activeNow, listShown, backToPlans: !!document.querySelector('.pl-row') };
  });
  expect(r.chips).toEqual(['list', 'calendar', 'plans']);
  expect(r.activeNow).toBe(true);
  expect(r.listShown, 'the other views still work').toBe(true);
  expect(r.backToPlans).toBe(true);
});

test('feat 480 — by date: one row per plan run, newest first, with steps / sets / grade', async ({ page }) => {
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.pl-row')];
    return {
      n: rows.length,
      runs: planLogRuns().length,
      names: rows.map(x => x.querySelector('.pl-name').textContent),
      newestFirst: planLogRuns().slice().sort((a, b) => b.ts - a.ts).map(x => x.ts)
        .every((t, i, arr) => i === 0 || arr[i - 1] >= t),
      firstIsNewest: rows[0].querySelector('.pl-name').textContent === window.__P[0].name,
      sets: rows.map(x => +x.children[3].textContent),
      // an unplanned session is excluded by default — this view is about PLANS
      excludesUnplanned: planLogRuns().every(x => x.planned),
      sessionCount: state.sessions.length,
      // each row opens the existing Plan Execution View rather than a new screen
      opensExec: rows.every(x => x.hasAttribute('data-plan-exec-sess') && x.hasAttribute('data-plan-exec-id')),
    };
  });
  expect(r.n, 'five plan runs out of six sessions').toBe(5);
  expect(r.runs).toBe(5);
  expect(r.sessionCount).toBe(6);
  expect(r.excludesUnplanned).toBe(true);
  expect(r.newestFirst).toBe(true);
  expect(r.firstIsNewest).toBe(true);
  expect(r.sets[0]).toBe(18);
  expect(r.opensExec, 'reuses the existing execution view').toBe(true);
});

test('feat 480 — by plan: one row per plan with its run count and last date', async ({ page }) => {
  const r = await page.evaluate(() => {
    document.querySelector('[data-planlog-mode="plan"]').click();
    const rows = [...document.querySelectorAll('.pl-row')];
    const byPlan = planLogByPlan();
    return {
      n: rows.length,
      names: rows.map(x => x.querySelector('.pl-name').textContent),
      runs: rows.map(x => x.querySelector('.pl-runs').textContent),
      pushRuns: (byPlan.find(e => e.name === window.__P[0].name) || {}).runs,
      pullRuns: (byPlan.find(e => e.name === window.__P[1].name) || {}).runs,
      // avg sets, not total — three Push runs of 18/20/17
      pushAvg: +rows.find(x => x.querySelector('.pl-name').textContent === window.__P[0].name).children[3].textContent,
      summary: document.querySelector('.pl-sum').textContent,
    };
  });
  expect(r.n, 'three distinct plans').toBe(3);
  expect(r.pushRuns).toBe(3);
  expect(r.pullRuns).toBe(1);
  expect(r.runs[0]).toBe('3×');
  expect(r.pushAvg, 'the average of 18/20/17').toBe(18);
  expect(r.summary).toContain('5 runs');
  expect(r.summary).toContain('3 plans');
});

test('feat 480 — a plan row drills into that plan\'s own runs, and clears back', async ({ page }) => {
  const r = await page.evaluate(() => {
    document.querySelector('[data-planlog-mode="plan"]').click();
    document.querySelector('[data-planlog-plan]').click();      // the top plan — Push, 3 runs
    const drilled = {
      mode: _planLogMode, only: _planLogOnly,
      rows: document.querySelectorAll('.pl-row').length,
      allSamePlan: [...document.querySelectorAll('.pl-row')].every(x => x.querySelector('.pl-name').textContent === window.__P[0].name),
      note: !!document.querySelector('.pl-filter'),
    };
    document.querySelector('#pl-clear').click();
    return { drilled, clearedRows: document.querySelectorAll('.pl-row').length, clearedOnly: _planLogOnly };
  });
  expect(r.drilled.mode, 'drilling switches to the per-run view').toBe('date');
  expect(r.drilled.rows).toBe(3);
  expect(r.drilled.allSamePlan).toBe(true);
  expect(r.drilled.note, 'and says what it is filtered to').toBe(true);
  expect(r.clearedRows).toBe(5);
  expect(r.clearedOnly).toBeNull();
});

test('feat 480 — the Unplanned toggle folds plan-less workouts in, labelled', async ({ page }) => {
  const r = await page.evaluate(() => {
    const before = document.querySelectorAll('.pl-row').length;
    document.querySelector('[data-planlog-unplanned]').click();
    const rows = [...document.querySelectorAll('.pl-row')];
    const unplanned = rows.filter(x => x.classList.contains('unplanned'));
    const out = { before, after: rows.length, unplannedRows: unplanned.length,
      label: unplanned[0] && unplanned[0].querySelector('.pl-name').textContent,
      notClickable: unplanned.every(x => !x.hasAttribute('data-plan-exec-sess')),
      steps: unplanned[0] && unplanned[0].querySelector('.pl-steps').textContent.trim() };
    document.querySelector('[data-planlog-unplanned]').click();
    out.backOff = document.querySelectorAll('.pl-row').length;
    return out;
  });
  expect(r.before).toBe(5);
  expect(r.after, 'the sixth session appears').toBe(6);
  expect(r.unplannedRows).toBe(1);
  expect(r.label, 'labelled by its inferred split, or plainly Unplanned').toBeTruthy();
  expect(r.notClickable, 'no plan means no execution view to open').toBe(true);
  expect(r.steps, 'and no step count to show').toBe('–');
  expect(r.backOff).toBe(5);
});

test('feat 480 — every column sorts, and tapping the active one flips direction', async ({ page }) => {
  const r = await page.evaluate(() => {
    const names = () => [...document.querySelectorAll('.pl-row .pl-name')].map(x => x.textContent);
    const sets = () => [...document.querySelectorAll('.pl-row')].map(x => +x.children[3].textContent);
    const out = { cols: [...document.querySelectorAll('[data-planlog-sort]')].map(b => b.dataset.planlogSort) };
    document.querySelector('[data-planlog-sort="sets"]').click();
    out.setsDesc = sets();
    document.querySelector('[data-planlog-sort="sets"]').click();
    out.setsAsc = sets();
    document.querySelector('[data-planlog-sort="name"]').click();
    out.byName = names();
    out.activeMarked = document.querySelector('[data-planlog-sort="name"]').classList.contains('on');
    return out;
  });
  expect(r.cols).toEqual(['date', 'name', 'steps', 'sets', 'grade']);
  expect(r.setsDesc).toEqual([...r.setsDesc].sort((a, b) => b - a));
  expect(r.setsAsc, 'the same column tapped again flips').toEqual([...r.setsAsc].sort((a, b) => a - b));
  expect(r.byName).toEqual([...r.byName].sort().reverse());
  expect(r.activeMarked).toBe(true);
});

test('feat 480 — an empty history explains itself instead of showing a bare table', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; render();
    return { rows: document.querySelectorAll('.pl-row').length,
      msg: document.querySelector('.card-title').textContent,
      mentionsUnplanned: document.body.textContent.includes('Unplanned') };
  });
  expect(r.rows).toBe(0);
  expect(r.msg).toContain('No plan runs yet');
  expect(r.mentionsUnplanned, 'and points at the toggle that might reveal some').toBe(true);
});
