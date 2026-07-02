// feat 417 — the exercise sheet's tips area is a CAROUSEL: 💡 Tips · 🏃 Motion (wireframe animation) ·
// 📈 Trends preview (replaces the old Trends button) · 🕓 recent History preview. The chosen slide lives in
// modalState.exCarousel so it survives the sheet's per-set re-renders; the trend peek still opens full trends.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderModal === 'function' && typeof motionForVariation === 'function'
    && typeof exHistoryPreviewHtml === 'function' && typeof openTrendsFor === 'function', null, { timeout: 15000 });
});

const openFor = `(() => {
  let u = null; for (const f of FAMILIES) for (const v of (f.variations || [])) if (v.id === 'bb-flat-bench') u = v.uuid;
  const iso = d => new Date(Date.now() - d * 86400000).toISOString();
  state.sessions = [1, 2, 3].map(d => ({ id: 's' + d, date: iso(d), exercises: [{ varUuid: u, subUuid: null, sets: [{ w: 100 + d, r: 5 }, { w: 100, r: 5 }] }] }));
  pending = { varUuid: u, subUuid: null, sets: [{ w: '', r: '' }] };
  modalState.isEditing = false; modalState.showPicker = false; modalState.supersetMode = false; modalState.exNoteEditing = false;
  modalState.exCarousel = 'tips'; modalState.tipsExpanded = true;
  renderModal();
  return u;
})()`;

test('the tips area carries the four carousel tabs; Tips shows by default, others are hidden', async ({ page }) => {
  const r = await page.evaluate((openFor) => {
    eval(openFor);
    const sec = document.getElementById('trk-tips-section');
    const tabs = [...sec.querySelectorAll('.excar-tab')].map(b => b.dataset.excar);
    const vis = Object.fromEntries([...sec.querySelectorAll('[data-excar-slide]')].map(s => [s.dataset.excarSlide, !s.hidden]));
    return { tabs, vis, hasTips: !!sec.querySelector('[data-excar-slide="tips"] .tip-block'), oldBtnGone: !document.getElementById('trk-ex-trends-btn') };
  }, openFor);
  expect(r.tabs).toEqual(['tips', 'motion', 'trends', 'history']);
  expect(r.vis).toEqual({ tips: true, motion: false, trends: false, history: false });
  expect(r.hasTips).toBe(true);
  expect(r.oldBtnGone).toBe(true);      // the 📈 Trends button is replaced by the Trends slide
});

test('Motion tab reveals the animated wireframe stage for the picked variation', async ({ page }) => {
  const r = await page.evaluate((openFor) => {
    eval(openFor);
    const sec = document.getElementById('trk-tips-section');
    sec.querySelector('.excar-tab[data-excar="motion"]').click();
    const st = sec.querySelector('[data-excar-slide="motion"] .motion-stage');
    motionRenderStage(st, 0.5);
    return {
      visible: !sec.querySelector('[data-excar-slide="motion"]').hidden,
      saved: modalState.exCarousel,
      stage: !!st, motion: st && st.dataset.motion,
      painted: st && st.innerHTML.includes('<svg') && st.innerHTML.includes('fig-torso'),
    };
  }, openFor);
  expect(r.visible).toBe(true);
  expect(r.saved).toBe('motion');
  expect(r.stage).toBe(true);
  expect(r.motion).toBe('bench-press');
  expect(r.painted).toBe(true);
});

test('Trends tab shows the peek (sparkline + e1RM) and tapping it opens full trends', async ({ page }) => {
  const r = await page.evaluate((openFor) => {
    eval(openFor);
    const sec = document.getElementById('trk-tips-section');
    sec.querySelector('.excar-tab[data-excar="trends"]').click();
    const peek = sec.querySelector('[data-excar-slide="trends"] #trk-trend-peek');
    const hasSpark = !!(peek && peek.querySelector('.tp-spark svg'));
    peek.click();
    return { peek: !!peek, hasSpark, page: currentPage };
  }, openFor);
  expect(r.peek).toBe(true);
  expect(r.hasSpark).toBe(true);
  expect(r.page).toBe('trends');        // the slide replaces the button as the full-trends entry point
});

test('History tab previews the recent sessions of this exercise', async ({ page }) => {
  const r = await page.evaluate((openFor) => {
    eval(openFor);
    const sec = document.getElementById('trk-tips-section');
    sec.querySelector('.excar-tab[data-excar="history"]').click();
    const rows = [...sec.querySelectorAll('[data-excar-slide="history"] .excar-hist-row')];
    return { n: rows.length, firstSets: rows[0] && rows[0].querySelector('.excar-hist-sets').textContent, hasVol: rows.every(x => /\d/.test(x.querySelector('.excar-hist-vol').textContent)) };
  }, openFor);
  expect(r.n).toBe(3);                  // the 3 seeded sessions, most recent first
  expect(r.firstSets).toContain('101×5');
  expect(r.hasVol).toBe(true);
});

test('the chosen slide survives the sheet re-render (per-set updates)', async ({ page }) => {
  const r = await page.evaluate((openFor) => {
    eval(openFor);
    document.querySelector('#trk-tips-section .excar-tab[data-excar="history"]').click();
    renderModal();                       // the sheet re-renders on every set edit
    const sec = document.getElementById('trk-tips-section');
    return {
      active: sec.querySelector('.excar-tab.active').dataset.excar,
      visible: !sec.querySelector('[data-excar-slide="history"]').hidden,
      tipsHidden: sec.querySelector('[data-excar-slide="tips"]').hidden,
    };
  }, openFor);
  expect(r.active).toBe('history');
  expect(r.visible).toBe(true);
  expect(r.tipsHidden).toBe(true);
});
