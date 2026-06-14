// feat 251 — the exercise (log-sets) screen: a total-time + %-active readout at the top, and a context-aware
// media button — "Configure Media" when empty, else "Watch <type> from <creator>".
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exMediaBtnLabel === 'function' && typeof exerciseTiming === 'function'
    && typeof openLogModal === 'function' && typeof mediaTypeLabel === 'function', null, { timeout: 15000 });
});

const stdVar = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; });

test('feat 251 — mediaTypeLabel maps platform to Short / Reel / TikTok / video', async ({ page }) => {
  const r = await page.evaluate(() => ({
    short: mediaTypeLabel(parseMediaUrl('https://www.youtube.com/shorts/abcdefghij1')),
    video: mediaTypeLabel(parseMediaUrl('https://www.youtube.com/watch?v=abcdefghij1')),
    reel: mediaTypeLabel(parseMediaUrl('https://www.instagram.com/squat_university/reel/Cabcdef/')),
    tiktok: mediaTypeLabel(parseMediaUrl('https://www.tiktok.com/@squatuniversity/video/7300000000000000000')),
  }));
  expect(r.short).toBe('Short');
  expect(r.video).toBe('video');
  expect(r.reel).toBe('Reel');
  expect(r.tiktok).toBe('TikTok');
});

test('feat 251 — exMediaBtnLabel reads "Configure Media" when empty, "Watch <type> from <creator>" when not', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    const fi = VAR_INDEX.get(v), mov = fi.family.id;
    state.readonly = false; state.exerciseMedia = {};
    const empty = exMediaBtnLabel(v, mov);
    addExerciseMedia(v, 'https://www.tiktok.com/@squatuniversity/video/7300000000000000123');
    const oneTikTok = exMediaBtnLabel(v, mov);
    addExerciseMedia(v, 'https://www.youtube.com/shorts/zzzzzzzzzzz');
    const two = exMediaBtnLabel(v, mov);
    return { empty, oneTikTok, two };
  }, v);
  expect(r.empty).toBe('⚙ Configure Media');
  expect(r.oneTikTok).toBe('▶ Watch TikTok from @squatuniversity');
  expect(r.two).toContain('+1');          // a second clip is tallied
});

test('feat 251 — exerciseTiming gives total span + % active (active-under-tension ÷ span)', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    const now = Date.now();
    modalState.isEditing = false;
    state.sessions = [{ id: 's', date: new Date(now - 600000).toISOString(), updatedAt: new Date().toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [
        { w: 185, r: 5, wTs: new Date(now - 300000).toISOString(), ts: new Date(now - 270000).toISOString() }, // 30 s
        { w: 185, r: 5, wTs: new Date(now - 120000).toISOString(), ts: new Date(now - 90000).toISOString() },  // 30 s
      ] }] }];
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    const t = exerciseTiming(v, null);
    pending = { varUuid: null, subUuid: null, sets: [{ w: '', r: '' }] };
    return t;
  }, v);
  expect(r.totalMs).toBe(210000);   // first start → last done
  expect(r.activeMs).toBe(60000);   // 30 s + 30 s under tension
  expect(r.pctActive).toBe(29);     // 60 / 210
});

test('feat 251 — the log sheet renders the time stat + the context-aware media button', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    const now = Date.now();
    state.readonly = false; state.exerciseMedia = {};
    state.sessions = [{ id: 's', date: new Date(now - 600000).toISOString(), updatedAt: new Date().toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 185, r: 5, wTs: new Date(now - 200000).toISOString(), ts: new Date(now - 170000).toISOString() }] }] }];
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    const stat = document.querySelector('#trk-modal-body .ex-time-stat');
    const btn = document.getElementById('trk-ex-media-btn');
    return { hasStat: !!stat, statText: stat?.textContent.replace(/\s+/g, ' ').trim(), btnLabel: btn?.textContent, noMediaClass: btn?.classList.contains('no-media') };
  }, v);
  expect(r.hasStat).toBe(true);
  expect(r.statText).toContain('active');
  expect(r.btnLabel).toBe('⚙ Configure Media');   // none added yet
  expect(r.noMediaClass).toBe(true);
});
