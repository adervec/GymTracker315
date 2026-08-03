// feat 462 — the standing duplication guard. Two classes the earlier passes could not see:
//   (a) a SUBVARIATION OPTION naming the same exercise as a standalone variation ("Cable behind body" under
//       Cable Lateral Raise, and Behind-the-Back Cable Lateral as its own entry) — two ways to log one thing,
//       which splits the history;
//   (b) a near-duplicate pair that differs only by a SYNONYM, which feat 453's exact-token sweep missed.
// The sweep runs here as a test, not as a one-off script, so new catalogue content cannot quietly reintroduce
// either class. When a hit is a genuine pair of different movements, add it to ALLOW with the reason.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

// Synonym folding — words that mean the same thing in an exercise title. Deliberately does NOT fold words
// that FLIP the meaning: 'side', 'front', 'behind', 'single' and 'body' all distinguish real movements.
const SYN = {
  dumbbell: 'db', dumbbells: 'db', dbs: 'db', barbell: 'bb', kettlebell: 'kb', kettlebells: 'kb',
  rear: 'behind', back: 'behind', backwards: 'behind',
  raises: 'raise', laterals: 'lateral', lat: 'lateral', presses: 'press', pressing: 'press',
  curls: 'curl', rows: 'row', squats: 'squat', extension: 'ext', extensions: 'ext',
  pulldowns: 'pulldown', pushdowns: 'pushdown', unilateral: 'single', one: 'single',
  sitting: 'seated', stood: 'standing', cables: 'cable', banded: 'band', bands: 'band',
  narrow: 'close', overhand: 'pronated', underhand: 'supinated',
  holds: 'hold', isometric: 'hold', iso: 'hold', carries: 'carry', walk: 'carry', walks: 'carry',
};
const NOISE = ['the', 'a', 'an', 'with', 'and', 'to', 'on', 'in', 'of', 'for', 'or', 'at', 'from', 'variation', 'standard'];

// Pairs a human has confirmed are DIFFERENT movements. Empty is the goal; each entry needs a reason.
const ALLOW = [];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof subOptDeprecated === 'function' && typeof isSuppressedVar === 'function', null, { timeout: 15000 });
});

