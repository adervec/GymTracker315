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

// feat 418 — concise/full are carousel SLIDES now: the position table lives on the 📖 Full slide,
// and the 💡 Tips slide keeps the lighter set without it.
test('the Full slide shows the collapsed Body Position & Setup table near the top; the Tips slide omits it', async ({ page }) => {
  const u = await benchVar(page);
  const r = await page.evaluate((u) => {
    state.sessions = [];
    pending = { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.tipsExpanded = true;
    const div = document.createElement('div'); div.innerHTML = renderSetsForm();
    const fullSlide = div.querySelector('[data-excar-slide="full"]').innerHTML;
    const tipsSlide = div.querySelector('[data-excar-slide="tips"]').innerHTML;
    const posIdx = fullSlide.indexOf('Body Position &amp; Setup') >= 0 ? fullSlide.indexOf('Body Position &amp; Setup') : fullSlide.indexOf('Body Position & Setup');
    const genIdx = fullSlide.indexOf('General Setup');
    return {
      fullHas: /position-wrap/.test(fullSlide),
      collapsed: !/position-wrap open/.test(fullSlide),            // rendered collapsed (no .open class)
      uid: /data-pid="trk-pos-/.test(fullSlide),                   // own uid namespace (won't clash with the Reference page)
      nearTop: posIdx > 0 && (genIdx < 0 || posIdx < genIdx),      // sits above the verbose general-movement text
      tipsHas: /position-wrap/.test(tipsSlide),
    };
  }, u);
  expect(r.fullHas).toBe(true);
  expect(r.collapsed).toBe(true);
  expect(r.uid).toBe(true);
  expect(r.nearTop).toBe(true);
  expect(r.tipsHas).toBe(false);       // the Tips slide keeps the lighter tip set, no reference position table
});

test('the position table carries Body rows from the reference (real setup data)', async ({ page }) => {
  const u = await benchVar(page);
  const has = await page.evaluate((u) => {
    state.sessions = [];
    pending = { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }] };
    modalState.tipsExpanded = true;
    const div = document.createElement('div'); div.innerHTML = renderSetsForm();
    const full = div.querySelector('[data-excar-slide="full"]').innerHTML;
    return /position-table/.test(full) && /pos-label/.test(full) && /position-section-title/.test(full);
  }, u);
  expect(has).toBe(true);
});
