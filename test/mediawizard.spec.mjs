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

test('feat 237 — mediaCreator reads the creator from the link where the platform exposes it', async ({ page }) => {
  const r = await page.evaluate(() => {
    const cr = (url) => mediaCreator(parseMediaUrl(url));
    return {
      tiktok: cr('https://www.tiktok.com/@squatuniversity/video/7300000000000000000'),
      ytChannelParam: cr('https://www.youtube.com/watch?v=abcdefghij1&ab_channel=AthleanX'),
      ytHandle: cr('https://www.youtube.com/@jefnippard'),
      ytPlain: cr('https://youtu.be/abcdefghij1'),
      ig: cr('https://www.instagram.com/squat_university/reel/Cabcdef/'),
    };
  });
  expect(r.tiktok).toBe('@squatuniversity');
  expect(r.ytChannelParam).toBe('AthleanX'); // &ab_channel from a desktop "copy link"
  expect(r.ytHandle).toBe('@jefnippard');
  expect(r.ytPlain).toBeNull();              // a plain video URL has no channel → untagged
  expect(r.ig).toBe('@squat_university');
});

test('feat 237 — the stable groups by creator with counts, and purge removes a whole creator', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null, b = null; for (const [u] of VAR_INDEX) { if (!a) { a = u; continue; } b = u; break; }
    state.readonly = false; state.exerciseMedia = {};
    addExerciseMedia(a, 'https://www.tiktok.com/@squatuniversity/video/7300000000000000000');
    addExerciseMedia(a, 'https://www.youtube.com/watch?v=abcdefghij1&ab_channel=AthleanX');
    addExerciseMedia(b, 'https://www.tiktok.com/@squatuniversity/video/7300000000000000001');
    addExerciseMedia(b, 'https://youtu.be/zzzzzzzzzzz'); // untagged
    const tagged = getExerciseMedia(a).every(m => m.creator);  // stored at add time when known
    const stable = mediaCreatorStable();
    const removed = purgeCreator('@squatuniversity');          // wipe that creator everywhere
    const after = mediaCreatorStable();
    return { tagged, stable: stable.list, untagged: stable.untagged, removed, afterList: after.list.map(c => c.creator), aLeft: getExerciseMedia(a).length };
  });
  expect(r.tagged).toBe(true);
  expect(r.stable).toEqual([{ creator: '@squatuniversity', count: 2 }, { creator: 'AthleanX', count: 1 }]); // by count desc
  expect(r.untagged).toBe(1);
  expect(r.removed).toBe(2);                       // both @squatuniversity links removed across exercises
  expect(r.afterList).toEqual(['AthleanX']);       // only the other creator remains
  expect(r.aLeft).toBe(1);                          // exercise a keeps its AthleanX link, loses the TikTok one
});

test('feat 237 — the wizard renders the creator stable with purge buttons and per-entry creator labels', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { a = u; break; }
    state.exerciseMedia = {};
    addExerciseMedia(a, 'https://www.tiktok.com/@kneesovertoesguy/video/7300000000000000002');
    mediaWizardState = { search: '', withMediaOnly: true, kind: 'all', reassign: null, reassignSearch: '' };
    document.getElementById('media-wizard').classList.add('open');
    renderMediaWizard();
    const body = document.getElementById('mw-body');
    return {
      hasStable: !!body.querySelector('.mw-creators'),
      creatorChip: body.querySelector('.mw-creator .mw-creator-name')?.textContent,
      hasPurge: !!body.querySelector('[data-mw-purge="@kneesovertoesguy"]'),
      purgeN: body.querySelector('[data-mw-purge]')?.dataset.mwPurgeN,
      entryCreator: body.querySelector('.mw-link-creator')?.textContent,
    };
  });
  expect(r.hasStable).toBe(true);
  expect(r.creatorChip).toBe('@kneesovertoesguy');
  expect(r.hasPurge).toBe(true);
  expect(r.purgeN).toBe('1');
  expect(r.entryCreator).toBe('@kneesovertoesguy'); // the link row shows its creator
});

// feat 238 — watch tracking + "needs media" filter + inline preview
test('feat 238 — watch tracking keys by the clip itself and only marks when explicitly recorded', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null, b = null; for (const [u] of VAR_INDEX) { if (!a) { a = u; continue; } b = u; break; }
    state.readonly = false; state.exerciseMedia = {}; state.mediaWatched = {};
    addExerciseMedia(a, 'https://www.youtube.com/watch?v=abcdefghij1'); // same clip…
    addExerciseMedia(b, 'https://www.youtube.com/watch?v=abcdefghij1'); // …added under a second exercise
    const m = getExerciseMedia(a)[0], m2 = getExerciseMedia(b)[0];
    const beforeA = mediaWatchedAt(m);
    markMediaWatched(m);
    return {
      key: mediaWatchKey(m),
      keyMatches: mediaWatchKey(m) === mediaWatchKey(m2),   // keyed by the clip, so it's shared everywhere it appears
      beforeA,
      afterA: !!mediaWatchedAt(m),
      afterB_sharedClip: !!mediaWatchedAt(m2),              // the same clip under b reads as watched too
    };
  });
  expect(r.key).toBe('youtube:abcdefghij1');
  expect(r.keyMatches).toBe(true);
  expect(r.beforeA).toBeNull();          // nothing watched until recorded — a fresh clip is "never watched"
  expect(r.afterA).toBe(true);
  expect(r.afterB_sharedClip).toBe(true);
});

