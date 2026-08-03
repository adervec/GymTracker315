// feat 461 — the sandbag as its own family. A sandbag is not a heavy dumbbell: the load SHIFTS, there are no
// handles, and it can be thrown and dragged. The vocabulary is organised around ground-to-shoulder (the
// signature lift), the carry POSITION (five different lifts, not five grips), and throws/drags.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof SANDBAG_ROWS !== 'undefined' && typeof secondaryParentsOf === 'function', null, { timeout: 15000 });
});

// the axes the tool actually has — each must be a trackable variation, not prose in a tip
const AXES = {
  'ground to shoulder': ['sbag-deadlift', 'sbag-lap', 'sbag-clean-bear-hug', 'sbag-shoulder', 'sbag-lap-and-shoulder',
    'sbag-clean-press', 'sbag-ground-to-overhead'],
  'throws': ['sbag-over-shoulder-toss', 'sbag-over-bar-throw', 'sbag-rotational-toss'],
  'carry positions': ['sbag-bear-hug-carry', 'sbag-shoulder-carry', 'sbag-zercher-carry', 'sbag-overhead-carry',
    'sbag-suitcase-carry', 'sbag-front-rack-carry', 'sbag-carry-medley'],
  'squats': ['sbag-bear-hug-squat', 'sbag-zercher-squat', 'sbag-back-squat', 'sbag-shouldered-squat', 'sbag-front-squat'],
  'hinge': ['sbag-rdl', 'sbag-good-morning', 'sbag-swing'],
  'press': ['sbag-strict-press', 'sbag-push-press', 'sbag-floor-press', 'sbag-z-press'],
  'single leg': ['sbag-bear-hug-lunge', 'sbag-shouldered-lunge', 'sbag-split-squat'],
  'pulls and drags': ['sbag-bent-row', 'sbag-drag', 'sbag-bear-crawl-drag'],
  'core': ['sbag-get-up', 'sbag-around-world', 'sbag-russian-twist', 'sbag-hold'],
  'method': ['sbag-complex', 'sbag-emom-shoulder', 'sbag-burpee', 'sbag-fill-progression'],
};

test('feat 461 — the family exists, is indexed, documented, animates and reaches the export', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'sandbag-work');
    const ref = exercises.find(e => e.id === 'sandbag-work');
    const bad = [];
    SANDBAG_ROWS.forEach((row, i) => {
      const h = (0x217 + i).toString(16).padStart(4, '0');
      const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
      const idx = VAR_INDEX.get(uuid);
      if (!idx || idx.variation.id !== row[0] || idx.family.id !== 'sandbag-work') { bad.push(row[0] + ' (index)'); return; }
      if (!motionForVariation(uuid)) bad.push(row[0] + ' (no motion)');
      const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
    });
    const ids = new Set(fam.variations.map(v => v.id));
    return { bad, rows: SANDBAG_ROWS.length, famCount: fam.variations.length, refCount: ref ? ref.variations.length : -1,
      dupIds: fam.variations.length !== ids.size, mega: fam.mega, bp: VAR_INDEX.get(fam.variations[0].uuid).bp,
      hasGeneral: !!(ref && ref.general && ref.general.setup.length && ref.general.mistakes.length),
      inExport: buildReferenceHtml().includes('<h3>Sandbag Work</h3>'),
      inMotionTable: !!FAMILY_MOTION['sandbag-work'] };
  });
  expect(r.bad).toEqual([]);
  expect(r.rows).toBe(43);
  expect(r.famCount).toBe(43);
  expect(r.refCount).toBe(43);
  expect(r.dupIds).toBe(false);
  expect(r.mega).toBe('full');
  expect(r.hasGeneral).toBe(true);
  expect(r.inExport).toBe(true);
  expect(r.inMotionTable, 'a family missing from FAMILY_MOTION fails the coverage test').toBe(true);
});

