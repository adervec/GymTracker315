// feat 364 — the weight limit can be a SOFT warning (warn, but save anyway) or a HARD limit (over-limit saves are
// refused outright). state.maxWeightHard: false (default, soft) | true (hard).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof saveSets === 'function' && typeof VAR_INDEX !== 'undefined'
    && typeof normalizeState === 'function' && typeof renderSettingsDrawer === 'function', null, { timeout: 15000 });
});

// pick a standard-mode variation, set a low limit, stage an active (unplanned) session
async function stage(page, { hard, sets }) {
  return page.evaluate(({ hard, sets }) => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.readonly = false; state.alwaysConfirm = false; state.maxWeightHard = hard;
    state.unit = 'lb'; state.maxWeightLb = 500;
    state.sessions = [{ id: 'today', date: new Date().toISOString(), exercises: [] }];
    pending = { varUuid: a, subUuid: null, sets };
    modalState.open = true; modalState.isEditing = false; modalState.showPicker = false; modalState.planStepFilter = null;
  }, { hard, sets });
}

const savedWeights = (page) => page.evaluate(() =>
  (state.sessions[0].exercises || []).flatMap(e => (e.sets || []).map(s => s.w)));

test('feat 364 — default is soft; maxWeightHard is a persisted setting', async ({ page }) => {
  const r = await page.evaluate(() => { normalizeState(); return { def: state.maxWeightHard, inKeys: SETTINGS_KEYS.includes('maxWeightHard') }; });
  expect(r.def).toBe(false);
  expect(r.inKeys).toBe(true);
});

test('feat 364 — HARD limit refuses an over-limit save and saves nothing', async ({ page }) => {
  await stage(page, { hard: true, sets: [{ w: 900, r: 5 }, { w: 300, r: 5 }] });
  const r = await page.evaluate(async () => {
    const p = saveSets();
    await new Promise(res => setTimeout(res, 30));
    const title = [...document.querySelectorAll('.choice-title')].map(t => t.textContent).find(t => /Hard weight limit/.test(t)) || '';
    (document.querySelector('.choice-actions .choice-btn') || {}).click?.();   // the (only) affirmative button
    const ok = await p;
    return { ok, title };
  });
  expect(r.title).toMatch(/Hard weight limit/);
  expect(r.ok).toBe(false);
  expect(await savedWeights(page)).toEqual([]);   // nothing saved — the limit can't be violated
});

test('feat 364 — HARD limit still saves an under-limit set normally', async ({ page }) => {
  await stage(page, { hard: true, sets: [{ w: 300, r: 5 }] });
  const ok = await page.evaluate(() => saveSets());
  expect(ok).toBe(true);
  expect(await savedWeights(page)).toEqual([300]);
});

test('feat 364 — SOFT limit warns but saves the over-limit set when confirmed', async ({ page }) => {
  await stage(page, { hard: false, sets: [{ w: 900, r: 5 }, { w: 300, r: 5 }] });
  const r = await page.evaluate(async () => {
    const p = saveSets();
    await new Promise(res => setTimeout(res, 30));
    const title = [...document.querySelectorAll('.choice-title')].map(t => t.textContent).find(t => /Over the weight limit/.test(t)) || '';
    // click "Save" (the first / affirmative action) to save anyway
    (document.querySelector('.choice-actions .choice-btn') || {}).click?.();
    const ok = await p;
    return { ok, title };
  });
  expect(r.title).toMatch(/Over the weight limit/);
  expect(r.ok).toBe(true);
  expect(await savedWeights(page)).toEqual([900, 300]);  // the over-limit set is kept
});

test('feat 364 — the settings drawer has a Soft/Hard enforcement toggle that persists', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.maxWeightHard = false;
    renderSettingsDrawer();
    const body = document.getElementById('settings-drawer-body');
    const pills = body.querySelectorAll('[data-pref-wlimit]').length;
    body.querySelector('[data-pref-wlimit="hard"]').click();
    const afterHard = { val: state.maxWeightHard, persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).maxWeightHard };
    document.querySelector('[data-pref-wlimit="soft"]').click();
    return { pills, afterHard, afterSoft: state.maxWeightHard };
  });
  expect(r.pills).toBe(2);
  expect(r.afterHard.val).toBe(true);
  expect(r.afterHard.persisted).toBe(true);
  expect(r.afterSoft).toBe(false);
});
