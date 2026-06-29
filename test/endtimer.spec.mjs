// feat 287 — the live workout HUD (the ⏱ elapsed stat by the brand AND the rest-timer bar, including its idle
// "since last set" strip) belongs to an IN-PROGRESS workout. It used to linger after a workout was ended because
// the rest bar keyed off any past set's timestamp and the elapsed stat only refreshed on the next 1 s tick. Now
// both are gated on an active (un-ended) session and cleared the instant the workout ends.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof refreshRestBar === 'function' && typeof refreshTopbarLive === 'function'
    && typeof finalizeEndWorkout === 'function' && typeof restTick === 'function' && typeof getActiveSession === 'function', null, { timeout: 15000 });
});

const seedActive = (page) => page.evaluate(() => {
  const v = (() => { for (const [u, i] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; })();
  const now = Date.now();
  state.workoutControls = { ...(state.workoutControls || {}), restTimer: true, restRecEnabled: false };
  state.sessions = [{ id: 's', date: new Date(now - 60000).toISOString(), updatedAt: new Date(now).toISOString(),
    exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 100, r: 5, wTs: new Date(now - 40000).toISOString(), ts: new Date(now - 20000).toISOString() }] }] }];
  pending = { varUuid: null, subUuid: null, sets: [{ w: '', r: '' }] };
});

test('feat 287 — ending a workout hides the rest bar and the elapsed timer immediately and on later ticks', async ({ page }) => {
  await seedActive(page);
  const r = await page.evaluate(() => {
    refreshRestBar(); refreshTopbarLive();
    const bar = document.getElementById('rest-bar');
    const before = { rest: bar.style.display !== 'none', restTxt: bar.textContent, elapsed: !!document.querySelector('#topbar-live .tbl-elapsed') };
    finalizeEndWorkout(getActiveSession(), true);  // end, skipping the confirm dialog
    const after = { active: !!getActiveSession(), rest: bar.style.display !== 'none', restClass: document.body.classList.contains('rest-bar-on'), elapsed: !!document.querySelector('#topbar-live .tbl-elapsed') };
    restTick();                                    // a later 1 s tick must not revive either
    const afterTick = { rest: bar.style.display !== 'none', elapsed: !!document.querySelector('#topbar-live .tbl-elapsed') };
    return { before, after, afterTick };
  });
  expect(r.before.rest).toBe(true);          // the rest bar shows during the workout…
  expect(r.before.restTxt).toContain('Rest');
  expect(r.before.elapsed).toBe(true);       // …and so does the elapsed stat
  expect(r.after.active).toBe(false);        // workout ended
  expect(r.after.rest).toBe(false);          // rest bar hidden the instant it ends
  expect(r.after.restClass).toBe(false);     // …and its body class cleared (no layout gap)
  expect(r.after.elapsed).toBe(false);       // elapsed timer cleared immediately
  expect(r.afterTick.rest).toBe(false);      // a later tick doesn't bring them back
  expect(r.afterTick.elapsed).toBe(false);
});

test('feat 369 — "Save sets & end" still ends the workout when the open set can\'t be saved', async ({ page }) => {
  await seedActive(page);
  const r = await page.evaluate(async () => {
    const v = (() => { for (const [u, i] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; })();
    // an INCOMPLETE open set (weight, no reps) — hasUnsavedSets() is true but it can't be saved as a valid set
    pending = { varUuid: v, subUuid: null, sets: [{ w: '100', r: '' }] };
    modalState.open = true;
    navTo('workout', { replace: true });
    refreshRestBar(); refreshTopbarLive();
    const before = { active: !!getActiveSession(), endBtn: !!document.getElementById('wc-end-btn') };
    endWorkout(false);                                   // tap → the "Unsaved sets" dialog
    await new Promise(r => setTimeout(r, 20));
    const dlg = [...document.querySelectorAll('.choice-title')].some(t => /Unsaved sets/.test(t.textContent));
    const saveBtn = [...document.querySelectorAll('.choice-actions .choice-btn')].find(b => /Save sets & end/.test(b.textContent));
    saveBtn?.click();                                    // "💾 Save sets & end" — the save no-ops (incomplete), but it must still END
    await new Promise(r => setTimeout(r, 30));
    const bar = document.getElementById('rest-bar');
    return { before, dlg, after: { active: !!getActiveSession(), endBtn: !!document.getElementById('wc-end-btn'), rest: bar.style.display !== 'none', elapsed: !!document.querySelector('#topbar-live .tbl-elapsed'), workoutClass: document.body.classList.contains('workout-active') } };
  });
  expect(r.before.active).toBe(true);
  expect(r.dlg).toBe(true);              // the unsaved-sets prompt showed
  expect(r.after.active).toBe(false);    // …and the workout actually ended (the bug: it used to stay active)
  expect(r.after.endBtn).toBe(false);    // End Workout button gone
  expect(r.after.rest).toBe(false);      // rest timer cleared
  expect(r.after.elapsed).toBe(false);   // workout timer cleared
  expect(r.after.workoutClass).toBe(false);
});

test('feat 287 — with no active session the rest bar stays hidden even with past logged sets', async ({ page }) => {
  const r = await page.evaluate(() => {
    const now = Date.now();
    // a fully ENDED session earlier today (past set timestamps exist, but nothing is active)
    state.workoutControls = { ...(state.workoutControls || {}), restTimer: true };
    state.sessions = [{ id: 'done', date: new Date(now - 3 * 3600000).toISOString(), endedAt: new Date(now - 2 * 3600000).toISOString(),
      exercises: [{ varUuid: 'x', subUuid: null, sets: [{ w: 100, r: 5, wTs: new Date(now - 2.6 * 3600000).toISOString(), ts: new Date(now - 2.5 * 3600000).toISOString() }] }] }];
    pending = { varUuid: null, subUuid: null, sets: [{ w: '', r: '' }] };
    const bar = document.getElementById('rest-bar');
    bar.innerHTML = 'STALE'; bar.style.display = 'flex';
    refreshRestBar();
    return { active: !!getActiveSession(), shown: bar.style.display !== 'none', idleClass: document.body.classList.contains('rest-bar-idle') };
  });
  expect(r.active).toBe(false);
  expect(r.shown).toBe(false);    // no "since last set" idle strip once the workout is done
  expect(r.idleClass).toBe(false);
});
