// feat 442 — full reference export: the complete exercise catalogue as one self-contained HTML document
// with a strict h1 → h2 (group) → h3 (movement) → h4 (variation) hierarchy so reader apps can section
// and TOC it natively. No scripts inside, everything escaped, extras included.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildReferenceHtml === 'function' && typeof exportReferenceHtml === 'function'
    && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('feat 442 — the document is fully sectioned, complete, and self-contained', async ({ page }) => {
  const r = await page.evaluate(() => {
    const html = buildReferenceHtml();
    const count = (re) => (html.match(re) || []).length;
    return {
      size: html.length,
      hasDoctype: html.startsWith('<!DOCTYPE html>'),
      h1: count(/<h1>/g),
      h2: count(/<h2>/g),
      h3: count(/<h3>/g),
      h4: count(/<h4>/g),
      famCount: exercises.length,
      varCount: exercises.reduce((n, e) => n + (e.variations || []).length, 0),
      hasBench: html.includes('<h3>Flat Bench Press</h3>'),
      hasExtra: html.includes('Horizontal Calf Raise'),          // EXTRA_VARIATIONS mirrored in (feat 425)
      hasSetupList: /<p class="lbl">Setup<\/p><ul><li>/.test(html),
      hasProgramming: html.includes('<p class="lbl">Programming</p>'),
      noInnerScript: !html.slice(html.indexOf('<body')).includes('<script'),
      metaCounts: /(\d+) movements, (\d+) variations/.exec(html),
    };
  });
  expect(r.hasDoctype).toBe(true);
  expect(r.h1).toBe(1);
  expect(r.h2).toBeGreaterThanOrEqual(5);                 // push / pull / lower / core / full / cardio…
  expect(r.h3).toBe(r.famCount);                          // one heading per movement
  expect(r.h4).toBe(r.varCount);                          // one heading per variation
  expect(r.h4).toBeGreaterThan(300);
  expect(r.hasBench).toBe(true);
  expect(r.hasExtra).toBe(true);
  expect(r.hasSetupList).toBe(true);
  expect(r.hasProgramming).toBe(true);
  expect(r.noInnerScript).toBe(true);
  expect(parseInt(r.metaCounts[1], 10)).toBe(r.famCount); // the meta line's counts are honest
  expect(parseInt(r.metaCounts[2], 10)).toBe(r.varCount);
  expect(r.size).toBeGreaterThan(200000);                 // the FULL reference, not a stub
});

test('feat 442 — the Data page carries the export button and it downloads', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const btn = document.getElementById('settings-drawer-body').querySelector('#ref-export-html-btn');
    return { present: !!btn, label: btn ? btn.textContent.trim() : '' };
  });
  expect(r.present).toBe(true);
  expect(r.label).toContain('Export Reference HTML');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => { document.getElementById('settings-drawer-body').querySelector('#ref-export-html-btn').click(); }),
  ]);
  expect(download.suggestedFilename()).toMatch(/^exercise-reference-\d{4}-\d{2}-\d{2}\.html$/);
});
