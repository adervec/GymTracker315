// Behavioral suite: load the real single-file app in headless Chromium and
// exercise it the way the in-app preview checks do. Each test gets a fresh,
// isolated browser context (its own localStorage), so mutations never leak.
//
// What this covers that the static checks can't:
//   - the inline script actually RUNS (boot + first render) with no errors
//   - the pure helpers compute the right numbers (regressions in plate math,
//     1RM, unit conversion, media parsing, plan estimates)
//   - the state plumbing (normalizeState -> saveState -> localStorage) keeps
//     the sync defaults it's supposed to
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

let consoleErrors;
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + (err && err.message ? err.message : String(err))));
  await page.goto(APP, { waitUntil: 'load' });
  // Wait until the inline script has defined its globals (boot finished).
  await page.waitForFunction(() => typeof window.normalizeState === 'function', null, { timeout: 15000 });
});

test('boots cleanly and renders the shell', async ({ page }) => {
  // Render ran on load -> the nav tabs exist.
  expect(await page.locator('.nav-tab').count()).toBeGreaterThan(0);
  expect(await page.locator('.panel').count()).toBeGreaterThan(0);
  expect(consoleErrors, 'console/page errors during boot:\n' + consoleErrors.join('\n')).toEqual([]);
});

test('critical functions are exposed', async ({ page }) => {
  const missing = await page.evaluate(() => {
    const names = [
      'normalizeState', 'saveState', 'loadState', 'render', 'parseMediaUrl', 'estimated1RM',
      'lbToKg', 'kgToLb', 'autoLoadSupported', 'solveSetupState', 'autoSetupKind', 'setupTotal',
      'estimatePlanMinutes', 'intensityDots', 'importStravaActivities', 'stravaLoadNow',
      'bioLoadNow', 'choiceDialog', 'confirmDialog', 'promptDialog', 'switchPanel',
    ];
    return names.filter((n) => typeof window[n] !== 'function');
  });
  expect(missing, 'these globals are not functions').toEqual([]);
});

test('estimated1RM (Epley) matches the formula', async ({ page }) => {
  const r = await page.evaluate(() => ({
    one: estimated1RM(100, 1),
    zero: estimated1RM(100, 0),
    neg: estimated1RM(80, -3),
    ten: estimated1RM(100, 10),
    five: estimated1RM(60, 5),
  }));
  expect(r.one).toBe(100);   // 1 rep -> the weight itself
  expect(r.zero).toBe(0);    // 0 reps -> guard
  expect(r.neg).toBe(0);     // negative reps -> guard
  expect(r.ten).toBe(133);   // round(100 * (1 + 10/30))
  expect(r.five).toBe(70);   // round(60 * (1 + 5/30))
});

test('kg/lb conversion is exact and round-trips', async ({ page }) => {
  const r = await page.evaluate(() => ({ lb: kgToLb(100), back: lbToKg(kgToLb(73)) }));
  expect(r.lb).toBeCloseTo(220.46226218, 5);
  expect(r.back).toBeCloseTo(73, 9);
});

test('parseMediaUrl extracts platform + id (or rejects junk)', async ({ page }) => {
  const r = await page.evaluate(() => ({
    yt: parseMediaUrl('https://youtu.be/dQw4w9WgXcQ'),
    shorts: parseMediaUrl('https://www.youtube.com/shorts/abc123_-XYZ'),
    watch: parseMediaUrl('youtube.com/watch?v=AbC123dEf45'),
    tk: parseMediaUrl('https://www.tiktok.com/@user/video/1234567890123456789'),
    ig: parseMediaUrl('https://www.instagram.com/reel/CxYz12/'),
    link: parseMediaUrl('example.com/guide'),
    empty: parseMediaUrl(''),
    junk: parseMediaUrl('not a url'),
  }));
  expect(r.yt.platform).toBe('youtube');
  expect(r.yt.vid).toBe('dQw4w9WgXcQ');
  expect(r.yt.embedUrl).toContain('/embed/dQw4w9WgXcQ');
  expect(r.shorts.vid).toBe('abc123_-XYZ');
  expect(r.watch.vid).toBe('AbC123dEf45');
  expect(r.tk.platform).toBe('tiktok');
  expect(r.tk.vid).toBe('1234567890123456789');
  expect(r.ig.platform).toBe('instagram');
  expect(r.ig.vid).toBe('CxYz12');
  expect(r.link.platform).toBe('link');
  expect(r.empty).toBeNull();
  expect(r.junk).toBeNull();
});

test('plan estimates are sane', async ({ page }) => {
  const r = await page.evaluate(() => ({
    empty: estimatePlanMinutes({ steps: [] }),
    two: estimatePlanMinutes({ steps: [{ sets: 5 }, { sets: 5 }] }),
    dots3: intensityDots({ intensity: 3 }),
    dots5: intensityDots({ intensity: 5 }),
    dotsDefault: intensityDots({}),
  }));
  expect(r.empty).toBe(15);            // floor of 15 min
  expect(r.two).toBe(30);              // round((10*2.5 + 2)/15)*15
  expect(r.two % 15).toBe(0);
  expect(r.dots3).toBe('●●●○○');
  expect(r.dots5).toBe('●●●●●');
  expect(r.dotsDefault).toBe('●●●○○'); // default intensity 3
});

test('autoLoadSupported returns a boolean', async ({ page }) => {
  const t = await page.evaluate(() => typeof autoLoadSupported());
  expect(t).toBe('boolean');
});

test('normalizeState fills the sync defaults and persists them', async ({ page }) => {
  const st = await page.evaluate(() => {
    normalizeState();
    saveState();
    return JSON.parse(localStorage.getItem('overload_tracker_v2'));
  });
  expect(st.stravaAutoLoad).toEqual({ enabled: false, mode: 'folder' });
  expect(st.bioAutoLoad.enabled).toBe(false);
  expect(st.bioAutoLoad.mode).toBe('folder');
});

test('importStravaActivities merges silently without a toast', async ({ page }) => {
  const out = await page.evaluate(() => {
    // #trk-toast is always in the DOM; toast() pops it by adding the `show` class.
    // Clear it first so we isolate whether the silent import pops one.
    const toastEl = document.getElementById('trk-toast');
    if (toastEl) toastEl.classList.remove('show');
    const sample = JSON.stringify({
      activities: [{
        id: 999000001, name: 'Strength', sport_type: 'WeightTraining',
        start_date: '2026-06-01T17:00:00Z', elapsed_time: 3600,
        average_heartrate: 121, max_heartrate: 150, calories: 305,
      }],
    });
    const res = importStravaActivities(sample, { silent: true });
    return { res, toastShown: !!(toastEl && toastEl.classList.contains('show')) };
  });
  expect(out.res).toBeTruthy();
  expect(out.res.strength).toBeGreaterThanOrEqual(1);
  expect(out.res.added).toBeGreaterThanOrEqual(1);
  expect(out.toastShown, 'silent import must not pop a toast').toBe(false);
});
