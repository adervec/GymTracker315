// feat 502 — the picker now says which exercises are not logged in reps (⏱ timed holds, 📏 distance) and
// mode is a filterable criterion. exMode already classified every variation from its title; nothing surfaced
// it, so you only discovered a movement was a hold when the sets form opened with a Time field.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof filterVariations === 'function' && typeof modeBadgeHtml === 'function'
    && typeof exMode === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const reset = (page, mode) => page.evaluate((mode) => {
  Object.assign(modalState, { pickerMega: 'all', pickerSub: 'all', pickerEquip: 'all', pickerSearch: '',
    pickerFavOnly: false, pickerExplored: 'all', pickerVolStatus: 'all', pickerTrend: 'all',
    pickerRecent: 'all', pickerMode: mode, planStepFilter: null });
  const out = [];
  filterVariations().forEach(g => {
    g.variations.forEach(v => out.push(v.uuid));
    (g.secondaryVars || []).forEach(x => out.push(x.v.uuid));
  });
  return { n: out.length, modes: [...new Set(out.map(u => exMode(u).mode))].sort() };
}, mode);

test('feat 502 — each mode filters the list to exactly that mode', async ({ page }) => {
  const all = await reset(page, 'all');
  expect(all.n).toBeGreaterThan(1000);
  expect(all.modes).toEqual(['bodyweight', 'distance', 'standard', 'time']); // the catalogue has all four
  for (const m of ['time', 'distance', 'bodyweight', 'standard']) {
    const r = await reset(page, m);
    expect(r.n, m + ' must match something').toBeGreaterThan(0);
    expect(r.modes, m + ' must be the ONLY mode left').toEqual([m]);
    expect(r.n, m + ' is a subset of everything').toBeLessThan(all.n);
  }
});

test('feat 502 — only the two modes that replace the reps field get a badge', async ({ page }) => {
  const r = await page.evaluate(() => {
    const pick = (mode) => { for (const [u] of VAR_INDEX) if (exMode(u).mode === mode) return u; return null; };
    const html = (u) => modeBadgeHtml(u);
    return {
      time: html(pick('time')), distance: html(pick('distance')),
      bodyweight: html(pick('bodyweight')), standard: html(pick('standard')),
      noUuid: html(null),
      timeTitle: VAR_INDEX.get(pick('time')).variation.title,
    };
  });
  expect(r.time).toContain('⏱');
  expect(r.time).toContain('mode-badge');
  expect(r.distance).toContain('📏');
  expect(r.bodyweight, 'bodyweight still counts reps — no badge').toBe('');
  expect(r.standard, 'plain rep work stays bare').toBe('');
  expect(r.noUuid).toBe('');
});

test('feat 502 — a hold shows its ⏱ badge on the rendered picker row', async ({ page }) => {
  const r = await page.evaluate(() => {
    let hold = null;
    for (const [u] of VAR_INDEX) {
      const i = VAR_INDEX.get(u);
      if (exMode(u).mode === 'time' && varVisibleInPicker(i.family, i.variation)) { hold = u; break; }
    }
    pending.varUuid = null; Object.assign(modalState, { open: true, showPicker: true, supersetMode: false,
      pickerMode: 'all', pickerSearch: VAR_INDEX.get(hold).variation.title, planStepFilter: null });
    renderModal();
    const row = document.querySelector(`.picker-var[data-varuuid="${hold}"]`);
    return { found: !!row, badge: row ? !!row.querySelector('.mode-badge') : false,
      title: VAR_INDEX.get(hold).variation.title };
  });
  expect(r.found, 'the hold is in the list: ' + r.title).toBe(true);
  expect(r.badge).toBe(true);
});

test('feat 502 — one cycling pill, default off, hold resets (feat 397 pattern)', async ({ page }) => {
  const r = await page.evaluate(() => {
    pending.varUuid = null; Object.assign(modalState, { open: true, showPicker: true, supersetMode: false,
      pickerSearch: '', pickerMode: 'all' });
    renderModal();
    const el = () => document.getElementById('cyc-mode');
    const tap = () => { const b = el(); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); };
    const off = { active: el().classList.contains('active'), label: el().textContent.trim() };
    const seen = [];
    for (let i = 0; i < 5; i++) { tap(); seen.push([modalState.pickerMode, el().textContent.trim()]); }
    tap(); // -> 'time', then hold without releasing
    el().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return { off, seen };
  });
  expect(r.off.active).toBe(false);
  expect(r.seen.map(s => s[0])).toEqual(['time', 'distance', 'bodyweight', 'standard', 'all']);
  expect(r.seen[0][1]).toContain('Holds');
  await page.waitForTimeout(2400); // trackerPress long-press threshold
  expect(await page.evaluate(() => modalState.pickerMode)).toBe('all');
});
