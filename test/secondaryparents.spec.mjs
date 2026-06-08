// feat 167 — variation cross-listing: a variation has ONE primary parent movement but can also be listed
// under "secondary" parent movements (at the bottom of the picker, with a link back to its primary). A plan
// movement-step is satisfied by a variation whether the movement is its primary OR a secondary parent. This
// also reconciles the genuine "same exercise filed under two movements" duplicates (e.g. Plate Pinch under both
// Grip Training and Forearm Work): one copy is canonical, the other is suppressed and replaced by a cross-link.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

// canonical Plate Pinch lives in Grip Training; the Forearm Work copy is the suppressed duplicate.
const KEEP = 'dab40144-3173-4ec2-98d3-2c8d9667749e';
const DROP = 'a6cc5412-b88d-4ee8-a6cf-7d2c4c0be2e3';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof FAMILIES !== 'undefined' && typeof optionMatchesVar === 'function'
    && typeof secondaryParentsOf === 'function' && typeof reconcileVariationParents === 'function', null, { timeout: 15000 });
});

test('a variation satisfies a plan movement-step for BOTH its primary and a secondary parent', async ({ page }) => {
  const r = await page.evaluate(({ KEEP }) => {
    const info = VAR_INDEX.get(KEEP);
    return {
      primaryFam: info ? info.family.id : null,
      secondaries: secondaryParentsOf(KEEP),
      matchPrimary: optionMatchesVar({ type: 'movement', familyId: info.family.id }, KEEP),
      matchSecondary: optionMatchesVar({ type: 'movement', familyId: 'wrist-curl' }, KEEP),
      matchUnrelated: optionMatchesVar({ type: 'movement', familyId: 'squat' }, KEEP),
    };
  }, { KEEP });
  expect(r.primaryFam).toBe('grip-training');         // primary parent = its home family
  expect(r.secondaries).toContain('wrist-curl');      // cross-listed under Forearm Work
  expect(r.matchPrimary).toBe(true);                  // primary parent satisfies the step
  expect(r.matchSecondary).toBe(true);                // secondary parent ALSO satisfies the step
  expect(r.matchUnrelated).toBe(false);               // an unrelated movement does not
});

test('stepQualifyingVarSet for a movement includes its cross-listed (secondary) variations', async ({ page }) => {
  const r = await page.evaluate(({ KEEP }) => {
    const set = stepQualifyingVarSet({ options: [{ type: 'movement', familyId: 'wrist-curl' }] });
    return { hasKeep: set.has(KEEP) };
  }, { KEEP });
  expect(r.hasKeep).toBe(true); // a plan step on Forearm Work offers the cross-listed Plate Pinch as a choice
});

test('the suppressed duplicate is hidden, and the canonical appears as a secondary cross-link under its other family', async ({ page }) => {
  const r = await page.evaluate(({ KEEP, DROP }) => {
    const dropInfo = VAR_INDEX.get(DROP);
    const dropFam = dropInfo.family; // wrist-curl
    // the dropped copy is hidden from its own family's picker list
    const dropVisible = varVisibleInPicker(dropFam, dropInfo.variation);
    // render the picker filtered to the wrist-curl family's exercises and inspect the result groups
    modalState.pickerSearch = ''; modalState.planStepFilter = null;
    const results = filterVariations();
    const wrist = results.find(g => g.family.id === 'wrist-curl');
    const sec = (wrist && wrist.secondaryVars) || [];
    return {
      dropVisible,
      isSuppressed: isSuppressedVar(DROP),
      wristHasSecondaryKeep: sec.some(s => s.v.uuid === KEEP),
      // the suppressed copy must NOT show as a normal (primary) row in wrist-curl
      wristPrimaryHasDrop: !!wrist && wrist.variations.some(v => v.uuid === DROP),
      secPrimaryTitle: (sec.find(s => s.v.uuid === KEEP) || {}).primaryTitle,
    };
  }, { KEEP, DROP });
  expect(r.isSuppressed).toBe(true);
  expect(r.dropVisible).toBe(false);             // suppressed from its own family
  expect(r.wristPrimaryHasDrop).toBe(false);     // no stale twin in the primary list
  expect(r.wristHasSecondaryKeep).toBe(true);    // canonical appears as a cross-link at the bottom
  expect(r.secPrimaryTitle).toContain('Grip');   // labelled with a link back to its primary movement
});

test('no cross-family duplicate variation titles remain VISIBLE in the picker', async ({ page }) => {
  const dups = await page.evaluate(() => {
    const byTitle = {};
    FAMILIES.forEach(f => (f.variations || []).forEach(v => {
      if (!varVisibleInPicker(f, v)) return; // skip suppressed/hidden
      const t = (v.title || '').trim().toLowerCase();
      (byTitle[t] = byTitle[t] || []).push(f.id);
    }));
    return Object.entries(byTitle).filter(([, fams]) => new Set(fams).size > 1).map(([t]) => t);
  });
  expect(dups).toEqual([]); // every same-exercise-under-two-movements case is reconciled to one canonical
});

test('the picker renders the secondary cross-link row with a jump-to-primary link', async ({ page }) => {
  const r = await page.evaluate(() => {
    // search for "plate pinch" so both the grip-training primary and the wrist-curl cross-link surface
    modalState.pickerSearch = 'plate pinch'; modalState.planStepFilter = null;
    const html = renderPickerResults();
    return {
      hasSecondaryRow: /picker-var secondary/.test(html),
      hasSecFromLabel: /picker-var-secfrom/.test(html),
      hasJumpLink: /data-sec-jump=/.test(html),
    };
  });
  expect(r.hasSecondaryRow).toBe(true);
  expect(r.hasSecFromLabel).toBe(true);
  expect(r.hasJumpLink).toBe(true);
});

test('reconciliation never destroys logged data — a suppressed copy still resolves in VAR_INDEX', async ({ page }) => {
  const r = await page.evaluate(({ DROP }) => {
    const info = VAR_INDEX.get(DROP);
    // an old session that logged the now-suppressed uuid still renders a name (no orphan)
    return { resolves: !!info, name: info ? displayName(DROP) : null };
  }, { DROP });
  expect(r.resolves).toBe(true);
  expect(r.name).toMatch(/pinch/i);
});
