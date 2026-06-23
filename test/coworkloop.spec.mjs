// feat 320 — periodic cloud sync + post-pull re-export, loop hardening. coworkAfterPull must re-export ONLY
// for a genuinely-new, finished, foreign-origin workout (never own-device / open / already-present / mid-import /
// hub-disabled) — that's what keeps the export→import→cloud→pull→re-export cycle from running away.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkAfterPull === 'function' && typeof coworkCloudTimerStart === 'function'
    && typeof coworkExportLater === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('periodicMinutes defaults to 30 and the cloud timer arms without error when idle', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    let threw = false; try { coworkCloudTimerStart(); } catch (_) { threw = true; }
    return { periodic: state.cloudSync.periodicMinutes, threw };
  });
  expect(r.periodic).toBe(30);
  expect(r.threw).toBe(false);
});

test('coworkAfterPull re-exports ONLY for a new, ended, foreign-origin workout (loop guard)', async ({ page }) => {
  const r = await page.evaluate(() => {
    let calls = 0; const orig = coworkExportLater; window.coworkExportLater = () => { calls++; }; // spy
    state.cowork = { ...state.cowork, enabled: true }; state.deviceId = 'me';
    const prev = new Set(['s-old']);
    const foreignEnded = { id: 's-new', date: '2026-06-22T10:00:00Z', endedAt: '2026-06-22T11:00:00Z', origin: 'phone', exercises: [] };
    const ownEnded = { id: 's-own', date: '2026-06-22T10:00:00Z', endedAt: '2026-06-22T11:00:00Z', origin: 'me', exercises: [] };
    const open = { id: 's-open', date: '2026-06-22T10:00:00Z', origin: 'phone', exercises: [] };
    const fire = (sessions, prevKeys, pre) => { if (pre) pre(); const c = calls; state.sessions = sessions; coworkAfterPull(prevKeys || prev); return calls - c; };
    const out = {
      foreign: fire([foreignEnded]),                 // YES
      own: fire([ownEnded]),                          // no — own device
      open: fire([open]),                             // no — not finished
      present: fire([foreignEnded], new Set(['s-new'])), // no — already present (convergence)
      disabled: fire([foreignEnded], prev, () => { state.cowork.enabled = false; }),
      importing: (() => { state.cowork.enabled = true; _coworkImporting = true; const v = fire([foreignEnded]); _coworkImporting = false; return v; })(),
    };
    window.coworkExportLater = orig;
    return out;
  });
  expect(r.foreign).toBe(1);
  expect(r.own).toBe(0);
  expect(r.open).toBe(0);
  expect(r.present).toBe(0);   // loop converges — a pull that brings nothing new re-exports nothing
  expect(r.disabled).toBe(0);
  expect(r.importing).toBe(0); // never re-export mid-import
});
