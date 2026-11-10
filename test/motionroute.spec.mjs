// feat 556 — the motion figures: every variation is pinned to the right template (MOTION_ROUTE), the keyframe
// templates render, the bent-over templates lean the anatomically possible way, and the placeholders stay small.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof MOTION_ROUTE !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 556 — every pinned route names a real template, and every variation draws in every view', async ({ page }) => {
  const r = await page.evaluate(() => {
    const badRoute = Object.keys(MOTION_ROUTE).filter(id => !MOTIONS[MOTION_ROUTE[id][0]]);
    const broken = [], count = {};
    for (const [u, i] of VAR_INDEX) {
      const m = motionForVariation(u); if (!m) continue;
      count[m.motion] = (count[m.motion] || 0) + 1;
      for (const v of MOTIONS[m.motion].views) for (const x of [0, 0.35, 0.7, 1]) {
        let ok = false;
        try { const ps = motionPoseShapes(m.motion, v, x, m.equip, undefined, m.opts); ok = !!ps && ps.shapes.length > 5 && !/NaN|undefined/.test(figSvg(ps.shapes)); } catch (_) {}
        if (!ok) broken.push(i.variation.title + '@' + v + '/' + x);
      }
    }
    return { badRoute, broken: broken.slice(0, 10), generic: count.generic || 0, mobility: count.mobility || 0, templates: Object.keys(MOTIONS).length };
  });
  expect(r.badRoute).toEqual([]);
  expect(r.broken).toEqual([]);
  expect(r.templates).toBeGreaterThan(95);
  // the two placeholders held 324 variations before this feat; a new family that lands there shows up here
  expect(r.generic, 'variations on the generic placeholder').toBeLessThan(20);
  expect(r.mobility, 'variations on the mobility placeholder').toBeLessThan(50);
});

test('feat 556 — the variations that used to draw the wrong movement now draw their own', async ({ page }) => {
  const r = await page.evaluate(() => {
    const by = {};
    for (const [u, i] of VAR_INDEX) { const m = motionForVariation(u); if (m) by[i.variation.title] = { motion: m.motion, opts: m.opts || {} }; }
    return by;
  });
  expect(r['Seated Cable Row'].motion).toBe('seated-row');
  expect(r['Roman Chair Sit-Up']).toMatchObject({ motion: 'situp', opts: { ghd: 1 } });
  expect(r['Boat Pose (Navasana)']).toMatchObject({ motion: 'lsit', opts: { boat: 1 } });
  expect(r['Straddle L-Sit'].motion).toBe('lsit');
  expect(r['Log Press'].motion).toBe('vertical-press');
  expect(r['Tall-Kneeling Press'].motion).toBe('vertical-press');
  expect(r['Lying Cable Triceps Extension'].motion).toBe('skull');
  expect(r['Hyrox Sled Pull']).toMatchObject({ motion: 'sled', opts: { pull: 1 } });
  expect(r['Mace 360'].motion).toBe('mace');
  expect(r['Foam Roll Quads']).toMatchObject({ motion: 'smash', opts: { at: 'quad' } });
  expect(r['Lying Leg Curl'].motion).toBe('leg-curl');   // a pattern word ("curl") must never out-vote a real family template
  expect(r['Pallof Press'].motion).toBe('rotation');
});

test('feat 556 — bent-over figures lean over their toes, and a keyframe motion has a real middle phase', async ({ page }) => {
  const r = await page.evaluate(() => {
    const J = (m, u, eq, o) => MOTIONS[m].build('side', u, eq || 'barbell', figP(), o || {}).J;
    const lean = (m, u) => { const j = J(m, u), near = j.legs.find(l => !l.dim) || j.legs[0]; return { chest: j.shC[0] - j.hipC[0], knee: near.kn[0] - j.hipC[0] }; };
    const t0 = J('thruster', 0), t5 = J('thruster', 0.5), t1 = J('thruster', 1);
    return { hinge: lean('hinge', 1), squat: lean('squat', 1), row: lean('row', 0.5), oly: lean('oly', 0), rear: lean('rear-delt', 0.5),
      thr: { top: t0.arms[1].wr[1] - t0.shC[1], midHip: t5.hipC[1] - t0.hipC[1], midHands: t5.arms[1].wr[1] - t5.shC[1], lowHip: t1.hipC[1] - t0.hipC[1] } };
  });
  for (const k of ['hinge', 'squat', 'row', 'oly', 'rear']) {
    expect(r[k].chest, k + ': the chest is in front of the hips').toBeGreaterThan(5);
    expect(r[k].knee, k + ': on the same side the knees bend').toBeGreaterThan(0);
  }
  expect(r.thr.top, 'thruster starts locked out overhead').toBeLessThan(-25);
  expect(Math.abs(r.thr.midHip), 'half-way it is STANDING with the bar racked — a third key, not a blend of two').toBeLessThan(1);
  expect(r.thr.midHands).toBeGreaterThan(-8);
  expect(r.thr.lowHip, 'then it sinks into the squat').toBeGreaterThan(15);
});
