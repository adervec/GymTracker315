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
      lenChips: [...body.querySelectorAll('[data-plan-len]')].map(c => c.dataset.planLen),
      cats,
      rows: body.querySelectorAll('.plan-row').length,
    };
  });
  expect(r.hasSearch).toBe(true);
  expect(r.catChips).toContain('all');
  expect(r.catChips).toContain('Push');
  expect(r.catChips).toContain('Legs');
  expect(r.catChips).toContain('Full Body');
  expect(r.lenChips).toEqual(['all', 'quick', 'standard', 'long']);
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
      filter: _plansCatFilter,
      rows: body2.querySelectorAll('.plan-row').length,
      heads: [...body2.querySelectorAll('.plan-cat-head')].map(h => h.firstChild.textContent.trim()),
      note: body2.querySelector('.plan-filter-note')?.textContent,
    };
  });
  expect(r.filter).toBe('Push');
  expect(r.rows).toBe(2);                 // the two Push plans
  expect(r.heads).toEqual(['Push']);      // only the Push group
  expect(r.note).toContain('2 of 4');
});

test('the length filter selects by duration bucket, and Clear resets everything', async ({ page }) => {
  await seedPlans(page);
  const r = await page.evaluate(() => {
    openPlansOverlay();
    _plansLenFilter = 'long'; renderPlansOverlay(); // only the long Full Body plan
    const longRows = document.getElementById('trk-main').querySelectorAll('.plan-row').length;
    // a filter that matches nothing -> empty state with a Clear button
    _plansCatFilter = 'Legs'; renderPlansOverlay(); // Legs + long = none
    const empty = !!document.getElementById('trk-main').querySelector('.plan-list-empty');
    document.getElementById('plan-clear-filters').click();
    return { longRows, empty, cat: _plansCatFilter, len: _plansLenFilter, search: _plansSearch, rowsAfter: document.getElementById('trk-main').querySelectorAll('.plan-row').length };
  });
  expect(r.longRows).toBe(1);       // only the marathon plan is "long"
  expect(r.empty).toBe(true);       // Legs ∩ long = nothing
  expect(r.cat).toBe('all');        // Clear reset the filters
  expect(r.len).toBe('all');
  expect(r.search).toBe('');
  expect(r.rowsAfter).toBe(4);
});
