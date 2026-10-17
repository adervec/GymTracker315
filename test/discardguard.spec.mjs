// feat 499 — one guard for "this throws away the in-progress sheet". feat 151's confirm was inline on the
// Change-exercise button and guarded only a state flip, so every other route to a new exercise discarded
// 2+ entered sets silently: the plan-step option chips (which reset pending.sets AND savePending(), taking
// the localStorage copy too) and a tap on a logged row. The guard now lives at the destruction points.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof guardPendingDiscard === 'function' && typeof renderPlanGuide === 'function'
    && typeof _applyPickedVar === 'function' && typeof isCardioVar === 'function'
    && typeof startExerciseFromPlanOption === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
  null, { timeout: 15000 });
});

// two standard-mode variations + a plan whose step 1 offers the second one
const seed = (page, nSets) => page.evaluate((nSets) => {
  let a = null, b = null;
  for (const [u] of VAR_INDEX) { if (exMode(u).mode !== 'standard') continue; if (!a) { a = u; continue; } b = u; break; }
  state.unit = 'lb'; state.readonly = false;
  state.plans = [{ id: 'P', name: 'Guard Plan', steps: [
    { id: 's1', sets: 2, options: [{ type: 'variation', uuid: b }], load: 'moderate' } ] }];
  state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', planRev: 1, exercises: [] }];
  const sets = []; for (let i = 0; i < nSets; i++) sets.push({ w: 100, r: 10 - i });
  sets.push({ w: '', r: '' });
  pending = { varUuid: a, subUuid: null, sets };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
  return { a, b };
}, nSets);

test('feat 499 — a plan-step option chip with 2 unsaved sets asks first, and Keep logging loses nothing', async ({ page }) => {
  const { a } = await seed(page, 2);
  const r = await page.evaluate(() => {
    navTo('plan-detail');
    const chip = document.querySelector('#trk-main .plan-opt[data-plan-step]');
    const found = !!chip;
    if (chip) chip.click();
    return { found, dialog: !!document.querySelector('.choice-backdrop'),
      varUuid: pending.varUuid, entered: pending.sets.filter(s => s.w !== '').length };
  });
  expect(r.found, 'the plan page renders an option chip').toBe(true);
  expect(r.dialog, 'the chip must ask before discarding the sheet').toBe(true);
  expect(r.varUuid).toBe(a);     // nothing changed yet
  expect(r.entered).toBe(2);     // and the sets are still there
  // cancel → the sheet survives untouched
  await page.evaluate(() => [...document.querySelectorAll('.choice-backdrop button')]
    .find(b => /keep logging/i.test(b.textContent)).click());
  await page.waitForFunction(() => !document.querySelector('.choice-backdrop'), null, { timeout: 3000 }); // closes after its 200ms fade
  const kept = await page.evaluate(() => ({ varUuid: pending.varUuid, entered: pending.sets.filter(s => s.w !== '').length }));
  expect(kept.varUuid).toBe(a);
  expect(kept.entered).toBe(2);
});

test('feat 499 — confirming the chip proceeds to the new exercise', async ({ page }) => {
  const { b } = await seed(page, 2);
  await page.evaluate(() => { navTo('plan-detail'); document.querySelector('#trk-main .plan-opt[data-plan-step]').click(); });
  await page.evaluate(() => [...document.querySelectorAll('.choice-backdrop button')]
    .find(x => /change exercise/i.test(x.textContent)).click());
  const r = await page.evaluate(() => ({ varUuid: pending.varUuid, n: pending.sets.length, w: pending.sets[0].w }));
  expect(r.varUuid).toBe(b);   // the step's exercise started
  expect(r.n).toBe(1);
  expect(r.w).toBe('');        // fresh blank sheet (feat 331)
});

test('feat 499 — one entered set still switches straight through (feat 151 threshold unchanged)', async ({ page }) => {
  const { b } = await seed(page, 1);
  const r = await page.evaluate(() => {
    navTo('plan-detail');
    document.querySelector('#trk-main .plan-opt[data-plan-step]').click();
    return { dialog: !!document.querySelector('.choice-backdrop'), varUuid: pending.varUuid };
  });
  expect(r.dialog).toBe(false);
  expect(r.varUuid).toBe(b);
});

test('feat 499 — startExerciseFromSuggestion stays synchronous when there is nothing to lose', async ({ page }) => {
  // the firstsetblank.spec contract: called with an empty pending, it must act immediately
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    pending = { varUuid: null, subUuid: null, sets: [{ w: '', r: '' }] };
    startExerciseFromSuggestion(a);
    return { varUuid: pending.varUuid === a, dialog: !!document.querySelector('.choice-backdrop'), n: pending.sets.length };
  });
  expect(r.varUuid, 'applied synchronously, no dialog deferral').toBe(true);
  expect(r.dialog).toBe(false);
  expect(r.n).toBe(1);
});

