// feat 358/359/360 — replay studio: live clock + IG headline/caption + vignette, per-media filters + captions,
// custom music, and spliced VIDEO clips (not just photos).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildWorkoutTimelapse === 'function' && typeof tlFilterCss === 'function'
    && typeof renderWorkoutTimelapseGif === 'function' && typeof VAR_INDEX !== 'undefined', null, { timeout: 15000 });
});

const oneUuid = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) return u; });

test('composites carry a live wall-clock + the title carries the start time', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 60000) }] }] };
    const p = buildWorkoutTimelapse(s, { speed: 32 });
    const comp = p.frames.filter(f => f.kind === 'composite');
    const title = p.frames[0];
    return { hasClock: comp.every(f => typeof f.clockLabel === 'string' && f.clockLabel.length > 0), startClock: title.startClock, distinctClocks: new Set(comp.map(f => f.clockLabel)).size };
  }, ua);
  expect(r.hasClock).toBe(true);
  expect(typeof r.startClock).toBe('string');
  expect(r.distinctClocks).toBeGreaterThan(1); // the wall clock advances through the workout
});

test('style (headline / caption / vignette) threads onto the plan; filters map to CSS', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }] }] };
    const p = buildWorkoutTimelapse(s, { headline: 'BEAST MODE', caption: '@me 💪', vignette: true });
    return { style: p.style, bw: tlFilterCss('bw'), vivid: tlFilterCss('vivid'), none: tlFilterCss('none'), junk: tlFilterCss('nope') };
  }, ua);
  expect(r.style).toEqual({ headline: 'BEAST MODE', caption: '@me 💪', vignette: true });
  expect(r.bw).toContain('grayscale');
  expect(r.vivid).toContain('saturate');
  expect(r.none).toBe('none');
  expect(r.junk).toBe('none');
});

test('a video clip is spliced as a clip frame at its moment; photo filter rides through', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 120000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 120000) }] }] };
    const media = [
      { kind: 'photo', _img: null, elapsedMs: 30000, seconds: 2, filter: 'bw', label: 'warmup' },
      { kind: 'clip', _video: null, elapsedMs: 90000, seconds: 3, filter: 'vivid', label: 'PR!' },
    ];
    const p = buildWorkoutTimelapse(s, { speed: 32, chapters: ['spotlight'], photos: media });
    const photoFr = p.frames.find(f => f.kind === 'photo');
    const clipFr = p.frames.find(f => f.kind === 'clip');
    return {
      hasPhoto: !!photoFr, hasClip: !!clipFr,
      clipDelay: clipFr && clipFr.delayCs, clipLabel: clipFr && clipFr.label,
      photoFilter: p.photos[photoFr.photoIndex].filter, clipFilter: p.photos[clipFr.photoIndex].filter,
      titlePhotoCount: p.frames[0].photoCount,
    };
  }, ua);
  expect(r.hasPhoto).toBe(true);
  expect(r.hasClip).toBe(true);
  expect(r.clipDelay).toBe(300);          // 3s clip → 300 centiseconds
  expect(r.clipLabel).toBe('PR!');
  expect(r.photoFilter).toBe('bw');
  expect(r.clipFilter).toBe('vivid');
  expect(r.titlePhotoCount).toBe(2);
});

test('a filtered photo + headline/caption/vignette render into a decodable GIF', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate(async (ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const pc = document.createElement('canvas'); pc.width = 80; pc.height = 60; const pctx = pc.getContext('2d');
    pctx.fillStyle = '#36a'; pctx.fillRect(0, 0, 80, 60); pctx.fillStyle = '#fc0'; pctx.fillRect(0, 0, 40, 60);
    const img = new Image(); await new Promise(res => { img.onload = res; img.src = pc.toDataURL('image/png'); });
    const s = { id: 's', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 60000) }] }] };
    const media = [{ kind: 'photo', _img: img, elapsedMs: 30000, seconds: 2, filter: 'sepia', label: 'mid-set' }];
    const blob = await renderWorkoutTimelapseGif(s, { speed: 64, chapters: ['spotlight'], photos: media, headline: 'LEG DAY', caption: '@lifter', vignette: true });
    if (!blob) return { ok: false };
    const url = URL.createObjectURL(blob); const out = new Image();
    await new Promise((res, rej) => { out.onload = res; out.onerror = () => rej(new Error('gif decode failed')); out.src = url; });
    const r2 = { ok: true, type: blob.type, w: out.naturalWidth, h: out.naturalHeight }; URL.revokeObjectURL(url); return r2;
  }, ua);
  expect(r.ok).toBe(true);
  expect(r.type).toBe('image/gif');
  expect(r.w).toBe(480);
  expect(r.h).toBe(300);
});

test('a clip with no decodable video still renders a valid GIF (graceful placeholder)', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate(async (ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 60000) }] }] };
    const media = [{ kind: 'clip', _video: null, elapsedMs: 30000, seconds: 2, filter: 'none', label: 'clip' }];
    const blob = await renderWorkoutTimelapseGif(s, { speed: 64, chapters: ['spotlight'], photos: media });
    if (!blob) return { ok: false };
    const url = URL.createObjectURL(blob); const out = new Image();
    await new Promise((res, rej) => { out.onload = res; out.onerror = () => rej(new Error('gif decode failed')); out.src = url; });
    const r2 = { ok: true, w: out.naturalWidth }; URL.revokeObjectURL(url); return r2;
  }, ua);
  expect(r.ok).toBe(true);
  expect(r.w).toBe(480);
});

test('custom music: the video recorder accepts a decodable audio file (best-effort)', async ({ page }) => {
  const ua = await oneUuid(page);
  const r = await page.evaluate(async (ua) => {
    if (!timelapseVideoSupported()) return { skip: true };
    // hand-build a 1s 8kHz mono PCM WAV so decodeAudioData has something real to chew on
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.sin(i / 8 * 2 * Math.PI) * 8000, true);
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 16000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 16000) }] }] };
    const blob = await renderWorkoutTimelapseVideo(s, { speed: 32, chapters: ['spotlight'], music: 'custom', musicFile: buf });
    return { skip: false, made: !!blob, type: blob ? blob.type : '', size: blob ? blob.size : 0 };
  }, ua);
  if (r.skip) { test.skip(true, 'no MediaRecorder'); return; }
  expect(r.made).toBe(true);
  expect(r.type).toContain('video/');
  expect(r.size).toBeGreaterThan(0);
});
