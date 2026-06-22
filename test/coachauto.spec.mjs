// feat 303 — auto-pick the coach per workout. coachAuto ∈ off|vibe|random. 'vibe' matches the active plan's
// character (HIIT→Hype, mobility→Zen, heavy→Drill Sergeant, hypertrophy→Analyst…); 'random' re-rolls a
// flavored coach each workout. The pick rides on the active session (session.coach); activeCoachPersona() —
// and therefore coachify/coachPhrase/coachVoice — routes through it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coachAutoMode === 'function' && typeof activeCoachPersona === 'function'
    && typeof pickWorkoutCoachPersona === 'function' && typeof workoutVibePersona === 'function'
    && typeof coachify === 'function', null, { timeout: 15000 });
});

test('coachAutoMode coerces unknown values to off', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    state.coachAuto = 'vibe'; out.vibe = coachAutoMode();
    state.coachAuto = 'random'; out.random = coachAutoMode();
    state.coachAuto = 'nonsense'; out.bad = coachAutoMode();
    state.coachAuto = undefined; out.unset = coachAutoMode();
    return out;
  });
  expect(r.vibe).toBe('vibe'); expect(r.random).toBe('random');
  expect(r.bad).toBe('off'); expect(r.unset).toBe('off');
});

test('the active workout’s auto coach overrides the chosen persona', async ({ page }) => {
  const r = await page.evaluate(() => {
    const today = new Date().toISOString();
    state.coachPersona = 'gruff';
    state.coachAuto = 'off'; state.sessions = [];
    const off = activeCoachPersona().id;                       // off → the chosen persona
    state.coachAuto = 'random';
    state.sessions = [{ id: 's1', date: today, exercises: [], coach: 'zen' }];
    const onActive = activeCoachPersona().id;                  // auto + active session → the session's coach
    state.sessions = [];
    const onNoSession = activeCoachPersona().id;               // auto + no workout → fall back to the chosen persona
    return { off, onActive, onNoSession };
  });
  expect(r.off).toBe('gruff');
  expect(r.onActive).toBe('zen');
  expect(r.onNoSession).toBe('gruff');
});

test('random pick always returns a flavored (non-system) persona', async ({ page }) => {
  const ok = await page.evaluate(() => {
    state.coachAuto = 'random';
    for (let i = 0; i < 40; i++) { const id = pickWorkoutCoachPersona(); const p = COACH_PERSONAS.find(x => x.id === id); if (!p || p.sys) return false; }
    return true;
  });
  expect(ok).toBe(true);
});

test('vibe mapping reads the active plan’s character', async ({ page }) => {
  const r = await page.evaluate(() => {
    const today = new Date().toISOString();
    state.coachAuto = 'vibe';
    const vibeFor = (plan) => {
      state.plans = [plan];
      state.sessions = [{ id: 's', date: today, exercises: [], planId: plan.id }];
      return workoutVibePersona();
    };
    return {
      hiit: vibeFor({ id: 'a', name: 'Tabata Sprint Circuit' }),
      mobility: vibeFor({ id: 'b', name: 'Morning Mobility & Recovery Flow' }),
      heavy: vibeFor({ id: 'c', name: 'Heavy Powerlifting 5x5' }),
      hyper: vibeFor({ id: 'd', name: 'Hypertrophy Pump Sculpt' }),
      chill: vibeFor({ id: 'e', name: 'Easy Day', intensity: 1 }),
    };
  });
  expect(r.hiit).toBe('hype');
  expect(r.mobility).toBe('zen');
  expect(r.heavy).toBe('sergeant');
  expect(r.hyper).toBe('analyst');
  expect(r.chill).toBe('buddy');
});

test('coachify gates on the EFFECTIVE persona, not the legacy ttsVoice', async ({ page }) => {
  const r = await page.evaluate(() => {
    const today = new Date().toISOString();
    state.coachPersona = 'neutral'; state.ttsVoice = 'system'; // base = system voice
    state.coachAuto = 'vibe';
    state.sessions = [{ id: 's', date: today, exercises: [], coach: 'gruff' }]; // …but the workout's coach is flavored
    const u1 = {}; coachify(u1);   // flavored effective persona → pitch applied despite ttsVoice==='system'
    state.coachAuto = 'off';
    const u2 = {}; coachify(u2);   // neutral effective → utterance untouched
    return { autoPitch: u1.pitch, neutralPitch: u2.pitch };
  });
  expect(typeof r.autoPitch).toBe('number');
  expect(r.neutralPitch).toBeUndefined();
});
