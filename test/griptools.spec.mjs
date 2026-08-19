// feat 484 — the grip-tool haul: grip ring + finger trainer (into Grip Training), and the
// Burn Machine + hydraulic power twister (into Specialty Implements). Slots 0x27F-0x286.
// feat 485 — the rice bucket: crush, spread, twist, dig and the dugout circuit. Slots 0x287-0x28B.
// feat 486 — the Bruce Lee vocabulary: pin isometrics + weighted shadow boxing + kicking rounds. Slots 0x28C-0x291.
// feat 488 - the rest of the power twister (0x292-0x297) and the whole ab roller progression (0x298-0x29F).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const TOOLS = [
  // [family, base, [ids in slot order]]
  ['grip-training', 0x27F, ['grip-ring-squeeze', 'finger-trainer-press']],
  ['specialty-implements', 0x281, ['burn-machine-rotation', 'burn-machine-extended', 'burn-machine-overhead']],
  ['specialty-implements', 0x284, ['power-twister-bend', 'power-twister-reverse-bend', 'power-twister-overhead-bend']],
  ['grip-training', 0x287, ['rice-grab-crush', 'rice-finger-spread', 'rice-twist', 'rice-dig', 'rice-circuit']],
  // feat 486 - the Bruce Lee additions: pin isometrics homed by movement + the two striking staples
  ['shoulder-press', 0x28C, ['rack-press-isometric']],
  ['deadlift', 0x28D, ['rack-pull-isometric']],
  ['squat', 0x28E, ['rack-squat-isometric']],
  ['calf-raise', 0x28F, ['rack-calf-isometric']],
  ['boxing-bag', 0x290, ['boxing-weighted-shadow', 'boxing-kick-rounds']],
  // feat 488 - the twister positions the bar actually reaches, and the ab roller as a real progression
  ['specialty-implements', 0x292, ['power-twister-behind-neck', 'power-twister-behind-back', 'power-twister-single-arm',
    'power-twister-side-bend', 'power-twister-iso-hold', 'power-twister-wrist-bend']],
  ['core-stability', 0x298, ['ab-wheel-wall', 'ab-wheel-incline', 'ab-wheel-eccentric', 'ab-wheel-standing',
    'ab-wheel-oblique', 'ab-wheel-single-arm', 'ab-wheel-hold', 'ab-wheel-band']],
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof exercises !== 'undefined' && typeof filterVariations === 'function'
    && typeof normalizeState === 'function', null, { timeout: 15000 });
});

test('feat 484 — every grip-tool movement is trackable, indexed at its slot, and documented', async ({ page }) => {
  const bad = await page.evaluate((tools) => {
    const out = [];
    tools.forEach(([famId, base, ids]) => {
      const ref = exercises.find(e => e.id === famId);
      ids.forEach((id, i) => {
        const h = (base + i).toString(16).padStart(4, '0');
        const uuid = 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
        const idx = VAR_INDEX.get(uuid);
        if (!idx || idx.variation.id !== id || idx.family.id !== famId) { out.push(id + ' (index)'); return; }
        const rv = ref && (ref.variations || []).find(v => v.uuid === uuid);
        if (!rv || !(rv.setup || []).length || !(rv.movement || []).length
          || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) out.push(id + ' (thin ref)');
      });
    });
    return out;
  }, TOOLS);
  expect(bad).toEqual([]);
});

test('feat 484 — the new slots collide with nothing and the tools are searchable', async ({ page }) => {
  const r = await page.evaluate(() => {
    // every positional b1a1… uuid across all families must stay unique
    const uuids = new Map();
    FAMILIES.forEach(f => (f.variations || []).forEach(v => uuids.set(v.uuid, (uuids.get(v.uuid) || 0) + 1)));
    const dup = [...uuids].filter(([, n]) => n > 1).map(([u]) => u);
    // the picker searches titles; the REFERENCE search uses keywords, which live on `exercises`
    const kw = (id) => (exercises.find(e => e.id === id) || {}).keywords || '';
    return { dup,
      gripKw: /grip ring/.test(kw('grip-training')) && /finger trainer/.test(kw('grip-training'))
        && /rice bucket/.test(kw('grip-training')), // feat 485
      specKw: /burn machine/.test(kw('specialty-implements')) && /power twister/.test(kw('specialty-implements')) };
  });
  expect(r.dup).toEqual([]);
  expect(r.gripKw).toBe(true);
  expect(r.specKw).toBe(true);
});

test('feat 486 - the pin isometrics log as weight x seconds (time mode), the striking rounds stay standard', async ({ page }) => {
  const r = await page.evaluate(() => {
    const bySlot = (slot) => {
      const h = slot.toString(16).padStart(4, '0');
      return 'b1a1' + h + '-' + h + '-4' + h.slice(1) + '-8' + h.slice(1) + '-aaaaaaaa' + h;
    };
    return {
      isoModes: [0x28C, 0x28D, 0x28E, 0x28F].map(sl => exMode(bySlot(sl)).mode),
      strikeModes: [0x290, 0x291].map(sl => exMode(bySlot(sl)).mode),
      // feat 488 - the two static entries route to time mode by title; every bend/rollout stays reps
      staticModes: [0x296, 0x29E].map(sl => exMode(bySlot(sl)).mode),
      repModes: [0x292, 0x293, 0x294, 0x295, 0x297, 0x298, 0x299, 0x29A, 0x29B, 0x29C, 0x29D, 0x29F]
        .map(sl => exMode(bySlot(sl)).mode),
    };
  });
  expect(r.isoModes).toEqual(['time', 'time', 'time', 'time']);
  expect(r.strikeModes).toEqual(['standard', 'standard']);
  expect(r.staticModes).toEqual(['time', 'time']);
  expect(r.repModes.every(m => m === 'standard')).toBe(true);
});

test('feat 488 - the twister and ab roller vocabulary is reachable from the search bars', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState(); state.fuzzySearch = true;
    const titlesFor = (q) => { modalState.pickerSearch = q;
      return filterVariations().flatMap(g => g.variations.map(v => v.title)); };
    const twister = titlesFor('twister');
    const roller = titlesFor('ab roller');          // "roller" lives only in the family KEYWORDS
    const rollout = titlesFor('rollout');
    modalState.pickerSearch = '';
    return { twisterCount: twister.length, rollerHit: roller.length > 0,
      standing: rollout.some(t => /standing ab wheel/i.test(t)) };
  });
  expect(r.twisterCount).toBeGreaterThanOrEqual(9);   // 3 from feat 484 + 6 from feat 488
  expect(r.rollerHit).toBe(true);
  expect(r.standing).toBe(true);
});
