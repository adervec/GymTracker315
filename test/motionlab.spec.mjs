// feat 473 — MOTION LAB, the motion-generation submodule. An audit found 370 of 1481 variations rendering
// a figure that contradicts their own title (seated shown standing, single-arm shown two-arm, preacher curls
// free-standing, KB swings gripping a static bar…). Cross-template mechanisms now live in ONE pipeline
// (motionApplyMods) driven by opts, detected from titles in _motionMods — so every template gains each
// mechanism at once and NEW content gets them for free. This spec is the standing guard: chunk 1 covers
// seat · kneel/half-kneel · uni · alt · support · swing. Chunk 2 (feat 474): the rotation template
// (chops, twists, halos, Pallof, Russian twists) and the overhead carry — checked below.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof motionApplyMods === 'function' && typeof motionForVariation === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// The chunk-1 contract: a title matching the pattern must resolve with the opt set.
// Mirrors _motionMods deliberately — the point is that the FULL resolution chain (including MOTION_VARS
// overrides, which merge mods) delivers the opt, not that the regex exists.
const MECHS = [
  { key: 'uni', re: /single.?arm|one.?arm|\b1.?arm\b|\barcher\b|unilateral/i },
  { key: 'alt', re: /alternat/i },
  { key: 'kneel', re: /kneel/i },
  { key: 'seat', re: /\bseated\b|\bsitting\b/i },
  { key: 'support', re: /preacher|spider curl|concentration curl|bayesian|blaster/i },
  { key: 'swing', re: /\bswings?\b/i },
];

test('feat 473 — every flagged variation resolves with its mechanism opt (the audit stays clean)', async ({ page }) => {
  const r = await page.evaluate((mechs) => {
    const misses = [];
    let flagged = 0;
    FAMILIES.forEach(f => (f.variations || []).forEach(v => {
      if (!v.uuid || (typeof isSuppressedVar === 'function' && isSuppressedVar(v.uuid))) return;
      const mv = motionForVariation(v.uuid);
      if (!mv) return;
      mechs.forEach(m => {
        if (!new RegExp(m.re.src, 'i').test(v.title)) return;
        flagged++;
        if (!mv.opts || !mv.opts[m.key]) misses.push(m.key + ': ' + f.id + '/' + v.id + ' :: ' + v.title);
      });
    }));
    return { flagged, misses };
  }, MECHS.map(m => ({ key: m.key, re: { src: m.re.source } })));
  expect(r.flagged, 'the sweep found real work').toBeGreaterThan(100);
  expect(r.misses).toEqual([]);
});

test('feat 473 — seat folds the figure onto a drawn bench, and the load rides along', async ({ page }) => {
  const r = await page.evaluate(() => {
    const plain = motionPoseShapes('biceps-curl', 'side', 0.5, 'dumbbell', undefined, {});
    const seated = motionPoseShapes('biceps-curl', 'side', 0.5, 'dumbbell', undefined, { seat: 1 });
    const hipY = ps => Math.max(...ps.shapes.filter(s => s.t === 'path').map(() => 0)) || 0;
    // benches are fig-bench class shapes; the body drop is visible in the head circle position
    const head = ps => ps.shapes.find(s => s.t === 'circle' && s.cls && /fig-head/.test(s.cls));
    const bench = ps => ps.shapes.some(s => s.cls && /fig-bench/.test(s.cls));
    const load = ps => ps.shapes.filter(s => s.t === 'circle' && s.cls === 'fig-db').map(s => s.c[1]);
    // front view too — the seated fold must exist where the template has no side view
    const latPlain = motionPoseShapes('lateral-raise', 'front', 0.5, 'dumbbell', undefined, {});
    const latSeat = motionPoseShapes('lateral-raise', 'front', 0.5, 'dumbbell', undefined, { seat: 1 });
    return {
      benchPlain: bench(plain), benchSeat: bench(seated),
      headDrop: (head(seated) && head(plain)) ? head(seated).c[1] - head(plain).c[1] : null,
      loadDrop: (load(seated)[0] != null && load(plain)[0] != null) ? load(seated)[0] - load(plain)[0] : null,
      latBench: bench(latSeat) && !bench(latPlain),
    };
  });
  expect(r.benchPlain, 'no bench on the standing curl').toBe(false);
  expect(r.benchSeat, 'the seated curl draws its bench').toBe(true);
  expect(r.headDrop, 'the body actually sits down').toBeGreaterThan(10);
  expect(r.loadDrop, 'the dumbbell moves WITH the hand — not left floating at standing height')
    .toBeGreaterThan(10);
  expect(r.latBench, 'front-view-only templates seat too').toBe(true);
});

