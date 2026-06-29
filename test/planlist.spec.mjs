// feat 147 — the plan picker is categorized (derived from each plan's muscle-mega mix), searchable
// (name/theme), and filterable (category + length chips), with plans grouped under category headers.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.planCategory === 'function'
    && typeof window.renderPlansList === 'function'
    && typeof window.openPlansOverlay === 'function', null, { timeout: 15000 });
});

// pick a standard-mode variation for each muscle mega
const megaVars = (page) => page.evaluate(() => {
  const by = (m) => { for (const [u, info] of VAR_INDEX) if (info.family.mega === m && exMode(u).mode === 'standard') return u; return null; };
  return { push: by('push'), pull: by('pull'), lower: by('lower') };
});

test('planCategory derives Push / Legs / Upper / Full Body from the step mix', async ({ page }) => {
  const { push, pull, lower } = await megaVars(page);
  const r = await page.evaluate(({ push, pull, lower }) => {
    const step = (u) => ({ id: 's', sets: 3, options: [{ type: 'variation', uuid: u }] });
    const cat = (steps) => planCategory({ id: 'p', name: 'p', steps });
    return {
      push: cat([step(push), step(push)]),
      legs: cat([step(lower), step(lower)]),
      upper: cat([step(push), step(pull)]),
      full: cat([step(push), step(pull), step(lower)]),
    };
  }, { push, pull, lower });
  expect(r.push).toBe('Push');
  expect(r.legs).toBe('Legs');
  expect(r.upper).toBe('Upper');
  expect(r.full).toBe('Full Body');
});

async function seedPlans(page) {
  const { push, pull, lower } = await megaVars(page);
  await page.evaluate(({ push, pull, lower }) => {
    const step = (u, sets) => ({ id: 's' + Math.random(), sets: sets || 3, options: [{ type: 'variation', uuid: u }] });
    state.plans = [
      { id: 'p1', name: 'Push Power', desc: 'heavy pressing', steps: [step(push), step(push), step(push)] },   // Push
      { id: 'p2', name: 'Bench Blast', desc: 'chest focus', steps: [step(push), step(push)] },                  // Push
      { id: 'p3', name: 'Leg Day Quads', desc: 'squats and more', steps: [step(lower), step(lower), step(lower)] }, // Legs
      // Full Body, made "long" with many sets so its estimate is >= 90 min
      { id: 'p4', name: 'Marathon Total', desc: 'everything', steps: [step(push, 6), step(pull, 6), step(lower, 6), step(push, 6), step(pull, 6), step(lower, 6)] },
    ];
    state.seededPlanIds = ['p1', 'p2', 'p3', 'p4']; // suppress seed-plan injection so only ours show
  }, { push, pull, lower });
}

test('the picker renders a search box, category + length chips, and grouped headers', async ({ page }) => {
  await seedPlans(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    const body = document.getElementById('trk-main');
    const cats = [...body.querySelectorAll('.plan-cat-head')].map(h => h.firstChild.textContent.trim());
    return {
      hasSearch: !!body.querySelector('#plans-search'),
      catChips: [...body.querySelectorAll('[data-plan-cat]')].map(c => c.dataset.planCat),
      lenSlider: !!body.querySelector('#len-slider') && !!body.querySelector('#len-min') && !!body.querySelector('#len-max'),
      cats,
      rows: body.querySelectorAll('.plan-row').length,
    };
  });
  expect(r.hasSearch).toBe(true);
  expect(r.catChips).toContain('all');
  expect(r.catChips).toContain('Push');
  expect(r.catChips).toContain('Legs');
  expect(r.catChips).toContain('Full Body');
  expect(r.lenSlider).toBe(true);   // feat 374 — the length filter is now a 2-thumb range slider
  expect(r.cats).toContain('Push'); // grouped headers
  expect(r.cats).toContain('Legs');
  expect(r.rows).toBe(4); // all plans shown initially
});

test('search narrows the list by name/theme', async ({ page }) => {
  await seedPlans(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    _plansSearch = 'bench'; renderPlansOverlay(); // matches "Bench Blast"
    const body = document.getElementById('trk-main');
    const names = [...body.querySelectorAll('.plan-row-name')].map(n => n.textContent);
    return { count: names.length, names };
  });
  expect(r.count).toBe(1);
  expect(r.names[0]).toBe('Bench Blast');
});

test('a category chip filters to that category only', async ({ page }) => {
  await seedPlans(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    const body = document.getElementById('trk-main');
    body.querySelector('[data-plan-cat="Push"]').click(); // filter to Push
    const body2 = document.getElementById('trk-main');
    return {
      filter: [..._plansCatFilter],
      rows: body2.querySelectorAll('.plan-row').length,
      heads: [...body2.querySelectorAll('.plan-cat-head')].map(h => h.firstChild.textContent.trim()),
      note: body2.querySelector('.plan-filter-note')?.textContent,
    };
  });
  expect(r.filter).toEqual(['Push']);     // feat 373 — multi-select set holds the picked category
  expect(r.rows).toBe(2);                 // the two Push plans
  expect(r.heads).toEqual(['Push']);      // only the Push group
  expect(r.note).toContain('2 of 4');
});

async function seedManyPlans(page, n) {
  const { push } = await megaVars(page);
  await page.evaluate(({ push, n }) => {
    const step = (u) => ({ id: 's' + Math.random(), sets: 3, options: [{ type: 'variation', uuid: u }] });
    state.plans = [];
    for (let i = 1; i <= n; i++) state.plans.push({ id: 'mp' + i, name: 'Plan ' + String(i).padStart(2, '0'), desc: 'pressing', steps: [step(push), step(push)] });
    state.seededPlanIds = state.plans.map(p => p.id); // suppress seed injection so only ours show
  }, { push, n });
}

