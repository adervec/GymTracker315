// feat 232 — periodization (mesocycle): an optional multi-week block where volume ramps base → peak then a
// deload week, repeating. Per-week volume multiplier + RPE cue; the split planner's coverage over/under
// analysis scales by the current week's multiplier. Planning guidance, not auto-applied to logged sets.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof mesoWeekPlan === 'function' && typeof mesoCurrentWeek === 'function'
    && typeof splitAnalysis === 'function', null, { timeout: 15000 });
});

test('mesoWeekPlan ramps volume from base to peak, then deloads', async ({ page }) => {
  const r = await page.evaluate(() => ({
    four: mesoWeekPlan(4).map(w => [w.phase, w.vol]),
    six: mesoWeekPlan(6).map(w => w.phase),
    threeLast: mesoWeekPlan(3)[2].phase,
  }));
  expect(r.four).toEqual([['Base', 1], ['Build', 1.15], ['Peak', 1.3], ['Deload', 0.55]]);
  expect(r.six[0]).toBe('Base');
  expect(r.six[5]).toBe('Deload');   // last week always deloads
  expect(r.threeLast).toBe('Deload');
});

test('mesoCurrentWeek tracks the cycle from the start date, repeating after the deload', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.meso = { enabled: false, length: 4, start: null };
    const off = mesoCurrentWeek();
    state.meso.enabled = true;
    state.meso.start = _weekMonday(2).toISOString().slice(0, 10); // started 2 weeks ago
    const now = mesoCurrentWeek();
    state.meso.start = _weekMonday(4).toISOString().slice(0, 10); // 4 weeks into a 4-week block → wraps
    const wrap = mesoCurrentWeek();
    return { off, nowWeek: now.week, nowPhase: now.phase, nowVol: now.vol, wrapWeek: wrap.week };
  });
  expect(r.off).toBeNull();          // disabled → no current week
  expect(r.nowWeek).toBe(3);         // 2 weeks elapsed → week 3 (Peak)
  expect(r.nowPhase).toBe('Peak');
  expect(r.nowVol).toBe(1.3);
  expect(r.wrapWeek).toBe(1);        // the block repeats — week 1 again
});

test('splitAnalysis scales the projected weekly volume by the periodization multiplier', async ({ page }) => {
  const r = await page.evaluate(() => {
    const by = (m) => { for (const [u, info] of VAR_INDEX) if (info.family.mega === m && exMode(u).mode === 'standard') return u; return null; };
    const step = (u, s) => ({ id: 's' + Math.random(), sets: s, options: [{ type: 'variation', uuid: u }] });
    const plan = { id: 'p', name: 'p', steps: [step(by('push'), 5), step(by('push'), 5)] };
    const chest = (mult) => splitAnalysis([plan], mult).rows.find(r => r.group === 'chest').sets;
    return { base: chest(1), peak: chest(1.3), deload: chest(0.55) };
  });
  expect(r.peak).toBeGreaterThan(r.base);          // accumulation pushes volume up
  expect(r.deload).toBeLessThan(r.base);           // deload backs it off
  expect(r.peak).toBeCloseTo(r.base * 1.3, 0);     // …by the multiplier
});

test('the periodization card toggles on: week strip, banner, and a coverage tag', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.meso = { enabled: false, length: 4, start: null };
    state.splitPlan = { sessions: 3, days: 5, minutes: 60 };
    navTo('split-planner');
    const host = document.getElementById('trk-main');
    const offStrip = host.querySelectorAll('.ms-wk').length;     // hidden while off
    host.querySelector('#ms-toggle').click();                    // enable
    const host2 = document.getElementById('trk-main');
    return {
      offStrip, on: state.meso.enabled,
      strip: host2.querySelectorAll('.ms-wk').length,
      hasBanner: !!host2.querySelector('.ms-banner'),
      cur: host2.querySelector('.ms-wk.cur .ms-wk-n')?.textContent,
      covTag: !!host2.querySelector('.ms-cov-tag'),
      persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).meso.enabled,
      inKeys: SETTINGS_KEYS.includes('meso'),
    };
  });
  expect(r.offStrip).toBe(0);
  expect(r.on).toBe(true);
  expect(r.strip).toBe(4);          // a cell per cycle week
  expect(r.hasBanner).toBe(true);
  expect(r.cur).toBe('W1');         // enabling anchors the cycle to this week
  expect(r.covTag).toBe(true);      // coverage card flags the current week
  expect(r.persisted).toBe(true);
  expect(r.inKeys).toBe(true);
});

test('changing the cycle length and restarting re-anchors the mesocycle', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.meso = { enabled: true, length: 4, start: _weekMonday(2).toISOString().slice(0, 10) };
    state.splitPlan = { sessions: 3, days: 5, minutes: 60 };
    navTo('split-planner');
    const beforeWeek = mesoCurrentWeek().week;                   // week 3
    document.querySelector('#trk-main [data-ms-len="6"]').click();
    const len6 = state.meso.length, strip6 = document.querySelectorAll('#trk-main .ms-wk').length;
    document.querySelector('#trk-main #ms-restart').click();     // restart this week
    return { beforeWeek, len6, strip6, afterRestart: mesoCurrentWeek().week };
  });
  expect(r.beforeWeek).toBe(3);
  expect(r.len6).toBe(6);
  expect(r.strip6).toBe(6);         // the strip grows to six weeks
  expect(r.afterRestart).toBe(1);   // restart → back to week 1
});
