// feat 516 — the hold timer shows in every case. Two holes: (1) typing a weight stamped wTs but only updated the
// row in place, so with the ready/set/go cue off nothing ever drew the timer; (2) a bodyweight hold has no weight
// to type, so it never started at all. Now the timer appears in place, and the active blank set offers Start hold.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openLogModal === 'function' && typeof syncHoldTimerBtn === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const open = (page, sets, cue = false) => page.evaluate(({ sets, cue }) => {
  let v = null; for (const [u] of VAR_INDEX) if (exMode(u).mode === 'time') { v = u; break; }
  state.readonly = false;
  state.holdCue = { ...(state.holdCue || {}), enabled: cue };
  pending = { varUuid: v, subUuid: null, sets };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true; renderModal();
  return { cue: holdCueCfg().enabled };
}, { sets, cue });

test('feat 516 — typing a weight shows the timer without a re-render (cue off)', async ({ page }) => {
  const r0 = await open(page, [{ w: '', r: '' }]);
  expect(r0.cue).toBe(false);
  const r = await page.evaluate(() => {
    const input = document.querySelector('#trk-sets-container input[data-field="w"]');
    input.value = '20'; input.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = document.querySelector('.hold-timer-btn[data-hold-start]');
    return { btn: !!btn, sameInput: document.querySelector('#trk-sets-container input[data-field="w"]') === input, start: !!pending.sets[0].wTs,
      startBtnGone: !document.querySelector('.hold-start-btn') };
  });
  expect(r.start).toBe(true);
  expect(r.btn, 'the timer appears the moment the hold starts').toBe(true);
  expect(r.sameInput, 'in place — the input being typed into is not torn down').toBe(true);
  expect(r.startBtnGone).toBe(true);
});

test('feat 516 — clearing the weight takes the timer away again', async ({ page }) => {
  await open(page, [{ w: '', r: '' }]);
  const gone = await page.evaluate(() => {
    const input = document.querySelector('#trk-sets-container input[data-field="w"]');
    input.value = '20'; input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
    return !document.querySelector('.hold-timer-btn');
  });
  expect(gone).toBe(true);
});

test('feat 516 — a bodyweight hold offers Start hold on the active set only', async ({ page }) => {
  await open(page, [{ w: 0, r: 45, ts: new Date().toISOString() }, { w: '', r: '' }, { w: '', r: '' }]);
  const r = await page.evaluate(() => [...document.querySelectorAll('.hold-start-btn')].map(b => b.dataset.holdBegin));
  expect(r, 'the first incomplete set, not every blank row').toEqual(['1']);
});

test('feat 516 — Start hold logs weight 0 and the count-up timer takes over', async ({ page }) => {
  await open(page, [{ w: '', r: '' }]);
  const r = await page.evaluate(() => {
    document.querySelector('.hold-start-btn').click();
    const s = pending.sets[0];
    return { w: s.w, started: !!s.wTs, timer: !!document.querySelector('.hold-timer-btn[data-hold-start]'),
      startGone: !document.querySelector('.hold-start-btn'),
      secondsEnabled: !document.querySelector('#trk-sets-container input[data-field="r"]').disabled };
  });
  expect(r).toEqual({ w: 0, started: true, timer: true, startGone: true, secondsEnabled: true });
});

test('feat 516 — with the ready/set/go cue on, Start hold runs the cue and the timer starts on Go', async ({ page }) => {
  const r0 = await open(page, [{ w: '', r: '' }], true);
  expect(r0.cue).toBe(true);
  await page.evaluate(() => document.querySelector('.hold-start-btn').click());
  expect(await page.evaluate(() => !!pending.sets[0].wTs), 'not before Go').toBe(false);
  await page.waitForFunction(() => !!document.querySelector('.hold-timer-btn[data-hold-start]'), null, { timeout: 5000 });
});

test('feat 516 — no Start hold while editing a past session or on a done set', async ({ page }) => {
  await open(page, [{ w: 0, r: 30, ts: new Date().toISOString() }]);
  expect(await page.evaluate(() => document.querySelectorAll('.hold-start-btn').length)).toBe(0);
  await page.evaluate(() => { pending.sets.push({ w: '', r: '' }); modalState.isEditing = true; renderModal(); });
  expect(await page.evaluate(() => document.querySelectorAll('.hold-start-btn').length)).toBe(0);
});
