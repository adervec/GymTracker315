// feat 330 — the variation briefing (🎧 coach brief, feat 304) is reachable from the full Reference: the detailed
// view's per-variation header gets a 🎧 button next to 🎬 media / 📈 trends, wired to startVariationPodcast(uuid).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openReferenceFor === 'function' && typeof renderRef === 'function'
    && typeof startVariationPodcast === 'function', null, { timeout: 15000 });
});

test('the detailed Reference renders a 🎧 Brief button on each variation, carrying its uuid', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.refView = 'detailed';
    const fam = FAMILIES.find(f => f.id === 'chest-fly');
    const v = fam.variations.find(x => x.id === 'freemotion-chest-fly');
    openReferenceFor(v.uuid);
    const vr = document.querySelector(`.variation[data-uuid="${v.uuid}"]`);
    const btn = vr && vr.querySelector('.ref-brief-btn');
    return { uuid: v.uuid, hasBtn: !!btn, btnUuid: btn && btn.getAttribute('data-brief-uuid'), label: btn && btn.textContent };
  });
  expect(r.hasBtn).toBe(true);
  expect(r.btnUuid).toBe(r.uuid);
  expect(r.label).toContain('🎧');
});

test('clicking the Reference 🎧 button starts that variation’s briefing', async ({ page }) => {
  const got = await page.evaluate(() => {
    state.refView = 'detailed';
    const fam = FAMILIES.find(f => f.id === 'chest-fly');
    const v = fam.variations.find(x => x.id === 'freemotion-chest-fly');
    openReferenceFor(v.uuid);
    let called = null;
    const real = window.startVariationPodcast;
    window.startVariationPodcast = (u) => { called = u; };     // inline onclick resolves via window
    const vr = document.querySelector(`.variation[data-uuid="${v.uuid}"]`);
    vr.querySelector('.ref-brief-btn').click();
    window.startVariationPodcast = real;
    return { called, uuid: v.uuid };
  });
  expect(got.called).toBe(got.uuid);
});

test('the 🎧 button sits alongside the existing 🎬 media and 📈 trends actions', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.refView = 'detailed';
    const fam = FAMILIES.find(f => f.id === 'chest-fly');
    const v = fam.variations.find(x => x.id === 'freemotion-chest-fly');
    openReferenceFor(v.uuid);
    const row = document.querySelector(`.variation[data-uuid="${v.uuid}"] .var-badge-row`);
    return { media: !!row.querySelector('[data-media-uuid]'), brief: !!row.querySelector('.ref-brief-btn'), trends: /📈/.test(row.textContent) };
  });
  expect(r.media).toBe(true);
  expect(r.trends).toBe(true);
  expect(r.brief).toBe(true);
});
