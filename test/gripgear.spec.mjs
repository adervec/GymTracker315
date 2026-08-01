// feat 454 — (a) grip gear: RDX lifting hooks, Iron Bull Fat Gripz and the RDX arm blaster, each filed in the
// family whose muscles it trains; (b) the Life Fitness fixed row machine's three handles; and (c) the timed-hold
// bug — a hold time typed into the Seconds field left its live ⏱ timer ticking.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof autoSetupKind === 'function' && typeof secondaryParentsOf === 'function', null, { timeout: 15000 });
});

// id → [home family, equipment picker the entry should open]
const GEAR = {
  hooks: [['hook-assisted-dl', 'deadlift', 'barbell'], ['hook-rack-pull', 'deadlift', 'barbell'],
    ['hook-high-rep-rdl', 'deadlift', 'barbell'], ['hook-shrug', 'shrugs', 'barbell'],
    ['hook-bb-row', 'row', 'barbell'], ['hook-pulldown', 'lat-pulldown', 'pin'],
    ['hook-carry', 'loaded-carries', null], ['hook-free-top-set', 'grip-training', 'barbell']],
  fatGrips: [['fat-grip-shrug', 'shrugs', 'barbell'], ['fat-grip-bb-row', 'row', 'barbell'],
    ['fat-grip-pulldown', 'lat-pulldown', 'pin'], ['fat-grip-carry', 'loaded-carries', null],
    ['fat-grip-hammer-curl', 'hammer-curl', 'dumbbell'], ['fat-grip-bench', 'flat-bench-press', 'barbell'],
    ['fat-grip-ohp', 'shoulder-press', 'barbell'], ['fat-grip-thickness-ladder', 'grip-training', null]],
  blaster: [['blaster-bb-curl', 'bicep-curl', 'barbell'], ['blaster-ez-curl', 'bicep-curl', 'barbell'],
    ['blaster-db-alt-curl', 'bicep-curl', 'dumbbell'], ['blaster-21s', 'bicep-curl', 'barbell'],
    ['blaster-cable-curl', 'bicep-curl', 'pin'], ['blaster-hammer-curl', 'hammer-curl', 'dumbbell'],
    ['blaster-reverse-curl', 'reverse-curl', 'barbell']],
  lfRow: [['lf-row-pronated', 'row', 'pin'], ['lf-row-neutral', 'row', 'pin'], ['lf-row-supinated', 'row', 'pin'],
    ['lf-row-single-arm', 'row', 'pin'], ['lf-row-grip-cycle', 'row', 'pin']],
};
const ALL = Object.values(GEAR).flat();

test('feat 454 — every gear entry is indexed in its own family, fully documented, and animates', async ({ page }) => {
  const r = await page.evaluate((all) => all.map(([id, fam, equip]) => {
    const f = FAMILIES.find(x => x.id === fam);
    const v = f && (f.variations || []).find(x => x.id === id);
    if (!v) return { id, err: 'missing from ' + fam };
    const ref = exercises.find(e => e.id === fam);
    const rv = ref && (ref.variations || []).find(x => x.uuid === v.uuid);
    return { id, fam: VAR_INDEX.get(v.uuid).family.id, wantFam: fam,
      equip: autoSetupKind(v.uuid), wantEquip: equip,
      motion: !!motionForVariation(v.uuid), visible: varVisibleInPicker(f, v),
      thin: !rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length };
  }), ALL);
  r.forEach(x => {
    expect(x.err, x.id).toBeUndefined();
    expect(x.fam, x.id + ' must live in ' + x.wantFam).toBe(x.wantFam);
    expect(x.equip, x.id + ' loading tool').toBe(x.wantEquip);
    expect(x.motion, x.id + ' must animate').toBe(true);
    expect(x.visible, x.id + ' must be pickable').toBe(true);
    expect(x.thin, x.id + ' has thin reference content').toBe(false);
  });
  expect(r.length).toBe(28);
});

test('feat 454 — fat-grip work cross-lists into Grip Training; hook work deliberately does not', async ({ page }) => {
  const r = await page.evaluate((gear) => {
    const uuidOf = id => { let u = null; FAMILIES.forEach(f => (f.variations || []).forEach(v => { if (v.id === id) u = v.uuid; })); return u; };
    const thick = gear.fatGrips.filter(([id]) => id !== 'fat-grip-thickness-ladder'); // already lives in grip-training
    return {
      fat: thick.map(([id]) => ({ id, linked: secondaryParentsOf(uuidOf(id)).includes('grip-training'),
        satisfies: optionMatchesVar({ type: 'movement', familyId: 'grip-training' }, uuidOf(id)) })),
      hooks: gear.hooks.filter(([, f]) => f !== 'grip-training')
        .map(([id]) => ({ id, linked: secondaryParentsOf(uuidOf(id)).includes('grip-training') })),
      inFamilyList: secondaryVarsForFamily('grip-training').length,
    };
  }, GEAR);
  r.fat.forEach(x => {
    expect(x.linked, x.id + ' is grip work — it should cross-list into Grip Training').toBe(true);
    expect(x.satisfies, x.id + ' should satisfy a grip-training plan step').toBe(true);
  });
  r.hooks.forEach(x => expect(x.linked, x.id + ' removes the grip — it must NOT cross-list into Grip Training').toBe(false));
  expect(r.inFamilyList).toBeGreaterThan(0);
});

