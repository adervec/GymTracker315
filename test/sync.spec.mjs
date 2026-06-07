// feat 95 — sync data model: session identity (id + updatedAt) + delete tombstones, and the
// rewritten applyImport() merge (last-write-wins UNION by stable key, set-ts aware, tombstones).
// These are the foundation for reliable cross-device Google Drive sync (Phase 3).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.applyImport === 'function' && typeof window.newSession === 'function', null, { timeout: 15000 });
});

test('helpers: newSession identity, keys, and set-ts-aware timestamp', async ({ page }) => {
  const r = await page.evaluate(() => {
    const s = newSession({ startedManually: true });
    return {
      idType: typeof s.id, hasDate: !!s.date, hasUpdated: !!s.updatedAt, exArr: Array.isArray(s.exercises), started: s.startedManually,
      keyIsId: sessionKey(s) === s.id,
      legacyKey: sessionKey({ date: 'D1' }),
      tsFromSet: sessionTs({ date: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', exercises: [{ sets: [{ ts: '2026-06-09T00:00:00.000Z' }] }] }),
    };
  });
  expect(r.idType).toBe('string');
  expect(r.hasDate && r.hasUpdated && r.exArr && r.started).toBe(true);
  expect(r.keyIsId).toBe(true);                       // new sessions key by id
  expect(r.legacyKey).toBe('d:D1');                   // legacy (id-less) sessions key by date
  expect(r.tsFromSet).toBe('2026-06-09T00:00:00.000Z'); // newest set ts wins
});

test('normalizeState backfills updatedAt but NOT id (legacy stays date-keyed)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [{ date: '2026-06-01T10:00:00.000Z', exercises: [] }];
    delete state.sessions[0].updatedAt;
    normalizeState();
    const s = state.sessions[0];
    return { hasId: 'id' in s, updatedAt: s.updatedAt, tombstonesArray: Array.isArray(state.deletedSessions) };
  });
  expect(r.hasId).toBe(false);                          // no random id -> two devices won't fork the same session
  expect(r.updatedAt).toBe('2026-06-01T10:00:00.000Z'); // backfilled from date
  expect(r.tombstonesArray).toBe(true);
});

test('merge is a last-write-wins union by id (newer wins, new added, local kept)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.deletedSessions = [];
    state.sessions = [
      { id: 'A', date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', exercises: [{ varUuid: 'x', sets: [{ w: 100, r: 5, ts: '2026-06-01T00:00:00.000Z' }] }] },
      { id: 'C', date: '2026-06-03T00:00:00.000Z', updatedAt: '2026-06-03T00:00:00.000Z', exercises: [] },
    ];
    applyImport({ sessions: [
      { id: 'A', date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-05T00:00:00.000Z', exercises: [{ varUuid: 'x', sets: [{ w: 110, r: 5, ts: '2026-06-05T00:00:00.000Z' }] }] },
      { id: 'B', date: '2026-06-02T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z', exercises: [] },
    ] }, 'merge');
    return { ids: state.sessions.map((s) => s.id).sort(), aWeight: state.sessions.find((s) => s.id === 'A').exercises[0].sets[0].w };
  });
  expect(r.ids).toEqual(['A', 'B', 'C']);
  expect(r.aWeight).toBe(110); // the newer A replaced the older one
});

