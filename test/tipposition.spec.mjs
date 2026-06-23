// feat 334 — the exercise page's FULL tip surfaces the collapsed "📐 Body Position & Setup" table from the full
// reference, near the top (above the verbose general-movement text). Concise mode does not pull it in.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderSetsForm === 'function' && typeof getPosition === 'function'
    && typeof renderPosition === 'function', null, { timeout: 15000 });
});

const benchVar = (page) => page.evaluate(() => { for (const [u, i] of VAR_INDEX) if (i.family.id === 'flat-bench-press') return u; return null; });

test('full tip shows the collapsed Body Position & Setup table near the top; concise omits it', async ({ page }) => {
  const u = await benchVar(page);
  const r = await page.evaluate((u) => {
    state.sessions = [];
    pending = { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.tipsExpanded = true; modalState.tipsMode = 'full';
    const full = renderSetsForm();
    modalState.tipsMode = 'concise';
    const concise = renderSetsForm();
    const posIdx = full.indexOf('Body Position &amp; Setup') >= 0 ? full.indexOf('Body Position &amp; Setup') : full.indexOf('Body Position & Setup');
    const genIdx = full.indexOf('General Setup');
    return {
      fullHas: /position-wrap/.test(full),
      collapsed: !/position-wrap open/.test(full),                 // rendered collapsed (no .open class)
      uid: /data-pid="trk-pos-/.test(full),                        // own uid namespace (won't clash with the Reference page)
      nearTop: posIdx > 0 && (genIdx < 0 || posIdx < genIdx),      // sits above the verbose general-movement text
      conciseHas: /position-wrap/.test(concise),
    };
  }, u);
  expect(r.fullHas).toBe(true);
  expect(r.collapsed).toBe(true);
  expect(r.uid).toBe(true);
  expect(r.nearTop).toBe(true);
  expect(r.conciseHas).toBe(false);    // concise mode keeps the lighter tip set, no reference position table
});

test('the position table carries Body rows from the reference (real setup data)', async ({ page }) => {
  const u = await benchVar(page);
  const has = await page.evaluate((u) => {
    state.sessions = [];
    pending = { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.tipsExpanded = true; modalState.tipsMode = 'full';
    const full = renderSetsForm();
    return /position-table/.test(full) && /pos-label/.test(full) && /position-section-title/.test(full);
  }, u);
  expect(has).toBe(true);
});
