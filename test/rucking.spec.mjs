// feat 468 — rucking. A loaded walk progresses like a lift, not like cardio: by load, distance and pace, one
// variable at a time. The cardio form records the load (weight + what carries it), it carries forward to the
// next bout, and the Rucking page reads every loaded entry back as a progression history keyed on
// WORK = load x distance.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof ruckEntries === 'function' && typeof ruckNextStep === 'function'
    && typeof freshCardio === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
  null, { timeout: 15000 });
});

// Seeds sessions of loaded/unloaded cardio. `d` = days ago.
const seed = (page, bouts) => page.evaluate((bouts) => {
  state.sessions = bouts.map((b, i) => ({
    date: new Date(Date.now() - b.d * 86400000).toISOString(),
    exercises: [{ varUuid: b.uuid || 'b1a10013-0013-4013-8013-aaaaaaaa0013', subUuid: null, sets: [],
      cardio: { elapsedMin: b.min, distance: b.dist, distanceUnit: b.du || 'km',
        load: b.load, loadUnit: b.lu || 'kg', loadType: b.type || null } }],
  }));
  state.unit = 'kg';
  saveState();
}, bouts);

test('feat 468 — a bout is a ruck the moment it carries weight, whatever the activity', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [{ date: new Date().toISOString(), exercises: [
      { varUuid: 'x', sets: [], cardio: { elapsedMin: 60, load: 20, loadUnit: 'kg' } },   // loaded walk
      { varUuid: 'y', sets: [], cardio: { elapsedMin: 30, load: 0, loadUnit: 'kg' } },    // plain run
      { varUuid: 'z', sets: [], cardio: { elapsedMin: 30 } },                             // no load field at all
      { varUuid: 'w', sets: [{ w: 100, r: 5 }] },                                         // not cardio
    ] }];
    const exs = state.sessions[0].exercises;
    return { loaded: isRuckEntry(exs[0]), zero: isRuckEntry(exs[1]), absent: isRuckEntry(exs[2]),
      strength: isRuckEntry(exs[3]), count: ruckEntries().length,
      // lb is converted to kg so the numbers are comparable across a unit switch
      lbToKg: Math.round(ruckLoadKg({ load: 44.1, loadUnit: 'lb' })),
      kgStays: ruckLoadKg({ load: 20, loadUnit: 'kg' }) };
  });
  expect(r.loaded).toBe(true);
  expect(r.zero, 'a zero load is not a ruck').toBe(false);
  expect(r.absent, 'legacy cardio with no load field is not a ruck').toBe(false);
  expect(r.strength).toBe(false);
  expect(r.count).toBe(1);
  expect(r.lbToKg, 'stored units are normalised to kg for comparison').toBe(20);
  expect(r.kgStays).toBe(20);
});

test('feat 468 — the history is newest-first with work, pace and a distance-less bout handled', async ({ page }) => {
  await seed(page, [
    { d: 0, min: 60, dist: 5, load: 20 },
    { d: 7, min: 30, dist: null, load: 15 },       // loaded treadmill hour, no distance logged
    { d: 14, min: 60, dist: 4, load: 10 },
  ]);
  const r = await page.evaluate(() => {
    const l = ruckEntries();
    return { n: l.length, order: l.map(e => e.loadKg),
      work: l.map(e => Math.round(e.workKgKm)),
      pace: l.map(e => e.paceMinPerKm == null ? null : Math.round(e.paceMinPerKm * 100) / 100),
      totals: ruckTotals(l), tenDays: ruckTotals(l, 10).sessions, threeDays: ruckTotals(l, 3).sessions };
  });
  expect(r.n).toBe(3);
  expect(r.order, 'newest first').toEqual([20, 15, 10]);
  expect(r.work, 'work = load x distance; no distance means no work to count').toEqual([100, 0, 40]);
  expect(r.pace[0]).toBe(12);
  expect(r.pace[1], 'no distance → no pace, not a divide-by-zero').toBeNull();
  expect(r.totals.sessions).toBe(3);
  expect(r.totals.bestLoadKg).toBe(20);
  expect(Math.round(r.totals.km)).toBe(9);
  expect(r.tenDays, 'the 10-day window keeps today and last week').toBe(2);
  expect(r.threeDays, 'and drops everything older').toBe(1);
});

