// feat 206 — set-START annunciations: when a set opens (weight entered), speak its position —
// "First set of 4", "Set 2 of 4", "Last set — make it count", "Extra set 1". Plan-aware (the matching
// step's target supplies y; saved sets count toward x). Off by default; a persisted setting.
// feat 207 — set-END annunciations: when a set completes (reps land) — "One down — 3 to go",
// "2 of 4 down", "Half done", "One more, then [next step]", "All done — time for [next step]".
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

test('the set-END phrase matrix: one down / x of y / half / one more / all done / extra (feat 207)', async ({ page }) => {
  const r = await page.evaluate(() => ({
    one: setEndPhrase({ x: 1, y: 4 }),
    half4: setEndPhrase({ x: 2, y: 4 }),
    mid5: setEndPhrase({ x: 2, y: 5 }),
    half5: setEndPhrase({ x: 3, y: 5 }),
    oneMore: setEndPhrase({ x: 3, y: 4 }, null),
    oneMoreNext: setEndPhrase({ x: 3, y: 4 }, 'Squat'),
    allDone: setEndPhrase({ x: 4, y: 4 }, null),
    allDoneNext: setEndPhrase({ x: 4, y: 4 }, 'Squat'),
    extra: setEndPhrase({ x: 5, y: 4 }),
    noPlan1: setEndPhrase({ x: 1, y: null }),
    noPlan3: setEndPhrase({ x: 3, y: null }),
  }));
  expect(r.one).toBe('One down — 3 to go');
  expect(r.half4).toBe('Half done');
  expect(r.mid5).toBe('2 of 5 down');
  expect(r.half5).toBe('Half done');
  expect(r.oneMore).toBe('One more to go');
  expect(r.oneMoreNext).toBe('One more, then Squat');
  expect(r.allDone).toBe('All done');
  expect(r.allDoneNext).toBe('All done — time for Squat');
  expect(r.extra).toBe('Extra set down');
  expect(r.noPlan1).toBe('One down');
  expect(r.noPlan3).toBe('3 down');
});

test('reps landing speaks once; edits/clears behave; r=0 and off are silent (feat 207)', async ({ page }) => {
  const said = await page.evaluate(() => {
    normalizeState();
    state.sessions = []; state.plans = [];
    window._said = [];
    window.annunce = (t) => { window._said.push(t); };
    const fam = FAMILIES.find(f => f.id === 'bicep-curl');
    pending.varUuid = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
    pending.sets = [{ w: '100', r: '', wTs: new Date().toISOString() }];
    modalState.isEditing = false;
    state.annunciation = { ...annunciationCfg(), start: false, end: true };
    commitSetField(0, 'r', '8');    // set completes → "One down"
    commitSetField(0, 'r', '10');   // rep edit on a done set → silent
    pending.sets.push({ w: '50', r: '', wTs: new Date().toISOString() });
    commitSetField(1, 'r', '0');    // zero reps → not a real completion, silent
    commitSetField(1, 'r', '');     // reset the zero-rep stamp
    commitSetField(1, 'r', '5');    // second set completes → "2 down"
    state.annunciation = { ...annunciationCfg(), end: false };
    commitSetField(1, 'r', '');     // clear…
    commitSetField(1, 'r', '6');    // …re-complete with the cue OFF → silent
    const out = window._said.slice();
    pending.sets = [{ w: '', r: '' }]; pending.varUuid = null;
    return out;
  });
  expect(said).toEqual(['One down', '2 down']);
});

test('plan flow: "One more, then [next]" and "All done — time for [next]" (feat 207)', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const fam = FAMILIES.find(f => f.id === 'bicep-curl');
    const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
    const sqTitle = FAMILIES.find(f => f.id === 'squat').title;
    state.plans = [{ id: 'p-end', name: 'End', steps: [
      { id: 's1', sets: 2, options: [{ type: 'movement', familyId: 'bicep-curl' }] },
      { id: 's2', sets: 3, options: [{ type: 'movement', familyId: 'squat' }] } ] }];
    state.sessions = [{ id: 'sess', date: new Date().toISOString(), updatedAt: new Date().toISOString(), planId: 'p-end', exercises: [] }];
    modalState.isEditing = false;
    window._said = [];
    window.annunce = (t) => { window._said.push(t); };
    state.annunciation = { ...annunciationCfg(), start: false, end: true };
    pending.varUuid = u; pending.subUuid = null;
    pending.sets = [{ w: '50', r: '', wTs: new Date().toISOString() }];
    commitSetField(0, 'r', '10');                                  // 1 of 2 → one more, then Squat
    pending.sets.push({ w: '50', r: '', wTs: new Date().toISOString() });
    commitSetField(1, 'r', '10');                                  // 2 of 2 → all done, time for Squat
    const out = window._said.slice();
    pending.sets = [{ w: '', r: '' }]; pending.varUuid = null; state.sessions = []; state.plans = [];
    return { out, sqTitle };
  });
  expect(r.out[0]).toBe('One more, then ' + r.sqTitle);
  expect(r.out[1]).toBe('All done — time for ' + r.sqTitle);
});
