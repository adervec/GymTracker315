// feat 214 — ⏭ skip a plan step for THIS session: it is not removed, it goes to the back of the
// next-exercise queue (currentPlanStepIndex serves unskipped steps first, then skipped ones in skip
// order). ↩ un-skip restores its natural place. Persisted on the session.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof toggleStepSkip === 'function' && typeof currentPlanStepIndex === 'function', null, { timeout: 15000 });
});

const armPlan = (page) => page.evaluate(() => {
  normalizeState();
  state.plans = [{ id: 'p-skip', name: 'Skip', steps: [
    { id: 'st-a', sets: 2, options: [{ type: 'movement', familyId: 'bicep-curl' }] },
    { id: 'st-b', sets: 2, options: [{ type: 'movement', familyId: 'squat' }] },
    { id: 'st-c', sets: 2, options: [{ type: 'movement', familyId: 'row' }] },
  ] }];
  state.sessions = [{ id: 'sess', date: new Date().toISOString(), updatedAt: new Date().toISOString(), planId: 'p-skip', exercises: [] }];
  modalState.isEditing = false; modalState.open = false;
  pending.varUuid = null; pending.sets = [];
});

test('skipping the current step moves the pointer; all-skipped serves the oldest skip first', async ({ page }) => {
  await armPlan(page);
  const r = await page.evaluate(() => {
    const plan = getActivePlan(), s = getActiveSession();
    const out = {};
    out.start = currentPlanStepIndex(s, plan);              // step A
    toggleStepSkip(s, plan.steps[0]);                       // skip A
    out.afterSkipA = currentPlanStepIndex(s, plan);         // → B
    toggleStepSkip(s, plan.steps[1]);                       // skip B
    out.afterSkipB = currentPlanStepIndex(s, plan);         // → C (last unskipped)
    toggleStepSkip(s, plan.steps[2]);                       // skip C — everything skipped
    out.allSkipped = currentPlanStepIndex(s, plan);         // → A (the OLDEST skip — back of queue order)
    toggleStepSkip(s, plan.steps[0]);                       // un-skip A
    out.afterUnskip = currentPlanStepIndex(s, plan);        // → A (restored to natural place)
    out.persisted = JSON.parse(localStorage.getItem('overload_tracker_v2')).sessions[0].skippedSteps;
    state.sessions = []; state.plans = [];
    return out;
  });
  expect(r.start).toBe(0);
  expect(r.afterSkipA).toBe(1);
  expect(r.afterSkipB).toBe(2);
  expect(r.allSkipped).toBe(0);       // not removed — served again, oldest first
  expect(r.afterUnskip).toBe(0);
  expect(r.persisted).toEqual(['st-b', 'st-c']); // the session remembers the queue
});

test('a completed skipped step stays done; skip state never blocks completion', async ({ page }) => {
  await armPlan(page);
  const r = await page.evaluate(() => {
    const plan = getActivePlan(), s = getActiveSession();
    const u = FAMILIES.find(f => f.id === 'bicep-curl').variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
    toggleStepSkip(s, plan.steps[0]);                        // skip A…
    s.exercises = [{ varUuid: u, subUuid: null, sets: [{ w: 50, r: 10 }, { w: 50, r: 10 }] }]; // …then do it anyway
    const idx = currentPlanStepIndex(s, plan);               // A done → pointer on B
    const done = stepStatus(s, plan.steps[0], plan).done;
    state.sessions = []; state.plans = [];
    return { idx, done };
  });
  expect(r.done).toBe(true);
  expect(r.idx).toBe(1);
});

test('the plan step rows carry the ⏭ control; clicking it skips and restyles (feat 246 — Plan page)', async ({ page }) => {
  await armPlan(page);
  const r = await page.evaluate(() => {
    openPlanLive(); // feat 246 — the interactive plan card lives on the Plan Detail page now
    const btn = document.querySelector('#trk-main .plan-step-skip[data-plan-skip="0"]');
    if (btn) btn.click();        // skip step 1 (re-renders)
    const row = document.querySelector('#trk-main .plan-step[data-plan-step-idx="0"]');
    const tag = row && row.querySelector('.plan-step-skiptag');
    const unskip = row && row.querySelector('.plan-step-skip');
    const out = {
      hadBtn: !!btn,
      skippedClass: !!(row && row.className.includes('skipped')),
      tag: tag ? tag.textContent : null,
      unskipGlyph: unskip ? unskip.textContent : null,
      pointer: currentPlanStepIndex(getActiveSession(), getActivePlan()),
    };
    state.sessions = []; state.plans = [];
    return out;
  });
  expect(r.hadBtn).toBe(true);
  expect(r.skippedClass).toBe(true);                 // dimmed + struck number style
  expect(r.tag).toContain('back of queue');          // labelled honestly
  expect(r.unskipGlyph).toBe('↩');                   // the control flips to un-skip
  expect(r.pointer).toBe(1);                         // the next-exercise pointer moved on
});
