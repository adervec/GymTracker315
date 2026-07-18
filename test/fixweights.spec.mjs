// feat 429 — fix logged weights: rescale a variation's history where the machine's TOTAL weight was
// recorded instead of the per-stack / per-hand weight (e.g. halve last month's MTS presses when
// switching to logging one stack). Variation-scoped, date-range limited, dry-run preview, sync-safe.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof rescaleVariationWeights === 'function'
    && typeof showFixWeightsPopup === 'function' && typeof openLogModal === 'function', null, { timeout: 15000 });
});

// two standard variations: sessions at 40 / 20 / 10 days ago (the 10-day one is the OTHER variation)
const seed = (page) => page.evaluate(() => {
  const vars = [];
  for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { vars.push(u); if (vars.length === 2) break; } }
  const [target, other] = vars;
  const sess = (daysAgo, varUuid, sets) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - daysAgo);
    return { id: 'fw' + daysAgo, date: d.toISOString(), updatedAt: '2026-01-01T00:00:00.000Z',
      exercises: [{ varUuid, subUuid: null, sets }] };
  };
  state.readonly = false;
  state.sessions = [
    sess(40, target, [{ w: 100, r: 5 }]),
    sess(20, target, [{ w: 90, r: 8 }, { w: 100, r: 3 }, { w: '', r: '' }]),
    sess(10, other, [{ w: 50, r: 5 }]),
  ];
  return { target, other };
});

test('feat 429 — rescale is variation-scoped, range-limited, and dry-run counts without touching data', async ({ page }) => {
  const ids = await seed(page);
  const r = await page.evaluate(({ target, other }) => {
    const since30 = Date.now() - 30 * 86400000;
    const dry = rescaleVariationWeights(target, 0.5, since30, false);
    const untouched = state.sessions[1].exercises[0].sets.map(s => s.w);
    const applied = rescaleVariationWeights(target, 0.5, since30, true);
    return {
      dry, applied, untouched,
      s40: state.sessions[0].exercises[0].sets.map(s => s.w),
      s20: state.sessions[1].exercises[0].sets.map(s => s.w),
      s10: state.sessions[2].exercises[0].sets.map(s => s.w),
      upd40: state.sessions[0].updatedAt, upd20: state.sessions[1].updatedAt, upd10: state.sessions[2].updatedAt,
    };
  }, ids);
  expect(r.dry).toEqual({ sets: 2, sessions: 1 });
  expect(r.untouched).toEqual([90, 100, '']);          // dry run changed nothing
  expect(r.applied).toEqual({ sets: 2, sessions: 1 });
  expect(r.s40).toEqual([100]);                        // outside the 30-day range
  expect(r.s20).toEqual([45, 50, '']);                 // halved; empty set untouched
  expect(r.s10).toEqual([50]);                         // other variation untouched
  expect(r.upd20 > '2026-01-01').toBe(true);           // touched session re-stamped for the sync merge
  expect(r.upd40).toBe('2026-01-01T00:00:00.000Z');    // untouched sessions keep their stamp
  expect(r.upd10).toBe('2026-01-01T00:00:00.000Z');
});

test('feat 429 — all-time range catches the old session too; factor 2 reverses', async ({ page }) => {
  const ids = await seed(page);
  const r = await page.evaluate(({ target }) => {
    const all = rescaleVariationWeights(target, 2, 0, true);
    return { all, s40: state.sessions[0].exercises[0].sets.map(s => s.w), s20: state.sessions[1].exercises[0].sets.map(s => s.w) };
  }, ids);
  expect(r.all).toEqual({ sets: 3, sessions: 2 });
  expect(r.s40).toEqual([200]);
  expect(r.s20).toEqual([180, 200, '']);
});

