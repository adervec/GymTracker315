// feat 343 — comprehensive resistance-band coverage. Existing band exercises were concentrated in two dedicated
// "Resistance Band Work" catch-all families; this adds a band option directly into each major MOVEMENT family that
// lacked one (Band Squat under Squat, Band Biceps Curl under Bicep Curl, …) so they're discoverable per movement.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

// [familyId, variationId, title] for each added band variation.
const NEW = [
  ['bicep-curl', 'band-biceps-curl', 'Band Biceps Curl'],
  ['hammer-curl', 'band-hammer-curl', 'Band Hammer Curl'],
  ['reverse-curl', 'band-reverse-curl', 'Band Reverse Curl'],
  ['lateral-raise', 'band-lateral-raise', 'Band Lateral Raise'],
  ['front-raise', 'band-front-raise', 'Band Front Raise'],
  ['shoulder-press', 'band-overhead-press', 'Band Overhead Press'],
  ['lat-pulldown', 'band-lat-pulldown', 'Band Lat Pulldown'],
  ['shrugs', 'band-shrug', 'Band Shrug'],
  ['squat', 'band-squat', 'Band Squat'],
  ['deadlift', 'band-rdl', 'Band Romanian Deadlift'],
  ['leg-extension', 'band-leg-extension', 'Banded Leg Extension'],
  ['calf-raise', 'band-calf-raise', 'Band Calf Raise'],
  ['chest-fly', 'band-chest-fly', 'Band Chest Fly'],
  ['tricep-extension', 'band-oh-tricep-ext', 'Band Overhead Tricep Extension'],
  ['push-ups', 'band-resisted-pushup', 'Band-Resisted Push-Up'],
  ['dips', 'band-assisted-dip', 'Band-Assisted Dip'],
  ['obliques', 'band-woodchopper', 'Band Woodchopper'],
  ['abs-dynamic', 'band-kneeling-crunch', 'Banded Kneeling Crunch'],
  ['lunge', 'band-lunge', 'Banded Lunge'],
  ['glute-accessories', 'band-standing-kickback', 'Banded Standing Kickback'],
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof FAMILIES !== 'undefined' && typeof VAR_INDEX !== 'undefined'
    && typeof varVisibleInPicker === 'function', null, { timeout: 15000 });
});

test('each added band variation sits in the right movement family with correct title', async ({ page }) => {
  const bad = await page.evaluate((NEW) => {
    return NEW.filter(([fam, id, title]) => {
      const f = FAMILIES.find(x => x.id === fam);
      const v = f && (f.variations || []).find(x => x.id === id);
      return !v || v.title !== title;
    }).map(x => x[1]);
  }, NEW);
  expect(bad).toEqual([]);
});

test('every added band variation resolves in VAR_INDEX and is pickable', async ({ page }) => {
  const r = await page.evaluate((NEW) => {
    const notIndexed = [], notPickable = [];
    NEW.forEach(([fam, id]) => {
      const f = FAMILIES.find(x => x.id === fam);
      const v = f && (f.variations || []).find(x => x.id === id);
      if (!v || !VAR_INDEX.has(v.uuid)) notIndexed.push(id);
      else if (!varVisibleInPicker(f, v)) notPickable.push(id);
    });
    return { notIndexed, notPickable };
  }, NEW);
  expect(r.notIndexed).toEqual([]);
  expect(r.notPickable).toEqual([]);
});

test('no duplicate uuids anywhere after the additions', async ({ page }) => {
  const dupes = await page.evaluate(() => {
    const all = []; FAMILIES.forEach(f => (f.variations || []).forEach(v => { if (v.uuid) all.push(v.uuid); }));
    return all.length - new Set(all).size;
  });
  expect(dupes).toBe(0);
});

test('a representative new band variation is fully formed (cue + best)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const f = FAMILIES.find(x => x.id === 'squat');
    const v = (f.variations || []).find(x => x.id === 'band-squat');
    return { title: v && v.title, hasCue: !!(v && v.cue), hasBest: !!(v && v.best), resolves: !!(v && VAR_INDEX.get(v.uuid)) };
  });
  expect(r.title).toBe('Band Squat');
  expect(r.hasCue).toBe(true);
  expect(r.hasBest).toBe(true);
  expect(r.resolves).toBe(true);
});
