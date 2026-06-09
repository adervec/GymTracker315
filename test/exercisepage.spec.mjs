// feat 192 — Exercise page: the log-sets sheet (#trk-modal) is router-integrated. Opening it (FAB, the ✍️ shortcut,
// a plan step, edit-existing) marks currentPage='exercise' + the top bar (✍️ Exercise + an enabled Back); closing it
// (✕ / footer / backdrop / Escape / top-bar Back) restores the page that was behind the sheet. The sheet's content /
// picker / OSK / save flow are unchanged — only the surrounding router chrome is added.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openLogModal === 'function' && typeof closeLogModal === 'function'
    && typeof topbarBack === 'function' && typeof navTo === 'function', null, { timeout: 15000 });
});

test('opening the log sheet marks the Exercise page; closing restores the previous page', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('workout', { replace: true });
    const before = currentPage;
    openLogModal();
    const opened = { page: currentPage, modal: modalState.open, sheetOpen: document.getElementById('trk-modal').classList.contains('open') };
    closeLogModal();
    return { before, opened, afterPage: currentPage, afterModal: modalState.open };
  });
  expect(r.before).toBe('workout');
  expect(r.opened.page).toBe('exercise');   // marked the Exercise page
  expect(r.opened.modal).toBe(true);
  expect(r.opened.sheetOpen).toBe(true);    // the sheet actually opened (unchanged behaviour)
  expect(r.afterModal).toBe(false);         // closed
  expect(r.afterPage).toBe('workout');      // ...and restored the page that was behind it
});

test('the top bar shows the Exercise title + an enabled Back while the sheet is open', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('workout', { replace: true });
    openLogModal();
    return { title: document.getElementById('topbar-title').textContent, backDisabled: document.getElementById('nav-back').disabled };
  });
  expect(r.title).toContain('Exercise');
  expect(r.title).toContain('✍️');
  expect(r.backDisabled).toBe(false);       // Back is enabled — it closes the sheet
});

test('the top-bar Back closes the sheet and returns to the page behind it', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('history', { replace: true });
    openLogModal();
    const onExercise = currentPage;
    topbarBack(); // ← closes the sheet
    return { onExercise, modal: modalState.open, page: currentPage };
  });
  expect(r.onExercise).toBe('exercise');
  expect(r.modal).toBe(false);              // Back closed the sheet
  expect(r.page).toBe('history');           // ...and restored the page behind it
});

test('navTo("exercise") (the ✍️ shortcut / Execute menu) opens the sheet', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('workout', { replace: true });
    navTo('exercise'); // the leaf opener → openLogModal()
    return { page: currentPage, modal: modalState.open };
  });
  expect(r.page).toBe('exercise');
  expect(r.modal).toBe(true);
});
