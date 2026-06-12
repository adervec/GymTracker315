// feat 111 — plan-progress dashboard: per-step sets + effort hit, live roll-up, and comparison to the
// most-recent and all-time-best prior runs of the same plan. Step matching is by exercise, so it is
// retroactive across a mid-workout plan change.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.planExecutionSummary === 'function'
    && typeof window.stepEffort === 'function'
    && typeof window.findPlanExecutions === 'function'
    && typeof window.renderPlanGuide === 'function', null, { timeout: 15000 });
});

async function seedPlan(page) {
  return await page.evaluate(() => {
    let a = null, b = null;
    for (const [u] of VAR_INDEX) { if (exMode(u).mode !== 'standard') continue; if (!a) { a = u; continue; } b = u; break; }
    state.unit = 'lb';
    state.plans = [{ id: 'P', name: 'Test Plan', steps: [
      { id: 's1', sets: 2, options: [{ type: 'variation', uuid: a }], load: 'moderate' },
      { id: 's2', sets: 1, options: [{ type: 'variation', uuid: b }], load: 'moderate' },
    ] }];
    return { a, b };
  });
}

test('planExecutionSummary rolls up steps + sets + completion', async ({ page }) => {
  const { a } = await seedPlan(page);
  const r = await page.evaluate((a) => {
    const sess = { id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] };
    state.sessions = [sess];
    return planExecutionSummary(sess, getPlan('P'));
  }, a);
  expect(r.stepsDone).toBe(1);     // step 1 hit its 2 sets
  expect(r.stepsTotal).toBe(2);
  expect(r.setsDone).toBe(2);
  expect(r.setsTarget).toBe(3);
  expect(r.complete).toBe(false);
});

test('stepEffort flags when the working weight reached the prescribed load (and n/a without a baseline)', async ({ page }) => {
  const { a, b } = await seedPlan(page);
  const r = await page.evaluate(({ a, b }) => {
    state.sessions = [
      { id: 'prior', date: new Date(Date.now() - 7 * 86400000).toISOString(), endedAt: new Date(Date.now() - 7 * 86400000 + 3600000).toISOString(), planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] },
      { id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] },
    ];
    const cur = state.sessions[1], plan = getPlan('P');
    return { efA: stepEffort(cur, plan.steps[0]), efB: stepEffort(cur, plan.steps[1]) };
  }, { a, b });
  expect(r.efA.applicable).toBe(true);
  expect(r.efA.hit).toBe(true);     // top 100 reached the moderate target
  expect(r.efB.applicable).toBe(false); // b never logged -> no baseline -> effort not judgeable
});

test('findPlanExecutions returns most-recent and all-time best, excluding the active session', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [
      { id: 'e1', date: '2026-05-01T00:00:00.000Z', endedAt: '2026-05-01T01:00:00.000Z', planId: 'P', exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }, { w: 1, r: 1 }] }], finalScore: { points: 70, grade: 'B' } },
      { id: 'e2', date: '2026-05-20T00:00:00.000Z', endedAt: '2026-05-20T01:00:00.000Z', planId: 'P', exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }], finalScore: { points: 90, grade: 'A+' } },
      { id: 'cur', date: '2026-06-01T00:00:00.000Z', planId: 'P', exercises: [] },
    ];
    const ex = findPlanExecutions('P', 'cur');
    return { recent: ex.recent.id, best: ex.best.id, count: ex.count };
  });
  expect(r.recent).toBe('e2'); // newest by date
  expect(r.best).toBe('e2');   // highest score
  expect(r.count).toBe(2);     // active session excluded
});

test('renderPlanGuide shows the progress line, ETA/ETC and a prior-run comparison', async ({ page }) => {
  await seedPlan(page);
  const html = await page.evaluate(() => {
    state.sessions = [
      { id: 'old', date: '2026-05-01T00:00:00.000Z', endedAt: '2026-05-01T01:00:00.000Z', planId: 'P', exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }], finalScore: { points: 80, grade: 'A' } },
      { id: 'today', date: new Date().toISOString(), planId: 'P', exercises: [] },
    ];
    return renderPlanGuide(state.sessions[1]);
  });
  expect(html).toContain('plan-progress-line');
  expect(html).toContain('plan-compare');
  expect(html).toContain('Last:');
  expect(html).toMatch(/ETC|ETA/);
});

