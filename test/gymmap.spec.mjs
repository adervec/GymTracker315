// feat 370 — a self-contained slippy map (OpenStreetMap raster tiles, no library) on the Gyms page to view / add /
// move / delete gyms. Web-Mercator projection round-trips; markers render for gyms with coords; ➕ tap-to-add and
// pin-drag-to-move update the gym's lat/lng. The Google Maps search link is gone.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderGymsTab === 'function' && typeof _gmProj === 'function'
    && typeof newGym === 'function' && typeof navTo === 'function', null, { timeout: 15000 });
});

test('feat 370 — Web-Mercator projection round-trips lat/lng ↔ world pixels', async ({ page }) => {
  const r = await page.evaluate(() => {
    const P = _gmProj(14);
    const pts = [[0, 0], [40.7128, -74.006], [-33.8688, 151.2093], [51.5074, -0.1278]];
    return pts.map(([lat, lng]) => ({ lat, lng, lat2: P.lat(P.y(lat)), lng2: P.lng(P.x(lng)) }));
  });
  r.forEach(p => { expect(p.lat2).toBeCloseTo(p.lat, 5); expect(p.lng2).toBeCloseTo(p.lng, 5); });
});

test('feat 370 — the Gyms page renders the map; pins appear only for gyms with coords', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.gyms = [
      { id: 'a', name: 'Home Gym', equip: {}, lat: 40.0, lng: -74.0 },
      { id: 'b', name: 'No Coords', equip: {}, lat: null, lng: null },
    ];
    state.activeGymId = 'a';
    _gmap = null;                              // fresh view → centres on the active gym
    navTo('gyms', { replace: true });
    const map = document.getElementById('gym-map');
    return {
      hasMap: !!map,
      tiles: document.querySelectorAll('#gmap-tiles img').length,
      pins: document.querySelectorAll('#gmap-markers [data-gm-pin]').length,
      activePin: !!document.querySelector('#gmap-markers .gmap-pin.active[data-gm-pin="a"]'),
      centeredOnA: Math.abs(_gmap.lat - 40.0) < 0.001 && Math.abs(_gmap.lng - (-74.0)) < 0.001,
      noGoogle: !document.body.innerHTML.includes('google.com/maps'),
    };
  });
  expect(r.hasMap).toBe(true);
  expect(r.tiles).toBeGreaterThan(0);       // OSM tiles requested for the viewport
  expect(r.pins).toBe(1);                    // only the gym with coords
  expect(r.activePin).toBe(true);            // the active gym's pin is highlighted
  expect(r.centeredOnA).toBe(true);
  expect(r.noGoogle).toBe(true);             // the Google Maps link is gone
});

test('feat 370 — zoom controls change the tile zoom and re-render', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.gyms = [{ id: 'a', name: 'G', equip: {}, lat: 10, lng: 10 }];
    _gmap = null; navTo('gyms', { replace: true });
    const z0 = _gmap.z;
    document.querySelector('#gym-map [data-gm="in"]').click();
    const z1 = _gmap.z;
    document.querySelector('#gym-map [data-gm="out"]').click();
    document.querySelector('#gym-map [data-gm="out"]').click();
    const z2 = _gmap.z;
    return { z0, z1, z2, src: document.querySelector('#gmap-tiles img')?.getAttribute('src') };
  });
  expect(r.z1).toBe(r.z0 + 1);
  expect(r.z2).toBe(r.z0 - 1);
  expect(r.src).toContain(`/${r.z2}/`);     // tile URL reflects the current zoom
});

test('feat 370 — ➕ add mode places a gym, and a programmatic move updates coords', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.gyms = []; state.activeGymId = null;
    _gmap = { lat: 45, lng: -75, z: 14, addMode: false, me: null };
    navTo('gyms', { replace: true });
    const addBtn = document.querySelector('#gym-map [data-gm="add"]');
    addBtn.click();                                   // toggle add mode on
    const adding = _gmap.addMode && document.getElementById('gym-map').classList.contains('adding');
    // simulate "tap to add at the map centre" via the same path the pointerup handler uses
    const g = newGym('Tapped Gym', 'everything'); g.lat = _gmap.lat; g.lng = _gmap.lng; saveState();
    const placedAt = [g.lat, g.lng];                  // snapshot BEFORE the move (g is a live reference)
    g.lat = 46.5; g.lng = -73.2; saveState();          // move it
    const movedAt = [state.gyms.find(x => x.id === g.id).lat, state.gyms.find(x => x.id === g.id).lng];
    return { adding, placedAt, movedAt, count: state.gyms.length };
  });
  expect(r.adding).toBe(true);
  expect(r.placedAt[0]).toBeCloseTo(45, 5);
  expect(r.placedAt[1]).toBeCloseTo(-75, 5);
  expect(r.movedAt).toEqual([46.5, -73.2]);
  expect(r.count).toBe(1);
});

test('feat 371 — startWorkout records the raw GPS start location; the map dots un-gym\'d ones', async ({ page }) => {
  const r = await page.evaluate(async () => {
    navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 48.85, longitude: 2.29, accuracy: 12 } });
    state.readonly = false; state.gyms = []; state.sessions = []; state.activeGymId = null;
    startWorkout();
    await new Promise(r => setTimeout(r, 30));
    const sess = state.sessions[0];
    _gmap = { lat: 48.85, lng: 2.29, z: 14, addMode: false, me: null };
    navTo('gyms', { replace: true });
    return { startLoc: sess && sess.startLoc, dots: document.querySelectorAll('#gmap-markers .gmap-wo').length };
  });
  expect(r.startLoc).toBeTruthy();
  expect(r.startLoc.lat).toBeCloseTo(48.85, 4);
  expect(r.startLoc.lng).toBeCloseTo(2.29, 4);
  expect(r.startLoc.acc).toBe(12);
  expect(typeof r.startLoc.at).toBe('string');   // timestamped
  expect(r.dots).toBeGreaterThanOrEqual(1);      // the recorded location is dotted on the map for reconciliation
});

test('feat 371 — a workout at a saved gym\'s spot is NOT dotted (already reconciled)', async ({ page }) => {
  const dots = await page.evaluate(() => {
    state.gyms = [{ id: 'g', name: 'Gym', equip: {}, lat: 48.8500, lng: 2.2900 }];
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [], startLoc: { lat: 48.8501, lng: 2.2901, acc: 10, at: new Date().toISOString() } }];
    _gmap = { lat: 48.85, lng: 2.29, z: 15, addMode: false, me: null };
    navTo('gyms', { replace: true });
    return document.querySelectorAll('#gmap-markers .gmap-wo').length;
  });
  expect(dots).toBe(0);   // within 100 m of a gym → counts as reconciled, no stray dot
});