test('feat 468 — the recommendation moves ONE variable, load first, and stops at the bodyweight ceiling', async ({ page }) => {
  const r = await page.evaluate(() => {
    const e = (loadKg, distanceKm, minutes) => ({ date: new Date().toISOString(), loadKg, distanceKm, minutes,
      workKgKm: loadKg * distanceKm, paceMinPerKm: minutes / distanceKm });
    return {
      empty: ruckNextStep([], 80).variable,
      // load flat across the last few → bump the load
      flatLoad: ruckNextStep([e(20, 5, 60), e(20, 5, 60), e(20, 4, 50)], 90),
      // load just went up → hold it and grow distance
      loadJustUp: ruckNextStep([e(22, 5, 60), e(20, 5, 60), e(20, 5, 60)], 90),
      // both up to date → pace
      bothUp: ruckNextStep([e(22, 6, 70), e(20, 5, 60), e(18, 4, 50)], 90).variable,
      // at a third of bodyweight the pack stops growing
      atCeiling: ruckNextStep([e(30, 5, 60), e(28, 5, 60)], 90),
      // no bodyweight on file → still works, just without the ceiling
      noBw: ruckNextStep([e(40, 5, 60), e(40, 5, 60)], 0).variable,
    };
  });
  expect(r.empty, 'nothing logged yet is not a recommendation').toBeNull();
  expect(r.flatLoad.variable).toBe('load');
  expect(r.flatLoad.target, 'about ten percent, not a leap').toBe(22);
  expect(r.loadJustUp.variable).toBe('distance');
  expect(r.loadJustUp.target).toBe(5.5);
  expect(r.bothUp).toBe('pace');
  expect(r.atCeiling.variable, '30kg on a 90kg body is the ceiling — grow distance instead').toBe('distance');
  expect(r.atCeiling.text).toContain('ceiling');
  expect(r.noBw, 'no bodyweight on file must not cap or crash').toBe('load');
});

test('feat 468 — raising load AND distance together gets called out', async ({ page }) => {
  const r = await page.evaluate(() => {
    const e = (loadKg, distanceKm) => ({ date: new Date().toISOString(), loadKg, distanceKm, minutes: 60,
      workKgKm: loadKg * distanceKm, paceMinPerKm: 60 / distanceKm });
    return {
      both: ruckNextStep([e(25, 7), e(20, 5), e(20, 5)], 90).warn,
      onlyLoad: ruckNextStep([e(25, 5), e(20, 5), e(20, 5)], 90).warn,
      first: ruckNextStep([e(25, 7)], 90).warn,   // a single entry has nothing to compare against
    };
  });
  expect(r.both, 'the pattern that hurts people').toContain('Hold one of them still');
  expect(r.onlyLoad).toBeNull();
  expect(r.first, 'one entry is not a jump').toBeNull();
});

test('feat 468 — the load carries forward to the next bout, and clearing it sticks', async ({ page }) => {
  await seed(page, [{ d: 2, min: 60, dist: 5, load: 18, lu: 'kg', type: 'ruck' }]);
  const carried = await page.evaluate(() => {
    const f = freshCardio();
    return { load: f.load, unit: f.loadUnit, type: f.loadType, elapsed: f.elapsedMin, dist: f.distance };
  });
  expect(carried.load, 'a regular rucker never retypes the pack').toBe(18);
  expect(carried.unit).toBe('kg');
  expect(carried.type).toBe('ruck');
  expect(carried.elapsed, 'only the LOAD carries over — the bout itself starts empty').toBe('');
  expect(carried.dist).toBe('');

  // an unloaded bout afterwards must not resurrect the pack
  const cleared = await page.evaluate(() => {
    state.sessions.unshift({ date: new Date().toISOString(), exercises: [{ varUuid: 'x', sets: [],
      cardio: { elapsedMin: 30, distance: 4, distanceUnit: 'km', load: null, loadUnit: 'kg', loadType: null } }] });
    saveState();
    return freshCardio().load;
  });
  expect(cleared, 'the most recent LOADED bout is what carries — an unloaded one in between does not clear it').toBe(18);
});