test('feat 473 — uni hangs the far arm; alt runs it at the opposite phase', async ({ page }) => {
  const r = await page.evaluate(() => {
    const arms = ps => ps.shapes.length && null; // shapes are flat — measure via a rebuilt J instead
    const build = (o, u) => { const m = MOTIONS['biceps-curl']; const res = m.build('side', u == null ? 0.8 : u, 'dumbbell', figP(), o); motionApplyMods(m, 'biceps-curl', 'side', res, o, u == null ? 0.8 : u, 'dumbbell', figP()); return res.J; };
    const both = build({});
    const uni = build({ uni: 1 });
    const alt = build({ alt: 1 });
    const far = J => J.arms.find(a => a.dim), near = J => J.arms.find(a => !a.dim);
    const wrGap = J => Math.abs(far(J).wr[1] - near(J).wr[1]);
    return {
      bothGap: wrGap(both),                                     // mirrored arms — wrists nearly level
      uniFarHangs: far(uni).wr[1] - far(uni).sh[1],             // hanging wrist is well below the shoulder
      uniGap: wrGap(uni),
      altGap: wrGap(alt),                                       // opposite phase — wrists far apart
    };
  });
  expect(r.bothGap, 'baseline: both arms move together').toBeLessThan(6);
  expect(r.uniFarHangs, 'the non-working arm hangs from the shoulder').toBeGreaterThan(24);
  expect(r.uniGap, 'so the wrists separate').toBeGreaterThan(8);
  expect(r.altGap, 'alternating: the far arm is at 1-u, not mirroring').toBeGreaterThan(15);
});

