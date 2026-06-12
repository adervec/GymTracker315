// feat 193 — Equipment page (Prepare › Equipment). Equipment setup is inherently per-exercise (the inline loader in
// the log sheet) plus per-gym stables, so the page explains both levels and links to where each is configured.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof renderEquipmentPage === 'function', null, { timeout: 15000 });
});

test('Equipment is a Prepare render-page linking the per-exercise loader + gym stables', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('equipment');
    const main = document.getElementById('trk-main');
    return {
      page: currentPage,
      isPrepareLeaf: PAGES.equipment.parent === 'prepare' && typeof PAGES.equipment.render === 'function',
      hasExerciseLink: !!main.querySelector('#equip-open-exercise'),
      hasGymsLink: !!main.querySelector('#equip-open-gyms'),
      text: main.textContent,
    };
  });
  expect(r.page).toBe('equipment');
  expect(r.isPrepareLeaf).toBe(true);
  expect(r.hasExerciseLink).toBe(true);
  expect(r.hasGymsLink).toBe(true);
  expect(r.text).toContain('pin stack');   // explains the per-exercise loader kinds
  expect(r.text).toContain('stables');      // explains the per-gym stables
});

test('the loader link opens the log sheet; the gym link navigates to Gyms', async ({ page }) => {
  const exercise = await page.evaluate(() => { navTo('equipment'); document.getElementById('equip-open-exercise').click(); return { page: currentPage, modal: modalState.open }; });
  expect(exercise.page).toBe('exercise'); // opened the log sheet (feat 192)
  expect(exercise.modal).toBe(true);

  const gym = await page.evaluate(() => { navTo('equipment'); document.getElementById('equip-open-gyms').click(); return currentPage; });
  expect(gym).toBe('gyms');
});
