// feat 453 — (a) the wrist roller's full vocabulary: roll DIRECTION picks the muscle, ARM POSITION picks the
// limiting factor, LOADING style picks the resistance curve; and (b) the cross-linking refresh — 13 genuine
// same-exercise-twice pairs reconciled, plus the additive implement-variant → base-pattern table.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof WRIST_ROLLER_ROWS !== 'undefined' && typeof SECONDARY_PARENTS_BY_ID !== 'undefined'
    && typeof secondaryParentsOf === 'function' && typeof optionMatchesVar === 'function', null, { timeout: 15000 });
});

// The tool's real axes of variation — each must be a trackable variation, not just prose.
const ROLLER = [
  ['direction · extensors', 'wr-forward-roll'], ['direction · flexors', 'wr-reverse-roll'],
  ['direction · supinated', 'wr-underhand-roll'], ['direction · both', 'wr-two-way'],
  ['position · arms out', 'wr-arms-extended'], ['position · elbows bent', 'wr-elbows-bent'],
  ['position · rack', 'wr-rack-supported'], ['position · seated', 'wr-seated-thighs'],
  ['position · preacher', 'wr-preacher-supported'], ['position · overhead', 'wr-overhead'],
  ['tool · clamp-on bar', 'wr-barbell-mounted'], ['tool · one arm', 'wr-one-arm'],
  ['tool · fat grip', 'wr-fat-grip'], ['load · band', 'wr-band-resisted'], ['load · cable', 'wr-cable'],
  ['method · eccentric', 'wr-eccentric-unroll'], ['method · ladder', 'wr-ladder'], ['method · isometric', 'wr-iso-hold'],
];

test('feat 453 — every wrist-roller variation is trackable, indexed, documented and animates', async ({ page }) => {
  const r = await page.evaluate((rows) => {
    const fam = FAMILIES.find(f => f.id === 'grip-training');
    const ref = exercises.find(e => e.id === 'grip-training');
    const have = new Set((fam ? fam.variations : []).map(v => v.id));
    const missing = rows.filter(([, id]) => !have.has(id)).map(([label, id]) => label + ' -> ' + id);
    const bad = [], noMotion = [];
    WRIST_ROLLER_ROWS.forEach((row, i) => {
      const h = (0x1E9 + i).toString(16).padStart(4, '0');
      const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
      const idx = VAR_INDEX.get(uuid);
      if (!idx || idx.variation.id !== row[0] || idx.family.id !== 'grip-training') { bad.push(row[0] + ' (index)'); return; }
      if (!motionForVariation(uuid)) noMotion.push(row[0]);
      const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
    });
    return { missing, bad, noMotion, rows: WRIST_ROLLER_ROWS.length,
      inExport: buildReferenceHtml().includes('Barbell-Mounted Wrist Roller') };
  }, ROLLER);
  expect(r.missing).toEqual([]);
  expect(r.bad).toEqual([]);
  expect(r.noMotion).toEqual([]);
  expect(r.rows).toBe(18);
  expect(r.inExport).toBe(true);
});

test('feat 453 — the roller set is cross-listed into Forearm Work and satisfies a forearm plan step', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'grip-training');
    const v = (fam.variations || []).find(x => x.id === 'wr-barbell-mounted');
    return {
      secondaries: secondaryParentsOf(v.uuid),
      matchesForearmStep: optionMatchesVar({ type: 'movement', familyId: 'wrist-curl' }, v.uuid),
      matchesHome: optionMatchesVar({ type: 'movement', familyId: 'grip-training' }, v.uuid),
      matchesUnrelated: optionMatchesVar({ type: 'movement', familyId: 'squat' }, v.uuid),
      inForearmSecondary: secondaryVarsForFamily('wrist-curl').some(s => s.uuid === v.uuid),
    };
  });
  expect(r.secondaries).toContain('wrist-curl');
  expect(r.matchesForearmStep).toBe(true);
  expect(r.matchesHome).toBe(true);
  expect(r.matchesUnrelated).toBe(false);
  expect(r.inForearmSecondary).toBe(true);
});

test('feat 453 — every cross-link spec resolves (no dangling family/id after a rename)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const byId = new Set();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => { if (v.uuid) byId.add(f.id + '/' + v.id); }));
    const famIds = new Set(FAMILIES.map(f => f.id));
    const dangling = [], badBase = [], notApplied = [];
    Object.keys(SECONDARY_PARENTS_BY_ID).forEach(base => {
      if (!famIds.has(base)) badBase.push(base);
      (SECONDARY_PARENTS_BY_ID[base] || []).forEach(spec => {
        if (!byId.has(spec)) { dangling.push(spec); return; }
        const [fid, vid] = spec.split('/');
        const v = FAMILIES.find(f => f.id === fid).variations.find(x => x.id === vid);
        // a suppressed variation must never be cross-linked — its canonical twin carries the link instead
        if (isSuppressedVar(v.uuid)) { notApplied.push(spec + ' (suppressed)'); return; }
        if (!secondaryParentsOf(v.uuid).includes(base)) notApplied.push(spec + ' -> ' + base);
      });
    });
    const total = Object.values(SECONDARY_PARENTS_BY_ID).reduce((n, a) => n + a.length, 0);
    return { dangling, badBase, notApplied, total };
  });
  expect(r.dangling).toEqual([]);
  expect(r.badBase).toEqual([]);
  expect(r.notApplied).toEqual([]);
  expect(r.total).toBeGreaterThan(200);
});

