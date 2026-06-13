// feat 233 — auto-progression: from a lift's most recent top set, suggest the next target via double
// progression (climb the rep range → add the smallest sensible load and reset), backing off on a deload
// week. A Reflect › Progression page lists recently-trained lifts with current → suggested next. Suggestions
// only; nothing is written to the logged sets.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof suggestProgression === 'function' && typeof recentTopSet === 'function'
    && typeof renderProgressionPage === 'function', null, { timeout: 15000 });
});

const pushVar = (page) => page.evaluate(() => { for (const [u, i] of VAR_INDEX) if (i.family.mega === 'push' && exMode(u).mode === 'standard') return u; return null; });
const logTop = (page, v, daysAgo, sets) => page.evaluate(({ v, daysAgo, sets }) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - daysAgo);
  state.sessions.push({ id: 's' + daysAgo + Math.random(), date: d.toISOString(), updatedAt: d.toISOString(), exercises: [{ varUuid: v, subUuid: null, sets }] });
}, { v, daysAgo, sets });

test('recentTopSet returns the heaviest set of the MOST RECENT session for the lift', async ({ page }) => {
  const v = await pushVar(page);
  await page.evaluate(() => { state.sessions = []; });
  await logTop(page, v, 10, [{ w: 225, r: 3 }]);              // older, heavier
  await logTop(page, v, 2, [{ w: 135, r: 8 }, { w: 140, r: 8 }]); // most recent — top is 140×8
  const r = await page.evaluate((v) => recentTopSet(v), v);
  expect(r.w).toBe(140);   // the recent session's top set, NOT the older 225×3
  expect(r.r).toBe(8);
});

test('double progression: hit the top of the range → add load + reset; mid-range → add a rep', async ({ page }) => {
  const v = await pushVar(page);
  const r = await page.evaluate((v) => {
    state.unit = 'lb'; state.meso = { enabled: false, length: 4, start: null };
    const mk = (w, rep) => { state.sessions = [{ id: 'x', date: new Date().toISOString(), exercises: [{ varUuid: v, sets: [{ w, r: rep }] }] }]; return suggestProgression(v); };
    const top = mk(135, 12);   // hit 12 (top of 8–12) → add load, reset to 8
    const mid = mk(135, 9);    // mid-range → add a rep
    return { top: { a: top.action, w: top.next.w, r: top.next.r }, mid: { a: mid.action, w: mid.next.w, r: mid.next.r } };
  }, v);
  expect(r.top).toEqual({ a: 'add-load', w: 140, r: 8 });  // +5 lb, reps reset to the bottom of the range
  expect(r.mid).toEqual({ a: 'add-reps', w: 135, r: 10 }); // same load, +1 rep
});

test('a deload week suggests backing the load off ~10%', async ({ page }) => {
  const v = await pushVar(page);
  const r = await page.evaluate((v) => {
    state.unit = 'lb';
    state.meso = { enabled: true, length: 4, start: _weekMonday(3).toISOString().slice(0, 10) }; // 3 weeks in → week 4 = Deload
    state.sessions = [{ id: 'x', date: new Date().toISOString(), exercises: [{ varUuid: v, sets: [{ w: 135, r: 9 }] }] }];
    const phase = mesoCurrentWeek().phase, sug = suggestProgression(v);
    state.meso = { enabled: false, length: 4, start: null };
    return { phase, action: sug.action, w: sug.next.w };
  }, v);
  expect(r.phase).toBe('Deload');
  expect(r.action).toBe('deload');
  expect(r.w).toBe(120);   // 135 × 0.9 = 121.5 → rounded to the nearest 5 lb
});

test('progRepRange buckets by where you train; the load step respects unit + implement', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bb = (() => { for (const [u, i] of VAR_INDEX) if (autoSetupKind(u) === 'barbell' && !/smith/i.test(i.variation.title || '')) return u; })();
    state.unit = 'lb'; const lb = progLoadStep(bb, 135);
    state.unit = 'kg'; const kg = progLoadStep(bb, 60); state.unit = 'lb';
    return { strength: progRepRange(5), hyper: progRepRange(10), endur: progRepRange(15), lb, kg };
  });
  expect(r.strength).toEqual({ lo: 3, hi: 6 });
  expect(r.hyper).toEqual({ lo: 8, hi: 12 });
  expect(r.endur).toEqual({ lo: 12, hi: 20 });
  expect(r.lb).toBe(5);     // a barbell jump is +5 lb …
  expect(r.kg).toBe(2.5);   // … or +2.5 kg
});

test('progressionList dedups by lift, newest-trained first, recent only', async ({ page }) => {
  const v = await pushVar(page);
  await page.evaluate(() => { state.sessions = []; state.meso = { enabled: false, length: 4, start: null }; });
  await logTop(page, v, 1, [{ w: 135, r: 8 }]);
  await logTop(page, v, 5, [{ w: 130, r: 8 }]);   // same lift, older — should be deduped out
  await logTop(page, v, 300, [{ w: 100, r: 8 }]); // beyond the 120-day window
  const r = await page.evaluate((v) => { const l = progressionList(120); return { n: l.length, first: l[0].varUuid === v, curW: l[0].current.w }; }, v);
  expect(r.n).toBe(1);        // one row per lift, only within the window
  expect(r.first).toBe(true);
  expect(r.curW).toBe(135);   // from the most recent session
});

test('the Progression page lists suggestions; empty state with no history', async ({ page }) => {
  const v = await pushVar(page);
  const r = await page.evaluate((v) => {
    state.sessions = []; navTo('progression');
    const empty = !document.querySelector('#trk-main .pr-row') && /suggestions will appear/i.test(document.getElementById('trk-main').textContent);
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 1);
    state.sessions = [{ id: 'x', date: d.toISOString(), exercises: [{ varUuid: v, sets: [{ w: 135, r: 12 }] }] }];
    navTo('workout'); navTo('progression');
    const host = document.getElementById('trk-main');
    return {
      empty, page: currentPage, crumb: document.getElementById('topbar-title').textContent,
      rows: host.querySelectorAll('.pr-row').length,
      hasArrow: !!host.querySelector('.pr-arrow'),
      hasLoadTag: !!host.querySelector('.pr-tag.pr-load'),
    };
  }, v);
  expect(r.empty).toBe(true);
  expect(r.page).toBe('progression');
  expect(r.crumb).toContain('Progression');
  expect(r.rows).toBe(1);
  expect(r.hasArrow).toBe(true);
  expect(r.hasLoadTag).toBe(true); // 135×12 hit the top → an "add load" row
});
