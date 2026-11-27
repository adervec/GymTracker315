// feat 455 — full-screen anatomy chart viewer. The chart lived in a ~350px panel and the app ships
// user-scalable=no, so a hi-res medical chart was unreadable on a phone with no pinch-zoom to fall back on.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderAnatomyChart === 'function' && typeof openAnatomyViewer === 'function'
    && typeof anatomyBodyHtml === 'function', null, { timeout: 15000 });
});

// render the detailed chart into the glossary panel, with one mapped hotspot
const seedDetailed = (page) => page.evaluate((png) => {
  state.anatomyChart.map = [{ term: 'Lats', x: 0.3, y: 0.4 }];
  _anatomyImg = png; _anatomyImgTried = true;
  state.anatomyChart.view = 'detailed';
  renderAnatomyChart();
}, PNG);

test('feat 455 · 613 — the toolbar offers ⛶ and it opens the viewer with the same layered chart', async ({ page }) => {
  await seedDetailed(page);
  const r = await page.evaluate(() => {
    document.querySelector('#ref-gloss-chart #anat-fullscreen-btn').click();
    const ov = document.getElementById('anat-viewer'), box = ov.querySelector('#anat-viewer-zoom');
    return { open: ov.classList.contains('open'), layered: !!box.querySelector('svg.anat-layered'), img: !!box.querySelector('img'),
      muscles: box.querySelectorAll('.amus').length, bodyLocked: document.body.style.overflow, layers: document.querySelectorAll('#ref-gloss-chart [data-anat-layer]').length };
  });
  expect(r.open).toBe(true);
  expect(r.layered).toBe(true);
  expect(r.img).toBe(false);               // feat 613 — the uploaded-image view is retired
  expect(r.muscles).toBeGreaterThan(50);
  expect(r.bodyLocked).toBe('hidden');
  expect(r.layers).toBe(4);
});

test('feat 455 — zoom steps the wrapper width, clamps at both ends, and resets to fit on reopen', async ({ page }) => {
  await seedDetailed(page);
  const r = await page.evaluate(() => {
    openAnatomyViewer();
    const ov = document.getElementById('anat-viewer');
    const w = () => ov.querySelector('#anat-viewer-zoom').style.width;
    const pct = () => ov.querySelector('#anat-viewer-pct').textContent;
    const start = { w: w(), pct: pct(), outDisabled: ov.querySelector('#anat-zoom-out').disabled };
    ov.querySelector('#anat-zoom-in').click();
    const oneStep = { w: w(), pct: pct() };
    for (let i = 0; i < 20; i++) ov.querySelector('#anat-zoom-in').click();   // hammer the top end
    const maxed = { w: w(), inDisabled: ov.querySelector('#anat-zoom-in').disabled };
    for (let i = 0; i < 20; i++) ov.querySelector('#anat-zoom-out').click();  // and the bottom
    const floored = { w: w(), outDisabled: ov.querySelector('#anat-zoom-out').disabled };
    ov.querySelector('#anat-zoom-in').click();
    closeAnatomyViewer();
    openAnatomyViewer();                                                      // reopening starts fit-to-width again
    return { start, oneStep, maxed, floored, reopened: w() };
  });
  expect(r.start).toEqual({ w: '100%', pct: '100%', outDisabled: true });
  expect(r.oneStep).toEqual({ w: '150%', pct: '150%' });
  expect(r.maxed).toEqual({ w: '600%', inDisabled: true });
  expect(r.floored).toEqual({ w: '100%', outDisabled: true });
  expect(r.reopened).toBe('100%');
});

test('feat 455 · 613 — tapping a muscle in the viewer closes it and opens that glossary entry', async ({ page }) => {
  await seedDetailed(page);
  const r = await page.evaluate(() => {
    let captured = null; window.openGlossaryTo = (t) => { captured = t; };
    openAnatomyViewer();
    const el = document.querySelector('#anat-viewer-zoom .amus[data-term="Lats"]'); el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { captured, open: isAnatomyViewerOpen(), bodyLocked: document.body.style.overflow };
  });
  expect(r.captured).toBe('Lats');
  expect(r.open, 'the viewer must get out of the way of the glossary').toBe(false);
  expect(r.bodyLocked, 'body scroll is released on close').toBe('');
});

test('feat 455 — Escape and the phone Back button both close the viewer', async ({ page }) => {
  await seedDetailed(page);
  await page.evaluate(() => openAnatomyViewer());
  expect(await page.evaluate(() => isAnatomyViewerOpen())).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => isAnatomyViewerOpen())).toBe(false);

  await page.evaluate(() => openAnatomyViewer());
  expect(await page.evaluate(() => isAnatomyViewerOpen())).toBe(true);
  await page.goBack();                       // the swipe-back / Back gesture
  await page.waitForFunction(() => !isAnatomyViewerOpen(), null, { timeout: 5000 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('feat 455 — the inline panel and the viewer render identical chart markup', async ({ page }) => {
  await seedDetailed(page);
  const r = await page.evaluate(() => {
    const inline = document.querySelector('#ref-gloss-chart svg.anat-layered').outerHTML;
    openAnatomyViewer();
    return { inline, viewer: document.querySelector('#anat-viewer-zoom svg.anat-layered').outerHTML };
  });
  expect(r.viewer).toBe(r.inline);
});