test('feat 240 — a long plan list paginates at 12/page with working prev/next', async ({ page }) => {
  await seedManyPlans(page, 30);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    const body = document.getElementById('trk-main');
    const page1 = body.querySelectorAll('.plan-row').length;
    const ind1 = body.querySelector('.plan-page-ind')?.textContent || '';
    const prevDisabled1 = body.querySelector('[data-plan-page="prev"]')?.disabled;
    body.querySelector('[data-plan-page="next"]').click();            // → page 2
    const b2 = document.getElementById('trk-main');
    const page2 = b2.querySelectorAll('.plan-row').length;
    const ind2 = b2.querySelector('.plan-page-ind')?.textContent || '';
    b2.querySelector('[data-plan-page="next"]').click();              // → page 3 (last)
    const b3 = document.getElementById('trk-main');
    const page3 = b3.querySelectorAll('.plan-row').length;
    const nextDisabled3 = b3.querySelector('[data-plan-page="next"]')?.disabled;
    return { page1, ind1, prevDisabled1, page2, ind2, page3, nextDisabled3 };
  });
  expect(r.page1).toBe(12);
  expect(r.ind1).toContain('Page 1 / 3');
  expect(r.ind1).toContain('30 plans');
  expect(r.prevDisabled1).toBe(true);   // can't page back from the first page
  expect(r.page2).toBe(12);
  expect(r.ind2).toContain('Page 2 / 3');
  expect(r.page3).toBe(6);              // 30 = 12 + 12 + 6
  expect(r.nextDisabled3).toBe(true);   // …and can't page past the last
});

test('feat 240 — changing the search/filter resets to page 1', async ({ page }) => {
  await seedManyPlans(page, 30);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    document.getElementById('trk-main').querySelector('[data-plan-page="next"]').click(); // go to page 2
    const onPage2 = (document.getElementById('trk-main').querySelector('.plan-page-ind')?.textContent || '').includes('Page 2');
    const inp = document.getElementById('trk-main').querySelector('#plans-search');
    inp.value = 'Plan'; inp.dispatchEvent(new Event('input', { bubbles: true })); // still matches all → 3 pages, but resets
    const ind = document.getElementById('trk-main').querySelector('.plan-page-ind')?.textContent || '';
    return { onPage2, ind };
  });
  expect(r.onPage2).toBe(true);
  expect(r.ind).toContain('Page 1 / 3'); // the search reset the page index
});

test('feat 374 — the length range slider selects by duration, and Clear resets everything', async ({ page }) => {
  await seedPlans(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    _plansLenRange = { min: 90, max: PLAN_LEN_MAX }; renderPlansOverlay(); // ≥90 min → only the long Full Body plan
    const longRows = document.getElementById('trk-main').querySelectorAll('.plan-row').length;
    // a filter that matches nothing -> empty state with a Clear button
    _plansCatFilter = new Set(['Legs']); renderPlansOverlay(); // Legs + ≥90 = none
    const empty = !!document.getElementById('trk-main').querySelector('.plan-list-empty');
    document.getElementById('plan-clear-filters').click();
    return { longRows, empty, cat: [..._plansCatFilter], len: _plansLenRange, search: _plansSearch, rowsAfter: document.getElementById('trk-main').querySelectorAll('.plan-row').length };
  });
  expect(r.longRows).toBe(1);       // only the marathon plan is ≥90 min
  expect(r.empty).toBe(true);       // Legs ∩ ≥90 = nothing
  expect(r.cat).toEqual([]);        // Clear reset the category set
  expect(r.len).toEqual({ min: 5, max: 120 }); // …and the length range
  expect(r.search).toBe('');
  expect(r.rowsAfter).toBe(4);
});

test('feat 375 — "Plans of the Day" list newest date first', async ({ page }) => {
  const { push } = await megaVars(page);
  const order = await page.evaluate(({ push }) => {
    const step = (u) => ({ id: 's' + Math.random(), sets: 3, options: [{ type: 'variation', uuid: u }] });
    state.plans = [
      { id: 'd1', name: 'POD Mon', source: 'daily', dailyDate: '2026-06-22', steps: [step(push)] },
      { id: 'd3', name: 'POD Wed', source: 'daily', dailyDate: '2026-06-24', steps: [step(push)] },
      { id: 'd2', name: 'POD Tue', source: 'daily', dailyDate: '2026-06-23', steps: [step(push)] },
    ];
    state.seededPlanIds = state.plans.map(p => p.id);
    openPlansOverlay();
    return [...document.getElementById('trk-main').querySelectorAll('.plan-row-name')].map(n => (n.textContent.match(/POD \w+/) || [''])[0]);
  }, { push });
  expect(order.slice(0, 3)).toEqual(['POD Wed', 'POD Tue', 'POD Mon']); // 24 → 23 → 22, descending
});

test('feat 373 — the category filter is multi-select (two categories show both groups)', async ({ page }) => {
  await seedPlans(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    const body = document.getElementById('trk-main');
    body.querySelector('[data-plan-cat="Push"]').click();
    document.getElementById('trk-main').querySelector('[data-plan-cat="Legs"]').click(); // add Legs too
    const heads = [...document.getElementById('trk-main').querySelectorAll('.plan-cat-head')].map(h => h.firstChild.textContent.trim());
    const sel = [..._plansCatFilter];
    document.getElementById('trk-main').querySelector('[data-plan-cat="Push"]').click(); // toggle Push back off
    return { heads, sel, afterToggle: [..._plansCatFilter] };
  });
  expect(r.sel.sort()).toEqual(['Legs', 'Push']);     // both selected
  expect(r.heads).toContain('Push');
  expect(r.heads).toContain('Legs');
  expect(r.afterToggle).toEqual(['Legs']);            // clicking an active chip removes it
});
