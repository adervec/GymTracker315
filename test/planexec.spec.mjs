// feat 145 — the detailed Plan Execution View: per step it shows the status (full / min / current / to-do)
// AND which variations were actually logged to "satisfy" it (sets, top weight, est 1RM, effort) — richer
// than the dashboard plan card. Opened from the plan card "📊 Execution" button or any session's plan badge.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.openPlanExecution === 'function'
    && typeof window.renderPlanExecutionView === 'function'
    && typeof window.displayName === 'function', null, { timeout: 15000 });
});

const twoStd = (page) => page.evaluate(() => { let a=null,b=null; for (const [u] of VAR_INDEX){ if(exMode(u).mode!=='standard')continue; if(!a){a=u;continue;} b=u; break; } return {a,b}; });
const threeStd = (page) => page.evaluate(() => { const o=[]; for (const [u] of VAR_INDEX){ if(exMode(u).mode!=='standard')continue; o.push(u); if(o.length===3)break; } return {a:o[0],b:o[1],c:o[2]}; });

test('the execution view lists the variations that satisfied each step, with sets + status', async ({ page }) => {
  const { a, b, c } = await threeStd(page);
  const r = await page.evaluate(({ a, b, c }) => {
    state.planDefaults = { minPct: 1 };
    state.plans = [{ id: 'P', name: 'Test Plan', steps: [
      { id: 's0', sets: 3, load: 'heavy', options: [{ type: 'variation', uuid: a }] },
      { id: 's1', sets: 2, load: 'moderate', options: [{ type: 'variation', uuid: b }] },
      { id: 's2', sets: 3, load: 'light', options: [{ type: 'variation', uuid: c }] }, // never touched -> to-do
    ] }];
    const sess = { id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [
      { varUuid: a, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 105, r: 4 }] }, // step 0 full
      { varUuid: b, subUuid: null, sets: [{ w: 60, r: 8 }] },                                       // step 1 min only
    ] };
    state.sessions = [sess]; pending = { varUuid: null, sets: [] }; modalState.open = false;
    openPlanExecution('P');
    const body = document.getElementById('plans-body');
    return {
      panelOpen: document.getElementById('plans-panel').classList.contains('open'),
      html: body.innerHTML,
      nameA: displayName(a, null), nameB: displayName(b, null), nameC: displayName(c, null),
      hasBack: !!body.querySelector('#plan-exec-back'),
      stepCount: body.querySelectorAll('.pexec-step').length,
      fullCount: body.querySelectorAll('.pexec-step.pe-full').length,
      minCount: body.querySelectorAll('.pexec-step.pe-min').length,
      todoCount: body.querySelectorAll('.pexec-step.pe-todo').length,
    };
  }, { a, b });
  expect(r.panelOpen).toBe(true);
  expect(r.hasBack).toBe(true);
  expect(r.stepCount).toBe(3);
  expect(r.html).toContain('Satisfied by');
  expect(r.html).toContain(r.nameA);            // the variation logged for step 0
  expect(r.html).toContain(r.nameB);            // the variation logged for step 1
  expect(r.html).toContain('100×5');            // a logged set detail
  expect(r.html).toContain('60×8');             // step 1's logged set
  expect(r.fullCount).toBe(1);                  // step 0 hit its full target
  expect(r.minCount).toBe(1);                   // step 1 met its 1% minimum only
  expect(r.todoCount).toBe(1);                  // step 2 untouched
  expect(r.html).toContain('✓ done · full');
  expect(r.html).toMatch(/✓ done · min/);
});

test('the rollup shows steps (with full hint) + sets, and the back button returns to the plan list', async ({ page }) => {
  const { a, b } = await twoStd(page);
  const r = await page.evaluate(({ a, b }) => {
    state.planDefaults = { minPct: 1 };
    state.plans = [{ id: 'P', name: 'Roll Plan', steps: [
      { id: 's0', sets: 3, options: [{ type: 'variation', uuid: a }] },
      { id: 's1', sets: 2, options: [{ type: 'variation', uuid: b }] },
    ] }];
    const sess = { id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [
      { varUuid: a, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }, // full
      { varUuid: b, sets: [{ w: 60, r: 8 }] },                                       // min
    ] };
    state.sessions = [sess]; pending = { varUuid: null, sets: [] };
    openPlanExecution('P');
    const body = document.getElementById('plans-body');
    const rollup = body.querySelector('.pexec-rollup').textContent;
    body.querySelector('#plan-exec-back').click(); // back to the plan list
    const afterBack = document.getElementById('plans-body').innerHTML;
    return { rollup, backToList: afterBack.includes('plan-new-btn') };
  }, { a, b });
  expect(r.rollup).toContain('2/2'); // both steps min-satisfied
  expect(r.rollup).toContain('(1 full)');
  expect(r.rollup).toContain('sets');
  expect(r.backToList).toBe(true);
});

test('the current-step HUD bar opens the execution view (feat 156)', async ({ page }) => {
  const { a } = await twoStd(page);
  const r = await page.evaluate((a) => {
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 3, options: [{ type: 'variation', uuid: a }] }] }];
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] }];
    pending = { varUuid: null, sets: [] }; modalState.open = false;
    if (typeof refreshPlanStepBar === 'function') refreshPlanStepBar();
    document.getElementById('plan-step-bar').click(); // wired at init to openPlanExecution
    const body = document.getElementById('plans-body');
    return { panelOpen: document.getElementById('plans-panel').classList.contains('open'),
      isExec: body.innerHTML.includes('Satisfied by') && !!body.querySelector('#plan-exec-back') };
  }, a);
  expect(r.panelOpen).toBe(true);
  expect(r.isExec).toBe(true); // the execution view (not the plan editor)
});

test('a past session\'s plan badge is clickable and opens its execution view (feat 145)', async ({ page }) => {
  const { a } = await twoStd(page);
  const r = await page.evaluate((a) => {
    state.planDefaults = { minPct: 1 };
    state.plans = [{ id: 'P', name: 'Past Plan', steps: [{ id: 's0', sets: 2, options: [{ type: 'variation', uuid: a }] }] }];
    const past = { id: 'old', date: '2026-05-01T10:00:00.000Z', endedAt: '2026-05-01T11:00:00.000Z', planId: 'P',
      exercises: [{ varUuid: a, sets: [{ w: 80, r: 6 }, { w: 80, r: 6 }] }] };
    state.sessions = [past];
    const badgeHtml = renderSession(past, false);
    // simulate the delegated click handler resolving the badge's data attributes
    const hasData = badgeHtml.includes('data-plan-exec-sess="2026-05-01T10:00:00.000Z"') && badgeHtml.includes('data-plan-exec-id="P"');
    openPlanExecution('P', '2026-05-01T10:00:00.000Z'); // what the click does
    const body = document.getElementById('plans-body');
    return { hasData, clickable: badgeHtml.includes('plan-hist-clickable'),
      showsPastDate: body.querySelector('.pexec-when').textContent, html: body.innerHTML, nameA: displayName(a, null) };
  }, a);
  expect(r.clickable).toBe(true);
  expect(r.hasData).toBe(true);
  expect(r.showsPastDate).not.toContain('This session'); // resolved the PAST session, not the live one
  expect(r.html).toContain(r.nameA);
  expect(r.html).toContain('80×6');
});
