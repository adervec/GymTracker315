// feat 471 — four space savings on the log sheet, plus the motion stage showing itself.
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

test('feat 471 — the banner row is gone: the tab row IS the header, visible even collapsed', async ({ page }) => {
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

test('feat 471 — the chip toggles both ways and the row background still toggles too', async ({ page }) => {
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

test('feat 471 — no standalone Sets title; the first column header says Set', async ({ page }) => {
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

test('feat 471 — the Motion slide shows the whole figure without a scrollbar; prose keeps the cap', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const sec = document.getElementById('trk-tips-section');
    sec.classList.add('open');
    const content = sec.querySelector('.tips-content');
    sec.querySelector('.excar-tab[data-excar="full"]').click();
    const prose = { maxH: getComputedStyle(content).maxHeight };
    sec.querySelector('.excar-tab[data-excar="motion"]').click();
    // let the rAF loop paint the stage
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const stage = sec.querySelector('.motion-stage');
      res({ prose,
        motionMaxH: getComputedStyle(content).maxHeight,
        noScroll: content.scrollHeight <= content.clientHeight + 1,
        stagePainted: !!stage.querySelector('svg'),
        stageFullyVisible: stage.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + 1 });
    })));
  });
  expect(r.prose.maxH, 'text slides keep the feat-97 cap that protects the sets pane').not.toBe('none');
  expect(r.motionMaxH, 'the figure is fixed-size, not prose — the cap lifts').toBe('none');
  expect(r.noScroll, 'no vertical scrolling inside the Motion slide').toBe(true);
  expect(r.stagePainted).toBe(true);
  expect(r.stageFullyVisible).toBe(true);
});

test('feat 471 — a multi-view stage flips viewpoint every 2 rep cycles, pills in step, pin stops it', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const sec = document.getElementById('trk-tips-section');
    sec.classList.add('open');
    sec.querySelector('.excar-tab[data-excar="motion"]').click();
    const st = sec.querySelector('.motion-stage');
    const views = MOTIONS[st.dataset.motion].views;
    const activePill = () => sec.querySelector('.motion-view.active').dataset.mv;
    const PERIOD = 2400 * MOTION_VIEW_CYCLES;

    delete st.dataset.autoCyc; delete st.dataset.pinned;
    motionAutoCycle(st, 100);                       // first frame: baseline only
    const afterBaseline = st.dataset.view;
    motionAutoCycle(st, 1000);                      // same window: no change
    const sameWindow = st.dataset.view;
    motionAutoCycle(st, PERIOD + 50);               // window 1: flip
    const flipped = { view: st.dataset.view, pill: activePill() };
    motionAutoCycle(st, PERIOD * 2 + 50);           // window 2: flips again (wraps on 2-view motions)
    const flippedTwice = st.dataset.view;

    // a manual pill tap pins the stage
    motionSetView(sec.querySelector('.motion-view'));
    const pinnedView = st.dataset.view;
    motionAutoCycle(st, PERIOD * 5 + 50);
    const afterPinned = st.dataset.view;

    // a single-view motion never cycles
    const fake = document.createElement('div');
    fake.dataset.motion = st.dataset.motion; fake.dataset.view = views[0];
    const single = { ...MOTIONS[st.dataset.motion], views: [views[0]] };
    return { views, afterBaseline, sameWindow, flipped, flippedTwice, pinnedView, afterPinned,
      first: views[0], second: views[1], cyclesConst: MOTION_VIEW_CYCLES };
  });
  expect(r.cyclesConst, 'every 2 cycles, as specified').toBe(2);
  expect(r.afterBaseline, 'opening the slide does not jump').toBe(r.first);
  expect(r.sameWindow).toBe(r.first);
  expect(r.flipped.view, 'after 2 rep cycles the view advances').toBe(r.second);
  expect(r.flipped.pill, 'the pill follows the auto-flip').toBe(r.second);
  expect(r.flippedTwice, 'and keeps cycling').toBe(r.views.length === 2 ? r.first : r.views[2 % r.views.length]);
  expect(r.afterPinned, 'a manual choice stops the auto-cycle').toBe(r.pinnedView);
});