test('feat 473 — the preacher pad exists and pins the elbow through the rep', async ({ page }) => {
  const r = await page.evaluate(() => {
    const el = (o, u) => { const m = MOTIONS['biceps-curl']; const res = m.build('side', u, 'dumbbell', figP(), o); return res.J.arms.find(a => !a.dim).el; };
    const pad = o => motionPoseShapes('biceps-curl', 'side', 0.5, 'dumbbell', undefined, o).shapes.some(s => s.cls && /fig-pad/.test(s.cls));
    const drift = o => { const a = el(o, 0.05), b = el(o, 0.95); return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    return { padPlain: pad({}), padSup: pad({ support: 1 }), driftPlain: drift({}), driftSup: drift({ support: 1 }) };
  });
  expect(r.padPlain).toBe(false);
  expect(r.padSup, 'the pad is drawn').toBe(true);
  expect(r.driftSup, 'a pinned elbow does not travel').toBeLessThan(0.5);
  expect(r.driftPlain, 'more than the pinned one, at least').toBeGreaterThan(r.driftSup * 2);
});

test('feat 473 — a swing is a pendulum: horizontal at the top of the float, hanging in the hinge', async ({ page }) => {
  const r = await page.evaluate(() => {
    const wrOf = (o, u) => { const m = MOTIONS.hinge; const res = m.build('side', u, 'kettlebell', figP(), o); const J = res.J; return { wr: J.arms[0].wr, sh: J.shC }; };
    const top = wrOf({ swing: 1 }, 0), bottom = wrOf({ swing: 1 }, 1);
    const dlTop = wrOf({}, 0);
    return {
      topReach: top.wr[0] - top.sh[0],                 // arms out FRONT at the top
      topLevel: Math.abs(top.wr[1] - top.sh[1]),       // ~shoulder height
      bottomBelow: bottom.wr[1] - bottom.sh[1],        // hanging under the shoulders in the hinge
      dlIsNotSwing: Math.abs(dlTop.wr[0] - dlTop.sh[0]),
    };
  });
  expect(r.topReach, 'top of the float: arms horizontal in front').toBeGreaterThan(25);
  expect(r.topLevel).toBeLessThan(8);
  expect(r.bottomBelow, 'bottom: a free pendulum under the shoulders').toBeGreaterThan(25);
  expect(r.dlIsNotSwing, 'the deadlift grip stays on the bar path').toBeLessThan(10);
});

test('feat 473 — kneeling reposes the legs in side AND front views, body and load moving together', async ({ page }) => {
  const r = await page.evaluate(() => {
    const run = (mid, view, o) => motionPoseShapes(mid, view, 0.5, 'dumbbell', undefined, o);
    const headY = ps => ps.shapes.find(s => s.t === 'circle' && s.cls && /fig-head/.test(s.cls)).c[1];
    const side = headY(run('vertical-press', 'side', { kneel: 'half' })) - headY(run('vertical-press', 'side', {}));
    const front = headY(run('lateral-raise', 'front', { kneel: 1 })) - headY(run('lateral-raise', 'front', {}));
    const dbY = ps => { const c = ps.shapes.filter(s => s.t === 'circle' && s.cls === 'fig-db'); return c.length ? c[0].c[1] : null; };
    const loadDrop = dbY(run('lateral-raise', 'front', { kneel: 1 })) - dbY(run('lateral-raise', 'front', {}));
    return { side, front, loadDrop };
  });
  expect(r.side, 'side-view kneel lowers the body').toBeGreaterThan(10);
  expect(r.front, 'front-view kneel lowers the body').toBeGreaterThan(10);
  expect(r.loadDrop, 'and the load follows').toBeGreaterThan(10);
});

test('feat 474 — rotational movements resolve to the rotation template, not a crunch or generic pull', async ({ page }) => {
  const r = await page.evaluate(() => {
    const misses = [], hits = [];
    const RE = /wood.?chop|chop|russian twist|halo|around.the.world|pallof|golf swing|landmine 180/i;
    FAMILIES.forEach(f => (f.variations || []).forEach(v => {
      if (!v.uuid || (typeof isSuppressedVar === 'function' && isSuppressedVar(v.uuid))) return;
      if (!RE.test(v.title)) return;
      const mv = motionForVariation(v.uuid);
      if (!mv) return;
      (mv.motion === 'rotation' ? hits : misses).push(f.id + '/' + v.id + ' → ' + mv.motion);
    }));
    // and the template itself distinguishes its planes — chop, twist, halo, Pallof, floor-seated twist
    const wrAt = (o, u) => { const ps = MOTIONS.rotation.build('front', u, 'dumbbell', figP(), o); return ps.J.arms[1].wr; };
    const chop0 = wrAt({ plane: 'diag' }, 0), chop1 = wrAt({ plane: 'diag' }, 1);
    const twist0 = wrAt({ plane: 'mid' }, 0), twist1 = wrAt({ plane: 'mid' }, 1);
    const halo0 = wrAt({ orbit: 1 }, 0), haloQ = wrAt({ orbit: 1 }, 0.25);
    const pall0 = wrAt({ iso: 1 }, 0), pall5 = wrAt({ iso: 1 }, 0.5);
    const seat = MOTIONS.rotation.build('front', 0.5, 'dumbbell', figP(), { seatFloor: 1 });
    return { misses, hitCount: hits.length,
      chopDropsAndCrosses: chop1[1] - chop0[1] > 30 && chop1[0] - chop0[0] > 30,
      twistLevel: Math.abs(twist1[1] - twist0[1]) < 2 && twist1[0] - twist0[0] > 30,
      haloOrbits: Math.abs(halo0[1] - haloQ[1]) > 3 && Math.abs(halo0[0] - haloQ[0]) > 5,
      pallofHolds: Math.abs(pall0[1] - pall5[1]) < 2 && Math.abs(pall0[0] - pall5[0]) < 12,
      russianSitsOnFloor: seat.J.hipC[1] > 100 };
  });
  expect(r.misses).toEqual([]);
  expect(r.hitCount, 'the rotation class is a real class').toBeGreaterThan(15);
  expect(r.chopDropsAndCrosses, 'a chop travels high→low ACROSS the body').toBe(true);
  expect(r.twistLevel, 'a twist stays level').toBe(true);
  expect(r.haloOrbits, 'a halo orbits the head').toBe(true);
  expect(r.pallofHolds, 'a Pallof press-out barely moves — anti-rotation').toBe(true);
  expect(r.russianSitsOnFloor, 'a Russian twist sits on the floor').toBe(true);
});

test('feat 474 — waiter and overhead carries lock the load out overhead', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = id => { for (const [uuid, i] of VAR_INDEX) if (i.variation.id === id) return uuid; return null; };
    const mv = id => motionForVariation(u(id));
    const wrVs = o => { const ps = MOTIONS.carry.build('side', 0.5, 'kettlebell', figP(), o); const a = ps.J.arms.find(x => !x.dim); return a.wr[1] - a.sh[1]; };
    return { waiter: mv('overhead-carry'), plate: mv('plate-overhead-carry'),
      overheadWr: wrVs({ overhead: 1 }), farmerWr: wrVs({}) };
  });
  expect(r.waiter.motion).toBe('carry');
  expect(r.waiter.opts.overhead, 'Overhead Carry / Waiter Walk carries overhead').toBe(1);
  expect(r.waiter.opts.uni, 'a waiter walk is one-handed').toBe(1);
  expect(r.plate.opts.overhead).toBe(1);
  expect(r.overheadWr, 'the working wrist is ABOVE the shoulder').toBeLessThan(-20);
  expect(r.farmerWr, 'a farmer carry hangs below it').toBeGreaterThan(20);
});

