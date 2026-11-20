// feat 515 — the All-weights table gains a Chart view: two stacked charts on a shared weight axis (e1RM never
// shares a y-axis with PR odds), a crosshair driving a docked readout of every series at that weight, and a
// Load button — exploring the chart never changes the set by accident.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof showWeightTablePopup === 'function' && typeof wtChartHtml === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const open = (page, view, sets) => page.evaluate(({ view, sets }) => {
  let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') { v = u; break; }
  state.unit = 'lb';
  const at = d => new Date(Date.now() - d * 864e5).toISOString();
  state.sessions = sets.map(([w, r, d], i) => ({ id: 'h' + i, date: at(d), exercises: [{ varUuid: v, subUuid: null, sets: [{ w, r }], topSet: { w, r } }] }));
  pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true; renderModal();
  _wtView = view;
  showWeightTablePopup();
}, { view, sets });

const HIST = [[200, 5, 40], [210, 5, 30], [220, 3, 20], [230, 2, 10], [240, 1, 5]];

test('feat 515 — Table | Chart toggle; the table stays the default', async ({ page }) => {
  await open(page, 'table', HIST);
  const r = await page.evaluate(() => {
    const sheet = document.querySelector('.wt-sheet');
    const before = { table: !sheet.querySelector('.wt-table-wrap').hidden, chart: !sheet.querySelector('.wt-chart-wrap').hidden };
    sheet.querySelector('[data-wt-view="chart"]').click();
    const after = { table: !sheet.querySelector('.wt-table-wrap').hidden, chart: !sheet.querySelector('.wt-chart-wrap').hidden,
      svgs: sheet.querySelectorAll('svg[data-wt-plot]').length, title: sheet.querySelector('.choice-title').textContent };
    return { before, after, remembered: _wtView };
  });
  expect(r.before).toEqual({ table: true, chart: false });
  expect(r.after.table).toBe(false);
  expect(r.after.chart).toBe(true);
  expect(r.after.svgs, 'two charts — e1RM and PR odds never share a y-axis').toBe(2);
  expect(r.after.title).toMatch(/inspect/);
  expect(r.remembered, 'the choice sticks for the next open').toBe('chart');
});

test('feat 515 — both charts plot every weight on the same x positions', async ({ page }) => {
  await open(page, 'chart', HIST);
  const r = await page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll('svg[data-wt-plot]')];
    // the headline series' dots (drawn last, so the final 5 circles of each plot's dot run)
    const xs = svg => [...svg.querySelectorAll('circle')].map(c => +c.getAttribute('cx'));
    const ax = [...new Set(xs(a))].sort((p, q) => p - q), bx = [...new Set(xs(b))].sort((p, q) => p - q);
    return { ax, bx, labels: [...a.querySelectorAll('.tick')].map(t => t.textContent) };
  });
  expect(r.ax).toHaveLength(5);
  expect(r.ax, 'a shared weight axis, so the charts read as one').toEqual(r.bx);
  expect(r.ax[0]).toBeLessThan(r.ax[4]);
});

test('feat 515 — the readout opens on the best e1RM and lists every series; arrows move it', async ({ page }) => {
  await open(page, 'chart', HIST);
  const r = await page.evaluate(() => {
    const ro = document.querySelector('.wt-readout');
    const first = { w: ro.querySelector('.wt-ro-w').textContent, rows: ro.querySelectorAll('.wt-ro-row').length };
    const svg = document.querySelector('svg[data-wt-plot="e1"]');
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    const moved = ro.querySelector('.wt-ro-w').textContent;
    const xh = svg.querySelector('.xhair').getAttribute('visibility');
    return { first, moved, xh };
  });
  // 210×5 → e1RM 245, the highest of the five
  expect(r.first.w).toMatch(/^210 lb/);
  expect(r.first.rows, 'one readout row per series: 3 e1RM + 2 odds').toBe(5);
  expect(r.moved, 'ArrowLeft steps one weight lighter').toMatch(/^200 lb/);
  expect(r.xh).toBe('visible');
});

