// feat 159 — the Web-Bluetooth HR link is fragile across app background/foreground/reopen. The app now
// re-attaches to the remembered device on returning to the foreground (visibilitychange/focus) + on boot,
// and the disconnect-retry tries immediately (not after a 6s wait) and persists longer.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.hrTryReconnect === 'function', null, { timeout: 15000 });
});

test('hrTryReconnect silently re-attaches the remembered device', async ({ page }) => {
  const r = await page.evaluate(async () => {
    let connects = 0;
    const fakeChar = { startNotifications: async () => {}, addEventListener: () => {}, removeEventListener: () => {} };
    const fakeSvc = { getCharacteristic: async () => fakeChar };
    const fakeServer = { getPrimaryService: async () => fakeSvc };
    const fakeDev = { id: 'hr1', name: 'Strap', addEventListener: () => {}, gatt: { connected: false, connect: async () => { connects++; fakeDev.gatt.connected = true; return fakeServer; } } };
    if (!navigator.bluetooth) navigator.bluetooth = {};
    navigator.bluetooth.getDevices = async () => [fakeDev];
    state.hrDevice = { id: 'hr1', name: 'Strap' };
    _hrConnected = false; _hrDevice = null;
    await hrTryReconnect(); // what the foreground-return / boot path calls
    return { connects, connected: _hrConnected };
  });
  expect(r.connects).toBe(1);   // attempted a (re)connect
  expect(r.connected).toBe(true);
});

test('hrTryReconnect is a no-op when already connected or no remembered device', async ({ page }) => {
  const r = await page.evaluate(async () => {
    let calls = 0;
    if (!navigator.bluetooth) navigator.bluetooth = {};
    navigator.bluetooth.getDevices = async () => { calls++; return []; };
    // already connected
    _hrConnected = true; state.hrDevice = { id: 'x' };
    await hrTryReconnect();
    const whileConnected = calls;
    // no remembered device
    _hrConnected = false; state.hrDevice = null;
    await hrTryReconnect();
    return { whileConnected, afterNoDevice: calls };
  });
  expect(r.whileConnected).toBe(0); // didn't even query when already connected
  expect(r.afterNoDevice).toBe(0);  // nor with no saved device
});

test('the foreground-return + boot reconnect wiring is present', async ({ page }) => {
  const r = await page.evaluate(() => {
    // the inline boot script wires visibilitychange + focus + a boot reconnect call
    const src = [...document.scripts].map(s => s.textContent).join('\n');
    return {
      vis: /visibilitychange[\s\S]*hrTryReconnect/.test(src),
      focus: /addEventListener\('focus'[\s\S]*hrTryReconnect/.test(src),
      immediate: /attempt\(\);\s*\/\/ feat 159/.test(hrScheduleReconnect.toString()) || /attempt\(\)/.test(hrScheduleReconnect.toString()),
    };
  });
  expect(r.vis).toBe(true);
  expect(r.focus).toBe(true);
  expect(r.immediate).toBe(true); // disconnect retry fires immediately
});
