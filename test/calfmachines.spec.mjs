// feat 342 — "machine for a different exercise" audit: the calf-raise family had Leg Press calf raises but was
// missing the equally-common Hack Squat and Smith Machine calf raises (squat machines repurposed for calves,
// the same spirit as the existing Calf-Machine Shrug). They're added here.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof FAMILIES !== 'undefined' && typeof VAR_INDEX !== 'undefined'
    && typeof varVisibleInPicker === 'function', null, { timeout: 15000 });
});

test('Hack Squat + Smith Machine calf raises exist in the calf family, resolve, and are pickable', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fam = FAMILIES.find(f => (f.variations || []).some(v => v.id === 'donkey-calf')); // the calf-raise family
    const byId = (id) => (fam.variations || []).find(v => v.id === id);
    const hack = byId('hack-squat-calf'), smith = byId('smith-calf'), legPress = byId('leg-press-calf');
    const allUuids = []; FAMILIES.forEach(f => (f.variations || []).forEach(v => { if (v.uuid) allUuids.push(v.uuid); }));
    const dupes = allUuids.length - new Set(allUuids).size;
    return {
      hasHack: !!hack, hasSmith: !!smith, legPressStillThere: !!legPress,
      hackTitle: hack && hack.title, smithTitle: smith && smith.title,
      hackIndexed: !!(hack && VAR_INDEX.has(hack.uuid)), smithIndexed: !!(smith && VAR_INDEX.has(smith.uuid)),
      hackPickable: !!(hack && varVisibleInPicker(fam, hack)), smithPickable: !!(smith && varVisibleInPicker(fam, smith)),
      dupes,
    };
  });
  expect(r.hasHack).toBe(true);
  expect(r.hasSmith).toBe(true);
  expect(r.legPressStillThere).toBe(true);            // the existing cross-use sibling is untouched
  expect(r.hackTitle).toBe('Hack Squat Calf Raise');
  expect(r.smithTitle).toBe('Smith Machine Calf Raise');
  expect(r.hackIndexed).toBe(true);                   // resolvable via VAR_INDEX (real, unique uuid)
  expect(r.smithIndexed).toBe(true);
  expect(r.hackPickable).toBe(true);                  // shows up in the exercise picker
  expect(r.smithPickable).toBe(true);
  expect(r.dupes).toBe(0);                            // no duplicate uuids introduced
});