test('feat 499 — tapping a logged row to edit it also asks before overwriting the sheet', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null, b = null;
    for (const [u] of VAR_INDEX) { if (exMode(u).mode !== 'standard') continue; if (!a) { a = u; continue; } b = u; break; }
    const d = new Date().toISOString();
    state.sessions = [{ id: 'cur', date: d, exercises: [{ varUuid: b, subUuid: null, sets: [{ w: 50, r: 5 }] }] }];
    pending = { varUuid: a, subUuid: null, sets: [{ w: 100, r: 10 }, { w: 100, r: 9 }] };
    modalState.isEditing = false;
    editExisting(d, b, null);
    return { dialog: !!document.querySelector('.choice-backdrop'), varUuid: pending.varUuid === a,
      entered: pending.sets.filter(s => s.w !== '').length, editing: modalState.isEditing };
  });
  expect(r.dialog, 'overwriting an in-progress sheet must ask').toBe(true);
  expect(r.varUuid, 'the sheet is untouched until confirmed').toBe(true);
  expect(r.entered).toBe(2);
  expect(r.editing, 'edit mode is not entered until confirmed').toBe(false);
});

test('feat 499 — the dialog prints the exercise name literally, not HTML-escaped', async ({ page }) => {
  // choiceDialog already escapes the message, so the feat-151 escapeHtml() double-escaped: the 14 titles
  // holding an apostrophe or & read "Farmer&#39;s Carry".
  const r = await page.evaluate(() => {
    let v = null;
    for (const [u, i] of VAR_INDEX) { if (/'/.test(i.variation.title)) { v = u; break; } }
    pending = { varUuid: v, subUuid: null, sets: [{ w: 100, r: 10 }, { w: 100, r: 9 }] };
    modalState.isEditing = false;
    guardPendingDiscard(() => {});
    const msg = document.querySelector('.choice-msg');
    return { title: VAR_INDEX.get(v).variation.title, text: msg ? msg.textContent : '' };
  });
  expect(r.title).toMatch(/'/);                 // the fixture really is an apostrophe title
  expect(r.text).toContain(r.title);            // rendered literally…
  expect(r.text).not.toContain('&#39;');        // …not double-escaped
});

test('feat 499 — picking a CARDIO exercise asks (it empties the sheet); strength→strength does not', async ({ page }) => {
  const r = await page.evaluate(() => {
    let s1 = null, s2 = null, cardio = null;
    for (const [u] of VAR_INDEX) {
      const i = VAR_INDEX.get(u);
      if (!varVisibleInPicker(i.family, i.variation)) continue;
      if (isCardioVar(u)) { if (!cardio) cardio = u; continue; }
      if (exMode(u).mode !== 'standard') continue;
      if (!s1) s1 = u; else if (!s2) s2 = u;
    }
    const arm = () => { _discardGrant = null; pending = { varUuid: s1, subUuid: null, sets: [{ w: 100, r: 10 }, { w: 100, r: 9 }] };
      modalState.isEditing = false; modalState.showPicker = true; };
    // a) cardio pick → guarded, nothing destroyed yet
    arm();
    renderModal();
    let row = document.querySelector(`.picker-var[data-varuuid="${cardio}"]`);
    if (row) row.click();
    const cardioAsked = !!document.querySelector('.choice-backdrop');
    const cardioKept = pending.varUuid === s1 && pending.sets.filter(x => x.w !== '').length === 2;
    document.querySelectorAll('.choice-backdrop button').forEach(b => { if (/keep logging/i.test(b.textContent)) b.click(); });
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove()); // it fades over 200ms; drop it now so (b) sees a clean DOM
    // b) strength → strength: no prompt (the sets carry over — see TODO.md)
    arm(); renderModal();
    row = document.querySelector(`.picker-var[data-varuuid="${s2}"]`);
    if (row) row.click();
    const strengthAsked = !!document.querySelector('.choice-backdrop');
    return { cardioFound: !!cardio, cardioAsked, cardioKept, strengthAsked, strengthSwitched: pending.varUuid === s2 };
  });
  expect(r.cardioFound).toBe(true);
  expect(r.cardioAsked, 'a cardio pick empties pending.sets — it must ask').toBe(true);
  expect(r.cardioKept, 'and change nothing until confirmed').toBe(true);
  expect(r.strengthAsked, 'a strength switch keeps the sets, so no discard prompt').toBe(false);
  expect(r.strengthSwitched).toBe(true);
});

test('feat 507 — Change exercise then a cardio row prompts exactly once', async ({ page }) => {
  // feat 499 needed a "grant" so this sequence did not ask twice. feat 507 dropped the Change-exercise
  // prompt (it discards nothing), so the cardio pick is the ONLY prompt and the grant is gone.
  const r = await page.evaluate(() => {
    let s1 = null, cardio = null;
    for (const [u] of VAR_INDEX) {
      const i = VAR_INDEX.get(u);
      if (!varVisibleInPicker(i.family, i.variation)) continue;
      if (isCardioVar(u)) { if (!cardio) cardio = u; continue; }
      if (!s1 && exMode(u).mode === 'standard') s1 = u;
    }
    pending = { varUuid: s1, subUuid: null, sets: [{ w: 100, r: 10 }, { w: 100, r: 9 }] };
    openLogModal(); modalState.isEditing = false; modalState.showPicker = false; renderModal();
    document.getElementById('trk-change-exercise').click();
    const afterChange = document.querySelectorAll('.choice-backdrop').length;
    document.querySelector(`.picker-var[data-varuuid="${cardio}"]`).click();
    const afterCardio = document.querySelectorAll('.choice-backdrop').length;
    return { afterChange, afterCardio, grantGone: typeof _discardGrant === 'undefined' };
  });
  expect(r.afterChange, 'Change exercise asks nothing').toBe(0);
  expect(r.afterCardio, 'the cardio pick asks exactly once').toBe(1);
  expect(r.grantGone, 'no grant left to keep in sync').toBe(true);
});
