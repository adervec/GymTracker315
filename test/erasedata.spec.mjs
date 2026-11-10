// feat 558 — house standards: one control erases ALL of GymTracker's data on this device, and ONLY GymTracker's
// (every app shares the adervec.github.io origin), it confirms first, and it never pushes the emptied state to the
// cloud. Plus: the embedded guides load no third-party font CDN.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test('feat 558 — erase removes every GymTracker key and database, keeps the shared ones, and confirms first', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof eraseAllAppData === 'function' && typeof openSettingsDrawer === 'function');
  await page.evaluate(async () => {
    state.sessions.push({ id: 'erase-me', date: new Date().toISOString(), exercises: [] }); saveState();
    localStorage.setItem('gt_page', 'history'); localStorage.setItem('overload_tracker_log_v1', '[]');
    localStorage.setItem('maker-font', 'serif'); localStorage.setItem('portal-installed', '{"x":1}'); localStorage.setItem('other-app-key', 'keep');
    await new Promise(r => { const q = indexedDB.open('gymtracker-sounds', 1); q.onupgradeneeded = () => q.result.createObjectStore('clips'); q.onsuccess = () => { q.result.close(); r(); }; });
  });

  // the control asks first; cancelling changes nothing
  await page.evaluate(() => { openSettingsDrawer(); });
  await page.evaluate(() => { const b = document.getElementById('drawer-reset-btn'); b.scrollIntoView(); });
  await page.evaluate(() => document.getElementById('drawer-reset-btn').click());
  const dlg = page.locator('.choice-sheet').last();
  await expect(dlg).toContainText('Google Drive copy');
  await expect(dlg).toContainText('NOT touched');
  await dlg.locator('button', { hasText: /cancel/i }).first().click();
  expect(await page.evaluate(() => !!localStorage.getItem('overload_tracker_v2'))).toBe(true);

  const pushed = await page.evaluate(async () => {
    let n = 0; const orig = window.cloudPushTrigger; window.cloudPushTrigger = () => { n++; };
    await eraseAllAppData({ noReload: true });
    saveState(); savePending(); persistLog(); // nothing may write the old state back while the erase is in flight
    window.cloudPushTrigger = orig;
    const dbs = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [];
    return { n, keys: Object.keys(localStorage).sort(), dbs };
  });
  expect(pushed.n, 'nothing is pushed to the cloud').toBe(0);
  expect(pushed.keys).toEqual(['maker-font', 'other-app-key', 'portal-installed']);
  expect(pushed.dbs.filter(n => /^gymtracker/.test(n))).toEqual([]);

  // and the app comes back as a fresh install
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof state !== 'undefined');
  expect(await page.evaluate(() => state.sessions.some(s => s.id === 'erase-me'))).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('maker-font'))).toBe('serif');
});

test('feat 558 — no embedded guide loads a third-party font CDN', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  const r = await page.evaluate(() => [...document.querySelectorAll('template')].map(t => t.innerHTML).filter(h => /fonts\.(googleapis|gstatic)\.com/.test(h)).length);
  expect(r).toBe(0);
});
