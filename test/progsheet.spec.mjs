// feat 420 — the verbose feat-234 "Aim for W × R" blurb is retired. The sheet now offers REFERENCE-SET
// buttons — ↩ previous top set · 🏆 all-time best by e1RM · 🏋️ all-time max weight · 🔁 all-time max reps —
// deduped by weight, each a one-tap weight prefill (feat 247 reuse-the-open-set behaviour preserved). The
// baseline cards keep ▼ lighter / ▲ heavier and gain a ⭐ best-e1RM card with the reps needed at the
// CURRENT weight to at least match it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openLogModal === 'function' && typeof renderModal === 'function' && typeof exBestSets === 'function', null, { timeout: 15000 });
});

// open the log sheet on a push lift with the given history sessions [{daysAgo, sets:[[w,r],…]}, …]
const openWith = (page, sessions) => page.evaluate((sessions) => {
  const v = (() => { for (const [u, i] of VAR_INDEX) if (i.family.mega === 'push' && exMode(u).mode === 'standard') return u; })();
  state.unit = 'lb';
  state.sessions = (sessions || []).map((s, i) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - s.daysAgo);
    return { id: 'h' + i, date: d.toISOString(), updatedAt: d.toISOString(), exercises: [{ varUuid: v, subUuid: null, sets: s.sets.map(([w, r]) => ({ w, r })) }] };
  });
  pending.varUuid = v; pending.subUuid = null; pending.cardio = null; pending.sets = [{ w: '', r: '' }]; savePending();
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
  return v;
}, sessions);

const readBtns = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#trk-modal-body .target-btn')].map(b => ({ w: b.dataset.w, label: b.textContent.trim() })));

test('identical prev/best/max sets collapse to ONE button; the Aim-for blurb is gone', async ({ page }) => {
  await openWith(page, [{ daysAgo: 2, sets: [[135, 12]] }]);
  const btns = await readBtns(page);
  const blurbGone = await page.evaluate(() => !document.querySelector('#trk-modal-body .prog-target'));
  expect(btns.length).toBe(1);                   // prev top = best e1RM = max weight = max reps → one weight, one button
  expect(btns[0].w).toBe('135');
  expect(btns[0].label).toContain('135×12');
  expect(blurbGone).toBe(true);
});

test('distinct references get their own buttons, deduped by weight', async ({ page }) => {
  // prev session top 135×5; an older 120×15 day is both the best e1RM (180) and the max-reps set
  await openWith(page, [{ daysAgo: 2, sets: [[135, 5]] }, { daysAgo: 9, sets: [[120, 15]] }, { daysAgo: 16, sets: [[100, 10]] }]);
  const btns = await readBtns(page);
  expect(btns.length).toBe(2);
  expect(btns[0].label).toContain('Prev top');
  expect(btns[0].w).toBe('135');                 // also the max-weight set — deduped into the prev button
  expect(btns[1].label).toContain('Best e1RM');
  expect(btns[1].w).toBe('120');                 // also the max-reps set — deduped
});

test('tapping a reference button prefills WEIGHT only and reuses the open set on repeat taps', async ({ page }) => {
  await openWith(page, [{ daysAgo: 2, sets: [[135, 12]] }]);
  const r = await page.evaluate(() => {
    const tap = () => document.querySelector('#trk-modal-body .target-btn').click();
    tap(); tap(); tap();
    return { len: pending.sets.length, w: pending.sets[0].w, rep: pending.sets[0].r };
  });
  expect(r.len).toBe(1);      // feat 247 behaviour preserved: one open set, not three
  expect(r.w).toBe(135);
  expect(r.rep).toBe('');     // you still log the reps you actually do
});

test('no buttons without history', async ({ page }) => {
  await openWith(page, []);
  expect((await readBtns(page)).length).toBe(0);
});

test('the ⭐ best-e1RM baseline shows the reps needed at the CURRENT weight to match it', async ({ page }) => {
  await openWith(page, [{ daysAgo: 9, sets: [[120, 15]] }]);   // best e1RM = 120·(1+15/30) = 180
  const r = await page.evaluate(() => {
    pending.sets = [{ w: 100, r: '' }]; savePending();
    renderNeighborHints();
    const card = document.querySelector('#trk-neighbor-hints .neighbor-hint.e1rm');
    return { has: !!card, text: card ? card.textContent.replace(/\s+/g, ' ') : '' };
  });
  expect(r.has).toBe(true);
  expect(r.text).toContain('180');               // the target e1RM
  expect(r.text).toContain('≥24 rep');           // 30·(180/100 − 1) = 24 reps at 100 to match
  expect(r.text).toContain('120×15');            // the set that owns the record
});

test('the e1RM card still shows when the entered weight already has a baseline (lighter/heavier suppressed)', async ({ page }) => {
  await openWith(page, [{ daysAgo: 2, sets: [[100, 5]] }, { daysAgo: 9, sets: [[120, 15]] }]);
  const r = await page.evaluate(() => {
    pending.sets = [{ w: 100, r: '' }]; savePending();
    renderNeighborHints();
    const el = document.getElementById('trk-neighbor-hints');
    return { e1: !!el.querySelector('.neighbor-hint.e1rm'), lighter: !!el.querySelector('.neighbor-hint.lighter') };
  });
  expect(r.e1).toBe(true);
  expect(r.lighter).toBe(false);                 // baseline exists at 100 → neighbors stay hidden, e1RM stays
});
