// feat 465 — multi-user hardening. The app now has users who are not the developer, on their own phones,
// with no telemetry and no support channel. Three gaps that only matter once that is true: an update the
// user can apply, an error they can show someone, and a warning before localStorage eviction eats their
// history. Plus navigator.storage.persist() to make that last one less likely in the first place.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof toast === 'function' && typeof backupIsStale === 'function'
    && typeof logText === 'function' && typeof state !== 'undefined', null, { timeout: 15000 });
});

const DAY = 86400000;
const agoIso = d => new Date(Date.now() - d * DAY).toISOString();

test('feat 465 — a toast with an action is tappable, runs once, and dies with the toast', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const t = document.getElementById('trk-toast');
    window.__hits = 0;
    toast('tap me', 60000, () => { window.__hits++; });
    const armed = { action: !!window._toastAction, cls: t.classList.contains('toast-action') };
    t.click();
    const afterFirst = { hits: window.__hits, shown: t.classList.contains('show') };
    t.click();                       // a second tap must NOT re-fire it
    const afterSecond = window.__hits;

    // a plain toast still just dismisses, and must not inherit the previous toast's action
    toast('plain');
    const plain = { action: window._toastAction, cls: t.classList.contains('toast-action') };
    t.click();
    const plainHits = window.__hits;

    // an action that throws still dismisses cleanly and does not stay armed
    toast('boom', 60000, () => { throw new Error('x'); });
    t.click();
    const afterThrow = { action: window._toastAction, shown: t.classList.contains('show') };

    // and a toast that fades out on its own disarms
    toast('brief', 30, () => { window.__hits += 100; });
    await new Promise(res => setTimeout(res, 120));
    return { armed, afterFirst, afterSecond, plain, plainHits, afterThrow, faded: window._toastAction, fadedHits: window.__hits };
  });
  expect(r.armed).toEqual({ action: true, cls: true });
  expect(r.afterFirst).toEqual({ hits: 1, shown: false });
  expect(r.afterSecond, 'one-shot — tapping a dismissed toast does nothing').toBe(1);
  expect(r.plain.action, 'a plain toast clears the previous action').toBeNull();
  expect(r.plain.cls).toBe(false);
  expect(r.plainHits, 'tapping a plain toast only dismisses it').toBe(1);
  expect(r.afterThrow, 'a throwing action is swallowed, not left armed').toEqual({ action: null, shown: false });
  expect(r.faded).toBeNull();
  expect(r.fadedHits, 'a faded toast cannot be acted on').toBe(1);
});

test('feat 465 — the update path asks for a reload rather than telling the user to reopen the app', async ({ page }) => {
  const src = await page.evaluate(() => document.documentElement.outerHTML);
  // the toast carries an action; the old copy told people to reopen the app themselves
  expect(src).toContain('Update ready — tap to reload');
  expect(src).not.toContain('reopen the app to apply');
  expect(src).toMatch(/reg\.update\(\)/);
  expect(src, 'the foreground re-check is throttled so tab-flipping cannot hammer the network')
    .toMatch(/now - lastCheck < 60000/);
  expect(src).toMatch(/navigator\.storage\.persist\(\)/);
});

test('feat 465 — the log can be shared, and the shared text is the exported text', async ({ page }) => {
  const r = await page.evaluate(() => {
    logInfo('hardening probe', 'detail-here');
    renderSettingsDrawer();
    const txt = logText();
    return {
      hasBtn: !!document.querySelector('#log-share-btn'),
      shareIsFn: typeof shareLog === 'function',
      carriesEntry: txt.includes('hardening probe') && txt.includes('detail-here'),
      hasHeader: txt.startsWith('GymTracker315 activity & error log'),
      // the log is diagnostics only — it must not become a data-exfil path
      noWorkoutData: !txt.includes('varUuid') && !txt.includes('"sessions"'),
    };
  });
  expect(r.hasBtn).toBe(true);
  expect(r.shareIsFn).toBe(true);
  expect(r.carriesEntry).toBe(true);
  expect(r.hasHeader).toBe(true);
  expect(r.noWorkoutData).toBe(true);
});

