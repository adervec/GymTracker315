// feat 215 — variation notes: freetext stays, but the editor offers quick-pick equipment-calibration
// template chips (seat / backrest / armrest / pads / pin / handles / incline / machine #) that append
// structured fields, and the saved note plays like a STOCK TICKER on the active exercise header.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof NOTE_TEMPLATES !== 'undefined' && typeof openLogModal === 'function', null, { timeout: 15000 });
});

const armEditing = (page) => page.evaluate(() => {
  normalizeState();
  state.exerciseNotes = {};
  const fam = FAMILIES.find(f => f.id === 'bicep-curl');
  const u = fam.variations.find(v => exMode(v.uuid).mode === 'standard').uuid;
  openLogModal();
  modalState.showPicker = false; modalState.isEditing = false; modalState.exNoteEditing = true;
  pending.varUuid = u; pending.subUuid = null;
  pending.sets = [{ w: '', r: '' }];
  renderModal();
  return u;
});

test('the editor shows the calibration template chips; a tap appends with a separator', async ({ page }) => {
  await armEditing(page);
  const r = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.note-tpl-chip')];
    const ta = document.getElementById('trk-ex-note-input');
    ta.value = '';
    chips[0].click();                       // 💺 Seat
    const first = ta.value;
    ta.value = 'Seat: 4';
    chips[4].click();                       // 📌 Pin / stack → separator added
    const second = ta.value;
    return { n: chips.length, first, second, labels: chips.map(c => c.textContent) };
  });
  expect(r.n).toBe(8);                                   // the full calibration set renders
  expect(r.labels.join(' ')).toMatch(/Seat/);
  expect(r.labels.join(' ')).toMatch(/Machine #/);
  expect(r.first).toBe('Seat: ');                        // straight insert into empty text
  expect(r.second).toBe('Seat: 4 · Pin: ');              // separator-aware append
});

test('freetext + templates save through the normal note path', async ({ page }) => {
  const u = await armEditing(page);
  const r = await page.evaluate(() => {
    const ta = document.getElementById('trk-ex-note-input');
    ta.value = 'Seat: 4 · Armrest: 2 · slight elbow flare works best';
    document.getElementById('trk-ex-note-save').click();
    const note = getExerciseNote(pending.varUuid);
    return { text: note && note.text, editing: modalState.exNoteEditing };
  });
  expect(r.text).toBe('Seat: 4 · Armrest: 2 · slight elbow flare works best');
  expect(r.editing).toBe(false);
});

test('the saved note plays as a stock ticker on the active exercise (doubled content, scaled duration)', async ({ page }) => {
  const u = await armEditing(page);
  const r = await page.evaluate(() => {
    setExerciseNote(pending.varUuid, 'Seat: 4 · Pin: 7 · Handles: narrow');
    modalState.exNoteEditing = false;
    renderModal();
    const inner = document.querySelector('.ex-note-ticker-inner');
    const copies = inner ? inner.querySelectorAll('.ex-note-text').length : 0;
    const cs = inner ? getComputedStyle(inner) : null;
    const out = {
      copies,
      anim: cs ? cs.animationName : null,
      dur: inner ? inner.style.animationDuration : null,
      text: inner ? inner.querySelector('.ex-note-text').textContent : null,
    };
    setExerciseNote(pending.varUuid, ''); pending.varUuid = null; pending.sets = [{ w: '', r: '' }];
    return out;
  });
  expect(r.copies).toBe(2);                  // seamless loop needs the doubled copy
  expect(r.anim).toBe('note-ticker');        // the marquee animation is live
  expect(r.dur).toMatch(/^\d+s$/);           // duration scales with text length
  expect(r.text).toBe('Seat: 4 · Pin: 7 · Handles: narrow');
});

test('no chips outside edit mode; the add-note button is untouched', async ({ page }) => {
  await armEditing(page);
  const r = await page.evaluate(() => {
    modalState.exNoteEditing = false;
    renderModal();
    const out = { chips: document.querySelectorAll('.note-tpl-chip').length, add: !!document.getElementById('trk-ex-note-edit') };
    pending.varUuid = null; pending.sets = [{ w: '', r: '' }];
    return out;
  });
  expect(r.chips).toBe(0);
  expect(r.add).toBe(true);
});
