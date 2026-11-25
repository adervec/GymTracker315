// feat 594 — a superset is the normal exercise sheet with member chips: each member keeps its own sets, the sheet shows
// the member you are on, saving files every member under one group, and a combination can be saved and started again.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof ssStart === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  await page.evaluate(() => {
    window._vs = [...VAR_INDEX.entries()].filter(([, i]) => !isCardioVar(i.variation.uuid) && exMode(i.variation.uuid).mode === 'standard' && !i.variation.subvariation).slice(0, 3).map(([u]) => u);
    state.sessions = []; state.savedSupersets = []; clearPending(); openLogModal();
  });
});

test('feat 594 — the normal sheet with member chips; each member keeps its own sets', async ({ page }) => {
  const r = await page.evaluate(() => {
    ssStart([{ varUuid: _vs[0] }, { varUuid: _vs[1] }]);
    const out = { chips: document.querySelectorAll('[data-ss-member]').length, sheet: !!document.getElementById('trk-sets-container'), targets: pending.varUuid === _vs[0],
      change: !!document.getElementById('trk-change-exercise') };
    pending.sets = [{ w: '60', r: '10' }, { w: '60', r: '9' }]; renderModal();
    document.querySelector('[data-ss-member="1"]').click();                      // over to B
    out.onB = [pending.varUuid === _vs[1], pending.sets.length, pending.sets[0].w];
    pending.sets = [{ w: '40', r: '12' }]; renderModal();
    out.metaB = document.querySelector('[data-ss-member="1"] .sub-chip-meta').textContent;
    document.querySelector('[data-ss-member="0"]').click();                      // back to A: its sets are still there
    out.backOnA = pending.sets.map(x => x.r);
    out.metaA = document.querySelector('[data-ss-member="0"] .sub-chip-meta').textContent;
    out.saveOk = !document.getElementById('trk-save-btn').disabled;
    return out;
  });
  expect(r.chips).toBe(2);
  expect(r.sheet).toBe(true);
  expect(r.targets).toBe(true);
  expect(r.change).toBe(false);                 // no "Change exercise" inside a superset
  expect(r.onB).toEqual([true, 1, '']);         // B starts empty
  expect(r.metaB).toMatch(/1 set/);
  expect(r.backOnA).toEqual(['10', '9']);
  expect(r.metaA).toMatch(/2 sets/);
  expect(r.saveOk).toBe(true);
});

test('feat 594 — saving files every member under one group, with timestamps and attachments kept', async ({ page }) => {
  const r = await page.evaluate(() => {
    ssStart([{ varUuid: _vs[0] }, { varUuid: _vs[1] }]);
    pending.sets = [{ w: '60', r: '10', wTs: '2026-11-25T10:00:00Z', ts: '2026-11-25T10:01:00Z' }, { w: '', r: '' }];
    ssSwitch(1); pending.sets = [{ w: '40', r: '12' }];
    saveSuperset();
    const ex = state.sessions[0].exercises;
    return { n: ex.length, vars: ex.map(e => e.varUuid), one: new Set(ex.map(e => e.supersetId)).size === 1 && !!ex[0].supersetId,
      a: ex[0].sets, cleared: !pending.superset && !modalState.supersetMode };
  });
  expect(r.n).toBe(2);
  expect(r.one).toBe(true);
  expect(r.a).toEqual([{ w: '60', r: '10', ts: '2026-11-25T10:01:00Z', wTs: '2026-11-25T10:00:00Z' }]);   // the empty row is dropped
  expect(r.cleared).toBe(true);
});

test('feat 594 — save a combination, start it again in one tap, remove it', async ({ page }) => {
  const r = await page.evaluate(async () => {
    ssStart([{ varUuid: _vs[0] }, { varUuid: _vs[1] }]);
    document.querySelector('[data-ss-saveset]').click();
    const saved = ssSavedAll().map(x => x.members.map(m => m.varUuid));
    const label = document.querySelector('[data-ss-saveset]').textContent;
    exitSuperset();
    modalState.showPicker = true; renderModal();
    document.getElementById('trk-ss2-start').click();
    const sheet = [...document.querySelectorAll('.choice-backdrop')].pop();
    const rows = sheet.querySelectorAll('[data-ss-go]').length;
    sheet.querySelector('[data-ss-go]').click();
    const started = { ready: ssReady(), members: ssList(pending.superset).map(m => m.varUuid), on: pending.varUuid };
    exitSuperset(); modalState.showPicker = true; renderModal();
    document.getElementById('trk-ss2-start').click();
    const sheet2 = [...document.querySelectorAll('.choice-backdrop')].pop();
    sheet2.querySelector('[data-ss-del]').click();
    return { saved, label, rows, started, after: ssSavedAll().length, tomb: state.savedSupersets.length === 1 && state.savedSupersets[0].deleted === true };
  });
  expect(r.saved).toEqual([[await page.evaluate(() => _vs[0]), await page.evaluate(() => _vs[1])]]);
  expect(r.label).toMatch(/Saved/);
  expect(r.rows).toBe(1);
  expect(r.started.ready).toBe(true);
  expect(r.started.on).toBe(r.started.members[0]);
  expect(r.after).toBe(0);
  expect(r.tomb).toBe(true);                   // a tombstone, so the removal reaches the other devices
});

test('feat 594 — start from the open exercise: its sets become A, and you land on B', async ({ page }) => {
  const r = await page.evaluate(() => {
    pending.varUuid = _vs[0]; pending.subUuid = null; pending.sets = [{ w: '70', r: '8' }];
    modalState.showPicker = true; renderModal();
    document.getElementById('trk-ss2-start').click();
    [...document.querySelectorAll('.choice-backdrop')].pop().querySelector('[data-ss-new="cur"]').click();
    const picking = modalState.supersetPick;
    // pick B through the list's own path
    const list = ssList(pending.superset); list.push({ varUuid: _vs[1], subUuid: null, sets: [] }); modalState.supersetPick = 'done'; ssLoad(1); renderModal();
    return { picking, onB: pending.varUuid === _vs[1], aSets: ssList(pending.superset)[0].sets.map(x => x.w) };
  });
  expect(r.picking).toBe('a');
  expect(r.onB).toBe(true);
  expect(r.aSets).toEqual(['70']);
});

test('feat 594 — a saved superset arriving from another device is cleaned on load', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.savedSupersets = [{ id: 'x', name: '<b>hi</b>'.repeat(50), members: [{ varUuid: _vs[0], subUuid: 5 }, { varUuid: _vs[1] }, null, { varUuid: 7 }], updatedAt: 'now', evil: 'drop me' }, 'junk', { id: 9 }];
    normalizeState();
    return state.savedSupersets;
  });
  expect(r).toHaveLength(1);
  expect(r[0].name.length).toBeLessThanOrEqual(160);
  expect(r[0].members).toEqual([{ varUuid: await page.evaluate(() => _vs[0]), subUuid: null }, { varUuid: await page.evaluate(() => _vs[1]), subUuid: null }]);
  expect(r[0].evil).toBeUndefined();
});
