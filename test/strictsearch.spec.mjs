// feat 604 — the picker search is strict by default: plain words look at the exercise's (and its movement's) name,
// fields aim elsewhere, phrases and patterns narrow it, and "All fields" is the old broad search.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof parsePickerQuery === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  await page.evaluate(() => { normalizeState(); state.fuzzySearch = true; delete state.pickerSearchScope;
    Object.assign(modalState, { pickerMega: 'all', pickerSub: 'all', pickerEquip: 'all', pickerFavOnly: false, pickerExplored: 'all', pickerVolStatus: 'all', pickerTrend: 'all', planStepFilter: null }); });
});

const titles = (page, q, scope) => page.evaluate(([q, scope]) => {
  state.pickerSearchScope = scope; modalState.pickerSearch = q;
  const out = []; filterVariations().forEach(g => { g.variations.forEach(v => out.push(v.title)); g.secondaryVars.forEach(s => out.push(s.v.title)); });
  return out;
}, [q, scope || 'name']);

test('feat 604 — "palloff" finds the Pallof exercises, not every core exercise; All fields is the old broad search', async ({ page }) => {
  const strict = await titles(page, 'palloff'), broad = await titles(page, 'palloff', 'all');
  expect(strict.length).toBeGreaterThan(0);
  expect(strict.every(t => /pallof/i.test(t))).toBe(true);
  expect(broad.length).toBeGreaterThan(strict.length * 5);
});

test('feat 604 — fields, phrases and patterns', async ({ page }) => {
  const glCable = await titles(page, 'm:glute e:cable');
  expect(glCable.some(t => /Cable Glute Kickback/.test(t))).toBe(true);
  const phrase = await titles(page, '"single arm" row');
  expect(phrase.length).toBeGreaterThan(0);
  expect(phrase.every(t => /single.arm/i.test(t) && /row/i.test(t))).toBe(true);
  const re = await titles(page, '/^cable.*row$/');
  expect(re.length).toBeGreaterThan(0);
  expect(re.every(t => /^cable.*row$/i.test(t))).toBe(true);
  const broken = await titles(page, '/(unclosed/');        // a broken pattern is just text, never an error
  expect(Array.isArray(broken)).toBe(true);
  const q = await page.evaluate(() => parsePickerQuery('m:"rear delt" e:cable "face pull" /^x/ plain'));
  expect(q.fields).toEqual([{ f: 'muscle', v: 'rear delt' }, { f: 'equip', v: 'cable' }]);
  expect(q.phrases).toEqual(['face pull']);
  expect(q.words).toEqual(['plain']);
  expect(q.res.length).toBe(1);
});

test('feat 604 — nothing by name widens to every field and says so; the switch remembers', async ({ page }) => {
  const r = await page.evaluate(() => {
    openLogModal(); modalState.showPicker = true; modalState.pickerSearch = 'stability ball'; renderModal();
    const widened = !!document.querySelector('.picker-widened'), shown = document.querySelectorAll('.picker-var').length;
    document.querySelector('[data-pick-scope="all"]').click();
    const scope = state.pickerSearchScope, after = !!document.querySelector('.picker-widened');
    document.querySelector('#trk-picker-search-help').click();
    const tips = !!document.querySelector('.picker-search-tips');
    return { widened, shown, scope, after, tips };
  });
  expect(r.widened).toBe(true);
  expect(r.shown).toBeGreaterThan(0);
  expect(r.scope).toBe('all');
  expect(r.after).toBe(false);        // searching everything on purpose: nothing to explain
  expect(r.tips).toBe(true);
});
