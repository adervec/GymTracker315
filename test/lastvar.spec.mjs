// feat 381 — the exercise picker marks, per movement (family), which VARIATION you used last time (↺ Last) and the
// time before that (↺ Prev), from session history. Built by buildFamilyLastVarMap.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildFamilyLastVarMap === 'function' && typeof renderPickerResults === 'function'
    && typeof VAR_INDEX !== 'undefined', null, { timeout: 15000 });
});

// two distinct variations within ONE family (so "last" and "prev" can differ)
const twoVarsInAFamily = (page) => page.evaluate(() => {
  for (const f of FAMILIES) {
    const vs = (f.variations || []).filter(v => v.uuid && varVisibleInPicker(f, v));
    if (vs.length >= 2) return { fam: f.id, a: vs[0].uuid, b: vs[1].uuid };
  }
  return null;
});

test('feat 381 — buildFamilyLastVarMap returns the last + previous-session variation per family', async ({ page }) => {
  const picked = await twoVarsInAFamily(page);
  const r = await page.evaluate(({ fam, a, b }) => {
    const day = 86400000, now = Date.now();
    // 3 sessions: oldest = b, middle = a, newest = b  →  last=b, prev=a
    state.sessions = [
      { id: 's1', date: new Date(now - 6 * day).toISOString(), exercises: [{ varUuid: b, subUuid: null, sets: [{ w: 100, r: 5 }] }] },
      { id: 's2', date: new Date(now - 3 * day).toISOString(), exercises: [{ varUuid: a, subUuid: null, sets: [{ w: 100, r: 5 }] }] },
      { id: 's3', date: new Date(now - 1 * day).toISOString(), exercises: [{ varUuid: b, subUuid: null, sets: [{ w: 105, r: 5 }] }] },
    ];
    const m = buildFamilyLastVarMap().get(fam);
    return { last: m.last, prev: m.prev };
  }, picked);
  expect(r.last).toBe(picked.b);   // most recent session used b
  expect(r.prev).toBe(picked.a);   // the session before used a
});

test('feat 381 — the picker renders ↺ Last on the last variation and ↺ Prev on the one before', async ({ page }) => {
  const picked = await twoVarsInAFamily(page);
  const r = await page.evaluate(({ fam, a, b }) => {
    const day = 86400000, now = Date.now();
    state.sessions = [
      { id: 's2', date: new Date(now - 3 * day).toISOString(), exercises: [{ varUuid: a, subUuid: null, sets: [{ w: 100, r: 5 }] }] }, // prev
      { id: 's3', date: new Date(now - 1 * day).toISOString(), exercises: [{ varUuid: b, subUuid: null, sets: [{ w: 105, r: 5 }] }] }, // last
    ];
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = ''; modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.planStepFilter = null;
    const wrap = document.createElement('div'); wrap.innerHTML = renderPickerResults();
    const badgeOf = (uuid) => { const row = wrap.querySelector(`.picker-var[data-varuuid="${uuid}"]`); const el = row && row.querySelector('.lastdone-badge'); return el ? el.textContent.trim() : null; };
    return { lastBadge: badgeOf(b), prevBadge: badgeOf(a) };
  }, picked);
  expect(r.lastBadge).toContain('Last');
  expect(r.prevBadge).toContain('Prev');
});

test('feat 381 — same variation both sessions → only ↺ Last (no Prev), and untrained rows have no badge', async ({ page }) => {
  const picked = await twoVarsInAFamily(page);
  const r = await page.evaluate(({ fam, a, b }) => {
    const day = 86400000, now = Date.now();
    state.sessions = [
      { id: 's1', date: new Date(now - 3 * day).toISOString(), exercises: [{ varUuid: a, subUuid: null, sets: [{ w: 100, r: 5 }] }] },
      { id: 's2', date: new Date(now - 1 * day).toISOString(), exercises: [{ varUuid: a, subUuid: null, sets: [{ w: 100, r: 5 }] }] }, // a both times
    ];
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = ''; modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.planStepFilter = null;
    const m = buildFamilyLastVarMap().get(fam);
    const wrap = document.createElement('div'); wrap.innerHTML = renderPickerResults();
    const badgeOf = (uuid) => { const row = wrap.querySelector(`.picker-var[data-varuuid="${uuid}"]`); const el = row && row.querySelector('.lastdone-badge'); return el ? el.textContent.trim() : null; };
    return { mapLast: m.last, mapPrev: m.prev, aBadge: badgeOf(a), bBadge: badgeOf(b) };
  }, picked);
  expect(r.mapLast).toBe(picked.a);
  expect(r.mapPrev).toBe(picked.a);   // same variation both times
  expect(r.aBadge).toContain('Last'); // shows Last (not Prev) since last === prev
  expect(r.bBadge).toBeNull();        // the never-used variation gets no badge
});
