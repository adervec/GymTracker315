// feat 105 — headphone-only audio (default on): suppress audio output unless it's routed to
// headphones (best-effort, fail-open when undetectable). Haptics are never gated.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.headphoneGatePasses === 'function'
    && typeof window.probeAudioOutput === 'function'
    && typeof window.audioHeadphonesOnly === 'function', null, { timeout: 15000 });
});

test('defaults on and is a persisted setting', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    saveState();
    return { on: audioHeadphonesOnly(), persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).audioHeadphonesOnly, inKeys: SETTINGS_KEYS.includes('audioHeadphonesOnly') };
  });
  expect(r.on).toBe(true);
  expect(r.persisted).toBe(true);
  expect(r.inKeys).toBe(true);
});

test('gate truth table: blocks only when ON and headphones positively absent', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    state.audioHeadphonesOnly = true;
    _headphonesConnected = false; out.onAbsent = headphoneGatePasses();   // confirmed speaker -> block
    _headphonesConnected = true;  out.onPresent = headphoneGatePasses();  // headphones -> allow
    _headphonesConnected = null;  out.onUnknown = headphoneGatePasses();  // unknown -> fail open
    state.audioHeadphonesOnly = false;
    _headphonesConnected = false; out.offAbsent = headphoneGatePasses();  // setting off -> always allow
    return out;
  });
  expect(r.onAbsent).toBe(false);
  expect(r.onPresent).toBe(true);
  expect(r.onUnknown).toBe(true);
  expect(r.offAbsent).toBe(true);
});

test('probeAudioOutput classifies output device labels', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const set = (devs) => { navigator.mediaDevices.enumerateDevices = async () => devs; };
    set([{ kind: 'audiooutput', label: 'Galaxy Buds (Bluetooth)', deviceId: 'a' }, { kind: 'audiooutput', label: 'Speaker', deviceId: 'default' }]);
    await probeAudioOutput(); const headphones = _headphonesConnected;
    set([{ kind: 'audiooutput', label: 'Speaker', deviceId: 'default' }]);
    await probeAudioOutput(); const speakerOnly = _headphonesConnected;
    set([{ kind: 'audiooutput', label: '', deviceId: 'default' }]); // no labels -> unknown
    await probeAudioOutput(); const unknown = _headphonesConnected;
    return { headphones, speakerOnly, unknown };
  });
  expect(r.headphones).toBe(true);
  expect(r.speakerOnly).toBe(false);
  expect(r.unknown).toBe(null);
});

test('feat 140 — a Bluetooth headset is never mistaken for the built-in speaker (fail open)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const cls = (labels) => classifyAudioOutputs(labels);
    return {
      // the reported bug: a BT headset shown only by brand, alongside the built-in speaker. We can't
      // positively confirm headphones from the brand alone, but we must NOT mute -> unknown (fail open).
      brandBtPlusSpeaker: cls(['Sony WH-1000XM4', 'Speaker (Built-in)']),
      brandBtOnly: cls(['Bose QC35 II']),
      // positive headphone signals -> headphones detected even with a speaker also present
      buds: cls(['Galaxy Buds Pro (Bluetooth)', 'Speaker']),
      airpods: cls(['AirPods Pro', 'Speaker']),
      wired: cls(['Wired Headphones', 'Speaker']),
      btKeyword: cls(['LE-Bose QC (Bluetooth)']),
      handsFree: cls(['Pixel Buds (hands-free)']),
      // confirmed built-in only -> muted
      speakerOnly: cls(['Speaker']),
      earpiece: cls(['Earpiece', 'Speakerphone']),
      // nothing to go on -> unknown
      none: cls([]),
      blank: cls(['', '']),
    };
  });
  expect(r.brandBtPlusSpeaker).toBe(null); // fail open: audio is NOT muted (the bug)
  expect(r.brandBtOnly).toBe(null);
  expect(r.buds).toBe(true);
  expect(r.airpods).toBe(true);
  expect(r.wired).toBe(true);
  expect(r.btKeyword).toBe(true);
  expect(r.handsFree).toBe(true);
  expect(r.speakerOnly).toBe(false);
  expect(r.earpiece).toBe(false);
  expect(r.none).toBe(null);
  expect(r.blank).toBe(null);
});

test('feat 140 — the headphone gate lets audio through for a brand-name Bluetooth headset', async ({ page }) => {
  const r = await page.evaluate(async () => {
    state.audioHeadphonesOnly = true;
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: 'audiooutput', label: 'Speaker (Built-in)', deviceId: 'default' },
      { kind: 'audiooutput', label: 'Sony WH-1000XM4', deviceId: 'bt' },
      { kind: 'audioinput', label: 'Microphone', deviceId: 'mic' }, // inputs are ignored
    ];
    await probeAudioOutput();
    return { connected: _headphonesConnected, gate: headphoneGatePasses() };
  });
  expect(r.connected).toBe(null);   // ambiguous output -> unknown
  expect(r.gate).toBe(true);        // fail open -> audio is NOT muted (fixes the report)
});

test('headphoneStatus summarizes each state for the settings UI', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.audioHeadphonesOnly = false; const off = headphoneStatus().text;
    state.audioHeadphonesOnly = true;
    _headphonesConnected = true;  const present = headphoneStatus().icon;
    _headphonesConnected = false; const absent = headphoneStatus().icon;
    _headphonesConnected = null;  const unknown = headphoneStatus().icon;
    return { off, present, absent, unknown };
  });
  expect(r.off).toMatch(/Off/);
  expect(r.present).toBe('🎧');
  expect(r.absent).toBe('🔇');
  expect(r.unknown).toBe('❔');
});

test('a real beep is suppressed when speaker-only, allowed when headphones present', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sound = { audio: true, haptics: true, volume: 1 };
    state.audioHeadphonesOnly = true;
    // spy on oscillator creation — the real metroBeep bails out before creating one when gated
    const AC = window.AudioContext || window.webkitAudioContext;
    let osc = 0; const orig = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { osc++; return orig.call(this); };
    _headphonesConnected = false; metroBeep(880, 0.3); const blocked = osc;
    _headphonesConnected = true;  metroBeep(880, 0.3); const allowed = osc;
    AC.prototype.createOscillator = orig;
    return { blocked, allowed };
  });
  expect(r.blocked).toBe(0);          // speaker-only -> gated, no oscillator created
  expect(r.allowed).toBeGreaterThan(0); // headphones -> sound plays
});

test('haptics are NOT gated by headphone-only', async ({ page }) => {
  const vibrated = await page.evaluate(() => {
    state.sound = { audio: true, haptics: true, volume: 1 };
    state.audioHeadphonesOnly = true; _headphonesConnected = false; // audio would be blocked
    let calls = 0; navigator.vibrate = () => { calls++; return true; };
    safeVibrate(20);
    return calls;
  });
  expect(vibrated).toBe(1); // vibration still fires regardless of headphone gate
});
