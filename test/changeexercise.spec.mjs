// feat 107 — "Change exercise" and "Add note" are real buttons (not text links), and the picker
// offers a "Back to current" escape hatch so a mis-tapped Change exercise is recoverable.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderModal === 'function' && typeof window.renderPicker === 'function', null, { timeout: 15000 });
});

async function selectStandardExercise(page) {
  return await page.evaluate(() => {
    let std = null;
    for (const [uuid] of VAR_INDEX) { if (exMode(uuid).mode === 'standard' && !isCardioVar(uuid)) { std = uuid; break; } }
    pending = { varUuid: std, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.isEditing = false; modalState.showPicker = false; modalState.supersetMode = false;
    modalState.exNoteEditing = false;
    renderModal();
    return std;
  });
}

test('Change exercise and Add note render as <button>, not <span>', async ({ page }) => {
  await selectStandardExercise(page);
  const r = await page.evaluate(() => {
    const body = document.getElementById('trk-modal-body');
    const change = body.querySelector('#trk-change-exercise');
    const note = body.querySelector('#trk-ex-note-edit');
    return { changeTag: change && change.tagName, noteTag: note && note.tagName };
  });
  expect(r.changeTag).toBe('BUTTON');
  expect(r.noteTag).toBe('BUTTON');
});

test('the picker shows a "Back to current" button only when an exercise is selected', async ({ page }) => {
  const r = await page.evaluate(() => {
    let std = null;
    for (const [uuid] of VAR_INDEX) { if (exMode(uuid).mode === 'standard' && !isCardioVar(uuid)) { std = uuid; break; } }
    modalState.isEditing = false; modalState.supersetMode = false;
    // with a current exercise -> button present
    pending = { varUuid: std, subUuid: null, sets: [{ w: '', r: '' }] };
    const withCurrent = renderPicker().includes('id="trk-picker-back-current"');
    // no current exercise (first open) -> no button
    pending = { varUuid: null, subUuid: null, sets: [] };
    const withoutCurrent = renderPicker().includes('id="trk-picker-back-current"');
    return { withCurrent, withoutCurrent };
  });
  expect(r.withCurrent).toBe(true);
  expect(r.withoutCurrent).toBe(false);
});

test('clicking "Back to current" returns to the exercise without changing it', async ({ page }) => {
  const std = await selectStandardExercise(page);
  const r = await page.evaluate((stdUuid) => {
    // simulate a mis-tap on Change exercise -> opens the picker
    modalState.showPicker = true;
    renderModal();
    const back = document.getElementById('trk-picker-back-current');
    const hadBack = !!back;
    back.click(); // abort
    const body = document.getElementById('trk-modal-body');
    return {
      hadBack,
      showPickerAfter: modalState.showPicker,
      backToSets: !!body.querySelector('#trk-change-exercise'),
      sameExercise: pending.varUuid === stdUuid,
    };
  }, std);
  expect(r.hadBack).toBe(true);
  expect(r.showPickerAfter).toBe(false);   // returned to the exercise view
  expect(r.backToSets).toBe(true);          // sets form (with Change exercise) is showing again
  expect(r.sameExercise).toBe(true);        // exercise unchanged
});
