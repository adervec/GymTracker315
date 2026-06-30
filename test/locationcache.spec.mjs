// feat 399 — workout-start location: never trust a fix older than 12h (device-cache maximumAge + our own backfill),
// and when the live GPS read fails, look for a recent (≤12h) cached location to fill a missing one.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const H = 60 * 60 * 1000;

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof captureWorkoutStartLocation === 'function' && typeof recentCachedLocation === 'function'
    && typeof _locationFresh === 'function' && typeof LOCATION_MAX_AGE_MS !== 'undefined', null, { timeout: 15000 });
});

test('feat 399 — a fix is "fresh" only within 12h (and needs a timestamp)', async ({ page }) => {
  const r = await page.evaluate((H) => {
    const now = Date.now();
    const mk = (hAgo) => ({ lat: 1, lng: 2, at: new Date(now - hAgo * H).toISOString() });
    return {
      max: LOCATION_MAX_AGE_MS, twelveH: 12 * H,
      fresh1: _locationFresh(mk(1)), fresh11: _locationFresh(mk(11)),
      stale13: _locationFresh(mk(13)), noAt: _locationFresh({ lat: 1, lng: 2 }), nullLoc: _locationFresh(null),
    };
  }, H);
  expect(r.max).toBe(r.twelveH);
  expect(r.fresh1).toBe(true);
  expect(r.fresh11).toBe(true);
  expect(r.stale13).toBe(false);    // older than 12h → not trusted
  expect(r.noAt).toBe(false);
  expect(r.nullLoc).toBe(false);
});

test('feat 399 — the live GPS read passes maximumAge = 12h (reuse a device fix, never older)', async ({ page }) => {
  const r = await page.evaluate((H) => {
    let opts = null;
    navigator.geolocation.getCurrentPosition = (ok, err, o) => { opts = o; ok({ coords: { latitude: 50, longitude: -120, accuracy: 12 }, timestamp: Date.now() }); };
    state.readonly = false; state.gyms = []; state.sessions = [{ id: 'cur', date: new Date().toISOString(), exercises: [] }];
    captureWorkoutStartLocation({ id: 'cur' });
    const cur = state.sessions.find(s => s.id === 'cur');
    return { maxAge: opts && opts.maximumAge, twelveH: 12 * H, lat: cur.startLoc && cur.startLoc.lat, cached: cur.startLoc && cur.startLoc.cached };
  }, H);
  expect(r.maxAge).toBe(r.twelveH);
  expect(r.lat).toBe(50);
  expect(r.cached).toBeUndefined();   // a real fix, not a backfill
});

test('feat 399 — a missing location is backfilled from a recent (≤12h) session, but not a stale one', async ({ page }) => {
  const r = await page.evaluate((H) => {
    state.readonly = false; state.gyms = []; window.render = () => {}; // isolate the location logic from full re-render
    const now = Date.now();
    // GPS denied → fall back to cache
    navigator.geolocation.getCurrentPosition = (ok, err) => err({ message: 'denied' });

    // case A: a 3h-old prior fix → backfilled
    state.sessions = [
      { id: 'old', date: new Date(now - 3 * H).toISOString(), startLoc: { lat: 49.1, lng: -123.1, acc: 20, at: new Date(now - 3 * H).toISOString() } },
      { id: 'curA', date: new Date().toISOString(), exercises: [] },
    ];
    captureWorkoutStartLocation({ id: 'curA' });
    const a = state.sessions.find(s => s.id === 'curA').startLoc;

    // case B: only a 13h-old prior fix → too stale, nothing backfilled
    state.sessions = [
      { id: 'oldB', date: new Date(now - 13 * H).toISOString(), startLoc: { lat: 49.1, lng: -123.1, acc: 20, at: new Date(now - 13 * H).toISOString() } },
      { id: 'curB', date: new Date().toISOString(), exercises: [] },
    ];
    captureWorkoutStartLocation({ id: 'curB' });
    const b = state.sessions.find(s => s.id === 'curB').startLoc;

    return { aLat: a && a.lat, aCached: a && a.cached, bHasLoc: !!b };
  }, H);
  expect(r.aLat).toBe(49.1);
  expect(r.aCached).toBe(true);   // marked as a backfilled (cached) location, not a live fix
  expect(r.bHasLoc).toBe(false);  // 13h-old fix is not reused
});

test('feat 399 — a real live fix is never overwritten by the cache fallback', async ({ page }) => {
  const r = await page.evaluate((H) => {
    state.readonly = false; state.gyms = []; window.render = () => {};
    const now = Date.now();
    // a session that already has a fresh real fix; a stale-free recent cache also exists
    state.sessions = [
      { id: 'other', startLoc: { lat: 49.1, lng: -123.1, acc: 20, at: new Date(now - 1 * H).toISOString() } },
      { id: 'cur', date: new Date().toISOString(), exercises: [], startLoc: { lat: 51.0, lng: -114.0, acc: 8, at: new Date().toISOString() } },
    ];
    navigator.geolocation.getCurrentPosition = (ok, err) => err({ message: 'denied' }); // would try to backfill…
    captureWorkoutStartLocation({ id: 'cur' });
    const cur = state.sessions.find(s => s.id === 'cur').startLoc;
    return { lat: cur.lat, cached: cur.cached };
  }, H);
  expect(r.lat).toBe(51.0);          // the existing real fix is kept
  expect(r.cached).toBeUndefined();
});
