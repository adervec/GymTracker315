// feat 152 — every commanded data op (import/export) runs inside a progress popup with a human-readable
// error on failure. feat 153 — exercises referencing a variation UUID this build doesn't know are warned
// about (not fatal) and kept/merged anyway so no data is silently lost.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.runDataOp === 'function' && typeof window.exportData === 'function'
    && typeof window.missingVarReport === 'function' && typeof window.humanizeDataError === 'function', null, { timeout: 15000 });
});

test('humanizeDataError maps common failures to friendly text', async ({ page }) => {
  const r = await page.evaluate(() => ({
    json: humanizeDataError(new Error('Unexpected token < in JSON at position 0')),
    quota: humanizeDataError(new Error('QuotaExceededError: storage full')),
    net: humanizeDataError(new Error('Failed to fetch')),
    generic: humanizeDataError(new Error('boom')),
  }));
  expect(r.json).toContain('valid JSON');
  expect(r.quota).toContain('storage is full');
  expect(r.net).toContain('network');
  expect(r.generic).toContain('boom');
});

test('a failing data op shows the error popup with a human-readable message', async ({ page }) => {
  const r = await page.evaluate(async () => {
    try { await runDataOp('Test op', () => { throw new Error('Unexpected token in JSON'); }); } catch (_) {}
    return { err: !!document.querySelector('.choice-backdrop.dataop .dataop-icon.err'), detail: (document.querySelector('.dataop-detail') || {}).textContent || '' };
  });
  expect(r.err).toBe(true);
  expect(r.detail).toContain('valid JSON');
});

test('missingVarReport + warning detect unknown-UUID exercises in sessions and plans', async ({ page }) => {
  const r = await page.evaluate(() => {
    let real = null; for (const [u] of VAR_INDEX) { real = u; break; }
    const sessions = [{ id: 's', date: '2026-01-01T00:00:00Z', exercises: [
      { varUuid: 'ghost-uuid-xyz', sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }, // unknown, 2 sets
      { varUuid: real, sets: [{ w: 50, r: 8 }] },                                  // known
    ] }];
    const plans = [{ id: 'p', steps: [{ options: [{ type: 'variation', uuid: 'ghost-plan-uuid' }] }] }];
    const rep = missingVarReport(sessions, plans);
    return { count: rep.count, sets: rep.sets, warn: missingVarWarning(sessions, plans, 'export'), clean: missingVarWarning([{ exercises: [{ varUuid: real, sets: [] }] }], [], 'export') };
  });
  expect(r.count).toBe(2);   // 2 distinct unknown uuids (one session ex + one plan option)
  expect(r.sets).toBe(2);    // 2 affected sets
  expect(r.warn).toContain('reference exercises');
  expect(r.warn).toContain('kept with their original IDs');
  expect(r.clean).toBe('');  // no unknowns -> no warning
});

test('exportData runs inside the popup and warns about unknown-UUID rows (without failing)', async ({ page }) => {
  const r = await page.evaluate(async () => {
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [{ varUuid: 'ghost-uuid-123', sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] }];
    state.plans = [];
    await exportData();
    return {
      ok: !!document.querySelector('.choice-backdrop.dataop .dataop-icon.ok'),
      warn: (document.querySelector('.dataop-warn') || {}).textContent || '',
    };
  });
  expect(r.ok).toBe(true);              // succeeded (not failed)
  expect(r.warn).toContain('1 exercise type');
  expect(r.warn).toContain('2 sets');
});

test('a clean export shows a success popup (auto-dismisses, no warning)', async ({ page }) => {
  const r = await page.evaluate(async () => {
    let real = null; for (const [u] of VAR_INDEX) { real = u; break; }
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [{ varUuid: real, sets: [{ w: 100, r: 5 }] }] }];
    state.plans = [];
    await exportData();
    return { ok: !!document.querySelector('.dataop-icon.ok'), warn: !!document.querySelector('.dataop-warn') };
  });
  expect(r.ok).toBe(true);
  expect(r.warn).toBe(false); // no unknown UUIDs → no warning
});

test('importing data with unknown-UUID exercises merges them anyway (resilient, no data loss)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.deletedSessions = [];
    const incoming = { sessions: [{ id: 'imp1', date: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', exercises: [{ varUuid: 'ghost-import-uuid', sets: [{ w: 80, r: 6 }] }] }] };
    const warn = missingVarWarning(incoming.sessions, incoming.plans, 'import');
    applyImport(incoming, 'merge');
    const kept = state.sessions.find(s => s.id === 'imp1');
    return { warn, kept: !!kept, keptUuid: kept && kept.exercises[0].varUuid };
  });
  expect(r.warn).toContain('merged anyway');
  expect(r.kept).toBe(true);                  // the session was merged in, not dropped
  expect(r.keptUuid).toBe('ghost-import-uuid'); // original ID preserved
});