test('feat 465 — the backup nudge fires only when there is something to lose and no other copy', async ({ page }) => {
  const r = await page.evaluate((ago) => {
    const set = (sessions, cloud, backup) => {
      state.sessions = Array.from({ length: sessions }, () => ({ exercises: [] }));
      state.cloudSync = { ...state.cloudSync, ...cloud };
      state.backupLocal = { lastAt: null, nudgedAt: null, ...backup };
      return backupIsStale();
    };
    const old = { lastAt: ago.d60 }, fresh = { lastAt: ago.d3 };
    const off = { enabled: false, provider: null };
    return {
      neverExported: set(20, off, {}),
      staleExport: set(20, off, old),
      recentExport: set(20, off, fresh),
      cloudOn: set(20, { enabled: true, provider: 'gdrive' }, old),
      cloudHalfOn: set(20, { enabled: true, provider: null }, old),   // enabled but never connected → still at risk
      tooLittleData: set(2, off, old),
      justNudged: set(20, off, { lastAt: ago.d60, nudgedAt: ago.d1 }),
      nudgedLongAgo: set(20, off, { lastAt: ago.d60, nudgedAt: ago.d20 }),
    };
  }, { d1: agoIso(1), d3: agoIso(3), d20: agoIso(20), d60: agoIso(60) });

  expect(r.neverExported, 'no export ever + real history = the case this exists for').toBe(true);
  expect(r.staleExport).toBe(true);
  expect(r.recentExport).toBe(false);
  expect(r.cloudOn, 'cloud sync IS a backup — never nag a synced device').toBe(false);
  expect(r.cloudHalfOn, 'enabled with no provider is not a backup').toBe(true);
  expect(r.tooLittleData, 'a brand-new user has nothing worth exporting yet').toBe(false);
  expect(r.justNudged, 'at most one nudge a week').toBe(false);
  expect(r.nudgedLongAgo).toBe(true);
});

test('feat 465 — nudging stamps itself so it does not repeat, and exporting silences it', async ({ page }) => {
  const r = await page.evaluate((d60) => {
    state.sessions = Array.from({ length: 20 }, () => ({ exercises: [] }));
    state.cloudSync = { ...state.cloudSync, enabled: false, provider: null };
    state.backupLocal = { lastAt: d60, nudgedAt: null };

    const shown = [];
    const realToast = window.toast;
    window.toast = (msg, ms, action) => { shown.push({ msg, action: typeof action }); };
    backupNudge();
    const stampedAfterFirst = !!state.backupLocal.nudgedAt;
    backupNudge();                                    // immediately again — must stay quiet
    const count = shown.length;
    window.toast = realToast;

    // and a real export clears the staleness outright
    state.backupLocal = { lastAt: new Date().toISOString(), nudgedAt: null };
    const afterExport = backupIsStale();

    return { count, stampedAfterFirst, msg: shown[0] && shown[0].msg, action: shown[0] && shown[0].action, afterExport,
      // the "when did I last back THIS device up" stamp must never ride the cloud file to another device
      deviceLocal: NEVER_SYNC_EXTRA.includes('backupLocal') && !('backupLocal' in syncPayload(state)),
      // and it must survive a reload, or the nudge repeats every boot
      persisted: 'backupLocal' in JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  }, agoIso(60));

  expect(r.count, 'the stamp is written whether or not the user acts on it').toBe(1);
  expect(r.stampedAfterFirst).toBe(true);
  expect(r.msg).toContain('No backup in a while');
  expect(r.action, 'the nudge carries the export action — tapping it is the fix').toBe('function');
  expect(r.afterExport).toBe(false);
  expect(r.deviceLocal).toBe(true);
  expect(r.persisted).toBe(true);
});
