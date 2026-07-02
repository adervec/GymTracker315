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
  expect(Object.keys(r)).toEqual(expect.arrayContaining(['bench-press', 'biceps-curl', 'lat-pulldown'])); // feat 412 added many more
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

test('feat 408/412 — motionForVariation: bespoke dev set + family templates with per-variation equipment', async ({ page }) => {
  const ids = ['bb-flat-bench', 'db-flat-bench', 'bb-curl', 'db-curl', 'standard-pulldown'];
  const uuids = {};
  for (const id of ids) uuids[id] = await uuidOf(page, id);
  const r = await page.evaluate((u) => {
    const vOf = (fam, vid) => (FAMILIES.find(f => f.id === fam).variations.find(v => v.id === vid) || {}).uuid;
    return {
      bb: motionForVariation(u['bb-flat-bench']), db: motionForVariation(u['db-flat-bench']),
      curl: motionForVariation(u['bb-curl']), dcurl: motionForVariation(u['db-curl']),
      pull: motionForVariation(u['standard-pulldown']),
      rope: motionForVariation(vOf('lat-pulldown', 'rope-pulldown')),           // family template + title-inferred cable
      goblet: motionForVariation(vOf('squat', FAMILIES.find(f => f.id === 'squat').variations.find(v => /goblet/i.test(v.title)).id)),
      incline: motionForVariation(vOf('incline-bench-press', 'bb-incline')),    // tilt opts ride along
      template: motionForVariation(vOf('workout-templates', 'ppl')),            // plan templates are NOT movements
      none: motionForVariation(null),
    };
  }, uuids);
  expect(r.bb).toEqual({ motion: 'bench-press', equip: 'barbell', opts: null });
  expect(r.db).toEqual({ motion: 'bench-press', equip: 'dumbbell', opts: null });
  expect(r.curl).toEqual({ motion: 'biceps-curl', equip: 'barbell', opts: null });
  expect(r.dcurl).toEqual({ motion: 'biceps-curl', equip: 'dumbbell', opts: null });
  expect(r.pull).toEqual({ motion: 'lat-pulldown', equip: 'cable', opts: null });
  expect(r.rope).toEqual({ motion: 'lat-pulldown', equip: 'cable', opts: null });
  expect(r.goblet.motion).toBe('squat');
  expect(r.goblet.equip).toBe('kettlebell');       // "Goblet" in the title wins over the family's barbell default
  expect(r.incline.opts).toEqual({ tilt: 18 });    // incline bench = the bench motion tilted head-up
  expect(r.template).toBeNull();
  expect(r.none).toBeNull();
});

// feat 413 — Roc-It (and every other seated machine press/row/back-ext) renders as a seated STATION, not a
// free-weight motion: weight stack, seat + pads, pivoting lever — and the Roc-It rocking seat.
test('feat 413 — Roc-It exercises are seated machines with the rocking seat; Smith stays on the bench', async ({ page }) => {
  const r = await page.evaluate(() => {
    const vOf = id => { for (const f of FAMILIES) for (const v of (f.variations || [])) if (v.id === id) return v.uuid; return null; };
    const mv = id => motionForVariation(vOf(id));
    const cls = ps => ps.shapes.map(s => s.cls || '').join(' ');
    const flat = mv('roc-it-flat-press');
    const stage = motionPoseShapes(flat.motion, 'side', 0.5, flat.equip, undefined, flat.opts);
    const rocked = JSON.stringify(motionPoseShapes('machine-press', 'side', 0, 'machine', undefined, { rock: 1 }).shapes);
    const still = JSON.stringify(motionPoseShapes('machine-press', 'side', 0, 'machine', undefined, {}).shapes);
    return {
      flat, incline: mv('roc-it-incline-press'), decline: mv('roc-it-decline-press'),
      shoulder: mv('roc-it-shoulder-press'), row: mv('roc-it-row'), backExt: mv('roc-it-back-extension'),
      fixed: mv('fixed-chest-press'), mts: mv('mts-chest-press'), smith: mv('smith-flat-bench'),
      stationParts: ['fig-stack', 'fig-pad', 'fig-arm-lever'].every(c => cls(stage).includes(c)),
      rocks: rocked !== still,
    };
  });
  expect(r.flat).toEqual({ motion: 'machine-press', equip: 'machine', opts: { rock: 1 } });
  expect(r.incline).toEqual({ motion: 'machine-press', equip: 'machine', opts: { rock: 1, angle: 35 } });
  expect(r.decline).toEqual({ motion: 'machine-press', equip: 'machine', opts: { rock: 1, angle: -18 } });
  expect(r.shoulder).toEqual({ motion: 'machine-press', equip: 'machine', opts: { rock: 1, angle: 70 } });
  expect(r.row).toEqual({ motion: 'machine-row', equip: 'machine', opts: { rock: 1 } });
  expect(r.backExt).toEqual({ motion: 'machine-back-ext', equip: 'machine', opts: { rock: 1 } });
  expect(r.fixed.motion).toBe('machine-press');    // every seated machine press benefits, not just Roc-It
  expect(r.mts.motion).toBe('machine-press');
  expect(r.smith.motion).toBe('bench-press');      // a Smith bench IS a lying bench press on rails
  expect(r.stationParts).toBe(true);               // stack + pads + pivoting lever are drawn
  expect(r.rocks).toBe(true);                      // the Roc-It seat actually rocks
});

