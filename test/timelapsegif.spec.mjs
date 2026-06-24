// feat 345 — workout timelapse GIF export. A 32×-speed animated recap of one workout (title card, one frame
// per logged set, closing summary), encoded by a self-contained GIF89a/LZW encoder. These specs exercise the
// pure frame-plan builder, the encoder's structure + a real round-trip decode through Chromium (proves the LZW
// is correct), the full canvas render, and the export-dialog gating (GIF only for a single workout).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildWorkoutTimelapse === 'function' && typeof encodeGif89a === 'function'
    && typeof renderWorkoutTimelapseGif === 'function' && typeof VAR_INDEX !== 'undefined', null, { timeout: 15000 });
});

// two distinct real variation uuids
const twoUuids = (page) => page.evaluate(() => {
  const out = []; for (const [u] of VAR_INDEX) { out.push(u); if (out.length === 2) break; } return out;
});

test('buildWorkoutTimelapse: title first, final last, one frame per set in time order, 32× delays', async ({ page }) => {
  const [ua, ub] = await twoUuids(page);
  const r = await page.evaluate(([ua, ub]) => {
    const T = Date.parse('2026-06-20T10:00:00.000Z');
    const iso = ms => new Date(ms).toISOString();
    const session = { id: 's', date: iso(T), endedAt: iso(T + 70000), exercises: [
      { varUuid: ua, subUuid: null, sets: [ { w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 32000) } ] },
      { varUuid: ub, subUuid: null, sets: [ { w: 50, r: 8, ts: iso(T + 64000) } ] },
    ] };
    const p = buildWorkoutTimelapse(session, { speed: 32 });
    const kinds = p.frames.map(f => f.kind);
    const setFrames = p.frames.filter(f => f.kind === 'set');
    return {
      width: p.width, height: p.height, speed: p.speed, synthetic: p.synthetic, totalSets: p.totalSets,
      firstKind: kinds[0], lastKind: kinds[kinds.length - 1], setCount: setFrames.length,
      setNos: setFrames.map(f => f.setNo), cumVols: setFrames.map(f => f.cumVolume),
      // gap set1->set2 is 32s; at 32× that's 1.0s = 100 centiseconds
      firstGapDelay: setFrames[0].delayCs, progressLast: setFrames[setFrames.length - 1].progress,
      titleVol: p.frames[0].totalVolume,
    };
  }, [ua, ub]);
  expect(r.width).toBe(480);
  expect(r.height).toBe(270);
  expect(r.speed).toBe(32);
  expect(r.synthetic).toBe(false);
  expect(r.totalSets).toBe(3);
  expect(r.firstKind).toBe('title');
  expect(r.lastKind).toBe('final');
  expect(r.setCount).toBe(3);
  expect(r.setNos).toEqual([1, 2, 3]);
  expect(r.cumVols).toEqual([500, 1000, 1400]); // 100×5, +100×5, +50×8
  expect(r.firstGapDelay).toBe(100);            // 32s ÷ 32 = 1.0s
  expect(r.progressLast).toBeCloseTo(1, 5);
  expect(r.titleVol).toBe(1400);
});

test('buildWorkoutTimelapse: untimed sets fall back to an evenly-spread synthetic timeline', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00.000Z');
    const session = { id: 's', date: new Date(T).toISOString(), endedAt: new Date(T + 600000).toISOString(),
      exercises: [{ varUuid: ua, subUuid: null, sets: [ { w: 100, r: 5 }, { w: 100, r: 4 }, { w: 100, r: 3 } ] }] };
    const p = buildWorkoutTimelapse(session);
    const setFrames = p.frames.filter(f => f.kind === 'set');
    const elapsed = setFrames.map(f => f.elapsedLabel);
    return { synthetic: p.synthetic, setCount: setFrames.length, elapsed };
  }, ua);
  expect(r.synthetic).toBe(true);
  expect(r.setCount).toBe(3);
  // spread across the 10-min session → strictly increasing elapsed clocks
  expect(r.elapsed[0]).not.toBe(r.elapsed[2]);
});

test('buildWorkoutTimelapse: a marathon session is evenly sampled with an honest note, totals stay exact', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00.000Z');
    const sets = []; for (let i = 0; i < 50; i++) sets.push({ w: 100, r: 10, ts: new Date(T + i * 30000).toISOString() });
    const session = { id: 's', date: new Date(T).toISOString(), endedAt: new Date(T + 50 * 30000).toISOString(),
      exercises: [{ varUuid: ua, subUuid: null, sets }] };
    const p = buildWorkoutTimelapse(session, { maxSetFrames: 10 });
    const setFrames = p.frames.filter(f => f.kind === 'set');
    return { setCount: setFrames.length, note: p.sampledNote, lastCum: setFrames[setFrames.length - 1].cumVolume };
  }, ua);
  expect(r.setCount).toBe(10);
  expect(r.note).toBe('showing 10 of 50 sets');
  expect(r.lastCum).toBe(50 * 100 * 10); // cumulative reflects the FULL 50 sets even though sampled
});

