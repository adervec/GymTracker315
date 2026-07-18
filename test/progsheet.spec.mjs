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

const readBtns = (page) => page.evaluate(() =>   // reference buttons only — the ⤢ expand (feat 422) is not one
  [...document.querySelectorAll('#trk-modal-body .prog-prefill.target-btn')].map(b => ({ w: b.dataset.w, label: b.textContent.trim() })));

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

// feat 422 — ⤢ opens the all-weights table: per weight the all-time / latest / 90-day e1RMs with dates,
// plus PR-odds indices; sortable; tapping a row loads that weight.
test('feat 422 — exWeightRows aggregates per-weight records and PR odds', async ({ page }) => {
  await openWith(page, [{ daysAgo: 2, sets: [[135, 5]] }, { daysAgo: 9, sets: [[120, 15]] }, { daysAgo: 100, sets: [[100, 10]] }]);
  const r = await page.evaluate(() => {
    const R = exWeightRows(pending.varUuid, pending.subUuid);
    const by = {}; R.rows.forEach(x => by[x.w] = x);
    return { n: R.rows.length, cap: R.cap, allBest: R.allBest,
      d90of100: by[100].d90, best120: Math.round(by[120].best.e),
      pw: { 100: by[100].pw, 135: by[135].pw, 120: by[120].pw }, pv120: by[120].pv };
  });
  expect(r.n).toBe(3);
  expect(r.allBest).toBe(180);            // 120×15
  expect(r.cap).toBe(180);                // the 90-day window still holds the record
  expect(r.d90of100).toBe(null);          // 100 lb was 100 days ago — outside the window
  expect(r.best120).toBe(180);
  expect(r.pw[100]).toBeGreaterThan(r.pw[135]);   // light weight, few reps to beat → likeliest weight-PR
  expect(r.pw[135]).toBeGreaterThan(r.pw[120]);
  expect(r.pv120).toBe(r.pw[120]);        // beating the record weight's own record IS the variation PR
});

test('feat 422 — the ⤢ popup sorts by any column and a row tap loads that weight', async ({ page }) => {
  await openWith(page, [{ daysAgo: 2, sets: [[135, 5]] }, { daysAgo: 9, sets: [[120, 15]] }, { daysAgo: 100, sets: [[100, 10]] }]);
  const r = await page.evaluate(() => {
    const expand = document.getElementById('trk-wt-expand');
    showWeightTablePopup();
    const back = document.querySelector('.choice-backdrop');
    const firstW = () => back.querySelector('tbody tr').dataset.wtW;
    const byWeight = firstW();                                   // default: weight desc
    back.querySelector('[data-wt-col="pw"]').click();
    const byPw = firstW();                                       // PR-odds desc → the light weight leads
    const rows = back.querySelectorAll('tbody tr').length;
    back.querySelector('tbody tr').click();                      // tap the top row → load 100
    return { hasExpand: !!expand, rows, byWeight, byPw, closed: !back.classList.contains('open'),
      w: pending.sets[0].w, rep: pending.sets[0].r };
  });
  expect(r.hasExpand).toBe(true);
  expect(r.rows).toBe(3);
  expect(r.byWeight).toBe('135');
  expect(r.byPw).toBe('100');
  expect(r.closed).toBe(true);            // picking a weight closes the popup...
  expect(r.w).toBe(100);                  // ...and prefills it
  expect(r.rep).toBe('');                 // reps stay yours to log
});

test('feat 422 — no ⤢ without history', async ({ page }) => {
  await openWith(page, []);
  expect(await page.evaluate(() => !!document.getElementById('trk-wt-expand'))).toBe(false);
});

// feat 439/440 — the table colour-scales the PR columns and shows reps + the 🌍 objective read per weight
test('feat 439/440 — popup rows carry ×reps, tier chips with biometrics, and coloured PR cells', async ({ page }) => {
  await openWith(page, [{ daysAgo: 2, sets: [[135, 5]] }, { daysAgo: 9, sets: [[120, 15]] }]);
  const r = await page.evaluate(() => {
    state.profile = { ...(state.profile || {}), gender: 'male', dob: '' };
    state.bodyComp = [{ date: '2026-01-01T12:00:00.000Z', weightKg: 100, updatedAt: '2026-01-01T12:00:00.000Z' }];
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    showWeightTablePopup();
    const back = [...document.querySelectorAll('.choice-backdrop')].pop();
    const withBio = {
      reps: (back.querySelector('.wt-reps') || {}).textContent || '',
      objHeader: !!back.querySelector('[data-wt-col="obj"]'),
      objChip: !!back.querySelector('.wt-obj'),
      pwColored: ((back.querySelector('td.wt-idx') || {}).getAttribute && back.querySelector('td.wt-idx').getAttribute('style') || '').includes('hsl('),
    };
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    state.bodyComp = [];                                       // no bodyweight → no 🌍 column at all
    showWeightTablePopup();
    const back2 = [...document.querySelectorAll('.choice-backdrop')].pop();
    const noBioObjHeader = !!back2.querySelector('[data-wt-col="obj"]');
    document.querySelectorAll('.choice-backdrop').forEach(b => b.remove());
    return { withBio, noBioObjHeader };
  });
  expect(r.withBio.reps).toMatch(/^×\d+$/);
  expect(r.withBio.objHeader).toBe(true);
  expect(r.withBio.objChip).toBe(true);
  expect(r.withBio.pwColored).toBe(true);
  expect(r.noBioObjHeader).toBe(false);
});

// feat 432 — the ⤢ grew up: a prominent full-width button below the target row opens the table
test('feat 432 — the all-weights opener is a prominent button that opens the popup', async ({ page }) => {
  await openWith(page, [{ daysAgo: 2, sets: [[135, 5]] }]);
  const r = await page.evaluate(() => {
    const b = document.getElementById('trk-wt-expand');
    const info = { cls: b ? b.className : '', text: b ? b.textContent : '', inTargetRow: !!(b && b.closest('.target-row')) };
    document.querySelectorAll('.choice-backdrop').forEach(x => x.remove());
    b.click();
    info.popupOpen = !!document.querySelector('.choice-backdrop .wt-table');
    document.querySelectorAll('.choice-backdrop').forEach(x => x.remove());
    return info;
  });
  expect(r.cls).toContain('wt-open-btn');
  expect(r.text).toContain('All weights');
  expect(r.inTargetRow).toBe(false);      // no longer a tiny ⤢ squeezed into the target-row
  expect(r.popupOpen).toBe(true);
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
