// feat 346/347 — timelapse wizard: the GIF export is a single PARALLEL composite where every selected segment
// (Set spotlight, Cumulative log, Wireframe, Timeline, Plan steps, Heart rate) renders side-by-side on one image
// advancing through a shared clock — no more watching segments in series. Speeds run 32×…1024×. These specs cover
// the composite frame plan, panel gating, the grid layout, speed, the pose mapping, the full render, and the wizard UI.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildWorkoutTimelapse === 'function' && typeof renderTimelapseWizard === 'function'
    && typeof tlPose === 'function' && typeof tlLayout === 'function' && typeof renderWorkoutTimelapseGif === 'function'
    && typeof VAR_INDEX !== 'undefined', null, { timeout: 15000 });
});

const twoUuids = (page) => page.evaluate(() => { const o = []; for (const [u] of VAR_INDEX) { o.push(u); if (o.length === 2) break; } return o; });

test('default panels stay spotlight-only (back-compat) and carry exercise colours', async ({ page }) => {
  const [ua, ub] = await twoUuids(page);
  const r = await page.evaluate(([ua, ub]) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 70000), exercises: [
      { varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 32000) }] },
      { varUuid: ub, subUuid: null, sets: [{ w: 50, r: 8, ts: iso(T + 64000) }] } ] };
    const p = buildWorkoutTimelapse(s);
    return { panels: p.panels, kinds: [...new Set(p.frames.map(f => f.kind))], exRgbCount: p.exRgbs.length, w: p.width, h: p.height };
  }, [ua, ub]);
  expect(r.panels).toEqual(['spotlight']);
  expect(r.kinds).toContain('composite');
  expect(r.kinds).not.toContain('divider'); // segments are parallel now — no series dividers
  expect(r.exRgbCount).toBe(2);
  expect(r.w).toBe(480);
  expect(r.h).toBe(300);
});

test('all selected segments render in parallel on each composite (smooth, no series)', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 70000), exercises: [
      { varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 32000) }, { w: 100, r: 4, ts: iso(T + 64000) }] } ] };
    const p = buildWorkoutTimelapse(s, { chapters: ['spotlight', 'cumulative', 'wireframe', 'timeline'] });
    const comp = p.frames.filter(f => f.kind === 'composite');
    const last = comp[comp.length - 1];
    const phases = [...new Set(comp.map(f => f.panels.wireframe.phase))].sort();
    const distinctSets = new Set(comp.map(f => f.setNo)).size;
    return { panels: p.panels, dividers: p.frames.filter(f => f.kind === 'divider').length, compCount: comp.length, distinctSets,
      firstHasAll: ['spotlight', 'cumulative', 'wireframe', 'timeline'].every(k => !!comp[0].panels[k]),
      cumLastItems: last.panels.cumulative.items.length, cumLastHot: last.panels.cumulative.items.slice(-1)[0].hot,
      tlLastShown: last.panels.timeline.evs.length, tlAll: last.panels.timeline.all, phases };
  }, ua);
  expect(r.panels).toEqual(['spotlight', 'cumulative', 'wireframe', 'timeline']);
  expect(r.dividers).toBe(0);            // parallel, not series
  expect(r.compCount).toBeGreaterThan(3); // tweened between the 3 set keyframes → smooth
  expect(r.distinctSets).toBe(3);
  expect(r.firstHasAll).toBe(true);      // every panel present on the SAME frame
  expect(r.cumLastItems).toBe(3);
  expect(r.cumLastHot).toBe(true);
  expect(r.tlLastShown).toBe(3);
  expect(r.tlAll).toBe(3);
  expect(r.phases).toEqual([0, 1]);      // wireframe alternates rep phase frame-to-frame
});

test('tlLayout sizes the canvas to the panel count (1→480×300, 6→760×430)', async ({ page }) => {
  const r = await page.evaluate(() => ({
    one: tlLayout(1), two: tlLayout(2), four: tlLayout(4), six: tlLayout(6),
  }));
  expect([r.one.W, r.one.H]).toEqual([480, 300]);
  expect([r.two.W, r.two.H]).toEqual([640, 300]);
  expect([r.four.W, r.four.H]).toEqual([640, 430]);
  expect([r.six.W, r.six.H]).toEqual([760, 430]);
  expect(r.six.cells.length).toBe(6);
});

