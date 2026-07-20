// feat 443 — every exercise printed on the gym's cable machine charts is in the catalogue:
// the Life Fitness Cable Motion Dual Adjustable Pulley poster and the Freemotion CHEST /
// SHOULDER / LAT towers. Some were already covered (fly, lateral raise, rotations, wood chop…);
// this pins the whole chart, old entries and new ones alike.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

// [chart label, id of the variation that covers it]
const CHART = [
  // Life Fitness dual adjustable pulley — chest / back / shoulders
  ['LF Chest Press', 'cable-chest-press'],
  ['LF Seated Chest Press', 'cable-seated-chest-press'],
  ['LF Incline Press', 'cable-incline-press'],
  ['LF Decline Press', 'cable-decline-press'],
  ['LF Fly', 'cable-fly-mid'],
  ['LF High Row', 'cable-high-row'],
  ['LF Row', 'lf-dual-pulley-row'],
  ['LF Rear Deltoid', 'cable-rear-delt-fly'],
  ['LF Shoulder Press', 'cable-shoulder-press'],
  ['LF Lateral Raise', 'cable-lateral'],
  ['LF Internal Rotation', 'cable-internal-rotation'],
  ['LF External Rotation', 'cable-external-rotation'],
  // …core / lower body / alternate
  ['LF Kneeling Crunch', 'cable-crunch'],
  ['LF Romanian Dead Lift', 'cable-rdl'],
  ['LF Core Rotation', 'cable-core-rotation'],
  ['LF Incline Rotation', 'cable-reverse-chop'],
  ['LF Decline Rotation', 'cable-wood-chop'],
  ['LF Squat', 'cable-squat'],
  ['LF Hip Adduction', 'cable-adduction'],
  ['LF Hip Abduction', 'standing-hip-abduction'],
  ['LF Hip Flexion', 'cable-hip-flexion'],
  ['LF Hip Extension', 'cable-kickback'],
  ['LF Lunge With Bar', 'cable-lunge'],
  ['LF Golf Swing', 'cable-golf-swing'],
  // Freemotion CHEST tower
  ['FM Chest Press', 'cable-chest-press'],
  ['FM Pec Fly', 'freemotion-chest-fly'],
  ['FM Incline/Decline Press', 'cable-incline-press'],
  ['FM Unsupported Alternating Arm Press', 'cable-alt-chest-press'],
  ['FM Alternating Press w/ Rotation', 'cable-alt-press-rotation'],
  // Freemotion SHOULDER tower
  ['FM Shoulder Press', 'cable-shoulder-press'],
  ['FM 1-Arm Shoulder Press', 'cable-1arm-shoulder-press'],
  ['FM Unsupported Shoulder Press', 'cable-standing-shoulder-press'],
  ['FM 1-Arm 1-Leg Shoulder Press', 'cable-1arm-1leg-shoulder-press'],
  // Freemotion LAT tower
  ['FM Lat Pull Down', 'freemotion-pulldown'],
  ['FM 1-Arm Pull Down', 'single-arm-pulldown'],
  ['FM Standing Alternating Pull Down', 'freemotion-alt-pulldown'],
  ['FM Standing 1-Arm Pull Down', 'freemotion-standing-1arm-pulldown'],
  ['FM Standing 1-Arm Pull Down w/ Rotation', 'freemotion-1arm-pulldown-rotation'],
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('feat 443 — every cable-chart exercise is trackable', async ({ page }) => {
  const missing = await page.evaluate((ids) => {
    const have = new Set();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => have.add(v.id)));
    return ids.filter(([, id]) => !have.has(id)).map(([label, id]) => label + ' → ' + id);
  }, CHART);
  expect(missing).toEqual([]);
});

test('feat 443 — the new entries are fully documented in the reference', async ({ page }) => {
  const bad = await page.evaluate(() => {
    const news = EXTRA_VARIATIONS.filter(e => /^b1a100(1[a-f]|2[0-9a-d])-/.test(e.uuid));
    const out = [];
    news.forEach(ev => {
      const ex = exercises.find(e => e.id === ev.movementId);
      const rv = ex && (ex.variations || []).find(v => v.uuid === ev.uuid);
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) out.push(ev.id);
      if (!VAR_INDEX.has(ev.uuid)) out.push(ev.id + ' (not indexed)');
    });
    return { out, count: news.length };
  });
  expect(bad.count).toBe(20);
  expect(bad.out).toEqual([]);
});
