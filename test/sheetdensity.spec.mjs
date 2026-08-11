// feat 470 — the log sheet's two remaining space hogs. The header spent four lines on LOGGING / name /
// family·bodypart / recovery, which is two lines of content; and the Tips carousel's seven word tabs wrapped
// onto two rows. Both squeeze back, and the carousel gains a way to collapse itself from inside.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0
    && typeof openLogModal === 'function' && typeof renderModal === 'function', null, { timeout: 15000 });
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

test('feat 470 — the header is two lines, and the meta line carries what the extra lines used to', async ({ page }) => {
  const v = await openSheet(page);
  const r = await page.evaluate((v) => {
    // seed a recovery read so the former line 4 has content to fold in (>=2 sessions, readiness < 0.85)
    const mk = (h, n) => ({ date: new Date(Date.now() - h * 3600000).toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: Array.from({ length: n }, () => ({ w: 100, r: 8,
        ts: new Date(Date.now() - h * 3600000).toISOString() })) }] });
    state.sessions = [mk(10, 6), mk(58, 6), mk(106, 6)];
    renderModal();
    const card = document.querySelector('#trk-modal-body .selected-exercise');
    // direct-child text rows, ignoring the action bar / note row that sit below
    const rows = [...card.children].filter(el => !el.classList.contains('ex-actions')
      && !el.classList.contains('ex-note-row') && el.offsetHeight > 0);
    const tops = new Set(rows.map(el => Math.round(el.getBoundingClientRect().top)));
    const meta = card.querySelector('.selected-ex-family');
    return {
      rowCount: rows.length, visualLines: tops.size,
      hasLabelLine: !!card.querySelector('.selected-ex-label'),
      name: card.querySelector('.selected-ex-name').textContent,
      metaText: meta.textContent,
      hasRec: !!meta.querySelector('.ex-meta-rec'),
      recInMeta: !!meta.querySelector('.ex-meta-rec'),
      // the recovery read still colours by status rather than going flat grey
      recClass: [...(meta.querySelector('.ex-meta-rec') || { classList: [] }).classList].find(c => c.startsWith('ex-rec-')),
      // a bare `rec-fatigued` is a coloured SWATCH elsewhere in the app; inheriting it painted this span solid
      recBg: meta.querySelector('.ex-meta-rec') ? getComputedStyle(meta.querySelector('.ex-meta-rec')).backgroundColor : null,
    };
  }, v);
  expect(r.hasLabelLine, 'the sheet title already says Log Sets').toBe(false);
  expect(r.rowCount, 'name + meta, nothing else').toBe(2);
  expect(r.visualLines).toBe(2);
  expect(r.metaText).toMatch(/·/);
  expect(r.hasRec, 'the recovery read folded into the meta line rather than being dropped').toBe(true);
  expect(r.recClass, 'it still carries its status colour').toMatch(/^ex-rec-/);
  expect(r.recBg, 'text colour only — never a filled block').toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});

test('feat 470 — the meta line does not say the body part twice', async ({ page }) => {
  const v = await openSheet(page);
  const r = await page.evaluate((v) => {
    const mk = (h, n) => ({ date: new Date(Date.now() - h * 3600000).toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: Array.from({ length: n }, () => ({ w: 100, r: 8,
        ts: new Date(Date.now() - h * 3600000).toISOString() })) }] });
    state.sessions = [mk(10, 6), mk(58, 6), mk(106, 6)];
    renderModal();
    const info = VAR_INDEX.get(v);
    const bp = BP_LABELS[info.bp] || info.bp;
    const hint = exerciseRecoveryHint(v);
    const txt = document.querySelector('#trk-modal-body .selected-ex-family').textContent;
    const hits = txt.split(bp).length - 1;
    return { bp, hintLabel: hint && hint.label, hits };
  }, v);
  // when the recovery hint names the same muscle the body part already gave, it is not repeated
  if (r.hintLabel === r.bp) expect(r.hits, 'the muscle is named once').toBe(1);
  else expect(r.hits).toBeGreaterThanOrEqual(1);
});

