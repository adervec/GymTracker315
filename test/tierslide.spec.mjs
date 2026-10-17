// feat 509 — a 🌍 Tiers slide in the tips carousel: what Light / Average / Heavy / Elite / Inhuman would take
// for THIS exercise, in your units, for your bodyweight / gender / age. The scaling was factored out of
// objectiveSetTier into objectiveTierFactors so the slide and the per-set chip can never disagree.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof tiersSlideHtml === 'function' && typeof objectiveTierFactors === 'function'
    && typeof objectiveSetTier === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
  null, { timeout: 15000 });
});

const bio = (page, gender, kg) => page.evaluate(({ gender, kg }) => {
  state.unit = 'kg';
  state.profile = { ...(state.profile || {}), gender, dob: '' };
  state.bodyComp = kg ? [{ date: '2026-01-01T12:00:00.000Z', weightKg: kg, updatedAt: '2026-01-01T12:00:00.000Z' }] : [];
}, { gender, kg });

const squat = (page) => page.evaluate(() => {
  for (const [u, i] of VAR_INDEX) if (i.family.id === 'squat' && i.variation.id === 'bb-back-squat') return u;
});

test('feat 509 — the slide shows every tier as a 1-rep and 5-rep load, from the real cutoffs', async ({ page }) => {
  const v = await squat(page);
  await bio(page, 'male', 100);
  const r = await page.evaluate((v) => {
    state.sessions = [];
    const box = document.createElement('div'); box.innerHTML = tiersSlideHtml(v, null);
    const rows = [...box.querySelectorAll('.tiers-row')].map(tr => [...tr.children].map(td => td.textContent.trim()));
    return { rows, t: STRENGTH_STANDARDS['squat'] };
  }, v);
  // male, 100 kg, no age → factor 1, so the 1-rep load is just cutoff × 100, snapped to 2.5 kg
  expect(r.rows.map(x => x[0])).toEqual(['Light', 'Average', 'Heavy', 'Elite', 'Inhuman']);
  expect(r.rows[0][1]).toBe('below Average');
  expect(r.rows[1][1]).toBe(String(r.t[0] * 100));   // 125
  expect(r.rows[3][1]).toBe(String(r.t[2] * 100));   // 225
  expect(r.rows[4][1]).toBe(String(r.t[3] * 100));   // 325 — feat 503's record-anchored Inhuman
  // 5 reps of a lighter load reach the same e1RM (Epley), snapped to plates
  expect(+r.rows[1][2]).toBeLessThan(+r.rows[1][1]);
});

test('feat 509 — the slide and the per-set chip agree on every boundary', async ({ page }) => {
  const v = await squat(page);
  await bio(page, 'female', 63);   // a non-trivial factor (female ×0.65) to exercise the shared scaling
  const r = await page.evaluate((v) => {
    const box = document.createElement('div'); box.innerHTML = tiersSlideHtml(v, null);
    const shown = [...box.querySelectorAll('.tiers-row')].slice(1).map(tr => ({
      label: tr.children[0].textContent.trim(), one: +tr.children[1].textContent }));
    // a 1-rep set at the slide's printed load must read at least that tier on the chip
    return shown.map(s => ({ label: s.label, chip: objectiveSetTier(v, { w: s.one + 2.5, r: 1 }).label }));
  }, v);
  r.forEach(x => expect(x.chip, 'just above the printed ' + x.label + ' load').toBe(x.label));
});

test('feat 509 — a capped family shows no Inhuman row and says why', async ({ page }) => {
  await bio(page, 'male', 80);
  const r = await page.evaluate(() => {
    let v = null;
    for (const [u, i] of VAR_INDEX) if (i.family.id === 'leg-press' && exMode(u).mode === 'standard') { v = u; break; }
    const box = document.createElement('div'); box.innerHTML = tiersSlideHtml(v, null);
    return { labels: [...box.querySelectorAll('.tiers-row')].map(tr => tr.children[0].textContent.trim()),
      note: box.textContent };
  });
  expect(r.labels).toEqual(['Light', 'Average', 'Heavy', 'Elite']);
  expect(r.note).toMatch(/No Inhuman tier/);
});

test('feat 509 — your best set is marked on its tier', async ({ page }) => {
  const v = await squat(page);
  await bio(page, 'male', 100);
  const r = await page.evaluate((v) => {
    state.sessions = [{ id: 'h', date: new Date(Date.now() - 86400000).toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 200, r: 5 }], topSet: { w: 200, r: 5 } }] }]; // e1RM 233 → Elite
    const box = document.createElement('div'); box.innerHTML = tiersSlideHtml(v, null);
    return { mine: [...box.querySelectorAll('.tiers-row.mine')].map(tr => tr.children[0].textContent.trim()),
      you: (box.querySelector('.tiers-you') || {}).textContent || '' };
  }, v);
  expect(r.mine).toEqual(['Elite']);
  expect(r.you).toMatch(/Your best.*Elite/);
});

test('feat 509 — without biometrics the slide asks for the missing one instead of guessing', async ({ page }) => {
  const v = await squat(page);
  await bio(page, '', 100);
  const noGender = await page.evaluate((v) => tiersSlideHtml(v, null), v);
  await bio(page, 'male', 0);
  const noBw = await page.evaluate((v) => tiersSlideHtml(v, null), v);
  expect(noGender).toMatch(/Add your gender/);
  expect(noBw).toMatch(/Add your bodyweight/);
});

test('feat 509 — Tiers is a real carousel tab on the sheet', async ({ page }) => {
  const v = await squat(page);
  await bio(page, 'male', 100);
  const r = await page.evaluate((v) => {
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.exCarousel = 'tiers';
    renderModal();
    const sec = document.getElementById('trk-tips-section');
    const slide = sec.querySelector('[data-excar-slide="tiers"]');
    const row = sec.querySelector('.excar-tabs');
    const tops = [...row.querySelectorAll('.excar-tab')].map(b => Math.round(b.getBoundingClientRect().top));
    return { tab: !!sec.querySelector('.excar-tab[data-excar="tiers"]'), shown: slide && !slide.hidden,
      hasTable: !!(slide && slide.querySelector('.tiers-tbl')),
      oneRow: new Set(tops).size === 1, n: tops.length };
  }, v);
  expect(r.n).toBe(7);
  expect(r.oneRow, 'seven tabs still sit on one row, as feat 470 designed').toBe(true);
  expect(r.tab).toBe(true);
  expect(r.shown).toBe(true);
  expect(r.hasTable).toBe(true);
});
