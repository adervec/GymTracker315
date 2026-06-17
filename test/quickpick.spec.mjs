// feat 226 — quick-pick plan recommender. Scores plans by available time (estimatePlanMinutes vs a chosen
// budget) and recent-activity freshness (recent per-mega logged-set load → favour under-trained patterns),
// surfaced as a Quick Pick block at the top of the plan picker with time chips + top-3 recommendation cards.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof recommendPlans === 'function' && typeof recentMegaLoad === 'function'
    && typeof planTimeScore === 'function' && typeof openPlansOverlay === 'function', null, { timeout: 15000 });
});

// Two short same-length plans (pure legs, pure push) + a long marathon, plus a recent heavy PUSH session,
// so freshness should float legs above push and the over-budget marathon should sink on time.
const seed = (page) => page.evaluate(() => {
  const by = (m) => { for (const [u, info] of VAR_INDEX) if (info.family.mega === m && exMode(u).mode === 'standard') return u; return null; };
  const push = by('push'), lower = by('lower');
  const step = (u, sets) => ({ id: 's' + Math.random(), sets: sets || 3, options: [{ type: 'variation', uuid: u }] });
  state.plans = [
    { id: 'legs', name: 'Leg Day', desc: 'quads & hams', intensity: 4, steps: [step(lower), step(lower), step(lower)] },
    { id: 'push', name: 'Push Day', desc: 'press', intensity: 4, steps: [step(push), step(push), step(push)] },
    { id: 'marathon', name: 'Marathon', desc: 'everything', intensity: 5, steps: [step(push, 6), step(push, 6), step(lower, 6), step(push, 6), step(lower, 6), step(push, 6)] },
  ];
  state.seededPlanIds = ['legs', 'push', 'marathon']; // suppress seed injection so only ours score
  const ago = new Date(Date.now() - 86400000).toISOString();
  state.sessions = [{ id: 'recent', date: ago, endedAt: ago, exercises: [{ varUuid: push, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }] }];
  state.planPickMinutes = 30;
  return { push, lower };
});

test('recentMegaLoad counts recent logged sets by muscle group', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => { const rl = recentMegaLoad(4); return { push: rl.push || 0, lower: rl.lower || 0 }; });
  expect(r.push).toBe(6);   // six bench sets yesterday
  expect(r.lower).toBe(0);  // legs untouched
});

test('freshness favours the muscle group you have not recently hit', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => { const recent = recentMegaLoad(4); return { legs: planFreshnessScore(getPlan('legs'), recent), push: planFreshnessScore(getPlan('push'), recent) }; });
  expect(r.legs).toBeGreaterThan(r.push); // legs are well-rested; push was just hammered
});

test('time scoring prefers a plan that fits the budget over one that overruns it', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => ({ fit: planTimeScore(getPlan('legs'), 30), over: planTimeScore(getPlan('marathon'), 30), est: estimatePlanMinutes(getPlan('marathon')) }));
  expect(r.est).toBeGreaterThan(60);       // the marathon really is long
  expect(r.fit).toBeGreaterThan(r.over);   // …so it loses on a 30-minute budget
});

test('recommendPlans ranks a fresh, time-fitting plan first, with a reason', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => recommendPlans(30, 3).map(x => ({ id: x.plan.id, est: estimatePlanMinutes(x.plan), reason: x.reason })));
  expect(r.length).toBe(3);
  expect(r[0].id).toBe('legs');             // fresh legs that fit the half-hour
  expect(r[0].est).toBeLessThanOrEqual(40);
  expect(r[0].reason).toContain('30');      // names the budget
  expect(r[2].id).toBe('marathon');         // the over-budget marathon sinks to the bottom
});

test('the Quick Pick block renders with time chips and the top-3 recommendation cards', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    const qp = document.getElementById('quick-pick');
    return {
      present: !!qp,
      times: [...qp.querySelectorAll('[data-pick-min]')].map(b => +b.dataset.pickMin),
      activeTime: qp.querySelector('.qp-time.active')?.dataset.pickMin,
      recs: qp.querySelectorAll('.qp-rec').length,
      firstUse: qp.querySelector('.qp-use')?.dataset.planUse,
      firstReason: qp.querySelector('.qp-rec-reason')?.textContent || '',
    };
  });
  expect(r.present).toBe(true);
  expect(r.times).toEqual([15, 30, 45, 60, 90, 120, 150, 180]); // feat 240 — up to 3h
  expect(r.activeTime).toBe('30');          // reflects state.planPickMinutes
  expect(r.recs).toBe(3);
  expect(r.firstUse).toBe('legs');
  expect(r.firstReason).toContain('30');
});

