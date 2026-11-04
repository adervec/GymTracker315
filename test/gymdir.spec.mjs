// feat 539 — gym memberships → the cowork agent fills in every club from Google Maps (channel gym-directory),
// and the Gyms tab shows usage: visits per gym, a 12-month heat map, visit-scaled map pins and never-visited clubs.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkImportGymDirectory === 'function' && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 539 — the import adds member clubs, dedupes, keeps your own gym, and ignores other chains', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.gyms = []; state.gymMemberships = [];
    // a GoodLife you set up yourself, with your own name, pin and no cables
    const mine = newGym('My GoodLife'); mine.lat = 44.4089; mine.lng = -79.687; mine.chain = 'GoodLife Fitness'; mine.equip.cable = false;
    addGymMembership('GoodLife Fitness', 'Ultimate', 'all');
    const reply = { gyms: [
      { chain: 'GoodLife Fitness', name: 'GoodLife Barrie Bayfield', address: '320 Bayfield St', lat: 44.4090, lng: -79.6871, placeId: 'P1' }, // ~15 m from mine
      { chain: 'GoodLife Fitness', name: 'GoodLife Barrie South', lat: 44.33, lng: -79.68, placeId: 'P2', mapsUrl: 'javascript:alert(1)' },
      { chain: 'Planet Fitness', name: 'PF Barrie', lat: 44.35, lng: -79.7, placeId: 'X' },       // not a membership
      { chain: 'goodlife', name: 'No coords', placeId: 'P3' },                                     // no lat/lng
    ] };
    const first = coworkImportGymDirectory(reply);
    const again = coworkImportGymDirectory(reply);                                                 // a re-run must not duplicate
    const south = state.gyms.find(g => g.placeId === 'P2'), me = state.gyms.find(g => g.id === mine.id);
    return { first, again, n: state.gyms.length, myName: me.name, myPlace: me.placeId, myLat: me.lat,
      southEquipCable: south.equip.cable, southSource: south.source, southUrl: south.mapsUrl,
      mem: state.gymMemberships[0] };
  });
  expect(r.first).toMatchObject({ handled: true, added: 1, updated: 1, skipped: 2 });
  expect(r.again).toMatchObject({ added: 0, updated: 2 });
  expect(r.n).toBe(2);
  expect(r.myName).toBe('My GoodLife');                // your name and pin are kept
  expect(r.myLat).toBe(44.4089);
  expect(r.myPlace).toBe('P1');
  expect(r.southEquipCable).toBe(false);               // equipment copied from your same-chain gym
  expect(r.southSource).toBe('directory');
  expect(r.southUrl).toBe('https://www.google.com/maps/place/?q=place_id:P2'); // a non-Maps URL is never stored
  expect(r.mem.count).toBe(2);
  expect(r.mem.syncedAt).toBeTruthy();
});

test('feat 539 — the channel is declared, its context carries the memberships, and the reply routes', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState(); state.gymMemberships = []; addGymMembership('GoodLife Fitness', 'Ultimate', '25');
    const man = buildCoworkManifest().channels.find(c => c.name === 'gym-directory');
    const ctx = buildChannelContext('gyms');
    const md = buildInstructionsMd('gyms');
    const routed = coworkApplyImport('gym-directory-output', { gyms: [] });
    return { kind: man && man.replyKind, mem: ctx.memberships[0], hasKnown: Array.isArray(ctx.knownGyms), md: md.includes('Google Maps') && md.includes('placeId'), routed };
  });
  expect(r.kind).toBe('gym-directory-output');
  expect(r.mem).toEqual({ chain: 'GoodLife Fitness', tier: 'Ultimate', scope: 'near', radiusKm: 25 });
  expect(r.hasKnown).toBe(true);
  expect(r.md).toBe(true);
  expect(r.routed.handled).toBe(true);
});

test('feat 539 — usage: sessions are placed by id, name or GPS; never-visited clubs sort by distance', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const v = [...VAR_INDEX.keys()][0];
    const A = { id: 'gA', name: 'Home Club', lat: 44.40, lng: -79.68, equip: {}, show: {}, hide: {} };
    const B = { id: 'gB', name: 'Work Club', lat: 43.65, lng: -79.38, equip: {}, show: {}, hide: {} };
    const near = { id: 'gN', name: 'Near Unvisited', lat: 44.42, lng: -79.69, equip: {}, show: {}, hide: {}, source: 'directory' };
    const far = { id: 'gF', name: 'Far Unvisited', lat: 45.4, lng: -75.7, equip: {}, show: {}, hide: {}, source: 'directory' };
    state.gyms = [A, B, near, far];
    const at = d => new Date(Date.now() - d * 864e5).toISOString();
    const ses = (d, extra) => ({ id: 's' + d, date: at(d), exercises: [{ varUuid: v, sets: [{ w: 50, r: 5 }, { w: 50, r: 5 }] }], ...extra });
    state.sessions = [ses(1, { gymId: 'gA' }), ses(3, { notes: { location: 'Home Club' } }), ses(6, { startLoc: { lat: 44.4005, lng: -79.6805 } }),
      ses(9, { gymId: 'gB' }), ses(12, {})];
    const st = gymUsageStats();
    const vis = Object.fromEntries(st.rows.map(x => [x.gym.id, x.visits]));
    const main = document.getElementById('trk-main'); renderGymsTab(main);
    const untouched = [...main.querySelectorAll('.gu-u')].map(e => e.textContent);
    const heatCells = main.querySelectorAll('.yh-grid .yh-c:not(.yh-0)').length;
    main.querySelector('[data-gu-heat="gB"]').click();
    const heatB = document.querySelectorAll('#trk-main .yh-grid .yh-c:not(.yh-0)').length;
    const listed = [...document.querySelectorAll('#trk-main .cv-row')].map(e => e.textContent).join('|');
    return { vis, unplaced: st.unplaced, untouched, heatCells, heatB, rows: document.querySelectorAll('#trk-main .gu-row').length,
      dirFolded: !!document.getElementById('gym-dir-more') && !listed.includes('Far Unvisited') };
  });
  expect(r.vis).toEqual({ gA: 3, gB: 1, gN: 0, gF: 0 });
  expect(r.unplaced).toBe(1);
  expect(r.untouched[0]).toContain('Near Unvisited');
  expect(r.untouched[1]).toContain('Far Unvisited');
  expect(r.heatCells).toBe(4);
  expect(r.heatB).toBe(1);
  expect(r.rows).toBe(2);
  expect(r.dirFolded).toBe(true);
});

test('feat 539 — setting the active gym stamps its id on the session, so a rename keeps the history', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.gyms = [{ id: 'g1', name: 'Old Name', lat: 1, lng: 1, equip: {}, show: {}, hide: {} }];
    const s = { id: 'live', date: new Date().toISOString(), exercises: [{ varUuid: [...VAR_INDEX.keys()][0], sets: [{ w: 1, r: 1 }] }] };
    state.sessions = [s];
    const orig = getActiveSession; getActiveSession = () => s;
    setActiveGym('g1'); getActiveSession = orig;
    state.gyms[0].name = 'New Name';
    return { gymId: s.gymId, placed: sessionGymId(s) };
  });
  expect(r.gymId).toBe('g1');
  expect(r.placed).toBe('g1');
});
