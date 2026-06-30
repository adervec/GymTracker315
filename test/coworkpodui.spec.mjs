// feat 321 — bugfix: the Plan-of-the-Day option controls (Target pills, time slider, group/injury/equipment
// checkboxes, focus/notes) now persist IMMEDIATELY to state. The generic .drawer-pill click handler re-renders
// the whole drawer on every pill click, which previously reset the pills and discarded unsaved form edits.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderSettingsDrawer === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('POD options persist immediately and survive the drawer re-render', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.aiExport = { ...state.aiExport, enabled: true };   // the cowork hub lives in the aiExport section
    state.cowork = { ...state.cowork, enabled: true };
    state.podOptions = { ...state.podOptions, targetMode: 'recovered', availableMinutes: { min: 30, max: 60 }, targetGroups: [] };
    renderSettingsDrawer();
    const pill = document.querySelector('[data-pod-mode="groups"]');
    const formPresent = !!pill;
    if (pill) pill.click(); // previously: unconditional renderSettingsDrawer() reset this
    const modeAfter = state.podOptions.targetMode;
    // feat 386 — dual-thumb min/max time slider: dragging the MAX thumb updates the displayed value live and persists
    const loS = document.querySelector('#pod-min'), hiS = document.querySelector('#pod-max'), val = document.querySelector('#pod-time-val');
    if (hiS) { hiS.value = '120'; hiS.dispatchEvent(new Event('input', { bubbles: true })); }
    const valLive = val ? val.textContent : null;                 // display updated on input (before release)
    if (hiS) hiS.dispatchEvent(new Event('change', { bubbles: true })); // commit
    if (loS) { loS.value = '45'; loS.dispatchEvent(new Event('input', { bubbles: true })); loS.dispatchEvent(new Event('change', { bubbles: true })); }
    const valLive2 = val ? val.textContent : null;                // updated again when the OTHER bound changes
    const minutesAfter = state.podOptions.availableMinutes;
    const chk = document.querySelector('.pod-group[value="chest"]');
    if (chk) { chk.checked = true; chk.dispatchEvent(new Event('change', { bubbles: true })); }
    const groupsAfter = state.podOptions.targetGroups;
    const focus = document.querySelector('#pod-focus');
    if (focus) { focus.value = 'muscle'; focus.dispatchEvent(new Event('change', { bubbles: true })); }
    return { formPresent, modeAfter, minutesAfter, valLive, valLive2, groupsAfter, focusAfter: state.podOptions.fitnessFocus };
  });
  expect(r.formPresent).toBe(true);          // the POD form renders in the cowork section
  expect(r.modeAfter).toBe('groups');        // the Target pill actually changes the mode now (was reset before)
  expect(r.valLive).toBe('30–120 min');      // feat 386 — display updates live when the max bound moves
  expect(r.valLive2).toBe('45–120 min');     // …and when the min bound moves too
  expect(r.minutesAfter).toEqual({ min: 45, max: 120 }); // the {min,max} range persists
  expect(r.groupsAfter).toContain('chest');  // group checkbox persists
  expect(r.focusAfter).toBe('muscle');       // fitness-focus select persists
});
