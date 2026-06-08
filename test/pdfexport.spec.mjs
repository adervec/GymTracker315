// feat 133 — PDF/print export of the current History / Volume / Trends view. Clones #trk-main into a
// body-level #print-root with a titled header, then calls the native print dialog (Save as PDF / Share).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.exportCurrentViewPdf === 'function' && typeof window.currentViewLabel === 'function', null, { timeout: 15000 });
});

async function seed(page) {
  await page.evaluate(() => {
    let u = null; for (const [k] of VAR_INDEX) { u = k; break; }
    state.sessions = [{ id: 's1', date: '2026-05-01T08:00:00.000Z', updatedAt: '2026-05-01T08:00:00.000Z', exercises: [{ varUuid: u, sets: [{ w: 100, r: 5, ts: '2026-05-01T08:00:00.000Z' }] }] }];
    state.deletedSessions = [];
  });
}

test('PDF export button shows only on the History/Volume/Trends views (feat 133)', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const btn = document.getElementById('trk-export-pdf');
    const disp = (tab) => { currentTab = tab; render(); return getComputedStyle(btn).display; };
    return { log: disp('log'), body: disp('body'), history: disp('history'), volume: disp('volume'), trends: disp('trends') };
  });
  expect(r.log).toBe('none');     // not a data-review view
  expect(r.body).toBe('none');
  expect(r.history).not.toBe('none');
  expect(r.volume).not.toBe('none');
  expect(r.trends).not.toBe('none');
});

test('currentViewLabel reflects the active view + its sub-context (feat 133)', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const out = {};
    currentTab = 'history'; out.history = currentViewLabel();
    currentTab = 'volume'; volLevel = 'group'; volWeekOffset = 1; out.volume = currentViewLabel();
    currentTab = 'trends'; trendFocus = null; out.trends = currentViewLabel();
    return out;
  });
  expect(r.history.title).toBe('History');
  expect(r.volume.title).toBe('Volume');
  expect(r.volume.sub).toContain('Group');
  expect(r.volume.sub).toContain('Last week');
  expect(r.trends.title).toBe('Trends');
});

test('exportCurrentViewPdf clones the view into #print-root with a titled header (feat 133)', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    currentTab = 'volume'; volLevel = 'split'; volWeekOffset = 0; render();
    const mainHtml = document.getElementById('trk-main').innerHTML;
    let printedHtml = '', bodyClone = '', printingDuring = false;
    window.print = () => {
      printingDuring = document.body.classList.contains('printing');
      printedHtml = document.getElementById('print-root').innerHTML;
      bodyClone = document.querySelector('#print-root .print-body').innerHTML;
    };
    exportCurrentViewPdf();
    return {
      mainNonEmpty: mainHtml.length > 50,
      printingDuring,
      hasTitle: /gt-brand/.test(printedHtml) && /Volume/.test(printedHtml), // feat 170 — brand wordmark + view title
      hasPrintHead: /class="print-head"/.test(printedHtml),
      cloneMatchesMain: bodyClone === mainHtml,
    };
  });
  expect(r.mainNonEmpty).toBe(true);
  expect(r.printingDuring).toBe(true);     // body.printing is set while the dialog is up (scopes the @media print CSS)
  expect(r.hasTitle).toBe(true);           // titled header on the PDF
  expect(r.hasPrintHead).toBe(true);
  expect(r.cloneMatchesMain).toBe(true);   // the exact current view was captured
});
