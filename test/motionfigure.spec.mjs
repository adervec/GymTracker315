// feats 407/408/409 — shared volumetric figure engine + per-variation motion animations.
// One body model (torso polygon + tapered limb capsules, avatar-proportioned) drives the anatomy/heatmap
// outline, the reference motion animations and the timelapse replay figure. MOTIONS carries full parametric
// per-view motions with IK elbows/knees and to-scale equipment for bench press / biceps curl / lat pulldown.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof figBodyShapes === 'function' && typeof MOTIONS !== 'undefined'
    && typeof motionForVariation === 'function' && typeof motionPoseShapes === 'function'
    && typeof anatomyOutline === 'function' && typeof navTo === 'function', null, { timeout: 15000 });
});

const uuidOf = (page, varId) => page.evaluate(id => {
  for (const f of FAMILIES) for (const v of (f.variations || [])) if (v.id === id) return v.uuid;
  return null;
}, varId);

test('feat 407 — the figure engine: IK preserves bone lengths, the body is volumetric capsules', async ({ page }) => {
  const r = await page.evaluate(() => {
    const el = figIk([0, 0], [20, 10], 15, 15, 1);
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const shapes = figBodyShapes(figStandingJoints(50, figDefaultP()), figDefaultP());
    const by = cls => shapes.filter(s => (s.cls || '').includes(cls)).length;
    return {
      l1: d([0, 0], el), l2: d(el, [20, 10]),
      arms: by('fig-arm'), legs: by('fig-leg'), torso: by('fig-torso'), head: shapes.filter(s => s.t === 'circle').length,
      capsulesAreOutlines: shapes.filter(s => (s.cls || '').includes('fig-arm')).every(s => s.t === 'path' && /A \d/.test(s.d)),
    };
  });
  expect(r.l1).toBeCloseTo(15, 0);          // 2-bone IK: both bones keep their length (coords round to 0.1px)
  expect(r.l2).toBeCloseTo(15, 0);
  expect(r.arms).toBe(4);                   // 2 arms × (upper + forearm) capsules
  expect(r.legs).toBe(4);                   // 2 legs × (thigh + shin)
  expect(r.torso).toBe(1);
  expect(r.head).toBe(1);
  expect(r.capsulesAreOutlines).toBe(true); // real width, drawn as wireframe outlines (arc caps)
});

test('feat 407 — heatmaps and the avatar preview ride the same volumetric body; proportions reshape it', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const heat = anatomyHeatmapSvg(heatRegionValues('group', 0));
    const slim = anatomyOutline(50, { ...figDefaultP(), thigh: 0.8, armW: 0.8 });
    const wide = anatomyOutline(50, { ...figDefaultP(), thigh: 1.4, armW: 1.6 });
    return {
      heatVolumetric: heat.includes('fig-arm') && heat.includes('fig-leg') && heat.includes('av-body'),
      regions: (heat.match(/hm-region/g) || []).length > 0,
      reshapes: slim !== wide,
    };
  });
  expect(r.heatVolumetric).toBe(true); // the heat maps show the same arm/leg-width figure as the replay
  expect(r.regions).toBe(true);
  expect(r.reshapes).toBe(true);       // girth/BMI proportions change limb width, not just the torso
});

test('feat 408 — MOTIONS: 3 dev motions, each with the profiles it needs, posed across the whole rep', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const mid of Object.keys(MOTIONS)) {
      const m = MOTIONS[mid];
      out[mid] = { views: m.views.slice(), ok: true, animates: true };
      for (const v of m.views) for (const u of [0, 0.5, 1]) {
        const ps = motionPoseShapes(mid, v, u, 'barbell');
        if (!ps || !ps.shapes.length || !Array.isArray(ps.box)) out[mid].ok = false;
      }
      for (const v of m.views) {
        const a = JSON.stringify(motionPoseShapes(mid, v, 0, 'barbell').shapes);
        const b = JSON.stringify(motionPoseShapes(mid, v, 1, 'barbell').shapes);
        if (a === b) out[mid].animates = false;
      }
    }
    return out;
  });
  expect(Object.keys(r).sort()).toEqual(['bench-press', 'biceps-curl', 'lat-pulldown']);
  expect(r['bench-press'].views).toEqual(['side', 'front']);
  expect(r['biceps-curl'].views).toEqual(['side', 'front']);
  expect(r['lat-pulldown'].views).toEqual(['back', 'side']);
  for (const mid of Object.keys(r)) { expect(r[mid].ok).toBe(true); expect(r[mid].animates).toBe(true); }
});

