// feat 170 — a generic GymTracker315 wordmark brands the top of the app (hideable via a setting); image
// and PDF exports always carry the brand regardless of the setting.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.applyBranding === 'function' && typeof window.brandLogoHtml === 'function', null, { timeout: 15000 });
});

test('the app header shows the GymTracker315 wordmark', async ({ page }) => {
  const r = await page.evaluate(() => {
    const el = document.getElementById('app-brand');
    return { exists: !!el, num: el && !!el.querySelector('.gt-brand-num'), text: el ? el.textContent.replace(/\s+/g, '') : '' };
  });
  expect(r.exists).toBe(true);
  expect(r.num).toBe(true);
  expect(r.text).toContain('GymTracker315');
});

test('hide-branding toggles the body class; exports keep the brand', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.hideBranding = true; applyBranding();
    const hidden = document.body.classList.contains('brand-hidden');
    state.hideBranding = false; applyBranding();
    const shown = !document.body.classList.contains('brand-hidden');
    return { hidden, shown, logo: brandLogoHtml(true) };
  });
  expect(r.hidden).toBe(true);
  expect(r.shown).toBe(true);
  expect(r.logo).toContain('Tracker');
  expect(r.logo).toContain('315');
  expect(r.logo).toContain('gt-brand-print');
});

test('the PDF export header carries the brand even when in-app branding is hidden', async ({ page }) => {
  const html = await page.evaluate(() => {
    state.hideBranding = true; applyBranding();
    document.getElementById('trk-main').innerHTML = '<div>chart</div>';
    const orig = window.print; window.print = () => {};
    try { exportCurrentViewPdf(); } finally { window.print = orig; }
    const pr = document.getElementById('print-root');
    const out = pr ? pr.innerHTML : '';
    document.body.classList.remove('printing'); if (pr) pr.innerHTML = '';
    return out;
  });
  expect(html).toContain('gt-brand'); // the wordmark is in the print header
  expect(html).toContain('315');
});

test('the settings drawer offers a branding toggle, persisted', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const hasToggle = document.getElementById('settings-drawer-body').innerHTML.includes('data-pref-brand');
    state.hideBranding = true; normalizeState(); saveState();
    return { hasToggle, inKeys: SETTINGS_KEYS.includes('hideBranding'), persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).hideBranding };
  });
  expect(r.hasToggle).toBe(true);
  expect(r.inKeys).toBe(true);
  expect(r.persisted).toBe(true);
});

// feat 250 — custom brand emoji + the 315-club sparkle easter egg (3·1·5 = bench·deadlift·squat)
test('feat 250 — brandMark uses the custom emoji, falling back to 🏋️', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.brandMark = '💪'; applyBranding();
    const custom = document.querySelector('#app-brand .gt-brand-mark').textContent;
    state.brandMark = '   '; applyBranding();   // blank → default
    const blank = document.querySelector('#app-brand .gt-brand-mark').textContent;
    state.brandMark = ''; applyBranding();
    return { custom, blank, def: document.querySelector('#app-brand .gt-brand-mark').textContent, inKeys: SETTINGS_KEYS.includes('brandMark') };
  });
  expect(r.custom).toBe('💪');
  expect(r.blank).toBe('🏋️');
  expect(r.def).toBe('🏋️');
  expect(r.inKeys).toBe(true);
});

test('feat 250 — lift315 detects 315 lb (≈142.9 kg) for any variation of a movement, ≥1 rep', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bench = FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid;
    state.unit = 'lb';
    state.sessions = [{ id: 's', date: new Date().toISOString(), updatedAt: new Date().toISOString(),
      exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 315, r: 1 }] }] }];
    const at315 = lift315('flat-bench-press');
    state.sessions[0].exercises[0].sets = [{ w: 310, r: 5 }];   // just under
    const under = lift315('flat-bench-press');
    state.sessions[0].exercises[0].sets = [{ w: 315, r: 0 }];   // no rep completed
    const noRep = lift315('flat-bench-press');
    state.unit = 'kg'; state.sessions[0].exercises[0].sets = [{ w: 143, r: 1 }]; // 143 kg > 142.9
    const kg = lift315('flat-bench-press');
    state.unit = 'lb';
    return { at315, under, noRep, kg, none: lift315('deadlift') };
  });
  expect(r.at315).toBe(true);
  expect(r.under).toBe(false);
  expect(r.noRep).toBe(false);
  expect(r.kg).toBe(true);
  expect(r.none).toBe(false);
});

test('feat 250 — applyBranding sparkles only the digits whose lift hit 315', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.unit = 'lb';
    const bench = FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid;
    const squat = FAMILIES.find(f => f.id === 'squat').variations.find(v => v.uuid).uuid;
    state.sessions = [{ id: 's', date: new Date().toISOString(), updatedAt: new Date().toISOString(), exercises: [
      { varUuid: bench, subUuid: null, sets: [{ w: 315, r: 1 }] },   // 3 → bench
      { varUuid: squat, subUuid: null, sets: [{ w: 365, r: 2 }] },   // 5 → squat
    ] }];
    applyBranding();
    const spark = {}; document.querySelectorAll('#app-brand .gt-brand-d').forEach(el => spark[el.dataset.lift] = el.classList.contains('sparkle'));
    state.sessions = []; applyBranding();
    const cleared = [...document.querySelectorAll('#app-brand .gt-brand-d')].some(el => el.classList.contains('sparkle'));
    return { spark, cleared };
  });
  expect(r.spark).toEqual({ bench: true, dead: false, squat: true });
  expect(r.cleared).toBe(false);   // nothing logged → no sparkle
});

test('feat 250 — the Cosmetic settings expose a brand-emoji picker that sets the mark', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.brandMark = '';
    navTo('set-cosmetic');
    const main = document.getElementById('trk-main');
    const presets = main.querySelectorAll('[data-brand-emoji]');
    const hasInput = !!main.querySelector('#brand-emoji-custom');
    const dumbbell = main.querySelector('[data-brand-emoji="💪"]');
    if (dumbbell) dumbbell.click();
    return { presetCount: presets.length, hasInput, mark: brandMark(), markShown: document.querySelector('#app-brand .gt-brand-mark').textContent };
  });
  expect(r.presetCount).toBeGreaterThanOrEqual(6);
  expect(r.hasInput).toBe(true);
  expect(r.mark).toBe('💪');
  expect(r.markShown).toBe('💪');   // picking a preset updates the live brand
});
