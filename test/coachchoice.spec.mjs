// feat 549 — on a plan step's filtered picker, the coach's choice leads the list: progress what is moving, rotate
// off what has stalled, and say why.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coachChoiceForStep === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  await page.evaluate(() => {
    const by = id => { for (const [u, i] of VAR_INDEX) if (i.variation.id === id) return u; };
    window._bb = by('bb-flat-bench'); window._db = by('db-flat-bench');
    const at = d => new Date(Date.now() - d * 864e5).toISOString();
    window._setup = (bbReps, load) => {
      state.sessions = [];
      bbReps.forEach((r, k) => state.sessions.push({ id: 'b' + k, date: at(3 + k * 4), endedAt: at(3 + k * 4), exercises: [{ varUuid: _bb, sets: [{ w: 100, r }] }] }));
      [30, 40, 50].forEach((d, k) => state.sessions.push({ id: 'd' + k, date: at(d), endedAt: at(d), exercises: [{ varUuid: _db, sets: [{ w: 34 - k * 2, r: 8 }] }] }));
      state.plans = (state.plans || []).filter(x => x.id !== 'cc');
      state.plans.push({ id: 'cc', name: 'Push', steps: [{ id: 's1', sets: 3, load, options: [{ type: 'movement', familyId: 'flat-bench-press' }] }] });
      state.sessions.push({ id: 'live', date: new Date().toISOString(), planId: 'cc', exercises: [] });
      state.favoriteVars = {};
      pending = { varUuid: null, sets: [] };
      openLogModal(); modalState.showPicker = true; modalState.planStepFilter = 0; modalState.pickerSearch = ''; renderModal();
      const el = document.querySelector('.picker-coach');
      return el ? { uuid: el.querySelector('.picker-var').dataset.varuuid, why: el.querySelector('.picker-var-secfrom').textContent, first: el === document.querySelector('.picker-results .picker-family-group') } : null;
    };
  });
});

test('feat 549 — a lift that is moving gets the pick, and the row says why', async ({ page }) => {
  const r = await page.evaluate(() => _setup([7, 6, 6, 5, 5, 5], 'heavy'));
  expect(r.uuid).toBe(await page.evaluate(() => _bb));
  expect(r.first).toBe(true);
  expect(r.why).toContain('trending up');
  expect(r.why).toContain('what you did last time');
});

test('feat 549 — a stalled lift hands the pick to a sibling that is climbing', async ({ page }) => {
  const r = await page.evaluate(() => _setup([5, 5, 5, 5, 6, 5], 'heavy'));
  expect(r.uuid).toBe(await page.evaluate(() => _db));
  expect(r.why).toContain('fresh angle');
});

test('feat 549 — only on a plan step, never on the open picker, and 🎲 ignores it', async ({ page }) => {
  const r = await page.evaluate(() => {
    _setup([7, 6, 6, 5, 5, 5], 'heavy');
    const onStep = !!document.querySelector('.picker-coach');
    modalState.planStepFilter = null; renderModal();
    const offStep = !!document.querySelector('.picker-coach');
    modalState.planStepFilter = 0; renderModal();
    const randomPool = [...document.querySelectorAll('#trk-picker-results-wrap .picker-var:not(.usual)')].some(e => e.closest('.picker-coach'));
    return { onStep, offStep, randomPool };
  });
  expect(r.onStep).toBe(true);
  expect(r.offStep).toBe(false);
  expect(r.randomPool).toBe(false);
});
