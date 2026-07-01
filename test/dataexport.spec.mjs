// feat 129 / 130 — per-category data export (app-readable JSON + human-readable CSV) and the
// data-management summary (per-type counts + date ranges). dataCats() is the shared registry.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.dataCats === 'function' && typeof window.csvWorkouts === 'function', null, { timeout: 15000 });
});

async function seed(page) {
  return await page.evaluate(() => {
    let u = null; for (const [k] of VAR_INDEX) { u = k; break; } // a real variation uuid
    state.unit = 'lb';
    state.sessions = [
      { id: 's1', date: '2026-05-01T08:00:00.000Z', updatedAt: '2026-05-01T08:00:00.000Z', sleep: '78 · 7h10m', hr: { avg: 120 }, exercises: [{ varUuid: u, sets: [{ w: 100, r: 5, ts: '2026-05-01T08:05:00.000Z' }, { w: 105, r: 5, ts: '2026-05-01T08:10:00.000Z' }] }] },
      { id: 's2', date: '2026-06-01T08:00:00.000Z', updatedAt: '2026-06-01T08:00:00.000Z', exercises: [{ varUuid: u, sets: [], cardio: { elapsedMin: 30, distance: 5, distanceUnit: 'km', calories: 300 } }] },
    ];
    state.deletedSessions = [];
    state.bodyComp = [{ date: '2026-05-10', weight: 180, bodyFatPct: 15 }, { date: '2026-06-10', weight: 178, bodyFatPct: 14 }];
    state.stravaActivities = [{ id: 'a1', name: 'Morning Run', sportType: 'Run', startDate: '2026-05-20T06:00:00.000Z', elapsedSec: 1800, avgHr: 150, maxHr: 175, calories: 400, description: 'easy' }];
    state.exerciseMedia = { x: ['http://example/y'] };
    state.customVariations = [];
    return u;
  });
}

test('dataCats reports per-type counts and date ranges (feat 130)', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const m = {}; dataCats().forEach(c => { m[c.key] = { n: c.n, range: dataCatRange(c.dates), hasCsv: !!c.csv }; });
    return m;
  });
  expect(r.workouts.n).toBe(2);
  expect(r.workouts.range).toBe('2026-05-01 → 2026-06-01');
  expect(r.bodycomp.n).toBe(2);
  expect(r.bodycomp.range).toBe('2026-05-10 → 2026-06-10');
  expect(r.sleep.n).toBe(1);
  expect(r.strava.n).toBe(1);
  expect(r.media.n).toBe(1);
  expect(r.settings.n).toBeNull();                 // preferences — no count
  expect(r.workouts.hasCsv && r.bodycomp.hasCsv && r.strava.hasCsv).toBe(true);
  expect(r.media.hasCsv).toBe(false);              // a map -> JSON only
});

test('category JSON slices are app-readable (re-importable shape)', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const get = k => dataCats().find(c => c.key === k).json();
    return { workouts: get('workouts'), bodycomp: get('bodycomp'), settings: get('settings') };
  });
  expect(Array.isArray(r.workouts.sessions)).toBe(true);
  expect(r.workouts.sessions.length).toBe(2);
  expect(Array.isArray(r.workouts.deletedSessions)).toBe(true);
  expect(Array.isArray(r.bodycomp.bodyComp)).toBe(true);
  expect(typeof r.bodycomp.savedAt).toBe('string');  // savedAt -> applyImport settings-merge adopts it
  expect('bodyComp' in r.settings).toBe(false);       // settings slice excludes the data categories
  expect(r.settings.unit).toBe('lb');                 // ...but keeps preferences
});

test('CSV builders produce correct headers and rows', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => ({ work: csvWorkouts(), bc: csvBodyComp(), sleep: csvSleep(), strava: csvStrava(), plans: csvPlans() }));
  // workouts: header + 2 strength sets + 1 cardio = 4 rows
  expect(r.work[0]).toContain('weight');
  expect(r.work.length).toBe(4);
  expect(r.work.find(row => row[4] === 'cardio')[9]).toBe(30);   // cardio_min
  expect(r.work.find(row => row[4] === 'strength')[5]).toBe(100); // first set weight
  expect(r.bc.length).toBe(3);                                    // header + 2 measurements
  expect(r.sleep.length).toBe(2);                                 // header + 1 sleep note
  expect(r.sleep[1][1]).toContain('7h10m');
  expect(r.strava.length).toBe(2);
  expect(r.strava[1][3]).toBe(30);                                // elapsed_min = 1800/60
  expect(r.plans[0]).toContain('plan');                           // plans CSV has a header even with seed plans
});

test('re-importing a category JSON merges it back via applyImport', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const bcJson = dataCats().find(c => c.key === 'bodycomp').json();
    state.bodyComp = [];                              // wipe
    state.savedAt = '2000-01-01T00:00:00.000Z';       // ensure the slice's fresh savedAt wins
    applyImport(bcJson, 'merge');
    return state.bodyComp.length;
  });
  expect(r).toBe(2);                                  // body composition restored from its own JSON
});

test('feat 405 — the Data page (now a normal settings page) renders the category summary + export buttons (feat 129/130)', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    navTo('set-data');                                  // feat 405 — projects the data sections into #trk-main
    const dp = document.getElementById('trk-main');
    return {
      hasTitle: /By category/.test(dp.innerHTML),
      workoutsJson: !!dp.querySelector('[data-cat-json="workouts"]'),
      workoutsCsv: !!dp.querySelector('[data-cat-csv="workouts"]'),
      mediaCsv: !!dp.querySelector('[data-cat-csv="media"]'),     // media = JSON only
      settingsJson: !!dp.querySelector('[data-cat-json="settings"]'),
      showsRange: /2026-05-01 → 2026-06-01/.test(dp.innerHTML),
      noOverlay: !document.getElementById('data-page'),           // the old full-screen overlay is gone
    };
  });
  expect(r.hasTitle).toBe(true);
  expect(r.workoutsJson && r.workoutsCsv).toBe(true);
  expect(r.mediaCsv).toBe(false);
  expect(r.settingsJson).toBe(true);
  expect(r.showsRange).toBe(true);                    // the summary shows date ranges
  expect(r.noOverlay).toBe(true);
});

test('feat 405 — archived legacy file auto-save/load is NOT exposed unless already in use', async ({ page }) => {
  const r = await page.evaluate(() => {
    // not enabled → the archived disclosure must not render at all
    if (state.autoSave) state.autoSave.enabled = false;
    if (state.autoLoad) state.autoLoad.enabled = false;
    renderSettingsDrawer();
    const bodyOff = document.getElementById('settings-drawer-body').innerHTML;
    const hiddenWhenUnused = !/drawer-archived/.test(bodyOff);
    // enabled → it renders so the user can still see / disable it
    state.autoSave = { ...(state.autoSave || {}), enabled: true, mode: 'file' };
    renderSettingsDrawer();
    const shownWhenUsed = /drawer-archived/.test(document.getElementById('settings-drawer-body').innerHTML);
    if (state.autoSave) state.autoSave.enabled = false;
    return { openDataPageFn: typeof openDataPage === 'function', supported: typeof autoSaveSupported === 'function' ? autoSaveSupported() : false, hiddenWhenUnused, shownWhenUsed };
  });
  expect(r.openDataPageFn).toBe(true);
  if (r.supported) {
    expect(r.hiddenWhenUnused).toBe(true);   // archived setting not exposed to users who don't use it
    expect(r.shownWhenUsed).toBe(true);      // …but still reachable to turn off if you had it on
  }
});
