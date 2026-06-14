// feat 257 — live hold timer for timed sets (planks / dead hangs / wall sits / L-sits). Once a timed set is
// "started" (weight entered → wTs) but not yet done, its row shows a count-up button; tapping it records the
// current elapsed seconds straight into the Seconds field. Only while logging (not editing a past session).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openLogModal === 'function' && typeof renderModal === 'function'
    && typeof exMode === 'function' && typeof ensureHoldTimers === 'function' && typeof tickHoldTimers === 'function',
    null, { timeout: 15000 });
});

// the first variation the catalogue treats as a timed hold (plank / hang / wall sit / L-sit / isometric).
const timedVar = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'time') return u; return null; });
const stdVar = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; return null; });

const openTimed = (page, v, opts) => page.evaluate(({ v, opts }) => {
  state.readonly = false;
  const startAgoMs = opts.startAgoMs;
  pending = { varUuid: v, subUuid: null, sets: [{
    w: opts.started ? 0 : '', r: '',
    wTs: opts.started ? new Date(Date.now() - startAgoMs).toISOString() : undefined,
    ts: undefined,
  }] };
  openLogModal();                 // openLogModal forces isEditing=false — set our flags AFTER it, then re-render
  modalState.showPicker = false; modalState.isEditing = !!opts.editing; modalState.open = true;
  renderModal();
}, { v, opts });

test('feat 257 — timed holds log Seconds (mode + label), standard lifts do not', async ({ page }) => {
  const v = await timedVar(page);
  expect(v).not.toBeNull();
  const r = await page.evaluate((v) => ({ mode: exMode(v).mode, rLabel: exMode(v).rLabel }), v);
  expect(r.mode).toBe('time');
  expect(r.rLabel).toBe('Seconds');
});

test('feat 257 — a started timed set shows the count-up button reflecting elapsed time', async ({ page }) => {
  const v = await timedVar(page);
  await openTimed(page, v, { started: true, startAgoMs: 45000 });
  const r = await page.evaluate(() => {
    const btn = document.querySelector('.hold-timer-btn');
    return { has: !!btn, idx: btn?.dataset.holdIdx, txt: btn?.textContent.replace(/\s+/g, ' ').trim(),
      secs: parseInt((btn?.querySelector('.ht-time')?.textContent || '0').replace(/[^0-9]/g, ''), 10) };
  });
  expect(r.has).toBe(true);
  expect(r.idx).toBe('0');
  expect(r.txt).toContain('tap to log');
  expect(r.secs).toBeGreaterThanOrEqual(45);   // started 45 s ago, only grows
});

test('feat 257 — the button is absent for standard lifts, un-started sets, and while editing', async ({ page }) => {
  const tv = await timedVar(page);
  const sv = await stdVar(page);
  // standard lift, started → no hold timer
  await page.evaluate((sv) => { state.readonly = false; pending = { varUuid: sv, subUuid: null, sets: [{ w: 100, r: '', wTs: new Date().toISOString() }] }; modalState.showPicker = false; modalState.isEditing = false; openLogModal(); renderModal(); }, sv);
  expect(await page.evaluate(() => !!document.querySelector('.hold-timer-btn'))).toBe(false);
  // timed but not started (no weight yet) → no button
  await openTimed(page, tv, { started: false });
  expect(await page.evaluate(() => !!document.querySelector('.hold-timer-btn'))).toBe(false);
  // timed + started but EDITING a past session → no button (wTs could be days old)
  await openTimed(page, tv, { started: true, startAgoMs: 9000, editing: true });
  expect(await page.evaluate(() => !!document.querySelector('.hold-timer-btn'))).toBe(false);
});

test('feat 257 — tapping the timer records the elapsed seconds and marks the set done', async ({ page }) => {
  const v = await timedVar(page);
  await openTimed(page, v, { started: true, startAgoMs: 12000 });
  const r = await page.evaluate(() => {
    document.querySelector('.hold-timer-btn').click();
    const s = pending.sets[0];
    const rInput = document.querySelector('#trk-sets-container .set-input[data-i="0"][data-field="r"]');
    return { recorded: s.r, done: !!s.ts, fieldVal: rInput?.value, buttonGone: !document.querySelector('.hold-timer-btn') };
  });
  expect(typeof r.recorded).toBe('number');
  expect(r.recorded).toBeGreaterThanOrEqual(12);  // ~12 s elapsed, captured at tap
  expect(r.done).toBe(true);                       // ts stamped → set complete
  expect(r.fieldVal).toBe(String(r.recorded));     // Seconds field reflects it
  expect(r.buttonGone).toBe(true);                 // a completed set drops its timer
});

test('feat 257 — the ticker repaints the elapsed time each second', async ({ page }) => {
  const v = await timedVar(page);
  await openTimed(page, v, { started: true, startAgoMs: 3000 });
  const r = await page.evaluate(async () => {
    const read = () => parseInt((document.querySelector('.hold-timer-btn .ht-time')?.textContent || '0').replace(/[^0-9]/g, ''), 10);
    const before = read();
    // rewind the stored start by 30 s and let the ticker repaint
    const btn = document.querySelector('.hold-timer-btn');
    btn.dataset.holdStart = String(parseInt(btn.dataset.holdStart, 10) - 30000);
    tickHoldTimers();
    return { before, after: read() };
  });
  expect(r.after).toBeGreaterThanOrEqual(r.before + 29); // +30 s (allow 1 s jitter)
});
