// feat 120 — richer Log workout cards: a grade chip, an explicit-or-implicit split label, a key-deltas
// line (PRs / biggest gainer / regressions), and a "rested N days" banner when the gap to the previous
// workout exceeds 48h.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.sessionSplitLabel === 'function'
    && typeof window.sessionGapTagHtml === 'function'
    && typeof window.sessionDeltaSummaryHtml === 'function'
    && typeof window.renderSession === 'function', null, { timeout: 15000 });
});

test('sessionSplitLabel infers the split from the mega mix', async ({ page }) => {
  const r = await page.evaluate(() => {
    let push = null, full = null;
    for (const [u, info] of VAR_INDEX) { if (!push && info.family.mega === 'push') push = u; if (!full && info.family.mega === 'full') full = u; if (push && full) break; }
    const lbl = sessionSplitLabel({ date: new Date().toISOString(), exercises: [{ varUuid: push, sets: [{ w: 1, r: 1 }, { w: 1, r: 1 }] }] });
    const fullLbl = full ? sessionSplitLabel({ date: new Date().toISOString(), exercises: [{ varUuid: full, sets: [{ w: 1, r: 1 }] }] }) : 'Full-body';
    return { lbl, fullLbl };
  });
  expect(r.lbl).toBe('Push');
  expect(r.fullLbl).toBe('Full-body');
});

test('sessionGapTagHtml shows a banner only when the rest gap exceeds 48h', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const s1 = { id: 's1', date: iso(7), exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] };
    const s2 = { id: 's2', date: iso(2), exercises: [{ varUuid: a, sets: [{ w: 110, r: 5 }] }] }; // 5 days later
    const s3 = { id: 's3', date: iso(1), exercises: [{ varUuid: a, sets: [{ w: 110, r: 5 }] }] }; // 1 day later (<48h)
    state.sessions = [s1, s2, s3];
    return { gapS2: sessionGapTagHtml(s2), gapS3: sessionGapTagHtml(s3), gapS1: sessionGapTagHtml(s1) };
  });
  expect(r.gapS2).toContain('5 days');
  expect(r.gapS2).toContain('since your last workout');
  expect(r.gapS3).toBe('');   // <48h -> no banner
  expect(r.gapS1).toBe('');   // no previous workout
});

test('sessionDeltaSummaryHtml surfaces a PR', async ({ page }) => {
  const html = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: 's1', date: iso(7), exercises: [{ varUuid: a, sets: [{ w: 100, r: 5 }] }] },
      { id: 's2', date: iso(1), exercises: [{ varUuid: a, sets: [{ w: 120, r: 5 }] }] },
    ];
    return sessionDeltaSummaryHtml(state.sessions[1]);
  });
  expect(html).toContain('PR'); // a heavier top set than any prior session
});

test('renderSession shows grade + implicit split + deltas + gap', async ({ page }) => {
  const html = await page.evaluate(() => {
    let push = null; for (const [u, info] of VAR_INDEX) { if (info.family.mega === 'push' && exMode(u).mode === 'standard') { push = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: 's1', date: iso(9), exercises: [{ varUuid: push, sets: [{ w: 100, r: 5 }] }] },
      { id: 's2', date: iso(1), exercises: [{ varUuid: push, sets: [{ w: 110, r: 5 }] }], finalScore: { points: 92, grade: 'A+' } },
    ];
    return renderSession(state.sessions[1], false);
  });
  expect(html).toContain('session-grade');
  expect(html).toContain('A+');
  expect(html).toContain('implicit');     // no plan -> implicit split label
  expect(html).toContain('session-gap');  // 8-day gap banner
  expect(html).toContain('session-deltas');
});
