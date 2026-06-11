// feat 199 — press-and-hold 💾 Save saves WITHOUT the confirm popup (the feat-108 End-Workout pattern:
// tap asks, hold acts). The tap path keeps the per-mode onclick and its themed confirm sheet.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof saveSets === 'function' && typeof openLogModal === 'function', null, { timeout: 15000 });
});

async function armValidSet(page) {
  await page.evaluate(() => {
    normalizeState();
    state.alwaysConfirm = true;            // force the save-confirm popup on the tap path
    state.sessions = [];
    const fam = FAMILIES.find(f => f.id === 'bicep-curl');
    const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
    openLogModal();
    modalState.showPicker = false; modalState.isEditing = false;
    pending.varUuid = u; pending.subUuid = null;
    pending.sets = [{ w: '50', r: '10' }];
    renderModal(); updateSaveBtn();
  });
}

test('holding 💾 Save saves immediately — no confirm sheet (alwaysConfirm on)', async ({ page }) => {
  await armValidSet(page);
  const btn = page.locator('#trk-save-btn');
  await expect(btn).toBeEnabled();
  await btn.dispatchEvent('pointerdown');   // hold past the 1200ms threshold
  await page.waitForTimeout(1500);
  await btn.dispatchEvent('pointerup');
  await page.waitForFunction(() => state.sessions.length === 1 && state.sessions[0].exercises.length === 1);
  expect(await page.locator('.choice-backdrop').count()).toBe(0); // never asked
  const sets = await page.evaluate(() => state.sessions[0].exercises[0].sets);
  expect(sets).toHaveLength(1);
  expect(String(sets[0].w)).toBe('50');
});

test('a tap on 💾 Save still asks via the themed confirm sheet', async ({ page }) => {
  await armValidSet(page);
  await page.click('#trk-save-btn');
  await expect(page.locator('.choice-backdrop')).toHaveCount(1);  // the popup appears for a tap
  await page.evaluate(() => document.querySelector('.choice-backdrop').click()); // dismiss = cancel
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => state.sessions.length)).toBe(0); // nothing saved
  expect(await page.evaluate(() => _saveSkipConfirm)).toBe(false);  // the one-shot flag never leaks
});

test('a hold on a disabled Save (no valid set) does nothing', async ({ page }) => {
  await page.evaluate(() => {
    normalizeState(); state.sessions = [];
    openLogModal(); modalState.showPicker = false;
    pending.varUuid = FAMILIES.find(f => f.id === 'bicep-curl').variations[0].uuid;
    pending.sets = [{ w: '', r: '' }];
    renderModal(); updateSaveBtn();
  });
  const btn = page.locator('#trk-save-btn');
  await expect(btn).toBeDisabled();
  await btn.dispatchEvent('pointerdown');
  await page.waitForTimeout(1500);
  await btn.dispatchEvent('pointerup');
  expect(await page.evaluate(() => state.sessions.length)).toBe(0);
});
