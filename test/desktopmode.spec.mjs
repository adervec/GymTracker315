// feat 452 — desktop mode. A fine pointer + hover → a mouse-driven desktop → body.desktop (centered, denser
// layout) and a keyboard-driven on-screen numpad (type + Enter instead of clicking the # keys). The two
// Playwright projects give both worlds for free: desktop-chromium (mouse) vs mobile-pixel (touch).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof isDesktopMode === 'function' && typeof openNumpad === 'function'
    && typeof numpadHandleKey === 'function', null, { timeout: 15000 });
});

test('desktop-chromium is detected as desktop and gets the body.desktop class', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only assertion');
  const r = await page.evaluate(() => ({ desktop: isDesktopMode(), cls: document.body.classList.contains('desktop') }));
  expect(r.desktop).toBe(true);
  expect(r.cls).toBe(true);
});

test('mobile-pixel is NOT desktop and never gets the class', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-pixel', 'mobile-only assertion');
  const r = await page.evaluate(() => ({ desktop: isDesktopMode(), cls: document.body.classList.contains('desktop') }));
  expect(r.desktop).toBe(false);
  expect(r.cls).toBe(false);
});

// The keyboard→numpad path only arms on desktop, so drive it under the desktop project.
const seedWeightNumpad = (page) => page.evaluate(() => {
  let stdUuid = null;
  for (const [uuid] of VAR_INDEX) { if (exMode(uuid).mode === 'standard') { stdUuid = uuid; break; } }
  state.calcMode = false;
  state.workoutControls = state.workoutControls || {};
  state.workoutControls.onScreenNumpad = true;
  pending = { varUuid: stdUuid, subUuid: null, sets: [{ w: '', r: '' }] };
  openNumpad(0, 'w');
});

const key = (page, k) => page.evaluate((k) => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}, k);

test('desktop: typing digits builds the numpad buffer; Enter commits + advances to reps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'keyboard entry is desktop-only');
  await seedWeightNumpad(page);
  for (const d of ['1', '3', '5']) await key(page, d);
  expect(await page.evaluate(() => modalState.numpad.buf)).toBe('135');
  // the field must NOT change mid-entry (feat 279 deferred write)
  expect(await page.evaluate(() => pending.sets[0].w)).toBe('');
  await key(page, 'Enter');                       // Next: commit weight, open reps
  const afterW = await page.evaluate(() => ({ w: pending.sets[0].w, field: modalState.numpad.field, open: modalState.numpad.open }));
  expect(Number(afterW.w)).toBe(135);
  expect(afterW.field).toBe('r');
  expect(afterW.open).toBe(true);
  await key(page, '8');
  await key(page, 'Enter');                       // last field → commit reps, close
  const done = await page.evaluate(() => ({ r: pending.sets[0].r, open: modalState.numpad.open }));
  expect(Number(done.r)).toBe(8);
  expect(done.open).toBe(false);
});

test('desktop: Backspace deletes; Escape closes the numpad without closing the log sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'keyboard entry is desktop-only');
  await page.evaluate(() => { openLogModal(); });
  await seedWeightNumpad(page);
  for (const d of ['9', '9', '5']) await key(page, d);
  await key(page, 'Backspace');
  expect(await page.evaluate(() => modalState.numpad.buf)).toBe('99');
  await key(page, 'Escape');
  const r = await page.evaluate(() => ({ np: modalState.numpad.open, modal: document.getElementById('trk-modal').classList.contains('open') }));
  expect(r.np).toBe(false);      // Escape closed the numpad…
  expect(r.modal).toBe(true);    // …but NOT the whole log sheet
});

test('desktop: with the numpad closed, keydown does nothing (no hijack of the rest of the app)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'keyboard entry is desktop-only');
  await page.evaluate(() => {
    let stdUuid = null; for (const [uuid] of VAR_INDEX) { if (exMode(uuid).mode === 'standard') { stdUuid = uuid; break; } }
    pending = { varUuid: stdUuid, subUuid: null, sets: [{ w: '', r: '' }] };
    if (modalState.numpad) modalState.numpad.open = false;
  });
  await key(page, '5');
  expect(await page.evaluate(() => pending.sets[0].w)).toBe(''); // untouched
});
