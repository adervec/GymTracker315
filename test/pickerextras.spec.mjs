// feat 383 — picker filter by the variation's primary-muscle recent-volume status (lagging / neutral / leading),
// classified from the last 3 weeks vs the muscle's MEV–MAV target.
// feat 384 — a 🎲 button that picks a random exercise from the currently-filtered list.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const benchUuid = (page) => page.evaluate(() => FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid);

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof muscleVolStatusMap === 'function' && typeof varVolStatus === 'function'
    && typeof renderModal === 'function' && typeof renderPickerResults === 'function', null, { timeout: 15000 });
});

const resetPicker = () => {
  pending.varUuid = null; modalState.showPicker = true; modalState.open = true; modalState.supersetMode = false;
  modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = '';
  modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.pickerVolStatus = 'all'; modalState.planStepFilter = null;
};

test('feat 383 — a muscle is lagging when untrained, neutral mid-range, leading when over target', async ({ page }) => {
  const bench = await benchUuid(page);
  const r = await page.evaluate((bench) => {
    state.muscleWeights = null;
    const sess = (n) => ({ id: 's' + n, date: new Date().toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: Array.from({ length: n }, () => ({ w: 100, r: 5 })) }] });
    const chestStatus = (n) => { state.sessions = n ? [sess(n)] : []; return muscleVolStatusMap('muscle')['mid-lower-chest']; };
    // bench → mid-lower-chest 0.6/set; 3-week avg = 0.6*n/3. target(mav)=9, mev≈4.95.
    const none = chestStatus(0);    // 0 → lagging
    const neutral = chestStatus(30); // avg 6 → neutral
    state.sessions = [sess(50)];     // avg 10 → leading
    const leading = muscleVolStatusMap('muscle')['mid-lower-chest'];
    const varSt = varVolStatus(bench, muscleVolStatusMap('muscle'));
    return { none, neutral, leading, varSt };
  }, bench);
  expect(r.none).toBe('lagging');
  expect(r.neutral).toBe('neutral');
  expect(r.leading).toBe('leading');
  expect(r.varSt).toBe('leading');   // the bench variation inherits its dominant muscle's status
});

test('feat 383 — the picker pills filter the list by status (and the bench lands under Leading, not Lagging)', async ({ page }) => {
  const bench = await benchUuid(page);
  const r = await page.evaluate((bench) => {
    state.muscleWeights = null;
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: Array.from({ length: 50 }, () => ({ w: 100, r: 5 })) }] }];
    pending.varUuid = null; modalState.showPicker = true; modalState.open = true; modalState.supersetMode = false;
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = '';
    modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.planStepFilter = null;
    renderModal();
    const single = document.querySelectorAll('[id="cyc-volstatus"]').length; // one toggle now, not three pills
    const oldPills = document.querySelectorAll('.pill[data-volstatus]').length;
    const has = (st) => { modalState.pickerVolStatus = st; const w = document.createElement('div'); w.innerHTML = renderPickerResults(); return { count: w.querySelectorAll('.picker-var').length, bench: !!w.querySelector(`.picker-var[data-varuuid="${bench}"]`) }; };
    const lagging = has('lagging'), leading = has('leading');
    // cycle via the single toggle: all → lagging → neutral → leading
    modalState.pickerVolStatus = 'all'; renderModal();
    const tap = () => { const b = document.getElementById('cyc-volstatus'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); };
    tap(); const afterTap1 = modalState.pickerVolStatus;
    tap(); tap(); const afterCycle = modalState.pickerVolStatus;
    return { single, oldPills, lagging, leading, afterTap1, afterCycle };
  }, bench);
  expect(r.single).toBe(1);
  expect(r.oldPills).toBe(0);
  expect(r.leading.bench).toBe(true);
  expect(r.lagging.bench).toBe(false);
  expect(r.lagging.count).toBeGreaterThan(0);  // all the untrained movements read as lagging
  expect(r.afterTap1).toBe('lagging');         // all → lagging
  expect(r.afterCycle).toBe('leading');        // …→ neutral → leading
});

test('feat 385 — filter variations by last-session e1RM direction (trended up / down)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bench = FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid;
    const squat = FAMILIES.find(f => f.id === 'squat').variations.find(v => v.uuid).uuid;
    const day = 86400000, now = Date.now();
    state.sessions = [
      { id: 'a', date: new Date(now - 10 * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 100, r: 5 }] }, { varUuid: squat, subUuid: null, sets: [{ w: 200, r: 5 }] }] },
      { id: 'b', date: new Date(now - 3 * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 120, r: 5 }] }, { varUuid: squat, subUuid: null, sets: [{ w: 180, r: 5 }] }] },
    ]; // bench 100→120 (up), squat 200→180 (down)
    const tm = buildVarTrendMap();
    const benchDir = varLastTrendDir(tm.get(bench)), squatDir = varLastTrendDir(tm.get(squat));
    pending.varUuid = null; modalState.showPicker = true; modalState.open = true; modalState.supersetMode = false;
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = '';
    modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.pickerVolStatus = 'all'; modalState.planStepFilter = null;
    const has = (mode) => { modalState.pickerTrend = mode; const w = document.createElement('div'); w.innerHTML = renderPickerResults(); return { bench: !!w.querySelector(`.picker-var[data-varuuid="${bench}"]`), squat: !!w.querySelector(`.picker-var[data-varuuid="${squat}"]`) }; };
    const up = has('up'), down = has('down');
    modalState.pickerTrend = 'all';
    return { benchDir, squatDir, up, down };
  });
  expect(r.benchDir).toBe('up');
  expect(r.squatDir).toBe('down');
  expect(r.up.bench).toBe(true);   // bench (went up) shows under "Trended up"…
  expect(r.up.squat).toBe(false);  // …squat (went down) does not
  expect(r.down.squat).toBe(true);
  expect(r.down.bench).toBe(false);
});

test('feat 384 — the dice button picks a random exercise from the filtered list', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    pending.varUuid = null; modalState.showPicker = true; modalState.open = true; modalState.supersetMode = false;
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = 'bench';
    modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.pickerVolStatus = 'all'; modalState.planStepFilter = null;
    renderModal();
    const visible = new Set([...document.querySelectorAll('#trk-picker-results-wrap .picker-var')].map(el => el.dataset.varuuid));
    document.getElementById('trk-picker-random').click(); // picks one and opens the sets form
    return { count: visible.size, picked: pending.varUuid, inVisible: visible.has(pending.varUuid), pickerClosed: modalState.showPicker === false };
  });
  expect(r.count).toBeGreaterThan(1);
  expect(r.picked).toBeTruthy();
  expect(r.inVisible).toBe(true);   // the pick came from the filtered list
  expect(r.pickerClosed).toBe(true); // …and it started that exercise
});

test('feat 384 — the dice is a no-op (no crash) when nothing matches', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    pending.varUuid = null; modalState.showPicker = true; modalState.open = true; modalState.supersetMode = false;
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = 'zzzzzznomatch';
    modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.pickerVolStatus = 'all'; modalState.planStepFilter = null;
    renderModal();
    document.getElementById('trk-picker-random').click();
    return { picked: pending.varUuid, stillPicker: modalState.showPicker };
  });
  expect(r.picked).toBeNull();        // nothing got picked
  expect(r.stillPicker).toBe(true);   // …and the picker stayed open
});
