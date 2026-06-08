// feat 151 — clicking "Change exercise" with 2+ sets already entered (and unsaved) asks for confirmation
// first, since picking a different exercise discards the in-progress sets. <2 sets goes straight through.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderModal === 'function' && typeof window.confirmDialog === 'function', null, { timeout: 15000 });
});

const setup = (page, nSets) => page.evaluate((nSets) => {
  let u = null; for (const [v] of VAR_INDEX) { if (exMode(v).mode === 'standard') { u = v; break; } }
  pending = { varUuid: u, subUuid: null, sets: Array.from({ length: nSets }, () => ({ w: 100, r: 5 })) };
  modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
  renderModal();
}, nSets);

test('2+ entered sets → confirm dialog; confirming proceeds to the picker', async ({ page }) => {
  await setup(page, 2);
  const r = await page.evaluate(async () => {
    document.getElementById('trk-change-exercise').click();
    const shown = !!document.querySelector('.choice-backdrop');
    const before = modalState.showPicker;
    document.querySelector('.choice-backdrop .choice-btn.danger').click(); // "Change exercise"
    await new Promise(r => setTimeout(r, 30));
    return { shown, before, after: modalState.showPicker };
  });
  expect(r.shown).toBe(true);   // a confirm appeared
  expect(r.before).toBe(false); // picker not shown until confirmed
  expect(r.after).toBe(true);   // confirming switches to the picker
});

test('2+ entered sets → cancelling keeps logging (stays on the form)', async ({ page }) => {
  await setup(page, 3);
  const r = await page.evaluate(async () => {
    document.getElementById('trk-change-exercise').click();
    document.querySelector('.choice-backdrop .choice-btn:not(.danger)').click(); // "Keep logging"
    await new Promise(r => setTimeout(r, 30));
    return { picker: modalState.showPicker, gone: !document.querySelector('.choice-backdrop.open') };
  });
  expect(r.picker).toBe(false); // stayed on the log form
});

test('fewer than 2 entered sets → no confirm, straight to the picker', async ({ page }) => {
  await setup(page, 1);
  const r = await page.evaluate(() => {
    document.getElementById('trk-change-exercise').click();
    return { shown: !!document.querySelector('.choice-backdrop'), picker: modalState.showPicker };
  });
  expect(r.shown).toBe(false); // no confirm for a single set
  expect(r.picker).toBe(true);
});

test('blank trailing rows do not count toward the 2-set threshold', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null; for (const [v] of VAR_INDEX) { if (exMode(v).mode === 'standard') { u = v; break; } }
    pending = { varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }, { w: '', r: '' }] }; // 1 real + 1 blank
    modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
    renderModal();
    document.getElementById('trk-change-exercise').click();
    return { shown: !!document.querySelector('.choice-backdrop'), picker: modalState.showPicker };
  });
  expect(r.shown).toBe(false); // only 1 set actually entered
  expect(r.picker).toBe(true);
});
