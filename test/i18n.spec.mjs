// feat 569 — house standard 20: the English is the key (t('Body'), data-t / data-t-attr) and font.js holds the
// dictionaries (locales/<lang>.json) and the one shared language choice (maker-lang, under the font picker).
// English is the untouched default; a chosen language loads after the first paint and the app redraws in it.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP = '/gym-tracker.html';
const boot = async (page, lang) => {
  if (lang) await page.addInitScript((l) => { try { localStorage.setItem('maker-lang', l); } catch (e) {} }, lang);
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof pageTitle === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  if (lang) await page.evaluate(() => appFont.ready);
};

test('English is untouched by default: t() returns its English, the chrome speaks English', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    navTo('body', { replace: true });
    return {
      lang: currentLang(), same: t('{page} — open the navigation map', { page: 'Body' }), plural: [t.n('{n} set', '{n} sets', 1), t.n('{n} set', '{n} sets', 3)],
      crumbName: document.querySelector('#topbar-title .tt-crumb.current .tt-name').textContent,
      bodyTitle: document.getElementById('trk-main').textContent.includes('Body Composition'),
      gearTitle: document.getElementById('app-settings-btn').getAttribute('title'),
      drawerTitle: document.getElementById('settings-drawer-title').textContent.trim(),
      oldPicker: !!document.getElementById('drawer-lang-select'),
    };
  });
  expect(r.lang).toBe('en');
  expect(r.same).toBe('Body — open the navigation map');
  expect(r.plural).toEqual(['1 set', '3 sets']);
  expect(r.crumbName).toBe('Body');
  expect(r.bodyTitle).toBe(true);
  expect(r.gearTitle).toBe('Settings');
  expect(r.drawerTitle).toBe('Settings');
  expect(r.oldPicker).toBe(false);   // one shared language choice, under the font picker
});

test('French, chosen once for every app: static chrome, page titles, breadcrumb and the Body page follow', async ({ page }) => {
  await boot(page, 'fr');
  await page.waitForFunction(() => document.getElementById('settings-drawer-title').textContent.trim() === 'Réglages', null, { timeout: 10000 });
  const r = await page.evaluate(() => {
    navTo('body', { replace: true });
    return {
      html: document.documentElement.lang, title: pageTitle('body'),
      gear: document.getElementById('app-settings-btn').getAttribute('aria-label'),
      search: document.getElementById('settings-search').getAttribute('placeholder'),
      main: document.getElementById('trk-main').textContent,
      girth: girthLabel({ label: 'Waist' }),
    };
  });
  expect(r.html).toMatch(/^fr/);
  expect(r.title).toBe('Corps');
  expect(r.gear).toBe('Réglages');
  expect(r.search).not.toBe('Search settings…');
  expect(r.main).toContain('Composition corporelle');
  expect(r.girth).toBe('Taille');
});

test('Arabic runs right to left and translates', async ({ page }) => {
  await boot(page, 'ar');
  await page.waitForFunction(() => document.getElementById('settings-drawer-title').textContent.trim() === 'الإعدادات', null, { timeout: 10000 });
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(await page.evaluate(() => pageTitle('settings'))).toBe('الإعدادات');
});

test('every locale file has every English string, with its placeholders intact', async () => {
  const en = JSON.parse(readFileSync('locales/en.json', 'utf8'));
  for (const lang of ['fr', 'es', 'pt', 'it', 'hr', 'de', 'zh', 'uk', 'eo', 'sw', 'hi', 'bn', 'id', 'ur', 'fa', 'ar']) {
    const d = JSON.parse(readFileSync(`locales/${lang}.json`, 'utf8'));
    for (const [k, v] of Object.entries(en)) {
      const tr = d[k];
      expect(tr, `${lang}: ${k}`).toBeTruthy();
      if (typeof v === 'string') for (const ph of k.match(/\{\w+\}/g) || []) expect(tr, `${lang}: ${k}`).toContain(ph);
    }
  }
});

// A block with its own variable called t would call THAT instead of the translator and throw, in every language
// including English. tools/i18n-scope-check.mjs proves with a real parser (Babel, from inside Playwright) that
// every translator call resolves to the global function.
test('no translator call is shadowed by a local variable named t', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('node', ['tools/i18n-scope-check.mjs'], { encoding: 'utf8' });
  expect(out).toMatch(/all \d{3,} translator calls .* resolve to the global function/);
});
