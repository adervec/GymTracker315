// feat 239 — Media Gallery (Study › 🎞️): every reference clip in one searchable, filterable, scrollable
// grid, reachable from the Reference header and the bulk wizard, reusing the feat-238 watch-tracking engine.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const YT = 'https://www.youtube.com/watch?v=abcdefghij1';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.allMediaClips === 'function'
    && typeof window.mediaGalleryClips === 'function'
    && typeof window.renderMediaGalleryPage === 'function'
    && typeof window.navTo === 'function'
    && typeof window.addExerciseMedia === 'function', null, { timeout: 15000 });
});

test('feat 239 — allMediaClips flattens movement + variation clips, mediaGalleryClips filters them', async ({ page }) => {
  const r = await page.evaluate((url) => {
    const f = FAMILIES.find(x => (x.variations || []).some(v => v.uuid && !isSuppressedVar(v.uuid)));
    const v = f.variations.find(x => x.uuid && !isSuppressedVar(x.uuid));
    state.readonly = false; state.exerciseMedia = {}; state.mediaWatched = {};
    addExerciseMedia(f.id, url);                       // a movement-level clip
    addExerciseMedia(v.uuid, url.replace('1', '2'));   // a variation-level clip
    const all = allMediaClips();
    const kinds = all.map(c => c.owner.kind).sort();
    markMediaWatched(getExerciseMedia(f.id)[0]);        // mark the movement clip watched
    mediaGalleryState = { search: '', watch: 'all', kind: 'all', preview: null };
    const allCount = mediaGalleryClips().length;
    mediaGalleryState.watch = 'watched'; const watched = mediaGalleryClips().length;
    mediaGalleryState.watch = 'unwatched'; const unwatched = mediaGalleryClips().length;
    mediaGalleryState.watch = 'all'; mediaGalleryState.kind = 'movement'; const movs = mediaGalleryClips();
    mediaGalleryState.kind = 'variation'; const vars = mediaGalleryClips();
    mediaGalleryState.kind = 'all'; mediaGalleryState.search = v.title; const searchCount = mediaGalleryClips().length;
    return {
      total: all.length, kinds, allCount, watched, unwatched,
      movsAll: movs.length === 1 && movs[0].owner.kind === 'movement',
      varsAll: vars.length === 1 && vars[0].owner.kind === 'variation',
      searchCount,
    };
  }, YT);
  expect(r.total).toBe(2);
  expect(r.kinds).toEqual(['movement', 'variation']);
  expect(r.allCount).toBe(2);
  expect(r.watched).toBe(1);
  expect(r.unwatched).toBe(1);
  expect(r.movsAll).toBe(true);
  expect(r.varsAll).toBe(true);
  expect(r.searchCount).toBeGreaterThanOrEqual(1);
});

test('feat 239 — mediaThumb yields a YouTube thumbnail and null for non-YouTube', async ({ page }) => {
  const r = await page.evaluate(() => ({
    yt: mediaThumb(parseMediaUrl('https://www.youtube.com/watch?v=abcdefghij1')),
    tk: mediaThumb(parseMediaUrl('https://www.tiktok.com/@squatuniversity/video/7300000000000000000')),
  }));
  expect(r.yt).toContain('ytimg.com');
  expect(r.yt).toContain('abcdefghij1');
  expect(r.tk).toBeNull();
});