test('feat 461 — every axis of the tool is covered by a real trackable variation', async ({ page }) => {
  const missing = await page.evaluate((axes) => {
    const fam = FAMILIES.find(f => f.id === 'sandbag-work');
    const have = new Set((fam.variations || []).map(v => v.id));
    const out = {};
    Object.keys(axes).forEach(k => { const m = axes[k].filter(id => !have.has(id)); if (m.length) out[k] = m; });
    return out;
  }, AXES);
  expect(missing).toEqual({});
});

test('feat 461 — carries log distance, the hold logs time, everything else logs reps', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'sandbag-work');
    const byMode = {};
    fam.variations.forEach(v => { const m = exMode(v.uuid).mode; (byMode[m] = byMode[m] || []).push(v.id); });
    return { distance: (byMode.distance || []).sort(), time: (byMode.time || []).sort(),
      standardCount: (byMode.standard || []).length, bodyweight: byMode.bodyweight || [],
      loader: autoSetupKind(fam.variations.find(v => v.id === 'sbag-shoulder').uuid) };
  });
  expect(r.distance, 'all seven carries are distance-logged').toEqual(['sbag-bear-hug-carry', 'sbag-carry-medley',
    'sbag-front-rack-carry', 'sbag-overhead-carry', 'sbag-shoulder-carry', 'sbag-suitcase-carry', 'sbag-zercher-carry']);
  expect(r.time).toEqual(['sbag-hold']);
  expect(r.standardCount).toBe(35);
  expect(r.bodyweight, 'a loaded implement is never bodyweight-mode').toEqual([]);
  expect(r.loader, 'one implement, one weight → the single-weight picker').toBe('dumbbell');
});

test('feat 461 — the three pre-existing stubs are reconciled, still resolve, and their families still offer the movement', async ({ page }) => {
  const PAIRS = [
    ['b1a10220-0220-4220-8220-aaaaaaaa0220', 'e77ba59a-d7ac-48fc-86d2-a65d88fe1e29', 'loaded-carries'],
    ['b1a10220-0220-4220-8220-aaaaaaaa0220', 'cda32cab-71c0-4717-80c2-2103662c6964', 'strongman'],
    ['b1a1021a-021a-421a-821a-aaaaaaaa021a', '0858f5ae-90db-4fa1-b17b-9208086ec5b0', 'strongman'],
  ];
  const r = await page.evaluate((pairs) => pairs.map(([keep, drop, fam]) => {
    const ki = VAR_INDEX.get(keep), di = VAR_INDEX.get(drop);
    if (!ki || !di) return { keep, drop, err: 'unknown uuid' };
    return { keep, drop, fam,
      dropSuppressed: isSuppressedVar(drop),
      dropStillResolves: !!displayName(drop),                       // a set logged before feat 461 must still render
      keepVisible: varVisibleInPicker(ki.family, ki.variation),
      keepHome: ki.family.id,
      keepSatisfiesOldFamilyStep: optionMatchesVar({ type: 'movement', familyId: fam }, keep),
      oldFamilyStillOffers: secondaryVarsForFamily(fam).some(s => s.uuid === keep) };
  }), PAIRS);
  r.forEach(x => {
    expect(x.err, JSON.stringify(x)).toBeUndefined();
    expect(x.dropSuppressed, x.drop + ' should be suppressed').toBe(true);
    expect(x.dropStillResolves, x.drop + ' must still resolve for old sessions').toBe(true);
    expect(x.keepVisible).toBe(true);
    expect(x.keepHome).toBe('sandbag-work');
    expect(x.keepSatisfiesOldFamilyStep, x.keep + ' should satisfy a ' + x.fam + ' step').toBe(true);
    expect(x.oldFamilyStillOffers, x.fam + ' must still list the movement').toBe(true);
  });
});

