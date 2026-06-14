// feat 229 — Split Planner (Prepare › Split Planner): recommend a weekly split for the sessions / days /
// hours you have, then analyse how far it over- or under-shoots each muscle group's weekly volume target
// (MEV–MRV). Pure scoring functions + a page UI with input chips, recommended days, and coverage bars.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildRecommendedSplit === 'function' && typeof splitAnalysis === 'function'
    && typeof renderSplitPlannerPage === 'function', null, { timeout: 15000 });
});

// a standard-mode variation per mega, for hand-built test plans
const megaVars = (page) => page.evaluate(() => {
  const by = (m) => { for (const [u, info] of VAR_INDEX) if (info.family.mega === m && exMode(u).mode === 'standard') return u; return null; };
  return { push: by('push'), pull: by('pull'), lower: by('lower') };
});

test('GROUP_TARGETS gives every group a sane MEV ≤ MAV ≤ MRV band', async ({ page }) => {
  const r = await page.evaluate(() => {
    const groups = Object.keys(GROUP_TARGETS);
    const bad = groups.filter(g => { const t = GROUP_TARGETS[g]; return !(t.mev > 0 && t.mev <= t.mav && t.mav <= t.mrv); });
    return { n: groups.length, bad, chest: GROUP_TARGETS.chest };
  });
  expect(r.n).toBeGreaterThanOrEqual(10);
  expect(r.bad).toEqual([]);
  expect(r.chest.mev).toBeLessThan(r.chest.mrv);
});

test('a plan loads its trained groups; splitAnalysis flags over- and under-training', async ({ page }) => {
  const { push } = await megaVars(page);
  const r = await page.evaluate((push) => {
    const step = (u, sets) => ({ id: 's' + Math.random(), sets, options: [{ type: 'variation', uuid: u }] });
    // a heavy chest-only "split": 4 push days, lots of sets → chest over, everything else untrained
    const chestPlan = { id: 'c', name: 'Chest', steps: Array.from({ length: 5 }, () => step(push, 5)) };
    const acc = planMuscleAcc(chestPlan);
    const vol = splitGroupVolume([chestPlan, chestPlan, chestPlan, chestPlan]);
    const an = splitAnalysis([chestPlan, chestPlan, chestPlan, chestPlan]);
    const chest = an.rows.find(x => x.group === 'chest'), back = an.rows.find(x => x.group === 'back');
    return { chestSets: Math.round(vol.chest || 0), chestStatus: chest.status, backStatus: back.status, balance: an.balance, over: an.over, under: an.under, accHasChest: Object.keys(acc).some(k => k.includes('chest')) };
  }, push);
  expect(r.accHasChest).toBe(true);       // the bench plan loads chest muscles
  expect(r.chestSets).toBeGreaterThan(20);
  expect(r.chestStatus).toBe('over');     // 4 heavy chest days blow past the ceiling
  expect(r.backStatus).toBe('under');     // …while back never gets trained
  expect(r.over).toBeGreaterThanOrEqual(1);
  expect(r.under).toBeGreaterThanOrEqual(1);
  expect(r.balance).toBeLessThan(100);    // a lopsided split is not on-base
});

test('buildRecommendedSplit lays out the slot template and each pick covers its slot', async ({ page }) => {
  const r = await page.evaluate(() => {
    const split = buildRecommendedSplit({ sessions: 3, minutes: 60 });
    const slots = split.map(s => s.slot);
    const covers = (slot) => { const s = split.find(x => x.slot === slot); return s && s.plan ? slotCoverage(s.plan, slot) : 0; };
    const overBudget = split.filter(s => s.plan && s.est > 60 * 1.6).length; // nothing wildly over the clock
    return { slots, pushCov: covers('Push'), pullCov: covers('Pull'), legsCov: covers('Legs'), overBudget, allPicked: split.every(s => s.plan) };
  });
  expect(r.slots).toEqual(['Push', 'Pull', 'Legs']); // 3/wk → PPL
  expect(r.allPicked).toBe(true);
  expect(r.pushCov).toBeGreaterThan(0.5); // the Push pick actually trains chest/shoulders/triceps
  expect(r.pullCov).toBeGreaterThan(0.4); // …the Pull pick trains back/biceps
  expect(r.legsCov).toBeGreaterThan(0.5);
  expect(r.overBudget).toBe(0);           // breadth+time scoring keeps picks near the budget
});

test('more sessions → better balance and fewer under-trained groups', async ({ page }) => {
  const r = await page.evaluate(() => {
    const a3 = splitAnalysis(buildRecommendedSplit({ sessions: 3, minutes: 60 }).map(s => s.plan).filter(Boolean));
    const a5 = splitAnalysis(buildRecommendedSplit({ sessions: 5, minutes: 90 }).map(s => s.plan).filter(Boolean));
    return { under3: a3.under, under5: a5.under, bal3: a3.balance, bal5: a5.balance, templates: [splitTemplateFor(2).length, splitTemplateFor(4).length, splitTemplateFor(6).length] };
  });
  expect(r.under5).toBeLessThan(r.under3);   // five sessions cover more groups than three
  expect(r.bal5).toBeGreaterThan(r.bal3);
  expect(r.templates).toEqual([2, 4, 6]);    // the templates scale with session count
});

