// feat 397 — the toggle philosophy (feat 396) applied to EVERY picker filter: sub-group, equipment, explored, volume
// and trend are each a single cycling toggle (tap = next state, hold = reset). This covers the dynamic ones (sub/equip).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const openPicker = (mega) => {
  pending.varUuid = null; modalState.showPicker = true; modalState.open = true; modalState.supersetMode = false;
  modalState.pickerMega = mega; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = '';
  modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.pickerVolStatus = 'all'; modalState.pickerTrend = 'all'; modalState.planStepFilter = null;
  renderModal();
};
const tap = (id) => { const b = document.getElementById(id); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); };

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderModal === 'function' && typeof EQUIPMENT !== 'undefined' && typeof PICKER_CYCLES !== 'undefined', null, { timeout: 15000 });
});

test('feat 397 — no multi-pill filter rows remain; each filter is one toggle', async ({ page }) => {
  const r = await page.evaluate((open) => {
    eval('(' + open + ')')('push');
    return {
      explored: document.querySelectorAll('.pill[data-explored]').length,
      volstatus: document.querySelectorAll('.pill[data-volstatus]').length,
      trend: document.querySelectorAll('.pill[data-trend]').length,
      equipPills: document.querySelectorAll('.pill[data-equip]').length,
      subPills: document.querySelectorAll('.pill[data-sub]').length,
      toggles: ['cyc-sub', 'cyc-equip', 'cyc-explored', 'cyc-volstatus', 'cyc-trend'].filter(id => document.getElementById(id)).length,
    };
  }, openPicker.toString());
  expect(r.explored + r.volstatus + r.trend + r.equipPills + r.subPills).toBe(0); // all the old pill groups gone
  expect(r.toggles).toBe(5);                                                       // …replaced by five single toggles
});

test('feat 397 — the equipment toggle cycles through EQUIPMENT and a hold-reset path exists', async ({ page }) => {
  const r = await page.evaluate((open) => {
    eval('(' + open + ')')('all');
    const tapL = (id) => { const b = document.getElementById(id); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); };
    tapL('cyc-equip'); const e1 = modalState.pickerEquip;
    tapL('cyc-equip'); const e2 = modalState.pickerEquip;
    return { e1, e2, order: EQUIPMENT.map(e => e.id) };
  }, openPicker.toString());
  expect(r.e1).toBe(r.order[1]);   // all → barbell
  expect(r.e2).toBe(r.order[2]);   // → dumbbell
});

test('feat 397 — the sub-group toggle only appears once a category is chosen (collapses when Mega = All)', async ({ page }) => {
  const r = await page.evaluate((open) => {
    eval('(' + open + ')')('all');
    const whenAll = !!document.getElementById('cyc-sub');
    eval('(' + open + ')')('push');
    const whenPush = !!document.getElementById('cyc-sub');
    const b = document.getElementById('cyc-sub'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const afterTap = modalState.pickerSub; // first real sub-group of push
    return { whenAll, whenPush, afterTap };
  }, openPicker.toString());
  expect(r.whenAll).toBe(false);   // Mega = All has only the "all" sub-option → no toggle
  expect(r.whenPush).toBe(true);   // Push has real sub-groups → the toggle shows
  expect(r.afterTap).not.toBe('all');
});
