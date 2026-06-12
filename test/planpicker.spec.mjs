// feat 112/115 — plan-aware picker: incomplete plan steps appear as chips; choosing one filters the
// picker to exactly that step's exercises (the union of its options). The dashboard reaches the same
// filter via openStepPicker.
// feat 179 — switching steps resets the normal filters (mega/sub/equip/search) to "all", and the pills
// then STACK with (intersect) the step set instead of overriding it; the count reads
// "X of Y step-compatible variations shown".
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

test('feat 179 — a plan-step filter STACKS with the mega pill (intersection, not override)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 1, options: [{ type: 'variation', uuid: a }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    const aMega = VAR_INDEX.get(a).family.mega;
    modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = '';
    modalState.planStepFilter = 0;
    modalState.pickerMega = 'all'; // pills neutral -> the step's exercise shows
    const allVars = filterVariations().flatMap((r) => r.variations.map((v) => v.uuid));
    modalState.pickerMega = aMega; // matching mega -> still shows (both satisfied)
    const matchVars = filterVariations().flatMap((r) => r.variations.map((v) => v.uuid));
    modalState.pickerMega = (aMega === 'push') ? 'pull' : 'push'; // conflicting mega -> intersection empty
    const conflictVars = filterVariations().flatMap((r) => r.variations.map((v) => v.uuid));
    return { allHasA: allVars.includes(a), matchHasA: matchVars.includes(a), conflictEmpty: conflictVars.length === 0 };
  });
  expect(r.allHasA).toBe(true);
  expect(r.matchHasA).toBe(true);
  expect(r.conflictEmpty).toBe(true);
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

test('feat 179 — entering a step resets the normal filters to all', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.readonly = false;
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 1, options: [{ type: 'variation', uuid: a }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    pending = { varUuid: null, subUuid: null, sets: [] };
    modalState.pickerMega = 'pull'; modalState.pickerSub = 'sub'; modalState.pickerEquip = 'barbell'; modalState.pickerSearch = 'zzz';
    openStepPicker(0);
    return { mega: modalState.pickerMega, sub: modalState.pickerSub, equip: modalState.pickerEquip, search: modalState.pickerSearch, filter: modalState.planStepFilter };
  });
  expect(r).toEqual({ mega: 'all', sub: 'all', equip: 'all', search: '', filter: 0 });
});

test('feat 179 — picker count reads "X of Y step-compatible" when a step is active', async ({ page }) => {
  const txt = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const fam = VAR_INDEX.get(a).family;
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 1, options: [{ type: 'movement', familyId: fam.id }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    modalState.planStepFilter = 0;
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = ''; modalState.pickerFavOnly = false;
    return renderPickerResults();
  });
  expect(txt).toMatch(/\b\d+ of \d+ step-compatible variations? shown\b/);
});
