// feat 538 — the next-set coach: one weight × reps ask from capacity, learned per-set fatigue, today's sets,
// rest, heart rate, readiness, deload and the plan step's load.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof nextSetCoach === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
    null, { timeout: 15000 });
  // a barbell bench with four sessions of history around 100kg × 6-8, and a live session started 20 min ago
  await page.evaluate(() => {
    state.unit = 'kg'; state.exerciseMaxW = {};
    let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') { v = u; break; }
    window._v = v;
    const at = d => new Date(Date.now() - d * 864e5).toISOString();
    const mk = (d, sets) => ({ id: 'h' + d, date: at(d), endedAt: at(d), exercises: [{ varUuid: v, subUuid: null, sets: sets.map(([w, r]) => ({ w, r })) }] });
    state.sessions = [mk(4, [[60, 10], [100, 8], [100, 7], [100, 6]]), mk(8, [[100, 7], [100, 6], [100, 6]]),
      mk(12, [[97.5, 8], [97.5, 7], [97.5, 6]]), mk(16, [[95, 8], [95, 8], [95, 7]])];
    state.sessions.push({ id: 'live', date: new Date(Date.now() - 20 * 60000).toISOString(), exercises: [] });
    pending = { varUuid: v, subUuid: null, sets: [] };
    window._done = (w, r, agoSec) => pending.sets.push({ w, r, wTs: new Date(Date.now() - (agoSec + 40) * 1000).toISOString(), ts: new Date(Date.now() - agoSec * 1000).toISOString() });
  });
});

test('feat 538 — a fresh first set asks about last time, inside the usual rep window, with honest odds', async ({ page }) => {
  const c = await page.evaluate(() => nextSetCoach(_v, null));
  expect(c.w).toBeGreaterThanOrEqual(95);
  expect(c.w).toBeLessThanOrEqual(102.5);
  expect(c.r).toBeGreaterThanOrEqual(c.lo - 1);    // feat 540 — one rep under the window to stay on the plates
  expect(c.r).toBeLessThanOrEqual(c.hi);
  expect(c.odds).toBeGreaterThanOrEqual(65);
  expect(c.odds).toBeLessThanOrEqual(95);
  expect(c.learnedDrop).not.toBeNull();             // 8+ working-set pairs in the history → its own drop-off
  expect(c.why.join(' ')).toContain('Capacity');
});