test('plan panel is gated, then checks steps off as the workout progresses', async ({ page }) => {
  const [ua, ub] = await twoUuids(page);
  const r = await page.evaluate(([ua, ub]) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const free = { id: 'f', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 30000) }] }] };
    const gatedOff = buildWorkoutTimelapse(free, { chapters: ['plan'] }).panels; // no plan → dropped → fallback

    state.plans = [{ id: 'PL1', name: 'Day A', rev: 1, revisions: [{ rev: 1, at: iso(T) }], steps: [
      { id: 'st1', sets: 2, options: [{ type: 'variation', uuid: ua }] },
      { id: 'st2', sets: 1, options: [{ type: 'variation', uuid: ub }] } ] }];
    const s = { id: 's', date: iso(T), endedAt: iso(T + 90000), planId: 'PL1', planRev: 1, exercises: [
      { varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 30000) }] },
      { varUuid: ub, subUuid: null, sets: [{ w: 50, r: 8, ts: iso(T + 60000) }] } ] };
    const comp = buildWorkoutTimelapse(s, { chapters: ['plan'] }).frames.filter(f => f.kind === 'composite');
    return { gatedOff, hasPlan: !!comp[0].panels.plan, distinctSets: new Set(comp.map(f => f.setNo)).size,
      firstDone: comp[0].panels.plan.done, lastDone: comp[comp.length - 1].panels.plan.done, total: comp[0].panels.plan.total };
  }, [ua, ub]);
  expect(r.gatedOff).toEqual(['spotlight']);
  expect(r.hasPlan).toBe(true);
  expect(r.distinctSets).toBe(3);
  expect(r.total).toBe(2);
  expect(r.lastDone).toBe(2);
  expect(r.lastDone).toBeGreaterThanOrEqual(r.firstDone);
});

test('heart-rate panel is gated on recorded samples, then traces a growing curve', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const noHr = { id: 'n', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 30000) }] }] };
    const gatedOff = buildWorkoutTimelapse(noHr, { chapters: ['hr'] }).panels;

    const hrSamples = []; for (let i = 0; i <= 60; i++) hrSamples.push([i * 1000, 110 + Math.round(20 * Math.sin(i / 6))]);
    const s = { id: 's', date: iso(T), endedAt: iso(T + 60000), hrSamples, exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 30000) }, { w: 100, r: 5, ts: iso(T + 58000) }] }] };
    const comp = buildWorkoutTimelapse(s, { chapters: ['hr'] }).frames.filter(f => f.kind === 'composite');
    const first = comp[0].panels.hr, last = comp[comp.length - 1].panels.hr;
    return { gatedOff, hasHr: !!first, distinctSets: new Set(comp.map(f => f.setNo)).size, firstPts: first.pts.length, lastPts: last.pts.length,
      curOk: last.curBpm >= 80 && last.curBpm <= 150, lo: first.lo, hi: first.hi };
  }, ua);
  expect(r.gatedOff).toEqual(['spotlight']);
  expect(r.hasHr).toBe(true);
  expect(r.distinctSets).toBe(3);
  expect(r.lastPts).toBeGreaterThan(r.firstPts); // the trace fills in as the clock advances
  expect(r.curOk).toBe(true);
  expect(r.hi).toBeGreaterThan(r.lo);
});

test('higher speed makes a shorter clip; 1024× is honoured', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 40000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 32000) }] }] };
    const comp = sp => buildWorkoutTimelapse(s, { speed: sp }).frames.filter(f => f.kind === 'composite');
    const dur = sp => comp(sp).reduce((a, f) => a + f.delayCs, 0);
    return { dur32: dur(32), dur64: dur(64), frames32: comp(32).length, frames1024: comp(1024).length, speed1024: buildWorkoutTimelapse(s, { speed: 1024 }).speed };
  }, ua);
  expect(r.dur64).toBeLessThan(r.dur32);        // 64× → roughly half the playback time
  expect(r.frames32).toBeGreaterThan(r.frames1024); // low speed → more tween frames (smoother)
  expect(r.speed1024).toBe(1024);
});

test('tlPose maps exercise names to movement patterns', async ({ page }) => {
  const r = await page.evaluate(() => ({
    squat: tlPose('Back Squat'), press: tlPose('Barbell Bench Press'), pull: tlPose('Lat Pulldown'),
    curl: tlPose('Dumbbell Bicep Curl'), hinge: tlPose('Romanian Deadlift'), calf: tlPose('Standing Calf Raise'),
    core: tlPose('Plank'), lateral: tlPose('Lateral Raise'),
  }));
  expect(r).toEqual({ squat: 'squat', press: 'press', pull: 'pull', curl: 'curl', hinge: 'hinge', calf: 'calf', core: 'core', lateral: 'press' });
});

