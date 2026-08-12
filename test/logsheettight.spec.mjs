// feat 472 — four space savings on the log sheet, plus the motion stage showing itself.
// (1) The "Tips & Insights" banner row merged into the tab row — one row of chrome, and the tabs stay
// visible while collapsed so a tab tap is also the open gesture. (2) The standalone "Sets" title is gone;
// the header row's first column says "Set". (3) The Motion slide gets its full height instead of a
// scrollbar. (4) A multi-view motion auto-cycles its viewpoint every 2 rep cycles until a pill pins it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof motionAutoCycle === 'function' && typeof openLogModal === 'function', null, { timeout: 15000 });
});

const openSheet = page => page.evaluate(() => {
  // an exercise that HAS a multi-view motion, so the Motion assertions bite
  let v = null;
  for (const [u] of VAR_INDEX) {
    const mv = motionForVariation(u);
    if (mv && MOTIONS[mv.motion] && MOTIONS[mv.motion].views.length >= 2 && exMode(u).mode === 'standard') { v = u; break; }
  }
  state.readonly = false;
  pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
  openLogModal();
  modalState.showPicker = false; modalState.isEditing = false; modalState.open = true;
  renderModal();
  return v;
});

test('feat 472 — the banner row is gone: the tab row IS the header, visible even collapsed', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const sec = document.getElementById('trk-tips-section');
    sec.classList.remove('open'); modalState.tipsExpanded = false;
    const tabs = sec.querySelector('.excar-tabs');
    const collapsed = {
      bannerGone: !sec.querySelector('.tips-title') && !sec.querySelector('.tips-chevron'),
      headerIsTabs: tabs.id === 'trk-tips-header',
      tabsVisible: tabs.offsetHeight > 0,
      slidesHidden: getComputedStyle(sec.querySelector('.tips-content')).display === 'none',
      chip: document.getElementById('trk-excar-collapse').textContent.trim(),
    };
    // a tab tap on the collapsed bar opens the panel on that slide
    sec.querySelector('.excar-tab[data-excar="history"]').click();
    const afterTap = {
      open: sec.classList.contains('open'), flag: modalState.tipsExpanded,
      slide: [...sec.querySelectorAll('[data-excar-slide]')].find(s => !s.hidden).dataset.excarSlide,
      chip: document.getElementById('trk-excar-collapse').textContent.trim(),
    };
    return { collapsed, afterTap };
  });
  expect(r.collapsed.bannerGone, 'no second row of chrome').toBe(true);
  expect(r.collapsed.headerIsTabs).toBe(true);
  expect(r.collapsed.tabsVisible, 'the tabs are the collapsed state').toBe(true);
  expect(r.collapsed.slidesHidden).toBe(true);
  expect(r.collapsed.chip, 'collapsed shows the expand glyph').toBe('▾');
  expect(r.afterTap.open, 'tapping a tab while collapsed opens the panel').toBe(true);
  expect(r.afterTap.flag).toBe(true);
  expect(r.afterTap.slide, 'and lands on that tab, not the last one').toBe('history');
  expect(r.afterTap.chip, 'the chip follows the state').toBe('▴');
});

test('feat 472 — the chip toggles both ways and the row background still toggles too', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const sec = document.getElementById('trk-tips-section');
    const chip = document.getElementById('trk-excar-collapse');
    sec.classList.add('open'); modalState.tipsExpanded = true; chip.textContent = '▴';
    chip.click();
    const closed = { open: sec.classList.contains('open'), chip: chip.textContent.trim() };
    chip.click();
    const reopened = { open: sec.classList.contains('open'), chip: chip.textContent.trim() };
    document.getElementById('trk-tips-header').click(); // the row background is still a toggle
    const rowToggled = sec.classList.contains('open');
    return { closed, reopened, rowToggled };
  });
  expect(r.closed).toEqual({ open: false, chip: '▾' });
  expect(r.reopened).toEqual({ open: true, chip: '▴' });
  expect(r.rowToggled, 'row tap after chip taps stays in sync').toBe(false);
});

test('feat 472 — no standalone Sets title; the first column header says Set', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const body = document.getElementById('trk-modal-body');
    const titles = [...body.querySelectorAll('.card-title')].map(x => x.textContent.trim());
    const head = body.querySelector('.set-header');
    return { setsTitle: titles.includes('Sets'), firstCol: head.children[0].textContent.trim(),
      cols: head.children.length };
  });
  expect(r.setsTitle, 'the column header does the naming now').toBe(false);
  expect(r.firstCol).toBe('Set');
  expect(r.cols, 'the header grid is otherwise untouched').toBeGreaterThanOrEqual(4);
});

test('feat 474 — text slides keep the feat-97 cap that protects the sets pane', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const sec = document.getElementById('trk-tips-section');
    sec.classList.add('open');
    const content = sec.querySelector('.tips-content');
    sec.querySelector('.excar-tab[data-excar="full"]').click();
    return { maxH: getComputedStyle(content).maxHeight,
      motionTabGone: !sec.querySelector('.excar-tab[data-excar="motion"]') };
  });
  expect(r.maxH).not.toBe('none');
  expect(r.motionTabGone, 'feat 474 — Motion lives in its own carousel now').toBe(true);
});

test('feat 472/474 — the motion carousel shows every view whole, no scrolling inside a slide', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => new Promise(res => {
    document.getElementById('trk-ex-motion-btn').click();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const modal = document.getElementById('motion-modal');
      const wraps = [...modal.querySelectorAll('.media-frame-wrap')];
      const out = {
        open: modal.classList.contains('open'),
        allWhole: wraps.every(w => w.scrollHeight <= w.clientHeight + 1),
        painted: [...modal.querySelectorAll('.motion-stage')].every(st => st.querySelector('svg')),
      };
      closeMotionCarousel(); res(out);
    }));
  }));
  expect(r.open).toBe(true);
  expect(r.allWhole, 'the whole figure is visible without vertical scrolling').toBe(true);
  expect(r.painted).toBe(true);
});

test('feat 472 — a multi-view stage still auto-cycles every 2 rep cycles outside the carousel, pin stops it', async ({ page }) => {
  // The tips slide is gone (feat 474); the auto-cycle still serves the reference-page panels, so it is
  // exercised directly on a stage the way the rAF loop would.
  await openSheet(page);
  const r = await page.evaluate(() => {
    const st = document.createElement('div');
    st.dataset.motion = 'bench-press'; st.dataset.view = 'side';
    const views = MOTIONS['bench-press'].views;
    const PERIOD = 2400 * MOTION_VIEW_CYCLES;
    motionAutoCycle(st, 100);
    const afterBaseline = st.dataset.view;
    motionAutoCycle(st, 1000);
    const sameWindow = st.dataset.view;
    motionAutoCycle(st, PERIOD + 50);
    const flipped = st.dataset.view;
    st.dataset.pinned = '1';
    motionAutoCycle(st, PERIOD * 3 + 50);
    const afterPinned = st.dataset.view;
    return { views, afterBaseline, sameWindow, flipped, afterPinned, cyc: MOTION_VIEW_CYCLES };
  });
  expect(r.cyc).toBe(2);
  expect(r.afterBaseline, 'first frame only sets the baseline').toBe(r.views[0]);
  expect(r.sameWindow).toBe(r.views[0]);
  expect(r.flipped, 'after 2 rep cycles the view advances').toBe(r.views[1]);
  expect(r.afterPinned, 'pinned stages never cycle').toBe(r.views[1]);
});
