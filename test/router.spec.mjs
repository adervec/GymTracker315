// feat 181 — page router (drill-down). Every destination is a PAGE rendered into #trk-main; navTo pushes a
// back/forward history. Legacy currentTab is a mirror; switchToTab + direct `currentTab=X;render()` still work.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof PAGES !== 'undefined' && typeof renderCurrentPage === 'function', null, { timeout: 15000 });
});

test('every page has a unique emoji and is a menu (children) or a leaf (render/open)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = Object.keys(PAGES);
    const emojis = ids.map(id => PAGES[id].emoji);
    const dupEmoji = emojis.filter((e, i) => emojis.indexOf(e) !== i);
    const bad = ids.filter(id => { const d = PAGES[id]; return !d.emoji || !(d.children || d.render || d.open); });
    return { count: ids.length, dupEmoji, bad };
  });
  expect(r.count).toBeGreaterThanOrEqual(20);
  expect(r.dupEmoji).toEqual([]); // each nav button has a unique emoji
  expect(r.bad).toEqual([]);
});

test('navTo a leaf renders it into #trk-main and mirrors currentTab + the tab highlight', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('volume');
    const tabActive = !!document.querySelector('.tab[data-tab="volume"].active');
    return { page: currentPage, tab: currentTab, tabActive, mainNonEmpty: document.getElementById('trk-main').innerHTML.length > 20 };
  });
  expect(r.page).toBe('volume');
  expect(r.tab).toBe('volume');     // legacy mirror
  expect(r.tabActive).toBe(true);
  expect(r.mainNonEmpty).toBe(true);
});

test('navTo a menu renders a drill-down list of its children', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('train');
    const items = [...document.querySelectorAll('#trk-main .nav-menu-item')].map(b => b.dataset.nav);
    return { page: currentPage, items };
  });
  expect(r.page).toBe('train');
  expect(r.items).toEqual(['reflect', 'execute', 'prepare']);
});

test('a menu item click navigates into that page', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('reflect');
    document.querySelector('#trk-main .nav-menu-item[data-nav="history"]').click();
    return currentPage;
  });
  expect(r).toBe('history');
});

test('Back / Forward walk the history stack; Back at the root falls to the parent', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('workout', { replace: true });
    navTo('train'); navTo('reflect'); navTo('history');
    navBack(); const b1 = currentPage;     // reflect
    navBack(); const b2 = currentPage;      // train
    navForward(); const f1 = currentPage;   // reflect
    // empty-stack Back falls back to the page's parent
    _pageBack.length = 0; _pageFwd.length = 0; currentPage = 'history';
    navBack(); const par = currentPage;     // history.parent === reflect
    return { b1, b2, f1, par };
  });
  expect(r.b1).toBe('reflect');
  expect(r.b2).toBe('train');
  expect(r.f1).toBe('reflect');
  expect(r.par).toBe('reflect');
});

test('the back stack is depth-capped', async ({ page }) => {
  const len = await page.evaluate(() => {
    navTo('workout', { replace: true });
    for (let i = 0; i < 40; i++) navTo(i % 2 ? 'history' : 'volume');
    return _pageBack.length;
  });
  expect(len).toBeLessThanOrEqual(16);
});

test('an open: leaf routes through its opener (the Exercise log sheet)', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('workout', { replace: true });
    navTo('exercise'); // the one remaining open: leaf → openLogModal()
    return { modal: modalState.open, page: currentPage, isOpenLeaf: !!PAGES.exercise.open && !PAGES.exercise.render };
  });
  expect(r.isOpenLeaf).toBe(true);  // exercise is still served by an open: opener (navTo's legacy branch)
  expect(r.modal).toBe(true);       // navTo ran the opener → the log sheet opened
  expect(r.page).toBe('exercise');  // openLogModal marks the Exercise page (feat 192)
});

test('legacy entry points still work: switchToTab + direct currentTab assignment', async ({ page }) => {
  const r = await page.evaluate(() => {
    switchToTab('sessions'); const a = { page: currentPage, tab: currentTab };
    switchToTab('trends');   const b = currentPage;
    navTo('workout', { replace: true });
    currentTab = 'volume'; render(); const c = currentPage; // direct assignment adopted by render()
    return { a, b, c };
  });
  expect(r.a).toEqual({ page: 'log', tab: 'sessions' }); // tab 'sessions' → page 'log'
  expect(r.b).toBe('trends');
  expect(r.c).toBe('volume');
});

test('the current page is persisted to localStorage', async ({ page }) => {
  const gp = await page.evaluate(() => { navTo('history'); return localStorage.getItem('gt_page'); });
  expect(gp).toBe('history');
});
