// feat 340 — the Constellation gains filtering beyond mega: status (explored/unexplored), difficulty, equipment,
// favourites, and free-text search. Filters combine; matches stay bright, the rest dim, and the view zooms to fit.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const BENCH = '239a5594-2c8b-40c8-a19c-dd8cfa8b58f8'; // Barbell Flat Bench Press (family equip includes barbell)

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof constNodeMatches === 'function' && typeof renderConstellationPage === 'function'
    && typeof _constResetFilters === 'function' && typeof constellationNodes === 'function', null, { timeout: 15000 });
});

test('constNodeMatches honours status / equipment / favourites / search', async ({ page }) => {
  const r = await page.evaluate(({ BENCH }) => {
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [{ varUuid: BENCH, subUuid: null, sets: [{ w: 100, r: 5 }] }] }];
    state.favoriteVars = {};
    const bench = constellationNodes().nodes.find(n => n.uuid === BENCH);
    const out = {};
    _constResetFilters(); out.baseAll = constNodeMatches(bench);
    _constStatus = 'unexplored'; out.unexp = constNodeMatches(bench);   // bench is trained → excluded
    _constStatus = 'explored'; out.exp = constNodeMatches(bench);
    _constResetFilters();
    _constEquip = 'barbell'; out.eqYes = constNodeMatches(bench);
    _constEquip = 'no-such-equip'; out.eqNo = constNodeMatches(bench);
    _constResetFilters();
    _constSearch = 'bench'; out.sYes = constNodeMatches(bench);
    _constSearch = 'zzznotathing'; out.sNo = constNodeMatches(bench);
    _constResetFilters();
    _constFav = true; out.favNo = constNodeMatches(bench);
    state.favoriteVars[BENCH] = true; out.favYes = constNodeMatches(bench);
    _constResetFilters(); state.favoriteVars = {};
    return out;
  }, { BENCH });
  expect(r.baseAll).toBe(true);
  expect(r.unexp).toBe(false);
  expect(r.exp).toBe(true);
  expect(r.eqYes).toBe(true);
  expect(r.eqNo).toBe(false);
  expect(r.sYes).toBe(true);
  expect(r.sNo).toBe(false);
  expect(r.favNo).toBe(false);
  expect(r.favYes).toBe(true);
});

test('the page renders the new filter controls; Clear appears when a filter is active and resets it', async ({ page }) => {
  const r = await page.evaluate(() => {
    _constResetFilters(); state.sessions = [];
    const main = document.getElementById('trk-main');
    renderConstellationPage(main);
    const has = {
      search: !!main.querySelector('#cst-search'),
      status: !!main.querySelector('[data-cst-status="unexplored"]'),
      level: !!main.querySelector('[data-cst-diff="adv"]'),
      equip: !!main.querySelector('[data-cst-equip="barbell"]'),
      fav: !!main.querySelector('[data-cst-fav]'),
      clearBefore: !!main.querySelector('[data-cst-clear]'),
    };
    main.querySelector('[data-cst-status="unexplored"]').click();   // activate → re-renders
    const clearAfter = !!main.querySelector('[data-cst-clear]');
    const statusActive = main.querySelector('[data-cst-status="unexplored"]').classList.contains('active');
    main.querySelector('[data-cst-clear]').click();                 // clear → re-renders
    const reset = _constStatus === 'all' && !main.querySelector('[data-cst-clear]');
    return { ...has, clearAfter, statusActive, reset };
  });
  expect(r.search && r.status && r.level && r.equip && r.fav).toBe(true);
  expect(r.clearBefore).toBe(false);
  expect(r.clearAfter).toBe(true);
  expect(r.statusActive).toBe(true);
  expect(r.reset).toBe(true);
});

test('filtering dims non-matching stars and zooms to the matching subset', async ({ page }) => {
  const r = await page.evaluate(({ BENCH }) => {
    _constResetFilters();
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [{ varUuid: BENCH, subUuid: null, sets: [{ w: 100, r: 5 }] }] }];
    const main = document.getElementById('trk-main');
    renderConstellationPage(main);
    const fullVb = main.querySelector('.cst-svg').getAttribute('viewBox');
    _constStatus = 'explored'; renderConstellationPage(main);   // only the trained star (bench) matches
    const vb = main.querySelector('.cst-svg').getAttribute('viewBox');
    const benchOp = parseFloat(main.querySelector(`.cst-node[data-uuid="${BENCH}"]`).getAttribute('fill-opacity'));
    const other = [...main.querySelectorAll('.cst-node')].find(c => c.getAttribute('data-uuid') !== BENCH);
    const dimOp = parseFloat(other.getAttribute('fill-opacity'));
    _constResetFilters();
    return { changed: vb !== fullVb, benchOp, dimOp };
  }, { BENCH });
  expect(r.changed).toBe(true);            // zoomed in on the matching subset
  expect(r.benchOp).toBeGreaterThan(r.dimOp);
  expect(r.dimOp).toBeGreaterThan(0.08);   // feat 341 — filtered-out stars stay barely visible…
  expect(r.dimOp).toBeLessThan(0.2);       // …a faint ghost, clearly de-emphasised vs matches
});