test('feat 468 — the page renders tiles, the next step and a sortable history', async ({ page }) => {
  await seed(page, [
    { d: 1, min: 60, dist: 5, load: 20, type: 'ruck' },
    { d: 8, min: 55, dist: 4, load: 20, type: 'vest' },
    { d: 15, min: 50, dist: 3, load: 15, type: 'ruck' },
  ]);
  const r = await page.evaluate(() => {
    const m = document.createElement('div'); document.body.appendChild(m);
    renderRuckPage(m);
    const loads = () => [...m.querySelectorAll('.ruck-c-load')].map(x => parseFloat(x.textContent));
    const before = loads();
    m.querySelector('[data-ruck-sort="dist"]').click();
    const byDist = [...m.querySelectorAll('.ruck-row span:nth-child(3)')].map(x => x.textContent.trim());
    m.querySelector('[data-ruck-sort="dist"]').click();   // second tap flips the direction
    const byDistAsc = [...m.querySelectorAll('.ruck-row span:nth-child(3)')].map(x => x.textContent.trim());
    const out = { rows: m.querySelectorAll('.ruck-row').length, tiles: m.querySelectorAll('.ruck-tile').length,
      before, byDist, byDistAsc, next: m.querySelector('.ruck-next-t').textContent,
      pct: m.querySelector('.ruck-tile-s').textContent, html: m.innerHTML };
    m.remove(); return out;
  });
  expect(r.rows).toBe(3);
  expect(r.tiles).toBe(4);
  expect(r.before, 'defaults to newest first').toEqual([20, 20, 15]);
  expect(r.byDist).toEqual(['5 km', '4 km', '3 km']);
  expect(r.byDistAsc, 'tapping the same header flips the direction').toEqual(['3 km', '4 km', '5 km']);
  expect(r.next.length).toBeGreaterThan(10);
  expect(r.html).toContain('Ruck / backpack');
  expect(r.html).toContain('kg·km');
});

test('feat 468 — an empty page explains how to start rather than showing zeroes', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    const m = document.createElement('div'); document.body.appendChild(m);
    renderRuckPage(m);
    const html = m.innerHTML; m.remove();
    return { html, tiles: (html.match(/ruck-tile/g) || []).length };
  });
  expect(r.tiles, 'no tiles full of zeroes').toBe(0);
  expect(r.html).toContain('Load carried');
});

test('feat 468 — the page is registered, reachable and does not clash with another page', async ({ page }) => {
  const r = await page.evaluate(() => {
    const emojis = Object.values(PAGES).map(p => p.emoji);
    navTo('ruck');
    return { def: !!PAGES.ruck, parent: PAGES.ruck.parent, emoji: PAGES.ruck.emoji,
      inParent: PAGES.reflect.children.includes('ruck'),
      uniqueEmoji: emojis.filter(e => e === PAGES.ruck.emoji).length,
      abbr: PILL_ABBR.ruck, landed: currentPage };
  });
  expect(r.def).toBe(true);
  expect(r.parent).toBe('reflect');
  expect(r.inParent).toBe(true);
  expect(r.uniqueEmoji, 'the router requires a unique emoji per page').toBe(1);
  expect(r.abbr).toBe('Ruck');
  expect(r.landed).toBe('ruck');
});

test('feat 468 — a saved cardio bout keeps its load, and rucking does not leak into volume', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.readonly = false; state.unit = 'kg';
    const v = 'b1a10013-0013-4013-8013-aaaaaaaa0013';                 // Other / Outdoor Cardio
    pending = { varUuid: v, subUuid: null, sets: [], cardio: freshCardio() };
    Object.assign(pending.cardio, { elapsedMin: '45', distance: '4', load: '18', loadUnit: 'kg', loadType: 'ruck' });
    modalState.isEditing = false;
    saveCardio();
    const ex = state.sessions[0].exercises[0];
    return { load: ex.cardio.load, unit: ex.cardio.loadUnit, type: ex.cardio.loadType,
      rucks: ruckEntries().length,
      // cardio is excluded from volume by design (feat 7) — adding a load must not change that
      cardioVar: isCardioVar(v), sets: ex.sets.length };
  });
  expect(r.load, 'the load survives the save/normalise round trip').toBe(18);
  expect(r.unit).toBe('kg');
  expect(r.type).toBe('ruck');
  expect(r.rucks).toBe(1);
  expect(r.cardioVar, 'still cardio — the load does not promote it into volume').toBe(true);
  expect(r.sets).toBe(0);
});
