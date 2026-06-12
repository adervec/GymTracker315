// feat 219 — historical replay (Reflect › ⏪ Replay): scrub or play through training history week by
// week, animating the anatomy heatmap, top volume bars, a whole-history trend strip with a cursor,
// and that week's log together.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderReplayPage === 'function' && typeof replayMaxOffset === 'function', null, { timeout: 15000 });
});

// Two distinct training weeks: squats 2 weeks back, bench this week.
const seedHistory = (page) => page.evaluate(() => {
  normalizeState();
  const u = (fid) => FAMILIES.find(f => f.id === fid).variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
  const at = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
  state.sessions = [
    { id: 'r-old', date: at(14), updatedAt: at(14), endedAt: at(14),
      exercises: [{ varUuid: u('squat'), subUuid: null, sets: [{ w: 200, r: 5 }, { w: 200, r: 5 }, { w: 200, r: 5 }] }] },
    { id: 'r-new', date: at(0), updatedAt: at(0),
      exercises: [{ varUuid: u('flat-bench-press'), subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] },
  ];
  _replayOffset = null; _replayStop(); _replayLevel = 'group'; _replayTickMs = 1100;
});

test('the Replay page is a Reflect leaf and opens on "now" with all the parts', async ({ page }) => {
  await seedHistory(page);
  const r = await page.evaluate(() => {
    navTo('replay');
    const host = document.getElementById('replay-page');
    return {
      page: currentPage,
      inReflect: PAGES.reflect.children.includes('replay'),
      max: replayMaxOffset(),
      offset: _replayOffset,
      scrub: { max: +document.getElementById('replay-scrub').max, val: +document.getElementById('replay-scrub').value },
      hasHeat: !!host.querySelector('.hm-region'),
      hasCursor: !!host.querySelector('.replay-cursor'),
      logRows: host.querySelectorAll('.replay-sess').length,
      title: host.querySelector('.card-title').textContent,
    };
  });
  expect(r.page).toBe('replay');
  expect(r.inReflect).toBe(true);
  expect(r.max).toBeGreaterThanOrEqual(2);   // the squat week is at least 2 weeks back
  expect(r.offset).toBe(0);                   // opens on the current week
  expect(r.scrub.val).toBe(r.scrub.max);      // slider parked at "now"
  expect(r.hasHeat).toBe(true);
  expect(r.hasCursor).toBe(true);
  expect(r.logRows).toBe(1);                  // this week: the bench session
  expect(r.title).toContain('(now)');
});

test('scrubbing to the squat week swaps the heatmap and the log', async ({ page }) => {
  await seedHistory(page);
  const r = await page.evaluate(() => {
    navTo('replay');
    const heatOf = (term) => { const el = document.querySelector(`#replay-page .hm-region[data-hm-term="${term}"]`); return el ? parseFloat(el.dataset.hmV || '0') : -1; };
    const nowPec = heatOf('Pec / Pectorals'), nowQuads = heatOf('Quads / Quadriceps');
    const max = replayMaxOffset();
    const scrub = document.getElementById('replay-scrub');
    scrub.value = String(max - 2);                       // 2 weeks back
    scrub.dispatchEvent(new Event('input', { bubbles: true }));
    const thenPec = heatOf('Pec / Pectorals'), thenQuads = heatOf('Quads / Quadriceps');
    const thenRows = document.querySelectorAll('#replay-page .replay-sess').length;
    return { nowPec, nowQuads, thenPec, thenQuads, thenRows, offset: _replayOffset };
  });
  expect(r.nowPec).toBeGreaterThan(0);     // bench heats pecs this week
  expect(r.nowQuads).toBe(0);
  expect(r.offset).toBe(2);
  expect(r.thenQuads).toBeGreaterThan(0);  // the squat week heats quads
  expect(r.thenPec).toBe(0);
  expect(r.thenRows).toBe(1);              // that week's log shows the squat session
});

test('▶ Play restarts from the oldest week, runs to "now", then stops itself', async ({ page }) => {
  await seedHistory(page);
  await page.evaluate(() => { _replayTickMs = 60; navTo('replay'); document.getElementById('replay-play').click(); });
  expect(await page.evaluate(() => ({ playing: _replayPlaying, atOldest: _replayOffset === replayMaxOffset() }))).toEqual({ playing: true, atOldest: true });
  await page.waitForFunction(() => !_replayPlaying && _replayOffset === 0, null, { timeout: 5000 });
  const done = await page.evaluate(() => document.querySelector('#replay-page .card-title').textContent);
  expect(done).toContain('(now)');
});

test('leaving the page stops the playback timer', async ({ page }) => {
  await seedHistory(page);
  await page.evaluate(() => { _replayTickMs = 60; navTo('replay'); document.getElementById('replay-play').click(); navTo('workout'); });
  await page.waitForFunction(() => !_replayPlaying, null, { timeout: 3000 });
  await page.evaluate(() => { _replayStop(); _replayTickMs = 1100; state.sessions = []; _replayOffset = null; });
});
