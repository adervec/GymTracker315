// feat 139 — the notched current-step HUD bar (#plan-step-bar), a strip directly below the rest timer.
// One notch per target set: saved sets solid (.filled), unsaved pending sets dimmed (.pending). Shows the
// step being logged (else the earliest incomplete); hidden outside a planned workout / when complete.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshPlanStepBar === 'function', null, { timeout: 15000 });
});

test('the step bar shows the current step with one notch per set (feat 139)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null, b = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode !== 'standard') continue; if (!a) { a = u; continue; } b = u; break; }
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 3, options: [{ type: 'variation', uuid: a }] }, { id: 's1', sets: 2, options: [{ type: 'variation', uuid: b }] }] }];
    state.sessions = [{ id: 'today', date: new Date().toISOString(), planId: 'P', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] }]; // 1/3 on step 0
    modalState.open = false; pending.varUuid = null; pending.sets = [];
    refreshPlanStepBar();
    const bar = document.getElementById('plan-step-bar'), notches = [...bar.querySelectorAll('.stepbar-notch')];
    return {
      shown: getComputedStyle(bar).display !== 'none',
      bodyClass: document.body.classList.contains('plan-step-bar-on'),
      total: notches.length,
      filled: notches.filter(n => n.classList.contains('filled')).length,
      label: bar.querySelector('.stepbar-label').textContent,
    };
  });
  expect(r.shown).toBe(true);
  expect(r.bodyClass).toBe(true);     // body class drives the panel padding below the rest bar
  expect(r.total).toBe(3);            // step 0 targets 3 sets → 3 notches
  expect(r.filled).toBe(1);           // 1 saved set
  expect(r.label).toContain('Step 1/2');
  expect(r.label).toContain('1/3');
});

test('the step bar dims unsaved (pending) notches and hides when the plan is complete (feat 139)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.plans = [{ id: 'P', name: 'P', steps: [{ id: 's0', sets: 2, options: [{ type: 'variation', uuid: a }] }] }];
    state.sessions = [{ id: 'today', date: new Date().toISOString(), planId: 'P', exercises: [] }];
    modalState.open = true; modalState.isEditing = false; pending.varUuid = a; pending.subUuid = null; pending.sets = [{ w: 100, r: 5 }]; // 1 unsaved
    refreshPlanStepBar();
    const bar = document.getElementById('plan-step-bar'), notches = [...bar.querySelectorAll('.stepbar-notch')];
    const pendingState = { shown: getComputedStyle(bar).display !== 'none', total: notches.length, filled: notches.filter(n => n.classList.contains('filled')).length, pending: notches.filter(n => n.classList.contains('pending')).length };
    // complete the step (2 saved), discard the pending log, close the modal
    state.sessions[0].exercises = [{ varUuid: a, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }];
    clearPending(); modalState.open = false;
    refreshPlanStepBar();
    const hiddenWhenComplete = getComputedStyle(bar).display === 'none' && !document.body.classList.contains('plan-step-bar-on');
    return { pendingState, hiddenWhenComplete };
  });
  expect(r.pendingState.shown).toBe(true);
  expect(r.pendingState.total).toBe(2);
  expect(r.pendingState.filled).toBe(0);   // nothing saved yet
  expect(r.pendingState.pending).toBe(1);  // the one unsaved set → dimmed notch
  expect(r.hiddenWhenComplete).toBe(true); // plan finished → HUD bar gone
});

test('the step bar is hidden outside a planned workout (feat 139)', async ({ page }) => {
  const hidden = await page.evaluate(() => {
    state.plans = []; state.sessions = []; modalState.open = false; pending.varUuid = null;
    refreshPlanStepBar();
    const bar = document.getElementById('plan-step-bar');
    return getComputedStyle(bar).display === 'none' && !document.body.classList.contains('plan-step-bar-on');
  });
  expect(hidden).toBe(true);
});
