// feat 473 — MOTION LAB, the motion-generation submodule. An audit found 370 of 1481 variations rendering
// a figure that contradicts their own title (seated shown standing, single-arm shown two-arm, preacher curls
// free-standing, KB swings gripping a static bar…). Cross-template mechanisms now live in ONE pipeline
// (motionApplyMods) driven by opts, detected from titles in _motionMods — so every template gains each
// mechanism at once and NEW content gets them for free. This spec is the standing guard: chunk 1 covers
// seat · kneel/half-kneel · uni · alt · support · swing. Later chunks extend the mechanism list here.
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
