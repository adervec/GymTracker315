// feat 222 — French internationalization on the feat-61 groundwork: a fr dictionary + the Language picker
// switch the UI chrome (top bar, breadcrumb, nav tree, Body page) live; English stays the byte-identical
// default; reference content deliberately stays English (flagged in the setting's subtitle).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof setLang === 'function' && typeof pageTitle === 'function', null, { timeout: 15000 });
});

test('French is registered; t() translates, interpolates, and falls back en → key', async ({ page }) => {
  const r = await page.evaluate(() => {
    const hasFr = LANGUAGES.some(l => l.code === 'fr' && l.native === 'Français');
    state.lang = 'fr';
    const fr = t('app.settings');
    const interp = t('nav.crumbTitle', { page: 'Volume' });
    const fallbackEn = t('body.title') === 'Composition corporelle';   // fr hit
    const fallbackKey = t('no.such.key');
    state.lang = 'en';
    const en = t('app.settings');
    return { hasFr, fr, interp, fallbackEn, fallbackKey, en };
  });
  expect(r.hasFr).toBe(true);
  expect(r.fr).toBe('Réglages');
  expect(r.interp).toContain('Volume');
  expect(r.interp).toContain('ouvrir');
  expect(r.fallbackEn).toBe(true);
  expect(r.fallbackKey).toBe('no.such.key');
  expect(r.en).toBe('Settings');
});

test('pageTitle() localizes the registry: French names in fr, registry titles in en, id passthrough', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.lang = 'en';
    const en = { workout: pageTitle('workout'), body: pageTitle('body'), unknown: pageTitle('nope') };
    state.lang = 'fr';
    const fr = { workout: pageTitle('workout'), body: pageTitle('body'), reflect: pageTitle('reflect') };
    state.lang = 'en';
    return { en, fr };
  });
  expect(r.en).toEqual({ workout: 'Workout', body: 'Body', unknown: 'nope' });
  expect(r.fr).toEqual({ workout: 'Séance', body: 'Corps', reflect: 'Bilan' });
});

test('setLang(fr) flips the live chrome: html lang, topbar titles, breadcrumb, nav tree', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('body', { replace: true });
    setLang('fr');
    const out = {
      htmlLang: document.documentElement.getAttribute('lang'),
      gearTitle: document.getElementById('app-settings-btn').getAttribute('title'),
      crumbName: document.querySelector('#topbar-title .tt-crumb.current .tt-name').textContent,
    };
    openNavTree('reflect');
    out.treeHead = document.querySelector('#nav-tree .ntree-head span').textContent;
    out.secTitle = document.querySelector('#nav-tree [data-ntree-sec="reflect"] .ntree-sec-title').textContent;
    out.chip = document.querySelector('#nav-tree [data-ntree-go="workout"]').textContent;
    closeNavTree();
    setLang('en');
    out.backToEn = document.querySelector('#topbar-title .tt-crumb.current .tt-name').textContent;
    return out;
  });
  expect(r.htmlLang).toBe('fr');
  expect(r.gearTitle).toBe('Réglages');
  expect(r.crumbName).toBe('Corps');
  expect(r.treeHead).toContain('Naviguer');
  expect(r.secTitle).toContain('Bilan');
  expect(r.chip).toContain('Séance');
  expect(r.backToEn).toBe('Body');
});

test('the Body page renders in French — titles, fields, girths, avatar card', async ({ page }) => {
  const r = await page.evaluate(() => {
    setLang('fr');
    navTo('body');
    document.getElementById('bc-add-btn').click();
    const main = document.getElementById('trk-main');
    const txt = main.textContent;
    const out = {
      title: txt.includes('Composition corporelle'),
      addBtn: txt.includes('Annuler'),                  // the form is open → ✕ Annuler
      girthSummary: txt.includes('Mensurations'),
      thigh: txt.includes('Cuisse'),
      avatarCard: txt.includes('Avatar filaire') && txt.includes('Mon profil'),
      saveBtn: document.getElementById('bc-save-btn').textContent.includes('Enregistrer la mesure'),
    };
    setLang('en');
    return out;
  });
  expect(r.title).toBe(true);
  expect(r.addBtn).toBe(true);
  expect(r.girthSummary).toBe(true);
  expect(r.thigh).toBe(true);
  expect(r.avatarCard).toBe(true);
  expect(r.saveBtn).toBe(true);
});

test('the drawer Language picker lists Français and switching persists via settings', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const sel = document.getElementById('drawer-lang-select');
    const hasFr = !!sel.querySelector('option[value="fr"]');
    sel.value = 'fr';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const after = { lang: state.lang, inKeys: SETTINGS_KEYS.includes('lang') };
    const persisted = JSON.parse(localStorage.getItem('overload_tracker_v2')).lang;
    setLang('en');
    return { hasFr, after, persisted };
  });
  expect(r.hasFr).toBe(true);
  expect(r.after.lang).toBe('fr');
  expect(r.after.inKeys).toBe(true);   // lang travels with settings exports
  expect(r.persisted).toBe('fr');
});

// feat 411 — the major commercial languages + Croatian, same scope as French (chrome / nav / Body page).
test('feat 411 — es/de/it/pt/ru/zh/ja/ko/hr are registered, complete vs the French key set, and switch live', async ({ page }) => {
  const NEW = ['es', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'hr'];
  const r = await page.evaluate((NEW) => {
    const frKeys = Object.keys(I18N.fr);
    const out = { registered: true, missing: {}, settingsWord: {}, pickerHas: {} };
    for (const code of NEW) {
      if (!LANGUAGES.some(l => l.code === code && l.native)) out.registered = false;
      const miss = frKeys.filter(k => !(k in (I18N[code] || {})));
      if (miss.length) out.missing[code] = miss;
      state.lang = code;
      out.settingsWord[code] = t('app.settings');
    }
    state.lang = 'en';
    renderSettingsDrawer();
    const sel = document.getElementById('drawer-lang-select');
    for (const code of NEW) out.pickerHas[code] = !!sel.querySelector(`option[value="${code}"]`);
    // spot-check a switch end-to-end incl. pageTitle + Croatian specifically
    setLang('hr');
    out.hrCrumbWorks = pageTitle('body') === 'Tijelo' && t('common.save') === 'Spremi';
    setLang('zh');
    out.zhWorks = pageTitle('settings') === '设置';
    setLang('en');
    return out;
  }, NEW);
  expect(r.registered).toBe(true);
  expect(r.missing).toEqual({});                 // every new dictionary covers the full French key set
  expect(r.settingsWord.es).toBe('Ajustes');
  expect(r.settingsWord.de).toBe('Einstellungen');
  expect(r.settingsWord.ru).toBe('Настройки');
  expect(r.settingsWord.ja).toBe('設定');
  expect(r.settingsWord.hr).toBe('Postavke');
  expect(Object.values(r.pickerHas).every(Boolean)).toBe(true);
  expect(r.hrCrumbWorks).toBe(true);
  expect(r.zhWorks).toBe(true);
});

test('English is untouched by default — fresh state speaks English everywhere', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    navTo('body', { replace: true });
    return {
      lang: state.lang,
      crumbName: document.querySelector('#topbar-title .tt-crumb.current .tt-name').textContent,
      bodyTitle: document.getElementById('trk-main').textContent.includes('Body Composition'),
      gearTitle: document.getElementById('app-settings-btn').getAttribute('title'),
    };
  });
  expect(r.lang).toBe('en');
  expect(r.crumbName).toBe('Body');
  expect(r.bodyTitle).toBe(true);
  expect(r.gearTitle).toBe('Settings');
});
