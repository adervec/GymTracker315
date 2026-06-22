// feat 306 — the Constellation / tech-tree view in Reflect. Every variation is a node, laid out radially:
// fundamental movements (high family importance) near the centre, spiralling outward to the obscure/advanced,
// one arm per mega. Colour = mega; brightness = prowess (logged history). Tapping a node opens an info popup
// with a link to the full reference.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const BENCH = '239a5594-2c8b-40c8-a19c-dd8cfa8b58f8'; // Barbell Flat Bench Press

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof constellationNodes === 'function' && typeof renderConstellationPage === 'function'
    && typeof _constellationPopup === 'function' && typeof PAGES !== 'undefined', null, { timeout: 15000 });
});

test('the Constellation page is registered under Reflect', async ({ page }) => {
  const r = await page.evaluate(() => ({
    inReflect: PAGES.reflect.children.includes('constellation'),
    leaf: !!PAGES.constellation && PAGES.constellation.kind === 'leaf' && PAGES.constellation.parent === 'reflect',
  }));
  expect(r.inReflect).toBe(true);
  expect(r.leaf).toBe(true);
});

test('nodes cover every visible variation, sit inside the canvas, and put fundamentals nearer the core', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    const d = constellationNodes();
    const visibleVars = (() => { let n = 0; FAMILIES.forEach(f => (f.variations || []).forEach(v => { if (varVisibleInPicker(f, v)) n++; })); return n; })();
    const rad = n => Math.hypot(n.x - d.cx, n.y - d.cy);
    const inBounds = d.nodes.every(n => n.x >= 0 && n.x <= d.W && n.y >= 0 && n.y <= d.H);
    const prowessOk = d.nodes.every(n => n.prowess >= 0 && n.prowess <= 1);
    const fund = d.nodes.filter(n => n.importance >= 4), niche = d.nodes.filter(n => n.importance <= 2);
    const avg = a => a.reduce((s, n) => s + rad(n), 0) / (a.length || 1);
    return { count: d.nodes.length, visibleVars, inBounds, prowessOk, fundR: avg(fund), nicheR: avg(niche), haveBoth: fund.length > 0 && niche.length > 0 };
  });
  expect(r.count).toBe(r.visibleVars);     // one star per visible variation
  expect(r.inBounds).toBe(true);
  expect(r.prowessOk).toBe(true);
  if (r.haveBoth) expect(r.fundR).toBeLessThan(r.nicheR); // fundamentals nearer the centre
});

test('prowess (brightness) reflects logged history', async ({ page }) => {
  const r = await page.evaluate(({ BENCH }) => {
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [{ varUuid: BENCH, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] }];
    const d = constellationNodes();
    const bench = d.nodes.find(n => n.uuid === BENCH);
    const untrained = d.nodes.find(n => !n.trained);
    return { benchTrained: bench && bench.trained, benchProwess: bench && bench.prowess, untrainedProwess: untrained ? untrained.prowess : null };
  }, { BENCH });
  expect(r.benchTrained).toBe(true);
  expect(r.benchProwess).toBeGreaterThan(0);
  expect(r.untrainedProwess).toBe(0);
});

test('the page renders an SVG of clickable nodes; a node opens an info popup that deep-links to reference', async ({ page }) => {
  const r = await page.evaluate(({ BENCH }) => {
    state.sessions = [];
    const main = document.getElementById('trk-main');
    renderConstellationPage(main);
    const svgNodes = main.querySelectorAll('.cst-node').length;
    // open the popup for a known variation and confirm its reference link wiring
    let refCalled = null;
    const orig = window.openReferenceFor;
    window.openReferenceFor = (u) => { refCalled = u; };
    _constellationPopup(BENCH);
    const pop = document.getElementById('cst-pop');
    const hasTitle = !!pop && /Bench/i.test(pop.querySelector('.cst-pop-title').textContent);
    const refBtn = pop && pop.querySelector('.cst-pop-ref');
    if (refBtn) refBtn.click();
    const popGoneAfterClick = !document.getElementById('cst-pop');
    window.openReferenceFor = orig;
    return { svgNodes, hasTitle, refCalled, popGoneAfterClick };
  }, { BENCH });
  expect(r.svgNodes).toBeGreaterThan(50);     // a real star-field
  expect(r.hasTitle).toBe(true);
  expect(r.refCalled).toBe(BENCH);            // the popup links to that variation's full reference
  expect(r.popGoneAfterClick).toBe(true);     // and closes on navigate
});

// feat 307 — pan/zoom + zoom-onto-the-filtered-area
test('the viewBox is full by default and zooms onto a filtered mega that it fully frames', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    const main = document.getElementById('trk-main');
    _constFilter = null; renderConstellationPage(main);
    const full = main.querySelector('.cst-svg').getAttribute('viewBox');
    const d = constellationNodes(); const mega = d.megas[0];
    _constFilter = mega; renderConstellationPage(main);
    const vb = main.querySelector('.cst-svg').getAttribute('viewBox').split(/\s+/).map(Number);
    const inside = d.nodes.filter(n => n.mega === mega).every(n => n.x >= vb[0] - 0.5 && n.x <= vb[0] + vb[2] + 0.5 && n.y >= vb[1] - 0.5 && n.y <= vb[1] + vb[3] + 0.5);
    _constFilter = null;
    return { full: full.split(/\s+/).map(Number), w: vb[2], h: vb[3], square: Math.abs(vb[2] - vb[3]) < 0.5, inside };
  });
  expect(r.full).toEqual([0, 0, 1000, 1000]);   // full view when unfiltered
  expect(r.w).toBeLessThan(1000);          // zoomed in on the filtered mega
  expect(r.square).toBe(true);
  expect(r.inside).toBe(true);             // every node of that mega is framed
});

test('_constBBoxView frames a subset squarely (≤ canvas); _clampConstView keeps the view in bounds', async ({ page }) => {
  const r = await page.evaluate(() => {
    const d = constellationNodes();
    const v = _constBBoxView(d.nodes.filter(n => n.mega === d.megas[0]), d.W, d.H);
    const cl = _clampConstView({ x: -500, y: 5000, w: 99999, h: 10 }, d.W, d.H);
    return { square: Math.abs(v.w - v.h) < 0.001, cap: v.w <= d.W + 0.001, smaller: v.w < d.W,
      clW: cl.w, clX: cl.x, clY: cl.y, clSquare: Math.abs(cl.w - cl.h) < 0.001 };
  });
  expect(r.square).toBe(true);
  expect(r.cap).toBe(true);
  expect(r.smaller).toBe(true);
  expect(r.clW).toBeLessThanOrEqual(1000);
  expect(r.clX).toBeGreaterThanOrEqual(0);
  expect(r.clY).toBeGreaterThanOrEqual(0);
  expect(r.clSquare).toBe(true);
});