const sweep = (page, cfg) => page.evaluate(({ SYN, NOISE }) => {
  const noise = new Set(NOISE);
  const toks = s => String(s || '').toLowerCase().replace(/[‐-―]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').map(t => (SYN[t] !== undefined ? SYN[t] : t)).filter(t => t && !noise.has(t));
  const set = s => new Set(toks(s));
  const jac = (a, b) => { let i = 0; a.forEach(x => { if (b.has(x)) i++; }); const u = a.size + b.size - i; return u ? i / u : 0; };
  const minus = (a, b) => { const o = new Set(); a.forEach(x => { if (!b.has(x)) o.add(x); }); return o; };
  const subsetOf = (a, b) => { let ok = true; a.forEach(x => { if (!b.has(x)) ok = false; }); return ok; };

  const vars = [], subs = [];
  FAMILIES.forEach(f => (f.variations || []).forEach(v => {
    vars.push({ fam: f.id, id: v.id, uuid: v.uuid, title: v.title, t: set(v.title), sup: isSuppressedVar(v.uuid) });
    if (v.subvariation && Array.isArray(v.subvariation.options)) v.subvariation.options.forEach(o =>
      subs.push({ fam: f.id, parent: v.id, parentUuid: v.uuid, label: o.label, uuid: o.uuid,
        pt: set(v.title), ot: set(o.label), dep: subOptDeprecated(o.uuid) }));
  }));

  // (a) live sub-option vs live standalone variation
  const optVsVar = [];
  subs.forEach(s => {
    if (s.dep) return;                                   // already retired
    const dist = minus(s.ot, s.pt);
    if (!dist.size) return;                              // adds nothing to the parent name (e.g. "Standard")
    vars.forEach(v => {
      if (v.uuid === s.parentUuid || v.sup) return;
      if (subsetOf(dist, v.t) && jac(s.pt, v.t) >= 0.4)
        optVsVar.push(s.fam + '/' + s.parent + ' [' + s.label + ']  ==  ' + v.fam + '/' + v.id + ' :: ' + v.title);
    });
  });

  // (b) two live variations whose folded token sets are identical
  const varVsVar = [];
  for (let i = 0; i < vars.length; i++) for (let j = i + 1; j < vars.length; j++) {
    const a = vars[i], b = vars[j];
    if (a.sup || b.sup) continue;
    if (jac(a.t, b.t) === 1) varVsVar.push(a.fam + '/' + a.id + ' :: ' + a.title + '  ==  ' + b.fam + '/' + b.id + ' :: ' + b.title);
  }
  return { optVsVar, varVsVar, counts: { vars: vars.length, subs: subs.length } };
}, cfg);

test('feat 462 — no live sub-option duplicates a live standalone variation', async ({ page }) => {
  const r = await sweep(page, { SYN, NOISE });
  expect(r.counts.subs).toBeGreaterThan(100);            // the sweep actually had data to chew on
  expect(r.optVsVar.filter(x => !ALLOW.includes(x))).toEqual([]);
});

test('feat 462 — no two live variations reduce to the same name once synonyms are folded', async ({ page }) => {
  const r = await sweep(page, { SYN, NOISE });
  expect(r.counts.vars).toBeGreaterThan(1400);
  expect(r.varVsVar.filter(x => !ALLOW.includes(x))).toEqual([]);
});

test('feat 462 — a retired option is never offered or defaulted, but still resolves', async ({ page }) => {
  const r = await page.evaluate(() => Object.keys(SUBOPT_DEPRECATED).map(u => {
    let host = null;
    FAMILIES.forEach(f => (f.variations || []).forEach(v => {
      if (v.subvariation && v.subvariation.options.some(o => o.uuid === u)) host = { fam: f.id, v };
    }));
    if (!host) return { u, err: 'the retired option no longer exists — drop it from SUBOPT_DEPRECATED' };
    const sup = VAR_INDEX.get(SUBOPT_DEPRECATED[u]);
    return { u, host: host.fam + '/' + host.v.id,
      offered: subOptions(host.v).some(o => o.uuid === u),
      isDefault: defaultSubUuid(host.v) === u,
      resolvesDistinctly: displayName(host.v.uuid, u) !== displayName(host.v.uuid),
      supersededBy: sup ? sup.family.id + '/' + sup.variation.id : null,
      supersederLive: !!(sup && !isSuppressedVar(SUBOPT_DEPRECATED[u])),
      liveLeft: subOptions(host.v).length };
  }));
  expect(r.length).toBe(6);
  r.forEach(x => {
    expect(x.err, x.u).toBeUndefined();
    expect(x.offered, x.host + ' must not offer the retired option').toBe(false);
    expect(x.isDefault, x.host + ' must not default to it').toBe(false);
    expect(x.resolvesDistinctly, x.u + ' must still name an old logged set').toBe(true);
    expect(x.supersededBy, x.u + ' must point at a real replacement').toBeTruthy();
    expect(x.supersederLive, x.u + ' replacement must itself be live').toBe(true);
    expect(x.liveLeft, x.host + ' must keep at least one selectable option').toBeGreaterThan(0);
  });
});

test('feat 462 — the reconciler now dedupes SAME-family pairs too', async ({ page }) => {
  // Anderson Squat existed three times: twice inside `squat`, once in `pin-lifts`. The cross-family copy was
  // handled by feat 453; the same-family copy was not, because the reconciler returned early on same-family.
  const r = await page.evaluate(() => {
    const PAIRS = [
      ['3ecccb1c-0d4d-4f7e-b808-110f482828eb', 'c1f24a3a-453d-4f0f-9448-319bbe760b8a'], // Push-Up
      ['6dcaf529-0013-4c69-8577-7252ada115ff', '6d3eae66-c4c1-4b64-85eb-378820871697'], // Anderson / Pin Squat — SAME family
      ['8e953301-4e8f-4cca-ae07-fe3243fe21b9', '3d5beff7-1c18-44ab-8356-259f42ae833d'], // Farmer's Walk
      ['96b4bbd9-54a4-42e4-ae38-9e67bd473430', '2a9ec5f1-f184-45aa-ac43-28f6e5eabf4f'], // Monster Walk
    ];
    return PAIRS.map(([keep, drop]) => {
      const ki = VAR_INDEX.get(keep), di = VAR_INDEX.get(drop);
      if (!ki || !di) return { keep, drop, err: 'unknown uuid' };
      return { keep, drop, sameFamily: ki.family.id === di.family.id,
        dropSuppressed: isSuppressedVar(drop),
        dropStillResolves: !!displayName(drop),
        keepVisible: varVisibleInPicker(ki.family, ki.variation),
        oldFamilyStillOffers: ki.family.id === di.family.id
          || optionMatchesVar({ type: 'movement', familyId: di.family.id }, keep) };
    });
  });
  expect(r.some(x => x.sameFamily), 'a same-family pair is under test').toBe(true);
  r.forEach(x => {
    expect(x.err, JSON.stringify(x)).toBeUndefined();
    expect(x.dropSuppressed, x.drop + ' should be suppressed').toBe(true);
    expect(x.dropStillResolves, x.drop + ' must still resolve for old sessions').toBe(true);
    expect(x.keepVisible).toBe(true);
    expect(x.oldFamilyStillOffers, 'the dropped copy\'s family must still offer the movement').toBe(true);
  });
});

test('feat 462 — no cross-link anywhere points at a suppressed variation', async ({ page }) => {
  const r = await page.evaluate(() => {
    const byId = new Set(); FAMILIES.forEach(f => (f.variations || []).forEach(v => { if (v.uuid) byId.add(f.id + '/' + v.id); }));
    const famIds = new Set(FAMILIES.map(f => f.id));
    const dangling = [], badBase = [], suppressedLinked = [];
    Object.keys(SECONDARY_PARENTS_BY_ID).forEach(base => {
      if (!famIds.has(base)) badBase.push(base);
      (SECONDARY_PARENTS_BY_ID[base] || []).forEach(spec => {
        if (!byId.has(spec)) { dangling.push(spec); return; }
        const [f, i] = spec.split('/');
        const v = FAMILIES.find(x => x.id === f).variations.find(x => x.id === i);
        if (isSuppressedVar(v.uuid)) suppressedLinked.push(spec + ' → ' + base);
      });
    });
    // and every suppressed variation still resolves, so no logged set is ever orphaned
    const orphaned = [];
    FAMILIES.forEach(f => (f.variations || []).forEach(v => {
      if (isSuppressedVar(v.uuid) && !displayName(v.uuid)) orphaned.push(f.id + '/' + v.id);
    }));
    return { dangling, badBase, suppressedLinked, orphaned };
  });
  expect(r.dangling).toEqual([]);
  expect(r.badBase).toEqual([]);
  expect(r.suppressedLinked).toEqual([]);
  expect(r.orphaned, 'a suppressed variation must still name an old logged set').toEqual([]);
});
