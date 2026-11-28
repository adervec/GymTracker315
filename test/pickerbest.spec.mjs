// feat 618 — the picker's second pass: best matches lead a search and the typed words are marked.
// feat 620 — the exercise sheet puts the set rows before the tools and the reading.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderPickerResults === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 618 — a search opens with its best matches, logged exercises first, and marks the words', async ({ page }) => {
  const r = await page.evaluate(() => {
    const v = FAMILIES.find(f => f.id === 'flat-bench-press').variations[0];
    state.sessions = [{ id: 'a', date: new Date(Date.now() - 864e5).toISOString(), endedAt: new Date().toISOString(), exercises: [{ varUuid: v.uuid, subUuid: null, sets: [{ w: 100, r: 5 }] }] },
      { id: 'now', date: new Date().toISOString(), exercises: [] }];
    pending = { varUuid: null, subUuid: null, sets: [] }; openLogModal(); modalState.showPicker = true; modalState.open = true;
    modalState.pickerSearch = 'press'; renderModal();
    const wrap = document.getElementById('trk-picker-results-wrap'), best = wrap.querySelector('.picker-best');
    const rows = best ? [...best.querySelectorAll('.picker-var')] : [];
    modalState.pickerSearch = ''; renderModal();
    return { n: rows.length, first: rows[0] && rows[0].dataset.varuuid, want: v.uuid, usual: rows.every(x => x.classList.contains('usual')),
      marks: rows[0] ? [...rows[0].querySelectorAll('mark.pk-hl')].map(m => m.textContent.toLowerCase()) : [],
      noneWhenEmpty: !document.querySelector('#trk-picker-results-wrap .picker-best'), dash: document.querySelectorAll('#trk-picker-results-wrap .pt-flat').length };
  });
  expect(r.n).toBeGreaterThan(0);
  expect(r.n).toBeLessThanOrEqual(5);
  expect(r.first, 'the press you have logged leads').toBe(r.want);
  expect(r.usual, 'copies are skipped by the dice, like Your usual').toBe(true);
  expect(r.marks).toContain('press');
  expect(r.noneWhenEmpty).toBe(true);
  expect(r.dash, 'a flat trend takes no room').toBe(0);
});

test('feat 620 — on the exercise sheet the set rows come before the next-set card, the targets and the tips', async ({ page }) => {
  const r = await page.evaluate(() => {
    const v = FAMILIES.find(f => f.id === 'flat-bench-press').variations[0].uuid;
    state.sessions = [{ id: 'a', date: new Date(Date.now() - 5 * 864e5).toISOString(), endedAt: new Date().toISOString(), exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 185, r: 6 }] }] },
      { id: 'now', date: new Date().toISOString(), exercises: [] }];
    pending = { varUuid: v, subUuid: null, sets: [{ w: 185, r: '' }] }; openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true; renderModal();
    const top = q => { const e = document.querySelector('#trk-modal-body ' + q); return e ? e.getBoundingClientRect().top : null; };
    return { sets: top('.sets-section'), tips: top('#trk-tips-section'), next: top('#trk-nextset'), targets: top('#trk-targets') };
  });
  expect(r.sets).not.toBeNull();
  for (const k of ['tips', 'next', 'targets']) if (r[k] != null) expect(r.sets, 'sets above ' + k).toBeLessThan(r[k]);
  expect(r.tips).not.toBeNull();
});

test('feat 630 — Go on the search field puts the keyboard away, and picks the exercise when you typed its exact name', async ({ page }) => {
  await page.evaluate(() => { state.sessions = [{ id: 'now', date: new Date().toISOString(), exercises: [] }];
    pending = { varUuid: null, subUuid: null, sets: [] }; openLogModal(); modalState.showPicker = true; modalState.open = true; modalState.pickerSearch = ''; renderModal(); });
  const input = page.locator('#trk-picker-input');
  expect(await input.getAttribute('enterkeyhint')).toBe('done');
  await input.fill('press'); await input.press('Enter');
  const many = await page.evaluate(() => ({ open: modalState.showPicker, focused: document.activeElement && document.activeElement.id, rows: new Set([...document.querySelectorAll('#trk-picker-results-wrap .picker-var')].map(r => r.dataset.varuuid)).size }));
  expect(many.rows).toBeGreaterThan(1);
  expect(many.open, 'several matches: the list stays for you to choose').toBe(true);
  expect(many.focused, 'the field lets go, so the keyboard closes').not.toBe('trk-picker-input');
  // typing an exercise's exact name and pressing Go chooses it
  const name = await page.evaluate(() => FAMILIES.find(f => f.id === 'flat-bench-press').variations[0].title);
  expect(name).not.toBeNull();
  await page.locator('#trk-picker-input').fill(name); await page.locator('#trk-picker-input').press('Enter');
  const one = await page.evaluate(() => ({ open: modalState.showPicker, picked: pending.varUuid && VAR_INDEX.get(pending.varUuid).variation.title }));
  expect(one.open).toBe(false);
  expect(one.picked).toBe(name);
});
