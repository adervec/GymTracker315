// feat 504 — a target tile is a LADDER, not pass/fail. Beating the ask gives it a green BORDER (not a fill)
// and advances it to the next rung, with a corner streak once you have beaten it more than once. Every bit of
// that is DERIVED from the session's current sets, which is what makes an accidental huge entry roll all the
// way back when you delete it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exTargetProgress === 'function' && typeof renderModal === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// one 100×10 session in kg, so every classic tile has a clean base ask
const seed = (page) => page.evaluate(() => {
  let v = null; for (const [u] of VAR_INDEX) if (VAR_INDEX.get(u).variation.id === 'bb-flat-bench') { v = u; break; }
  state.unit = 'kg'; state.readonly = false;
  state.sessions = [{ id: 'h', date: new Date(Date.now() - 4 * 86400000).toISOString(),
    exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 100, r: 10 }], topSet: { w: 100, r: 10 } }] }];
  pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true;
  renderModal();
  return v;
});

test('feat 504 — the reps ladder: each rung cleared advances the ask and bumps the streak', async ({ page }) => {
  const v = await seed(page);
  const r = await page.evaluate((v) => {
    const at = (reps) => { pending.sets = reps == null ? [{ w: '', r: '' }] : [{ w: 100, r: reps }];
      return exTargetProgress(v, null, 100, 11, 'reps', 2.5); };   // base ask = 100×11 (feat 494 beat)
    return { none: at(null), short: at(10), exact: at(11), one: at(12), three: at(14), back: at(10) };
  }, v);
  expect(r.none).toEqual({ n: 0, w: 100, r: 11 });        // nothing logged → the base ask stands
  expect(r.short).toEqual({ n: 0, w: 100, r: 11 });       // one rep short is not a hit
  expect(r.exact).toEqual({ n: 1, w: 100, r: 12 });       // met it → next rung is one more rep
  expect(r.one).toEqual({ n: 2, w: 100, r: 13 });
  expect(r.three).toEqual({ n: 4, w: 100, r: 15 });       // 14 reps clears rungs 11,12,13,14
  expect(r.back, 'deleting the big set rolls the ladder all the way back').toEqual({ n: 0, w: 100, r: 11 });
});

test('feat 504 — the Max-wt tile climbs the WEIGHT axis in increments', async ({ page }) => {
  const v = await seed(page);
  const r = await page.evaluate((v) => {
    const at = (w) => { pending.sets = w == null ? [{ w: '', r: '' }] : [{ w: w, r: 1 }];
      return exTargetProgress(v, null, 102.5, 1, 'weight', 2.5); };  // base ask = 102.5×1 (feat 494 heavier)
    return { none: at(null), under: at(100), exact: at(102.5), next: at(105), far: at(110), back: at(100) };
  }, v);
  expect(r.none).toEqual({ n: 0, w: 102.5, r: 1 });
  expect(r.under).toEqual({ n: 0, w: 102.5, r: 1 });
  expect(r.exact).toEqual({ n: 1, w: 105, r: 1 });        // +1 increment, not +1 rep
  expect(r.next).toEqual({ n: 2, w: 107.5, r: 1 });
  expect(r.far).toEqual({ n: 4, w: 112.5, r: 1 });
  expect(r.back).toEqual({ n: 0, w: 102.5, r: 1 });
});

