// feat 221 — nav rework v2: a breadcrumb in the top bar always shows where you are; every crumb opens a
// compact global nav-tree popover (never the whole screen) from which any page is one tap away; menu ids
// forward to content, so no screen is ever just a nav list.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openNavTree === 'function' && typeof _pagePath === 'function', null, { timeout: 15000 });
});

test('the top bar shows the full breadcrumb path — ancestors as emoji crumbs, the page named', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('volume');
    const crumbs = [...document.querySelectorAll('#topbar-title .tt-crumb')];
    return {
      path: _pagePath('volume'),
      crumbIds: crumbs.map(b => b.dataset.crumb),
      currentName: document.querySelector('#topbar-title .tt-crumb.current .tt-name').textContent,
      ancestorsEmojiOnly: crumbs.slice(0, -1).every(b => !b.querySelector('.tt-name')),
      seps: document.querySelectorAll('#topbar-title .tt-sep').length,
    };
  });
  expect(r.path).toEqual(['home', 'train', 'reflect', 'volume']);
  expect(r.crumbIds).toEqual(['home', 'train', 'reflect', 'volume']);
  expect(r.currentName).toBe('Volume');
  expect(r.ancestorsEmojiOnly).toBe(true);
  expect(r.seps).toBe(3);
});

test('a section crumb opens the nav tree focused on that section, current page highlighted', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('volume');
    document.querySelector('#topbar-title .tt-crumb[data-crumb="reflect"]').click();
    return {
      open: document.getElementById('nav-tree').classList.contains('open'),
      focused: !!document.querySelector('#nav-tree .ntree-sec[data-ntree-sec="reflect"].focus'),
      activeChip: document.querySelector('#nav-tree .ntree-chip.active')?.dataset.ntreeGo,
    };
  });
  expect(r.open).toBe(true);
  expect(r.focused).toBe(true);
  expect(r.activeChip).toBe('volume');
});

test('the tree lists every leaf page yet never takes the whole screen', async ({ page }) => {
  const r = await page.evaluate(() => {
    openNavTree(null);
    const menu = document.getElementById('nav-tree');
    const leaves = Object.keys(PAGES).filter(id => PAGES[id].kind === 'leaf');
    const box = menu.getBoundingClientRect();
    return {
      missing: leaves.filter(id => !menu.querySelector(`[data-ntree-go="${id}"]`)),
      hFrac: box.height / window.innerHeight,
      wFrac: box.width / window.innerWidth,
      noFocus: !menu.querySelector('.ntree-sec.focus'),
    };
  });
  expect(r.missing).toEqual([]);          // any screen is reachable from here
  expect(r.hFrac).toBeLessThan(0.78);     // …but it's a compact popover, not a full-screen menu
  expect(r.wFrac).toBeLessThanOrEqual(0.95);
  expect(r.noFocus).toBe(true);           // the 🏠 crumb shows the whole tree unfocused
});

test('any screen → any screen in two taps: crumb, then chip', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('volume', { replace: true });
    document.querySelector('#topbar-title .tt-crumb[data-crumb="home"]').click();   // tap 1
    document.querySelector('#nav-tree [data-ntree-go="set-about"]').click();        // tap 2
    return {
      page: currentPage,
      closed: !document.getElementById('nav-tree').classList.contains('open'),
      crumbName: document.querySelector('#topbar-title .tt-crumb.current .tt-name').textContent,
    };
  });
  expect(r.page).toBe('set-about');
  expect(r.closed).toBe(true);
  expect(r.crumbName).toBe('About');   // the breadcrumb followed
});

test('feat 227: the legacy tracker tab bar is GONE from the DOM; the currentTab mirror still tracks', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('volume');
    return {
      barInHeader: !!document.querySelector('#panel-tracker > header .tabs'), // physically removed
      anyTabPills: document.querySelectorAll('#panel-tracker .tab[data-tab]').length,
      mirror: currentTab, // the variable mirror still works for switchToTab + render()
      page: currentPage,
    };
  });
  expect(r.barInHeader).toBe(false);   // no element to render, cache or not
  expect(r.anyTabPills).toBe(0);
  expect(r.mirror).toBe('volume');     // currentTab still mirrors the page
  expect(r.page).toBe('volume');
});

test('feat 227: the top-bar Settings & Help buttons are hidden — navigation goes through the breadcrumb', async ({ page }) => {
  const r = await page.evaluate(() => ({
    gear: getComputedStyle(document.getElementById('app-settings-btn')).display,
    help: getComputedStyle(document.getElementById('app-help-btn')).display,
    gearInDom: !!document.getElementById('app-settings-btn'), // kept for the shim/specs to click
  }));
  expect(r.gear).toBe('none');
  expect(r.help).toBe('none');
  expect(r.gearInDom).toBe(true);
});

test('feat 224: the tracker header collapses on plain pages, expands for the contextual PDF button', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('workout'); // no PDF export here
    const hdr = document.querySelector('#panel-tracker > header');
    const onWorkout = { collapsed: hdr.classList.contains('header-collapsed'), border: getComputedStyle(hdr).borderBottomWidth, pdf: getComputedStyle(document.getElementById('trk-export-pdf')).display };
    navTo('volume'); // Volume shows the 📄 PDF button
    const onVolume = { collapsed: hdr.classList.contains('header-collapsed'), pdf: getComputedStyle(document.getElementById('trk-export-pdf')).display };
    return { onWorkout, onVolume };
  });
  expect(r.onWorkout.collapsed).toBe(true);     // empty header → no strip
  expect(r.onWorkout.border).toBe('0px');       // …and no leftover border line
  expect(r.onWorkout.pdf).toBe('none');
  expect(r.onVolume.collapsed).toBe(false);     // PDF button present → header expands to host it
  expect(r.onVolume.pdf).not.toBe('none');
});

test('the backdrop and ✕ both close the tree', async ({ page }) => {
  const r = await page.evaluate(() => {
    openNavTree('study');
    document.getElementById('nav-tree-backdrop').click();
    const a = document.getElementById('nav-tree').classList.contains('open');
    openNavTree('study');
    document.querySelector('#nav-tree .ntree-close').click();
    const b = document.getElementById('nav-tree').classList.contains('open');
    return { a, b };
  });
  expect(r.a).toBe(false);
  expect(r.b).toBe(false);
});