test('feat 461 — sandbag movements satisfy their base-pattern steps and no suppressed var is cross-linked', async ({ page }) => {
  const CASES = [
    ['sbag-zercher-squat', 'squat'], ['sbag-deadlift', 'deadlift'], ['sbag-push-press', 'shoulder-press'],
    ['sbag-bent-row', 'row'], ['sbag-bear-hug-lunge', 'lunge'], ['sbag-shoulder', 'olympic-lifts'],
    ['sbag-overhead-carry', 'loaded-carries'], ['sbag-get-up', 'core-stability'], ['sbag-floor-press', 'flat-bench-press'],
    ['sbag-over-bar-throw', 'strongman'], ['sbag-complex', 'conditioning'], ['sbag-rotational-toss', 'medicine-ball'],
  ];
  const r = await page.evaluate((cases) => {
    const fam = FAMILIES.find(f => f.id === 'sandbag-work');
    const uuid = id => (fam.variations.find(v => v.id === id) || {}).uuid;
    // the whole table must stay clean: no dangling spec, no unknown base, no link to a suppressed var
    const byId = new Set(); FAMILIES.forEach(f => (f.variations || []).forEach(v => { if (v.uuid) byId.add(f.id + '/' + v.id); }));
    const famIds = new Set(FAMILIES.map(f => f.id));
    const dangling = [], badBase = [], suppressedLinked = [];
    Object.keys(SECONDARY_PARENTS_BY_ID).forEach(base => {
      if (!famIds.has(base)) badBase.push(base);
      (SECONDARY_PARENTS_BY_ID[base] || []).forEach(spec => {
        if (!byId.has(spec)) { dangling.push(spec); return; }
        const [f, i] = spec.split('/');
        const v = FAMILIES.find(x => x.id === f).variations.find(x => x.id === i);
        if (isSuppressedVar(v.uuid)) suppressedLinked.push(spec);
      });
    });
    return { dangling, badBase, suppressedLinked,
      cases: cases.map(([id, base]) => ({ id, base, ok: optionMatchesVar({ type: 'movement', familyId: base }, uuid(id)),
        home: VAR_INDEX.get(uuid(id)).family.id, visible: varVisibleInPicker(fam, fam.variations.find(v => v.id === id)) })),
      // the filling/progression entry is documentation, not a movement — it must NOT be cross-linked anywhere
      fillLinks: secondaryParentsOf(uuid('sbag-fill-progression')) };
  }, CASES);
  expect(r.dangling).toEqual([]);
  expect(r.badBase).toEqual([]);
  expect(r.suppressedLinked, 'a suppressed variation must never be cross-linked').toEqual([]);
  r.cases.forEach(c => {
    expect(c.ok, c.id + ' should satisfy a ' + c.base + ' step').toBe(true);
    expect(c.home, c.id + ' keeps its home in Sandbag Work').toBe('sandbag-work');
    expect(c.visible).toBe(true);
  });
  expect(r.fillLinks, 'the filling guide is not a movement').toEqual([]);
});

test('feat 461 — the content carries the safety and technique points the tool actually needs', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ref = exercises.find(e => e.id === 'sandbag-work');
    const txt = id => JSON.stringify((ref.variations || []).find(v => v.id === id)).toLowerCase();
    return {
      // a throw has a landing zone and people in it
      tossBehind: /behind you/.test(txt('sbag-over-shoulder-toss')) && /nobody in it/.test(txt('sbag-over-shoulder-toss')),
      throwLanding: /landing/.test(txt('sbag-over-bar-throw')),
      // the swing needs real handles
      swingHandles: /handle/.test(txt('sbag-swing')),
      // the floor press has a rolling load over your face
      floorPress: /face|throat/.test(txt('sbag-floor-press')),
      // asymmetry is the tool's signature injury risk
      alternate: /alternat|both shoulders|other shoulder|swap shoulders/.test(txt('sbag-shoulder'))
        && /swap shoulders|per side/.test(txt('sbag-shoulder-carry')),
      // the two-thirds fill rule appears in both the entry and the family's general block
      fillRule: /two thirds/.test(txt('sbag-fill-progression')) && /two thirds/.test(JSON.stringify(ref.general).toLowerCase()),
      zercherSleeves: /sleeve/.test(txt('sbag-zercher-carry')),
    };
  });
  Object.entries(r).forEach(([k, v]) => expect(v, k).toBe(true));
});