test('buildWorkoutTimelapse: a workout with no strength sets yields an empty plan', async ({ page }) => {
  const empty = await page.evaluate(() => {
    const s = { id: 's', date: new Date().toISOString(), exercises: [{ varUuid: 'x', sets: [], cardio: { elapsedMin: 30 } }] };
    const p = buildWorkoutTimelapse(s);
    return { empty: !!p.empty, frames: p.frames.length };
  });
  expect(empty.empty).toBe(true);
  expect(empty.frames).toBe(0);
});

test('encodeGif89a emits a well-formed GIF89a (header, global table, loop ext, trailer)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bytes = encodeGif89a({ width: 4, height: 2, palette: [[255, 0, 0], [0, 128, 255]],
      frames: [{ indices: new Uint8Array([0, 0, 0, 0, 1, 1, 1, 1]), delayCs: 50 }], loop: 0 });
    const sig = String.fromCharCode(...bytes.slice(0, 6));
    const ascii = String.fromCharCode(...bytes);
    return { sig, w: bytes[6] | (bytes[7] << 8), h: bytes[8] | (bytes[9] << 8),
      hasNetscape: ascii.indexOf('NETSCAPE2.0') !== -1, trailer: bytes[bytes.length - 1] };
  });
  expect(r.sig).toBe('GIF89a');
  expect(r.w).toBe(4);
  expect(r.h).toBe(2);
  expect(r.hasNetscape).toBe(true);
  expect(r.trailer).toBe(0x3B);
});

test('GIF round-trips through the browser decoder pixel-exact (LZW is correct)', async ({ page }) => {
  const r = await page.evaluate(async () => {
    // top row red (idx 0), bottom row blue (idx 1)
    const bytes = encodeGif89a({ width: 4, height: 2, palette: [[255, 0, 0], [0, 128, 255]],
      frames: [{ indices: new Uint8Array([0, 0, 0, 0, 1, 1, 1, 1]), delayCs: 10 }], loop: 0 });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode failed')); img.src = url; });
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, 4, 2).data;
    const px = (x, y) => { const o = (y * 4 + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    URL.revokeObjectURL(url);
    return { w: img.naturalWidth, h: img.naturalHeight, topLeft: px(0, 0), bottomRight: px(3, 1) };
  });
  expect(r.w).toBe(4);
  expect(r.h).toBe(2);
  expect(r.topLeft).toEqual([255, 0, 0]);
  expect(r.bottomRight).toEqual([0, 128, 255]);
});

test('renderWorkoutTimelapseGif produces a loadable image/gif at the planned dimensions', async ({ page }) => {
  const [ua, ub] = await twoUuids(page);
  const r = await page.evaluate(async ([ua, ub]) => {
    const T = Date.parse('2026-06-20T10:00:00.000Z');
    const iso = ms => new Date(ms).toISOString();
    const session = { id: 's', date: iso(T), endedAt: iso(T + 90000), exercises: [
      { varUuid: ua, subUuid: null, sets: [ { w: 135, r: 5, ts: iso(T) }, { w: 135, r: 5, ts: iso(T + 40000) } ] },
      { varUuid: ub, subUuid: null, sets: [ { w: 60, r: 10, ts: iso(T + 80000) } ] },
    ] };
    const blob = await renderWorkoutTimelapseGif(session);
    if (!blob) return { ok: false };
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('gif failed to decode')); img.src = url; });
    const out = { ok: true, type: blob.type, size: blob.size, w: img.naturalWidth, h: img.naturalHeight };
    URL.revokeObjectURL(url);
    return out;
  }, [ua, ub]);
  expect(r.ok).toBe(true);
  expect(r.type).toBe('image/gif');
  expect(r.size).toBeGreaterThan(0);
  expect(r.w).toBe(480);
  expect(r.h).toBe(270);
});

test('export dialog offers the GIF button for a single workout but not for a multi-workout range', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate(async (ua) => {
    const iso = (d, h) => new Date(Date.parse(d) + (h || 0) * 3600000).toISOString();
    const mk = (day) => ({ id: 's' + day, date: iso(day + 'T10:00:00.000Z'), endedAt: iso(day + 'T10:00:00.000Z', 1),
      exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(day + 'T10:00:00.000Z') }] }] });
    const one = mk('2026-06-20');
    const div = document.createElement('div'); document.body.appendChild(div);
    await renderExportPhaseB(div, { preset: 'session', sessionDate: one.date }, [one]);
    const hasSingle = !!div.querySelector('#export-dl-gif');
    const div2 = document.createElement('div'); document.body.appendChild(div2);
    await renderExportPhaseB(div2, { preset: 'week' }, [mk('2026-06-20'), mk('2026-06-19')]);
    const hasMulti = !!div2.querySelector('#export-dl-gif');
    div.remove(); div2.remove();
    return { hasSingle, hasMulti };
  }, ua);
  expect(r.hasSingle).toBe(true);
  expect(r.hasMulti).toBe(false);
});