test('feat 453 — implement variants satisfy their base-pattern plan step (and stay separate exercises)', async ({ page }) => {
  const CASES = [
    ['ybell-work', 'yb-front-squat', 'squat'], ['trx-work', 'trx-row', 'row'],
    ['mace-club-work', 'mace-deadlift', 'deadlift'], ['swiss-ball-work', 'sb-crunch', 'abs-dynamic'],
    ['kettlebell-specific', 'kb-hang-clean', 'olympic-lifts'], ['trx-work', 'trx-hamstring-curl', 'leg-curl'],
    ['trx-work', 'trx-y-fly', 'rear-delt'], ['resistance-bands', 'monster-walk', 'glute-accessories'],
  ];
  const r = await page.evaluate((cases) => cases.map(([fam, id, base]) => {
    const f = FAMILIES.find(x => x.id === fam);
    const v = f && (f.variations || []).find(x => x.id === id);
    if (!v) return { spec: fam + '/' + id, err: 'missing' };
    return { spec: fam + '/' + id, base,
      matchesBase: optionMatchesVar({ type: 'movement', familyId: base }, v.uuid),
      stillOwnFamily: VAR_INDEX.get(v.uuid).family.id === fam,   // additive — NOT moved or suppressed
      visible: varVisibleInPicker(f, v) };
  }), CASES);
  r.forEach(x => {
    expect(x.err).toBeUndefined();
    expect(x.matchesBase, x.spec + ' should satisfy ' + x.base).toBe(true);
    expect(x.stillOwnFamily, x.spec + ' must keep its own home family').toBe(true);
    expect(x.visible, x.spec + ' must stay visible in its own family').toBe(true);
  });
});

test('feat 453 — the 13 newly-reconciled duplicates are deduped, cross-linked and still resolve', async ({ page }) => {
  const PAIRS = [
    ['5b2757be-b859-492f-878d-cc35aa8eacd9', '6ba94f15-29cc-4af1-8438-35356ab6461f'],
    ['99237c93-0cf2-47df-ae3c-07de47c86200', 'd7a114b1-b53b-42ce-a952-17fa3a1f58d7'],
    ['912ea65b-20c8-42bd-b5de-4bee361850ed', 'd57623e7-a5fc-4add-8b3f-1f3e252a01c5'],
    ['f7468395-0a3a-4f39-bea7-31ac1db82d55', '844e7c89-8aee-4f03-aa25-bdac127e44e3'],
    ['44325a71-f896-4b18-85cd-7c414baefa53', 'c0ac0201-0201-4201-8201-000000000201'],
    ['cedc105f-f9d8-4156-bddb-f488d211d075', 'c0ac0202-0202-4202-8202-000000000202'],
    ['6670248c-1acd-4f25-ac32-a206ed6f3f84', '1605223c-6f19-4b11-9a0f-3bfc95aeb490'],
    ['00b52861-e962-4cc3-bf3d-5222eee4d747', '1c69b0e7-8e27-439e-adbb-8ecfbe291158'],
    ['80027c79-9de2-4c47-a21d-057028e66742', '10ee2f37-24ea-4d6e-a313-f8ce96848e59'],
    ['32592786-2fd3-4ec7-baf0-8744caca298a', '73c314b8-1ed7-407d-9c92-bc5b2ec197e1'],
    ['79efb6df-d4f3-4f1d-8a0c-e1cb47d07969', '1082bd29-d725-4990-9ff2-f15acdff2926'],
    ['bf590252-e0f3-4487-b065-94002eba49cb', '5aeb5245-ef9e-4afc-95ae-84621d22ba2e'],
    ['8e953301-4e8f-4cca-ae07-fe3243fe21b9', '06179166-f0d8-45b6-89cf-f8d54aa1b19c'],
  ];
  const r = await page.evaluate((pairs) => pairs.map(([keep, drop]) => {
    const ki = VAR_INDEX.get(keep), di = VAR_INDEX.get(drop);
    if (!ki || !di) return { keep, drop, err: 'unknown uuid' };
    return { keep, drop, keepFam: ki.family.id, dropFam: di.family.id,
      dropSuppressed: isSuppressedVar(drop),
      keepVisible: varVisibleInPicker(ki.family, ki.variation),
      keepCrossLinked: secondaryParentsOf(keep).includes(di.family.id),
      dropStillResolves: !!displayName(drop),                      // old logged sets must still render
      keepSatisfiesDropStep: optionMatchesVar({ type: 'movement', familyId: di.family.id }, keep) };
  }), PAIRS);
  r.forEach(x => {
    expect(x.err, JSON.stringify(x)).toBeUndefined();
    expect(x.dropSuppressed, x.drop + ' should be suppressed').toBe(true);
    expect(x.keepVisible, x.keep + ' should stay visible').toBe(true);
    expect(x.keepCrossLinked, x.keep + ' should cross-link into ' + x.dropFam).toBe(true);
    expect(x.dropStillResolves, x.drop + ' must still resolve for old sessions').toBe(true);
    expect(x.keepSatisfiesDropStep).toBe(true);
  });
});
