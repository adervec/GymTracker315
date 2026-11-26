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
  expect(r.n).toBe(18);            // every wireframe region gets a value entry (feat 602: + neck, jaw)
  expect(r.pec).toBeGreaterThan(0);  // bench heats the pecs
  expect(r.forearms).toBe(0);        // feat 602 — modeled now (grip), untouched this week
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
    // feat 597 — one anatomical shape per atlas entry and side (detail shapes are not regions)
    const expected = MUSCLE_ATLAS.filter(m => !m.deco).length * 2;
    const naExpected = MUSCLE_ATLAS.filter(m => !m.deco && !HEAT_REGION_MODEL[m.term]).length * 2;
    card.querySelector('[data-hm-level="head"]').click();   // switch resolution (re-renders)
    const after = { level: _heatLevel, active: document.querySelector('#vol-heatmap [data-hm-level="head"]').classList.contains('active') };
    return { ellipses, expected, naCount, naExpected, after };
  });
  expect(r.ellipses).toBe(r.expected);
  expect(r.naCount).toBe(r.naExpected);
  expect(r.after.level).toBe('head');
  expect(r.after.active).toBe(true);
});

test('feat 228 · 597 — finer resolution shows MORE distinct parts on the same anatomical shapes (group < muscle < head)', async ({ page }) => {
  await seedChestWeek(page);
  const r = await page.evaluate(() => {
    const svg = (level) => anatomyHeatmapSvg(heatRegionValues(level, 0));
    const count = (level) => (svg(level).match(/class="hm-region/g) || []).length;
    const subs = (level) => new Set((svg(level).match(/data-hm-sub="[^"]*"/g) || [])).size;
    const delt = (level) => { const v = heatRegionValues(level, 0).find(x => x.term === 'Delts'); return v && v.subs ? v.subs.length : 0; };
    // a chest set: at head level the two pec heads carry their own values
    const pecVals = new Set([...svg('head').matchAll(/data-hm-term="Pec \/ Pectorals" data-hm-v="([^"]*)"/g)].map(m => m[1]));
    return { counts: [count('group'), count('muscle'), count('head')], subs: [subs('group'), subs('muscle'), subs('head')],
      deltGroup: delt('group'), deltMuscle: delt('muscle'), deltHead: delt('head'), pecVals: pecVals.size,
      noEllipse: !/<ellipse/.test(svg('head')), paths: /<path class="hm-region/.test(svg('group')) };
  });
  expect(r.counts[0]).toBe(r.counts[1]);          // the same shapes at every resolution…
  expect(r.counts[1]).toBe(r.counts[2]);
  expect(r.subs[0]).toBe(0);                       // …labelled by group, then muscle, then head
  expect(r.subs[2]).toBeGreaterThan(r.subs[1]);
  expect(r.subs[1]).toBeGreaterThan(0);
  expect(r.deltGroup).toBe(1);
  expect(r.deltMuscle).toBe(3);
  expect(r.deltHead).toBeGreaterThanOrEqual(3);
  expect(r.pecVals).toBeGreaterThanOrEqual(1);
  expect(r.noEllipse).toBe(true);                  // no ovals any more
  expect(r.paths).toBe(true);
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

test('feat 597 — every muscle and head the volume model tracks is drawn, and the drawing follows the avatar', async ({ page }) => {
  const r = await page.evaluate(() => {
    // every unit a region reads at head level: each head where a muscle has heads, else the muscle
    const want = new Set();
    Object.values(HEAT_REGION_MODEL).forEach(m => { if (!m) return; m.muscles.forEach(id => { const inf = MUSCLE_INDEX[id]; if (inf.heads && inf.heads.length) inf.heads.forEach(h => want.add(h.id)); else want.add(id); }); });
    const drawn = new Set(MUSCLE_ATLAS.filter(m => m.id).map(m => m.id));
    const missing = [...want].filter(id => !drawn.has(id));
    const unknown = [...drawn].filter(id => !MUSCLE_INDEX[id]);
    const terms = MUSCLE_ATLAS.filter(m => !m.deco).map(m => m.term).filter(t => !ANATOMY_TERMS.has(t));
    const slim = atlasShapes(50, 'F', atlasBuild({ ...figDefaultP(), thigh: 0.8, armW: 0.8 })).map(x => x.d).join('');
    const wide = atlasShapes(50, 'F', atlasBuild({ ...figDefaultP(), thigh: 1.4, armW: 1.6 })).map(x => x.d).join('');
    const chart = anatomyBodyHtml(null);
    return { missing, unknown, terms, reshapes: slim !== wide, chartPaths: (chart.match(/class="amus/g) || []).length, chartEllipses: /<ellipse/.test(chart) };
  });
  expect(r.missing).toEqual([]);
  expect(r.unknown).toEqual([]);
  expect(r.terms).toEqual([]);            // every shape belongs to a glossary term the chart can open
  expect(r.reshapes).toBe(true);
  expect(r.chartPaths).toBeGreaterThan(40);   // the anatomy chart uses the same shapes as tap targets
  expect(r.chartEllipses).toBe(false);
});

test('feat 602 — grip, neck and jaw work colours the forearms, neck and jaw', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = id => FAMILIES.find(f => f.id === id), v = id => fam(id).variations[0].uuid;
    const day = new Date().toISOString();
    state.sessions = [{ id: 'g', date: day, exercises: [['grip-training', 4], ['wrist-curl', 3], ['neck-training', 3], ['jaw-training', 2]].map(([f, n]) => ({ varUuid: v(f), sets: Array.from({ length: n }, () => ({ w: 20, r: 12 })) })) }];
    const vals = heatRegionValues('muscle', 0), get = t => vals.find(x => x.term === t);
    const svg = anatomyHeatmapSvg(heatRegionValues('head', 0));
    return { fore: get('Forearms').v, neck: get('Neck').v, jaw: get('Jaw').v, wristToBrach: (MUSCLE_CONTRIB['wrist-curl'] || {}).brachialis || 0,
      painted: ['forearm-flexors', 'forearm-extensors', 'neck-flexors', 'neck-extensors', 'masseter'].map(id => new RegExp(`data-hm-mus="${id}"[^>]*style="fill:hsla`).test(svg)) };
  });
  expect(r.fore).toBeGreaterThan(0);
  expect(r.neck).toBeGreaterThan(0);
  expect(r.jaw).toBeGreaterThan(0);
  expect(r.wristToBrach).toBe(0);
  expect(r.painted).toEqual([true, true, true, true, true]);
});
