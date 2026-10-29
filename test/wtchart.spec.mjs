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
