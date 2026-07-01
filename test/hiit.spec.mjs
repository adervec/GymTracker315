// feat 295 — HIIT blocks: coach-driven interval workouts (a fixed series of timed work + rest steps). The
// engine flattens a block into steps, walks them with voice cues, lets you pause (recorded), and on finish logs
// the block to the session (per-exercise time sets + a hiitBlocks summary). Presets cover Tabata/HIIT/sprint/AMRAP.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof hiitFlatten === 'function' && typeof startHiitBlock === 'function'
    && typeof _hiitAdvance === 'function' && typeof hiitState === 'function' && typeof hiitPause === 'function'
    && typeof renderHiitPage === 'function' && typeof HIIT_BLOCKS !== 'undefined', null, { timeout: 15000 });
});

test('feat 295 — hiitFlatten expands rounds with no trailing rest and rotates exercises', async ({ page }) => {
  const r = await page.evaluate(() => {
    const steps = hiitFlatten({ prep: 5, work: 30, rest: 15, rounds: 3, exercises: ['A', 'B'] });
    return { kinds: steps.map(s => s.kind), vars: steps.filter(s => s.kind === 'work').map(s => s.varUuid), rounds: steps.filter(s => s.kind === 'work').map(s => s.round) };
  });
  expect(r.kinds).toEqual(['prep', 'work', 'rest', 'work', 'rest', 'work']); // no rest after the last round
  expect(r.vars).toEqual(['A', 'B', 'A']);                                   // exercises rotate
  expect(r.rounds).toEqual([1, 2, 3]);
});

test('feat 295 — every preset references real exercises and has sane timing', async ({ page }) => {
  const bad = await page.evaluate(() => {
    const out = [];
    HIIT_BLOCKS.forEach(b => {
      if (!(b.work > 0 && b.rounds > 0)) out.push(b.id + ':timing');
      (b.exercises || []).forEach(u => { if (!VAR_INDEX.get(u)) out.push(b.id + ':' + u); });
    });
    return { out, count: HIIT_BLOCKS.length, ids: new Set(HIIT_BLOCKS.map(b => b.id)).size };
  });
  expect(bad.out).toEqual([]);
  expect(bad.count).toBeGreaterThanOrEqual(6);
  expect(bad.ids).toBe(bad.count);   // unique block ids
});

test('feat 295 — the engine walks work/rest steps and logs the block to the session on finish', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false; state.sessions = [];
    startHiitBlock('tabata-classic');   // prep + (work20, rest10)×8, no trailing rest → 1 + 8 + 7 = 16 steps
    const stepCount = hiitState().steps.length, firstKind = hiitState().steps[0].kind;
    let guard = 0; while (hiitActive() && guard++ < 200) _hiitAdvance(false);
    const sess = state.sessions[state.sessions.length - 1];
    const ex = (sess.exercises || [])[0];
    return {
      stepCount, firstKind, finished: !hiitActive(),
      hiitBlocks: (sess.hiitBlocks || []).length, blockRounds: sess.hiitBlocks && sess.hiitBlocks[0].rounds,
      blockName: sess.hiitBlocks && sess.hiitBlocks[0].name,
      workSets: ex ? ex.sets.length : 0, setSec: ex && ex.sets[0] ? ex.sets[0].r : null, hiitFlag: ex && ex.sets[0] ? ex.sets[0].hiit : null,
    };
  });
  expect(r.firstKind).toBe('prep');
  expect(r.stepCount).toBe(16);
  expect(r.finished).toBe(true);
  expect(r.hiitBlocks).toBe(1);
  expect(r.blockName).toBe('Tabata Classic');
  expect(r.blockRounds).toBe(8);     // 8 work intervals
  expect(r.workSets).toBe(8);
  expect(r.setSec).toBe(20);         // each work = 20s
  expect(r.hiitFlag).toBe(true);
});

