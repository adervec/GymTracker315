// feat 178 — favorite plans and exercise variations: a ★ toggle on plan rows and picker rows, persisted in
// synced state (favoritePlans / favoriteVars), a "★ Favorites" filter on both pickers, and favorites-first sort.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof toggleFavVar === 'function' && typeof isFavVar === 'function'
    && typeof toggleFavPlan === 'function' && typeof renderPlansList === 'function' && typeof renderPickerResults === 'function', null, { timeout: 15000 });
});

test('toggling persists in synced state and is idempotent', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null; for (const [k] of VAR_INDEX) { if (!isSuppressedVar(k)) { u = k; break; } }
    state.favoriteVars = {}; state.favoritePlans = {};
    toggleFavVar(u); const on = isFavVar(u);
    toggleFavVar(u); const off = isFavVar(u);
    toggleFavPlan('seed-push'); const planOn = isFavPlan('seed-push');
    return { on, off, planOn, inKeys: SETTINGS_KEYS.includes('favoriteVars') && SETTINGS_KEYS.includes('favoritePlans') };
  });
  expect(r.on).toBe(true);
  expect(r.off).toBe(false);
  expect(r.planOn).toBe(true);
  expect(r.inKeys).toBe(true); // synced settings
});

test('normalizeState backfills the favorites maps', async ({ page }) => {
  const r = await page.evaluate(() => {
    delete state.favoriteVars; delete state.favoritePlans;
    normalizeState();
    return { v: typeof state.favoriteVars, p: typeof state.favoritePlans };
  });
  expect(r.v).toBe('object');
  expect(r.p).toBe('object');
});

test('the picker shows a ★ per row, floats favorites to the top, and filters to favorites only', async ({ page }) => {
  const r = await page.evaluate(() => {
    // favorite the SECOND visible variation of the first family so the sort is observable
    let famId = null, vars = [];
    for (const f of FAMILIES) { const vis = (f.variations || []).filter(v => varVisibleInPicker(f, v)); if (vis.length >= 2) { famId = f.id; vars = vis; break; } }
    const favUuid = vars[1].uuid;
    state.favoriteVars = {}; toggleFavVar(favUuid);
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = ''; modalState.planStepFilter = null;
    modalState.pickerFavOnly = false;
    const wrap = document.createElement('div'); wrap.innerHTML = renderPickerResults();
    const hasStar = !!wrap.querySelector('[data-fav-var]');
    // within the favorited var's family group, the favorited row should be first
    const fam = [...wrap.querySelectorAll('.picker-family-group')].find(g => g.querySelector(`[data-varuuid="${favUuid}"]`));
    const firstRowUuid = fam ? fam.querySelector('.picker-var').dataset.varuuid : null;
    // now favorites-only
    modalState.pickerFavOnly = true;
    const wrap2 = document.createElement('div'); wrap2.innerHTML = renderPickerResults();
    const onlyUuids = [...wrap2.querySelectorAll('.picker-var')].map(e => e.dataset.varuuid);
    return { hasStar, firstRowUuid, favUuid, onlyFav: onlyUuids.length > 0 && onlyUuids.every(u => isFavVar(u)) };
  });
  expect(r.hasStar).toBe(true);
  expect(r.firstRowUuid).toBe(r.favUuid); // favorite floated to the top of its family
  expect(r.onlyFav).toBe(true);           // favorites-only filter shows nothing but favorites
});

test('the plan list shows a ★ per row, a Favorites chip, and a favorites-only filter', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.favoritePlans = {}; toggleFavPlan('seed-push');
    _plansFavOnly = false; _plansSearch = ''; _plansCatFilter = new Set(); _plansLenRange = { min: 5, max: 120 };
    const body = document.createElement('div'); renderPlansList(body);
    const hasStar = !!body.querySelector('[data-fav-plan]');
    const hasChip = !!body.querySelector('[data-plan-fav]');
    // favorites-only filter → only favorited plans render (and the star shows "on").
    // feat 240 — the full list is paginated, so check the on-star on the fav-only view where the
    // single favourite is guaranteed visible rather than relying on it landing on page 1 of the library.
    _plansFavOnly = true;
    const body2 = document.createElement('div'); renderPlansList(body2);
    const favStarOn = !!body2.querySelector('.fav-star.on');
    const rows = [...body2.querySelectorAll('.plan-row')];
    const names = rows.map(r => r.querySelector('.plan-row-name').textContent);
    return { hasStar, hasChip, favStarOn, favCount: rows.length, names };
  });
  expect(r.hasStar).toBe(true);
  expect(r.hasChip).toBe(true);
  expect(r.favStarOn).toBe(true);
  expect(r.favCount).toBe(1);            // exactly the one favorited plan
});

test('favorites live in serialized state, so they persist + sync', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null; for (const [k] of VAR_INDEX) { u = k; break; }
    state.favoriteVars = {}; state.favoritePlans = {};
    toggleFavVar(u); toggleFavPlan('seed-pull');
    const json = JSON.stringify(state); // saveState persists this to localStorage; cloud sync pushes the same
    return { hasFavVars: json.includes('"favoriteVars"'), hasFavPlans: json.includes('"favoritePlans"'), hasUuid: json.includes(u) };
  });
  expect(r.hasFavVars).toBe(true);
  expect(r.hasFavPlans).toBe(true);
  expect(r.hasUuid).toBe(true);
});
