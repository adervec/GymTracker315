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

test('feat 613 — the layer switches toggle skeleton, deep, surface and labels, and never leave an empty body', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderAnatomyChart();
    const q = k => document.querySelector(`#ref-gloss-chart [data-anat-layer="${k}"]`);
    q('deep').click(); const deepOn = !!document.querySelector('#ref-gloss-chart .amus.ab-deep');
    q('surf').click(); const surfOff = !document.querySelector('#ref-gloss-chart .amus.ab-surf');
    q('bone').click(); q('deep').click();           // everything off → the surface comes back
    return { deepOn, surfOff, surfBack: !!document.querySelector('#ref-gloss-chart .amus.ab-surf'), saved: state.anatomyChart.layers };
  });
  expect(r.deepOn).toBe(true);
  expect(r.surfOff).toBe(true);
  expect(r.surfBack).toBe(true);
  expect(r.saved.surf).toBe(true);
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

test('tapping a muscle opens the glossary for that term', async ({ page }) => {
  const term = await page.evaluate(() => {
    let captured = null; window.openGlossaryTo = (t) => { captured = t; };
    renderAnatomyChart();
    document.querySelector('#ref-gloss-chart .amus[data-term="Glutes"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return captured;
  });
  expect(term).toBe('Glutes');
});
