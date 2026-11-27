// feats 606–609 — live heatmap: off-plan and left-in-plan; archetypes of a workout, a plan and an exercise; the
// exercise's constellation peek; constellation wedges by size; the lean branches filled.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof planArchetype === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 606 — the live heatmap splits off-plan work from what the plan still has to do', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = id => FAMILIES.find(f => f.id === id).variations[0].uuid;
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 'a', sets: 3, options: [{ type: 'movement', familyId: 'flat-bench-press' }] }, { id: 'b', sets: 3, options: [{ type: 'movement', familyId: 'row' }] }] }];
    state.sessions = [{ id: 's', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: fam('flat-bench-press'), sets: [{ w: 100, r: 5 }] }, { varUuid: fam('bicep-curl'), sets: [{ w: 20, r: 10 }, { w: 20, r: 10 }] }] }];
    pending = { varUuid: null, sets: [] };
    const off = planOffPlanMuscleAcc('muscle'), left = planRemainingMuscleAcc('muscle'), so = liveWorkoutMuscleAcc('muscle'), proj = planProjectionMuscleAcc('muscle');
    const sum = a => Object.values(a).reduce((x, y) => x + y, 0);
    _liveHeatMode = 'offplan'; const card = renderLiveHeatmapCard();
    return { off: sum(off), left: sum(left), sofar: sum(so), proj: sum(proj), offChest: off['mid-lower-chest'] || 0, offBi: (off['biceps'] || 0), leftLats: left['lats'] || 0,
      buttons: (card.match(/data-lhm-mode="(left|offplan)"/g) || []).length };
  });
  expect(r.off).toBeCloseTo(2, 5);              // the two curl sets, no plan step asked for them
  expect(r.offChest).toBe(0);
  expect(r.left).toBeCloseTo(5, 5);              // 2 bench + 3 row sets still to do
  expect(r.leftLats).toBeGreaterThan(0);
  expect(r.proj).toBeCloseTo(r.sofar + r.left, 5);
  expect(r.buttons).toBe(2);
});

test('feat 607 — a workout, a plan and an exercise each get an archetype; the report leads the end dialog', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = id => FAMILIES.find(f => f.id === id).variations[0].uuid;
    const heavy = { exercises: [{ varUuid: fam('squat'), sets: Array(5).fill({ w: 300, r: 3 }) }, { varUuid: fam('deadlift'), sets: Array(3).fill({ w: 400, r: 2 }) }] };
    const pump = { exercises: [{ varUuid: fam('lateral-raise'), sets: Array(4).fill({ w: 20, r: 10 }) }, { varUuid: fam('bicep-curl'), sets: Array(4).fill({ w: 30, r: 10 }) }] };
    state.sessions = [{ id: 'x', date: new Date().toISOString(), ...heavy }];
    const html = workoutReportHtml(state.sessions[0]);
    const plan = { steps: [{ sets: 5, load: 'heavy', options: [{ type: 'movement', familyId: 'squat' }] }, { sets: 5, load: 'heavy', options: [{ type: 'movement', familyId: 'deadlift' }] }] };
    return { heavy: sessionArchetype(heavy).primary.id, pump: sessionArchetype(pump).primary.id, plan: planArchetype(plan).primary.id,
      ex: exerciseArchetypes(fam('lateral-raise')).dim, html: /This workout was/.test(html) && /arch-mix/.test(html), empty: workoutReportHtml({ exercises: [] }) };
  });
  expect(r.heavy).toBe('powerlifter');
  expect(r.pump).toBe('bodybuilder');
  expect(r.plan).toBe('powerlifter');
  expect(r.ex).toBe('muscle');
  expect(r.html).toBe(true);
  expect(r.empty).toBe('');
});

