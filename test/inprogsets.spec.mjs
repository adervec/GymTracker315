// feat 211 — an IN-PROGRESS set (weight entered, reps pending) no longer counts toward a plan step's
// X/Y: only completed pending sets fold into stepLoggedSets (feat 137 keeps unsaved-but-complete sets
// counting). The step HUD bar shows the in-prog set as a CHECKERED notch instead.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof pendingStepOpenSets === 'function' && typeof refreshPlanStepBar === 'function', null, { timeout: 15000 });
});

const arm = (page, sets, savedSets) => page.evaluate(({ sets, savedSets }) => {
  normalizeState();
  const fam = FAMILIES.find(f => f.id === 'bicep-curl');
  const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
  state.plans = [{ id: 'p-ip', name: 'IP', steps: [{ id: 's1', sets: 4, options: [{ type: 'movement', familyId: 'bicep-curl' }] }] }];
  state.sessions = [{ id: 'sess', date: new Date().toISOString(), updatedAt: new Date().toISOString(), planId: 'p-ip',
    exercises: savedSets ? [{ varUuid: u, subUuid: null, sets: savedSets }] : [] }];
  modalState.isEditing = false; modalState.open = true;
  pending.varUuid = u; pending.subUuid = null;
  pending.sets = sets;
  return u;
}, { sets, savedSets });

test('an open set does not count toward the step X/Y; completed pending sets still do', async ({ page }) => {
  await arm(page, [{ w: '50', r: '10' }, { w: '55', r: '' }]);   // 1 complete + 1 in-prog
  const r = await page.evaluate(() => {
    const plan = getActivePlan(), session = getActiveSession();
    const st = plan.steps[0];
    return { logged: stepLoggedSets(session, st), open: pendingStepOpenSets(st), done: stepStatus(session, st, plan).done };
  });
  expect(r.logged).toBe(1);   // ONLY the completed set counts (was 2 before feat 211)
  expect(r.open).toBe(1);     // the in-prog set is tracked separately
  expect(r.done).toBe(false);
});

test('a step cannot read as done off the back of an open set', async ({ page }) => {
  await arm(page, [{ w: '50', r: '10' }, { w: '50', r: '10' }, { w: '50', r: '10' }, { w: '55', r: '' }]); // 3 done + 1 open, target 4
  const r = await page.evaluate(() => {
    const plan = getActivePlan(), session = getActiveSession();
    const st = plan.steps[0];
    return { logged: stepLoggedSets(session, st), done: stepStatus(session, st, plan).done };
  });
  expect(r.logged).toBe(3);
  expect(r.done).toBe(false); // the open 4th set does NOT complete the step
});

test('the step HUD bar: solid saved, dimmed pending-complete, CHECKERED in-prog, label excludes in-prog', async ({ page }) => {
  await arm(page, [{ w: '50', r: '8' }, { w: '55', r: '' }], [{ w: 45, r: 10 }]);  // 1 saved + 1 pending-complete + 1 open, target 4
  const r = await page.evaluate(() => {
    refreshPlanStepBar();
    const bar = document.getElementById('plan-step-bar');
    const cls = [...bar.querySelectorAll('.stepbar-notch')].map(n => n.className.replace('stepbar-notch', '').trim());
    return { cls, label: bar.querySelector('.stepbar-label').textContent, visible: bar.style.display !== 'none' };
  });
  expect(r.visible).toBe(true);
  expect(r.cls).toEqual(['filled', 'pending', 'inprog', '']); // saved → unsaved-complete → checkered open → empty
  expect(r.label).toContain('2/4');                            // the open set is NOT in the count
});

test('finishing the open set converts the checkered notch to a counted one', async ({ page }) => {
  await arm(page, [{ w: '50', r: '8' }, { w: '55', r: '' }]);
  const r = await page.evaluate(() => {
    refreshPlanStepBar();
    const before = [...document.querySelectorAll('#plan-step-bar .stepbar-notch')].map(n => n.className.includes('inprog'));
    commitSetField(1, 'r', '6');     // reps land → completed
    refreshPlanStepBar();
    const after = [...document.querySelectorAll('#plan-step-bar .stepbar-notch')].map(n => n.className.includes('inprog'));
    const plan = getActivePlan(), session = getActiveSession();
    const logged = stepLoggedSets(session, plan.steps[0]);
    pending.sets = [{ w: '', r: '' }]; pending.varUuid = null; state.sessions = []; state.plans = []; modalState.open = false;
    return { before, after, logged };
  });
  expect(r.before).toContain(true);            // checkered while open
  expect(r.after).not.toContain(true);         // gone once completed
  expect(r.logged).toBe(2);                    // and the set now counts
});