test('feat 515 — exploring never loads; only the readout button does', async ({ page }) => {
  await open(page, 'chart', HIST);
  const r = await page.evaluate(() => {
    const svg = document.querySelector('svg[data-wt-plot="e1"]');
    const rect = svg.getBoundingClientRect();
    svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: rect.right - 70, clientY: rect.top + 40 }));
    const stillOpen = !!document.querySelector('.wt-sheet');
    const w = document.querySelector('.wt-ro-w').textContent;
    document.querySelector('.wt-ro-load').click();
    return { stillOpen, w, loaded: pending.sets[0].w };
  });
  expect(r.stillOpen, 'a tap on the chart inspects, it does not close the sheet').toBe(true);
  expect(r.w).toMatch(/^240 lb/);           // the right edge is the heaviest weight
  expect(r.loaded).toBe(240);               // the button loads it
});

test('feat 515 — a colliding end label is won by the headline series', async ({ page }) => {
  await open(page, 'chart', HIST);           // one set per weight: best = 90d = last at every point
  const r = await page.evaluate(() => ({
    ends: [...document.querySelectorAll('svg[data-wt-plot="e1"] .end')].map(t => t.textContent),
    note: !!document.querySelector('.wt-note'),
  }));
  expect(r.ends).toEqual(['Best 240']);
  expect(r.note, 'coinciding lines are explained, not mistaken for a missing one').toBe(true);
});

test('feat 515 — fewer than two weights says so instead of drawing a single dot', async ({ page }) => {
  await open(page, 'chart', [[200, 5, 4]]);
  const txt = await page.evaluate(() => document.querySelector('.wt-chart-wrap').textContent);
  expect(txt).toMatch(/at least two different weights/);
});

test('feat 565 — missing weights on an obvious step get projected rows, up to the max, and can be hidden', async ({ page }) => {
  await page.evaluate(() => { let v; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') v = u; state.exerciseMaxW = { [v]: 225 }; state.wtHideProj = {}; });
  await open(page, 'table', [[200, 8, 40], [205, 6, 30], [215, 4, 20], [195, 9, 10]]);
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.choice-backdrop .wt-table tbody tr')].map(t => (t.classList.contains('wt-proj') ? 'p' : '') + t.dataset.wtW));
  expect((await rows()).sort()).toEqual(['195', '200', '205', '215', 'p210', 'p220', 'p225'].sort());
  const cell = await page.evaluate(() => document.querySelector('.wt-table tr.wt-proj[data-wt-w="210"] td:nth-child(2)').textContent);
  expect(cell).toMatch(/^~\d+×\d+projected$/);
  await page.evaluate(() => document.querySelector('.choice-backdrop [data-wt-proj]').click()); // the sheet slides up on a phone: a geometric tap can land on the backdrop mid-animation
  expect((await rows()).filter(r => r.startsWith('p'))).toEqual([]);
  expect(await page.evaluate(() => Object.values(state.wtHideProj))).toEqual([true]);   // remembered for this exercise
  // an uneven "funky stack" has no obvious step: no projected rows at all
  await page.evaluate(() => { document.querySelectorAll('.choice-backdrop').forEach(b => b.remove()); state.wtHideProj = {}; });
  await open(page, 'table', [[200, 8, 40], [207, 6, 30], [215, 4, 20], [222, 3, 10]]);
  expect((await rows()).filter(r => r.startsWith('p'))).toEqual([]);
});

test('feat 575 — a hand-written weight list replaces the worked-out one: odd pin positions show as projected rows', async ({ page }) => {
  await page.evaluate(() => { state.exerciseMaxW = {}; state.wtHideProj = {}; state.wtRungs = {}; });
  await open(page, 'table', [[200, 8, 40], [207, 6, 30], [215, 4, 20], [222, 3, 10]]);   // an uneven stack: nothing is projected on its own
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.choice-backdrop .wt-table tbody tr')].map(t => (t.classList.contains('wt-proj') ? 'p' : '') + t.dataset.wtW));
  expect((await rows()).filter(r => r.startsWith('p'))).toEqual([]);
  expect(await page.evaluate(() => document.querySelector('[data-wt-rungs]').textContent)).toMatch(/Set the weight list/);
  await page.evaluate(() => document.querySelector('.choice-backdrop [data-wt-rungs]').click());
  const prefill = await page.evaluate(() => [...document.querySelectorAll('.choice-backdrop')].pop().querySelector('input').value);
  expect(prefill).toBe('200, 207, 215, 222');                     // starts from what is there
  await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('.choice-backdrop')].pop(), inp = dlg.querySelector('input');
    inp.value = '200, 207 212.5; 215, 222, 230, 230, junk, -5';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    [...dlg.querySelectorAll('.choice-btn')].find(b => /primary/.test(b.className) || /ok|save/i.test(b.textContent)).click();
  });
  await page.waitForFunction(() => document.querySelectorAll('.wt-table tr.wt-proj').length === 2);
  expect((await rows()).sort()).toEqual(['200', '207', '215', '222', 'p212.5', 'p230'].sort());
  const saved = await page.evaluate(() => ({ list: Object.values(state.wtRungs)[0], label: document.querySelector('[data-wt-rungs]').textContent, parse: parseWeightRungs(' 5,5 ,10') }));
  expect(saved.list).toEqual([200, 207, 212.5, 215, 222, 230]);   // sorted, de-duplicated, junk dropped
  expect(saved.label).toMatch(/Edit my weight list/);
  expect(saved.parse).toEqual([5, 10]);
  // the hide switch still works on a hand-written list, and an empty list goes back to automatic
  await page.evaluate(() => document.querySelector('.choice-backdrop [data-wt-proj]').click());
  expect((await rows()).filter(r => r.startsWith('p'))).toEqual([]);
  expect(await page.evaluate(() => { const v = Object.keys(state.wtRungs)[0]; setExWeightRungs(v, parseWeightRungs('')); return exWeightRungs(v); })).toBe(null);
});

