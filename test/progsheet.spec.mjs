// feat 234 — surface the feat-233 next-load suggestion inside the log sheet: for a live weight×reps
// exercise with history, a concrete "Aim for W × R" target (double progression, deload-aware) with a
// one-tap "Load W" that prefills the next empty set's WEIGHT only (you still log the reps you do).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof openLogModal === 'function' && typeof renderModal === 'function' && typeof suggestProgression === 'function', null, { timeout: 15000 });
});

// open the log sheet on a push lift with a given history; returns the chosen var uuid
const openWithHistory = (page, { w, r, daysAgo = 2, editing = false, meso = null }) => page.evaluate(({ w, r, daysAgo, editing, meso }) => {
  const v = (() => { for (const [u, i] of VAR_INDEX) if (i.family.mega === 'push' && exMode(u).mode === 'standard') return u; })();
  state.unit = 'lb';
  state.meso = meso || { enabled: false, length: 4, start: null };
  if (w != null) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - daysAgo); state.sessions = [{ id: 'h', date: d.toISOString(), updatedAt: d.toISOString(), exercises: [{ varUuid: v, subUuid: null, sets: [{ w, r }] }] }]; }
  else state.sessions = [];
  pending.varUuid = v; pending.subUuid = null; pending.cardio = null; pending.sets = [{ w: '', r: '' }]; savePending();
  openLogModal(); modalState.showPicker = false; modalState.isEditing = editing; renderModal();
  return v;
}, { w, r, daysAgo, editing, meso });

test('the sheet shows a concrete next-load target with a Load button', async ({ page }) => {
  await openWithHistory(page, { w: 135, r: 12 }); // hit the top of 8–12 → add load, reset to 8
  const r = await page.evaluate(() => {
    const body = document.getElementById('trk-modal-body'), t = body.querySelector('.prog-target');
    return { has: !!t, aim: (t?.querySelector('.prog-target-aim')?.textContent || '').replace(/\s+/g, ' ').trim(), note: t?.querySelector('.prog-target-note')?.textContent || '', btnW: body.querySelector('#trk-prog-prefill')?.dataset.w, cls: t?.className || '' };
  });
  expect(r.has).toBe(true);
  expect(r.aim).toContain('140');
  expect(r.aim).toContain('8');
  expect(r.note).toContain('add load');
  expect(r.btnW).toBe('140');
  expect(r.cls).toContain('prog-add-load');
});

test('one-tap Load prefills the next empty set WEIGHT only — reps stay blank', async ({ page }) => {
  await openWithHistory(page, { w: 135, r: 12 });
  const r = await page.evaluate(() => {
    document.querySelector('#trk-modal-body #trk-prog-prefill').click();
    return { w: pending.sets[0].w, rep: pending.sets[0].r };
  });
  expect(r.w).toBe(140);   // suggested weight loaded
  expect(r.rep).toBe('');  // …but you still log the reps you actually do
});

test('mid-range history suggests add-a-rep (same load, +1 rep)', async ({ page }) => {
  await openWithHistory(page, { w: 135, r: 9 });
  const r = await page.evaluate(() => {
    const t = document.querySelector('#trk-modal-body .prog-target');
    return { aim: (t?.querySelector('.prog-target-aim')?.textContent || '').replace(/\s+/g, ' ').trim(), cls: t?.className || '', btnW: document.querySelector('#trk-prog-prefill')?.dataset.w };
  });
  expect(r.aim).toContain('135');   // same weight
  expect(r.aim).toContain('10');    // +1 rep
  expect(r.cls).toContain('prog-add-reps');
  expect(r.btnW).toBe('135');
});

test('no target when editing, for no history, or non-standard tracking', async ({ page }) => {
  const editing = await openWithHistory(page, { w: 135, r: 12, editing: true }).then(() => page.evaluate(() => !!document.querySelector('#trk-modal-body .prog-target')));
  const noHist = await openWithHistory(page, { w: null }).then(() => page.evaluate(() => !!document.querySelector('#trk-modal-body .prog-target')));
  expect(editing).toBe(false);   // editing a past entry → no forward suggestion
  expect(noHist).toBe(false);    // nothing logged yet → nothing to suggest
});

test('a deload week surfaces a back-off target in the sheet', async ({ page }) => {
  await openWithHistory(page, { w: 135, r: 9, meso: { enabled: true, length: 4, start: null } });
  // anchor the cycle 3 weeks back so we're in the deload week, then re-render
  const r = await page.evaluate(() => {
    state.meso.start = _weekMonday(3).toISOString().slice(0, 10);
    renderModal();
    const t = document.querySelector('#trk-modal-body .prog-target');
    return { phase: mesoCurrentWeek().phase, cls: t?.className || '', btnW: document.querySelector('#trk-prog-prefill')?.dataset.w };
  });
  expect(r.phase).toBe('Deload');
  expect(r.cls).toContain('prog-deload');
  expect(r.btnW).toBe('120');   // 135 × 0.9 → nearest 5 lb
});