test('feat 454 — the fixed row machine covers all three handles plus the grip-cycle drop set', async ({ page }) => {
  const r = await page.evaluate(() => {
    const row = FAMILIES.find(f => f.id === 'row');
    const get = id => (row.variations || []).find(v => v.id === id);
    const ref = exercises.find(e => e.id === 'row');
    const text = id => JSON.stringify((ref.variations || []).find(v => v.uuid === get(id).uuid)).toLowerCase();
    return {
      pronated: text('lf-row-pronated').includes('palms down'),
      neutral: text('lf-row-neutral').includes('palms facing each other'),
      supinated: text('lf-row-supinated').includes('palms up'),
      // the supinated entry must warn against forcing a fixed handle round
      supinatedWarns: /never force a locked handle/.test(text('lf-row-supinated')),
      titles: ['lf-row-pronated', 'lf-row-neutral', 'lf-row-supinated', 'lf-row-single-arm', 'lf-row-grip-cycle']
        .map(id => get(id).title),
    };
  });
  expect(r.pronated).toBe(true);
  expect(r.neutral).toBe(true);
  expect(r.supinated).toBe(true);
  expect(r.supinatedWarns).toBe(true);
  r.titles.forEach(t => expect(t).toContain('Life Fitness'));
});

test('feat 454 — the thickness ladder is a timed hold, and hooked pulls warn they are not comparable', async ({ page }) => {
  const r = await page.evaluate(() => {
    const uuidOf = (fam, id) => FAMILIES.find(f => f.id === fam).variations.find(v => v.id === id).uuid;
    const ref = (fam, id) => JSON.stringify(exercises.find(e => e.id === fam).variations
      .find(v => v.uuid === uuidOf(fam, id))).toLowerCase();
    return {
      ladderMode: exMode(uuidOf('grip-training', 'fat-grip-thickness-ladder')).mode,
      dlNotComparable: /not comparable/.test(ref('deadlift', 'hook-assisted-dl')),
      carryHonest: /strapless/.test(ref('loaded-carries', 'hook-carry')),
      topSetIsHabit: Object.keys(exercises.find(e => e.id === 'grip-training').variations
        .find(v => v.uuid === uuidOf('grip-training', 'hook-free-top-set')).programming),
    };
  });
  expect(r.ladderMode).toBe('time');
  expect(r.dlNotComparable).toBe(true);
  expect(r.carryHonest).toBe(true);
  expect(r.topSetIsHabit).toContain('Habit');
});

test('feat 454 — typing a hold time hides the live timer; clearing it brings the timer back', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v = null; for (const [u] of VAR_INDEX) if (exMode(u).mode === 'time') { v = u; break; }
    state.readonly = false;
    // house pattern (holdtimer.spec) — seed a started hold, then force the modal flags AFTER openLogModal
    pending = { varUuid: v, subUuid: null, sets: [{ w: 0, r: '', wTs: new Date(Date.now() - 12000).toISOString(), ts: undefined }] };
    openLogModal();
    modalState.showPicker = false; modalState.isEditing = false; modalState.open = true;
    renderModal();
    const btn = () => document.querySelector('#trk-sets-container .hold-timer-btn[data-hold-idx="0"]');
    const started = { exists: !!btn(), hidden: btn() ? btn().hidden : null };
    commitSetField(0, 'r', 45);           // typed straight into the Seconds field — the bug: timer kept ticking
    const typed = { exists: !!btn(), hidden: btn() ? btn().hidden : null, done: !!pending.sets[0].ts,
      ticking: !!_holdTimerInt, secs: pending.sets[0].r };
    commitSetField(0, 'r', '');           // cleared → the hold is open again
    const cleared = { hidden: btn() ? btn().hidden : null, done: !!pending.sets[0].ts, ticking: !!_holdTimerInt };
    closeLogModal();
    return { started, typed, cleared };
  });
  expect(r.started.exists, 'a started timed hold shows the ⏱ timer').toBe(true);
  expect(r.started.hidden).toBe(false);
  expect(r.typed.secs).toBe(45);
  expect(r.typed.done, 'typing seconds finishes the set').toBe(true);
  expect(r.typed.hidden, 'the timer must disappear once the seconds are entered').toBe(true);
  expect(r.typed.ticking, 'the 1s interval must stop with no visible timer').toBe(false);
  expect(r.cleared.done).toBe(false);
  expect(r.cleared.hidden, 'clearing the field re-opens the hold').toBe(false);
  expect(r.cleared.ticking, 'and re-arms the ticker').toBe(true);
});
