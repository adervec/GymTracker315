// feat 201 — hold 📋 Copy with NO open set: a new set is created duplicating the most recent set in
// BOTH weight and reps (latest valid pending set, else the last logged set in history). The feat-142
// behavior (open set → fill its empty reps) is unchanged.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof duplicateLastSet === 'function' && typeof copyRepsToOpenSet === 'function', null, { timeout: 15000 });
});

const arm = (page, sets, sessions) => page.evaluate(({ sets, sessions }) => {
  normalizeState();
  state.sessions = sessions || [];
  const fam = FAMILIES.find(f => f.id === 'bicep-curl');
  const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
  openLogModal();
  modalState.showPicker = false; modalState.isEditing = false;
  pending.varUuid = u; pending.subUuid = null;
  pending.sets = sets;
  renderModal();
  return u;
}, { sets, sessions });

test('no open set + a valid pending set → hold dupes it (weight AND reps)', async ({ page }) => {
  await arm(page, [{ w: '50', r: '10' }]);
  const r = await page.evaluate(() => { copyRepsToOpenSet(); return pending.sets.map(s => ({ w: s.w, r: s.r })); });
  expect(r).toHaveLength(2);
  expect(String(r[1].w)).toBe('50'); // the dupe carries the weight…
  expect(String(r[1].r)).toBe('10'); // …and the reps
});

test('the form blank row is reused for the dupe (no stacked rows)', async ({ page }) => {
  await arm(page, [{ w: '50', r: '10' }, { w: '', r: '' }]);
  const r = await page.evaluate(() => { copyRepsToOpenSet(); return pending.sets.map(s => ({ w: s.w, r: s.r })); });
  expect(r).toHaveLength(2);          // the blank row was filled, not appended after
  expect(String(r[1].w)).toBe('50');
  expect(String(r[1].r)).toBe('10');
});

test('with an empty form, the dupe sources the last logged set from history', async ({ page }) => {
  const u = await arm(page, [{ w: '', r: '' }]);
  await page.evaluate((u) => {
    state.sessions = [{ id: 'h1', date: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date().toISOString(),
      exercises: [{ varUuid: u, subUuid: null, sets: [{ w: '45', r: '8' }, { w: '47.5', r: '6' }] }] }];
  }, u);
  const r = await page.evaluate(() => { copyRepsToOpenSet(); return pending.sets.map(s => ({ w: s.w, r: s.r })); });
  expect(r).toHaveLength(1);
  expect(String(r[0].w)).toBe('47.5'); // the LAST set of the most recent session
  expect(String(r[0].r)).toBe('6');
});

test('an open set still gets the feat-142 reps-fill, not a duped row', async ({ page }) => {
  await arm(page, [{ w: '50', r: '10' }, { w: '60', r: '' }]);
  const r = await page.evaluate(() => { copyRepsToOpenSet(); return pending.sets.map(s => ({ w: s.w, r: s.r })); });
  expect(r).toHaveLength(2);          // no new row
  expect(String(r[1].w)).toBe('60');  // open set keeps its own weight
  expect(String(r[1].r)).toBe('10');  // reps copied into it
});

test('nothing pending and no history → no-op with nothing created', async ({ page }) => {
  await arm(page, [{ w: '', r: '' }]);
  const r = await page.evaluate(() => { copyRepsToOpenSet(); return pending.sets.map(s => ({ w: s.w, r: s.r })); });
  expect(r).toEqual([{ w: '', r: '' }]);
});
