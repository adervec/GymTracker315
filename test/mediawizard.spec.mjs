// feat 110 — desktop bulk media wizard: add / reassign / test / delete reference links across every
// exercise. Tests the data operations + rendering (project-independent; gating is desktop-only).
// feat 236 — the wizard now lists MOVEMENT rows (family-keyed demos) alongside variations, a kind filter
// (all/movement/variation), per-movement child coverage, a parent-demo badge, and sheet import/export.
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
    mediaWizardState = { search: '', withMediaOnly: true, kind: 'variation', reassign: null, reassignSearch: '' };
    const onlyMedia = mediaWizardRows();      // variations-only kind, with-media-only → just `a`
    mediaWizardState.withMediaOnly = false; mediaWizardState.search = VAR_INDEX.get(a).variation.title;
    const bySearch = mediaWizardRows();
    return { onlyMediaCount: onlyMedia.length, onlyMediaUuid: onlyMedia[0] && onlyMedia[0].id, a, searchHasA: bySearch.some((x) => x.id === a) };
  }, YT);
  expect(r.onlyMediaCount).toBe(1);           // only the one exercise with media
  expect(r.onlyMediaUuid).toBe(r.a);          // rows now carry `.id` (a uuid for variations, a family id for movements)
  expect(r.searchHasA).toBe(true);            // search surfaces it regardless of media
});

test('feat 236 — the wizard lists MOVEMENT rows with child coverage; variations badge a parent demo', async ({ page }) => {
  const r = await page.evaluate((url) => {
    const f = FAMILIES.find(x => (x.variations || []).some(v => v.uuid && !isSuppressedVar(v.uuid)));
    const v = f.variations.find(x => x.uuid && !isSuppressedVar(x.uuid));
    state.exerciseMedia = {};
    addExerciseMedia(f.id, url);                 // a MOVEMENT-level demo (family key)
    addExerciseMedia(v.uuid, url.replace('1', '2')); // a variation-level link
    mediaWizardState = { search: '', withMediaOnly: false, kind: 'all', reassign: null, reassignSearch: '' };
    const rows = mediaWizardRows();
    const movRow = rows.find(x => x.type === 'movement' && x.id === f.id);
    const varRow = rows.find(x => x.type === 'variation' && x.id === v.uuid);
    return { hasMov: !!movRow, movMediaLen: movRow && movRow.media.length, childWith: movRow && movRow.childWith, childTotal: movRow && movRow.childTotal, varParentHasMedia: varRow && varRow.parentHasMedia };
  }, YT);
  expect(r.hasMov).toBe(true);
  expect(r.movMediaLen).toBe(1);                 // the movement's own demo shows on its row
  expect(r.childWith).toBeGreaterThanOrEqual(1); // …and at least one child variation is covered
  expect(r.childTotal).toBeGreaterThanOrEqual(r.childWith);
  expect(r.varParentHasMedia).toBe(true);        // the variation row flags that its parent has a demo
});

test('feat 236 — the kind filter restricts to movements or variations', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.exerciseMedia = {};
    mediaWizardState = { search: 'bench press', withMediaOnly: false, kind: 'movement', reassign: null, reassignSearch: '' };
    const movs = mediaWizardRows();
    mediaWizardState.kind = 'variation'; const vars = mediaWizardRows();
    mediaWizardState.kind = 'all'; const all = mediaWizardRows();
    return {
      movsAllMovement: movs.length > 0 && movs.every(x => x.type === 'movement'),
      varsAllVariation: vars.length > 0 && vars.every(x => x.type === 'variation'),
      allHasBoth: all.some(x => x.type === 'movement') && all.some(x => x.type === 'variation'),
    };
  });
  expect(r.movsAllMovement).toBe(true);
  expect(r.varsAllVariation).toBe(true);
  expect(r.allHasBoth).toBe(true);
});

test('feat 236 — the toolbar offers the kind filter, Export/Import sheet, and split counts; a MOVEMENT row renders tagged', async ({ page }) => {
  const r = await page.evaluate((url) => {
    state.exerciseMedia = {};
    const f = FAMILIES.find(x => (x.variations || []).some(v => v.uuid && !isSuppressedVar(v.uuid)));
    addExerciseMedia(f.id, url);
    mediaWizardState = { search: '', withMediaOnly: false, kind: 'movement', reassign: null, reassignSearch: '' };
    document.getElementById('media-wizard').classList.add('open');
    renderMediaWizard();
    const tb = document.getElementById('mw-toolbar');
    return {
      kindBtns: [...tb.querySelectorAll('[data-mw-kind]')].map(b => b.dataset.mwKind),
      hasExport: !!tb.querySelector('#mw-export-sheet'),
      hasImport: !!tb.querySelector('#mw-import-sheet'),
      stat: tb.querySelector('.mw-stat').textContent,
      movTag: document.querySelector('#mw-body .mw-row-mov .mw-tag.mov')?.textContent,
      cov: !!document.querySelector('#mw-body .mw-row-mov .mw-cov'),
    };
  }, YT);
  expect(r.kindBtns).toEqual(['all', 'movement', 'variation']);
  expect(r.hasExport).toBe(true);
  expect(r.hasImport).toBe(true);
  expect(r.stat).toContain('movements');
  expect(r.stat).toContain('variations');
  expect(r.movTag).toBe('MOVEMENT');
  expect(r.cov).toBe(true);
});

test('feat 236 — Import-sheet funnels through importMediaData (movement + variation links land)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.exerciseMedia = {};
    const f = FAMILIES.find(x => (x.variations || []).some(v => v.uuid && !isSuppressedVar(v.uuid)));
    const v = f.variations.find(x => x.uuid && !isSuppressedVar(x.uuid));
    const sheet = `## X · ${f.title}\n- MOVEMENT — ${f.title}  {mid: ${f.id}}\n  media: https://youtu.be/movieMOVMOV\n- ${v.title}  {id: ${v.uuid}} {parent: ${f.id}}\n  media: https://youtu.be/varVARVARva\n`;
    importMediaData(sheet); // exactly what the wizard's Import-sheet handler runs on the file text
    return { mov: getExerciseMedia(f.id).map(m => m.vid), vr: getExerciseMedia(v.uuid).map(m => m.vid) };
  });
  expect(r.mov).toContain('movieMOVMOV');
  expect(r.vr).toContain('varVARVARva');
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
