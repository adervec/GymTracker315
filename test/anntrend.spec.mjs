// feat 333 — when set-start annunciation is on, the coach adds a quick note on how the variation is trending,
// but ONLY on the first set. Reuses the feat-332 e1RM trend; stays silent until there are 2+ training days.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof setStartTrendComment === 'function' && typeof annunceSetStart === 'function'
    && typeof variationTrend === 'function', null, { timeout: 15000 });
});

test('setStartTrendComment phrases up / down / flat from real history, and is empty without enough data', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const mk = (ws) => ws.map((w, k) => ({ id: 's' + k, date: iso(30 - k * 7), exercises: [{ varUuid: a, sets: [{ w, r: 5 }] }] }));
    state.sessions = mk([90, 100, 115]); const up = setStartTrendComment(a);
    state.sessions = mk([115, 100, 90]); const down = setStartTrendComment(a);
    state.sessions = mk([100, 100, 100]); const flat = setStartTrendComment(a);
    state.sessions = mk([100]); const none = setStartTrendComment(a);
    return { up, down, flat, none };
  });
  expect(r.up.toLowerCase()).toContain('trending up');
  expect(r.down.toLowerCase()).toMatch(/dip|turn it around/);
  expect(r.flat.toLowerCase()).toMatch(/flat|plateau/);
  expect(r.none).toBe('');   // a single training day is not a trend → no comment
});

test('the coach appends the trend note on the FIRST set start, but not on later sets', async ({ page }) => {
  const r = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: '1', date: iso(21), exercises: [{ varUuid: a, sets: [{ w: 90, r: 5 }] }] },
      { id: '2', date: iso(14), exercises: [{ varUuid: a, sets: [{ w: 95, r: 5 }] }] },
      { id: '3', date: iso(7),  exercises: [{ varUuid: a, sets: [{ w: 98, r: 5 }] }] },
      { id: '4', date: iso(1),  exercises: [{ varUuid: a, sets: [{ w: 108, r: 5 }] }] },
    ];
    state.annunciation = { ...annunciationCfg(), start: true, startLimit: 0 };
    const spoken = []; const real = window.annunce; window.annunce = (t) => spoken.push(t);
    pending = { varUuid: a, subUuid: null, sets: [{ w: 100, r: '' }] };       // first set: weight in, no reps yet
    annunceSetStart();
    const first = spoken.splice(0).join(' ');
    pending.sets = [{ w: 100, r: 5 }, { w: 100, r: '' }];                      // now starting the SECOND set
    annunceSetStart();
    const second = spoken.splice(0).join(' ');
    window.annunce = real;
    return { first, second };
  });
  expect(r.first.toLowerCase()).toContain('first set');     // the normal position cue…
  expect(r.first.toLowerCase()).toContain('trending up');   // …plus the climbing-strength note
  expect(r.second).not.toMatch(/trending up/i);             // 2nd set: position cue only, no trend note
});

test('no trend note when set-start annunciation is off', async ({ page }) => {
  const spoke = await page.evaluate(() => {
    let a = null; for (const [u] of VAR_INDEX) { if (exMode(u).mode === 'standard') { a = u; break; } }
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: '1', date: iso(14), exercises: [{ varUuid: a, sets: [{ w: 90, r: 5 }] }] },
      { id: '2', date: iso(1),  exercises: [{ varUuid: a, sets: [{ w: 110, r: 5 }] }] },
    ];
    state.annunciation = { ...annunciationCfg(), start: false };               // start cue disabled
    let said = false; const real = window.annunce; window.annunce = () => { said = true; };
    pending = { varUuid: a, subUuid: null, sets: [{ w: 100, r: '' }] };
    annunceSetStart();
    window.annunce = real;
    return said;
  });
  expect(spoke).toBe(false);   // nothing spoken at all when the start cue is off
});
