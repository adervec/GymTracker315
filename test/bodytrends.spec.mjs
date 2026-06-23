// feat 326 — body-composition trends: a line chart + start→latest delta per metric (weight, body fat, muscle,
// body water, tape measurements) over time, on the Body page. Pure series builder + the render are tested here.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof bodyCompSeries === 'function' && typeof renderBodyTrends === 'function'
    && typeof renderBody === 'function', null, { timeout: 15000 });
});

test('bodyCompSeries returns ascending, non-null points per field', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.bodyComp = [
      { date: '2026-06-01', weightKg: 82, bodyFatPct: 18 },
      { date: '2026-06-15', weightKg: 81 },                 // no body fat that day
      { date: '2026-06-22', weightKg: 80, bodyFatPct: 17 },
    ];
    const w = bodyCompSeries('weightKg'), bf = bodyCompSeries('bodyFatPct');
    return { wLen: w.length, ascending: w[0].t < w[1].t && w[1].t < w[2].t, wVals: w.map(p => p.val), bfLen: bf.length };
  });
  expect(r.wLen).toBe(3);
  expect(r.ascending).toBe(true);
  expect(r.wVals).toEqual([82, 81, 80]);
  expect(r.bfLen).toBe(2);   // the day without body fat is skipped for that series
});

test('renderBodyTrends draws a chart + delta per metric, and is empty below 2 points', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.bodyCompUnit = 'kg';
    state.bodyComp = [{ date: '2026-06-01', weightKg: 82 }];
    const empty = renderBodyTrends();                       // only 1 point → nothing to trend
    state.bodyComp = [
      { date: '2026-06-01', weightKg: 82, bodyFatPct: 18, waistCm: 86 },
      { date: '2026-06-22', weightKg: 80, bodyFatPct: 17, waistCm: 83 },
    ];
    const html = renderBodyTrends();
    return { empty, hasTitle: /Body trends/.test(html), hasSvg: /bc-trend-svg/.test(html), hasWeight: /Weight/.test(html), hasFat: /Body fat/.test(html), hasGirth: /bc-trends-more/.test(html) };
  });
  expect(r.empty).toBe('');
  expect(r.hasTitle).toBe(true);
  expect(r.hasSvg).toBe(true);
  expect(r.hasWeight).toBe(true);
  expect(r.hasFat).toBe(true);
  expect(r.hasGirth).toBe(true);   // tape measurements get their own collapsible
});

test('the Body page shows the trends section when there is history', async ({ page }) => {
  const has = await page.evaluate(() => {
    state.bodyComp = [
      { date: '2026-06-01', weightKg: 82, bodyFatPct: 18 },
      { date: '2026-06-22', weightKg: 80, bodyFatPct: 17 },
    ];
    renderBody(document.getElementById('trk-main'));
    return /bc-trend-card/.test(document.getElementById('trk-main').innerHTML);
  });
  expect(has).toBe(true);
});
