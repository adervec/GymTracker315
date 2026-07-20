// feat 449 — the mobilization system from Becoming a Supple Leopard. The catalogue already covered
// the book's Category 1/2/3 MOVEMENTS (bar the snatch balance, added here) but had nothing of its
// MOBILIZATION system. 110 named drills grouped by the book's 14 target areas, plus the principles,
// the seven methods and the seven archetypes in the family's general block.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

// The book's Category 1/2/3 movements → the variation that covers each.
const CATEGORY_MOVEMENTS = [
  // Category 1
  ['Air Squat', 'bw-squat'], ['Box Squat', 'box-squat'], ['Back Squat', 'bb-back-squat'],
  ['Front Squat', 'front-squat'], ['Overhead Squat', 'overhead-squat'], ['Deadlift', 'conventional-dl'],
  ['Pushup', 'push-up'], ['Bench Press', 'bb-flat-bench'], ['Dip', 'bodyweight-dip'],
  ['Strict Press', 'bb-ohp'], ['Handstand Pushup', 'handstand-push-up'], ['Pull-up', 'pull-up-pronated'],
  // Category 2
  ['Wall Ball', 'wallball'], ['Push-Press', 'push-press'], ['Box Jump (jumping and landing)', 'box-jump'],
  ['Kettlebell Swing', 'kb-swing-detailed'], ['One-Arm Swing', 'kb-one-arm-swing'],
  ['Rowing', 'row-steady'], ['Kipping Pull-up', 'kipping-pull-up'], ['Snatch Balance', 'snatch-balance'],
  // Category 3
  ['Burpee', 'burpee'], ['Turkish Getup', 'turkish-get-up'], ['Clean', 'power-clean'],
  ['Jerk', 'push-jerk'], ['Snatch', 'power-snatch'], ['Muscle-up', 'muscle-up'],
];

// One representative named drill per target area — the areas themselves are asserted by count below.
const AREA_SPOTCHECK = [
  ['Area 2 · Upper Back', 'ms-first-rib'],
  ['Area 3 · Posterior Shoulder & Lat', 'ms-banded-overhead-distraction'],
  ['Area 4 · Anterior Shoulder & Chest', 'ms-banded-bully'],
  ['Area 5 · Arm', 'ms-voodoo-elbow'],
  ['Area 6 · Trunk', 'ms-psoas-smash'],
  ['Area 7 · Glutes & Hip Capsule', 'ms-hip-capsule-ir'],
  ['Area 8 · Hip Flexors & Quads', 'ms-couch-mobilization'],
  ['Area 9 · Adductors', 'ms-super-frog'],
  ['Area 10 · Hamstrings', 'ms-super-plates'],
  ['Area 11 · Knee', 'ms-gap-and-smash'],
  ['Area 12 · Shin', 'ms-medial-shin-floss'],
  ['Area 13 · Calf', 'ms-banded-heel-cord-anterior'],
  ['Area 14 · Ankle, Foot & Toes', 'ms-ball-whack'],
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('feat 449 — every Category 1/2/3 movement in the book is trackable', async ({ page }) => {
  const missing = await page.evaluate((rows) => {
    const have = new Set();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => have.add(v.id)));
    return rows.filter(([, id]) => !have.has(id)).map(([label, id]) => label + ' → ' + id);
  }, CATEGORY_MOVEMENTS);
  expect(missing).toEqual([]);
  expect(CATEGORY_MOVEMENTS.length).toBe(26);
});

test('feat 449 — the mobilization drills cover all 13 itemised target areas', async ({ page }) => {
  const r = await page.evaluate((spot) => {
    const fam = FAMILIES.find(f => f.id === 'mobility-system');
    const byId = new Set((fam ? fam.variations : []).map(v => v.id));
    const areas = {};
    (fam ? fam.variations : []).forEach(v => { const a = (v.best || '').split(' · ')[0]; areas[a] = (areas[a] || 0) + 1; });
    return { missing: spot.filter(([, id]) => !byId.has(id)).map(([a, id]) => a + ' → ' + id),
      areaCount: Object.keys(areas).length, areas, total: fam ? fam.variations.length : -1 };
  }, AREA_SPOTCHECK);
  expect(r.missing).toEqual([]);
  // Area 1 (Jaw, Head & Neck) is new in the 2nd edition and no source itemises its drill names, so it
  // is deliberately absent rather than invented — areas 2 through 14 are all represented.
  expect(r.areaCount).toBe(13);
  expect(r.total).toBe(110);
  Object.values(r.areas).forEach(n => expect(n).toBeGreaterThan(3));
});