test('legacy same-date sessions merge as one (no duplicate on first sync)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.deletedSessions = [];
    state.sessions = [{ date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', exercises: [] }];
    applyImport({ sessions: [{ date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-09T00:00:00.000Z', exercises: [] }] }, 'merge');
    return { count: state.sessions.length, updatedAt: state.sessions[0].updatedAt };
  });
  expect(r.count).toBe(1);
  expect(r.updatedAt).toBe('2026-06-09T00:00:00.000Z');
});

test('tombstones remove a session, but an edit newer than the deletion survives', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.deletedSessions = [];
    state.sessions = [{ id: 'A', date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', exercises: [] }];
    applyImport({ sessions: [], deletedSessions: [{ id: 'A', deletedAt: '2026-06-05T00:00:00.000Z' }] }, 'merge');
    const afterDelete = state.sessions.length;

    state.deletedSessions = [];
    state.sessions = [{ id: 'B', date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-10T00:00:00.000Z', exercises: [] }];
    applyImport({ sessions: [], deletedSessions: [{ id: 'B', deletedAt: '2026-06-05T00:00:00.000Z' }] }, 'merge');
    const afterStaleDelete = state.sessions.length;
    return { afterDelete, afterStaleDelete };
  });
  expect(r.afterDelete).toBe(0);       // deletion newer than last edit -> removed
  expect(r.afterStaleDelete).toBe(1);  // edit newer than deletion -> survives
});

test('set timestamps drive recency even when updatedAt is stale', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.deletedSessions = [];
    state.sessions = [{ id: 'A', date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-05T00:00:00.000Z', exercises: [{ varUuid: 'x', sets: [{ w: 100, r: 5, ts: '2026-06-02T00:00:00.000Z' }] }] }];
    applyImport({ sessions: [{ id: 'A', date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', exercises: [{ varUuid: 'x', sets: [{ w: 120, r: 5, ts: '2026-06-09T00:00:00.000Z' }] }] }] }, 'merge');
    return { w: state.sessions[0].exercises[0].sets[0].w };
  });
  expect(r.w).toBe(120); // incoming had a newer set ts -> wins despite an older updatedAt
});

/* ============================================================
   feat 124 — Cloud sync (Phase 3): provider-agnostic engine + Google Drive backend.
   The merge itself is covered above; here we mock the Google Identity Services SDK
   (window.google stub) + route the Drive REST calls (page.route) to assert the backend
   request shape and that pull merges remote state into local via applyImport.
   ============================================================ */

// Stub GIS (so cloudGoogleEnsureToken resolves a fake token without any network/SDK load) and
// configure a fake public client id. Done via evaluate (nothing reads window.google until connect).
async function stubGis(page) {
  await page.evaluate(() => {
    SYNC_CLIENTS.google = 'test-client.apps.googleusercontent.com';
    window.google = { accounts: { oauth2: {
      initTokenClient(cfg) {
        const client = { callback: cfg.callback, error_callback: null };
        client.requestAccessToken = function () { client.callback({ access_token: 'FAKE_TOKEN', expires_in: 3600 }); };
        return client;
      },
    } } };
  });
}

// Route every Drive REST endpoint. `ctx.remote` (mutable) is what the app-data file currently
// holds: null/'' => empty file. Records call counts + captured push bodies for assertions.
async function routeDrive(page, ctx) {
  const calls = { search: 0, create: 0, get: 0, patch: 0, pushed: [] };
  await page.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request(), url = req.url(), method = req.method();
    const json = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
    if (url.includes('/drive/v3/files?') && url.includes('spaces=appDataFolder')) { calls.search++; return json(200, { files: [] }); }
    if (method === 'POST' && url.includes('/upload/drive/v3/files')) { calls.create++; return json(200, { id: 'FILE1' }); }
    if (method === 'GET' && url.includes('/drive/v3/files/FILE1') && url.includes('alt=media')) { calls.get++; return route.fulfill({ status: 200, contentType: 'application/json', body: ctx.remote ? JSON.stringify(ctx.remote) : '' }); }
    if (method === 'PATCH' && url.includes('/upload/drive/v3/files/FILE1')) { calls.patch++; calls.pushed.push(req.postData()); return json(200, {}); }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return calls;
}

test('cloud: connect authorizes, find-or-creates the app-data file, and pushes local state', async ({ page }) => {
  await page.waitForFunction(() => typeof window.cloudConnect === 'function', null, { timeout: 15000 });
  const ctx = { remote: null }; // empty remote file
  const calls = await routeDrive(page, ctx);
  await stubGis(page);
  await page.evaluate(() => {
    state.deletedSessions = [];
    state.sessions = [{ id: 'LOCAL1', date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', exercises: [] }];
  });
  await page.evaluate(() => cloudConnect('google'));
  const cs = await page.evaluate(() => state.cloudSync);
  expect(cs.enabled).toBe(true);
  expect(cs.provider).toBe('google');
  expect(cs.lastError == null).toBe(true);
  expect(calls.search).toBe(1);                 // searched the appDataFolder once
  expect(calls.create).toBe(1);                 // created the canonical file (search was empty)
  expect(calls.patch).toBeGreaterThanOrEqual(1); // pushed at least once
  const lastBody = JSON.parse(calls.pushed[calls.pushed.length - 1]);
  expect(lastBody.sessions.some((s) => s.id === 'LOCAL1')).toBe(true); // local session went up
});

test('cloud: pull merges remote sessions into local (LWW union)', async ({ page }) => {
  await page.waitForFunction(() => typeof window.cloudPullNow === 'function', null, { timeout: 15000 });
  const ctx = { remote: null };
  await routeDrive(page, ctx);
  await stubGis(page);
  await page.evaluate(() => {
    state.deletedSessions = [];
    state.sessions = [{ id: 'LOCAL1', date: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', exercises: [] }];
  });
  await page.evaluate(() => cloudConnect('google')); // establishes the FILE1 handle
  // Now the remote file gains a session this device has never seen; a pull must fold it in.
  ctx.remote = { sessions: [{ id: 'REMOTE1', date: '2026-06-08T00:00:00.000Z', updatedAt: '2026-06-08T00:00:00.000Z', exercises: [] }], deletedSessions: [] };
  await page.evaluate(() => cloudPullNow(false));
  const ids = await page.evaluate(() => state.sessions.map((s) => s.id).sort());
  expect(ids).toContain('LOCAL1');
  expect(ids).toContain('REMOTE1');
});

test('cloud: disabled by default, and cloudActive() reflects connection state', async ({ page }) => {
  const r = await page.evaluate(() => ({
    enabledDefault: !!(state.cloudSync && state.cloudSync.enabled),
    activeDefault: cloudActive(),
    notInSettingsKeys: SETTINGS_KEYS.indexOf('cloudSync') === -1, // device-local: must NOT sync cross-device
    providerExists: !!(CLOUD_PROVIDERS && CLOUD_PROVIDERS.google && CLOUD_PROVIDERS.google.kind === 'oauth'),
  }));
  expect(r.enabledDefault).toBe(false);
  expect(r.activeDefault).toBe(false);
  expect(r.notInSettingsKeys).toBe(true);
  expect(r.providerExists).toBe(true);
});

// The data sections (incl. the Cloud Sync card) are relocated by renderSettingsDrawer() out of the
// settings drawer into the full-screen Data Management page container (#data-page-body, feat 109).
test('cloud: Settings card renders the one-time-setup state when unconfigured', async ({ page }) => {
  const r = await page.evaluate(() => {
    SYNC_CLIENTS.google = '';      // unconfigured
    renderSettingsDrawer();
    const dp = document.getElementById('data-page-body');
    return {
      hasCard: /☁ Cloud Sync/.test(dp.innerHTML),
      connectDisabled: !!dp.querySelector('#cloud-connect-google-btn[disabled]'),
      hasSetupSteps: /One-time Google setup/.test(dp.innerHTML),
    };
  });
  expect(r.hasCard).toBe(true);
  expect(r.connectDisabled).toBe(true);   // can't connect until the client id is set
  expect(r.hasSetupSteps).toBe(true);     // shows the setup walkthrough instead
});

test('cloud: Settings card shows the connected state when configured & enabled', async ({ page }) => {
  const r = await page.evaluate(() => {
    SYNC_CLIENTS.google = 'x.apps.googleusercontent.com';
    state.cloudSync = { provider: 'google', enabled: true, lastSync: '2026-06-07T12:00:00.000Z', lastError: null, perProvider: {} };
    renderSettingsDrawer();
    const dp = document.getElementById('data-page-body');
    return {
      connected: /Google Drive connected/.test(dp.innerHTML),
      hasSyncNow: !!dp.querySelector('#cloud-sync-now-btn'),
      hasDisconnect: !!dp.querySelector('#cloud-disconnect-btn'),
    };
  });
  expect(r.connected).toBe(true);
  expect(r.hasSyncNow).toBe(true);
  expect(r.hasDisconnect).toBe(true);
});