test('feat 470 — editing a past session still says so, since the sheet title never changes', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const logging = !!document.querySelector('#trk-modal-body .ex-editing-chip');
    modalState.isEditing = true; renderModal();
    const chip = document.querySelector('#trk-modal-body .ex-editing-chip');
    return { logging, editing: !!chip, text: chip && chip.textContent.trim(),
      title: document.querySelector('.modal-title').textContent.trim() };
  });
  expect(r.logging, 'the default state needs no chip').toBe(false);
  expect(r.editing, 'the state that is NOT the default must be visible').toBe(true);
  expect(r.text).toBe('Editing');
  expect(r.title, 'the sheet title is static, which is why the chip has to exist').toBe('Log Sets');
});

test('feat 470 — the carousel is one row: icons only, words on the selected tab alone', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const sec = document.getElementById('trk-tips-section');
    sec.classList.add('open');
    const tabs = [...sec.querySelectorAll('.excar-tab')];
    const shown = () => tabs.map(t => getComputedStyle(t.querySelector('.excar-lbl')).display);
    const before = shown();
    sec.querySelector('.excar-tab[data-excar="motion"]').click();
    const after = shown();
    return {
      count: tabs.length,
      keys: tabs.map(t => t.dataset.excar),
      everyHasIcon: tabs.every(t => (t.querySelector('.excar-ico').textContent || '').trim().length > 0),
      rows: new Set(tabs.map(t => Math.round(t.getBoundingClientRect().top))).size,
      labelsShownAtFirst: before.filter(d => d !== 'none').length,
      labelsShownAfter: after.filter(d => d !== 'none').length,
      activeAfter: sec.querySelector('.excar-tab.active').dataset.excar,
      activeLabelShown: getComputedStyle(sec.querySelector('.excar-tab.active .excar-lbl')).display !== 'none',
      // every tab keeps an accessible name even with the words hidden
      labelled: tabs.every(t => !!t.getAttribute('aria-label')),
      // nowrap trades wrapping for OVERFLOW, so the row has to actually fit
      fits: sec.querySelector('.excar-tabs').scrollWidth <= sec.querySelector('.excar-tabs').clientWidth + 1,
    };
  });
  expect(r.count, 'all seven survive').toBe(7);
  expect(r.keys).toEqual(['tips', 'full', 'motion', 'trends', 'history', 'alts', 'brief']);
  expect(r.everyHasIcon).toBe(true);
  expect(r.rows, 'one row — the wrap onto two is the thing being fixed').toBe(1);
  expect(r.labelsShownAtFirst, 'exactly one tab spells its name').toBe(1);
  expect(r.labelsShownAfter).toBe(1);
  expect(r.activeAfter, 'the label follows the selection').toBe('motion');
  expect(r.activeLabelShown).toBe(true);
  expect(r.labelled, 'an icon-only tab still needs a name for screen readers').toBe(true);
  expect(r.fits, 'one row must FIT, not overflow — nowrap has no second line to fall back on').toBe(true);
});

test('feat 470 — a chip inside the panel collapses it, and the choice sticks', async ({ page }) => {
  await openSheet(page);
  const r = await page.evaluate(() => {
    const sec = document.getElementById('trk-tips-section');
    sec.classList.add('open'); modalState.tipsExpanded = true;
    const btn = document.getElementById('trk-excar-collapse');
    const inPanel = !!btn && !btn.closest('.tips-header') && !!btn.closest('.tips-content');
    btn.click();
    const closed = { open: sec.classList.contains('open'), flag: modalState.tipsExpanded };
    // and it is not counted as a carousel tab, so slide-switching is untouched
    const tabKeys = [...sec.querySelectorAll('.excar-tab')].map(t => t.dataset.excar);
    // the header still toggles it back
    document.getElementById('trk-tips-header').click();
    return { inPanel, closed, tabKeys, reopened: sec.classList.contains('open') };
  });
  expect(r.inPanel, 'the header scrolls away once you are inside a slide — hence a chip in the panel').toBe(true);
  expect(r.closed).toEqual({ open: false, flag: false });
  expect(r.tabKeys).not.toContain(undefined);
  expect(r.tabKeys.length).toBe(7);
  expect(r.reopened, 'the header toggle still works').toBe(true);
});
