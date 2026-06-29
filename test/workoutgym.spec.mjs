// feat 245 — the active workout shows which gym you're at (workoutGymHtml), and workout start GPS-locates the
// nearest saved gym within 2 km (startWorkout → pingLocationSelectGym, when any gym has coordinates).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof workoutGymHtml === 'function'
    && typeof startWorkout === 'function' && typeof pingLocationSelectGym === 'function', null, { timeout: 15000 });
});

test('feat 245 — workoutGymHtml reflects the active gym, the no-gym prompt, and stays empty with no gyms', async ({ page }) => {
  const r = await page.evaluate(() => {
    // no gyms at all → nothing (don't clutter)
    state.gyms = []; state.activeGymId = null;
    const none = workoutGymHtml();
    // a gym with coords, set active → name + "located" badge + a relocate control
    state.gyms = [{ id: 'g1', name: 'Iron Temple', lat: 49.28, lng: -123.12, equip: {}, show: {}, hide: {} }];
    state.activeGymId = 'g1';
    const active = workoutGymHtml();
    // gyms exist but none active (and none have coords) → "No gym set", no relocate
    state.gyms = [{ id: 'g2', name: 'Annex', lat: null, lng: null, equip: {}, show: {}, hide: {} }];
    state.activeGymId = null;
    const noActive = workoutGymHtml();
    return { none, active, noActive };
  });
  expect(r.none).toBe('');
  expect(r.active).toContain('Iron Temple');
  expect(r.active).toContain('located');           // GPS coords saved
  expect(r.active).toContain('id="wg-relocate"');  // can re-locate by GPS
  expect(r.active).toContain('id="wg-change"');
  expect(r.noActive).toContain('No gym set');
  expect(r.noActive).toContain('Pick a gym');
  expect(r.noActive).not.toContain('id="wg-relocate"'); // no coords anywhere → no GPS control
});

test('feat 245 — the active-workout dashboard renders the gym chip above the controls', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false;
    state.gyms = [{ id: 'g1', name: 'Iron Temple', lat: 49.28, lng: -123.12, equip: {}, show: {}, hide: {} }];
    state.activeGymId = 'g1';
    state.sessions = [{ id: 'sG', date: new Date().toISOString(), updatedAt: new Date().toISOString(), exercises: [] }];
    navTo('workout');
    const chip = document.querySelector('#trk-main .workout-gym');
    const controls = document.querySelector('#trk-main .workout-controls');
    return {
      present: !!chip,
      name: chip?.querySelector('.wg-name')?.textContent,
      aboveControls: !!chip && !!controls && !!(chip.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(r.present).toBe(true);
  expect(r.name).toBe('Iron Temple');
  expect(r.aboveControls).toBe(true);
});

test('feat 245/371 — startWorkout ALWAYS records the start location (even with no saved gym coords)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false;
    state.workoutControls = { ...(state.workoutControls || {}), hrAutoConnect: false }; // skip the BT reconnect in test
    let calls = 0; window.captureWorkoutStartLocation = () => { calls++; }; // feat 371 — startWorkout records raw GPS on every start
    // no gym has coords → location is STILL recorded (and reconciled to a gym later)
    state.sessions = []; state.activeGymId = null;
    state.gyms = [{ id: 'g1', name: 'A', lat: null, lng: null, equip: {}, show: {}, hide: {} }];
    startWorkout(); const withoutCoords = calls; endWorkout(true);
    // a gym has coords → also recorded (and auto-selects the nearest within 2 km)
    calls = 0; state.sessions = [];
    state.gyms = [{ id: 'g2', name: 'B', lat: 49.2, lng: -123.1, equip: {}, show: {}, hide: {} }];
    startWorkout(); const withCoords = calls; endWorkout(true);
    return { withoutCoords, withCoords };
  });
  expect(r.withoutCoords).toBe(1); // feat 371 — recorded even without any saved gym coordinates
  expect(r.withCoords).toBe(1);
});

// feat 259 — the gym IS the session location. It shows on the workout page in every state, and the active gym is
// stamped onto the in-progress session (so history records where you trained) on start and on any gym change.
test('feat 259 — the gym chip shows on the workout page even before a workout starts', async ({ page }) => {
  const present = await page.evaluate(() => {
    state.readonly = false; state.sessions = [];                 // no active workout
    state.gyms = [{ id: 'g1', name: 'Iron Temple', lat: null, lng: null, equip: {}, show: {}, hide: {} }];
    state.activeGymId = 'g1';
    navTo('workout');
    return !!document.querySelector('#trk-main .workout-gym');
  });
  expect(present).toBe(true); // visible while idle, not just during an active session
});

test('feat 259 — startWorkout stamps the active gym as the session location; changing the gym updates it', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false;
    state.workoutControls = { ...(state.workoutControls || {}), hrAutoConnect: false };
    window.pingLocationSelectGym = () => {}; // no GPS in test
    state.sessions = [];
    state.gyms = [{ id: 'g1', name: 'Iron Temple', lat: null, lng: null, equip: {}, show: {}, hide: {} },
                  { id: 'g2', name: 'Annex Barbell', lat: null, lng: null, equip: {}, show: {}, hide: {} }];
    state.activeGymId = 'g1';
    startWorkout();
    const onStart = getActiveSession().notes && getActiveSession().notes.location;
    setActiveGym('g2');                       // correct the gym mid-session
    const afterChange = getActiveSession().notes.location;
    endWorkout(true);
    return { onStart, afterChange };
  });
  expect(r.onStart).toBe('Iron Temple');     // recorded automatically at start
  expect(r.afterChange).toBe('Annex Barbell'); // follows the active gym
});

test('feat 259 — stampActiveSessionGym is a no-op when not training', async ({ page }) => {
  const threw = await page.evaluate(() => {
    state.sessions = []; state.activeGymId = null;
    state.gyms = [{ id: 'g1', name: 'Iron Temple', lat: null, lng: null, equip: {}, show: {}, hide: {} }];
    try { setActiveGym('g1'); return false; } catch (e) { return true; } // must not throw with no active session
  });
  expect(threw).toBe(false);
});