test('feat 576 — legend entries switch their line off and on; the last one in a plot stays', async ({ page }) => {
  await page.evaluate(() => { _wtHidden.clear(); _wtSlide = 0; });
  await open(page, 'chart', HIST);
  const paths = () => page.evaluate(() => document.querySelectorAll('svg[data-wt-plot="e1"] path').length);
  const press = (k) => page.evaluate((k) => document.querySelector(`.wt-chart-wrap [data-wt-series="${k}"]`).click(), k);
  expect(await paths()).toBe(3);
  await press('d90');
  expect(await paths()).toBe(2);
  expect(await page.evaluate(() => document.querySelector('[data-wt-series="d90"]').getAttribute('aria-pressed'))).toBe('false');
  await press('last'); await press('best');                       // best is the last one showing: it stays
  expect(await paths()).toBe(1);
  expect(await page.evaluate(() => [..._wtHidden].sort())).toEqual(['d90', 'last']);
  await press('d90');
  expect(await paths()).toBe(2);
  expect(await page.evaluate(() => document.querySelector('.wt-readout .wt-ro-w').textContent)).toMatch(/^210/);   // the selection survives a redraw
  await page.evaluate(() => _wtHidden.clear());
});

test('feat 576 — the second chart is a carousel: PR odds, reps (most ever, last time), days since', async ({ page }) => {
  await page.evaluate(() => { _wtHidden.clear(); _wtSlide = 0; });
  await open(page, 'chart', HIST);
  const snap = () => page.evaluate(() => {
    const svg = document.querySelectorAll('svg[data-wt-plot]')[1];
    return { id: svg.dataset.wtPlot, title: document.getElementById('wt-car-title').textContent, dots: document.querySelectorAll('.wt-car-dot').length,
      on: [...document.querySelectorAll('.wt-car-dot')].findIndex(d => d.classList.contains('on')),
      legend: [...document.querySelectorAll('.wt-legend')].pop().textContent, lines: svg.querySelectorAll('path').length,
      readout: [...document.querySelectorAll('.wt-readout .wt-ro-row')].map(r => r.querySelector('.wt-ro-v').textContent) };
  });
  const a = await snap();
  expect(a).toMatchObject({ id: 'pr', dots: 3, on: 0 });
  await page.evaluate(() => document.querySelector('[data-wt-car="1"]').click());
  const b = await snap();
  expect(b.id).toBe('reps');
  expect(b.title).toMatch(/Reps at each weight/);
  expect(b.legend).toMatch(/Most reps ever.*Reps last time/);
  expect(b.lines).toBe(2);
  expect(b.readout.slice(3)).toEqual(['5 reps', '5 reps']);       // 210×5, the weight the readout opens on
  await page.evaluate(() => document.querySelector('[data-wt-slide="2"]').click());
  const c = await snap();
  expect(c.id).toBe('days');
  expect(c.legend).toMatch(/Days since the record.*Days since you last did/);
  expect(c.readout.slice(3)).toEqual(['30 days ago', '30 days ago']);
  expect(c.on).toBe(2);
  await page.evaluate(() => document.querySelector('[data-wt-car="1"]').click());   // wraps round
  expect((await snap()).id).toBe('pr');
  expect(await page.evaluate(() => document.querySelectorAll('svg[data-wt-plot]').length)).toBe(2);
});