test('feat 504 — the rendered tile shows a green border, the next ask, and a streak only past one', async ({ page }) => {
  await seed(page);
  const read = (page) => page.evaluate(() => {
    const b = document.querySelector('#trk-targets .target-btn');
    if (!b) return null;
    return { hit: b.classList.contains('hit'), shown: b.querySelector('b').textContent,
      base: b.dataset.w0 + '×' + b.dataset.r0, n: +b.dataset.n,
      streak: (b.querySelector('.tb-streak') || {}).textContent || null };
  });
  const before = await read(page);
  expect(before.hit).toBe(false);
  expect(before.n).toBe(0);
  expect(before.shown, 'the untouched tile shows its base ask').toBe(before.base);
  expect(before.streak, 'no streak before anything is beaten').toBeNull();

  // beat it once
  const base = await page.evaluate(() => {
    const b = document.querySelector('#trk-targets .target-btn');
    pending.sets = [{ w: +b.dataset.w0, r: +b.dataset.r0 }]; renderModal();
    return { w: +b.dataset.w0, r: +b.dataset.r0 };
  });
  const once = await read(page);
  expect(once.hit, 'beaten once → the green border').toBe(true);
  expect(once.n).toBe(1);
  expect(once.shown, 'and the tile has moved up a rung').not.toBe(before.shown);
  expect(once.streak, 'a single hit is not a streak').toBeNull();

  // beat it three more rungs
  await page.evaluate((base) => { pending.sets = [{ w: base.w, r: base.r + 3 }]; renderModal(); }, base);
  const thrice = await read(page);
  expect(thrice.n).toBe(4);
  expect(thrice.streak, 'the corner shows the rungs cleared').toBe('4');

  // and the fill is gone — border only
  const styles = await page.evaluate(() => {
    const b = document.querySelector('#trk-targets .target-btn.hit');
    const cs = getComputedStyle(b);
    return { bg: cs.backgroundColor, border: cs.borderTopColor };
  });
  expect(styles.border, 'green border').toMatch(/63,\s*185,\s*80/);
  expect(styles.bg, 'no green fill').not.toMatch(/63,\s*185,\s*80/);
});

test('feat 504 — deleting the accidental set rolls the tiles, the streaks and the PR count back', async ({ page }) => {
  await seed(page);
  const snap = (page) => page.evaluate(() => {
    const hit = [...document.querySelectorAll('#trk-targets .target-btn.hit')];
    const badge = (document.querySelector('.wt-pr-badge') || {}).textContent || '';
    return { tilesHit: hit.length, rungs: hit.reduce((n, b) => n + (+b.dataset.n || 0), 0),
      labels: [...document.querySelectorAll('#trk-targets .target-btn b')].map(x => x.textContent).join('|'),
      prs: badge };
  });
  const clean = await snap(page);
  expect(clean.tilesHit).toBe(0);
  expect(clean.prs).toBe('');

  // fat-finger 300 kg
  await page.evaluate(() => { pending.sets = [{ w: 300, r: 12 }]; renderModal(); });
  const fat = await snap(page);
  expect(fat.tilesHit, 'everything is beaten at once').toBeGreaterThan(1);
  expect(fat.rungs).toBeGreaterThan(fat.tilesHit);
  expect(fat.prs).toContain('PR');
  expect(fat.labels).not.toBe(clean.labels);

  // delete it
  await page.evaluate(() => { pending.sets = [{ w: '', r: '' }]; renderModal(); });
  const after = await snap(page);
  expect(after, 'nothing may be stranded — all of it was derived').toEqual(clean);
});

test('feat 504 — a tile hit once still counts as satisfied for the feat-478 auto-collapse', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    targetsResetForSheet();
    pending.sets = [{ w: 300, r: 20 }]; renderModal();   // beats every tile, many rungs each
    const counter = (document.querySelector('.targets-count') || {}).textContent;
    const all = !!document.querySelector('.targets-count.all');
    const collapsedBefore = document.getElementById('trk-targets').classList.contains('collapsed');
    const did = targetsAutoCollapse();
    return { counter, all, collapsedBefore,
      did, collapsedAfter: document.getElementById('trk-targets').classList.contains('collapsed') };
  });
  expect(r.counter).toMatch(/^(\d+)\/\1 hit$/);  // N/N — advancing tiles still read as satisfied
  expect(r.all).toBe(true);
  expect(r.collapsedBefore).toBe(false);
  expect(r.did, 'hit-at-least-once is what satisfies the collapse').toBe(true);
  expect(r.collapsedAfter).toBe(true);
});