test('the page renders inputs, recommended days, and coverage bars; chips persist + re-render', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.splitPlan = { sessions: 3, days: 5, minutes: 60 };
    navTo('split-planner');
    const host = document.getElementById('trk-main');
    const before = { days: host.querySelectorAll('.sp-day').length, bars: host.querySelectorAll('.sp-grp').length, useBtns: host.querySelectorAll('.sp-use').length, activeSess: host.querySelector('.sp-chip.active[data-sp-sessions]')?.dataset.spSessions };
    host.querySelector('[data-sp-sessions="5"]').click(); // bump to 5 sessions → re-render
    const host2 = document.getElementById('trk-main');
    return {
      before, page: currentPage,
      crumb: document.getElementById('topbar-title').textContent,
      afterDays: host2.querySelectorAll('.sp-day').length,
      sess: state.splitPlan.sessions,
      persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).splitPlan.sessions,
      inKeys: SETTINGS_KEYS.includes('splitPlan'),
    };
  });
  expect(r.page).toBe('split-planner');
  expect(r.crumb).toContain('Split Planner');
  expect(r.before.days).toBe(3);            // 3 session rows
  expect(r.before.bars).toBeGreaterThanOrEqual(10); // a coverage bar per muscle group
  expect(r.before.useBtns).toBeGreaterThan(0);
  expect(r.before.activeSess).toBe('3');
  expect(r.afterDays).toBe(5);              // bumping to 5 sessions re-laid the split
  expect(r.sess).toBe(5);
  expect(r.persisted).toBe(5);              // travels with settings
  expect(r.inKeys).toBe(true);
});

test('a recommended day Use button attaches that plan to the workout', async ({ page }) => {
  const planId = await page.evaluate(() => {
    state.splitPlan = { sessions: 3, days: 3, minutes: 60 };
    navTo('split-planner');
    const btn = document.querySelector('#trk-main .sp-use');
    const want = btn.dataset.planUse;
    btn.click();
    const s = getActiveSession();
    return { want, got: s ? s.planId : null };
  });
  expect(planId.got).toBe(planId.want);
});

// feat 255 — curated "themed" splits (coy, allusive names) that drive an explicit slot sequence.
test('feat 255 — THEMED_SPLITS are well-formed and buildRecommendedSplit honours an explicit slot list', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ok = THEMED_SPLITS.every(t => t.id && t.name && Array.isArray(t.slots) && t.slots.length >= 2 && t.slots.length <= 6);
    const oak = themedSplit('oak');
    const built = buildRecommendedSplit({ slots: oak.slots, minutes: 60 }).map(s => s.slot);
    return { count: THEMED_SPLITS.length, ok, oakSlots: oak.slots, built, missing: themedSplit('nope') };
  });
  expect(r.count).toBeGreaterThanOrEqual(6);
  expect(r.ok).toBe(true);
  expect(r.built).toEqual(r.oakSlots);   // the split follows the theme's slot sequence
  expect(r.missing).toBeNull();
});

test('feat 255 — picking a themed split sets the slots + session count; tapping again clears it', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.splitPlan = { sessions: 3, days: 7, minutes: 60 };
    const main = document.getElementById('trk-main');
    renderSplitPlannerPage(main);
    const chipCount = main.querySelectorAll('[data-sp-theme]').length;
    main.querySelector('[data-sp-theme="oak"]').click(); // 6-day PPL theme
    const m2 = document.getElementById('trk-main');
    const after = { theme: state.splitPlan.theme, sessions: state.splitPlan.sessions, slots: [...m2.querySelectorAll('.sp-day .sp-day-cat')].map(e => e.textContent) };
    m2.querySelector('[data-sp-theme="oak"]').click(); // tap again → clear
    return { chipCount, after, clearedTheme: state.splitPlan.theme };
  });
  expect(r.chipCount).toBeGreaterThanOrEqual(6);
  expect(r.after.theme).toBe('oak');
  expect(r.after.sessions).toBe(6);
  expect(r.after.slots).toEqual(['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs']);
  expect(r.clearedTheme).toBeFalsy();
});

test('feat 255 — saving a themed split names the weekly program after the theme', async ({ page }) => {
  const { push, pull, lower } = await megaVars(page);
  const r = await page.evaluate(({ push, pull, lower }) => {
    const step = (u) => ({ id: 's' + Math.random(), sets: 3, options: [{ type: 'variation', uuid: u }] });
    state.plans = [
      { id: 'pu', name: 'Push A', steps: [step(push), step(push)] },
      { id: 'pl', name: 'Pull A', steps: [step(pull), step(pull)] },
      { id: 'lg', name: 'Legs A', steps: [step(lower), step(lower)] },
    ];
    state.splitPlan = { sessions: 3, days: 7, minutes: 60, theme: 'oak' };
    saveProgramFromSplit();
    return { name: state.program.name, sessions: state.program.sessions };
  }, { push, pull, lower });
  expect(r.name).toBe('The Golden-Era Oak');  // named after the theme, not "6-day split"
  expect(r.sessions).toBe(6);
});