test('feat 295 — pausing is recorded (count + seconds) in the block summary', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false; state.sessions = [];
    startHiitBlock('tabata-mixed');
    hiitPause();
    hiitState().pauseStartMs -= 4000;   // simulate ~4 s paused
    hiitResume();
    const afterResume = { paused: hiitState().paused, pausedMs: hiitState().pausedMs, pauseCount: hiitState().pauseCount };
    let g = 0; while (hiitActive() && g++ < 200) _hiitAdvance(false);
    const blk = state.sessions[state.sessions.length - 1].hiitBlocks[0];
    return { afterResume, pausedSec: blk.pausedSec, pauses: blk.pauses };
  });
  expect(r.afterResume.paused).toBe(false);
  expect(r.afterResume.pauseCount).toBe(1);
  expect(r.afterResume.pausedMs).toBeGreaterThanOrEqual(4000);
  expect(r.pauses).toBe(1);
  expect(r.pausedSec).toBeGreaterThanOrEqual(4);   // the pause is recorded
});

test('feat 295/404 — the launcher lists every block; starting confirms a size, then opens the runner', async ({ page }) => {
  const r = await page.evaluate(async () => {
    state.readonly = false;
    navTo('hiit');
    const main = document.getElementById('trk-main');
    const cards = main.querySelectorAll('.hiit-card').length, starts = main.querySelectorAll('[data-hiit-start]').length;
    main.querySelector('[data-hiit-start]').click();      // feat 404 — opens the size sheet, NOT the runner directly
    await new Promise(r => setTimeout(r, 10));
    const sawSizes = ['Small', 'Medium', 'Large'].every(s => [...document.querySelectorAll('.choice-btn')].some(b => b.textContent.includes(s)));
    const runnerBeforePick = document.getElementById('hiit-runner').classList.contains('open');
    [...document.querySelectorAll('.choice-actions .choice-btn')].find(b => /Medium/.test(b.textContent)).click(); // pick a size
    await new Promise(r => setTimeout(r, 10));
    const runner = document.getElementById('hiit-runner');
    const open = runner.classList.contains('open'), hasTimer = !!runner.querySelector('.hiit-timer'), active = hiitActive();
    hiitStop();
    return { page: currentPage, cards, starts, sawSizes, runnerBeforePick, open, hasTimer, active, closed: !document.getElementById('hiit-runner').classList.contains('open'), stillActive: hiitActive() };
  });
  expect(r.page).toBe('hiit');
  expect(r.cards).toBe(7);
  expect(r.starts).toBe(7);
  expect(r.sawSizes).toBe(true);         // the size sheet offers Small / Medium / Large
  expect(r.runnerBeforePick).toBe(false); // the runner doesn't start until a size is picked
  expect(r.open).toBe(true);
  expect(r.hasTimer).toBe(true);
  expect(r.active).toBe(true);
  expect(r.closed).toBe(true);
  expect(r.stillActive).toBe(false);
});

test('feat 404 — the all-jump-rope Tabata block exists and uses only jump-rope variations', async ({ page }) => {
  const r = await page.evaluate(() => {
    const b = HIIT_BLOCKS.find(x => x.id === 'jumprope-hiit');
    const fam = (u) => { const i = VAR_INDEX.get(u); return i ? i.family.id : null; };
    return { exists: !!b, name: b && b.name, allRope: !!b && b.exercises.every(u => fam(u) === 'jump-rope-skills'), count: b && b.exercises.length };
  });
  expect(r.exists).toBe(true);
  expect(r.name).toMatch(/Jump Rope/);
  expect(r.allRope).toBe(true);          // every work exercise is a jump-rope variation
  expect(r.count).toBeGreaterThanOrEqual(3);
});

test('feat 404 — Small / Medium / Large scale the block (rounds, or work seconds for a single-round AMRAP)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const tab = HIIT_BLOCKS.find(x => x.id === 'jumprope-hiit'); // 8 rounds
    const amrap = HIIT_BLOCKS.find(x => x.id === 'amrap-six');   // 1 round, 360s work
    return {
      s: _hiitSized(tab, 0.5).rounds, m: _hiitSized(tab, 1).rounds, l: _hiitSized(tab, 1.5).rounds,
      amrapS: _hiitSized(amrap, 0.5).work, amrapM: _hiitSized(amrap, 1).work, amrapL: _hiitSized(amrap, 1.5).work,
    };
  });
  expect(r.s).toBe(4); expect(r.m).toBe(8); expect(r.l).toBe(12);       // multi-round → rounds scale
  expect(r.amrapS).toBe(180); expect(r.amrapM).toBe(360); expect(r.amrapL).toBe(540); // single-round → work scales
});
