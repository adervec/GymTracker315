// feat 112/115 — plan-aware picker: incomplete plan steps appear as chips; choosing one filters the
// picker to exactly that step's exercises (the union of its options), overriding the mega/sub/equip
// pills. The dashboard reaches the same filter via openStepPicker.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.stepQualifyingVarSet === 'function'
    && typeof window.filterVariations === 'function'
    && typeof window.openStepPicker === 'function'
    && typeof window.renderPicker === 'function', null, { timeout: 15000 });
});

test('stepQualifyingVarSet unions variation + whole-movement options', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const fam = VAR_INDEX.get(a).family;
    const sv = stepQualifyingVarSet({ options: [{ type: 'variation', uuid: a }] });
    const sm = stepQualifyingVarSet({ options: [{ type: 'movement', familyId: fam.id }] });
    // feat 167 — a whole-movement step qualifies its native variations PLUS any cross-listed (secondary) ones
    const secCount = secondaryVarsForFamily(fam.id).length;
    return { varHasA: sv.has(a), varSize: sv.size, movHasA: sm.has(a), movSize: sm.size, famCount: fam.variations.filter((v) => v.uuid).length, secCount };
  });
  expect(r.varHasA).toBe(true);
  expect(r.varSize).toBe(1);
  expect(r.movHasA).toBe(true);
  expect(r.movSize).toBe(r.famCount + r.secCount); // every native variation + every cross-listed (secondary) variation qualifies
});

test('a plan-step filter overrides the mega pill and shows only that step exercises', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 1, options: [{ type: 'variation', uuid: a }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    const aMega = VAR_INDEX.get(a).family.mega;
    modalState.pickerMega = (aMega === 'push') ? 'pull' : 'push'; // a mega 'a' is NOT in -> would normally exclude it
    modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = '';
    modalState.planStepFilter = 0;
    const vars = filterVariations().flatMap((r) => r.variations.map((v) => v.uuid));
    return { onlyA: vars.length === 1 && vars[0] === a };
  });
  expect(r.onlyA).toBe(true);
});

test('renderPicker shows incomplete-step chips when a plan is active', async ({ page }) => {
  const html = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.plans = [{ id: 'P', name: 'My Plan', steps: [{ id: 's0', sets: 2, options: [{ type: 'variation', uuid: a }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    modalState.isEditing = false; modalState.supersetMode = false; modalState.planStepFilter = null;
    return renderPicker();
  });
  expect(html).toContain('picker-steps');
  expect(html).toContain('data-picker-step="0"');
  expect(html).toContain('My Plan');
});

test('openStepPicker opens the modal with the picker filtered to the step', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.readonly = false;
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 1, options: [{ type: 'variation', uuid: a }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    pending = { varUuid: null, subUuid: null, sets: [] };
    openStepPicker(0);
    const body = document.getElementById('trk-modal-body');
    return { filter: modalState.planStepFilter, showPicker: modalState.showPicker, open: modalState.open, hasChip: !!body.querySelector('[data-picker-step="0"]') };
  });
  expect(r.filter).toBe(0);
  expect(r.showPicker).toBe(true);
  expect(r.open).toBe(true);
  expect(r.hasChip).toBe(true);
});
