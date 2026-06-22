// feat 300 — adding a set on the exercise (log-sets) sheet must leave the new row fully visible. The modal
// footer is position:sticky;bottom:0, so a freshly appended row at the bottom of a long list was hidden
// behind it. revealLastSetRow() scrolls the modal just enough to lift the new row clear of the footer.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof addSetRow === 'function' && typeof revealLastSetRow === 'function'
    && typeof renderModal === 'function', null, { timeout: 15000 });
});

const stdUuid = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; return null; });

test('a newly added set row is scrolled clear of the sticky footer', async ({ page }) => {
  const u = await stdUuid(page);
  await page.evaluate((u) => {
    state.sessions = [];
    modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
    const sets = [];
    for (let i = 0; i < 40; i++) sets.push({ w: 100, r: 5, wTs: '2026-01-01T00:00:00Z', ts: '2026-01-01T00:01:00Z' });
    pending = { varUuid: u, subUuid: null, sets }; // a long, all-valid list so the bottom overflows the viewport
    document.getElementById('trk-modal').classList.add('open');
    renderModal();
    document.getElementById('trk-modal').scrollTop = 0; // start at the top: the new bottom row would be off-screen
    addSetRow('prev');                                  // append a 41st row → triggers revealLastSetRow()
  }, u);

  // the (smooth) reveal scroll should bring the last row fully above the footer and on-screen
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('#trk-sets-container .set-row');
    const last = rows[rows.length - 1];
    const footer = document.getElementById('trk-modal-footer');
    if (!last || !footer) return false;
    const lr = last.getBoundingClientRect(), ft = footer.getBoundingClientRect().top;
    return lr.bottom <= ft + 1 && lr.top >= 0;
  }, null, { timeout: 6000 });

  const m = await page.evaluate(() => {
    const rows = document.querySelectorAll('#trk-sets-container .set-row');
    const last = rows[rows.length - 1];
    const footer = document.getElementById('trk-modal-footer');
    const lr = last.getBoundingClientRect(), ft = footer.getBoundingClientRect().top;
    return { count: rows.length, bottom: Math.round(lr.bottom), footerTop: Math.round(ft), top: Math.round(lr.top) };
  });
  expect(m.count).toBe(41);                          // the row was actually appended
  expect(m.bottom).toBeLessThanOrEqual(m.footerTop + 1); // …and lifted clear of the sticky footer
  expect(m.top).toBeGreaterThanOrEqual(0);           // …and on-screen
});