// feat 414 — careful redo of every 'machine'-titled variation: each renders an actual STATION (stack /
// pads / levers / rails / sled / cable), except Smith machines which are deliberately the free-weight
// motion (they still show the bar + rack/rail scene).
test('feat 414 — every machine-titled variation draws its station; brand names imply machines', async ({ page }) => {
  const r = await page.evaluate(() => {
    const STATION = /fig-(stack|pad|arm-lever|tower|rail|sled|cable|wheel|crank|bench)/;
    const noStation = [];
    for (const f of FAMILIES) for (const v of (f.variations || [])) {
      if (!/machine/i.test(v.title) || /smith/i.test(v.title) || !v.uuid) continue;
      const mv = motionForVariation(v.uuid);
      if (!mv) { noStation.push(v.id + ': unresolved'); continue; }
      const views = MOTIONS[mv.motion].views;
      const ok = views.some(view => motionPoseShapes(mv.motion, view, 0.5, mv.equip, undefined, mv.opts).shapes.some(s => STATION.test(s.cls || '')));
      if (!ok) noStation.push(v.id + ' -> ' + mv.motion);
    }
    const vOf = id => { for (const f of FAMILIES) for (const v of (f.variations || [])) if (v.id === id) return v.uuid; return null; };
    const mv = id => motionForVariation(vOf(id));
    return {
      noStation,
      rocCurl: mv('roc-it-biceps-curl').motion, rocRev: mv('roc-it-reverse-curl').motion,
      pecDeck: mv('pec-deck').motion, abd: mv('hip-abduction'), add: mv('hip-adduction-machine'),
      kick: mv('lifefitness-glute-kickback').motion, triMach: mv('lifefitness-triceps-extension').motion,
      torso: mv('lifefitness-torso-rotation').motion, revHyper: mv('reverse-hyper-machine').motion,
      lfPreacherHammer: mv('lifefitness-preacher-hammer').motion, rocDip: mv('roc-it-dip'),
      cableCurlLoad: motionPoseShapes('biceps-curl', 'side', 0.5, 'cable').shapes.some(s => (s.cls || '') === 'fig-bar'),
    };
  });
  expect(r.noStation).toEqual([]);                      // no machine exercise renders bare-handed anymore
  expect(r.rocCurl).toBe('machine-curl');
  expect(r.rocRev).toBe('machine-curl');
  expect(r.pecDeck).toBe('pec-deck');
  expect(r.abd.motion).toBe('machine-abduction'); expect(r.abd.opts).toEqual({ dir: 1 });
  expect(r.add.motion).toBe('machine-abduction'); expect(r.add.opts).toEqual({ dir: -1 });
  expect(r.kick).toBe('machine-kickback');
  expect(r.triMach).toBe('machine-triceps');
  expect(r.torso).toBe('machine-crunch');
  expect(r.revHyper).toBe('reverse-hyper');
  expect(r.lfPreacherHammer).toBe('machine-curl');      // brand name (Life Fitness) implies the machine
  expect(r.rocDip).toEqual({ motion: 'machine-press', equip: 'machine', opts: { rock: 1, angle: -50 } });
  expect(r.cableCurlLoad).toBe(true);                   // cable curls hold a handle, not a barbell plate
});

