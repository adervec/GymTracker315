// feat 110 — desktop bulk media wizard: add / reassign / test / delete reference links across every
// exercise. Tests the data operations + rendering (project-independent; gating is desktop-only).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const YT = 'https://www.youtube.com/watch?v=abcdefghij1';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.reassignMedia === 'function'
    && typeof window.mediaWizardRows === 'function'
    && typeof window.renderMediaWizard === 'function'
    && typeof window.addExerciseMedia === 'function', null, { timeout: 15000 });
});

test('reassignMedia moves a link from one exercise to another', async ({ page }) => {
  const r = await page.evaluate((url) => {
    let a = null, b = null;
    for (const [u] of VAR_INDEX) { if (!a) { a = u; continue; } b = u; break; }
    state.readonly = false; state.exerciseMedia = {};
    addExerciseMedia(a, url);
    const beforeA = getExerciseMedia(a).length;
    reassignMedia(a, 0, b);
    return { beforeA, afterA: getExerciseMedia(a).length, afterB: getExerciseMedia(b).length };
  }, YT);
  expect(r.beforeA).toBe(1);
  expect(r.afterA).toBe(0);
  expect(r.afterB).toBe(1);
});

test('mediaWizardRows honors the search and with-media-only filters', async ({ page }) => {
  const r = await page.evaluate((url) => {
    let a = null;
    for (const [u] of VAR_INDEX) { a = u; break; }
    state.exerciseMedia = {};
    addExerciseMedia(a, url);
    mediaWizardState.search = ''; mediaWizardState.withMediaOnly = true; mediaWizardState.reassign = null;
    const onlyMedia = mediaWizardRows();
    mediaWizardState.withMediaOnly = false; mediaWizardState.search = VAR_INDEX.get(a).variation.title;
    const bySearch = mediaWizardRows();
    return { onlyMediaCount: onlyMedia.length, onlyMediaUuid: onlyMedia[0] && onlyMedia[0].uuid, a, searchHasA: bySearch.some((x) => x.uuid === a) };
  }, YT);
  expect(r.onlyMediaCount).toBe(1);           // only the one exercise with media
  expect(r.onlyMediaUuid).toBe(r.a);
  expect(r.searchHasA).toBe(true);            // search surfaces it regardless of media
});

test('Re-test all refreshes a stale link to embeddable', async ({ page }) => {
  const embed = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { a = u; break; }
    // a previously "link-only" youtu.be entry that the parser can now embed
    state.exerciseMedia = { [a]: [{ platform: 'link', vid: null, embedUrl: null, watchUrl: 'https://youtu.be/abcdefghij1', url: 'https://youtu.be/abcdefghij1' }] };
    mediaWizardRetestAll();
    return getExerciseMedia(a)[0].embedUrl;
  });
  expect(embed).toBeTruthy(); // now embeddable
});

test('renderMediaWizard renders a row per matching exercise', async ({ page }) => {
  const rows = await page.evaluate((url) => {
    let a = null; for (const [u] of VAR_INDEX) { a = u; break; }
    state.exerciseMedia = {}; addExerciseMedia(a, url);
    mediaWizardState.search = ''; mediaWizardState.withMediaOnly = true; mediaWizardState.reassign = null;
    document.getElementById('media-wizard').classList.add('open');
    renderMediaWizard();
    return document.querySelectorAll('#mw-body .mw-row').length;
  }, YT);
  expect(rows).toBeGreaterThanOrEqual(1);
});

test('isDesktopWizard returns a boolean', async ({ page }) => {
  const t = await page.evaluate(() => typeof isDesktopWizard());
  expect(t).toBe('boolean');
});

test('the media-modal close button (✕) is a centered 30×30 box (feat 131)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null; for (const [k] of VAR_INDEX) { u = k; break; }
    openExerciseMedia(u); // renders the modal head, which always carries .media-close
    const btn = document.querySelector('#media-modal .media-close');
    if (!btn) return null;
    const cs = getComputedStyle(btn);
    return { display: cs.display, alignItems: cs.alignItems, justifyContent: cs.justifyContent, lineHeight: cs.lineHeight, w: btn.offsetWidth, h: btn.offsetHeight, txt: btn.textContent.trim() };
  });
  expect(r).not.toBeNull();
  expect(r.display).toMatch(/flex$/);          // (inline-)flex box so the glyph centers
  expect(r.alignItems).toBe('center');         // vertical centering — the bug was the ✕ sitting low/off
  expect(r.justifyContent).toBe('center');     // horizontal centering
  expect(r.w).toBe(30);
  expect(r.h).toBe(30);
  expect(r.txt).toBe('✕');
});