test('feat 238 — the "needs media" filter shows only variations uncovered by themselves AND their parent', async ({ page }) => {
  const r = await page.evaluate((url) => {
    const f = FAMILIES.find(x => (x.variations || []).filter(v => v.uuid && !isSuppressedVar(v.uuid)).length >= 2);
    const vs = f.variations.filter(v => v.uuid && !isSuppressedVar(v.uuid));
    const ownClip = vs[0].uuid, bare = vs[1].uuid;
    // case 1: one variation has its own clip, the other has nothing (and the parent has nothing)
    state.exerciseMedia = {}; state.readonly = false;
    addExerciseMedia(ownClip, url);
    mediaWizardState = { search: '', withMediaOnly: false, kind: 'variation', uncoveredOnly: true, preview: null, reassign: null, reassignSearch: '' };
    const ids1 = mediaWizardRows().map(x => x.id);
    // case 2: the PARENT movement carries a demo → its bare variation is no longer "uncovered"
    state.exerciseMedia = {};
    addExerciseMedia(f.id, url);
    const ids2 = mediaWizardRows().map(x => x.id);
    return {
      ownClipShown: ids1.includes(ownClip),   // has its own clip → not flagged
      bareShown: ids1.includes(bare),         // no clip, no parent demo → flagged
      bareCoveredByParent: !ids2.includes(bare), // parent demo now covers it → not flagged
    };
  }, YT);
  expect(r.ownClipShown).toBe(false);
  expect(r.bareShown).toBe(true);
  expect(r.bareCoveredByParent).toBe(true);
});

test('feat 238 — a row shows a preview button + watch label; toggling preview mounts the embed iframe', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { a = u; break; }
    state.readonly = false; state.exerciseMedia = {}; state.mediaWatched = {};
    addExerciseMedia(a, 'https://www.youtube.com/watch?v=abcdefghij1'); // embeddable
    mediaWizardState = { search: '', withMediaOnly: true, kind: 'all', uncoveredOnly: false, preview: null, reassign: null, reassignSearch: '' };
    document.getElementById('media-wizard').classList.add('open');
    renderMediaWizard();
    const body = document.getElementById('mw-body');
    const hasPrevBtn = !!body.querySelector('[data-mw-preview]');
    const labelBefore = body.querySelector('.mw-link-watched')?.textContent;
    const frameBefore = !!body.querySelector('[data-mw-frame]');
    body.querySelector('[data-mw-preview]').click(); // open the inline preview
    const frame = document.querySelector('#mw-body [data-mw-frame]');
    return { hasPrevBtn, labelBefore, frameBefore, frameAfter: !!frame, src: frame?.getAttribute('src') || '' };
  });
  expect(r.hasPrevBtn).toBe(true);
  expect(r.labelBefore).toContain('never watched'); // not watched yet
  expect(r.frameBefore).toBe(false);                // no iframe until you open the preview
  expect(r.frameAfter).toBe(true);
  expect(r.src).toContain('/embed/');               // the real embed URL (youtube-nocookie)
});

test('feat 238 — opening a preview marks it watched after the dwell; merely rendering a row does not', async ({ page }) => {
  // scroll-past: render the row but never open the preview → nothing is marked watched
  const passive = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { a = u; break; }
    state.readonly = false; state.exerciseMedia = {}; state.mediaWatched = {}; _mediaWatchDwellMs = 40;
    addExerciseMedia(a, 'https://www.youtube.com/watch?v=abcdefghij1');
    mediaWizardState = { search: '', withMediaOnly: true, kind: 'all', uncoveredOnly: false, preview: null, reassign: null, reassignSearch: '' };
    document.getElementById('media-wizard').classList.add('open');
    renderMediaWizard(); // preview stays closed
    return Object.keys(state.mediaWatched).length;
  });
  await page.waitForTimeout(150);
  const stillUnwatched = await page.evaluate(() => Object.keys(state.mediaWatched).length);
  expect(passive).toBe(0);
  expect(stillUnwatched).toBe(0); // scrolling past a thumbnail never counts

  // active: open the preview and let it dwell → it becomes watched, and the label updates
  await page.evaluate(() => { document.querySelector('#mw-body [data-mw-preview]').click(); });
  await page.waitForFunction(() => state.mediaWatched && Object.keys(state.mediaWatched).length > 0, null, { timeout: 3000 });
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { a = u; break; }
    const m = getExerciseMedia(a)[0];
    document.querySelector('#mw-body [data-mw-preview]').click(); // hide → re-render with the fresh watch state
    return { watchedKey: mediaWatchKey(m), watchedAt: mediaWatchedAt(m), label: document.querySelector('#mw-body .mw-link-watched')?.textContent || '' };
  });
  expect(r.watchedKey).toBe('youtube:abcdefghij1');
  expect(r.watchedAt).toBeTruthy();        // a real ISO timestamp
  expect(r.label).toContain('👁');         // the row now shows the watched badge
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
