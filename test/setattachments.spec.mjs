// feat 593 — switching the attachment applies to the sets still to come; sets already entered keep the one they were
// done with, save under it, and the set list labels where each attachment begins. Plus: a long newest-first list
// scrolls all the way to set 1.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof freezeSetAttachments === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// a cable exercise with attachments (Cable Curl: straight bar / EZ bar / …)
const open = (page, sets) => page.evaluate((sets) => {
  let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.subvariation && subOptions(i.variation).length >= 2 && exMode(u).mode === 'standard') { v = u; break; }
  const opts = subOptions(VAR_INDEX.get(v).variation).map(o => o.uuid);
  state.sessions = []; state.workoutControls = { ...(state.workoutControls || {}), mixSubvariations: false };
  pending = { varUuid: v, subUuid: opts[0], sets: sets.map(([w, r]) => ({ w, r })) };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
  return { v, opts };
}, sets);
const pick = (page, uuid) => page.evaluate((u) => document.querySelector(`#trk-sub-select [data-sub-pick="${u}"]`).click(), uuid);

test('feat 593 — a switch keeps entered sets on their attachment; new and empty sets take the new one', async ({ page }) => {
  const { opts } = await open(page, [[50, 10], [55, 8], ['', '']]);
  await pick(page, opts[1]);
  const r = await page.evaluate(() => ({ subs: pending.sets.map(s => s.subUuid || null), cur: pending.subUuid }));
  expect(r.cur).toBe(opts[1]);
  expect(r.subs).toEqual([opts[0], opts[0], null]);          // the empty row follows the new attachment
  // switching back and forth never re-labels a set that already has its attachment
  await pick(page, opts[0]);
  expect(await page.evaluate(() => pending.sets.map(s => s.subUuid || null))).toEqual([opts[0], opts[0], null]);
});

test('feat 593 — saving puts each set under its own attachment', async ({ page }) => {
  const { v, opts } = await open(page, [[50, 10], [55, 8]]);
  await pick(page, opts[1]);
  const r = await page.evaluate(async (v) => {
    pending.sets.push({ w: 40, r: 12 });
    state.alwaysConfirm = false;
    state.sessions = [{ id: 'today', date: new Date().toISOString(), exercises: [] }];   // a workout in progress
    await saveSets();
    const s = state.sessions[0];
    return s.exercises.filter(e => e.varUuid === v).map(e => ({ sub: e.subUuid, reps: e.sets.map(x => +x.r) }));
  }, v);
  expect(r).toEqual([{ sub: opts[0], reps: [10, 8] }, { sub: opts[1], reps: [12] }]);
});

test('feat 593 — the set list labels where each attachment run starts, in reading order', async ({ page }) => {
  const { opts } = await open(page, [[50, 10], [55, 8]]);
  const label = await page.evaluate((u) => subOptions(VAR_INDEX.get(pending.varUuid).variation).find(o => o.uuid === u).label, opts[1]);
  const first = await page.evaluate((u) => subOptions(VAR_INDEX.get(pending.varUuid).variation).find(o => o.uuid === u).label, opts[0]);
  const before = await page.evaluate(() => document.querySelectorAll('.set-sub-mark').length);
  await pick(page, opts[1]);
  const r = await page.evaluate(() => { pending.sets.push({ w: 40, r: 12 }); renderModal();
    return { marks: [...document.querySelectorAll('#trk-sets-container .set-sub-mark')].map(m => m.textContent.trim()), changed: document.querySelectorAll('.set-row.sub-change').length }; });
  expect(before).toBe(0);                                   // one attachment: no labels at all
  expect(r.marks).toEqual([first, '↪ ' + label]);
  expect(r.changed).toBe(1);
});

test('feat 593 — another exercise drops the old attachment from carried sets; editing a saved entry is untouched', async ({ page }) => {
  const { opts } = await open(page, [[50, 10]]);
  await pick(page, opts[1]);
  const r = await page.evaluate(() => {
    const carried = pending.sets[0].subUuid;
    let other = null; for (const [u, i] of VAR_INDEX) if (u !== pending.varUuid && exMode(u).mode === 'standard' && !isCardioVar(u)) { other = u; break; }
    _applyPickedVar(other, VAR_INDEX.get(other));
    const after = pending.sets[0].subUuid;
    modalState.isEditing = true;
    const frozenWhileEditing = freezeSetAttachments();
    modalState.isEditing = false;
    return { carried: !!carried, after: after === undefined, frozenWhileEditing };
  });
  expect(r).toEqual({ carried: true, after: true, frozenWhileEditing: 0 });
});

test('feat 593 — a long newest-first set list scrolls all the way to set 1', async ({ page }) => {
  await open(page, Array.from({ length: 14 }, (_, i) => [100 + i, 5]));
  const r = await page.evaluate(async () => {
    state.workoutControls.newestSetFirst = true; renderModal();
    await new Promise(res => setTimeout(res, 200));
    const c = document.getElementById('trk-sets-container'), rows = c.querySelectorAll('.set-row');
    const seen = (row) => { const a = row.getBoundingClientRect(), b = c.getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; };
    const reach = async (row) => { for (const top of [-1e6, 1e6]) { c.scrollTop = top; await new Promise(res => setTimeout(res, 40)); if (seen(row)) return true; } return false; };
    return { overflow: c.scrollHeight > c.clientHeight, first: await reach(rows[0]), last: await reach(rows[rows.length - 1]) };
  });
  expect(r).toEqual({ overflow: true, first: true, last: true });
});

test('feat 593 — a long list opens on the newest set, and a redraw keeps where you scrolled', async ({ page }) => {
  await open(page, Array.from({ length: 14 }, (_, i) => [100 + i, 5]));
  const r = await page.evaluate(async () => {
    state.workoutControls.newestSetFirst = true; renderModal();
    await new Promise(res => setTimeout(res, 150));
    const c = () => document.getElementById('trk-sets-container');
    const seen = (row) => { const a = row.getBoundingClientRect(), b = c().getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; };
    const rows = () => c().querySelectorAll('.set-row');
    const newestOnOpen = seen(rows()[rows().length - 1]);
    c().scrollTop = 1e6; await new Promise(res => setTimeout(res, 40));   // down to set 1
    const oldestShown = seen(rows()[0]);
    renderModal(); await new Promise(res => setTimeout(res, 40));        // a redraw…
    return { newestOnOpen, oldestShown, stillThere: seen(rows()[0]) };     // …leaves you there
  });
  expect(r).toEqual({ newestOnOpen: true, oldestShown: true, stillThere: true });
});
