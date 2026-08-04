// feat 463 — a subtle marker on the set you are currently on. With several rows on screen (and feat 457
// flipping their visual order) the live one was easy to lose.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof activeSetIndex === 'function' && typeof paintActiveSet === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const openWith = (page, sets) => page.evaluate((sets) => {
  let v = null; for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') { v = u; break; }
  state.readonly = false;
  pending = { varUuid: v, subUuid: null, sets };
  openLogModal();
  modalState.showPicker = false; modalState.isEditing = false; modalState.open = true;
  renderModal();
}, sets);

const marked = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#trk-sets-container .set-row')]
    .map((r, i) => (r.classList.contains('set-active') ? i : -1)).filter(i => i >= 0));

test('feat 463 — activeSetIndex: the started-but-unfinished set wins, else the next gap, else none', async ({ page }) => {
  const r = await page.evaluate(() => ({
    // a set with weight but no reps is the LIVE set even though a later row is emptier
    started: activeSetIndex([{ w: 100, r: 5 }, { w: 105, r: '' }, { w: '', r: '' }]),
    // nothing started → the first row still missing something
    nextGap: activeSetIndex([{ w: 100, r: 5 }, { w: 110, r: 5 }, { w: '', r: '' }]),
    // a gap in the MIDDLE is picked up, not just the tail
    middleGap: activeSetIndex([{ w: 100, r: 5 }, { w: '', r: '' }, { w: 110, r: 5 }]),
    allDone: activeSetIndex([{ w: 100, r: 5 }, { w: 110, r: 5 }]),
    empty: activeSetIndex([]),
    junk: activeSetIndex(null),
    // 0 is a real weight (bodyweight mode), not "unfilled"
    zeroWeight: activeSetIndex([{ w: 0, r: '' }, { w: '', r: '' }]),
    // a started set later in the list still beats an earlier gap
    startedLater: activeSetIndex([{ w: '', r: '' }, { w: 100, r: '' }]),
  }));
  expect(r.started).toBe(1);
  expect(r.nextGap).toBe(2);
  expect(r.middleGap).toBe(1);
  expect(r.allDone, 'every set complete → nothing is marked').toBe(-1);
  expect(r.empty).toBe(-1);
  expect(r.junk).toBe(-1);
  expect(r.zeroWeight, 'a 0 weight counts as entered').toBe(0);
  expect(r.startedLater).toBe(1);
});

test('feat 463 — exactly one row carries the marker, and it moves as sets complete', async ({ page }) => {
  await openWith(page, [{ w: 100, r: 5 }, { w: 105, r: '' }, { w: '', r: '' }]);
  expect(await marked(page)).toEqual([1]);              // the started set

  // finish set 2 → the marker hands over to set 3
  await page.evaluate(() => commitSetField(1, 'r', 5));
  expect(await marked(page)).toEqual([2]);

  // start set 3 → it stays there
  await page.evaluate(() => commitSetField(2, 'w', 110));
  expect(await marked(page)).toEqual([2]);

  // finish it → nothing is marked
  await page.evaluate(() => commitSetField(2, 'r', 4));
  expect(await marked(page)).toEqual([]);

  // clearing a rep re-opens that set
  await page.evaluate(() => commitSetField(0, 'r', ''));
  expect(await marked(page)).toEqual([0]);
});

test('feat 463 — the marker survives a live row repaint and a full re-render', async ({ page }) => {
  await openWith(page, [{ w: 100, r: 5 }, { w: 105, r: '' }]);
  // updateRowLive resets className — the marker must come back
  await page.evaluate(() => updateRowLive(1));
  expect(await marked(page)).toEqual([1]);
  await page.evaluate(() => updateRowLive(0));
  expect(await marked(page)).toEqual([1]);
  await page.evaluate(() => renderModal());
  expect(await marked(page)).toEqual([1]);
});

test('feat 463 — the marker never collides with an overload colour, and reads on the row number', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v = null; for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') { v = u; break; }
    state.readonly = false;
    pending = { varUuid: v, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 105, r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true;
    renderModal();
    const rows = [...document.querySelectorAll('#trk-sets-container .set-row')];
    const active = rows.find(x => x.classList.contains('set-active'));
    return {
      // an active set is by definition incomplete, so it can never also be an overload row
      anyBoth: rows.some(x => x.classList.contains('set-active') && [...x.classList].some(c => c.startsWith('overload-'))),
      numTinted: !!active.querySelector('.set-num'),
      // the left-edge geometry matches the overload rows, so nothing shifts on hand-over
      border: getComputedStyle(active).borderLeftWidth,
      pad: getComputedStyle(active).paddingLeft,
      accentNum: getComputedStyle(active.querySelector('.set-num')).color,
      plainNum: getComputedStyle(rows[0].querySelector('.set-num')).color,
    };
  });
  expect(r.anyBoth).toBe(false);
  expect(r.numTinted).toBe(true);
  expect(r.border).toBe('3px');
  expect(r.pad).toBe('6px');
  expect(r.accentNum, 'the active row number is tinted differently from a normal one').not.toBe(r.plainNum);
});

test('feat 463 — editing a past session marks nothing (there is no "current" set)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v = null; for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') { v = u; break; }
    state.readonly = false;
    pending = { varUuid: v, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 105, r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.open = true;
    modalState.isEditing = true; renderModal();
    const editing = [...document.querySelectorAll('#trk-sets-container .set-row')].filter(x => x.classList.contains('set-active')).length;
    paintActiveSet();  // the live repaint must agree with the renderer
    const afterPaint = [...document.querySelectorAll('#trk-sets-container .set-row')].filter(x => x.classList.contains('set-active')).length;
    return { editing, afterPaint };
  });
  expect(r.editing).toBe(0);
  expect(r.afterPaint).toBe(0);
});

test('feat 463 — with newest-first on, the marker still lands on the right SET', async ({ page }) => {
  await page.evaluate(() => { state.workoutControls.newestSetFirst = true; });
  await openWith(page, [{ w: 100, r: 5 }, { w: 105, r: '' }, { w: '', r: '' }]);
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#trk-sets-container .set-row')];
    const active = rows.find(x => x.classList.contains('set-active'));
    // DOM order is untouched by feat 457, so the marker is on DOM row 1 = set 2
    return { domIdx: rows.indexOf(active), num: active.querySelector('.set-num').textContent,
      // and on screen it is NOT the topmost row (set 3 is, under newest-first)
      topmost: rows.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]
        .querySelector('.set-num').textContent };
  });
  expect(r.domIdx).toBe(1);
  expect(r.num, 'the marker follows the SET, not the screen position').toBe('2');
  expect(r.topmost).toBe('3');
});