// feat 415 — the animation matches the variation's BRIEF: paused work dwells at the bottom, iso work holds,
// eccentric work lowers slowly, grip/stance width shows, and bench specials reshape their scene.
test('feat 415 — brief modifiers: pause/hold/slow tempo, grip width, floor/Larsen/Spoto/deficit specials', async ({ page }) => {
  const r = await page.evaluate(() => {
    const vOf = id => { for (const f of FAMILIES) for (const v of (f.variations || [])) if (v.id === id) return v.uuid; return null; };
    const mv = id => motionForVariation(vOf(id));
    const P = 2400;
    return {
      paused: mv('paused-bench').opts, spoto: mv('spoto-press').opts, floor: mv('floor-press').opts,
      larsen: mv('larsen-press').opts, close: mv('close-grip-bench').opts, widePull: mv('wide-grip-pulldown').opts,
      isoCurl: mv('isometric-curl-hold').opts, negatives: (mv('eccentric-pullup') || mv('negative-pullup') || motionForVariation((FAMILIES.find(f => f.id === 'pull-up').variations.find(v => /eccentric|negative/i.test(v.title)) || {}).uuid)).opts,
      deficit: mv('deficit-push-up'),                       // cross-listed push-up animates as a push-up
      benchPushup: mv('push-up').motion,
      // the tempo clock: paused dwells at the bottom through mid-cycle; hold stays contracted; slow is still descending at mid
      dwell: [motionStageU(0.45 * P, 'pause'), motionStageU(0.55 * P, 'pause')],
      plain45: motionStageU(0.45 * P),
      holdMin: motionStageU(0, 'hold'),
      slowMid: motionStageU(0.5 * P, 'slow'),
      // geometry follows: close-grip pulldown wrists sit inside wide-grip wrists
      differs: JSON.stringify(motionPoseShapes('lat-pulldown', 'back', 0.5, 'cable', undefined, { grip: 0.68 }).shapes)
        !== JSON.stringify(motionPoseShapes('lat-pulldown', 'back', 0.5, 'cable', undefined, { grip: 1.3 }).shapes),
      floorLighter: motionPoseShapes('bench-press', 'side', 0.5, 'barbell', undefined, { floor: 1 }).shapes.length
        < motionPoseShapes('bench-press', 'side', 0.5, 'barbell').shapes.length, // no bench, no rack on the floor press
      badge: motionPanelHtml(vOf('paused-bench')).includes('pause at bottom') && motionPanelHtml(vOf('paused-bench')).includes('data-tempo="pause"'),
    };
  });
  expect(r.paused).toEqual({ tempo: 'pause' });
  expect(r.spoto).toEqual({ tempo: 'pause', stopShort: 1 });
  expect(r.floor).toEqual({ floor: 1 });
  expect(r.larsen).toEqual({ legsUp: 1 });
  expect(r.close).toEqual({ grip: 0.68 });
  expect(r.widePull).toEqual({ grip: 1.3 });
  expect(r.isoCurl).toEqual({ tempo: 'hold' });
  expect(r.negatives).toEqual({ tempo: 'slow' });
  expect(r.deficit.motion).toBe('push-up');
  expect(r.deficit.opts).toEqual({ deficit: 1 });
  expect(r.benchPushup).toBe('push-up');
  expect(r.dwell[0]).toBeCloseTo(1, 5);        // THE PAUSE: bottom position held across mid-cycle
  expect(r.dwell[1]).toBeCloseTo(1, 5);
  expect(r.plain45).toBeLessThan(1);           // an unmodified rep is still moving there
  expect(r.holdMin).toBeGreaterThanOrEqual(0.86);
  expect(r.slowMid).toBeLessThan(0.95);        // slow eccentric: still on the way down at mid-cycle
  expect(r.differs).toBe(true);
  expect(r.floorLighter).toBe(true);
  expect(r.badge).toBe(true);
});

