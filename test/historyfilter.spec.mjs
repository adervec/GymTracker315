// feat 102 — History filtering: time window + body part / movement / variation + text search, and
// the all-time quick link from a variation's detail. Tests the pure aggregation/option helpers.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.historyAggregate === 'function'
    && typeof window.historyCutoff === 'function'
    && typeof window.historyFilterOptions === 'function', null, { timeout: 15000 });
});

// Two standard-mode exercises in different movements AND different body parts, with one old (400d)
// and two recent sessions, so the time + cascade filters are exercisable.
async function seed(page) {
  return await page.evaluate(() => {
    let a = null, b = null;
    for (const [uuid, info] of VAR_INDEX) {
      if (exMode(uuid).mode !== 'standard') continue;
      if (!a) { a = { uuid, fam: info.family.id, bp: info.bp, title: info.variation.title }; continue; }
      if (info.family.id !== a.fam && info.bp !== a.bp) { b = { uuid, fam: info.family.id, bp: info.bp, title: info.variation.title }; break; }
    }
    state.historyFilter = { range: 'all', bp: '', family: '', varKey: '', q: '' };
    state.deletedSessions = [];
    const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
    state.sessions = [
      { id: 'old',  date: iso(400), exercises: [{ varUuid: a.uuid, sets: [{ w: 100, r: 5 }] }] },
      { id: 'recA', date: iso(3),   exercises: [{ varUuid: a.uuid, sets: [{ w: 105, r: 5 }] }] },
      { id: 'recB', date: iso(2),   exercises: [{ varUuid: b.uuid, sets: [{ w: 50, r: 8 }, { w: 55, r: 8 }] }] },
    ];
    return { a, b };
  });
}

test('cutoff: all-time is 0, a window is a positive timestamp', async ({ page }) => {
  const r = await page.evaluate(() => ({ all: historyCutoff('all'), week: historyCutoff('week') }));
  expect(r.all).toBe(0);
  expect(r.week).toBeGreaterThan(0);
});

test('time window narrows the aggregate (old session drops out past a week)', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    state.historyFilter.range = 'all';
    const all = historyAggregate();
    state.historyFilter.range = 'week';
    const wk = historyAggregate();
    return {
      allKeys: Object.keys(all.stats).length, allSets: all.setCount, allSessions: all.sessionCount,
      wkKeys: Object.keys(wk.stats).length, wkSets: wk.setCount, wkSessions: wk.sessionCount,
    };
  });
  expect(r.allKeys).toBe(2);
  expect(r.allSets).toBe(4);   // 1 old + 1 recentA + 2 recentB
  expect(r.allSessions).toBe(3);
  expect(r.wkKeys).toBe(2);
  expect(r.wkSets).toBe(3);    // old (400d) excluded
  expect(r.wkSessions).toBe(2);
});

test('movement (family) filter keeps only that movement', async ({ page }) => {
  const { a } = await seed(page);
  const r = await page.evaluate((famA) => {
    state.historyFilter.family = famA;
    const agg = historyAggregate();
    return Object.values(agg.stats).map((s) => s.varUuid);
  }, a.fam);
  expect(r).toEqual([a.uuid]);
});

test('variation filter narrows to a single tracking key', async ({ page }) => {
  const { a } = await seed(page);
  const r = await page.evaluate((uuidA) => {
    state.historyFilter.varKey = trackingKey(uuidA, null);
    const agg = historyAggregate();
    const keys = Object.values(agg.stats).map((s) => s.varUuid);
    return { keys, sets: agg.setCount };
  }, a.uuid);
  expect(r.keys).toEqual([a.uuid]);
  expect(r.sets).toBe(2); // old + recent, both for A (range still all)
});

test('text search matches by exercise name', async ({ page }) => {
  const { a, b } = await seed(page);
  const r = await page.evaluate((titleA) => {
    state.historyFilter.q = titleA;
    return Object.values(historyAggregate().stats).map((s) => s.varUuid);
  }, a.title);
  expect(r).toContain(a.uuid);
  expect(r).not.toContain(b.uuid);
});

test('options cascade: choosing a body part narrows the movement list', async ({ page }) => {
  const { a, b } = await seed(page);
  const r = await page.evaluate((bpA) => {
    state.historyFilter.bp = bpA;
    const o = historyFilterOptions();
    return { fams: [...o.fams.keys()] };
  }, a.bp);
  expect(r.fams).toContain(a.fam);
  expect(r.fams).not.toContain(b.fam); // b is a different body part -> filtered out
});

test('the list view renders the filter bar and exercise cards', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    historyView = 'list'; historyKey = null;
    const div = document.createElement('div'); document.body.appendChild(div);
    renderHistory(div);
    return {
      hasRange: !!div.querySelector('#hist-range'),
      hasFamily: !!div.querySelector('#hist-family'),
      hasVar: !!div.querySelector('#hist-var'),
      cards: div.querySelectorAll('.ex-summary').length,
      hasSummary: !!div.querySelector('.hist-summary'),
    };
  });
  expect(r.hasRange && r.hasFamily && r.hasVar && r.hasSummary).toBe(true);
  expect(r.cards).toBe(2);
});

test('the detail view shows the all-time link when a time window is active', async ({ page }) => {
  const { a } = await seed(page);
  const r = await page.evaluate((uuidA) => {
    state.historyFilter.range = 'week';
    historyView = 'detail'; historyKey = { varUuid: uuidA, subUuid: null };
    const div = document.createElement('div'); document.body.appendChild(div);
    renderHistory(div);
    const link = div.querySelector('#trk-all-time');
    const before = state.historyFilter.range;
    if (link) link.click();
    return { hadLink: !!link, rangeBefore: before, rangeAfter: state.historyFilter.range };
  }, a.uuid);
  expect(r.hadLink).toBe(true);
  expect(r.rangeBefore).toBe('week');
  expect(r.rangeAfter).toBe('all'); // clicking the link drops the window
});
