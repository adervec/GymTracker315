// feat 346 — timelapse wizard: the GIF export becomes a multi-segment replay. The wizard offers Set spotlight,
// Cumulative log, Wireframe replay, Timeline, Plan steps (only with a plan) and Heart rate (only with recorded HR),
// plus a 32×/64× speed. These specs cover the chapter-aware frame plan, gating, speed, the pose mapping, the
// full multi-chapter render, and the wizard UI's availability gating.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildWorkoutTimelapse === 'function' && typeof renderTimelapseWizard === 'function'
    && typeof tlPose === 'function' && typeof renderWorkoutTimelapseGif === 'function' && typeof VAR_INDEX !== 'undefined', null, { timeout: 15000 });
});

const twoUuids = (page) => page.evaluate(() => { const o = []; for (const [u] of VAR_INDEX) { o.push(u); if (o.length === 2) break; } return o; });

test('default chapters stay spotlight-only (back-compat) and carry exercise colours', async ({ page }) => {
  const [ua, ub] = await twoUuids(page);
  const r = await page.evaluate(([ua, ub]) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 70000), exercises: [
      { varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 32000) }] },
      { varUuid: ub, subUuid: null, sets: [{ w: 50, r: 8, ts: iso(T + 64000) }] } ] };
    const p = buildWorkoutTimelapse(s);
    return { chapters: p.chapters, kinds: [...new Set(p.frames.map(f => f.kind))], exRgbCount: p.exRgbs.length };
  }, [ua, ub]);
  expect(r.chapters).toEqual(['spotlight']);
  expect(r.kinds).toContain('set');
  expect(r.kinds).not.toContain('divider'); // single chapter → no divider
  expect(r.exRgbCount).toBe(2);
});

test('multiple chapters add dividers and the right per-segment frames', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 70000), exercises: [
      { varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 32000) }, { w: 100, r: 4, ts: iso(T + 64000) }] } ] };
    const p = buildWorkoutTimelapse(s, { chapters: ['spotlight', 'cumulative', 'wireframe', 'timeline'] });
    const by = k => p.frames.filter(f => f.kind === k);
    return { chapters: p.chapters, dividers: by('divider').length, set: by('set').length, cum: by('cumulative').length,
      wire: by('wireframe').length, tl: by('timeline').length,
      cumLastLines: by('cumulative').slice(-1)[0].lines.length, cumLastHot: by('cumulative').slice(-1)[0].lines.slice(-1)[0].hot,
      wirePhases: [...new Set(by('wireframe').map(f => f.phase))].sort(), tlLastAll: by('timeline').slice(-1)[0].evs.length };
  }, ua);
  expect(r.chapters).toEqual(['spotlight', 'cumulative', 'wireframe', 'timeline']);
  expect(r.dividers).toBe(4);          // one per chapter when >1
  expect(r.set).toBe(3);
  expect(r.cum).toBe(3);               // one per set
  expect(r.wire).toBe(6);              // two phases per set
  expect(r.wirePhases).toEqual([0, 1]);
  expect(r.cumLastLines).toBe(3);      // all three sets listed by the end
  expect(r.cumLastHot).toBe(true);     // newest set highlighted
  expect(r.tlLastAll).toBe(3);         // the timeline sweep ends showing every set
});

test('plan chapter is gated, then checks steps off as the workout progresses', async ({ page }) => {
  const [ua, ub] = await twoUuids(page);
  const r = await page.evaluate(([ua, ub]) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const free = { id: 'f', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 30000) }] }] };
    const gatedOff = buildWorkoutTimelapse(free, { chapters: ['plan'] }).chapters; // no plan → dropped → fallback

    state.plans = [{ id: 'PL1', name: 'Day A', rev: 1, revisions: [{ rev: 1, at: iso(T) }], steps: [
      { id: 'st1', sets: 2, options: [{ type: 'variation', uuid: ua }] },
      { id: 'st2', sets: 1, options: [{ type: 'variation', uuid: ub }] } ] }];
    const s = { id: 's', date: iso(T), endedAt: iso(T + 90000), planId: 'PL1', planRev: 1, exercises: [
      { varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 30000) }] },
      { varUuid: ub, subUuid: null, sets: [{ w: 50, r: 8, ts: iso(T + 60000) }] } ] };
    const p = buildWorkoutTimelapse(s, { chapters: ['plan'] });
    const planFrames = p.frames.filter(f => f.kind === 'plan');
    return { gatedOff, hasPlan: p.chapters.includes('plan'), planFrameCount: planFrames.length,
      firstDone: planFrames[0].done, lastDone: planFrames[planFrames.length - 1].done, total: planFrames[0].total };
  }, [ua, ub]);
  expect(r.gatedOff).toEqual(['spotlight']);     // unavailable plan falls back, never a zero-chapter GIF
  expect(r.hasPlan).toBe(true);
  expect(r.planFrameCount).toBe(3);
  expect(r.total).toBe(2);
  expect(r.lastDone).toBe(2);                     // both steps satisfied by the end
  expect(r.lastDone).toBeGreaterThanOrEqual(r.firstDone);
});

