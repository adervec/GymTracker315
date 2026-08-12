// feat 469 — the exercise header's six actions collapse to an emoji bar by default. Six labelled chips
// (note, max, media, brief, voice, change) wrapped onto four lines on a phone and pushed the sets themselves
// below the fold. Collapsed they are one row; the preference is remembered.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exActionsOpen === 'function' && typeof VAR_INDEX !== 'undefined'
    && VAR_INDEX.size > 0 && typeof openLogModal === 'function', null, { timeout: 15000 });
});

const openSheet = page => page.evaluate(() => {
  let v = null; for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') { v = u; break; }
  state.readonly = false;
  pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
  openLogModal();
  modalState.showPicker = false; modalState.isEditing = false; modalState.open = true;
  renderModal();
  return v;
});

const barState = page => page.evaluate(() => {
  const bar = document.getElementById('trk-ex-actions');
  const acts = [...bar.querySelectorAll('.ex-act')];
  return {
    open: bar.classList.contains('open'),
    count: acts.length,
    ids: acts.map(b => b.id),
    everyHasEmoji: acts.every(b => !!(b.dataset.emoji || '').trim()),
    // one row when collapsed: every button shares a top edge
    rows: new Set(acts.map(b => Math.round(b.getBoundingClientRect().top))).size,
    labelFont: acts.map(b => getComputedStyle(b).fontSize),
    barHeight: Math.round(bar.getBoundingClientRect().height),
    toggle: document.getElementById('trk-ex-actions-toggle').textContent.trim(),
  };
});

test('feat 469 — the bar starts collapsed: one row, icons only, every action still present', async ({ page }) => {
  await openSheet(page);
  const r = await barState(page);
  expect(r.open, 'collapsed is the default').toBe(false);
  expect(r.count, 'all seven actions survive the collapse (feat 474 added 🏃 Motion)').toBe(7);
  expect(r.ids).toEqual(['trk-ex-note-edit', 'trk-ex-maxw', 'trk-ex-media-btn', 'trk-ex-motion-btn', 'trk-podcast-btn', 'trk-ex-voice', 'trk-change-exercise']);
  expect(r.everyHasEmoji, 'the icon comes from data-emoji, so dynamic labels need no surgery').toBe(true);
  expect(r.rows, 'a bar, not a block').toBe(1);
  expect(r.labelFont.every(f => f === '0px'), 'the label text is zeroed, not deleted — bindings stay').toBe(true);
  expect(r.toggle).toBe('⋯');
});

test('feat 469 — expanding restores the labels and the preference survives a re-render', async ({ page }) => {
  await openSheet(page);
  const collapsedH = (await barState(page)).barHeight;

  await page.evaluate(() => document.getElementById('trk-ex-actions-toggle').click());
  const open = await barState(page);
  expect(open.open).toBe(true);
  expect(open.labelFont.every(f => f !== '0px'), 'the words are back').toBe(true);
  expect(open.rows, 'labelled chips wrap onto more than one row — the thing being fixed').toBeGreaterThan(1);
  expect(open.barHeight).toBeGreaterThan(collapsedH);
  expect(open.toggle).toBe('▴');

  // it is a remembered preference, not a per-open toggle
  const persisted = await page.evaluate(() => {
    renderModal();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { flag: state.workoutControls.exActionsOpen, onBar: document.getElementById('trk-ex-actions').classList.contains('open'),
      inStorage: stored.workoutControls.exActionsOpen };
  });
  expect(persisted).toEqual({ flag: true, onBar: true, inStorage: true });

  // and back again
  await page.evaluate(() => document.getElementById('trk-ex-actions-toggle').click());
  expect((await barState(page)).open).toBe(false);
});

test('feat 469 — every collapsed button still does what it did', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const out = {};
    document.getElementById('trk-ex-note-edit').click();
    out.noteOpened = !!modalState.exNoteEditing;
    modalState.exNoteEditing = false; renderModal();
    // the voice toggle is the one with visible state, so check it round-trips from the icon
    const wasOn = exVoiceEnabled();
    document.getElementById('trk-ex-voice').click();
    out.voiceFlipped = exVoiceEnabled() !== wasOn;
    document.getElementById('trk-ex-voice').click();
    out.voiceBack = exVoiceEnabled() === wasOn;
    renderModal();
    document.getElementById('trk-change-exercise').click();
    out.pickerOpened = !!modalState.showPicker;
    return out;
  });
  expect(r.noteOpened, '📝 opens the note editor').toBe(true);
  expect(r.voiceFlipped, '🎤 toggles the mic').toBe(true);
  expect(r.voiceBack).toBe(true);
  expect(r.pickerOpened, '🔄 opens the picker').toBe(true);
});

test('feat 469 — state a label used to carry shows as a dot when collapsed', async ({ page }) => {
  const v = await openSheet(page);
  const r = await page.evaluate((v) => {
    setExMaxW(v, 100);
    renderModal();
    const cap = document.getElementById('trk-ex-maxw');
    const dot = getComputedStyle(cap, '::after').content;
    const emoji = getComputedStyle(cap, '::before').content;
    // expanded, the same button spells the cap out
    state.workoutControls.exActionsOpen = true; renderModal();
    const openLabel = document.getElementById('trk-ex-maxw').textContent;
    return { hasCap: cap.classList.contains('has-cap'), dot, emoji, openLabel };
  }, v);
  expect(r.hasCap).toBe(true);
  expect(r.dot, 'a set cap is real state — it cannot vanish with the words').toBe('""');
  expect(r.emoji).toContain('⚖');
  expect(r.openLabel, 'expanded still spells it out').toContain('Max 100');
});

test('feat 469 — an exercise note keeps its own visible row and only one edit button exists', async ({ page }) => {
  const v = await openSheet(page);
  const r = await page.evaluate((v) => {
    setExerciseNote(v, 'seat 4, pin 7');
    renderModal();
    const tickers = document.querySelectorAll('.ex-note.ticker');
    return {
      tickerShown: tickers.length === 1,
      tickerText: tickers[0].textContent.includes('seat 4, pin 7'),
      // the ticker used to carry its own #trk-ex-note-edit — two of an id is a real bug
      editButtons: document.querySelectorAll('#trk-ex-note-edit').length,
      tickerFont: getComputedStyle(tickers[0]).fontSize,
      barLabel: document.getElementById('trk-ex-note-edit').textContent.trim(),
    };
  }, v);
  expect(r.tickerShown, 'the note is content, not an action — it does not collapse').toBe(true);
  expect(r.tickerText).toBe(true);
  expect(r.editButtons, 'exactly one #trk-ex-note-edit in the DOM').toBe(1);
  expect(r.tickerFont).not.toBe('0px');
  expect(r.barLabel).toBe('Edit note');
});

test('feat 469 — editing a past session drops 🔄 and the bar still holds together', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    modalState.isEditing = true; renderModal();
    const bar = document.getElementById('trk-ex-actions');
    const acts = [...bar.querySelectorAll('.ex-act')];
    return { count: acts.length, hasChange: !!document.getElementById('trk-change-exercise'),
      rows: new Set(acts.map(b => Math.round(b.getBoundingClientRect().top))).size };
  });
  expect(r.hasChange, 'you cannot change the exercise of a logged set').toBe(false);
  expect(r.count).toBe(6); // feat 474 — 🏃 Motion joined the bar
  expect(r.rows).toBe(1);
});