// feat 416 — bodyweight designation: variations without a loading tool (per the feat-223 equipment solver)
// train empty-handed; loaded carries/holds and band work keep their load; and NO template draws a phantom
// plate/dumbbell/kettlebell for a bodyweight variation in any view.
test('feat 416 — bodyweight exercises are designated as such and render empty-handed', async ({ page }) => {
  const r = await page.evaluate(() => {
    const eqOf = t => { for (const f of FAMILIES) for (const v of (f.variations || [])) if (v.title === t) return motionForVariation(v.uuid).equip; return null; };
    const phantoms = [];
    for (const f of FAMILIES) for (const v of (f.variations || [])) {
      if (!v.uuid) continue;
      const mv = motionForVariation(v.uuid);
      if (!mv || mv.equip !== 'none') continue;
      for (const view of MOTIONS[mv.motion].views) {
        const bad = motionPoseShapes(mv.motion, view, 0.5, 'none', undefined, mv.opts).shapes.some(s => /fig-(plate|db|kb)/.test(s.cls || ''));
        if (bad) phantoms.push(f.id + '/' + v.id + '@' + view);
      }
    }
    return {
      phantoms,
      wallSit: eqOf('Wall Sit (Iso Squat)'), invRow: eqOf('Inverted Row (BW)'), muscleUp: eqOf('Muscle-Up'),
      farmers: eqOf("Farmer's Walk"), isoCurl: eqOf('Isometric Curl Hold'),
      band: eqOf('Band Lateral Raise'),
    };
  });
  expect(r.phantoms).toEqual([]);        // no bodyweight variation holds a phantom weight in any view
  expect(r.wallSit).toBe('none');
  expect(r.invRow).toBe('none');
  expect(r.muscleUp).toBe('none');
  expect(r.farmers).toBe('kettlebell');  // loaded carries keep their load — the solver's null just means "no setup tool"
  expect(r.isoCurl).toBe('barbell');     // loaded holds too
  expect(r.band).toBe('band');           // bands have no setup tool but ARE the load
});

// feat 412 — every variation of every exercise family animates (plan-template families excluded).
test('feat 412 — full coverage: every exercise variation resolves to a motion and every template renders', async ({ page }) => {
  const r = await page.evaluate(() => {
    const EXCLUDE = new Set(['workout-templates', 'session-templates', 'benchmark-wods', 'warmup-templates']);
    let covered = 0, missing = [];
    for (const f of FAMILIES) {
      if (EXCLUDE.has(f.id)) continue;
      for (const v of (f.variations || [])) if (v.uuid) { if (motionForVariation(v.uuid)) covered++; else missing.push(f.id + '/' + v.id); }
    }
    const bad = [];
    for (const mid of Object.keys(MOTIONS)) {
      for (const view of MOTIONS[mid].views) for (const u of [0, 0.5, 1]) {
        try { const ps = motionPoseShapes(mid, view, u, 'dumbbell'); if (!ps || !ps.shapes.length) bad.push(mid + '/' + view + '@' + u); }
        catch (e) { bad.push(mid + '/' + view + '@' + u + ': ' + e.message); }
      }
      const a = JSON.stringify(motionPoseShapes(mid, MOTIONS[mid].views[0], 0, 'dumbbell').shapes);
      const b = JSON.stringify(motionPoseShapes(mid, MOTIONS[mid].views[0], 1, 'dumbbell').shapes);
      if (a === b) bad.push(mid + ': does not animate');
    }
    return { covered, missing, bad, motions: Object.keys(MOTIONS).length };
  });
  expect(r.missing).toEqual([]);            // 100% of exercise variations covered
  expect(r.covered).toBeGreaterThan(750);
  expect(r.bad).toEqual([]);                // every template × view × phase builds and animates
  expect(r.motions).toBeGreaterThanOrEqual(30);
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
    // feat 412 — every rendered variation with a motion gets a stage
    const expected = [...document.querySelectorAll('#panel-reference .variation')].filter(el => motionForVariation(el.dataset.uuid)).length;
    return {
      stageCount: stages.length, expected,
      hasSvg: f0.includes('<svg') && f0.includes('fig-torso'),
      animates: f0 !== f1,
      pills,
      switched: pullPanel.querySelector('.motion-stage').dataset.view === 'side' && sideBtn.classList.contains('active'),
      loopArmed: typeof _motionRaf !== 'undefined',
    };
  });
  expect(r.stageCount).toBe(r.expected); // feat 412 — one animated stage per covered variation (700+)
  expect(r.expected).toBeGreaterThan(700);
  expect(r.hasSvg).toBe(true);
  expect(r.animates).toBe(true);       // rep phase 0 vs 1 renders different frames
  expect(r.pills).toEqual(['Back', 'Side']);
  expect(r.switched).toBe(true);
});

