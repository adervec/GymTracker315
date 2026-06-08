// feat 143 — in the equipment setup pickers, a plate/topper's "×N" count is now a SEPARATE remove
// button joined to the add pill (a segmented control), not a tiny badge nested inside the add button.
// Tapping the pill adds; tapping the ×N button removes one — two distinct, non-overlapping tap targets.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderModal === 'function' && typeof window.autoSetupKind === 'function', null, { timeout: 15000 });
});

test('the plate ×N remove is its own button, separate from the add pill (feat 143)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let bb = null; for (const [u] of VAR_INDEX) { if (autoSetupKind(u) === 'barbell' && !/smith/i.test((VAR_INDEX.get(u).variation.title || ''))) { bb = u; break; } }
    state.unit = 'lb';
    state.workoutControls = Object.assign({}, state.workoutControls, { onScreenNumpad: false });
    pending = { varUuid: bb, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.open = true; modalState.showPicker = false; modalState.isEditing = false; modalState.setupOpen = true;
    modalState.setup = { barbell: defaultSetupState('barbell') };
    renderModal();
    const body = () => document.getElementById('trk-modal-body');
    const add0 = body().querySelector('[data-inl-padd]');
    const plate = add0.getAttribute('data-inl-padd');
    const hadSubBefore = !!body().querySelector(`[data-inl-psub="${plate}"]`); // none until a plate is on

    add0.click(); // add one plate -> rerenders the body
    const sub = body().querySelector(`[data-inl-psub="${plate}"]`);
    const addBtn = body().querySelector(`[data-inl-padd="${plate}"]`);
    const grp = body().querySelector('.setup-pill-grp.has');
    const out = {
      plate,
      hadSubBefore,
      subExists: !!sub,
      subTag: sub ? sub.tagName : null,
      subSeparateFromAdd: sub && addBtn ? !addBtn.contains(sub) : null, // NOT nested inside the add button
      bothInGroup: grp && sub && addBtn ? (grp.contains(sub) && grp.contains(addBtn)) : false,
      label: sub ? sub.textContent : null,
      countAfterAdd: modalState.setup.barbell.plates[plate],
    };

    sub.click(); // remove via the separate ×N button -> rerenders
    out.countAfterRemove = modalState.setup.barbell.plates[plate] || 0;
    out.subGoneAtZero = !body().querySelector(`[data-inl-psub="${plate}"]`);
    return out;
  });
  expect(r.hadSubBefore).toBe(false);        // no ×N until at least one plate is on
  expect(r.subExists).toBe(true);
  expect(r.subTag).toBe('BUTTON');           // a real button, not a <span> badge
  expect(r.subSeparateFromAdd).toBe(true);   // the remove control is NOT inside the add pill
  expect(r.bothInGroup).toBe(true);          // add + ×N are siblings in the segmented group
  expect(r.label).toBe('×1');
  expect(r.countAfterAdd).toBe(1);
  expect(r.countAfterRemove).toBe(0);        // tapping ×N removed the plate
  expect(r.subGoneAtZero).toBe(true);        // ×N disappears when the count hits zero
});

test('adding the same plate twice shows ×2 and one tap of the ×N button drops it to ×1 (feat 143)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let bb = null; for (const [u] of VAR_INDEX) { if (autoSetupKind(u) === 'barbell' && !/smith/i.test((VAR_INDEX.get(u).variation.title || ''))) { bb = u; break; } }
    state.unit = 'lb';
    state.workoutControls = Object.assign({}, state.workoutControls, { onScreenNumpad: false });
    pending = { varUuid: bb, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.open = true; modalState.showPicker = false; modalState.setupOpen = true;
    modalState.setup = { barbell: defaultSetupState('barbell') };
    renderModal();
    const body = () => document.getElementById('trk-modal-body');
    const plate = body().querySelector('[data-inl-padd]').getAttribute('data-inl-padd');
    body().querySelector(`[data-inl-padd="${plate}"]`).click();
    body().querySelector(`[data-inl-padd="${plate}"]`).click();
    const labelTwo = body().querySelector(`[data-inl-psub="${plate}"]`).textContent;
    body().querySelector(`[data-inl-psub="${plate}"]`).click();
    const labelOne = body().querySelector(`[data-inl-psub="${plate}"]`).textContent;
    return { labelTwo, labelOne, count: modalState.setup.barbell.plates[plate] };
  });
  expect(r.labelTwo).toBe('×2');
  expect(r.labelOne).toBe('×1');
  expect(r.count).toBe(1);
});
