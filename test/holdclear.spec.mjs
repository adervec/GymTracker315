// feat 200 — press-and-hold ✕ Clear wipes the in-progress exercise WITHOUT the confirm popup;
// a tap keeps the themed confirm (or the feat-32 arm flow). Mirrors the feat-199 Save pattern.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doClearPending === 'function' && typeof openLogModal === 'function', null, { timeout: 15000 });
});

async function armPending(page) {
  await page.evaluate(() => {
    normalizeState();
    state.sessions = [];
    const fam = FAMILIES.find(f => f.id === 'bicep-curl');
    const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
    openLogModal();
    modalState.showPicker = false; modalState.isEditing = false;
    pending.varUuid = u; pending.subUuid = null;
    pending.sets = [{ w: '50', r: '10' }];
    renderModal();
  });
}

test('holding ✕ Clear wipes the pending exercise with no confirm sheet', async ({ page }) => {
  await armPending(page);
  const btn = page.locator('#trk-modal-clear');
  await btn.dispatchEvent('pointerdown');
  await page.waitForTimeout(1500);
  await btn.dispatchEvent('pointerup');
  await page.waitForFunction(() => !pending.varUuid);
  expect(await page.locator('.choice-backdrop').count()).toBe(0);  // never asked
  const r = await page.evaluate(() => ({ sets: pending.sets, picker: modalState.showPicker }));
  expect(r.sets).toEqual([{ w: '', r: '' }]); // back to the blank row
  expect(r.picker).toBe(true);                // and the picker is showing again
});

test('a tap on ✕ Clear still asks; cancel keeps the data', async ({ page }) => {
  await armPending(page);
  await page.click('#trk-modal-clear');
  await expect(page.locator('.choice-backdrop')).toHaveCount(1);   // themed confirm appears
  await page.evaluate(() => document.querySelector('.choice-backdrop').click()); // dismiss = cancel
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ varUuid: pending.varUuid, w: pending.sets[0].w }));
  expect(r.varUuid).toBeTruthy();  // nothing cleared
  expect(String(r.w)).toBe('50');
});

test('a hold with nothing pending toasts and is a no-op', async ({ page }) => {
  await page.evaluate(() => {
    normalizeState(); openLogModal();
    clearPending(); pending.sets = [{ w: '', r: '' }]; renderModal();
  });
  const btn = page.locator('#trk-modal-clear');
  await btn.dispatchEvent('pointerdown');
  await page.waitForTimeout(1500);
  await btn.dispatchEvent('pointerup');
  const r = await page.evaluate(() => ({ varUuid: pending.varUuid, sets: pending.sets }));
  expect(r.varUuid).toBeFalsy();
  expect(r.sets).toEqual([{ w: '', r: '' }]);
  expect(await page.locator('.choice-backdrop').count()).toBe(0);
});
