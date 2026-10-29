// feat 516 — target tiles for timed holds. Two holes put the all-time record above every tile: weight-0 holds
// (a plank) were skipped as "not a set", and one-tile-per-weight kept the FIRST ask at a weight (Prev top +1 s)
// instead of the hardest (the record +1 s). Holds also drop the Epley tiles — e1RM over seconds is meaningless.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exBestSets === 'function' && typeof renderModal === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// sessions: [[sets, daysAgo]], sets: [[w, r]]
const open = (page, mode, sessions, cur = []) => page.evaluate(({ mode, sessions, cur }) => {
  let v = null; for (const [u] of VAR_INDEX) if (exMode(u).mode === mode) { v = u; break; }
  state.readonly = false; state.unit = 'lb'; state.targetSort = 'order';
  const at = d => new Date(Date.now() - d * 864e5).toISOString();
  state.sessions = sessions.map(([sets, d], i) => {
    const ss = sets.map(([w, r]) => ({ w, r, ts: at(d) }));
    const top = ss.reduce((b, s) => (!b || (+s.w || 0) > (+b.w || 0) || ((+s.w || 0) === (+b.w || 0) && s.r > b.r)) ? s : b, null);
    return { id: 'h' + i, date: at(d), exercises: [{ varUuid: v, subUuid: null, sets: ss, topSet: { w: top.w, r: top.r } }] };
  });
  pending = { varUuid: v, subUuid: null, sets: cur.length ? cur.map(([w, r]) => ({ w, r, ts: r !== '' ? new Date().toISOString() : undefined })) : [{ w: '', r: '' }] };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true; renderModal();
  return [...document.querySelectorAll('#trk-targets .target-btn')].map(b => ({
    lbl: b.querySelector('.tb-lbl').textContent, ask: b.querySelector('b').textContent, w: +b.dataset.w, r: +b.dataset.r, hit: b.classList.contains('hit') }));
}, { mode, sessions, cur });

test('feat 516 — a bodyweight plank gets a tile that beats the longest hold', async ({ page }) => {
  // record 90 s three weeks ago; last time only 40 s
  const t = await open(page, 'time', [[[['', 40]], 2], [[[0, 90], [0, 60]], 20]]);
  const top = Math.max(...t.map(x => x.r));
  expect(t.length).toBeGreaterThan(0);
  expect(top, 'some tile beats the 90 s record').toBeGreaterThan(90);
  expect(t.find(x => x.r === 91)).toMatchObject({ lbl: 'Longest', ask: '1:31', w: 0 });
  expect(t.some(x => /e1RM|Wt PR/.test(x.lbl)), 'no Epley tiles over seconds').toBe(false);
});

test('feat 516 — a weighted hold: the record at each weight is beaten, heavier is offered too', async ({ page }) => {
  const t = await open(page, 'time', [[[[25, 30], [0, 70]], 3], [[[25, 45]], 15]]);
  const at = w => t.filter(x => x.w === w);
  expect(Math.max(...at(25).map(x => x.r))).toBeGreaterThan(45);  // never below the 25 lb record
  expect(at(0).length ? Math.max(...at(0).map(x => x.r)) : 999).toBeGreaterThan(70);
  expect(t.find(x => x.lbl === 'Heaviest'), 'a hold beats the heaviest by holding it longer, not by 1 s heavier')
    .toMatchObject({ w: 25, r: 46, ask: '25×0:46' });
});

test('feat 516 — a 0-weight hold tile goes green when the hold beats it, and tapping it starts the hold', async ({ page }) => {
  let t = await open(page, 'time', [[[[0, 60]], 5]], [[0, 61]]);
  expect(t.find(x => x.w === 0).hit).toBe(true);
  t = await open(page, 'time', [[[[0, 60]], 5]]);
  const r = await page.evaluate(() => {
    document.querySelector('#trk-targets .target-btn').click();
    return { w: pending.sets[0].w, started: !!pending.sets[0].wTs };
  });
  expect(r).toEqual({ w: 0, started: true });
});

test('feat 516 — a regular lift: one tile per weight is the HARDEST ask there, not the first', async ({ page }) => {
  // last time 200×5; the 200 lb record is 200×8 — Prev top (200×6) must not hide Max reps (200×9)
  const t = await open(page, 'standard', [[[[200, 5]], 2], [[[200, 8]], 30]]);
  const at200 = t.filter(x => x.w === 200);
  expect(at200).toHaveLength(1);
  expect(at200[0].r).toBe(9);
});
