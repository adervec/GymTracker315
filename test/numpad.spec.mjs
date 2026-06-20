// feat 100 — on-screen numpad digit long-press: holding a digit from an EMPTY field enters that
// digit x10 (hold 7 -> 70); a quick tap appends the digit; with digits already present (or in
// calculator mode) a hold is just a normal short press.
// feat 141 — the ×10 hold is gated to the WEIGHT field only (reps stay literal). The cases below open
// the weight numpad; a dedicated reps case asserts the hold is inert there.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.openNumpad === 'function' && typeof window.attachNumpadDigit === 'function', null, { timeout: 15000 });
  // Put a standard-mode exercise into the pending log and open the reps numpad.
  await page.evaluate(() => {
    let stdUuid = null;
    for (const [uuid] of VAR_INDEX) { if (exMode(uuid).mode === 'standard') { stdUuid = uuid; break; } }
    state.calcMode = false;
    pending = { varUuid: stdUuid, subUuid: null, sets: [{ w: '', r: '' }] };
  });
});

const press = async (page, digit, holdMs) => page.evaluate(async ({ digit, holdMs }) => {
  const btn = document.querySelector('#trk-numpad [data-np="' + digit + '"]');
  if (!btn) return '__nokey__';
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, holdMs));
  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));
  return modalState.numpad.buf;
}, { digit, holdMs });

test('holding a digit from an empty WEIGHT field enters digit x10', async ({ page }) => {
  await page.evaluate(() => openNumpad(0, 'w'));
  const buf = await press(page, '7', 450); // hold past the 400ms threshold
  expect(buf).toBe('70');
});

test('a quick tap just appends the digit', async ({ page }) => {
  await page.evaluate(() => openNumpad(0, 'w'));
  const buf = await press(page, '7', 40); // released well under 400ms
  expect(buf).toBe('7');
});

test('once digits are present, a hold behaves like a short press (no x10)', async ({ page }) => {
  await page.evaluate(() => openNumpad(0, 'w'));
  const first = await press(page, '7', 40);  // -> "7"
  expect(first).toBe('7');
  const second = await press(page, '5', 450); // buffer non-empty -> hold == tap -> "75"
  expect(second).toBe('75');
});

test('holding 0 from empty stays 0 (no negative/odd state)', async ({ page }) => {
  await page.evaluate(() => openNumpad(0, 'w'));
  const buf = await press(page, '0', 450);
  expect(buf).toBe('0');
});

test('feat 279 — the buffered value commits to the set field on Done, not mid-entry', async ({ page }) => {
  await page.evaluate(() => openNumpad(0, 'w'));
  await press(page, '9', 450); // -> buffer 90
  const before = await page.evaluate(() => pending.sets[0].w);
  expect(before === '' || before == null).toBe(true);  // feat 279 — typing does NOT change the field
  await page.evaluate(() => numpadHandleKey('done'));
  const after = await page.evaluate(() => pending.sets[0].w);
  expect(Number(after)).toBe(90);                       // Done commits it
});

test('feat 141 — holding a digit on the REPS field does NOT x10 (reps stay literal)', async ({ page }) => {
  await page.evaluate(() => openNumpad(0, 'r'));
  const held = await press(page, '7', 450); // a long hold on reps == a normal tap
  expect(held).toBe('7');                   // not "70"
  await page.evaluate(() => numpadHandleKey('done')); // feat 279 — commit on Done
  const r = await page.evaluate(() => pending.sets[0].r);
  expect(Number(r)).toBe(7);
  // the ×10 affordance label is never armed on the reps key
  const armed = await page.evaluate(() => {
    const btn = document.querySelector('#trk-numpad [data-np="5"]');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    const lbl = btn.getAttribute('data-lp-label');
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return lbl;
  });
  expect(armed).toBe(null); // no "×10" hint on reps
});
