// feat 206 — set-START annunciations: when a set opens (weight entered), speak its position —
// "First set of 4", "Set 2 of 4", "Last set — make it count", "Extra set 1". Plan-aware (the matching
// step's target supplies y; saved sets count toward x). Off by default; a persisted setting.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof annunceSetStart === 'function' && typeof setStartPhrase === 'function', null, { timeout: 15000 });
});

test('off by default, persisted via state.annunciation (a settings key)', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const def = annunciationCfg().start;
    state.annunciation = { ...annunciationCfg(), start: true };
    saveState();
    const persisted = JSON.parse(localStorage.getItem('overload_tracker_v2')).annunciation.start;
    state.annunciation = { ...annunciationCfg(), start: false }; saveState();
    return { def, persisted, inKeys: SETTINGS_KEYS.includes('annunciation') };
  });
  expect(r.def).toBe(false);
  expect(r.persisted).toBe(true);
  expect(r.inKeys).toBe(true);
});

test('the phrase matrix: first / x of y / last / extra / plan-less', async ({ page }) => {
  const r = await page.evaluate(() => ({
    first: setStartPhrase({ x: 1, y: 4 }),
    mid: setStartPhrase({ x: 2, y: 4 }),
    last: setStartPhrase({ x: 4, y: 4 }),
    extra: setStartPhrase({ x: 6, y: 4 }),
    single: setStartPhrase({ x: 1, y: 1 }),
    noPlanFirst: setStartPhrase({ x: 1, y: null }),
    noPlanN: setStartPhrase({ x: 3, y: null }),
  }));
  expect(r.first).toBe('First set of 4');
  expect(r.mid).toBe('Set 2 of 4');
  expect(r.last).toBe('Last set — make it count');
  expect(r.extra).toBe('Extra set 2');
  expect(r.single).toBe('One set — make it count');
  expect(r.noPlanFirst).toBe('First set');
  expect(r.noPlanN).toBe('Set 3');
});

test('setPositionInfo is plan-aware: y from the matching step, saved sets count toward x', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const fam = FAMILIES.find(f => f.id === 'bicep-curl');
    const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
    state.plans = [{ id: 'p-ann', name: 'Ann', steps: [{ id: 's1', sets: 3, options: [{ type: 'movement', familyId: 'bicep-curl' }] }] }];
    state.sessions = [{ id: 'sess', date: new Date().toISOString(), updatedAt: new Date().toISOString(), planId: 'p-ann',
      exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 50, r: 10 }] }] }];   // 1 saved set toward the step
    modalState.isEditing = false;
    pending.varUuid = u; pending.subUuid = null;
    pending.sets = [{ w: '55', r: '' }];                                          // + 1 in the form
    const onPlan = setPositionInfo();
    state.sessions = []; const offPlan = setPositionInfo();                       // no active session → plan-less
    pending.sets = [{ w: '', r: '' }]; pending.varUuid = null;
    return { onPlan, offPlan };
  });
  expect(r.onPlan).toEqual({ x: 2, y: 3, onPlan: true });   // saved 1 + in-form 1, target 3
  expect(r.offPlan.y).toBe(null);                            // plan-less fallback
  expect(r.offPlan.x).toBe(1);
});

test('entering a weight speaks ONCE per set start; edits do not re-announce; off = silent', async ({ page }) => {
  const said = await page.evaluate(() => {
    normalizeState();
    state.sessions = []; state.plans = [];
    window._said = [];
    window.annunce = (t) => { window._said.push(t); };       // spy the speaker
    const fam = FAMILIES.find(f => f.id === 'bicep-curl');
    pending.varUuid = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
    pending.sets = [{ w: '', r: '' }];
    modalState.isEditing = false;
    state.annunciation = { ...annunciationCfg(), start: true };
    commitSetField(0, 'w', '100');     // set starts → speak
    commitSetField(0, 'w', '105');     // weight edit on the SAME open set → silent
    commitSetField(0, 'r', '8');       // reps → set done, no start cue
    state.annunciation = { ...annunciationCfg(), start: false };
    pending.sets.push({ w: '', r: '' });
    commitSetField(1, 'w', '110');     // disabled → silent
    const out = window._said.slice();
    pending.sets = [{ w: '', r: '' }]; pending.varUuid = null;
    return out;
  });
  expect(said).toEqual(['First set']);
});

test('the Preferences drawer has the toggle and it works', async ({ page }) => {
  const r = await page.evaluate(() => {
    renderSettingsDrawer();
    const has = document.body.innerHTML.includes('Annunciate set start');
    const onPill = document.querySelector('[data-pref-ann="start-on"]');
    onPill.click();
    const turnedOn = annunciationCfg().start;
    document.querySelector('[data-pref-ann="start-off"]').click();
    return { has, turnedOn, off: !annunciationCfg().start };
  });
  expect(r.has).toBe(true);
  expect(r.turnedOn).toBe(true);
  expect(r.off).toBe(true);
});
