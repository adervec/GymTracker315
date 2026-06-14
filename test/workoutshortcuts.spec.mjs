// feat 188 — contextual workout shortcuts: while a workout is active, the top bar grows a third row with
// 🔥 Workout · ✍️ Exercise · 🗺️ Plan (feat 246 — the End slot became Plan Detail; End lives on the Workout
// page). It hides when no workout is active, and --topbar-h grows with it so the rest/step bars + log sheet
// stay clear. The rest-bar deep-link now opens the Workout page.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof updateWorkoutBar === 'function' && typeof startWorkout === 'function'
    && typeof endWorkout === 'function' && typeof navTo === 'function', null, { timeout: 15000 });
  // a clean slate: no sessions, no HR/wake side effects, no pending sets
  await page.evaluate(() => {
    state.workoutControls = { hrAutoConnect: false, keepAwake: false };
    state.sessions = []; state.gyms = [];
    pending = { varUuid: null, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.open = false;
    updateWorkoutBar();
  });
});

test('the shortcut row is hidden with no workout, then appears (taller bar) once one starts', async ({ page }) => {
  const r = await page.evaluate(() => {
    const row = document.querySelector('.topbar-shortcut-row');
    const hiddenBefore = getComputedStyle(row).display === 'none';
    const hBefore = getComputedStyle(document.body).getPropertyValue('--topbar-h').trim();
    startWorkout();
    return {
      hiddenBefore, hBefore,
      shownAfter: getComputedStyle(row).display !== 'none',
      hAfter: getComputedStyle(document.body).getPropertyValue('--topbar-h').trim(),
      active: document.body.classList.contains('workout-active'),
      hasBtns: !!document.getElementById('wbar-workout-btn') && !!document.getElementById('wbar-exercise-btn') && !!document.getElementById('wbar-plan-btn'),
    };
  });
  expect(r.hiddenBefore).toBe(true);
  expect(r.hBefore).toBe('82px');
  expect(r.shownAfter).toBe(true);
  expect(r.hAfter).toBe('122px');     // 82 + 40px shortcut row
  expect(r.active).toBe(true);
  expect(r.hasBtns).toBe(true);
});

test('🔥 opens the Workout page (and is highlighted there); ✍️ opens the log sheet', async ({ page }) => {
  const r = await page.evaluate(() => {
    startWorkout();
    navTo('history'); // wander off
    document.getElementById('wbar-workout-btn').click();
    const onWorkout = currentPage, wHi = document.getElementById('wbar-workout-btn').classList.contains('active');
    modalState.open = false;
    document.getElementById('wbar-exercise-btn').click(); // exercise leaf is still the log-modal shim
    return { onWorkout, wHi, modalOpen: modalState.open };
  });
  expect(r.onWorkout).toBe('workout');
  expect(r.wHi).toBe(true);            // 🔥 highlighted while on the Workout page
  expect(r.modalOpen).toBe(true);      // ✍️ opened the log sheet
});

test('feat 246 — 🗺️ Plan opens the Plan Detail page (live interactive guide)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'bicep-curl');
    state.plans = [{ id: 'pX', name: 'Curl Day', steps: [{ id: 's1', sets: 3, options: [{ type: 'movement', familyId: 'bicep-curl' }] }] }];
    startWorkout();
    const s = getActiveSession(); s.planId = 'pX'; s.planRev = 1; saveState();
    navTo('history'); // wander off
    document.getElementById('wbar-plan-btn').click();
    return { page: currentPage, hasGuide: !!document.querySelector('#trk-main .plan-card'), steps: document.querySelectorAll('#trk-main .plan-step').length };
  });
  expect(r.page).toBe('plan-detail');
  expect(r.hasGuide).toBe(true);   // the interactive plan card (relocated off the workout tab)
  expect(r.steps).toBe(1);
});

test('ending the workout hides the row and restores the bar height', async ({ page }) => {
  const r = await page.evaluate(() => {
    startWorkout();
    const during = document.body.classList.contains('workout-active');
    pending = { varUuid: null, subUuid: null, sets: [{ w: '', r: '' }] };
    endWorkout(true); // the 🏁 hold path: skip the confirm
    return {
      during, after: document.body.classList.contains('workout-active'),
      h: getComputedStyle(document.body).getPropertyValue('--topbar-h').trim(),
    };
  });
  expect(r.during).toBe(true);
  expect(r.after).toBe(false);
  expect(r.h).toBe('82px');            // back to the two-row height
});

test('the rest-bar deep-link opens the Workout page', async ({ page }) => {
  const r = await page.evaluate(() => {
    startWorkout();
    navTo('volume');
    document.getElementById('rest-bar').click();
    return { page: currentPage };
  });
  expect(r.page).toBe('workout');
});
