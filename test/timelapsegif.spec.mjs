// feat 345/346 — workout timelapse GIF. A recap of one workout where the selected segments render in PARALLEL on
// one composite image advancing through a single clock (title → one composite per set → final), encoded by a
// self-contained GIF89a/LZW encoder. These specs exercise the composite frame plan, the encoder's structure + a
// real round-trip decode through Chromium (proves the LZW), the full render, and the export-dialog gating.
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

test('buildWorkoutTimelapse: title first, final last, a keyframe per set + smooth tweens between them', async ({ page }) => {
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
    const comp = p.frames.filter(f => f.kind === 'composite');
    const setMap = {}; comp.forEach(f => { if (setMap[f.setNo] == null) setMap[f.setNo] = f.cumVolume; });
    const setNos = Object.keys(setMap).map(Number).sort((a, b) => a - b);
    // tweens: progress (time fraction) is non-decreasing across the whole run
    let mono = true; for (let i = 1; i < comp.length; i++) if (comp[i].progress < comp[i - 1].progress - 1e-9) mono = false;
    return {
      width: p.width, height: p.height, speed: p.speed, synthetic: p.synthetic, totalSets: p.totalSets, panels: p.panels,
      firstKind: kinds[0], lastKind: kinds[kinds.length - 1], compCount: comp.length,
      setNos, cumVols: [setMap[1], setMap[2], setMap[3]], progressLast: comp[comp.length - 1].progress,
      hasSpotlight: !!comp[0].panels.spotlight, titleVol: p.frames[0].totalVolume, mono, frameCount: p.frameCount,
    };
  }, [ua, ub]);
  expect(r.width).toBe(480);   // 1 panel → single-cell canvas
  expect(r.height).toBe(300);
  expect(r.speed).toBe(32);
  expect(r.synthetic).toBe(false);
  expect(r.totalSets).toBe(3);
  expect(r.panels).toEqual(['spotlight']);
  expect(r.firstKind).toBe('title');
  expect(r.lastKind).toBe('final');
  expect(r.compCount).toBeGreaterThan(3);       // tweened → many more frames than sets (smooth)
  expect(r.setNos).toEqual([1, 2, 3]);          // each set still has its own keyframe
  expect(r.cumVols).toEqual([500, 1000, 1400]); // 100×5, +100×5, +50×8 (at each set keyframe)
  expect(r.mono).toBe(true);                    // the clock/progress sweeps smoothly, never jumps back
  expect(r.progressLast).toBeCloseTo(1, 2);
  expect(r.hasSpotlight).toBe(true);
  expect(r.titleVol).toBe(1400);
});

test('buildWorkoutTimelapse: untimed sets fall back to an evenly-spread synthetic timeline', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00.000Z');
    const session = { id: 's', date: new Date(T).toISOString(), endedAt: new Date(T + 600000).toISOString(),
      exercises: [{ varUuid: ua, subUuid: null, sets: [ { w: 100, r: 5 }, { w: 100, r: 4 }, { w: 100, r: 3 } ] }] };
    const p = buildWorkoutTimelapse(session);
    const comp = p.frames.filter(f => f.kind === 'composite');
    const setNos = [...new Set(comp.map(f => f.setNo))].sort((a, b) => a - b);
    return { synthetic: p.synthetic, setNos, elapsedFirst: comp[0].elapsedLabel, elapsedLast: comp[comp.length - 1].elapsedLabel };
  }, ua);
  expect(r.synthetic).toBe(true);
  expect(r.setNos).toEqual([1, 2, 3]);
  expect(r.elapsedFirst).not.toBe(r.elapsedLast);
});