// feat 410 — head/foot cues (cap, face, shoes), muscle-shaped silhouettes, and activation colour.
test('feat 410 — cap, facial features and shoes orient the figure; the anatomy outline stays undecorated', async ({ page }) => {
  const r = await page.evaluate(() => {
    const cls = ps => ps.shapes.map(s => s.cls || '').join(' ');
    const benchSide = cls(motionPoseShapes('bench-press', 'side', 0.5, 'barbell'));
    const curlFront = motionPoseShapes('biceps-curl', 'front', 0.5, 'barbell');
    const pullBack = cls(motionPoseShapes('lat-pulldown', 'back', 0.5, 'cable'));
    const anat = anatomyOutline(50);
    return {
      benchDeco: ['fig-cap', 'fig-eye', 'fig-nose', 'fig-shoe'].every(c => benchSide.includes(c)),
      curlEyes: curlFront.shapes.filter(s => (s.cls || '') === 'fig-eye').length,
      curlMouth: cls(curlFront).includes('fig-mouth'),
      backNoFace: pullBack.includes('fig-cap') && !pullBack.includes('fig-eye'), // seen from behind: cap, no eyes
      anatClean: !/fig-cap|fig-eye|fig-shoe|fig-act/.test(anat) && !anat.includes('hsla'),
    };
  });
  expect(r.benchDeco).toBe(true);
  expect(r.curlEyes).toBe(2);
  expect(r.curlMouth).toBe(true);
  expect(r.backNoFace).toBe(true);
  expect(r.anatClean).toBe(true);   // heatmap figure keeps the avatar's own hat/hair system, no motion decorations
});

test('feat 410 — limbs and trunk are muscle-shaped (curved bellies), not rectangles', async ({ page }) => {
  const r = await page.evaluate(() => {
    const side = motionPoseShapes('biceps-curl', 'side', 0.5, 'barbell');
    const arm = side.shapes.find(s => (s.cls || '').includes('fig-arm'));
    const torso = side.shapes.find(s => (s.cls || '').includes('fig-torso'));
    return { armCurved: /Q /.test(arm.d), torsoCurved: /Q /.test(torso.d), standingCurved: /55 Q/.test(figStandingTorsoPath(50, figDefaultP()).replace(/\s+/g, ' ')) || (figStandingTorsoPath(50, figDefaultP()).match(/Q/g) || []).length >= 6 };
  });
  expect(r.armCurved).toBe(true);       // biceps belly bows the segment sides
  expect(r.torsoCurved).toBe(true);     // chest/waist curve through the strip
  expect(r.standingCurved).toBe(true);  // the anatomy torso got pec bulge / waist pinch / hip flare curves
});

test('feat 410 — working muscles glow with colour, scaled by rep position and placed at the right zone', async ({ page }) => {
  const r = await page.evaluate(() => {
    const alphaOf = col => col ? +col.match(/([\d.]+)\)$/)[1] : null;
    const upArmFill = (mid, view, u) => alphaOf(motionPoseShapes(mid, view, u, 'barbell').shapes.find(s => (s.cls || '').includes('fig-arm')).fillCol);
    const curlLo = upArmFill('biceps-curl', 'side', 0.05), curlHi = upArmFill('biceps-curl', 'side', 1);
    const bench = motionPoseShapes('bench-press', 'side', 1, 'barbell');
    const pull = motionPoseShapes('lat-pulldown', 'back', 1, 'cable');
    const curl = motionPoseShapes('biceps-curl', 'front', 1, 'barbell');
    const zones = ps => ps.shapes.filter(s => (s.cls || '') === 'fig-act');
    const legs = bench.shapes.filter(s => (s.cls || '').includes('fig-leg'));
    return {
      curlLo, curlHi,
      benchZones: zones(bench).length, pullZones: zones(pull).length, curlZones: zones(curl).length,
      pullZoneLowerThanBench: zones(pull)[0].c[1] > 48 + (100 - 48) * 0.3, // lats sit mid-back, pecs up top
      legsUnlit: legs.every(s => !s.fillCol),
    };
  });
  expect(r.curlHi).toBeGreaterThan(r.curlLo);  // activation pulses toward contraction
  expect(r.curlLo).toBeGreaterThan(0);
  expect(r.benchZones).toBe(2);                // bilateral pec glow
  expect(r.pullZones).toBe(2);                 // bilateral lat glow
  expect(r.curlZones).toBe(0);                 // curls light the arms, not the trunk
  expect(r.pullZoneLowerThanBench).toBe(true);
  expect(r.legsUnlit).toBe(true);
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
  expect(r.mv).toEqual({ motion: 'bench-press', equip: 'barbell', opts: null });
  expect(r.phases).toEqual([0, 1]);    // alternating rep extremes survive
  expect(r.painted).toBeGreaterThan(200); // the volumetric figure + bench + plates hit the canvas
});
