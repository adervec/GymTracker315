// feat 338 — historize fitness-archetype shifts (state.archetypeHistory) and, when ending a workout produces a
// shift, celebrate it in a popup. The Fitness Focus page shows the journey once there are 2+ entries.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof recordArchetypeShift === 'function' && typeof showArchetypeShiftDialog === 'function'
    && typeof finalizeEndWorkout === 'function' && typeof applyImport === 'function', null, { timeout: 15000 });
});

const benchVar = (page) => page.evaluate(() => FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid);
const mkSessions = (bench) => `state.sessions = [2,5,9,12,16,20].map(function(da){ var d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-da); var iso=d.toISOString(); return { id:'s'+da, date:iso, updatedAt:iso, endedAt:iso, exercises:[{ varUuid:'${bench}', subUuid:null, sets:[{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3}] }] }; });`;

test('recordArchetypeShift seeds a baseline (no popup), logs a real shift, ignores no-change', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.archetypeHistory = [];
    const realF = window.fitnessFocus, realA = window.fitnessArchetype;
    window.fitnessFocus = () => ({ ready: true, pct: {} });
    let who = 'powerlifter';
    window.fitnessArchetype = () => ({ primary: ARCHETYPES.find(a => a.id === who) });
    const seed = recordArchetypeShift();      // first ever → baseline, no shift
    const len1 = state.archetypeHistory.length;
    const same = recordArchetypeShift();      // unchanged
    const len2 = state.archetypeHistory.length;
    who = 'endurance';
    const shift = recordArchetypeShift();      // changed → a real shift
    const len3 = state.archetypeHistory.length;
    window.fitnessFocus = realF; window.fitnessArchetype = realA;
    return { seed, len1, same, len2, shift, len3, lastFrom: state.archetypeHistory[len3 - 1].from };
  });
  expect(r.seed).toBeNull();
  expect(r.len1).toBe(1);
  expect(r.same).toBeNull();
  expect(r.len2).toBe(1);
  expect(r.shift).not.toBeNull();
  expect(r.shift.from).toBe('powerlifter');
  expect(r.shift.to).toBe('endurance');
  expect(r.len3).toBe(2);
  expect(r.lastFrom).toBe('powerlifter');
});

test('ending a workout shows the archetype-shift popup + appends to history', async ({ page }) => {
  const r = await page.evaluate(() => {
    let u = null; for (const [uu] of VAR_INDEX) { if (exMode(uu).mode === 'standard') { u = uu; break; } }
    const active = { id: 'a', date: new Date().toISOString(), exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100, r: 5, ts: new Date().toISOString() }] }] };
    state.sessions = [active];
    state.archetypeHistory = [{ at: '2026-01-01T00:00:00.000Z', id: 'powerlifter', name: 'Powerlifter', emoji: '🏋️', from: null }];
    const realF = window.fitnessFocus, realA = window.fitnessArchetype, realD = window.showArchetypeShiftDialog;
    window.fitnessFocus = () => ({ ready: true, pct: {} });
    window.fitnessArchetype = () => ({ primary: ARCHETYPES.find(a => a.id === 'endurance') });
    let dlg = null; window.showArchetypeShiftDialog = (s) => { dlg = s; };
    finalizeEndWorkout(active, true);          // skipConfirm → finish() runs, no confirm dialog
    window.fitnessFocus = realF; window.fitnessArchetype = realA; window.showArchetypeShiftDialog = realD;
    return { ended: !!active.endedAt, dlg, histLen: state.archetypeHistory.length };
  });
  expect(r.ended).toBe(true);
  expect(r.dlg).not.toBeNull();
  expect(r.dlg.to).toBe('endurance');
  expect(r.histLen).toBe(2);
});

test('archetypeHistory merges across devices (union by timestamp, chronological)', async ({ page }) => {
  const ids = await page.evaluate(() => {
    state.sessions = []; state.archetypeHistory = [{ at: '2026-02-01T00:00:00.000Z', id: 'powerlifter', name: 'Powerlifter' }];
    applyImport({ sessions: [], archetypeHistory: [
      { at: '2026-01-01T00:00:00.000Z', id: 'bodybuilder', name: 'Bodybuilder' },
      { at: '2026-03-01T00:00:00.000Z', id: 'endurance', name: 'Endurance Athlete' },
    ] }, 'merge');
    return state.archetypeHistory.map(h => h.id);
  });
  expect(ids).toEqual(['bodybuilder', 'powerlifter', 'endurance']);
});

test('the Fitness Focus page renders the archetype journey once there are 2+ entries', async ({ page }) => {
  const bench = await benchVar(page);
  const r = await page.evaluate((mk) => {
    eval(mk);   // a ready (strength-dominant) profile
    state.archetypeHistory = [
      { at: '2026-01-01T00:00:00.000Z', id: 'bodybuilder', name: 'Bodybuilder', emoji: '💪', from: null },
      { at: '2026-03-01T00:00:00.000Z', id: 'powerlifter', name: 'Powerlifter', emoji: '🏋️', from: 'bodybuilder' },
    ];
    navTo('focus');
    const m = document.getElementById('trk-main');
    return { hasJourney: /arch-journey/.test(m.innerHTML), title: /Your archetype journey/.test(m.innerHTML), now: /ajr-now/.test(m.innerHTML) };
  }, mkSessions(bench));
  expect(r.hasJourney).toBe(true);
  expect(r.title).toBe(true);
  expect(r.now).toBe(true);    // the latest entry is tagged "now"
});
