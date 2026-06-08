// feat 157 — the live score shows its REAL value (no rounding-to-5 that made it stick to round numbers),
// tracks it over the session, and draws an autoscaled sparkline (y mapped to the series min/max so small
// real moves are visible). Volatility comes from real data, not fakery.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.trackLiveScore === 'function' && typeof window.sparklineSvg === 'function', null, { timeout: 15000 });
});

test('trackLiveScore accumulates distinct samples, dedupes, and resets per session', async ({ page }) => {
  const r = await page.evaluate(() => {
    _scoreSpark = { id: null, pts: [] };
    const a1 = trackLiveScore('s1', 70);
    const a2 = trackLiveScore('s1', 70); // duplicate → ignored
    const a3 = trackLiveScore('s1', 72);
    const a4 = trackLiveScore('s1', 71);
    const b1 = trackLiveScore('s2', 50); // new session resets
    return { a1, a2len: a2.length, a3, a4, b1 };
  });
  expect(r.a1).toEqual([70]);
  expect(r.a2len).toBe(1);          // consecutive duplicate not added
  expect(r.a3).toEqual([70, 72]);
  expect(r.a4).toEqual([70, 72, 71]);
  expect(r.b1).toEqual([50]);       // reset on a new session id
});

test('sparklineSvg autoscales, needs 2+ points, and handles a flat series', async ({ page }) => {
  const r = await page.evaluate(() => ({
    one: sparklineSvg([42]),
    rising: sparklineSvg([50, 52], { w: 100, h: 20 }),
    flat: sparklineSvg([55, 55, 55], { w: 100, h: 20 }),
  }));
  expect(r.one).not.toContain('<path');   // a single point → nothing to draw
  expect(r.rising).toContain('<path');
  expect(r.rising).toMatch(/M[\d.]+ [\d.]+ L[\d.]+ [\d.]+/); // a polyline path
  // autoscale: the min value maps near the bottom (h-pad ≈ 18) and the max near the top (pad ≈ 2)
  expect(r.rising).toMatch(/M[\d.]+ 18\.0 L[\d.]+ 2\.0/);
  expect(r.flat).toContain('<path');      // flat series still renders (centered), no divide-by-zero
});

test('the live score is no longer rounded to multiples of 5 in the dashboard code path', async ({ page }) => {
  // The card prints `${pts}/100` straight from computeWorkoutScore (integer), not Math.round(/5)*5.
  const usesRaw = await page.evaluate(() => {
    const src = renderLog.toString();
    return { noChunky: !/Math\.round\(live\.points \/ 5\)/.test(src), tracks: /trackLiveScore/.test(src), spark: /sparklineSvg/.test(src) };
  });
  expect(usesRaw.noChunky).toBe(true);
  expect(usesRaw.tracks).toBe(true);
  expect(usesRaw.spark).toBe(true);
});