test('feat 538 — fatigue and rest: a short rest asks for less than a full one, and both less than fresh', async ({ page }) => {
  const r = await page.evaluate(() => {
    const e = c => estimated1RM(c.w, c.r + c.rir);   // the capacity the ask implies
    const fresh = nextSetCoach(_v, null);
    _done(100, 8, 30); const short = nextSetCoach(_v, null);
    pending.sets[0].ts = new Date(Date.now() - 400e3).toISOString(); const full = nextSetCoach(_v, null);
    return { fresh: e(fresh), short: e(short), full: e(full), shortWhy: short.why.join(' '), fullWhy: full.why.join(' ') };
  });
  expect(r.short).toBeLessThan(r.full);
  expect(r.full).toBeLessThanOrEqual(r.fresh);
  expect(r.shortWhy).toMatch(/Rested .* until you're recovered/);
  expect(r.fullWhy).toContain('recovered from the last set');
});

test('feat 538 — a still-racing heart rate shades the ask and says to wait', async ({ page }) => {
  const r = await page.evaluate(() => {
    const live = state.sessions.find(s => s.id === 'live'), t0 = new Date(live.date).getTime();
    _done(100, 8, 400); _done(97.5, 8, 400);          // two sets, each started at ~100 bpm
    live.hrSamples = pending.sets.map(s => [new Date(s.wTs).getTime() - t0, 100]);
    _hrConnected = true; _hrLastBpm = 100; const calm = nextSetCoach(_v, null);
    _hrLastBpm = 130; const racing = nextSetCoach(_v, null);
    _hrConnected = false;
    return { calm: calm.avail, racing: racing.avail, why: racing.why.join(' '), calmWhy: calm.why.join(' ') };
  });
  expect(r.racing).toBeLessThan(r.calm);
  expect(r.why).toContain('HR 130');
  expect(r.why).toContain('more rest');
  expect(r.calmWhy).toContain('back to your usual set-start level');
});

test('feat 538 — a heavy plan step moves the window to 3-6; a deload week lightens and adds reserve', async ({ page }) => {
  const r = await page.evaluate(() => {
    const id = 'p-ns'; state.plans.push({ id, name: 'Heavy day', steps: [{ id: 's1', sets: 3, options: [{ type: 'variation', uuid: _v }], load: 'heavy' }] });
    const live = state.sessions.find(s => s.id === 'live'); live.planId = id;
    const heavy = nextSetCoach(_v, null);
    live.planId = null;
    const normal = nextSetCoach(_v, null);
    const orig = mesoCurrentWeek; mesoCurrentWeek = () => ({ phase: 'Deload' });
    const deload = nextSetCoach(_v, null);
    mesoCurrentWeek = orig;
    return { heavy: [heavy.lo, heavy.hi, heavy.r, heavy.w], normalW: normal.w, normalAvail: normal.avail, deloadAvail: deload.avail, deloadRir: deload.rir, normalRir: normal.rir };
  });
  expect(r.heavy.slice(0, 2)).toEqual([3, 6]);
  expect(r.heavy[2]).toBeLessThanOrEqual(6);
  expect(r.heavy[3]).toBeGreaterThanOrEqual(r.normalW); // fewer reps → at least as heavy (feat 540: 100 is the heaviest ever used)
  expect(r.deloadAvail).toBeLessThan(r.normalAvail);
  expect(r.deloadRir).toBeGreaterThan(r.normalRir);
});

test('feat 538 — the card renders above the targets; Use prefills the weight; why expands', async ({ page }) => {
  const r = await page.evaluate(() => {
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    const card = document.getElementById('trk-nextset');
    const ask = card.querySelector('.ns-ask').textContent, w = +card.querySelector('[data-ns-use]').dataset.nsUse;
    card.querySelector('[data-ns-why]').click();
    const whyItems = document.querySelectorAll('#trk-nextset .ns-why li').length;
    document.querySelector('#trk-nextset [data-ns-use]').click();
    return { ask, w, whyItems, prefilled: parseFloat(pending.sets[0] && pending.sets[0].w) };
  });
  expect(r.ask).toContain(String(r.w));
  expect(r.whyItems).toBeGreaterThanOrEqual(3);
  expect(r.prefilled).toBe(r.w);
});

test('feat 538 — no card for a hold, a cardio pick or an exercise never done', async ({ page }) => {
  const r = await page.evaluate(() => {
    let hold = null, fresh = null;
    for (const [u] of VAR_INDEX) { if (!hold && exMode(u).mode === 'time') hold = u; if (!fresh && exMode(u).mode === 'standard' && u !== _v && !isCardioVar(u)) fresh = u; if (hold && fresh) break; }
    return { hold: nextSetCoach(hold, null), fresh: nextSetCoach(fresh, null) };
  });
  expect(r.hold).toBeNull();
  expect(r.fresh).toBeNull();
});

test('feat 540 — only weights you have used are offered, a typed weight is worked around, and full rest is previewed', async ({ page }) => {
  const r = await page.evaluate(() => {
    const used = new Set([60, 95, 97.5, 100]);
    const asks = [nextSetCoach(_v, null)];
    _done(100, 7, 30); asks.push(nextSetCoach(_v, null));                       // went in early
    const early = asks[1];
    pending.sets[0].ts = new Date(Date.now() - 400e3).toISOString(); asks.push(nextSetCoach(_v, null));
    const rested = asks[2];
    pending.sets.push({ w: 80, r: '', wTs: new Date().toISOString() });          // you typed 80 for the next set
    const at80 = nextSetCoach(_v, null);
    pending.sets[1].w = 105; const at105 = nextSetCoach(_v, null);
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    const card = document.getElementById('trk-nextset');
    return { allUsed: asks.every(c => used.has(c.w)), early: early.rested, restedNow: rested.rested,
      at80: [at80.w, at80.r, at80.picked], at105: [at105.w, at105.r], noUse: !card.querySelector('[data-ns-use]'),
      lbl: card.querySelector('.ns-lbl').textContent };
  });
  expect(r.allUsed).toBe(true);
  expect(r.early).not.toBeNull();                       // resting → the full-rest ask is previewed
  expect(r.early.inSec).toBeGreaterThan(0);
  expect(r.restedNow).toBeNull();                       // already recovered → nothing to preview
  expect(r.at80[0]).toBe(80);                           // 80 was never used, but you picked it
  expect(r.at80[2]).toBe(true);
  expect(r.at80[1]).toBeGreaterThan(r.at105[1]);        // lighter → more reps
  expect(r.at105[0]).toBe(105);
  expect(r.noUse).toBe(true);                           // the weight is already in: no Use button
  expect(r.lbl).toContain('at your weight');
});

test('feat 540 — the card shows the full-rest preview line while resting', async ({ page }) => {
  const r = await page.evaluate(() => {
    _done(100, 7, 20);
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    const el = document.querySelector('#trk-nextset .ns-rest');
    return el ? el.textContent : null;
  });
  expect(r).toMatch(/At full rest \(in \d/);
});

test('feat 547 — the S-rank set: the cheapest new e1RM best, only while realistic and not yet earned', async ({ page }) => {
  const r = await page.evaluate(() => {
    const thr = Math.max(...getHistoryByKey(_v, null).map(h => h.topSet.oneRM));
    const fresh = nextSetCoach(_v, null).sRank;
    _done(100, 7, 30);
    const early = nextSetCoach(_v, null).sRank;
    pending.sets.push({ w: 97.5, r: '', wTs: new Date().toISOString() });       // a weight you typed
    const picked = nextSetCoach(_v, null).sRank;
    pending.sets = []; _done(100, 9, 300);                                        // already beat it today
    const earned = nextSetCoach(_v, null).sRank;
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false;
    pending.sets = []; renderModal();
    const line = document.querySelector('#trk-nextset .ns-srank');
    return { thr, fresh, beats: fresh && estimated1RM(fresh.w, fresh.r) > thr, oneLess: fresh && estimated1RM(fresh.w, fresh.r - 1) > thr, early, picked, earned,
      line: line ? line.textContent : null };
  });
  expect(r.fresh).not.toBeNull();
  expect(r.beats).toBe(true);
  expect(r.oneLess).toBe(false);                     // the cheapest rep count at that weight
  expect(r.fresh.odds).toBeGreaterThanOrEqual(20);
  expect(r.early.restedOdds).toBeGreaterThan(r.early.odds);
  expect(r.picked.w).toBe(97.5);
  expect(r.earned).toBeNull();
  expect(r.line).toMatch(/S set: .* · \d+%/);
});
