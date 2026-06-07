// feat 118 — custom hi-res anatomy chart: upload unlocks a Detailed Chart View (default) alongside
// the wireframe Simple view; an imported OCR label map (from tools/anatomy-ocr.py) places tap targets.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderAnatomyChart === 'function'
    && typeof window.anatomyImportMap === 'function'
    && typeof window.anatomyView === 'function', null, { timeout: 15000 });
});

test('anatomyChart defaults exist and the setting is preserved', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    return { view: state.anatomyChart.view, mapIsArr: Array.isArray(state.anatomyChart.map), inKeys: SETTINGS_KEYS.includes('anatomyChart') };
  });
  expect(r.view).toBe('detailed');
  expect(r.mapIsArr).toBe(true);
  expect(r.inKeys).toBe(true);
});

test('importing an OCR map populates clickable hotspots in the Detailed view', async ({ page }) => {
  const r = await page.evaluate(() => {
    anatomyImportMap(JSON.stringify({ version: 1, terms: [
      { term: 'Lats', label: 'Latissimus Dorsi', x: 0.3, y: 0.4 },
      { term: 'Glutes', label: 'Gluteus Maximus', x: 0.7, y: 0.6 },
      { term: 'bad' }, // missing coords -> dropped
    ] }));
    const mapLen = state.anatomyChart.map.length;
    _anatomyImg = 'data:image/png;base64,iVBORw0KGgo=';   // pretend an image was uploaded
    _anatomyImgTried = true;
    state.anatomyChart.view = 'detailed';
    renderAnatomyChart();
    const chart = document.getElementById('ref-gloss-chart');
    return { mapLen, hotspots: chart.querySelectorAll('.anat-hotspot').length, hasImg: !!chart.querySelector('.anat-img'), view: anatomyView() };
  });
  expect(r.mapLen).toBe(2);       // the coordinate-less entry was dropped
  expect(r.hotspots).toBe(2);
  expect(r.hasImg).toBe(true);
  expect(r.view).toBe('detailed');
});

test('view falls back to Simple (wireframe) without an image, and toggles', async ({ page }) => {
  const r = await page.evaluate(() => {
    _anatomyImg = null; _anatomyImgTried = true;
    state.anatomyChart.view = 'detailed';
    const forcedSimple = anatomyView(); // no image -> simple regardless
    renderAnatomyChart();
    const chart = document.getElementById('ref-gloss-chart');
    const hasSvg = !!chart.querySelector('.anat-svg');
    // now "upload" an image -> detailed unlocks
    _anatomyImg = 'data:image/png;base64,iVBORw0KGgo=';
    renderAnatomyChart();
    const detailedView = anatomyView();
    return { forcedSimple, hasSvg, detailedView };
  });
  expect(r.forcedSimple).toBe('simple');
  expect(r.hasSvg).toBe(true);
  expect(r.detailedView).toBe('detailed');
});

test('tapping a hotspot opens the glossary for that term', async ({ page }) => {
  const term = await page.evaluate(() => {
    let captured = null; window.openGlossaryTo = (t) => { captured = t; };
    state.anatomyChart.map = [{ term: 'Lats', x: 0.3, y: 0.4 }];
    _anatomyImg = 'data:image/png;base64,iVBORw0KGgo='; _anatomyImgTried = true;
    state.anatomyChart.view = 'detailed';
    renderAnatomyChart();
    document.querySelector('#ref-gloss-chart .anat-hotspot').click();
    return captured;
  });
  expect(term).toBe('Lats');
});
