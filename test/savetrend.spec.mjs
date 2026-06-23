// feat 335 — the save-sets confirm popup carries a coach note on how confirming will move this variation's e1RM
// trend (new high → up, below your last → down, first ever → baseline). Reuses the feat-332 trend engine.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof saveSetsTrendComment === 'function' && typeof saveSets === 'function'
    && typeof estimated1RMSet === 'function', null, { timeout: 15000 });
});

const benchVar = (page) => page.evaluate(() => { for (const [u, i] of VAR_INDEX) if (i.family.id === 'flat-bench-press' && exMode(u).mode === 'standard') return u; return null; });

test('saveSetsTrendComment: PR / dip / baseline / non-e1RM', async ({ page }) => {
  const u = await benchVar(page);
  const r = await page.evaluate((u) => {
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const hist = (ws) => ws.map((w, k) => ({ id: 's' + k, date: iso(30 - k * 7), exercises: [{ varUuid: u, sets: [{ w, r: 5 }] }] }));
    state.sessions = hist([100, 105]); const pr = saveSetsTrendComment(u, [{ w: 140, r: 5 }]);   // big new high
    state.sessions = hist([130, 135]); const dip = saveSetsTrendComment(u, [{ w: 100, r: 5 }]);  // below recent best
    state.sessions = []; const base = saveSetsTrendComment(u, [{ w: 100, r: 5 }]);               // first ever
    state.sessions = []; const none = saveSetsTrendComment(u, [{ w: '', r: '' }]);               // no usable e1RM
    return { pr, dip, base, none };
  }, u);
  expect(r.pr.toLowerCase()).toMatch(/new high|previous best|trend up/);
  expect(r.dip).toMatch(/📉|below|nudge the trend down/);
  expect(r.base.toLowerCase()).toContain('baseline');
  expect(r.none).toBe('');
});

test('the confirm popup message includes the trend-impact note', async ({ page }) => {
  const u = await benchVar(page);
  const captured = await page.evaluate((u) => {
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: '1', date: iso(14), exercises: [{ varUuid: u, sets: [{ w: 100, r: 5 }] }] },
      { id: '2', date: iso(7),  exercises: [{ varUuid: u, sets: [{ w: 105, r: 5 }] }] },
    ];
    state.unit = 'lb'; state.maxWeightLb = 1000;     // keep the 130 set feasible (normal, non-danger popup)
    state.alwaysConfirm = true;                      // force the confirm popup to open
    pending = { varUuid: u, subUuid: null, sets: [{ w: 130, r: 5, ts: new Date().toISOString() }] }; // a PR
    let msg = ''; const real = window.confirmDialog; window.confirmDialog = (m) => { msg = m; return Promise.resolve(false); };
    saveSets();                                      // opens the popup; we cancel via the stub
    window.confirmDialog = real;
    return msg;
  }, u);
  expect(captured).toMatch(/Save .* set/);           // still the normal save confirmation…
  expect(captured).toMatch(/e1RM/);                  // …now with the coach's trend note appended
  expect(captured.toLowerCase()).toMatch(/new high|trend up|previous best/);
});
