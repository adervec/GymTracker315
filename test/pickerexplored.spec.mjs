// feat 378 — the exercise picker can filter by explored / unexplored: a variation is "explored" once you've actually
// logged it (it's in buildTouchMap). Two pills (✓ Explored · ✨ New) toggle the filter; clicking the active one clears it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof filterVariations === 'function' && typeof renderModal === 'function'
    && typeof VAR_INDEX !== 'undefined' && typeof buildTouchMap === 'function', null, { timeout: 15000 });
});

test('feat 378 — explored / unexplored filters the picker by training history', async ({ page }) => {
  const r = await page.evaluate(() => {
    // a logged push variation (explored) + another push variation that's never been logged
    let logged = null, other = null;
    for (const [u, i] of VAR_INDEX) {
      if (i.family.mega !== 'push' || !varVisibleInPicker(i.family, i.variation)) continue;
      if (!logged) logged = u; else if (!other && u !== logged) { other = u; break; }
    }
    state.sessions = [{ id: 's', date: new Date().toISOString(), exercises: [{ varUuid: logged, subUuid: null, sets: [{ w: 100, r: 5 }] }] }];
    modalState.pickerMega = 'all'; modalState.pickerSub = 'all'; modalState.pickerEquip = 'all'; modalState.pickerSearch = ''; modalState.pickerFavOnly = false; modalState.planStepFilter = null;
    const uuids = () => { const s = new Set(); filterVariations().forEach(g => { g.variations.forEach(v => s.add(v.uuid)); (g.secondaryVars || []).forEach(x => s.add(x.v.uuid)); }); return s; };
    modalState.pickerExplored = 'all'; const all = uuids();
    modalState.pickerExplored = 'explored'; const explored = uuids();
    modalState.pickerExplored = 'unexplored'; const unexplored = uuids();
    modalState.pickerExplored = 'all';
    return {
      allHasLogged: all.has(logged), allHasOther: all.has(other),
      exploredSize: explored.size, exploredHasLogged: explored.has(logged),
      unexploredHasLogged: unexplored.has(logged), unexploredHasOther: unexplored.has(other),
    };
  });
  expect(r.allHasLogged).toBe(true);
  expect(r.allHasOther).toBe(true);             // both show with no filter
  expect(r.exploredSize).toBe(1);               // only the one trained variation
  expect(r.exploredHasLogged).toBe(true);
  expect(r.unexploredHasLogged).toBe(false);    // the trained one is excluded from "New"
  expect(r.unexploredHasOther).toBe(true);      // untrained ones show under "New"
});

test('feat 378 — the picker renders Explored / New pills that toggle (click active = clear)', async ({ page }) => {
  const r = await page.evaluate(() => {
    pending.varUuid = null; modalState.showPicker = true; modalState.open = true; modalState.supersetMode = false;
    renderModal();
    const hasEx = !!document.querySelector('.pill[data-explored="explored"]');
    const hasNew = !!document.querySelector('.pill[data-explored="unexplored"]');
    document.querySelector('.pill[data-explored="explored"]').click(); const m1 = modalState.pickerExplored;
    document.querySelector('.pill[data-explored="explored"]').click(); const m2 = modalState.pickerExplored; // toggle off
    document.querySelector('.pill[data-explored="unexplored"]').click(); const m3 = modalState.pickerExplored;
    const activeNew = !!document.querySelector('.pill[data-explored="unexplored"].active');
    modalState.pickerExplored = 'all';
    return { hasEx, hasNew, m1, m2, m3, activeNew };
  });
  expect(r.hasEx).toBe(true);
  expect(r.hasNew).toBe(true);
  expect(r.m1).toBe('explored');
  expect(r.m2).toBe('all');         // clicking the active pill clears it
  expect(r.m3).toBe('unexplored');
  expect(r.activeNew).toBe(true);   // …and the chosen pill renders active
});