test('feat 429 — the sheet previews, and Apply → confirm rewrites and closes', async ({ page }) => {
  const ids = await seed(page);
  const r = await page.evaluate(async ({ target }) => {
    pending = { varUuid: target, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; renderModal();
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    showFixWeightsPopup();
    const sheet = [...document.querySelectorAll('.choice-backdrop')].pop();
    const preview30 = sheet.querySelector('#fixw-preview').textContent;
    sheet.querySelector('[data-fixw-since="0"]').click();          // All time
    const previewAll = sheet.querySelector('#fixw-preview').textContent;
    sheet.querySelector('[data-fixw="apply"]').click();            // → confirm dialog on top
    await new Promise(res => setTimeout(res, 50));
    const confirm = [...document.querySelectorAll('.choice-backdrop')].pop();
    const confirmMsg = confirm.querySelector('.choice-msg').textContent;
    confirm.querySelector('.choice-btn.danger').click();           // danger:true → the OK button
    await new Promise(res => setTimeout(res, 50));
    const weights = state.sessions[1].exercises[0].sets.map(s => s.w);
    closeLogModal();
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    return { preview30, previewAll, confirmMsg, weights };
  }, ids);
  expect(r.preview30).toContain('2 sets across 1 session');
  expect(r.previewAll).toContain('3 sets across 2 sessions');
  expect(r.confirmMsg).toContain('by 0.5');
  expect(r.weights).toEqual([45, 50, '']);
});

// feat 437 — reconcile history with the feat-434 exercise cap: lower offending sets to it, or remove them
test('feat 437 — capViolationFix lowers or removes only over-cap sets, dry-run counts first', async ({ page }) => {
  const ids = await seed(page);
  const r = await page.evaluate(({ target }) => {
    state.exerciseMaxW = {}; setExMaxW(target, 95);
    const dry = capViolationFix(target, 'lower', false);
    const untouched = state.sessions.map(s => s.exercises.length);
    const lowered = capViolationFix(target, 'lower', true);
    const afterLower = { s40: state.sessions[0].exercises[0].sets.map(x => x.w), s20: state.sessions[1].exercises[0].sets.map(x => x.w) };
    // re-seed the over-cap sets, then remove them instead
    state.sessions[0].exercises[0].sets = [{ w: 100, r: 5 }];
    state.sessions[1].exercises[0].sets = [{ w: 90, r: 8 }, { w: 100, r: 3 }, { w: '', r: '' }];
    const removed = capViolationFix(target, 'remove', true);
    const afterRemove = {
      s40ex: state.sessions[0].exercises.length,                       // emptied exercise dropped
      s20: state.sessions[1].exercises[0].sets.map(x => x.w),          // under-cap + empty sets stay
      upd40: state.sessions[0].updatedAt > '2026-01-01',
    };
    setExMaxW(target, 0);
    return { dry, untouched, lowered, afterLower, removed, afterRemove };
  }, ids);
  expect(r.dry).toEqual({ sets: 2, sessions: 2 });      // the two 100s; 90 and the empty set don't count
  expect(r.untouched).toEqual([1, 1, 1]);               // dry run deleted nothing
  expect(r.lowered).toEqual({ sets: 2, sessions: 2 });
  expect(r.afterLower.s40).toEqual([95]);
  expect(r.afterLower.s20).toEqual([90, 95, '']);
  expect(r.removed).toEqual({ sets: 2, sessions: 2 });
  expect(r.afterRemove.s40ex).toBe(0);
  expect(r.afterRemove.s20).toEqual([90, '']);
  expect(r.afterRemove.upd40).toBe(true);
});

test('feat 437 — the sheet offers cap reconciliation only when a cap exists with offenders', async ({ page }) => {
  const ids = await seed(page);
  const r = await page.evaluate(({ target }) => {
    pending = { varUuid: target, subUuid: null, sets: [{ w: '', r: '' }] };
    state.exerciseMaxW = {};
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    showFixWeightsPopup();
    let sheet = [...document.querySelectorAll('.choice-backdrop')].pop();
    const noCap = !!sheet.querySelector('[data-fixw-cap]');
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    setExMaxW(target, 95);
    showFixWeightsPopup();
    sheet = [...document.querySelectorAll('.choice-backdrop')].pop();
    const withCap = { lower: !!sheet.querySelector('[data-fixw-cap="lower"]'), remove: !!sheet.querySelector('[data-fixw-cap="remove"]'),
      msg: (sheet.textContent.match(/\d+ logged sets? exceed/) || [''])[0] };
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    setExMaxW(target, 0);
    return { noCap, withCap };
  }, ids);
  expect(r.noCap).toBe(false);
  expect(r.withCap.lower).toBe(true);
  expect(r.withCap.remove).toBe(true);
  expect(r.withCap.msg).toContain('exceed');
});

test('feat 429 — the all-weights popup carries the 🛠 entry point', async ({ page }) => {
  const ids = await seed(page);
  const r = await page.evaluate(({ target }) => {
    pending = { varUuid: target, subUuid: null, sets: [{ w: '', r: '' }] };
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    showWeightTablePopup();
    const sheet = [...document.querySelectorAll('.choice-backdrop')].pop();
    const hasFix = !!sheet.querySelector('[data-wt-fix]');
    sheet.querySelector('[data-wt-fix]').click();
    const fixSheet = [...document.querySelectorAll('.choice-backdrop')].pop();
    const opened = !!(fixSheet && fixSheet.querySelector('#fixw-factor'));
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    return { hasFix, opened };
  }, ids);
  expect(r.hasFix).toBe(true);
  expect(r.opened).toBe(true);
});
