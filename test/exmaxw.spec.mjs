// feat 434 — per-exercise max weight: a cap for suggestions and data entry on ONE variation, set from a
// ⚖️ chip on the Exercise page. It tightens the feat-364 global limit machinery (red inputs, warn/block
// on save), clamps suggested weights and reference-button prefills, and 0 clears it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exMaxW === 'function' && typeof effectiveMaxW === 'function'
    && typeof openLogModal === 'function' && typeof suggestedWeightForVar === 'function', null, { timeout: 15000 });
});

const stdVar = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; });

test('feat 434 — set/clear roundtrip, and the cap tightens (never loosens) the effective max', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    state.readonly = false; state.unit = 'lb'; state.maxWeightLb = 500;
    setExMaxW(v, 120);
    const set120 = { cap: exMaxW(v), eff: effectiveMaxW(v), effOther: effectiveMaxW('nope') };
    setExMaxW(v, 9999);                       // a cap ABOVE the global limit must not loosen it
    const wide = effectiveMaxW(v);
    setExMaxW(v, 0);                          // 0 clears
    return { ...set120, wide, cleared: exMaxW(v), effCleared: effectiveMaxW(v) };
  }, v);
  expect(r.cap).toBe(120);
  expect(r.eff).toBe(120);
  expect(r.effOther).toBe(500);
  expect(r.wide).toBe(500);
  expect(r.cleared).toBeNull();
  expect(r.effCleared).toBe(500);
});

test('feat 434 — validation and prefill respect the cap; suggestions clamp to it', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    state.readonly = false; state.unit = 'lb'; state.maxWeightLb = 500;
    const now = Date.now();
    state.sessions = [{ id: 's', date: new Date(now - 3 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 200, r: 5 }] }] }];
    setExMaxW(v, 150);
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    const feasibleOver = isSetFeasible({ w: 160, r: 5 }, v);
    const feasibleUnder = isSetFeasible({ w: 150, r: 5 }, v);
    const validOver = isSetValid({ w: 160, r: 5 }, v);
    const validIgnore = isSetValid({ w: 160, r: 5 }, v, true);
    const sug = suggestedWeightForVar(v, 'heavy');            // baseline 200 → suggestion would exceed 150
    prefillTargetWeight(200);                                  // reference above the cap prefills the cap
    const prefilled = pending.sets[0].w;
    setExMaxW(v, 0);
    return { feasibleOver, feasibleUnder, validOver, validIgnore, sug, prefilled };
  }, v);
  expect(r.feasibleOver).toBe(false);
  expect(r.feasibleUnder).toBe(true);
  expect(r.validOver).toBe(false);
  expect(r.validIgnore).toBe(true);          // save path's ignoreCap still bypasses (soft-limit warn flow)
  expect(r.sug).toBeLessThanOrEqual(150);
  expect(r.prefilled).toBe(150);
});

test('feat 434 — the ⚖️ chip renders, and the prompt sets then clears the cap', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate(async (v) => {
    state.readonly = false; state.unit = 'lb'; state.exerciseMaxW = {};
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    const chip = document.getElementById('trk-ex-maxw');
    const before = chip ? chip.textContent.trim() : '';
    document.querySelectorAll('.choice-backdrop').forEach(x => x.remove());
    chip.click();
    await new Promise(res => setTimeout(res, 50));
    const sheet = [...document.querySelectorAll('.choice-backdrop')].pop();
    sheet.querySelector('.choice-input').value = '135';
    sheet.querySelector('[data-pd="ok"]').click();
    await new Promise(res => setTimeout(res, 50));
    const after = document.getElementById('trk-ex-maxw').textContent.trim();
    const hasCapCls = document.getElementById('trk-ex-maxw').classList.contains('has-cap');
    const stored = exMaxW(v);
    closeLogModal();
    document.querySelectorAll('.choice-backdrop').forEach(x => x.remove());
    return { before, after, hasCapCls, stored };
  }, v);
  expect(r.before).toContain('Set max');
  expect(r.stored).toBe(135);
  expect(r.after).toContain('Max 135lb');
  expect(r.hasCapCls).toBe(true);
});