test('feat 475 — chunk 3: leg raises, get-ups, nordics, rack positions and wall sits resolve and pose right', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = id => { for (const [uuid, i] of VAR_INDEX) if (i.variation.id === id) return uuid; return null; };
    const mv = id => motionForVariation(u(id));
    const build = (mid, o, uu) => MOTIONS[mid].build('side', uu, 'none', figP(), o);
    // resolution: the title routes land on the new templates
    const routes = {
      hangRaise: mv('hanging-leg-raise'), vup: mv('v-up'), t2b: mv('toes-to-bar'),
      getup: mv('turkish-get-up'), nordic: mv('nordic-curl'), wall: mv('wall-squat-iso'),
      front: mv('front-squat'), zercher: mv('zercher-squat'), ohs: mv('overhead-squat'),
      upright: mv('plate-upright-row'), btn: mv('machine-bn-press'), hang: mv('dead-hang'),
    };
    // poses: the geometry claims that make each one ITSELF
    const lr0 = build('leg-raise', { hang: 1 }, 0).J, lr1 = build('leg-raise', { hang: 1 }, 1).J;
    const gu0 = build('getup', {}, 0).J, gu1 = build('getup', {}, 1).J;
    const no0 = build('nordic', {}, 0).J, no1 = build('nordic', {}, 1).J;
    const sqWall = build('squat', { wall: 1 }, 0.1);
    const sqOH = build('squat', { rack: 'overhead' }, 0.5).J;
    const sqBack = build('squat', {}, 0.5).J;
    const legAng = J => { const l = J.legs[1]; return Math.atan2(l.an[1] - l.hip[1], l.an[0] - l.hip[0]); };
    return { routes,
      legsSweep: legAng(lr0) - legAng(lr1),                       // hanging legs travel a big arc
      guTorsoRises: gu0.shC[1] - gu1.shC[1],                      // the get-up torso comes UP
      guArmVertical: Math.abs(gu1.arms[1].wr[0] - gu1.shC[0]),    // loaded arm stays over the shoulder
      noFalls: no1.shC[0] - no0.shC[0],                           // the nordic body travels forward
      noKneesFixed: Math.abs(build('nordic', {}, 1).J.legs[1].kn[0] - build('nordic', {}, 0).J.legs[1].kn[0]),
      wallDrawn: sqWall.behind.some(sh => sh.cls === 'fig-wall'),
      ohAboveShoulder: sqOH.arms[0].wr[1] - sqOH.shC[1],          // overhead rack: wrist ABOVE the shoulder
      backBehindNeck: sqBack.arms[0].wr[1] - sqBack.shC[1] };
  });
  Object.entries(r.routes).forEach(([k, v]) => expect(v, k).toBeTruthy());
  expect(r.routes.hangRaise.motion).toBe('leg-raise');
  expect(r.routes.hangRaise.opts.hang).toBe(1);
  expect(r.routes.vup.opts.fold, 'a V-up folds the torso too').toBe(1);
  expect(r.routes.t2b.opts.hang).toBe(1);
  expect(r.routes.getup.motion).toBe('getup');
  expect(r.routes.nordic.motion).toBe('nordic');
  expect(r.routes.wall.motion).toBe('squat');
  expect(r.routes.wall.opts.wall).toBe(1);
  expect(r.routes.wall.opts.tempo, 'a wall sit is a hold').toBe('hold');
  expect(r.routes.front.opts.rack).toBe('front');
  expect(r.routes.zercher.opts.rack).toBe('zercher');
  expect(r.routes.ohs.opts.rack).toBe('overhead');
  expect(r.routes.upright.motion).toBe('shrug');
  expect(r.routes.upright.opts.upright).toBe(1);
  expect(r.routes.btn.opts.behind, 'BTN press runs behind the head').toBe(1);
  expect(r.routes.hang.motion).toBe('pull-up');
  expect(r.routes.hang.opts.tempo).toBe('hold');
  expect(r.legsSweep, 'the hanging raise sweeps a real arc').toBeGreaterThan(0.9);
  expect(r.guTorsoRises, 'the get-up rises').toBeGreaterThan(20);
  expect(r.guArmVertical, 'with the load locked out overhead').toBeLessThan(6);
  expect(r.noFalls, 'the nordic falls forward').toBeGreaterThan(30);
  expect(r.noKneesFixed, 'from FIXED knees').toBeLessThan(1);
  expect(r.wallDrawn).toBe(true);
  expect(r.ohAboveShoulder, 'overhead squat: bar above the shoulder').toBeLessThan(-18);
  expect(r.backBehindNeck, 'back squat grip stays at the shoulder').toBeGreaterThan(-8);
});