test('feat 239 — the page renders a grid of cards with filter segments, watch labels, and open buttons', async ({ page }) => {
  const r = await page.evaluate((url) => {
    let a = null; for (const [u] of VAR_INDEX) { a = u; break; }
    state.readonly = false; state.exerciseMedia = {}; state.mediaWatched = {};
    addExerciseMedia(a, url);
    mediaGalleryState = { search: '', watch: 'all', kind: 'all', preview: null };
    navTo('media-gallery');
    return {
      onPage: currentPage === 'media-gallery',
      cards: document.querySelectorAll('#trk-main .mg-card').length,
      hasThumb: !!document.querySelector('#trk-main .mg-card .mg-thumb'),
      hasOpen: !!document.querySelector('#trk-main .mg-card [data-mg-open]'),
      watchLabel: document.querySelector('#trk-main .mg-card .mg-watched')?.textContent || '',
      segs: document.querySelectorAll('#trk-main [data-mg-seg]').length,
      count: document.querySelector('#trk-main .mg-count')?.textContent || '',
    };
  }, YT);
  expect(r.onPage).toBe(true);
  expect(r.cards).toBeGreaterThanOrEqual(1);
  expect(r.hasThumb).toBe(true);
  expect(r.hasOpen).toBe(true);
  expect(r.watchLabel).toContain('unwatched');
  expect(r.segs).toBeGreaterThanOrEqual(6); // 3 watch + 3 kind
  expect(r.count).toContain('watched');
});

test('feat 239 — playing a card inline marks it watched after the dwell; the watched filter then finds it', async ({ page }) => {
  await page.evaluate((url) => {
    let a = null; for (const [u] of VAR_INDEX) { a = u; break; }
    state.readonly = false; state.exerciseMedia = {}; state.mediaWatched = {}; _mediaWatchDwellMs = 40;
    addExerciseMedia(a, url); // embeddable
    mediaGalleryState = { search: '', watch: 'all', kind: 'all', preview: null };
    navTo('media-gallery');
  }, YT);
  // scroll-past: a rendered card that's never opened stays unwatched
  await page.waitForTimeout(120);
  const passive = await page.evaluate(() => Object.keys(state.mediaWatched).length);
  expect(passive).toBe(0);
  // open the inline embed and let it dwell
  await page.evaluate(() => document.querySelector('#trk-main .mg-thumb[data-mg-preview]').click());
  const framed = await page.evaluate(() => !!document.querySelector('#trk-main .mg-thumb iframe'));
  expect(framed).toBe(true);
  await page.waitForFunction(() => state.mediaWatched && Object.keys(state.mediaWatched).length > 0, null, { timeout: 3000 });
  const r = await page.evaluate(() => {
    document.querySelector('#trk-main [data-mg-seg="watch"][data-mg-val="watched"]').click(); // re-render under the watched filter
    return {
      watchedClips: mediaGalleryClips().length,
      seenCard: !!document.querySelector('#trk-main .mg-card.seen'),
      label: document.querySelector('#trk-main .mg-card .mg-watched')?.textContent || '',
    };
  });
  expect(r.watchedClips).toBe(1);
  expect(r.seenCard).toBe(true);
  expect(r.label).toContain('👁');
});

test('feat 239 — registered as a unique-emoji Study leaf, reachable from the Reference header and the wizard', async ({ page }) => {
  const r = await page.evaluate(() => {
    const def = PAGES['media-gallery'];
    const sameEmoji = Object.values(PAGES).filter(p => p.emoji === def.emoji).length;
    const refBtn = document.getElementById('ref-gallery-btn');
    document.getElementById('media-wizard').classList.add('open'); renderMediaWizard();
    const wizBtn = document.getElementById('mw-gallery');
    return {
      exists: !!def, kind: def && def.kind, parent: def && def.parent,
      uniqueEmoji: sameEmoji === 1,
      inStudy: PAGES.study.children.includes('media-gallery'),
      refBtn: !!refBtn, wizBtn: !!wizBtn,
    };
  });
  expect(r.exists).toBe(true);
  expect(r.kind).toBe('leaf');
  expect(r.parent).toBe('study');
  expect(r.uniqueEmoji).toBe(true);
  expect(r.inStudy).toBe(true);
  expect(r.refBtn).toBe(true);
  expect(r.wizBtn).toBe(true);
});

test('feat 239 — the Reference gallery button navigates to the Media Gallery page', async ({ page }) => {
  const landed = await page.evaluate(() => {
    navTo('reference');
    const btn = document.getElementById('ref-gallery-btn');
    if (!btn) return 'no-button';
    btn.click();
    return currentPage;
  });
  expect(landed).toBe('media-gallery');
});
