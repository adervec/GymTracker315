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
  // feat 580 — an editor, not a comma list: a chip per weight, add one or a few, add a run, remove by tapping
  const ed = () => page.evaluate(() => { const d = [...document.querySelectorAll('.choice-backdrop')].pop(); return { chips: [...d.querySelectorAll('.wl-chip')].map(c => c.dataset.wlDel), logged: d.querySelectorAll('.wl-chip.logged').length, count: d.querySelector('#wl-count').textContent }; });
  expect(await ed()).toEqual({ chips: ['200', '207', '215', '222'], logged: 4, count: '4 weights' });   // starts from what is there
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('.choice-backdrop')].pop(), set = (id, v) => { d.querySelector(id).value = v; };
    set('#wl-one', '212.5, junk -5 230 230'); d.querySelector('[data-wl="add"]').click();           // several at once; junk and repeats dropped
    set('#wl-from', '240'); set('#wl-to', '250'); set('#wl-step', '5'); d.querySelector('[data-wl="run"]').click();   // a run: 240, 245, 250
    d.querySelector('[data-wl-del="245"]').click(); d.querySelector('[data-wl-del="240"]').click(); d.querySelector('[data-wl-del="250"]').click();
  });
  expect(await ed()).toEqual({ chips: ['200', '207', '212.5', '215', '222', '230'], logged: 4, count: '6 weights' });
  expect(await page.evaluate(() => [weightRun(90, 105, 5), weightRun(10, 5, 2.5), weightRun(5, 10, 0), weightRun(1, 5000, 1).length])).toEqual([[90, 95, 100, 105], [5, 7.5, 10], [], 120]);
  expect(await page.evaluate(() => Object.keys(state.wtRungs).length)).toBe(0);                     // nothing is saved until Save
  await page.evaluate(() => [...document.querySelectorAll('.choice-backdrop')].pop().querySelector('[data-wl="save"]').click());
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

test('feat 595 — the weight list can copy another exercise: a hand-written list first, then logged weights; use or add', async ({ page }) => {
  const r = await page.evaluate(() => {
    const vs = [...VAR_INDEX.keys()].filter(u => exMode(u).mode === 'standard' && !isCardioVar(u)).slice(0, 4);
    const [me, listed, logged, few] = vs;
    state.wtRungs = { [listed]: [10, 22.5, 35, 47.5] };
    const sess = (sets) => ({ id: 's' + Math.random(), date: new Date().toISOString(), exercises: sets });
    state.sessions = [sess([{ varUuid: logged, subUuid: null, sets: [{ w: 50, r: 5 }, { w: 60, r: 5 }, { w: 70, r: 5 }] }, { varUuid: few, subUuid: null, sets: [{ w: 5, r: 5 }] }])];
    const src = weightListSources(me);
    let saved = null;
    openWeightListEditor([100, 110], [100], (l) => { saved = l; }, me);
    const sheet = [...document.querySelectorAll('.choice-backdrop')].pop(), q = s => sheet.querySelector(s);
    const options = [...q('#wl-src').options].map(o => o.textContent);
    const preview = q('#wl-src-preview').textContent;
    q('[data-wl="copy-add"]').click();                                   // add the hand-written list to mine
    const added = [...sheet.querySelectorAll('.wl-chip')].map(c => +c.dataset.wlDel);
    q('#wl-src').value = '1'; q('#wl-src').dispatchEvent(new Event('change'));
    q('[data-wl="copy-use"]').click();                                   // replace with the logged weights
    const used = [...sheet.querySelectorAll('.wl-chip')].map(c => +c.dataset.wlDel);
    const before = saved;
    q('[data-wl="save"]').click();
    const none = weightListSources(few).every(x => x.u !== few);
    let noVar = true; openWeightListEditor([1, 2], [], () => {}); noVar = ![...document.querySelectorAll('.choice-backdrop')].pop().querySelector('#wl-src');
    return { kinds: src.map(x => x.kind), first: src[0].u === listed, hasFew: src.some(x => x.u === few), options: options.length, preview, added, used, before, saved, none, noVar };
  });
  expect(r.kinds).toEqual(['list', 'logged']);          // the one-weight exercise is not offered
  expect(r.first).toBe(true);
  expect(r.hasFew).toBe(false);
  expect(r.options).toBe(2);
  expect(r.preview).toBe('10 · 22.5 · 35 · 47.5');
  expect(r.added).toEqual([10, 22.5, 35, 47.5, 100, 110]);
  expect(r.used).toEqual([50, 60, 70]);
  expect(r.before).toBe(null);                          // nothing saved until Save
  expect(r.saved).toEqual([50, 60, 70]);
  expect(r.none).toBe(true);                            // an exercise never offers itself
  expect(r.noVar).toBe(true);                           // without an exercise the row is not shown
});