test('heart-rate chapter is gated on recorded samples, then traces a growing curve', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const noHr = { id: 'n', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 30000) }] }] };
    const gatedOff = buildWorkoutTimelapse(noHr, { chapters: ['hr'] }).chapters;

    const hrSamples = []; for (let i = 0; i <= 60; i++) hrSamples.push([i * 1000, 110 + Math.round(20 * Math.sin(i / 6))]);
    const s = { id: 's', date: iso(T), endedAt: iso(T + 60000), hrSamples, exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 30000) }, { w: 100, r: 5, ts: iso(T + 58000) }] }] };
    const p = buildWorkoutTimelapse(s, { chapters: ['hr'] });
    const hr = p.frames.filter(f => f.kind === 'hr');
    return { gatedOff, hasHr: p.chapters.includes('hr'), n: hr.length, firstPts: hr[0].pts.length, lastPts: hr[hr.length - 1].pts.length,
      curOk: hr[hr.length - 1].curBpm >= 80 && hr[hr.length - 1].curBpm <= 150, lo: hr[0].lo, hi: hr[0].hi };
  }, ua);
  expect(r.gatedOff).toEqual(['spotlight']);
  expect(r.hasHr).toBe(true);
  expect(r.n).toBeGreaterThan(5);
  expect(r.lastPts).toBeGreaterThan(r.firstPts);  // the trace fills in as the sweep advances
  expect(r.curOk).toBe(true);
  expect(r.hi).toBeGreaterThan(r.lo);
});

test('64× halves the per-set hold versus 32×', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 40000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 32000) }] }] };
    const at = sp => buildWorkoutTimelapse(s, { speed: sp }).frames.filter(f => f.kind === 'set')[0].delayCs;
    return { d32: at(32), d64: at(64), speed64: buildWorkoutTimelapse(s, { speed: 64 }).speed };
  }, ua);
  expect(r.d32).toBe(100); // 32s ÷ 32 = 1.0s
  expect(r.d64).toBe(50);  // 32s ÷ 64 = 0.5s
  expect(r.speed64).toBe(64);
});

test('tlPose maps exercise names to movement patterns', async ({ page }) => {
  const r = await page.evaluate(() => ({
    squat: tlPose('Back Squat'), press: tlPose('Barbell Bench Press'), pull: tlPose('Lat Pulldown'),
    curl: tlPose('Dumbbell Bicep Curl'), hinge: tlPose('Romanian Deadlift'), calf: tlPose('Standing Calf Raise'),
    core: tlPose('Plank'), lateral: tlPose('Lateral Raise'),
  }));
  expect(r).toEqual({ squat: 'squat', press: 'press', pull: 'pull', curl: 'curl', hinge: 'hinge', calf: 'calf', core: 'core', lateral: 'press' });
});