test('a full six-panel parallel render (plan + HR) decodes as a 760×430 GIF', async ({ page }) => {
  const [ua, ub] = await twoUuids(page);
  const r = await page.evaluate(async ([ua, ub]) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    state.plans = [{ id: 'PL1', name: 'Day A', rev: 1, revisions: [{ rev: 1, at: iso(T) }], steps: [
      { id: 'st1', sets: 2, options: [{ type: 'variation', uuid: ua }] }, { id: 'st2', sets: 1, options: [{ type: 'variation', uuid: ub }] } ] }];
    const hrSamples = []; for (let i = 0; i <= 90; i++) hrSamples.push([i * 1000, 120 + Math.round(15 * Math.sin(i / 5))]);
    const s = { id: 's', date: iso(T), endedAt: iso(T + 90000), planId: 'PL1', planRev: 1, hrSamples, exercises: [
      { varUuid: ua, subUuid: null, sets: [{ w: 135, r: 5, ts: iso(T) }, { w: 135, r: 5, ts: iso(T + 40000) }] },
      { varUuid: ub, subUuid: null, sets: [{ w: 60, r: 10, ts: iso(T + 80000) }] } ] };
    const chapters = ['spotlight', 'cumulative', 'wireframe', 'timeline', 'plan', 'hr'];
    const dims = buildWorkoutTimelapse(s, { speed: 1024, chapters });
    const blob = await renderWorkoutTimelapseGif(s, { speed: 1024, chapters });
    if (!blob) return { ok: false };
    const url = URL.createObjectURL(blob); const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('gif decode failed')); img.src = url; });
    const out = { ok: true, type: blob.type, size: blob.size, w: img.naturalWidth, h: img.naturalHeight, panels: dims.panels.length };
    URL.revokeObjectURL(url); return out;
  }, [ua, ub]);
  expect(r.ok).toBe(true);
  expect(r.type).toBe('image/gif');
  expect(r.size).toBeGreaterThan(0);
  expect(r.panels).toBe(6);
  expect(r.w).toBe(760);
  expect(r.h).toBe(430);
});

test('the wizard offers 32×…1024× and gates Plan/HR rows by availability', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const bare = { id: 'b', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }] }] };
    const div1 = document.createElement('div'); document.body.appendChild(div1);
    renderTimelapseWizard(div1, { preset: 'session' }, bare, 'wk');
    const rows = div1.querySelectorAll('[data-ch]').length;
    const speeds = [...div1.querySelectorAll('[data-sp]')].map(b => b.dataset.sp);
    const planDisBare = div1.querySelector('[data-ch="plan"]').disabled;
    const hrDisBare = div1.querySelector('[data-ch="hr"]').disabled;
    const hasBuild = !!div1.querySelector('#tl-build');

    state.plans = [{ id: 'PL1', name: 'Day A', rev: 1, revisions: [{ rev: 1, at: iso(T) }], steps: [{ id: 'st1', sets: 1, options: [{ type: 'variation', uuid: ua }] }] }];
    const hrSamples = []; for (let i = 0; i <= 60; i++) hrSamples.push([i * 1000, 120]);
    const rich = { id: 'r', date: iso(T), endedAt: iso(T + 60000), planId: 'PL1', planRev: 1, hrSamples, exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }] }] };
    const div2 = document.createElement('div'); document.body.appendChild(div2);
    renderTimelapseWizard(div2, { preset: 'session' }, rich, 'wk');
    const planDisRich = div2.querySelector('[data-ch="plan"]').disabled;
    const hrDisRich = div2.querySelector('[data-ch="hr"]').disabled;
    const cumBtn = div2.querySelector('[data-ch="cumulative"]');
    const before = cumBtn.textContent.includes('☑'); cumBtn.click();
    const after = div2.querySelector('[data-ch="cumulative"]').textContent.includes('☑');
    const hasGifFmt = !!div1.querySelector('[data-fmt="gif"]');
    const hasAddPhotos = !!div1.querySelector('#tl-add-photos');
    div1.remove(); div2.remove();
    return { rows, speeds, planDisBare, hrDisBare, hasBuild, planDisRich, hrDisRich, toggled: before !== after, hasGifFmt, hasAddPhotos };
  }, ua);
  expect(r.rows).toBe(6);
  expect(r.speeds).toEqual(['32', '64', '128', '256', '512', '1024']);
  expect(r.planDisBare).toBe(true);
  expect(r.hrDisBare).toBe(true);
  expect(r.hasBuild).toBe(true);
  expect(r.planDisRich).toBe(false);
  expect(r.hrDisRich).toBe(false);
  expect(r.toggled).toBe(true);
  expect(r.hasGifFmt).toBe(true);   // format chooser present
  expect(r.hasAddPhotos).toBe(true); // photo splicing entry point present
});

test('state.timelapse is normalized with sane defaults', async ({ page }) => {
  const r = await page.evaluate(() => ({ speed: state.timelapse.speed, spotlight: state.timelapse.chapters.spotlight, hr: state.timelapse.chapters.hr, format: state.timelapse.format, photoSecs: state.timelapse.photoSecs }));
  expect(r.speed).toBe(32);
  expect(r.spotlight).toBe(true);
  expect(r.hr).toBe(false);
  expect(r.format).toBe('gif');
  expect(r.photoSecs).toBe(2.5);
});