test('feat 408 — equipment is drawn to match the variation: plates, dumbbells, cable + bench + seat', async ({ page }) => {
  const r = await page.evaluate(() => {
    const cls = ps => ps.shapes.map(s => s.cls || '').join(' ');
    return {
      benchBb: cls(motionPoseShapes('bench-press', 'side', 0.5, 'barbell')),
      benchDb: cls(motionPoseShapes('bench-press', 'side', 0.5, 'dumbbell')),
      benchFront: cls(motionPoseShapes('bench-press', 'front', 0.5, 'barbell')),
      curlFront: cls(motionPoseShapes('biceps-curl', 'front', 0.5, 'barbell')),
      pullBack: cls(motionPoseShapes('lat-pulldown', 'back', 0.5, 'cable')),
      pullSide: cls(motionPoseShapes('lat-pulldown', 'side', 0.5, 'cable')),
    };
  });
  expect(r.benchBb).toContain('fig-plate');      // barbell bench: plate disc in hand, bench + rack under the body
  expect(r.benchBb).toContain('fig-equip');
  expect(r.benchDb).toContain('fig-db');         // dumbbell bench: dumbbells, no barbell plates
  expect(r.benchDb).not.toContain('fig-plate');
  expect(r.benchFront).toContain('fig-bar');     // bar + plates across both hands from above
  expect(r.curlFront).toContain('fig-plate');
  expect(r.pullBack).toContain('fig-cable');     // pulldown: cable from the pulley to a wide bar, seat below
  expect(r.pullBack).toContain('fig-bar');
  expect(r.pullSide).toContain('fig-tower');
  expect(r.pullSide).toContain('fig-cable');
});

test('feat 408 — motionForVariation maps the dev set (equipment-accurate) and nothing else', async ({ page }) => {
  const ids = ['bb-flat-bench', 'db-flat-bench', 'bb-curl', 'db-curl', 'standard-pulldown'];
  const uuids = {};
  for (const id of ids) uuids[id] = await uuidOf(page, id);
  const r = await page.evaluate((u) => ({
    bb: motionForVariation(u['bb-flat-bench']), db: motionForVariation(u['db-flat-bench']),
    curl: motionForVariation(u['bb-curl']), dcurl: motionForVariation(u['db-curl']),
    pull: motionForVariation(u['standard-pulldown']),
    other: motionForVariation((FAMILIES.find(f => f.id === 'lat-pulldown').variations.find(v => v.id === 'rope-pulldown') || {}).uuid),
    none: motionForVariation(null),
  }), uuids);
  expect(r.bb).toEqual({ motion: 'bench-press', equip: 'barbell' });
  expect(r.db).toEqual({ motion: 'bench-press', equip: 'dumbbell' });
  expect(r.curl).toEqual({ motion: 'biceps-curl', equip: 'barbell' });
  expect(r.dcurl).toEqual({ motion: 'biceps-curl', equip: 'dumbbell' });
  expect(r.pull).toEqual({ motion: 'lat-pulldown', equip: 'cable' });
  expect(r.other).toBeNull();
  expect(r.none).toBeNull();
});

test('feat 408 — the full reference embeds an animated motion stage per mapped variation, with view pills', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.refView = 'detailed';
    navTo('reference');
    const stages = [...document.querySelectorAll('#panel-reference .motion-stage')];
    const benchPanel = document.querySelector('.exercise[data-id="ref-flat-bench-press"] .motion-panel');
    const pullPanel = document.querySelector('.exercise[data-id="ref-lat-pulldown"] .motion-panel');
    const pills = pullPanel ? [...pullPanel.querySelectorAll('.motion-view')].map(b => b.textContent) : [];
    // drive the stage directly (the rAF loop only paints visible stages)
    const st = benchPanel.querySelector('.motion-stage');
    motionRenderStage(st, 0); const f0 = st.innerHTML;
    motionRenderStage(st, 1); const f1 = st.innerHTML;
    const sideBtn = pullPanel.querySelector('.motion-view[data-mv="side"]');
    motionSetView(sideBtn);
    return {
      stageCount: stages.length,
      hasSvg: f0.includes('<svg') && f0.includes('fig-torso'),
      animates: f0 !== f1,
      pills,
      switched: pullPanel.querySelector('.motion-stage').dataset.view === 'side' && sideBtn.classList.contains('active'),
      loopArmed: typeof _motionRaf !== 'undefined',
    };
  });
  expect(r.stageCount).toBe(5);        // bb/db bench, bb/db curl, standard pulldown
  expect(r.hasSvg).toBe(true);
  expect(r.animates).toBe(true);       // rep phase 0 vs 1 renders different frames
  expect(r.pills).toEqual(['Back', 'Side']);
  expect(r.switched).toBe(true);
});

test('feat 409 — the timelapse replay uses the same motion (with equipment) for matched exercises', async ({ page }) => {
  const bbUuid = await uuidOf(page, 'bb-flat-bench');
  const r = await page.evaluate((bbUuid) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 70000), exercises: [
      { varUuid: bbUuid, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 105, r: 5, ts: iso(T + 40000) }] } ] };
    const p = buildWorkoutTimelapse(s, { chapters: ['wireframe'] });
    const comp = p.frames.filter(f => f.kind === 'composite');
    // and the canvas renderer actually paints the shared shapes (Path2D path strings)
    const cv = document.createElement('canvas'); cv.width = 220; cv.height = 160;
    const ctx = cv.getContext('2d');
    const mp = motionPoseShapes('bench-press', 'side', 1, 'barbell');
    figCanvas(ctx, mp.shapes, 10, 10, 1.3, '#ffffff');
    const px = ctx.getImageData(0, 0, 220, 160).data;
    let painted = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) painted++;
    return { mv: comp[0].panels.wireframe.mv, phases: [...new Set(comp.map(f => f.panels.wireframe.phase))].sort(), painted };
  }, bbUuid);
  expect(r.mv).toEqual({ motion: 'bench-press', equip: 'barbell' });
  expect(r.phases).toEqual([0, 1]);    // alternating rep extremes survive
  expect(r.painted).toBeGreaterThan(200); // the volumetric figure + bench + plates hit the canvas
});
