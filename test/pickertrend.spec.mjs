// feat 332 — the exercise picker discreetly indicates how each available variation is trending: a small e1RM
// trend dot (▲ improving · ▼ declining · – holding) per row, computed once per render and only shown with 2+
// training days of data, so it never implies a trend it can't support.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof e1rmTrend === 'function' && typeof buildVarTrendMap === 'function'
    && typeof pickerTrendBadge === 'function' && typeof renderPickerResults === 'function', null, { timeout: 15000 });
});

const setPickerOpen = () => { modalState.pickerSearch = ''; modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.planStepFilter = null; }; // eslint-disable-line

test('e1rmTrend classifies up / down / flat and needs 2+ points', async ({ page }) => {
  const r = await page.evaluate(() => ({
    up: e1rmTrend([100, 110, 125]),
    down: e1rmTrend([125, 110, 100]),
    flat: e1rmTrend([100, 100, 100]),
    none: e1rmTrend([100]),
    empty: e1rmTrend([]),
  }));
  expect(r.up.dir).toBe('up');
  expect(r.up.pct).toBeGreaterThan(0);
  expect(r.down.dir).toBe('down');
  expect(r.flat.dir).toBe('flat');
  expect(r.none).toBeNull();   // a single data point is not a trend
  expect(r.empty).toBeNull();
});

test('buildVarTrendMap collapses same-day sessions to the best e1RM and orders chronologically', async ({ page }) => {
  const r = await page.evaluate((src) => {
    const stdVar = eval('(' + src + ')'); let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: '1', date: iso(20), exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] },
      { id: '2', date: iso(20), exercises: [{ varUuid: a, sets: [{ w: 110, r: 5 }] }] }, // same day → collapses, keeps best
      { id: '3', date: iso(2),  exercises: [{ varUuid: a, sets: [{ w: 140, r: 5 }] }] },
    ];
    const series = buildVarTrendMap().get(a);
    return { len: series.length, climbing: series[0] < series[series.length - 1], dir: e1rmTrend(series).dir };
  }, '() => {}');
  expect(r.len).toBe(2);          // two distinct training days
  expect(r.climbing).toBe(true);
  expect(r.dir).toBe('up');
});

test('renderPickerResults shows a trend dot on a climbing variation', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: '1', date: iso(21), exercises: [{ varUuid: a, sets: [{ w: 90, r: 5 }] }] },
      { id: '2', date: iso(14), exercises: [{ varUuid: a, sets: [{ w: 95, r: 5 }] }] },
      { id: '3', date: iso(7),  exercises: [{ varUuid: a, sets: [{ w: 98, r: 5 }] }] },
      { id: '4', date: iso(1),  exercises: [{ varUuid: a, sets: [{ w: 108, r: 5 }] }] },
    ];
    modalState.pickerSearch = ''; modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.planStepFilter = null;
    const html = renderPickerResults();
    return { up: /picker-trend pt-up/.test(html), count: (html.match(/picker-trend/g) || []).length };
  });
  expect(r.up).toBe(true);
  expect(r.count).toBeGreaterThanOrEqual(1); // the trained variation carries the dot
});

test('no trend dot until there are 2+ training days (discrete — never a false signal)', async ({ page }) => {
  const r = await page.evaluate(() => {
    modalState.pickerSearch = ''; modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.planStepFilter = null;
    state.sessions = [];
    const none = renderPickerResults();
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.sessions = [{ id: 'x', date: new Date().toISOString(), exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] }]; // one day only
    const oneDay = renderPickerResults();
    return { noneHas: /picker-trend/.test(none), oneDayHas: /picker-trend/.test(oneDay) };
  });
  expect(r.noneHas).toBe(false);   // nothing logged → no dots at all
  expect(r.oneDayHas).toBe(false); // a single day is not a trend
});
