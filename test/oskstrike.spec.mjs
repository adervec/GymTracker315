// feat 202 — the OSK equipment-setup key passively shows STRIKETHROUGH text when the tool is not in
// effect: nothing configured yet (total 0), or the variation's tool override is "none" (the strip now
// stays visible in that state — struck, with the ⚙ configurator still reachable — instead of vanishing).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderNpSetup === 'function' && typeof openNumpad === 'function' && typeof solveSetupState === 'function', null, { timeout: 15000 });
});

// Find a standard-mode variation with an EMPTY-default setup tool (dumbbell/kettlebell/plate/pin —
// a barbell's default is the bar itself, so its total is never 0), select it, open the weight numpad.
const armNumpad = (page) => page.evaluate(() => {
  normalizeState();
  let u = null, kind = null;
  for (const [uu, info] of VAR_INDEX) {
    const k = autoSetupKind(uu);
    if (['dumbbell', 'kettlebell', 'medicineball', 'plate', 'pin'].includes(k) && exMode(uu).mode === 'standard') { u = uu; kind = k; break; }
  }
  state.exerciseSetup = {};                 // no override
  openLogModal();
  modalState.showPicker = false; modalState.isEditing = false;
  pending.varUuid = u; pending.subUuid = null;
  pending.sets = [{ w: '', r: '' }];
  modalState.setup = {};                    // nothing configured yet
  modalState.setupOpen = false;
  renderModal();
  openNumpad(0, 'w');
  return { u, kind };
});

const useBtn = (page) => page.evaluate(() => {
  const b = document.querySelector('#trk-numpad .np-setup-use');
  return b ? { struck: b.classList.contains('struck'), disabled: b.disabled, text: b.textContent.trim() } : null;
});

test('unconfigured tool (total 0) → the setup key text is struck through and inert', async ({ page }) => {
  await armNumpad(page);
  const b = await useBtn(page);
  expect(b).not.toBeNull();
  expect(b.struck).toBe(true);     // passive strikethrough
  expect(b.disabled).toBe(true);   // nothing to apply
});

test('a configured total un-strikes the key and shows the weight', async ({ page }) => {
  const { kind } = await armNumpad(page);
  await page.evaluate((kind) => {
    modalState.setup[kind] = solveSetupState(kind, 100);  // configure ~100 via the canonical solver
    renderNumpad();
  }, kind);
  const b = await useBtn(page);
  expect(b.struck).toBe(false);            // in effect → no strikethrough
  expect(b.disabled).toBe(false);
  expect(b.text).toMatch(/\d/);            // the total shows on the key
});

test('tool override "none" keeps the strip visible — struck, marked off, ⚙ still reachable', async ({ page }) => {
  const { u } = await armNumpad(page);
  const r = await page.evaluate((u) => {
    setSetupOverride(u, 'none');
    renderNumpad();
    const b = document.querySelector('#trk-numpad .np-setup-use');
    const cfg = document.querySelector('#trk-numpad [data-np-setup-toggle]');
    modalState.setupOpen = true; renderNumpad();          // open the configurator…
    const toolsel = document.querySelector('#trk-numpad [data-np-toolsel]');
    modalState.setupOpen = false; setSetupOverride(u, 'auto');
    return { present: !!b, struck: b && b.classList.contains('struck'), off: b && /off/.test(b.textContent), cfg: !!cfg, toolsel: !!toolsel };
  }, u);
  expect(r.present).toBe(true);   // feat 202 — no longer hidden when overridden off
  expect(r.struck).toBe(true);
  expect(r.off).toBe(true);       // "· off" suffix says why
  expect(r.cfg).toBe(true);       // the ⚙ toggle is there…
  expect(r.toolsel).toBe(true);   // …and opens the Tool selector to flip it back
});

test('reps-field numpads never show the setup strip', async ({ page }) => {
  await armNumpad(page);
  const present = await page.evaluate(() => { openNumpad(0, 'r'); return !!document.querySelector('#trk-numpad .np-setup'); });
  expect(present).toBe(false);
});
