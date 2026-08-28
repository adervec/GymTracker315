// feat 494 — four quality-of-flow fixes in the log sheet:
//   • the target tiles propose sets that BEAT their record (matching is not enough): +1 rep on the
//     record set, or one weight increment up (kg +2.5 / lb +5) for the max-weight tile
//   • "Change exercise" opens the picker with NO step preselected (no more manual deselect)
//   • the end-of-exercise callout names the FIRST incomplete step in plan order, not the next one after
//   • the picker speaks the selected step's detailed description on open / step change, deduped so the
//     same description is never spoken twice in a row
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof annunceStepDesc === 'function' && typeof nextStepLabelAfterCurrent === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const std = () => {
  for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard' && !isCardioVar(u)) return u; }
};

test('feat 494 — every target tile beats its record; none merely matches it', async ({ page }) => {
  const tiles = await page.evaluate((stdSrc) => {
    const v = eval(stdSrc)();
    state.unit = 'kg'; state.readonly = false;
    const d = new Date(); d.setDate(d.getDate() - 3);
    state.sessions = [{ id: 'h', date: d.toISOString(), updatedAt: d.toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 100, r: 10 }], topSet: { w: 100, r: 10 } }] }];
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    return [...document.querySelectorAll('#trk-modal-body .prog-prefill.target-btn')].map(b => b.textContent.trim());
  }, `(${std.toString()})`);
  // record set 100×10 → the rep tiles ask for 100×11, the max-weight tile for 102.5×1
  expect(tiles.some(t => t.includes('100×11'))).toBe(true);
  expect(tiles.some(t => t.includes('102.5×1'))).toBe(true);
  expect(tiles.some(t => /\b100×10\b/.test(t))).toBe(false);
});

test('feat 494 — Change exercise (and the abort path) drop any lingering step filter', async ({ page }) => {
  const r = await page.evaluate((stdSrc) => {
    const v = eval(stdSrc)();
    state.readonly = false;
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 3, options: [{ type: 'variation', uuid: v }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.isEditing = false; modalState.showPicker = false; modalState.supersetMode = false;
    modalState.planStepFilter = 0;             // a stale selection from browsing the step earlier
    renderModal();
    document.getElementById('trk-change-exercise').click();
    const afterChange = { filter: modalState.planStepFilter, showPicker: modalState.showPicker };
    modalState.planStepFilter = 0;             // select a step in the picker, then abort back
    renderModal();
    document.getElementById('trk-picker-back-current').click();
    return { afterChange, afterBack: modalState.planStepFilter };
  }, `(${std.toString()})`);
  expect(r.afterChange.showPicker).toBe(true);
  expect(r.afterChange.filter, 'Change exercise browses ALL exercises').toBe(null);
  expect(r.afterBack, 'the abort path leaves no stale selection behind').toBe(null);
});

test('feat 494 — the callout names the FIRST incomplete step, not the next one after the current', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.plans = [{ id: 'P', name: 'P', steps: [
      { id: 'sA', sets: 2, options: [{ type: 'movement', familyId: 'squat' }] },
      { id: 'sB', sets: 2, options: [{ type: 'movement', familyId: 'bicep-curl' }] },
      { id: 'sC', sets: 2, options: [{ type: 'movement', familyId: 'deadlift' }] } ] }];
    state.sessions = [{ id: 's', date: new Date().toISOString(), updatedAt: new Date().toISOString(), planId: 'P', exercises: [] }];
    pending.varUuid = FAMILIES.find(f => f.id === 'bicep-curl').variations.find(x => exMode(x.uuid).mode === 'standard').uuid;
    pending.subUuid = null;
    const skippedFirst = nextStepLabelAfterCurrent();     // step A untouched → it comes first
    const sqU = FAMILIES.find(f => f.id === 'squat').variations[0].uuid;
    state.sessions[0].exercises = [{ varUuid: sqU, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }];
    const afterADone = nextStepLabelAfterCurrent();       // A complete → the deadlift step is next
    pending.varUuid = null; state.plans = []; state.sessions = [];
    return { skippedFirst, afterADone,
      sq: FAMILIES.find(f => f.id === 'squat').title, dl: FAMILIES.find(f => f.id === 'deadlift').title };
  });
  expect(r.skippedFirst, 'the FIRST incomplete step wins').toBe(r.sq);
  expect(r.afterADone, 'once it is done, the next incomplete one does').toBe(r.dl);
});

test('feat 494 — the picker speaks the selected step description, never the same one twice in a row', async ({ page }) => {
  const spoken = await page.evaluate((stdSrc) => {
    const v = eval(stdSrc)();
    window._spoken = [];
    window.speechSynthesis.cancel = () => {};
    window.speechSynthesis.speak = (u) => { window._spoken.push(u.text); };
    state.readonly = false; state.ttsTips = true;
    state.plans = [{ id: 'P', name: 'P', steps: [
      { id: 's0', sets: 2, desc: 'Warm up, then three heavy triples.', options: [{ type: 'variation', uuid: v }] },
      { id: 's1', sets: 2, desc: 'Slow eccentrics, squeeze at the top.', options: [{ type: 'variation', uuid: v }] } ] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    pending = { varUuid: null, subUuid: null, sets: [] };
    openStepPicker(0);                                     // opening on a step speaks its description
    annunceStepDesc();                                     // same step again → silent (dedupe)
    modalState.planStepFilter = 1; annunceStepDesc();      // switching steps speaks the new one
    modalState.planStepFilter = 0; annunceStepDesc();      // back again — different from the last → speaks
    modalState.planStepFilter = null; annunceStepDesc();   // no selection → silent
    return window._spoken;
  }, `(${std.toString()})`);
  expect(spoken).toEqual([
    'Warm up, then three heavy triples.',
    'Slow eccentrics, squeeze at the top.',
    'Warm up, then three heavy triples.',
  ]);
});
