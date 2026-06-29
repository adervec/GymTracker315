// feat 380 — all spoken-coach settings live on their own "Coach Voice" page (set-coach): persona picker, per-coach
// voice, auto-pick, set-start/end annunciations + cue limits, audio ducking, tip narration, and the timed-hold cue.
// They no longer clutter Preferences.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof PAGES !== 'undefined'
    && typeof SETTINGS_PAGE_SECS !== 'undefined', null, { timeout: 15000 });
});

test('feat 380 — set-coach is a Settings leaf in the menu with a unique emoji', async ({ page }) => {
  const r = await page.evaluate(() => ({
    exists: !!PAGES['set-coach'],
    parent: PAGES['set-coach'].parent,
    inMenu: PAGES.settings.children.includes('set-coach'),
    emoji: PAGES['set-coach'].emoji,
    emojiUnique: Object.values(PAGES).filter(p => p.emoji === PAGES['set-coach'].emoji).length === 1,
    secs: SETTINGS_PAGE_SECS['set-coach'],
  }));
  expect(r.exists).toBe(true);
  expect(r.parent).toBe('settings');
  expect(r.inMenu).toBe(true);
  expect(r.emojiUnique).toBe(true);
  expect(r.secs).toEqual(['coach-voice', 'coach-hold-cue']);
});

test('feat 380 — the Coach Voice page projects all the coach-voice controls into #trk-main', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('set-coach', { replace: true });
    const m = document.getElementById('trk-main');
    return {
      persona: !!m.querySelector('[data-coach-persona]'),
      autoPick: !!m.querySelector('[data-coachauto]'),
      annStart: !!m.querySelector('[data-pref-ann="start-on"]'),
      annEnd: !!m.querySelector('[data-pref-ann="end-on"]'),
      ttsTip: !!m.querySelector('[data-pref-tts]'),
      duck: !!m.querySelector('[data-pref-ann="duck-on"]'),
      holdCue: !!m.querySelector('[data-holdcue]'),
      title: m.textContent.includes('Coach voice') && m.textContent.includes('Timed-hold cue'),
    };
  });
  expect(r.persona).toBe(true);
  expect(r.autoPick).toBe(true);
  expect(r.annStart).toBe(true);
  expect(r.annEnd).toBe(true);
  expect(r.ttsTip).toBe(true);
  expect(r.duck).toBe(true);
  expect(r.holdCue).toBe(true);     // the "ready · set · go" timed-hold cue rode along
  expect(r.title).toBe(true);
});

test('feat 380 — Preferences no longer carries the coach-voice controls (they moved out)', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('set-prefs', { replace: true });
    const m = document.getElementById('trk-main');
    return {
      noPersona: !m.querySelector('[data-coach-persona]'),
      noAnn: !m.querySelector('[data-pref-ann]'),
      stillHasUnit: !!m.querySelector('[data-pref-unit]'),       // general prefs still here
      stillHasHeadphone: !!m.querySelector('[data-pref-hp]'),    // "More preferences" half still projects here
      stillHasWeightLimit: !!m.querySelector('[data-pref-wlimit]'),
    };
  });
  expect(r.noPersona).toBe(true);
  expect(r.noAnn).toBe(true);
  expect(r.stillHasUnit).toBe(true);
  expect(r.stillHasHeadphone).toBe(true);
  expect(r.stillHasWeightLimit).toBe(true);
});

test('feat 380 — selecting a persona on the Coach Voice page works (binding rode along)', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('set-coach', { replace: true });
    state.sound = { ...(state.sound || {}), audio: false }; // keep the preview silent
    document.querySelector('#trk-main [data-coach-persona="zen"]').click();
    return { persona: state.coachPersona };
  });
  expect(r.persona).toBe('zen');
});
