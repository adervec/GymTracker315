// feat 324 — profile syncs on its OWN last-write-wins timestamp (state.profileSavedAt), independent of the coarse
// settings savedAt. Before, the gym phone constantly bumped savedAt by logging, so a profile edit on the desktop
// (older overall savedAt) never propagated — and a read-merge-write push could clobber it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof applyImport === 'function' && typeof touchProfile === 'function'
    && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('touchProfile stamps the profile timestamp', async ({ page }) => {
  const ts = await page.evaluate(() => { state.profileSavedAt = ''; touchProfile(); return state.profileSavedAt; });
  expect(typeof ts).toBe('string');
  expect(ts.length).toBeGreaterThan(0);
});

test('a local profile edit is NOT clobbered by an unrelated newer save from the phone', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.savedAt = '2026-06-22T10:00:00.000Z';
    state.profile = { name: 'Adam', dob: '1990-01-01', heightCm: 180, gender: 'male' };
    state.profileSavedAt = '2026-06-22T12:00:00.000Z';        // profile edited at noon on THIS device
    // incoming file saved LATER overall (the phone just logged a workout) but its profile is stale
    applyImport({ savedAt: '2026-06-22T20:00:00.000Z', profileSavedAt: '2026-06-20T00:00:00.000Z',
      profile: { name: 'OLD', dob: '', heightCm: null, gender: '' }, sessions: [] }, 'merge');
    return { name: state.profile.name, height: state.profile.heightCm, savedAt: state.savedAt };
  });
  expect(r.name).toBe('Adam');     // the local profile wins despite the newer incoming savedAt
  expect(r.height).toBe(180);
  expect(r.savedAt).toBe('2026-06-22T20:00:00.000Z'); // other settings still adopt the newer file
});

test('a remote profile edit IS adopted even when the file is otherwise older', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.savedAt = '2026-06-22T20:00:00.000Z'; // this device has the newer overall save
    state.profile = { name: 'OLD', dob: '', heightCm: null, gender: '' };
    state.profileSavedAt = '2026-06-20T00:00:00.000Z';
    // incoming file is OLDER overall, but its profile was edited more recently (on the other device)
    applyImport({ savedAt: '2026-06-22T10:00:00.000Z', profileSavedAt: '2026-06-22T15:00:00.000Z',
      profile: { name: 'NewName', dob: '1991-02-02', heightCm: 175, gender: 'female' }, sessions: [] }, 'merge');
    return { name: state.profile.name, height: state.profile.heightCm };
  });
  expect(r.name).toBe('NewName');  // the newer remote profile is adopted independent of the coarse savedAt gate
  expect(r.height).toBe(175);
});
