// feat 337 — the Fitness Focus page links to an Archetypes guide that explains which focus-area combo embodies
// each archetype, and flags the one the user's own training currently matches.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderArchetypesGuide === 'function' && typeof archetypeFocusMix === 'function'
    && typeof renderArchetypePage === 'function' && typeof navTo === 'function', null, { timeout: 15000 });
});

const benchVar = (page) => page.evaluate(() => FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid);
const mkSessions = (bench) => `state.sessions = [2,5,9,12,16,20].map(function(da){ var d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-da); var iso=d.toISOString(); return { id:'s'+da, date:iso, updatedAt:iso, endedAt:iso, exercises:[{ varUuid:'${bench}', subUuid:null, sets:[{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3},{w:100,r:3}] }] }; });`;

test('archetypeFocusMix gives 6 dimension weights + at least one defining dim', async ({ page }) => {
  const r = await page.evaluate(() => {
    const pl = ARCHETYPES.find(a => a.id === 'powerlifter');
    const m = archetypeFocusMix(pl);
    return { pairs: m.pairs.length, defining: m.defining.map(p => p.k), top: m.defining[0] && m.defining[0].k };
  });
  expect(r.pairs).toBe(6);
  expect(r.defining.length).toBeGreaterThanOrEqual(1);
  expect(r.top).toBe('strength');     // a powerlifter's defining dimension is max strength
});

test('the guide renders a card per archetype with its defining mix', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];                                   // no profile yet — the guide still explains every archetype
    const el = document.createElement('div');
    renderArchetypesGuide(el);
    return {
      title: /Fitness Archetypes/.test(el.innerHTML),
      cards: (el.innerHTML.match(/class="card arch-guide/g) || []).length,
      total: ARCHETYPES.length,
      defLines: (el.innerHTML.match(/Defining mix/g) || []).length,
      noYou: !/arch-you/.test(el.innerHTML),              // nothing flagged without a ready profile
    };
  });
  expect(r.title).toBe(true);
  expect(r.cards).toBe(r.total);
  expect(r.defLines).toBe(r.total);
  expect(r.noYou).toBe(true);
});

test('the guide flags the user’s current archetype once the profile is ready', async ({ page }) => {
  const bench = await benchVar(page);
  const r = await page.evaluate((mk) => {
    eval(mk);                                              // strength-dominant history → powerlifter
    const mine = fitnessArchetype(fitnessFocus(112).pct).primary;
    const el = document.createElement('div');
    renderArchetypesGuide(el);
    return { mineName: mine.name, hasYou: /arch-you/.test(el.innerHTML), hasMine: /arch-mine/.test(el.innerHTML), html: el.innerHTML };
  }, mkSessions(bench));
  expect(r.hasYou).toBe(true);
  expect(r.hasMine).toBe(true);
  expect(r.html).toContain(r.mineName);                   // the flagged card is the matched archetype
});

test('the Fitness Focus page links to the archetypes guide; the route renders', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [];
    const el = document.createElement('div'); renderArchetypePage(el);
    const linksOut = /navTo\('archetypes'\)/.test(el.innerHTML);
    navTo('archetypes');
    const m = document.getElementById('trk-main');
    return {
      linksOut,
      route: !!(PAGES.archetypes && PAGES.archetypes.parent === 'focus' && PAGES.archetypes.kind === 'leaf'),
      page: currentPage,
      rendered: /Fitness Archetypes/.test(m.innerHTML),
    };
  });
  expect(r.linksOut).toBe(true);
  expect(r.route).toBe(true);
  expect(r.page).toBe('archetypes');
  expect(r.rendered).toBe(true);
});