test('feat 449 — the family is indexed, animates, and is fully documented', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => f.id === 'mobility-system');
    const ref = exercises.find(e => e.id === 'mobility-system');
    const bad = [], noMotion = [];
    MOBSYS_ROWS.forEach((row, i) => {
      const h = (0x17B + i).toString(16).padStart(4, '0');
      const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
      const idx = VAR_INDEX.get(uuid);
      const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
      if (!idx || idx.variation.id !== row[0] || idx.family.id !== 'mobility-system') { bad.push(row[0] + ' (index)'); return; }
      if (!motionForVariation(uuid)) noMotion.push(row[0]);
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
        || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) bad.push(row[0] + ' (thin ref)');
    });
    const g = ref ? ref.general : null;
    const txt = g ? (g.setup.join(' ') + ' ' + g.movement.join(' ') + ' ' + g.mistakes.join(' ')) : '';
    return { bad, noMotion, rows: MOBSYS_ROWS.length,
      famCount: fam ? fam.variations.length : -1, refCount: ref ? ref.variations.length : -1,
      mega: fam && fam.mega,
      // the principles, the seven methods and the seven archetypes all live in the general block
      principles: ['BRACING SEQUENCE', 'ONE-JOINT RULE', 'LAWS OF TORQUE', 'ARCHETYPES', 'TUNNEL'].filter(k => !txt.includes(k)),
      methods: ['PRESSURE WAVE', 'CONTRACT AND RELAX', 'SMASH AND FLOSS', 'BANDED FLOSSING',
        'PAPER-CLIPPING', 'VOODOO FLOSSING', 'FLEXION GAPPING', 'UPSTREAM-DOWNSTREAM'].filter(k => !txt.includes(k)),
      retest: /retest/i.test((ref && ref.quickCue) || ''),
      inExport: buildReferenceHtml().includes('<h3>Mobility System (Supple Leopard)</h3>') };
  });
  expect(r.rows).toBe(110);
  expect(r.bad).toEqual([]);
  expect(r.noMotion).toEqual([]);
  expect(r.famCount).toBe(110);
  expect(r.refCount).toBe(110);
  expect(r.mega).toBe('mobility');
  expect(r.principles).toEqual([]);
  expect(r.methods).toEqual([]);
  expect(r.retest).toBe(true);
  expect(r.inExport).toBe(true);
});

test('feat 449 — the compact-row uuid ranges still never overlap', async ({ page }) => {
  const r = await page.evaluate(() => {
    const seen = new Map(), clash = [];
    [['mace', MACE_CLUB_ROWS, 0x30], ['kb', KB_ROWS, 0x89], ['ybell', YBELL_ROWS, 0xC0],
     ['trx', TRX_ROWS, 0xF8], ['swissball', SWISSBALL_ROWS, 0x12E], ['mobsys', MOBSYS_ROWS, 0x17B]]
      .forEach(([name, rows, base]) => rows.forEach((_, i) => {
        const slot = base + i;
        if (seen.has(slot)) clash.push(name + ' overlaps ' + seen.get(slot) + ' at 0x' + slot.toString(16));
        seen.set(slot, name);
      }));
    const uuids = new Map();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => uuids.set(v.uuid, (uuids.get(v.uuid) || 0) + 1)));
    return { clash, dupUuids: [...uuids].filter(([, n]) => n > 1).map(([u]) => u), slots: seen.size };
  });
  expect(r.clash).toEqual([]);
  expect(r.dupUuids).toEqual([]);
  expect(r.slots).toBe(89 + 55 + 56 + 54 + 77 + 110);
});
