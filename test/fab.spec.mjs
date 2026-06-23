// feat 325 — the "+ Log Set" FAB must not surface an exercise name ("Continue: …") when no workout is active.
// Leftover pending data (an unsaved set buffer) is only a "Continue" prompt while a session is in progress.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof updateFAB === 'function' && typeof getActiveSession === 'function'
    && typeof hasPendingData === 'function', null, { timeout: 15000 });
});

const stdUuid = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; return null; });

test('no active workout → FAB stays "+ Log Set" even with leftover pending data', async ({ page }) => {
  const u = await stdUuid(page);
  const html = await page.evaluate((u) => {
    state.sessions = [];                                  // no active session
    pending = { varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] }; // stale in-progress buffer
    updateFAB();
    return document.getElementById('trk-fab').innerHTML;
  }, u);
  expect(html).toContain('+ Log Set');
  expect(html).not.toContain('Continue:'); // the exercise name must not leak onto the FAB
});

test('active workout + pending → FAB shows the Continue prompt', async ({ page }) => {
  const u = await stdUuid(page);
  const r = await page.evaluate((u) => {
    state.sessions = [{ id: 's', date: new Date().toISOString(), origin: state.deviceId, exercises: [] }]; // active (no endedAt)
    pending = { varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }] };
    updateFAB();
    const fab = document.getElementById('trk-fab');
    return { html: fab.innerHTML, pending: fab.className.includes('pending') };
  }, u);
  expect(r.html).toContain('Continue:');
  expect(r.pending).toBe(true);
});