test('buildWorkoutTimelapse: a marathon session is evenly sampled with an honest note, totals stay exact', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00.000Z');
    const sets = []; for (let i = 0; i < 50; i++) sets.push({ w: 100, r: 10, ts: new Date(T + i * 30000).toISOString() });
    const session = { id: 's', date: new Date(T).toISOString(), endedAt: new Date(T + 50 * 30000).toISOString(),
      exercises: [{ varUuid: ua, subUuid: null, sets }] };
    const p = buildWorkoutTimelapse(session, { maxSetFrames: 10 });
    const comp = p.frames.filter(f => f.kind === 'composite');
    const distinctSets = new Set(comp.map(f => f.setNo)).size;
    return { distinctSets, note: p.sampledNote, lastCum: comp[comp.length - 1].cumVolume };
  }, ua);
  expect(r.distinctSets).toBe(10);                // sampled to 10 sets…
  expect(r.note).toBe('showing 10 of 50 sets');
  expect(r.lastCum).toBe(50 * 100 * 10);         // …but cumulative reflects the FULL 50 sets
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
    const dims = buildWorkoutTimelapse(session); // default single panel
    const blob = await renderWorkoutTimelapseGif(session);
    if (!blob) return { ok: false };
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('gif failed to decode')); img.src = url; });
    const out = { ok: true, type: blob.type, size: blob.size, w: img.naturalWidth, h: img.naturalHeight, pw: dims.width, ph: dims.height };
    URL.revokeObjectURL(url);
    return out;
  }, [ua, ub]);
  expect(r.ok).toBe(true);
  expect(r.type).toBe('image/gif');
  expect(r.size).toBeGreaterThan(0);
  expect(r.w).toBe(r.pw);
  expect(r.h).toBe(r.ph);
  expect(r.w).toBe(480);
  expect(r.h).toBe(300);
});

test('Replay is a top-level export option (phase A), enabled only for a single workout', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const iso = (d, h) => new Date(Date.parse(d) + (h || 0) * 3600000).toISOString();
    const mk = (day) => ({ id: 's' + day, date: iso(day + 'T10:00:00.000Z'), endedAt: iso(day + 'T10:00:00.000Z', 1),
      exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(day + 'T10:00:00.000Z') }] }] });
    const one = mk('2026-06-20');
    state.sessions = [one];
    const div = document.createElement('div'); document.body.appendChild(div);
    renderExportPhaseA(div, { opts: { preset: 'session', sessionDate: one.date }, from: '', to: '' });
    const rb = div.querySelector('#export-replay-btn');
    const present = !!rb, enabledSingle = rb && !rb.disabled, label = rb ? rb.textContent.trim() : '';
    // a multi-workout scope disables Replay
    state.sessions = [mk('2026-06-20'), mk('2026-06-19'), mk('2026-06-18')];
    const div2 = document.createElement('div'); document.body.appendChild(div2);
    renderExportPhaseA(div2, { opts: { preset: 'all' }, from: '', to: '' });
    const rb2 = div2.querySelector('#export-replay-btn');
    const disabledMulti = !!(rb2 && rb2.disabled);
    div.remove(); div2.remove();
    return { present, enabledSingle, label, disabledMulti };
  }, ua);
  expect(r.present).toBe(true);
  expect(r.label).toContain('Replay');     // renamed from "GIF"
  expect(r.enabledSingle).toBe(true);
  expect(r.disabledMulti).toBe(true);
});

test('phase B keeps a Replay shortcut for a single workout, not for a range', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate(async (ua) => {
    const iso = (d, h) => new Date(Date.parse(d) + (h || 0) * 3600000).toISOString();
    const mk = (day) => ({ id: 's' + day, date: iso(day + 'T10:00:00.000Z'), endedAt: iso(day + 'T10:00:00.000Z', 1),
      exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(day + 'T10:00:00.000Z') }] }] });
    const one = mk('2026-06-20');
    const div = document.createElement('div'); document.body.appendChild(div);
    await renderExportPhaseB(div, { preset: 'session', sessionDate: one.date }, [one]);
    const hasSingle = !!div.querySelector('#export-replay-b');
    const div2 = document.createElement('div'); document.body.appendChild(div2);
    await renderExportPhaseB(div2, { preset: 'week' }, [mk('2026-06-20'), mk('2026-06-19')]);
    const hasMulti = !!div2.querySelector('#export-replay-b');
    div.remove(); div2.remove();
    return { hasSingle, hasMulti };
  }, ua);
  expect(r.hasSingle).toBe(true);
  expect(r.hasMulti).toBe(false);
});
