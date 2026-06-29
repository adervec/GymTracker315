// feat 376 — once ALL three core lifts (bench · deadlift · squat) clear the next plate milestones, the "315" brand
// badge PRESTIGES: 315 → 405 → 495 → 585, with escalating styling. Falls back to the sparkly 315 digits otherwise.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof prestigeTier === 'function' && typeof applyBranding === 'function'
    && typeof FAMILIES !== 'undefined', null, { timeout: 15000 });
});

const coreUuids = (page) => page.evaluate(() => {
  const uuidOf = fid => FAMILIES.find(f => f.id === fid).variations.find(v => v.uuid).uuid;
  return { bench: uuidOf('flat-bench-press'), dead: uuidOf('deadlift'), squat: uuidOf('squat') };
});

test('feat 376 — prestige tier rises only when EVERY core lift clears the milestone', async ({ page }) => {
  const u = await coreUuids(page);
  const r = await page.evaluate((u) => {
    state.unit = 'lb';
    const sess = (w, lifts) => ({ id: 's' + w + lifts.length, date: new Date().toISOString(), exercises: lifts.map(x => ({ varUuid: x, subUuid: null, sets: [{ w, r: 1 }] })) });
    const all = [u.bench, u.dead, u.squat];
    state.sessions = []; const base = prestigeTier();
    state.sessions = [sess(405, all)]; const t405 = prestigeTier();
    state.sessions = [sess(495, all)]; const t495 = prestigeTier();
    state.sessions = [sess(585, all)]; const t585 = prestigeTier();
    state.sessions = [sess(405, [u.bench, u.dead])]; const partial = prestigeTier(); // only 2 of 3 → no prestige
    return { base, t405, t495, t585, partial };
  }, u);
  expect(r.base).toBe(315);
  expect(r.t405).toBe(405);
  expect(r.t495).toBe(495);
  expect(r.t585).toBe(585);
  expect(r.partial).toBe(315);  // one lift short → stays at base
});

test('feat 376 — kg weights are compared against the converted threshold', async ({ page }) => {
  const u = await coreUuids(page);
  const tier = await page.evaluate((u) => {
    state.unit = 'kg';
    const kg = Math.ceil(405 / 2.205) + 1; // just over 405 lb in kg
    state.sessions = [{ id: 'k', date: new Date().toISOString(), exercises: [u.bench, u.dead, u.squat].map(x => ({ varUuid: x, subUuid: null, sets: [{ w: kg, r: 1 }] })) }];
    return prestigeTier();
  }, u);
  expect(tier).toBe(405);
});

test('feat 376 — the brand badge shows the tier value, star and prestige styling', async ({ page }) => {
  const u = await coreUuids(page);
  const r = await page.evaluate((u) => {
    state.unit = 'lb';
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [u.bench, u.dead, u.squat].map(x => ({ varUuid: x, subUuid: null, sets: [{ w: 495, r: 1 }] })) }];
    applyBranding();
    const sup = document.querySelector('#app-brand .gt-brand-num');
    return { text: sup.textContent, prestige: sup.classList.contains('prestige'), data: sup.dataset.prestige, star: !!sup.querySelector('.gt-prestige-star') };
  }, u);
  expect(r.text).toContain('495');
  expect(r.prestige).toBe(true);
  expect(r.data).toBe('495');
  expect(r.star).toBe(true);
});

test('feat 376 — falls back to the 3-digit sparkly 315 badge when not prestiged', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; applyBranding();
    const sup = document.querySelector('#app-brand .gt-brand-num');
    return { text: sup.textContent.replace(/\s/g, ''), prestige: sup.classList.contains('prestige'), digits: sup.querySelectorAll('.gt-brand-d').length };
  });
  expect(r.text).toBe('315');
  expect(r.prestige).toBe(false);
  expect(r.digits).toBe(3);
});