test('renderPlanGuide is collapsible — header toggle hides the body per state.dashboard.planCollapsed (feat 127)', async ({ page }) => {
  await seedPlan(page);
  const r = await page.evaluate(() => {
    state.sessions = [{ id: 'today', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    state.dashboard = { ...state.dashboard, planCollapsed: false };
    const expanded = renderPlanGuide(state.sessions[0]);
    state.dashboard = { ...state.dashboard, planCollapsed: true };
    const collapsed = renderPlanGuide(state.sessions[0]);
    return {
      hasToggle: expanded.includes('id="plan-collapse-toggle"'),
      expandedBodyShown: expanded.includes('<div class="plan-card-body">'),
      expandedChevron: expanded.includes('▾'),
      collapsedBodyHidden: collapsed.includes('<div class="plan-card-body" hidden>'),
      collapsedChevron: collapsed.includes('▸'),
      collapsedClass: /class="plan-card[^"]*collapsed"/.test(collapsed),
      progressVisibleWhenCollapsed: collapsed.includes('plan-progress-line'), // glanceable summary stays
    };
  });
  expect(r.hasToggle).toBe(true);
  expect(r.expandedBodyShown).toBe(true);
  expect(r.expandedChevron).toBe(true);
  expect(r.collapsedBodyHidden).toBe(true);
  expect(r.collapsedChevron).toBe(true);
  expect(r.collapsedClass).toBe(true);
  expect(r.progressVisibleWhenCollapsed).toBe(true);
});

test('plan progress counts UNSAVED pending sets for the live session, and reverts on discard (feat 137)', async ({ page }) => {
  const { a } = await seedPlan(page);
  const r = await page.evaluate((a) => {
    const sess = { id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] };
    state.sessions = [sess];
    const step = getPlan('P').steps[0]; // targets var a, 2 sets
    const savedOnly = stepStatus(sess, step).logged;
    // "enter" sets in the modal (not editing): 2 valid + 1 blank row
    modalState.isEditing = false; pending.varUuid = a; pending.subUuid = null;
    pending.sets = [{ w: 105, r: 5 }, { w: 110, r: 4 }, { w: '', r: '' }];
    const withPending = stepStatus(sess, step).logged, done = stepStatus(sess, step).done;
    modalState.isEditing = true; const whileEditing = stepStatus(sess, step).logged; modalState.isEditing = false;
    const other = { id: 'old', date: '2026-01-01T00:00:00.000Z', planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 1, r: 1 }] }] };
    state.sessions = [sess, other];
    const otherLogged = stepStatus(other, step).logged;
    clearPending();
    const afterDiscard = stepStatus(sess, step).logged;
    return { savedOnly, withPending, done, whileEditing, otherLogged, afterDiscard };
  }, a);
  expect(r.savedOnly).toBe(1);
  expect(r.withPending).toBe(3);    // 1 saved + 2 valid pending (blank row ignored)
  expect(r.done).toBe(true);        // 3 ≥ target 2
  expect(r.whileEditing).toBe(1);   // editing a saved exercise must not double-count
  expect(r.otherLogged).toBe(1);    // a prior session ignores the live pending
  expect(r.afterDiscard).toBe(1);   // discarding the log reverts the progress
});

test('clicking the plan progress line opens the full plan view (feat 138)', async ({ page }) => {
  await seedPlan(page);
  const r = await page.evaluate(() => {
    state.sessions = [{ id: 'today', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    const html = renderPlanGuide(state.sessions[0]);
    openPlanFull('P'); // what the progress-line click handler calls → navTo('plan-creator')
    const body = document.getElementById('trk-main').innerHTML; // feat 184 — the editor is a page now
    return {
      hasClickable: html.includes('id="plan-progress-open"'),
      panelOpen: currentPage === 'plan-creator',
      showsFullPlan: /plan-name-input/.test(body) && body.includes('Step 1'), // the editor with all steps
    };
  });
  expect(r.hasClickable).toBe(true);
  expect(r.panelOpen).toBe(true);
  expect(r.showsFullPlan).toBe(true);
});
