// feat 428 — objective set tier: how a set ranks against POPULATION strength standards for the user's
// bodyweight / gender / age (Light / Average / Heavy / Elite / Inhuman), next to the history-relative
// overload tag. No gender or no bodyweight entry → no read at all.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof objectiveSetTier === 'function' && typeof openLogModal === 'function'
    && typeof getCurrentBodyweightKg === 'function', null, { timeout: 15000 });
});

// a barbell squat variation (standards table key 'squat', setup kind barbell → no DB rescale)
const squatVar = (page) => page.evaluate(() => {
  for (const [u, i] of VAR_INDEX) if (i.family.id === 'squat' && i.variation.id === 'bb-back-squat') return u;
});

const seedBio = (page, gender, opts = {}) => page.evaluate(({ gender, opts }) => {
  state.unit = 'kg';
  state.profile = { ...(state.profile || {}), gender, dob: opts.dob || '' };
  state.bodyComp = opts.noBw ? [] : [{ date: '2026-01-01T12:00:00.000Z', weightKg: 100, updatedAt: '2026-01-01T12:00:00.000Z' }];
}, { gender, opts });

test('feat 428 — gating: no gender or no bodyweight → no objective read', async ({ page }) => {
  const v = await squatVar(page);
  await seedBio(page, '', {});
  const noGender = await page.evaluate((v) => objectiveSetTier(v, { w: 100, r: 3 }), v);
  await seedBio(page, 'male', { noBw: true });
  const noBw = await page.evaluate((v) => objectiveSetTier(v, { w: 100, r: 3 }), v);
  await seedBio(page, 'male', {});
  const ok = await page.evaluate((v) => objectiveSetTier(v, { w: 100, r: 3 }), v);
  expect(noGender).toBeNull();
  expect(noBw).toBeNull();
  expect(ok && ok.key).toBe('average');
});

test('feat 428 — male squat tiers at 100 kg BW span light → inhuman', async ({ page }) => {
  const v = await squatVar(page);
  await seedBio(page, 'male', {});
  const r = await page.evaluate((v) => ({
    light: objectiveSetTier(v, { w: 60, r: 5 }).key,     // e1RM 70 → 0.70×BW
    average: objectiveSetTier(v, { w: 100, r: 3 }).key,  // 110 → 1.10
    heavy: objectiveSetTier(v, { w: 140, r: 5 }).key,    // 163 → 1.63
    elite: objectiveSetTier(v, { w: 190, r: 5 }).key,    // 222 → 2.22
    inhuman: objectiveSetTier(v, { w: 230, r: 5 }).key,  // 268 → 2.68
    ratio: objectiveSetTier(v, { w: 100, r: 3 }).ratio,
  }), v);
  expect(r).toEqual({ light: 'light', average: 'average', heavy: 'heavy', elite: 'elite', inhuman: 'inhuman', ratio: 1.1 });
});

test('feat 428 — gender and age scale the cutoffs', async ({ page }) => {
  const v = await squatVar(page);
  await seedBio(page, 'female', {});
  const female = await page.evaluate((v) => objectiveSetTier(v, { w: 100, r: 3 }).key, v); // 1.10 vs ×0.65 cuts → heavy
  const dob60 = await page.evaluate(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 60); return d.toISOString().slice(0, 10); });
  await seedBio(page, 'male', { dob: dob60 });
  const at60 = await page.evaluate((v) => objectiveSetTier(v, { w: 100, r: 3 }), v); // ageF 0.8 → cuts [0.8,1.2,…] → 1.10 average still, 1.3 ratio → heavy
  const at60heavy = await page.evaluate((v) => objectiveSetTier(v, { w: 115, r: 4 }).key, v); // e1RM 130.3 → 1.30 ≥ 1.2 → heavy
  expect(female).toBe('heavy');
  expect(at60.key).toBe('average');
  expect(at60heavy).toBe('heavy');
});

test('feat 428 — no standards table or non-standard mode → null; dumbbell variations rescale', async ({ page }) => {
  await seedBio(page, 'male', {});
  const r = await page.evaluate(() => {
    let grip = null, dbBench = null;
    for (const [u, i] of VAR_INDEX) { if (i.family.id === 'grip-training' && exMode(u).mode === 'standard') { grip = u; break; } }
    for (const [u, i] of VAR_INDEX) { if (i.family.id === 'flat-bench-press' && autoSetupKind(u) === 'dumbbell' && exMode(u).mode === 'standard') { dbBench = u; break; } }
    return {
      noTable: grip ? objectiveSetTier(grip, { w: 50, r: 5 }) : 'no-var',
      db: dbBench ? objectiveSetTier(dbBench, { w: 45, r: 5 }).key : 'no-var', // e1RM 52.5 → 0.525 vs ×0.4 cuts [0.3,0.4,0.6,0.8] → heavy
    };
  });
  expect(r.noTable).toBeNull();
  expect(r.db).toBe('heavy');
});

test('feat 428 — the log sheet renders the 🌍 chip, and drops it without biometrics', async ({ page }) => {
  const v = await squatVar(page);
  await seedBio(page, 'male', {});
  const withBio = await page.evaluate((v) => {
    pending = { varUuid: v, subUuid: null, sets: [{ w: 100, r: 3 }] };
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    const tag = document.querySelector('#trk-modal-body .set-obj-tag');
    return { has: !!tag, cls: tag ? tag.className : '', text: tag ? tag.textContent : '' };
  }, v);
  await seedBio(page, '', {});
  const withoutBio = await page.evaluate(() => { renderModal(); return !!document.querySelector('#trk-modal-body .set-obj-tag'); });
  await page.evaluate(() => closeLogModal());
  expect(withBio.has).toBe(true);
  expect(withBio.cls).toContain('obj-average');
  expect(withBio.text).toContain('🌍 Average');
  expect(withoutBio).toBe(false);
});
