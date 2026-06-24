// feat 349/350/351 — timelapse smoothness, GIF-or-video export, and photo splicing.
// Covers: tweened frames between sets (smooth sweep), photoDefaultElapsedMs, photo frames spliced at the right
// moment, medianCut palette reduction, photos surviving into a rendered GIF, and (best-effort) WebM video export.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildWorkoutTimelapse === 'function' && typeof photoDefaultElapsedMs === 'function'
    && typeof medianCut === 'function' && typeof renderWorkoutTimelapseGif === 'function'
    && typeof timelapseVideoSupported === 'function' && typeof VAR_INDEX !== 'undefined', null, { timeout: 15000 });
});

const oneUuid = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) return u; });

test('tween frames sweep the clock smoothly between set keyframes', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    // two sets 2 minutes apart → a big gap that must be tweened, not jumped
    const s = { id: 's', date: iso(T), endedAt: iso(T + 120000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 120000) }] }] };
    const comp = buildWorkoutTimelapse(s, { speed: 32, chapters: ['timeline'] }).frames.filter(f => f.kind === 'composite');
    // distinct timeline head positions → the playhead actually moves between the 2 sets
    const heads = new Set(comp.map(f => f.panels.timeline.headP.toFixed(3)));
    let mono = true; for (let i = 1; i < comp.length; i++) if (comp[i].tMs < comp[i - 1].tMs - 1) mono = false;
    return { count: comp.length, distinctHeads: heads.size, mono };
  }, ua);
  expect(r.count).toBeGreaterThan(8);     // many tween frames across the 2-min gap
  expect(r.distinctHeads).toBeGreaterThan(8); // the playhead sweeps (not 2 discrete positions)
  expect(r.mono).toBe(true);
});

test('photoDefaultElapsedMs clamps the file time into the workout window', async ({ page }) => {
  const r = await page.evaluate(() => ({
    mid: photoDefaultElapsedMs(1000 + 30000, 1000, 120000),  // 30s in
    before: photoDefaultElapsedMs(500, 1000, 120000),         // before start → 0
    after: photoDefaultElapsedMs(1000 + 999999, 1000, 120000),// after end → span
    nan: photoDefaultElapsedMs(NaN, 1000, 120000),
  }));
  expect(r.mid).toBe(30000);
  expect(r.before).toBe(0);
  expect(r.after).toBe(120000);
  expect(r.nan).toBe(0);
});

test('photos are spliced as photo-frames at the moment they occurred', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 120000), exercises: [{ varUuid: ua, subUuid: null, sets: [
      { w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 60000) }, { w: 100, r: 5, ts: iso(T + 120000) }] }] };
    const photos = [{ elapsedMs: 90000, seconds: 3 }, { elapsedMs: 30000, seconds: 2 }]; // out of order on purpose
    const p = buildWorkoutTimelapse(s, { speed: 32, chapters: ['spotlight'], photos });
    const fr = p.frames; const photoFrames = fr.filter(f => f.kind === 'photo');
    // each photo frame must sit just before the first composite whose tMs >= its time
    const okOrder = photoFrames.every(pf => {
      const idx = fr.indexOf(pf); const after = fr.slice(idx + 1).find(f => f.kind === 'composite');
      return !after || after.tMs >= pf.tMs - 1;
    });
    return { titlePhotoCount: fr[0].photoCount, photoFrames: photoFrames.length,
      delays: photoFrames.map(f => f.delayCs).sort((a, b) => a - b), idxRef: photoFrames.map(f => f.photoIndex).sort(), okOrder };
  }, ua);
  expect(r.titlePhotoCount).toBe(2);
  expect(r.photoFrames).toBe(2);
  expect(r.delays).toEqual([200, 300]);      // 2s & 3s → 200 & 300 centiseconds
  expect(r.idxRef).toEqual([0, 1]);          // both photos referenced (sorted by time)
  expect(r.okOrder).toBe(true);              // spliced at the right point in the timeline
});

test('medianCut reduces a bag of colours to a representative palette', async ({ page }) => {
  const r = await page.evaluate(() => {
    const px = [];
    // three tight clusters: red, green, blue
    for (let i = 0; i < 100; i++) { px.push([200 + (i % 5), 10, 10]); px.push([10, 200 + (i % 5), 10]); px.push([10, 10, 200 + (i % 5)]); }
    const pal = medianCut(px, 3);
    const dom = c => (c[0] >= c[1] && c[0] >= c[2]) ? 0 : (c[1] >= c[2] ? 1 : 2); // dominant channel
    const doms = [...new Set(pal.map(dom))].sort();
    return { n: pal.length, doms, empty: medianCut([], 4).length };
  });
  expect(r.n).toBe(3);
  expect(r.doms).toEqual([0, 1, 2]); // the 3 representative colours are red-, green- and blue-dominant
  expect(r.empty).toBe(0);
});

test('a spliced photo survives into a rendered, decodable GIF', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate(async (ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    // build a small solid-colour image to splice
    const pc = document.createElement('canvas'); pc.width = 80; pc.height = 60; const pctx = pc.getContext('2d');
    pctx.fillStyle = '#e0408a'; pctx.fillRect(0, 0, 80, 60);
    const img = new Image(); await new Promise(res => { img.onload = res; img.src = pc.toDataURL('image/png'); });
    const s = { id: 's', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 60000) }] }] };
    const photos = [{ _img: img, elapsedMs: 30000, seconds: 2 }];
    const blob = await renderWorkoutTimelapseGif(s, { speed: 64, chapters: ['spotlight'], photos });
    if (!blob) return { ok: false };
    const url = URL.createObjectURL(blob); const out = new Image();
    await new Promise((res, rej) => { out.onload = res; out.onerror = () => rej(new Error('gif decode failed')); out.src = url; });
    const r2 = { ok: true, type: blob.type, size: blob.size, w: out.naturalWidth, h: out.naturalHeight };
    URL.revokeObjectURL(url); return r2;
  }, ua);
  expect(r.ok).toBe(true);
  expect(r.type).toBe('image/gif');
  expect(r.size).toBeGreaterThan(0);
  expect(r.w).toBe(480);
  expect(r.h).toBe(300);
});

test('video export produces a WebM blob where supported (else gracefully unsupported)', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate(async (ua) => {
    if (!timelapseVideoSupported()) return { supported: false };
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    // ~0.5s clip: 16s gap at 32× → short real-time recording
    const s = { id: 's', date: iso(T), endedAt: iso(T + 16000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 16000) }] }] };
    let progressed = 0;
    const blob = await renderWorkoutTimelapseVideo(s, { speed: 32, chapters: ['spotlight'] }, () => { progressed++; });
    if (!blob) return { supported: true, made: false };
    return { supported: true, made: true, type: blob.type, size: blob.size, progressed };
  }, ua);
  if (!r.supported) { test.skip(true, 'MediaRecorder/captureStream not available in this engine'); return; }
  expect(r.made).toBe(true);
  expect(r.type).toContain('video/');
  expect(r.size).toBeGreaterThan(0);
  expect(r.progressed).toBeGreaterThan(0);
});
