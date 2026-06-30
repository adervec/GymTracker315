// feat 396 — the picker's All/Push/Pull/Lower/Core/Full mega filter is now ONE toggle button: tap cycles to the next
// category, long-press reverts to All.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const openPicker = () => {
  pending.varUuid = null; modalState.showPicker = true; modalState.open = true; modalState.supersetMode = false;
  modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = '';
  modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.pickerVolStatus = 'all'; modalState.pickerTrend = 'all'; modalState.planStepFilter = null;
  renderModal();
};

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderModal === 'function' && typeof MEGA_ORDER !== 'undefined' && typeof modalState !== 'undefined', null, { timeout: 15000 });
});

test('feat 396 — the mega filter is a single toggle pill, not six', async ({ page }) => {
  const r = await page.evaluate((open) => {
    eval('(' + open + ')')();
    const pills = [...document.querySelectorAll('.picker .pill[data-mega]')];
    const toggle = document.getElementById('trk-picker-mega');
    return { count: pills.length, hasToggle: !!toggle, label: toggle && toggle.textContent.trim(), order: MEGA_ORDER };
  }, openPicker.toString());
  expect(r.count).toBe(1);              // collapsed from six pills to one
  expect(r.hasToggle).toBe(true);
  expect(r.label).toBe('All');          // starts on All
  expect(r.order[0]).toBe('all');
});

test('feat 396 — a tap cycles to the next category and updates the label', async ({ page }) => {
  const r = await page.evaluate((open) => {
    eval('(' + open + ')')();
    const tap = () => { const b = document.getElementById('trk-picker-mega'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); };
    tap(); const after1 = { mega: modalState.pickerMega, label: document.getElementById('trk-picker-mega').textContent.trim() };
    tap(); const after2 = modalState.pickerMega;
    return { after1, after2, expect1: MEGA_ORDER[1], expect2: MEGA_ORDER[2] };
  }, openPicker.toString());
  expect(r.after1.mega).toBe(r.expect1);                 // all -> push (MEGA_ORDER[1])
  expect(r.after1.label.toLowerCase()).toContain(r.expect1);
  expect(r.after2).toBe(r.expect2);                      // push -> pull
});

test('feat 396 — a long-press reverts the toggle to All', async ({ page }) => {
  await page.evaluate((open) => {
    eval('(' + open + ')')();
    // advance off All, then start a hold (no release) on the freshly-rendered button
    const tap = () => { const b = document.getElementById('trk-picker-mega'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); };
    tap(); tap(); // -> pull (not All)
    document.getElementById('trk-picker-mega').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }, openPicker.toString());
  // trackerPress longMs defaults to 2000ms — wait it out, then the hold should have reset to All
  await page.waitForTimeout(2400);
  const mega = await page.evaluate(() => modalState.pickerMega);
  expect(mega).toBe('all');
});
