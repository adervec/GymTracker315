// feat 517 — holds and bodyweight lifts in their own words, with real records. A hold is scored in seconds; a
// bodyweight lift on bodyweight + added (− assist) — on added load alone every pure-bodyweight set scored 0. No
// "reps" / e1RM on a hold, and the page shows the bodyweight it measures against, flagged when it is stale.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof setScorer === 'function' && typeof bodyweightLineHtml === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// mode: 'time' | 'bodyweight'; sessions: [[w, r, daysAgo]]; bwDaysAgo: null = no bodyweight logged
const open = (page, mode, sessions, cur, bwDaysAgo = 1) => page.evaluate(({ mode, sessions, cur, bwDaysAgo }) => {
  let v = null; for (const [u] of VAR_INDEX) if (exMode(u).mode === mode) { v = u; break; }
  state.readonly = false; state.unit = 'lb'; state.targetSort = 'order';
  const at = d => new Date(Date.now() - d * 864e5).toISOString();
  state.bodyComp = bwDaysAgo == null ? [] : [{ date: at(bwDaysAgo), weightKg: 80 }];
  state.sessions = sessions.map(([w, r, d], i) => ({ id: 'h' + i, date: at(d), exercises: [{ varUuid: v, subUuid: null, sets: [{ w, r, ts: at(d) }] }] }));
  pending = { varUuid: v, subUuid: null, sets: cur.map(([w, r]) => ({ w, r, ts: r !== '' ? new Date().toISOString() : undefined })) };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true; renderModal();
  return { v, text: document.body.innerText,
    tiles: [...document.querySelectorAll('#trk-targets .target-btn')].map(b => b.querySelector('.tb-lbl').textContent + ' ' + b.querySelector('b').textContent),
    sort: [...document.querySelectorAll('[data-tgt-sort]')].map(b => b.textContent),
    wt: !!document.getElementById('trk-wt-expand'),
    tag: (document.querySelector('.set-overload-tag') || {}).textContent || null,
    bw: (document.querySelector('.ex-bw-line') || {}).textContent || null,
    bwStale: !!document.querySelector('.ex-bw-line.stale') };
}, { mode, sessions, cur, bwDaysAgo });

test('feat 517 — a hold page says time, never reps or e1RM', async ({ page }) => {
  // last time a 60 s bodyweight plank, before that 10 lb × 45 s — the plank is the longer hold, so it is "up"
  const r = await open(page, 'time', [[0, 60, 2], [10, 45, 9]], [[10, '']]);
  const sheet = r.text.slice(0, r.text.indexOf('Save Sets'));
  expect(sheet).not.toMatch(/\breps?\b|e1RM|1RM/i);
  expect(sheet).toMatch(/Up 33\.3% longest hold/);
  expect(sheet).toMatch(/Longest hold at 10lb: 0:45 .* beat 0:46/i);     // the record hint under the open set
  expect(r.sort).toEqual(['order', 'weight', 'time']);
  expect(r.wt, 'the All-weights table is all e1RM + Epley odds — not offered for a hold').toBe(false);
});

test('feat 517 — a hold at weight 0 gets an overload tag scored in seconds', async ({ page }) => {
  const r = await open(page, 'time', [[0, 60, 2]], [[0, 66]]);
  expect(r.tag).toBe('PR! +10%');
});

test('feat 517 — a bodyweight lift scores bodyweight + added, so pure-bodyweight sets are real records', async ({ page }) => {
  const s = await page.evaluate(() => { let v; for (const [u] of VAR_INDEX) if (exMode(u).mode === 'bodyweight') { v = u; break; }
    state.unit = 'lb'; state.bodyComp = [{ date: new Date().toISOString(), weightKg: 80 }];
    const f = setScorer(v); return { bw10: f(0, 10), plus25x6: f(25, 6), asst: f(-20, 12) }; });
  expect(s.bw10).toBe(Math.round(176.37 * (1 + 10 / 30)));        // 0 added is not 0
  expect(s.plus25x6).toBeGreaterThan(0);
  expect(s.asst).toBeLessThan(s.bw10);
  const r = await open(page, 'bodyweight', [[0, 10, 2], [25, 6, 20], [-20, 12, 40]], [[0, 8]]);
  expect(r.tiles).toContain('Prev top BW×11');
  // Max reps is BW×11 too, so it merges into Prev top — the assisted −20×12 must not become a −20×13 "record"
  expect(r.tiles.some(t => t.includes('−20')), 'an assisted set is not the rep record while unassisted ones exist').toBe(false);
  expect(r.tiles.some(t => /e1RM|Wt PR/.test(t))).toBe(false);
  expect(r.tag).toMatch(/%/);                                        // BW×8 judged against BW×10, not skipped
});

test('feat 517 — an assisted base climbs toward less assistance, and an empty session has not beaten it', async ({ page }) => {
  const r = await open(page, 'bodyweight', [[-20, 8, 3]], [['', '']]);
  expect(r.tiles).toContain('Max wt −15×1');
  expect(r.tiles.every(t => !/hit/.test(t))).toBe(true);
  const hits = await page.evaluate(() => document.querySelectorAll('#trk-targets .target-btn.hit').length);
  expect(hits).toBe(0);
});

test('feat 517 — the page shows the bodyweight it measures against, flagged when stale or missing', async ({ page }) => {
  let r = await open(page, 'time', [], [['', '']], 1);
  expect(r.bw).toMatch(/Bodyweight 176\.4lb · yesterday$/);
  expect(r.bwStale).toBe(false);
  r = await open(page, 'bodyweight', [], [['', '']], 30);
  expect(r.bw).toMatch(/30 days ago — ⚠ stale/);
  expect(r.bwStale).toBe(true);
  r = await open(page, 'bodyweight', [], [['', '']], null);
  expect(r.bw).toMatch(/No bodyweight logged/);
});

test('feat 517 — no "lighter" baseline below a bodyweight hold', async ({ page }) => {
  await open(page, 'time', [[10, 45, 9]], [['', '']]);
  expect(await page.evaluate(() => document.getElementById('trk-neighbor-hints').textContent.trim())).toBe('');
});