test('clicking a time chip updates + persists the budget and re-recommends', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    document.querySelector('#quick-pick [data-pick-min="120"]').click();
    return {
      min: state.planPickMinutes,
      persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).planPickMinutes,
      active: document.querySelector('#quick-pick .qp-time.active')?.dataset.pickMin,
      topEst: estimatePlanMinutes(recommendPlans(120, 1)[0].plan),
    };
  });
  expect(r.min).toBe(120);
  expect(r.persisted).toBe(120);            // travels with settings
  expect(r.active).toBe('120');
  expect(r.topEst).toBeGreaterThan(40);     // a 2-hour budget now welcomes the longer plan
});

test('feat 240 — a 3h (180m) budget chip is offered, selectable, and lets a long plan fit', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    const has180 = !!document.querySelector('#quick-pick [data-pick-min="180"]');
    document.querySelector('#quick-pick [data-pick-min="180"]').click();
    const ids30 = recommendPlans(30, 3).map(x => x.plan.id);
    const recs180 = recommendPlans(180, 3), ids180 = recs180.map(x => x.plan.id);
    const mara = recs180.find(x => x.plan.id === 'marathon');
    return {
      has180,
      min: state.planPickMinutes,
      active: document.querySelector('#quick-pick .qp-time.active')?.dataset.pickMin,
      maraIdx30: ids30.indexOf('marathon'),
      maraIdx180: ids180.indexOf('marathon'),
      maraAheadOfPush: ids180.indexOf('marathon') < ids180.indexOf('push'),
      maraReason: mara ? mara.reason : '',
    };
  });
  expect(r.has180).toBe(true);
  expect(r.min).toBe(180);
  expect(r.active).toBe('180');
  expect(r.maraIdx30).toBe(2);                     // the ≈90-min marathon ranked last on a half-hour
  expect(r.maraIdx180).toBeLessThan(r.maraIdx30);  // …and climbs once there's 3h for it
  expect(r.maraAheadOfPush).toBe(true);            // now ahead of the freshly-hammered push day
  expect(r.maraReason).toContain('fits');          // ≈90 min comfortably fits the 3h budget
  expect(r.maraReason).toContain('180');
});

test('a recommended Use button starts/attaches that plan to the workout', async ({ page }) => {
  await seed(page);
  const planId = await page.evaluate(() => {
    openPlansOverlay();
    document.querySelector('#quick-pick .qp-use').click(); // the top rec (legs)
    const s = getActiveSession();
    return s ? s.planId : null;
  });
  expect(planId).toBe('legs');
});

test('feat 266 — recovery ranks a fresh-group plan above a fatigued-group one and warns about it', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fv = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const bench = fv('flat-bench-press'), lat = fv('lateral-raise');
    const step = (u) => ({ id: 's' + Math.random(), sets: 3, options: [{ type: 'variation', uuid: u }] });
    state.plans = [
      { id: 'chestday', name: 'Chest Focus', intensity: 4, steps: [step(bench), step(bench), step(bench)] },
      { id: 'deltday', name: 'Delt Focus', intensity: 4, steps: [step(lat), step(lat), step(lat)] },
    ];
    state.seededPlanIds = ['chestday', 'deltday'];
    const now = Date.now();
    state.sessions = [
      { id: 'r1', date: new Date(now - 5 * 3600000).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }] }, // chest fried 5h ago
      { id: 'r2', date: new Date(now - 21 * 86400000).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 95, r: 5 }] }] }, // reference load
    ];
    state.planPickMinutes = 30;
    const rec = recoveryReadiness();
    const recs = recommendPlans(30, 2);
    return {
      bench: !!bench, lat: !!lat,
      order: recs.map(x => x.plan.id),
      chestRecov: planRecoveryScore(getPlan('chestday'), rec),
      deltRecov: planRecoveryScore(getPlan('deltday'), rec),
      chestReason: recs.find(x => x.plan.id === 'chestday').reason,
    };
  });
  expect(r.bench).toBe(true);
  expect(r.lat).toBe(true);
  expect(r.deltRecov).toBeGreaterThan(r.chestRecov); // shoulders rested, chest hammered — the group model sees it
  expect(r.order[0]).toBe('deltday');                // …so the fresh-group plan is recommended first
  expect(r.chestReason).toContain('recovering');     // and the chest plan carries a "still recovering" heads-up
});

test('Quick Pick shows on the landing list but hides once you filter', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    const before = !!document.getElementById('quick-pick');
    _plansCatFilter = 'Push'; renderPlansOverlay();
    const after = !!document.getElementById('quick-pick');
    _plansCatFilter = 'all';
    return { before, after, inKeys: SETTINGS_KEYS.includes('planPickMinutes') };
  });
  expect(r.before).toBe(true);   // a starting point on the unfiltered view
  expect(r.after).toBe(false);   // …out of the way once you drill in
  expect(r.inKeys).toBe(true);
});
