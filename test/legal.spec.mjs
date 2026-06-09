// feat 94 — going-public legal surfaces: the disclaimer renders in Help and Settings -> About,
// and covers health/no-warranty, trademarks, privacy, and the MIT licence.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.legalDisclaimerHtml === 'function', null, { timeout: 15000 });
});

test('the shared disclaimer covers the key bases', async ({ page }) => {
  const html = await page.evaluate(() => legalDisclaimerHtml());
  expect(html).toContain('Not professional advice');
  expect(html).toContain('No warranty');
  expect(html).toContain('MIT License');
  expect(html).toContain('Trademarks');
  expect(html).toContain('Captains of Crush');
  expect(html).toContain('your own risk');
  expect(html).toContain('nothing is sent to the author');
});

test('Help renders the Disclaimer & licence section', async ({ page }) => {
  const text = await page.evaluate(() => { renderHelp(); return document.getElementById('help-body').textContent; });
  expect(text).toContain('Disclaimer');
  expect(text).toContain('not a doctor, coach');
  expect(text).toMatch(/MIT License/);
});

// feat 185 — Settings → About is its own router page (build stamp + consolidated disclaimers), no longer a
// collapsible section in the settings drawer.
test('Settings → About is a router page carrying the build stamp + full disclaimer (feat 185)', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('set-about');
    const main = document.getElementById('trk-main');
    const build = main.querySelector('#about-build');
    return {
      page: currentPage,
      isSettingsLeaf: PAGES['set-about'].parent === 'settings' && typeof PAGES['set-about'].render === 'function',
      hasBuild: !!build && /build/i.test(build.textContent),
      text: main.textContent,
    };
  });
  expect(r.page).toBe('set-about');        // it's the page, not the drawer
  expect(r.isSettingsLeaf).toBe(true);     // a render-leaf under Settings
  expect(r.hasBuild).toBe(true);           // shows APP_BUILD
  expect(r.text).toContain('Not professional advice');
  expect(r.text).toContain('MIT License');
  expect(r.text).toContain('Trademarks');
});

// feat 186 — Settings → Help is its own router page: same content as the ❓ overlay, made searchable + collapsible.
test('Settings → Help is a searchable, collapsible router page (feat 186)', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('set-help');
    const main = document.getElementById('trk-main');
    const content = main.querySelector('#help-page-content');
    const before = content.querySelectorAll('.help-sec').length;
    const text = main.textContent;
    const collapsible = !!content.querySelector('details.help-sec summary'); // native collapsible
    const inp = main.querySelector('#help-page-search');
    inp.value = 'anatomy'; inp.dispatchEvent(new Event('input', { bubbles: true })); // narrow to the matching section(s)
    const visibleAfter = [...content.querySelectorAll('.help-sec')].filter(s => s.style.display !== 'none').length;
    return {
      page: currentPage,
      isSettingsLeaf: PAGES['set-help'].parent === 'settings' && typeof PAGES['set-help'].render === 'function',
      before, collapsible, hasSearch: !!inp, visibleAfter, text,
    };
  });
  expect(r.page).toBe('set-help');
  expect(r.isSettingsLeaf).toBe(true);
  expect(r.before).toBeGreaterThan(3);            // several collapsible help sections
  expect(r.collapsible).toBe(true);
  expect(r.hasSearch).toBe(true);
  expect(r.visibleAfter).toBeGreaterThan(0);
  expect(r.visibleAfter).toBeLessThan(r.before);  // search filtered the section list
  expect(r.text).toContain('beat last session');  // the help content is present
});
