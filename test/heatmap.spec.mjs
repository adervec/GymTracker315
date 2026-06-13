// feat 217 — the volume heatmap: weekly volume painted onto the anatomy wireframe at three
// resolutions (muscle group / muscle / muscle head), toggleable or auto-cycling, on the Volume page.
// Green = touched, red = hammered, gray dashes = regions outside the volume model.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof heatRegionValues === 'function' && typeof anatomyHeatmapSvg === 'function', null, { timeout: 15000 });
});

const seedChestWeek = (page) => page.evaluate(() => {
  normalizeState();
  const fam = FAMILIES.find(f => f.id === 'flat-bench-press');
  const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
  state.sessions = [{ id: 'hm', date: new Date().toISOString(), updatedAt: new Date().toISOString(),
    exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }] }];
  _heatLevel = 'group'; _heatStopCycle();
});

test('heatRegionValues: bench work heats the chest region; unmodeled regions are null', async ({ page }) => {
  await seedChestWeek(page);
  const r = await page.evaluate(() => {
    const vals = heatRegionValues('group', 0);
    const get = (t) => vals.find(x => x.term === t);
    return { pec: get('Pec / Pectorals').v, forearms: get('Forearms').v, hams: get('Hams / Hamstrings').v, n: vals.length };
  });
  expect(r.n).toBe(16);            // every wireframe region gets a value entry
  expect(r.pec).toBeGreaterThan(0);  // bench heats the pecs
  expect(r.forearms).toBe(null);     // not in the volume model
  expect(r.hams).toBe(0);            // untouched this week
});

test('heatColor: transparent at zero, green low, red at max, null when unmodeled', async ({ page }) => {
  const r = await page.evaluate(() => ({
    zero: heatColor(0, 10),
    na: heatColor(null, 10),
    low: heatColor(1, 10),
    max: heatColor(10, 10),
  }));
  expect(r.zero).toBe('transparent');
  expect(r.na).toBe(null);
  expect(r.low).toMatch(/^hsla\(10[0-9]|^hsla\(11[0-9]/); // near-green hue
  expect(r.max).toMatch(/^hsla\(0,/);                      // full red at max
});

test('the Volume page renders the heatmap card with all regions and working level toggles', async ({ page }) => {
  await seedChestWeek(page);
  const r = await page.evaluate(() => {
    navTo('volume');
    const card = document.getElementById('vol-heatmap');
    const ellipses = card.querySelectorAll('.hm-region').length;
    const naCount = card.querySelectorAll('.hm-region.na').length;
    const expected = ANATOMY_REGIONS.reduce((n, x) => n + x.e.length, 0);
    const naExpected = ANATOMY_REGIONS.filter(x => !HEAT_REGION_MODEL[x.term]).reduce((n, x) => n + x.e.length, 0);
    card.querySelector('[data-hm-level="head"]').click();   // switch resolution (re-renders)
    const after = { level: _heatLevel, active: document.querySelector('#vol-heatmap [data-hm-level="head"]').classList.contains('active') };
    return { ellipses, expected, naCount, naExpected, after };
  });
  expect(r.ellipses).toBe(r.expected);
  expect(r.naCount).toBe(r.naExpected);
  expect(r.after.level).toBe('head');
  expect(r.after.active).toBe(true);
});

test('feat 228 — finer resolution splits regions into MORE ovals (group < muscle < head)', async ({ page }) => {
  await seedChestWeek(page);
  const r = await page.evaluate(() => {
    const count = (level) => (anatomyHeatmapSvg(heatRegionValues(level, 0)).match(/class="hm-region/g) || []).length;
    // a multi-head region (Delts → front/side/rear) splits at head level; subs carry the resolution
    const delt = (level) => { const v = heatRegionValues(level, 0).find(x => x.term === 'Delts'); return v && v.subs ? v.subs.length : 0; };
    // a chest set spreads across multiple chest muscles at finer resolution → multiple non-zero sub-ovals
    const svgHead = anatomyHeatmapSvg(heatRegionValues('head', 0));
    return {
      group: count('group'), muscle: count('muscle'), head: count('head'),
      deltGroup: delt('group'), deltMuscle: delt('muscle'), deltHead: delt('head'),
      headHasSubLabels: svgHead.includes('data-hm-sub='),
    };
  });
  expect(r.muscle).toBeGreaterThan(r.group);  // muscles split the group regions
  expect(r.head).toBeGreaterThan(r.muscle);   // heads split further
  expect(r.deltGroup).toBe(1);                 // one oval for the shoulders group…
  expect(r.deltMuscle).toBe(3);                // …front/side/rear delt at muscle level…
  expect(r.deltHead).toBeGreaterThanOrEqual(3); // …and at least that many at head level
  expect(r.headHasSubLabels).toBe(true);       // split ovals carry their sub-component label
});

test('auto-cycle advances the resolution and stops once the card leaves the DOM', async ({ page }) => {
  await seedChestWeek(page);
  await page.evaluate(() => { _heatCycleMs = 120; navTo('volume'); document.querySelector('#vol-heatmap [data-hm-cycle]').click(); }); // fast ticks for the test
  expect(await page.evaluate(() => _heatCycleOn)).toBe(true);
  await page.waitForFunction(() => _heatLevel !== 'group', null, { timeout: 3000 });  // a tick advanced it
  const advanced = await page.evaluate(() => ({ stillOn: _heatCycleOn, cardThere: !!document.getElementById('vol-heatmap') }));
  expect(advanced.stillOn).toBe(true);
  expect(advanced.cardThere).toBe(true);
  await page.evaluate(() => { navTo('workout'); });                                    // leave the page…
  await page.waitForFunction(() => !_heatCycleOn, null, { timeout: 3000 });            // …the next tick shuts the cycle down
  await page.evaluate(() => { _heatStopCycle(); _heatLevel = 'group'; _heatCycleMs = 3500; state.sessions = []; });
});
