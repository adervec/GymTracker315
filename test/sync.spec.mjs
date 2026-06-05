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
