// feat 294 — a one-tap purge of all NON-EMBEDDABLE media: pure external links with no inline preview (no
// embedUrl and not an image). Embeddable videos and images are always kept. Exposed in the Media Wizard toolbar.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const YT = 'https://www.youtube.com/watch?v=abcdefghij1';   // → embeddable
const LINK1 = 'https://example.com/some-article';           // → link-only (non-embeddable)
const LINK2 = 'https://blog.example.org/a-post';            // → link-only

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof addExerciseMedia === 'function' && typeof purgeNonEmbeddableMedia === 'function'
    && typeof countNonEmbeddableMedia === 'function' && typeof mediaPlayable === 'function' && typeof renderMediaWizard === 'function', null, { timeout: 15000 });
});

test('feat 294 — purgeNonEmbeddableMedia removes only the link-only clips, keeping embeds/images', async ({ page }) => {
  const r = await page.evaluate(({ yt, l1, l2 }) => {
    let a = null, b = null;
    for (const [u] of VAR_INDEX) { if (!a) { a = u; continue; } b = u; break; }
    state.readonly = false; state.exerciseMedia = {};
    addExerciseMedia(a, yt);   // embeddable
    addExerciseMedia(a, l1);   // link-only
    addExerciseMedia(b, l2);   // link-only
    const before = { count: countNonEmbeddableMedia(), aLen: getExerciseMedia(a).length, bLen: getExerciseMedia(b).length };
    const removed = purgeNonEmbeddableMedia();
    const aMedia = getExerciseMedia(a);
    return {
      before, removed,
      after: { count: countNonEmbeddableMedia(), aLen: aMedia.length, bLen: getExerciseMedia(b).length, aAllPlayable: aMedia.every(m => mediaPlayable(m)) },
      bKeyGone: !state.exerciseMedia[b],
    };
  }, { yt: YT, l1: LINK1, l2: LINK2 });
  expect(r.before.count).toBe(2);     // two link-only clips
  expect(r.before.aLen).toBe(2);      // a held an embed + a link
  expect(r.removed).toBe(2);
  expect(r.after.count).toBe(0);
  expect(r.after.aLen).toBe(1);       // the embeddable clip survives
  expect(r.after.aAllPlayable).toBe(true);
  expect(r.after.bLen).toBe(0);
  expect(r.bKeyGone).toBe(true);      // an emptied exercise key is dropped
});

test('feat 294 — the toolbar shows a "Purge link-only (N)" button only when there are link-only clips', async ({ page }) => {
  const r = await page.evaluate(({ yt, l1 }) => {
    let a = null; for (const [u] of VAR_INDEX) { a = u; break; }
    state.readonly = false; state.exerciseMedia = {};
    addExerciseMedia(a, yt);            // only an embeddable clip
    renderMediaWizard();
    const noBtn = !document.getElementById('mw-purge-nonembed');
    addExerciseMedia(a, l1);            // …now a link-only one exists
    renderMediaWizard();
    const btn = document.getElementById('mw-purge-nonembed');
    return { noBtn, hasBtn: !!btn, label: btn ? btn.textContent.replace(/\s+/g, ' ').trim() : '' };
  }, { yt: YT, l1: LINK1 });
  expect(r.noBtn).toBe(true);          // hidden with no link-only media
  expect(r.hasBtn).toBe(true);         // shown once there's a link-only clip
  expect(r.label).toContain('1');      // …with the count
});
