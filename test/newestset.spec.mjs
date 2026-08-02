// feat 457 — "Newest set first" (default ON): the set you just logged sits at the TOP of the current
// exercise pane. The flip is purely visual (flex column-reverse) so DOM order — and every positional
// lookup built on it — is untouched.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof newestSetFirst === 'function' && typeof openLogModal === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const openThreeSets = (page) => page.evaluate(() => {
  let v = null; for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') { v = u; break; }
  state.readonly = false;
  pending = { varUuid: v, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 105, r: 5 }, { w: 110, r: 3 }] };
  openLogModal();
  modalState.showPicker = false; modalState.isEditing = false; modalState.open = true;
  renderModal();
});

test('feat 457 — the option defaults ON and rides in synced settings', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const fresh = newestSetFirst();                          // absent key → on
    delete state.workoutControls.newestSetFirst;
    const stillOn = newestSetFirst();
    state.workoutControls.newestSetFirst = false;
    const off = newestSetFirst();
    state.workoutControls.newestSetFirst = true;
    return { fresh, stillOn, off, inKeys: SETTINGS_KEYS.includes('workoutControls') };
  });
  expect(r.fresh).toBe(true);
  expect(r.stillOn, 'an absent key must read as ON, not off').toBe(true);
  expect(r.off).toBe(false);
  expect(r.inKeys).toBe(true);
});

test('feat 457 — newest first flips the visual order only; DOM order and set numbering are unchanged', async ({ page }) => {
  await openThreeSets(page);
  const r = await page.evaluate(() => {
    const c = document.getElementById('trk-sets-container');
    const domNums = () => [...c.querySelectorAll('.set-num')].map(n => n.textContent);
    const weights = () => [...c.querySelectorAll('.set-input[data-field="w"]')].map(i => i.value);
    // visual order = sorted by on-screen y position
    const visualNums = () => [...c.querySelectorAll('.set-row')]
      .map(el => ({ y: el.getBoundingClientRect().top, n: el.querySelector('.set-num').textContent }))
      .sort((a, b) => a.y - b.y).map(x => x.n);
    const on = { cls: c.className, dom: domNums(), visual: visualNums(), w: weights() };
    state.workoutControls.newestSetFirst = false; renderModal();
    const c2 = document.getElementById('trk-sets-container');
    const off = { cls: c2.className,
      dom: [...c2.querySelectorAll('.set-num')].map(n => n.textContent),
      visual: [...c2.querySelectorAll('.set-row')].map(el => ({ y: el.getBoundingClientRect().top, n: el.querySelector('.set-num').textContent })).sort((a, b) => a.y - b.y).map(x => x.n) };
    return { on, off };
  });
  expect(r.on.cls).toContain('newest-first');
  expect(r.on.dom, 'DOM order stays 1,2,3 — index lookups depend on it').toEqual(['1', '2', '3']);
  expect(r.on.visual, 'on screen the newest set is on top').toEqual(['3', '2', '1']);
  expect(r.on.w).toEqual(['100', '105', '110']);        // data-i still lines up with pending.sets
  expect(r.off.cls).not.toContain('newest-first');
  expect(r.off.dom).toEqual(['1', '2', '3']);
  expect(r.off.visual).toEqual(['1', '2', '3']);
});

test('feat 457 — editing a set still hits the right row with newest-first on', async ({ page }) => {
  await openThreeSets(page);
  const r = await page.evaluate(() => {
    commitSetField(0, 'w', 999);                    // set 1 — the visually BOTTOM row
    // updateRowLive uses a positional rows[idx] lookup; it must have touched set 1's row, not the top one
    const c = document.getElementById('trk-sets-container');
    const rows = [...c.querySelectorAll('.set-row')];
    const titled = rows.findIndex(el => el.querySelector('[data-field="r"]').disabled === false && el.querySelector('.set-num').textContent === '1');
    renderModal();                                  // a full re-render reflects the stored value in the field
    const c2 = document.getElementById('trk-sets-container');
    return { stored: pending.sets[0].w, titled,
      fieldVal: c2.querySelector('.set-input[data-i="0"][data-field="w"]').value,
      rowNum: [...c2.querySelectorAll('.set-row')][0].querySelector('.set-num').textContent,
      blocks: c2.querySelectorAll('.set-block').length };
  });
  expect(r.stored).toBe(999);
  expect(r.fieldVal).toBe('999');
  expect(r.rowNum).toBe('1');
  expect(r.blocks).toBe(3);                          // one block per set (row + its timer + its sub-row)
});

test('feat 457 — the settings toggle switches it and re-renders the open sheet', async ({ page }) => {
  await openThreeSets(page);
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const btn = () => document.querySelector('[data-wc="newestSetFirst"][data-wc-val="off"]');
    const hasRow = !!btn();
    btn().click();
    const afterOff = { on: newestSetFirst(), cls: document.getElementById('trk-sets-container').className,
      persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).workoutControls.newestSetFirst };
    document.querySelector('[data-wc="newestSetFirst"][data-wc-val="on"]').click();
    return { hasRow, afterOff, backOn: newestSetFirst(), cls: document.getElementById('trk-sets-container').className };
  });
  expect(r.hasRow, 'the toggle is offered in Workout controls').toBe(true);
  expect(r.afterOff.on).toBe(false);
  expect(r.afterOff.cls).not.toContain('newest-first');
  expect(r.afterOff.persisted).toBe(false);
  expect(r.backOn).toBe(true);
  expect(r.cls).toContain('newest-first');
});
