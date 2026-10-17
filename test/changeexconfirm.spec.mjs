// feat 151 asked for confirmation before "Change exercise" with 2+ entered sets, warning that picking a
// different exercise "will discard them". feat 499 then found that a strength→strength pick does NOT discard —
// it carries the typed sets to the new exercise — and feat 507 settles that this carry-over is a FEATURE.
// So the button no longer warns (it discards nothing), the carry is announced by a toast, and the one
// destructive pick — switching to cardio, which empties the sheet — is still guarded where it happens.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderModal === 'function' && typeof window.confirmDialog === 'function'
    && typeof _applyPickedVar === 'function', null, { timeout: 15000 });
});

const setup = (page, nSets) => page.evaluate((nSets) => {
  let u = null; for (const [v] of VAR_INDEX) { if (exMode(v).mode === 'standard') { u = v; break; } }
  pending = { varUuid: u, subUuid: null, sets: Array.from({ length: nSets }, () => ({ w: 100, r: 5 })) };
  modalState.open = true; modalState.showPicker = false; modalState.isEditing = false;
  renderModal();
  return u;
}, nSets);

// a different, visible, standard-mode variation and a visible cardio one
const others = (page, from) => page.evaluate((from) => {
  let strength = null, cardio = null;
  for (const [u, i] of VAR_INDEX) {
    if (u === from || !varVisibleInPicker(i.family, i.variation)) continue;
    if (isCardioVar(u)) { if (!cardio) cardio = u; continue; }
    if (!strength && exMode(u).mode === 'standard') strength = u;
  }
  return { strength, cardio };
}, from);

test('feat 507 — Change exercise opens the picker immediately, even with sets entered', async ({ page }) => {
  await setup(page, 3);
  const r = await page.evaluate(() => {
    document.getElementById('trk-change-exercise').click();
    return { dialog: !!document.querySelector('.choice-backdrop'), picker: modalState.showPicker };
  });
  expect(r.dialog, 'opening the picker discards nothing, so it must not warn that it will').toBe(false);
  expect(r.picker).toBe(true);
});

test('feat 507 — picking a different STRENGTH exercise carries the sets over and says so', async ({ page }) => {
  const from = await setup(page, 2);
  const { strength } = await others(page, from);
  const r = await page.evaluate((to) => {
    document.getElementById('trk-change-exercise').click();
    document.querySelector(`.picker-var[data-varuuid="${to}"]`).click();
    return { varUuid: pending.varUuid, sets: pending.sets.filter(s => s.w !== '').map(s => s.w + 'x' + s.r),
      dialog: !!document.querySelector('.choice-backdrop'),
      toast: (document.querySelector('.toast') || {}).textContent || '', title: displayName(to, pending.subUuid) };
  }, strength);
  expect(r.varUuid).toBe(strength);
  expect(r.sets, 'the typed sets follow you to the new exercise').toEqual(['100x5', '100x5']);
  expect(r.dialog, 'nothing was lost, so nothing to confirm').toBe(false);
  expect(r.toast, 'but the move is announced').toContain('2 sets moved to');
  expect(r.toast).toContain(r.title);
});

test('feat 507 — picking CARDIO still asks, because that one does empty the sheet', async ({ page }) => {
  const from = await setup(page, 2);
  const { cardio } = await others(page, from);
  const r = await page.evaluate((to) => {
    document.getElementById('trk-change-exercise').click();
    document.querySelector(`.picker-var[data-varuuid="${to}"]`).click();
    return { dialog: !!document.querySelector('.choice-backdrop'), varUuid: pending.varUuid,
      entered: pending.sets.filter(s => s.w !== '').length };
  }, cardio);
  expect(r.dialog, 'exactly the destructive route is guarded').toBe(true);
  expect(r.varUuid, 'nothing changes until you confirm').toBe(from);
  expect(r.entered).toBe(2);
});

test('feat 507 — no sets entered, no toast', async ({ page }) => {
  const from = await setup(page, 0);
  const { strength } = await others(page, from);
  const r = await page.evaluate((to) => {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    document.getElementById('trk-change-exercise').click();
    document.querySelector(`.picker-var[data-varuuid="${to}"]`).click();
    return { varUuid: pending.varUuid, toast: (document.querySelector('.toast') || {}).textContent || '' };
  }, strength);
  expect(r.varUuid).toBe(strength);
  expect(r.toast).not.toContain('moved to');
});
