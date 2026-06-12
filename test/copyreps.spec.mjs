// feat 142 — the footer Copy button: a TAP copies the weight to the next set (feat 58); a HOLD copies
// the previous rep count into the open set's still-empty reps (so an identical-reps scheme logs in one
// gesture). With an open set, the hold needs a prior rep count to pull from (an earlier pending set,
// else the last logged set in history). feat 201 — with NO open set the hold now duplicates the most
// recent set (weight AND reps) instead of no-op'ing; see copydupe.spec.mjs for the full matrix.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.copyRepsToOpenSet === 'function'
    && typeof window.copyWeightToNextSet === 'function'
    && typeof window.isSetOpen === 'function', null, { timeout: 15000 });
});

const stdUuid = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; return null; });

test('hold-copy fills the open set reps from the previous pending set', async ({ page }) => {
  const u = await stdUuid(page);
  const r = await page.evaluate((u) => {
    state.sessions = [];
    modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
    pending = { varUuid: u, subUuid: null, sets: [{ w: 100, r: 8, wTs: '2026-01-01T00:00:00Z', ts: '2026-01-01T00:01:00Z' }, { w: 100, r: '' }] };
    copyRepsToOpenSet();
    return { r1: pending.sets[1].r, done1: !isSetOpen(pending.sets[1]), hasTs: !!pending.sets[1].ts };
  }, u);
  expect(Number(r.r1)).toBe(8);   // copied the prior 8 reps into the open set
  expect(r.done1).toBe(true);     // the set is now complete
  expect(r.hasTs).toBe(true);     // reps entered -> set stamped done (canonical commit path)
});

test('hold-copy falls back to the last logged set in history when no prior pending reps', async ({ page }) => {
  const u = await stdUuid(page);
  const r = await page.evaluate((u) => {
    state.sessions = [{ id: 'h', date: '2026-05-01T00:00:00Z', exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 50, r: 12 }] }] }];
    modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
    pending = { varUuid: u, subUuid: null, sets: [{ w: 60, r: '' }] };
    copyRepsToOpenSet();
    return pending.sets[0].r;
  }, u);
  expect(Number(r)).toBe(12);
});

test('no open set → the hold dupes the last set (feat 201); open set with no prior reps stays a no-op', async ({ page }) => {
  const u = await stdUuid(page);
  const r = await page.evaluate((u) => {
    state.sessions = [];
    modalState.open = true; modalState.showPicker = false;
    // (a) no open set — the bottom set already has reps → feat 201 duplicates it
    pending = { varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] };
    copyRepsToOpenSet();
    const duped = pending.sets.map(s => ({ w: s.w, r: s.r }));
    // (b) an open set but no prior reps anywhere (no pending history, no logged history)
    pending = { varUuid: u, subUuid: null, sets: [{ w: 100, r: '' }] };
    copyRepsToOpenSet();
    const noPrior = pending.sets[0].r;
    return { duped, noPrior };
  }, u);
  expect(r.duped).toHaveLength(2);            // feat 201 — a dupe row was created…
  expect(String(r.duped[1].w)).toBe('100');   // …carrying the weight…
  expect(String(r.duped[1].r)).toBe('5');     // …and the reps
  expect(r.noPrior).toBe('');                 // open set with nothing to copy: still empty
});

test('the Copy button taps to copy-weight and holds to copy-reps (feat 142)', async ({ page }) => {
  const u = await stdUuid(page);
  // TAP -> copy weight builds the next set
  const tap = await page.evaluate(async (u) => {
    state.sessions = [];
    pending = { varUuid: u, subUuid: null, sets: [{ w: 135, r: 5, wTs: '2026-01-01T00:00:00Z', ts: '2026-01-01T00:01:00Z' }] };
    modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
    renderModal(); // binds the Copy onclick = copyWeightToNextSet
    const btn = document.getElementById('trk-copy-last');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 60));   // released well under the 550ms hold
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); // a real tap fires a click
    const last = pending.sets[pending.sets.length - 1];
    return { count: pending.sets.length, lastW: last.w, lastR: last.r };
  }, u);
  expect(tap.count).toBe(2);            // copy-weight added the next set
  expect(Number(tap.lastW)).toBe(135);
  expect(String(tap.lastR)).toBe('');   // new set's reps left empty (now the open set)

  // HOLD -> copy the prior reps into that now-open set; the trailing click is swallowed
  const hold = await page.evaluate(async () => {
    const btn = document.getElementById('trk-copy-last');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 620));  // past the 550ms hold threshold
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); // should be swallowed by the long-press
    const last = pending.sets[pending.sets.length - 1];
    return { count: pending.sets.length, lastR: last.r };
  });
  expect(Number(hold.lastR)).toBe(5);   // the open set's reps filled from the prior 5
  expect(hold.count).toBe(2);           // the swallowed click did NOT also copy-weight (no 3rd set)
});
