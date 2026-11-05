// feat 546 — the Use-plan sheet times every volume at YOUR pace and can pick the volume from a finish-by time;
// 1½× joins the volume list.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof planScaleForTime === 'function' && typeof planUseForWorkout === 'function', null, { timeout: 15000 });
  await page.evaluate(() => {
    state.readonly = false; state.planDefaults = { warmup: false, cooldown: false };
    let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') { v = u; break; }
    // five finished workouts of 10 sets in 30 min → 3 min a set
    state.sessions = [1, 2, 3, 4, 5].map(d => ({ id: 'p' + d, date: new Date(Date.now() - d * 864e5).toISOString(), endedAt: new Date(Date.now() - d * 864e5 + 30 * 60000).toISOString(),
      exercises: [{ varUuid: v, sets: Array.from({ length: 10 }, () => ({ w: 50, r: 8 })) }] }));
    state.plans = [{ id: 'pl', name: 'Ten sets', intensity: 3, steps: [
      { sets: 4, options: [{ type: 'movement', familyId: 'squat' }] }, { sets: 3, options: [{ type: 'movement', familyId: 'flat-bench-press' }] },
      { sets: 3, options: [{ type: 'movement', familyId: 'row' }] }] }];
  });
});

test('feat 546 — pace comes from your own workouts; the ETA scales with volume', async ({ page }) => {
  const r = await page.evaluate(() => {
    const pace = planPace(), plan = getPlan('pl');
    state.sessions = []; const fallback = planPace();
    return { pace, eta1: planEtaMinutes(plan, 1, null, pace), eta15: planEtaMinutes(plan, 1.5, null, pace), etaFb: planEtaMinutes(plan, 1, null, fallback), fbPersonal: fallback.personal };
  });
  expect(r.pace.personal).toBe(true);
  expect(r.pace.perSet).toBe(3);
  expect(r.eta1).toBe(30);           // 10 sets × 3 min
  expect(r.eta15).toBe(48);          // 6 + 5 + 5 = 16 sets (4.5 rounds up) × 3 min
  expect(r.fbPersonal).toBe(false);
  expect(r.etaFb).toBe(28);          // 10 × 2.5 + 3 exercise changes
});

test('feat 546 — a finish-by time picks the biggest volume that fits', async ({ page }) => {
  const r = await page.evaluate(() => {
    const plan = getPlan('pl'), pace = planPace(), scales = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    return { t30: planScaleForTime(plan, scales, 30, null, pace), t50: planScaleForTime(plan, scales, 50, null, pace),
      t90: planScaleForTime(plan, scales, 90, null, pace), t5: planScaleForTime(plan, scales, 5, null, pace),
      t45warm: planScaleForTime(plan, scales, 45, { warmup: true }, pace) };
  });
  expect(r.t30).toEqual({ scale: 1, fits: true });
  expect(r.t50.scale).toBe(1.5);
  expect(r.t90).toEqual({ scale: 2, fits: true });
  expect(r.t5).toEqual({ scale: 0.5, fits: false });
  expect(r.t45warm.scale).toBeLessThan(1.5);   // the warm-up eats into the time
});

test('feat 546 — the sheet shows per-volume ETAs, 1½×, and a finish-by chip selects the volume it starts with', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const p = planUseForWorkout('pl');
    const back = [...document.querySelectorAll('.choice-backdrop')].pop();
    const vals = [...back.querySelectorAll('#pud-scale button')].map(b => b.dataset.scale);
    const eta1 = back.querySelector('[data-eta="1"]').textContent;
    back.querySelector('[data-pud-min="60"]').click();
    const active = back.querySelector('#pud-scale button.active').dataset.scale, pick = back.querySelector('#pud-pick').textContent;
    back.querySelector('[data-pud="ok"]').click();
    await p;
    return { vals, eta1, active, pick, stored: getActiveSession().planScale };
  });
  expect(r.vals).toContain('1.5');
  expect(r.eta1).toBe('~30m');
  expect(r.active).toBe('2');          // 20 sets × 3 = 60 min fits an hour
  expect(r.pick).toContain('fits');
  expect(r.stored).toBe(2);
});
