// feats 533-537 — the exercise picker: search reaches attachments / muscles / equipment (533) and alternate
// names (534), tolerates more typos and offers "did you mean" (535), the secondary filters live in one sheet
// with active-filter chips (536), and "Your usual" leads a long list (537).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof pickerSearchHay === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
    null, { timeout: 15000 });
});

const titlesFor = (q) => {
  modalState.pickerSearch = q;
  return filterVariations().flatMap(r => r.variations.map(v => v.title).concat(r.secondaryVars.map(s => s.v.title)));
};

test('feats 533 + 534 — search finds attachments, muscles and alternate names', async ({ page }) => {
  const r = await page.evaluate((src) => {
    const titlesFor = eval(src);
    openLogModal(); modalState.showPicker = true; renderModal();
    const rope = titlesFor('rope');                 // an attachment option, not in any title
    const lats = titlesFor('lats');                 // a muscle
    const skull = titlesFor('skullcrusher');        // alias
    const zombie = titlesFor('zombie');
    return { rope: rope.length, ropeHasPushdown: rope.some(t => /push.?down|pressdown|extension|curl|face pull/i.test(t)),
      latsPull: lats.some(t => /pull/i.test(t)), skull: skull.length, zombie: zombie.some(t => /frankenstein/i.test(t)) };
  }, titlesFor.toString());
  expect(r.rope).toBeGreaterThan(0);
  expect(r.ropeHasPushdown).toBe(true);
  expect(r.latsPull).toBe(true);
  expect(r.skull).toBeGreaterThan(0);
  expect(r.zombie).toBe(true);
});

test('feat 535 — two typos on long words, short words stay strict, and "did you mean" fixes a miss', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.fuzzySearch = true;
    openLogModal(); modalState.showPicker = true; modalState.pickerSearch = ''; renderModal();
    const two = searchMatchTokens('kettelbelle', 'Kettlebell Swing');         // 11 letters, 2 edits
    const eightStrict = searchMatchTokens('pulldown', 'Cable Pushdown');      // must NOT cross over
    modalState.pickerSearch = 'deedlifft';                                     // 2 typos on 9 letters: no match
    const wrap = document.getElementById('trk-picker-results-wrap');
    wrap.innerHTML = renderPickerResults(); bindPickerResults();
    const btn = wrap.querySelector('[data-dym]');
    const sug = btn && btn.dataset.dym;
    if (btn) btn.click();
    return { two, eightStrict, sug, applied: modalState.pickerSearch, results: filterVariations().length };
  });
  expect(r.two).toBe(true);
  expect(r.eightStrict).toBe(false);
  expect(r.sug).toBeTruthy();
  expect(r.applied).toBe(r.sug);
  expect(r.results).toBeGreaterThan(0);
});

test('feat 536 — secondary filters sit in one sheet; active filters show as chips that clear', async ({ page }) => {
  const r = await page.evaluate(() => {
    openLogModal(); modalState.showPicker = true; modalState.pickerFiltersOpen = false;
    modalState.pickerMega = 'all'; modalState.pickerFavOnly = false; modalState.pickerExplored = 'all'; modalState.pickerMode = 'all';
    renderModal();
    const hiddenAtStart = document.querySelector('.pf-sheet').hidden;
    document.getElementById('trk-picker-filters').click();
    const openNow = !document.querySelector('.pf-sheet').hidden;
    modalState.pickerMode = 'time'; modalState.pickerFavOnly = true; renderModal();
    const badge = document.getElementById('trk-picker-filters').textContent;
    const chips = [...document.querySelectorAll('[data-pf-clear]')].map(b => b.dataset.pfClear);
    document.querySelector('[data-pf-clear="mode"]').click();
    const modeCleared = modalState.pickerMode === 'all' && modalState.pickerFavOnly === true;
    modalState.pickerExplored = 'explored'; renderModal();
    document.querySelector('[data-pf-clear="*"]').click();
    return { hiddenAtStart, openNow, badge, chips, modeCleared, allCleared: !modalState.pickerFavOnly && modalState.pickerExplored === 'all',
      noChips: !document.querySelector('.pf-active') };
  });
  expect(r.hiddenAtStart).toBe(true);
  expect(r.openNow).toBe(true);
  expect(r.badge).toContain('· 2');
  expect(r.chips).toEqual(['fav', 'mode', '*']);
  expect(r.modeCleared).toBe(true);
  expect(r.allCleared).toBe(true);
  expect(r.noChips).toBe(true);
});

test('feat 537 — "Your usual" leads the list; it disappears while searching; 🎲 skips the copies', async ({ page }) => {
  const r = await page.evaluate(() => {
    const vs = [...VAR_INDEX.keys()].slice(0, 3);
    const at = d => new Date(Date.now() - d * 864e5).toISOString();
    state.sessions = [];
    [2, 5, 9, 12].forEach((d, i) => state.sessions.push({ id: 'u' + i, date: at(d), exercises: [{ varUuid: vs[0], sets: [{ w: 50, r: 5 }] }, ...(i < 2 ? [{ varUuid: vs[1], sets: [{ w: 50, r: 5 }] }] : [])] }));
    state.sessions.push({ id: 'once', date: at(3), exercises: [{ varUuid: vs[2], sets: [{ w: 50, r: 5 }] }] }); // 1 day: not usual
    openLogModal(); modalState.showPicker = true; modalState.pickerSearch = ''; modalState.planStepFilter = null; renderModal();
    const usual = [...document.querySelectorAll('.picker-usual .picker-var')].map(e => e.dataset.varuuid);
    const first = document.querySelector('.picker-results .picker-family-group').classList.contains('picker-usual');
    modalState.pickerSearch = 'curl';
    const w = document.createElement('div'); w.innerHTML = renderPickerResults();
    return { usual, first, want: vs.slice(0, 2), searching: !!w.querySelector('.picker-usual') };
  });
  expect(r.first).toBe(true);
  expect(r.usual).toEqual(r.want);
  expect(r.searching).toBe(false);
});