test('feat 608 — the Map tab fills on demand with the archetypes and a peek of nearby stars', async ({ page }) => {
  const r = await page.evaluate(() => {
    const u = FAMILIES.find(f => f.id === 'flat-bench-press').variations[0].uuid;
    const html = exerciseMapSlideHtml(u), d = document.createElement('div'); d.innerHTML = html;
    const t0 = performance.now(); constellationNodesCached(); constellationNodesCached(); const cached = performance.now() - t0;
    return { stars: d.querySelectorAll('.cpk-node').length, me: d.querySelectorAll('.cpk-node.me').length, chips: d.querySelectorAll('.cpk-chip').length, arch: d.querySelectorAll('.arch-chip').length, cached };
  });
  expect(r.stars).toBe(25);
  expect(r.me).toBe(1);
  expect(r.chips).toBe(8);
  expect(r.arch).toBeGreaterThanOrEqual(2);
  expect(r.cached).toBeLessThan(400);
});

test('feat 609 — wedges follow arm size, and the lean branches gained real exercises', async ({ page }) => {
  const r = await page.evaluate(() => {
    const C = constellationNodes(), by = {}; C.nodes.forEach(n => (by[n.mega] = by[n.mega] || []).push(n));
    const spread = m => { const a = by[m].map(n => Math.atan2(n.y - C.cy, n.x - C.cx)); return Math.max(...a) - Math.min(...a); };
    const count = id => FAMILIES.find(f => f.id === id).variations.length;
    return { fullWider: spread('full') > spread('jaw'), tri: count('tricep-extension'), ham: count('leg-curl'), calf: count('calf-raise'), jaw: count('jaw-training'), neck: count('neck-training'),
      uuidsUnique: new Set(EXTRA_VARIATIONS.map(v => v.uuid)).size === EXTRA_VARIATIONS.length, katana: !!FAMILIES.find(f => f.id === 'tricep-extension').variations.find(v => v.title === 'Katana Triceps Extension') };
  });
  expect(r.fullWider).toBe(true);
  expect(r.tri).toBeGreaterThanOrEqual(34);
  expect(r.ham).toBeGreaterThanOrEqual(19);
  expect(r.calf).toBeGreaterThanOrEqual(19);
  expect(r.jaw).toBeGreaterThanOrEqual(5);
  expect(r.neck).toBeGreaterThanOrEqual(16);
  expect(r.uuidsUnique).toBe(true);
  expect(r.katana).toBe(true);
});

test('feat 613 — the anatomy chart is drawn in layers, every muscle opens a glossary term, labels follow the top layer', async ({ page }) => {
  const r = await page.evaluate(() => {
    const draw = L => { anatomyCfg().layers = L; const d = document.createElement('div'); d.innerHTML = anatomyLayeredSvg(null); return d; };
    const all = draw({ bone: true, deep: true, surf: true, labels: true }), deep = draw({ bone: true, deep: true, surf: false, labels: true }), bare = draw({ bone: false, deep: false, surf: true, labels: false });
    const terms = new Set(glossary.map(g => g.term));
    const tapTerms = [...all.querySelectorAll('.amus')].map(x => x.dataset.term);
    const lbl = d => [...d.querySelectorAll('.ab-lbl')].map(x => x.textContent);
    return { bones: all.querySelectorAll('.ab-bone').length, deepN: all.querySelectorAll('.amus.ab-deep').length, surfN: all.querySelectorAll('.amus.ab-surf').length,
      unknown: [...new Set(tapTerms.filter(x => !terms.has(x)))], seeThrough: all.querySelector('svg').classList.contains('see-through'),
      deepLabels: lbl(deep), allLabels: lbl(all), bareLabels: bare.querySelectorAll('.ab-lbl').length, bareBones: bare.querySelectorAll('.ab-bone').length, img: !!all.querySelector('img') };
  });
  expect(r.bones).toBeGreaterThan(40);
  expect(r.deepN).toBeGreaterThan(30);
  expect(r.surfN).toBeGreaterThan(80);
  expect(r.unknown).toEqual([]);
  expect(r.seeThrough).toBe(true);
  expect(r.deepLabels).toEqual(expect.arrayContaining(['Pec minor', 'Iliopsoas', 'Supraspinatus', 'Quadratus lumborum']));
  expect(r.allLabels).toEqual(expect.arrayContaining(['Biceps · short head', 'Triceps · lateral head']));
  expect(r.bareLabels).toBe(0);
  expect(r.bareBones).toBe(0);
  expect(r.img).toBe(false);
});
