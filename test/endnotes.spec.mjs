// feat 123 — the End-Workout confirmation offers "Add notes, then end": it opens the session-notes
// modal, and saving runs the chained end. Backing out of notes cancels the end.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.finalizeEndWorkout === 'function' && typeof window.openNotesModal === 'function' && typeof window.saveNotes === 'function', null, { timeout: 15000 });
});

test('the end-workout confirm includes an "Add notes, then end" choice', async ({ page }) => {
  const labels = await page.evaluate(() => {
    state.readonly = false;
    const date = new Date().toISOString();
    const active = { id: 'a', date, exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }] };
    state.sessions = [active];
    finalizeEndWorkout(active, false); // show the dialog (does not end yet)
    const sheet = document.querySelector('.choice-backdrop .choice-sheet');
    return sheet ? [...sheet.querySelectorAll('.choice-btn')].map((b) => b.textContent) : [];
  });
  expect(labels.some((l) => /Add notes/i.test(l))).toBe(true);
  expect(labels.some((l) => /End workout/i.test(l))).toBe(true);
});

test('openNotesModal with a callback relabels Save and runs it after saving', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false;
    const date = new Date().toISOString();
    state.sessions = [{ id: 's', date, exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }] }];
    let ended = 0;
    openNotesModal(date, () => { ended++; });
    const label = document.getElementById('trk-notes-save').textContent;
    document.getElementById('trk-notes-general').value = 'felt strong';
    saveNotes(); // saves notes -> runs the chained callback
    return { label, ended, saved: state.sessions[0].notes && state.sessions[0].notes.general };
  });
  expect(r.label).toBe('Save & End Workout');
  expect(r.ended).toBe(1);
  expect(r.saved).toBe('felt strong');
});

test('closing notes without saving cancels the chained end', async ({ page }) => {
  const ended = await page.evaluate(() => {
    state.readonly = false;
    const date = new Date().toISOString();
    state.sessions = [{ id: 's', date, exercises: [] }];
    let n = 0;
    openNotesModal(date, () => { n++; });
    closeNotesModal();    // backed out -> callback cleared
    return n;
  });
  expect(ended).toBe(0);
});