test('a full multi-chapter render (with plan + HR) decodes as a 480×270 GIF', async ({ page }) => {
  const [ua, ub] = await twoUuids(page);
  const r = await page.evaluate(async ([ua, ub]) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    state.plans = [{ id: 'PL1', name: 'Day A', rev: 1, revisions: [{ rev: 1, at: iso(T) }], steps: [
      { id: 'st1', sets: 2, options: [{ type: 'variation', uuid: ua }] }, { id: 'st2', sets: 1, options: [{ type: 'variation', uuid: ub }] } ] }];
    const hrSamples = []; for (let i = 0; i <= 90; i++) hrSamples.push([i * 1000, 120 + Math.round(15 * Math.sin(i / 5))]);
    const s = { id: 's', date: iso(T), endedAt: iso(T + 90000), planId: 'PL1', planRev: 1, hrSamples, exercises: [
      { varUuid: ua, subUuid: null, sets: [{ w: 135, r: 5, ts: iso(T) }, { w: 135, r: 5, ts: iso(T + 40000) }] },
      { varUuid: ub, subUuid: null, sets: [{ w: 60, r: 10, ts: iso(T + 80000) }] } ] };
    const blob = await renderWorkoutTimelapseGif(s, { speed: 64, chapters: ['spotlight', 'cumulative', 'wireframe', 'timeline', 'plan', 'hr'] });
    if (!blob) return { ok: false };
    const url = URL.createObjectURL(blob); const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('gif decode failed')); img.src = url; });
    const out = { ok: true, type: blob.type, size: blob.size, w: img.naturalWidth, h: img.naturalHeight };
    URL.revokeObjectURL(url); return out;
  }, [ua, ub]);
  expect(r.ok).toBe(true);
  expect(r.type).toBe('image/gif');
  expect(r.size).toBeGreaterThan(0);
  expect(r.w).toBe(480);
  expect(r.h).toBe(270);
});

test('the wizard disables Plan/HR rows when unavailable and enables them when present', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    // bare session: no plan, no HR
    const bare = { id: 'b', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }] }] };
    const div1 = document.createElement('div'); document.body.appendChild(div1);
    renderTimelapseWizard(div1, { preset: 'session' }, bare, 'wk');
    const rows = div1.querySelectorAll('[data-ch]').length;
    const planDisBare = div1.querySelector('[data-ch="plan"]').disabled;
    const hrDisBare = div1.querySelector('[data-ch="hr"]').disabled;
    const hasBuild = !!div1.querySelector('#tl-build');
    const hasSpeed = !!div1.querySelector('[data-sp="64"]');

    // rich session: plan + HR available
    state.plans = [{ id: 'PL1', name: 'Day A', rev: 1, revisions: [{ rev: 1, at: iso(T) }], steps: [{ id: 'st1', sets: 1, options: [{ type: 'variation', uuid: ua }] }] }];
    const hrSamples = []; for (let i = 0; i <= 60; i++) hrSamples.push([i * 1000, 120]);
    const rich = { id: 'r', date: iso(T), endedAt: iso(T + 60000), planId: 'PL1', planRev: 1, hrSamples, exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }] }] };
    const div2 = document.createElement('div'); document.body.appendChild(div2);
    renderTimelapseWizard(div2, { preset: 'session' }, rich, 'wk');
    const planDisRich = div2.querySelector('[data-ch="plan"]').disabled;
    const hrDisRich = div2.querySelector('[data-ch="hr"]').disabled;
    // toggling a row flips its checkbox glyph
    const cumBtn = div2.querySelector('[data-ch="cumulative"]');
    const before = cumBtn.textContent.includes('☑');
    cumBtn.click();
    const after = div2.querySelector('[data-ch="cumulative"]').textContent.includes('☑');
    div1.remove(); div2.remove();
    return { rows, planDisBare, hrDisBare, hasBuild, hasSpeed, planDisRich, hrDisRich, toggled: before !== after };
  }, ua);
  expect(r.rows).toBe(6);
  expect(r.planDisBare).toBe(true);
  expect(r.hrDisBare).toBe(true);
  expect(r.hasBuild).toBe(true);
  expect(r.hasSpeed).toBe(true);
  expect(r.planDisRich).toBe(false);
  expect(r.hrDisRich).toBe(false);
  expect(r.toggled).toBe(true);
});

test('state.timelapse is normalized with sane defaults', async ({ page }) => {
  const r = await page.evaluate(() => ({ speed: state.timelapse.speed, spotlight: state.timelapse.chapters.spotlight, hr: state.timelapse.chapters.hr }));
  expect(r.speed).toBe(32);
  expect(r.spotlight).toBe(true);
  expect(r.hr).toBe(false);
});
