// feat 365 — the on-screen weight calculator (feat 65) gains one-tap UOM conversion: kg→lb and lb→kg keys convert the
// current value (or evaluated expression) in place. Shown only on the weight field, only in calculator mode.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openNumpad === 'function' && typeof numpadHandleKey === 'function'
    && typeof kgToLb === 'function' && typeof VAR_INDEX !== 'undefined', null, { timeout: 15000 });
  await page.evaluate(() => {
    let u = null; for (const [id] of VAR_INDEX) { if (exMode(id).mode === 'standard') { u = id; break; } }
    pending = { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }] };
    state.calcMode = true;
  });
});

test('feat 365 — conversion keys show on the weight calculator, not on reps, and not when calc is off', async ({ page }) => {
  const r = await page.evaluate(() => {
    openNumpad(0, 'w');
    const onW = !!document.querySelector('#trk-numpad [data-np="kg2lb"]') && !!document.querySelector('#trk-numpad [data-np="lb2kg"]');
    openNumpad(0, 'r');
    const onR = !!document.querySelector('#trk-numpad [data-np="kg2lb"]');
    state.calcMode = false; openNumpad(0, 'w');
    const calcOff = !!document.querySelector('#trk-numpad [data-np="kg2lb"]');
    return { onW, onR, calcOff };
  });
  expect(r.onW).toBe(true);
  expect(r.onR).toBe(false);     // reps field: no UOM conversion
  expect(r.calcOff).toBe(false); // only in calculator mode
});

test('feat 365 — kg→lb converts the current value in place', async ({ page }) => {
  const buf = await page.evaluate(() => {
    openNumpad(0, 'w');
    numpadHandleKey('1'); numpadHandleKey('0'); numpadHandleKey('0'); // 100
    numpadHandleKey('kg2lb');
    return modalState.numpad.buf;
  });
  expect(Number(buf)).toBeCloseTo(220.5, 1); // 100 kg ≈ 220.5 lb
});

test('feat 365 — lb→kg converts back, and conversion respects a full expression (BEDMAS)', async ({ page }) => {
  const r = await page.evaluate(() => {
    openNumpad(0, 'w');
    numpadHandleKey('2'); numpadHandleKey('2'); numpadHandleKey('0'); // 220
    numpadHandleKey('lb2kg');
    const back = modalState.numpad.buf;
    modalState.numpad.buf = '45+45';   // evaluate the whole expression, then convert
    numpadHandleKey('kg2lb');
    return { back, expr: modalState.numpad.buf };
  });
  expect(Number(r.back)).toBeCloseTo(99.8, 1);  // 220 lb ≈ 99.8 kg
  expect(Number(r.expr)).toBeCloseTo(198.4, 1); // (45+45) kg ≈ 198.4 lb
});

test('feat 365 — converting an empty buffer is a no-op', async ({ page }) => {
  const buf = await page.evaluate(() => { openNumpad(0, 'w'); numpadHandleKey('kg2lb'); return modalState.numpad.buf; });
  expect(buf).toBe('');
});
