// feat 171 — the most efficient way to hand a time-bounded progress summary to Claude: a compact markdown
// digest (aggregated per exercise, not every raw set) with an explicit analysis ask, overview, per-exercise
// e1RM progression, and body/cardio notes — offered as a "Copy for Claude" button in the export dialog.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildClaudeDigest === 'function' && typeof window.selectSessionsForExport === 'function', null, { timeout: 15000 });
});

test('buildClaudeDigest is a compact, analysis-ready summary', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.unit = 'lb';
    state.sessions = [
      { id: '1', date: '2026-01-01T10:00:00Z', exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }], finalScore: { points: 80, grade: 'A' } },
      { id: '2', date: '2026-02-01T10:00:00Z', exercises: [{ varUuid: a, sets: [{ w: 115, r: 5 }] }], finalScore: { points: 88, grade: 'A' } },
    ];
    state.bodyComp = [{ date: '2026-01-02', weight: 180 }, { date: '2026-01-30', weight: 178 }];
    const opts = { preset: 'all' };
    const sess = selectSessionsForExport(opts);
    return { digest: buildClaudeDigest(sess, opts), name: displayName(a, null) };
  });
  expect(r.digest).toContain('# Training progress');
  expect(r.digest).toMatch(/analyze my/i);              // explicit ask for Claude
  expect(r.digest).toContain('## Overview');
  expect(r.digest).toContain('2 sessions');
  expect(r.digest).toContain('## Exercise progression');
  expect(r.digest).toContain(r.name);
  expect(r.digest).toMatch(/e1RM \d+→\d+ \([+-]?\d+%\)/); // progression with % change
  expect(r.digest).toContain('## Body');
  expect(r.digest).toContain('180→178');
  // compact: aggregated, not a line per raw set (2 sessions × few sets → short)
  expect(r.digest.split('\n').length).toBeLessThan(30);
});

test('the digest caps the exercise list for brevity', async ({ page }) => {
  const r = await page.evaluate(() => {
    const std = []; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') std.push(u); if (std.length === 40) break; }
    state.sessions = [{ id: '1', date: '2026-01-01T00:00:00Z', exercises: std.map(u => ({ varUuid: u, sets: [{ w: 50, r: 5 }] })) }];
    const opts = { preset: 'all' };
    const digest = buildClaudeDigest(selectSessionsForExport(opts), opts);
    return { capped: digest.includes('more exercises (omitted'), lines: digest.split('\n').filter(l => l.startsWith('- ') && l.includes('e1RM')).length };
  });
  expect(r.capped).toBe(true);       // overflow noted
  expect(r.lines).toBeLessThanOrEqual(30); // capped at 30 rows
});

test('the export dialog offers a "Copy summary for Claude" button', async ({ page }) => {
  const has = await page.evaluate(async () => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    state.sessions = [{ id: '1', date: new Date().toISOString(), exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] }];
    openExportDialog({ preset: 'all' });
    document.getElementById('export-modal').querySelector('#export-build-btn').click(); // → phase B
    await new Promise(r => setTimeout(r, 80));
    return !!document.querySelector('#export-claude');
  });
  expect(has).toBe(true);
});
