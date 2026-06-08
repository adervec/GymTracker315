// feat 149 — when a set's weight/reps value changes for ANY reason (typing, OSK, copy, setup-apply) the
// field briefly flashes its border (a box-shadow ring animation). No flash when the value is unchanged.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.commitSetField === 'function' && typeof window.renderModal === 'function', null, { timeout: 15000 });
});

const openSetsForm = (page) => page.evaluate(() => {
  let u = null; for (const [v] of VAR_INDEX) { if (exMode(v).mode === 'standard') { u = v; break; } }
  pending = { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }] };
  modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
  renderModal();
});

test('committing a changed value flashes that field; an unchanged commit does not', async ({ page }) => {
  await openSetsForm(page);
  const r = await page.evaluate(() => {
    const inp = document.querySelector('#trk-sets-container .set-input[data-i="0"][data-field="w"]');
    const before = inp.classList.contains('field-flash');
    commitSetField(0, 'w', 135);
    const after = inp.classList.contains('field-flash');
    const anim = getComputedStyle(inp).animationName;
    inp.classList.remove('field-flash');
    commitSetField(0, 'w', 135); // same value -> no change -> no flash
    const unchanged = inp.classList.contains('field-flash');
    return { before, after, anim, unchanged };
  });
  expect(r.before).toBe(false);
  expect(r.after).toBe(true);
  expect(r.anim).toBe('field-flash'); // a real animation is attached
  expect(r.unchanged).toBe(false);    // unchanged value must not flash
});

test('the native input event (typing / OSK write) flashes the field', async ({ page }) => {
  await openSetsForm(page);
  const flashed = await page.evaluate(() => {
    const inp = document.querySelector('#trk-sets-container .set-input[data-i="0"][data-field="w"]');
    inp.value = '100';
    inp.dispatchEvent(new Event('input', { bubbles: true })); // what typing / the OSK write triggers
    return inp.classList.contains('field-flash');
  });
  expect(flashed).toBe(true);
});

test('copy-reps into the open set flashes the reps field (feat 142 path)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null; for (const [v] of VAR_INDEX) { if (exMode(v).mode === 'standard') { u = v; break; } }
    state.sessions = [];
    pending = { varUuid: u, subUuid: null, sets: [{ w: 100, r: 8, wTs: '2026-01-01T00:00:00Z', ts: '2026-01-01T00:01:00Z' }, { w: 100, r: '' }] };
    modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
    renderModal();
    copyRepsToOpenSet(); // commits r=8 into set index 1 via commitSetField
    const inp = document.querySelector('#trk-sets-container .set-input[data-i="1"][data-field="r"]');
    return inp ? inp.classList.contains('field-flash') : null;
  });
  expect(r).toBe(true);
});
