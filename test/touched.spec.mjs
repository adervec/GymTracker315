// feat 121 — exercise-picker "touched" familiarity badge: how many distinct days you've trained a
// variation (new vs familiar) + how recently, shown on each picker row.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildTouchMap === 'function' && typeof window.touchBadgeHtml === 'function' && typeof window.renderPickerResults === 'function', null, { timeout: 15000 });
});

test('buildTouchMap counts distinct training days per variation', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null, b = null;
    for (const [u] of VAR_INDEX) { if (exMode(u).mode !== 'standard') continue; if (!a) { a = u; continue; } b = u; break; }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: 's1', date: iso(10), exercises: [{ varUuid: a, sets: [{ w: 1, r: 1 }] }] },
      { id: 's2', date: iso(10), exercises: [{ varUuid: a, sets: [{ w: 1, r: 1 }] }] }, // same calendar day
      { id: 's3', date: iso(3), exercises: [{ varUuid: a, sets: [{ w: 1, r: 1 }] }] },  // a second day
    ];
    const tm = buildTouchMap();
    return { aDays: tm.get(a).days.size, hasB: tm.has(b), lastSinceDays: Math.floor((Date.now() - tm.get(a).lastMs) / 86400000) };
  });
  expect(r.aDays).toBe(2);     // two distinct calendar days (the two same-day sessions collapse)
  expect(r.hasB).toBe(false);  // b never logged
  expect(r.lastSinceDays).toBe(3);
});

test('touchBadgeHtml: "new" when untouched, "N×" + recency class when familiar', async ({ page }) => {
  const r = await page.evaluate(() => {
    const recent = { days: new Set(['a', 'b', 'c']), lastMs: Date.now() - 3 * 86400000 };
    const old = { days: new Set(['a']), lastMs: Date.now() - 200 * 86400000 };
    return { newB: touchBadgeHtml(null), recentB: touchBadgeHtml(recent), oldB: touchBadgeHtml(old) };
  });
  expect(r.newB).toContain('new');
  expect(r.recentB).toContain('3×');
  expect(r.recentB).toContain('recent'); // <=14d -> recent
  expect(r.oldB).toContain('old');       // >60d -> old
});

test('renderPickerResults renders the touched badge on rows', async ({ page }) => {
  const html = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [{ varUuid: a, sets: [{ w: 1, r: 1 }] }] }];
    modalState.pickerSearch = ''; modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.planStepFilter = null;
    return renderPickerResults();
  });
  expect(html).toContain('touch-badge');
  expect(html).toContain('picker-var-right');
});
