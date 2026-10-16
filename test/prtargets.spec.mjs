// feat 477 — the log sheet's reference row earns its space. Two new PR-hunting targets (the weight most
// vulnerable to a weight PR, and the weight × reps most likely to take the overall e1RM record), satisfied
// indicators once this session has matched a target, a session PR count on the All-weights button, compact
// baseline chips, and an up/down blurb that collapses itself once you have started working.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exPrTargets === 'function' && typeof exTargetProgress === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// A history with distinct weights so every target has somewhere different to land.
const seed = page => page.evaluate(() => {
  let v = null; for (const [u] of VAR_INDEX) if (VAR_INDEX.get(u).variation.id === 'bb-flat-bench') { v = u; break; }
  const mk = (d, sets) => ({ date: new Date(Date.now() - d * 86400000).toISOString(),
    exercises: [{ varUuid: v, subUuid: null, sets: sets.map(([w, r]) => ({ w, r })), topSet: { w: sets[0][0], r: sets[0][1] } }] });
  state.sessions = [mk(4, [[166, 3], [155, 6], [116, 10]]), mk(11, [[186, 3], [145, 5], [116, 9]]), mk(18, [[155, 8], [125, 10]])];
  state.unit = 'lb'; state.readonly = false;
  pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true;
  renderModal();
  return v;
});

test('feat 477 — the two PR targets pick real, distinct weights and never collide with the classics', async ({ page }) => {
  const v = await seed(page);
  const r = await page.evaluate((v) => {
    const R = exWeightRows(v, null);
    const free = exPrTargets(v, null);
    const B = exBestSets(v, null);
    const claimed = [B.prevTop, B.bestE1, B.maxW, B.maxR].filter(x => x && x.w > 0).map(x => x.w);
    const avoided = exPrTargets(v, null, claimed);
    const byW = Object.fromEntries(R.rows.map(x => [x.w, x]));
    return {
      // the vulnerable pick is the weight with the highest odds of beating its OWN record...
      vulnW: free.vuln.w, bestPw: Math.max(...R.rows.map(x => x.pw)), vulnPw: byW[free.vuln.w].pw,
      // ...at one more rep than that record
      vulnR: free.vuln.r, recordR: byW[free.vuln.w].best.r,
      // the e1RM pick asks for enough reps to actually clear the all-time best
      e1W: free.e1.w, e1R: free.e1.r, allBest: R.allBest,
      e1WouldBeat: estimated1RM(free.e1.w, free.e1.r) > R.allBest,
      e1OneLess: estimated1RM(free.e1.w, free.e1.r - 1) <= R.allBest,
      // with the classics claimed, the picks move rather than duplicating a tile
      claimed, avoidedVuln: avoided.vuln && avoided.vuln.w, avoidedE1: avoided.e1 && avoided.e1.w,
      distinct: avoided.vuln && avoided.e1 ? avoided.vuln.w !== avoided.e1.w : true,
      // a variation with no history offers nothing rather than a fake target
      empty: exPrTargets('nope', null),
    };
  }, v);
  expect(r.vulnPw, 'the vulnerable pick IS the highest-odds weight').toBe(r.bestPw);
  expect(r.vulnR, 'one more rep than its own record').toBe(r.recordR + 1);
  expect(r.e1WouldBeat, 'the e1RM target would actually take the record').toBe(true);
  expect(r.e1OneLess, 'and it asks for no more reps than needed').toBe(true);
  expect(r.claimed).not.toContain(r.avoidedVuln);
  expect(r.claimed).not.toContain(r.avoidedE1);
  expect(r.distinct, 'two PR tiles must be two different suggestions').toBe(true);
  expect(r.empty).toEqual({ vuln: null, e1: null });
});

test('feat 477 — a target flips to satisfied once this session matches or beats it', async ({ page }) => {
  const v = await seed(page);
  const r = await page.evaluate((v) => {
    const before = [...document.querySelectorAll('.target-btn')].map(b => b.classList.contains('hit'));
    // feat 494 — the prev-top tile now asks for 155×7 (one more rep than the 155×6 record set);
    // 166×7 beats that ask on both weight and reps
    commitSetField(0, 'w', 166); commitSetField(0, 'r', 7);
    const tiles = [...document.querySelectorAll('.target-btn')].map(b => ({ txt: b.textContent, hit: b.classList.contains('hit') }));
    return { before, tiles,
      exact: exTargetHit(v, null, 166, 6),
      beaten: exTargetHit(v, null, 155, 6),      // heavier AND same reps
      notReps: exTargetHit(v, null, 166, 9),     // right weight, not enough reps
      notWeight: exTargetHit(v, null, 200, 1),   // never touched that weight
    };
  }, v);
  expect(r.before.some(Boolean), 'nothing is satisfied before a set is logged').toBe(false);
  expect(r.tiles.some(t => t.hit), 'the matched target is marked').toBe(true);
  expect(r.tiles.find(t => /Prev top/.test(t.txt)).hit).toBe(true);
  expect(r.exact).toBe(true);
  expect(r.beaten, 'beating a target satisfies it').toBe(true);
  expect(r.notReps, 'right weight but short on reps is not satisfied').toBe(false);
  expect(r.notWeight).toBe(false);
});

/* feat 504 replaced feat 477's weight-based PR count: it counted distinct WEIGHTS beating their own record,
   so climbing the Max-wt ladder minted a fresh PR at every rung. The badge now counts TILES BEATEN, one
   apiece however many times you beat them, so one easy button cannot inflate it. */
test('feat 504 — the PR badge counts tiles beaten, never rungs climbed', async ({ page }) => {
  const v = await seed(page);
  const r = await page.evaluate(() => {
    const badgeNum = () => { const t = (document.querySelector('.wt-pr-badge') || {}).textContent || ''; const m = t.match(/(\d+)\s*PR/); return m ? +m[1] : 0; };
    const snap = () => {
      const hit = [...document.querySelectorAll('.target-btn.hit')];
      const rungs = hit.reduce((n, b) => n + (+b.dataset.n || 0), 0);
      return { prs: badgeNum(), tilesHit: hit.length, rungs,
        streaks: hit.map(b => +b.dataset.n).filter(n => n > 1).length };
    };
    const none = badgeNum();
    commitSetField(0, 'w', 166); commitSetField(0, 'r', 7);
    const first = snap();
    // keep climbing the same weight: many more rungs cleared, but no tile can be counted twice
    pending.sets.push({ w: 166, r: 14 }); renderModal();
    const milked = snap();
    return { none, first, milked };
  }, v);
  expect(r.none, 'no badge before anything is logged').toBe(0);
  // the invariant: the PR number is exactly the number of tiles beaten, never the rungs climbed
  expect(r.first.prs).toBe(r.first.tilesHit);
  expect(r.milked.prs).toBe(r.milked.tilesHit);
  expect(r.milked.streaks, 'milking builds streaks').toBeGreaterThan(0);
  expect(r.milked.rungs, 'and many more rungs than tiles').toBeGreaterThan(r.milked.tilesHit);
  expect(r.milked.prs, 'yet the PR count stays capped at one per tile').toBeLessThan(r.milked.rungs);
});

test('feat 477 — every target tile fits, in at most two rows', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const row = document.querySelector('.target-row');
    const btns = [...document.querySelectorAll('.target-btn')];
    return {
      n: btns.length,
      rows: new Set(btns.map(b => Math.round(b.getBoundingClientRect().top))).size,
      overflows: btns.filter(b => b.getBoundingClientRect().right > row.getBoundingClientRect().right + 1).length,
      labelsClipped: [...document.querySelectorAll('.target-btn .tb-lbl')].filter(e => e.scrollWidth > e.clientWidth + 1).length,
    };
  });
  expect(r.n, 'the row carries several suggestions').toBeGreaterThan(3);
  expect(r.rows, 'two rows maximum').toBeLessThanOrEqual(2);
  expect(r.overflows, 'no tile slides off the card').toBe(0);
  expect(r.labelsClipped, 'and none of the labels are cut').toBe(0);
});

test('feat 477 — the up/down blurb collapses itself once set 1 is done, and a manual choice wins', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const el = () => document.getElementById('trk-suggestion');
    const open = () => el() && !el().classList.contains('collapsed');
    const out = { present: !!el(), startsOpen: open() };
    commitSetField(0, 'w', 166);
    out.stillOpenMidSet = open();                       // a half-entered set is not "done"
    commitSetField(0, 'r', 6);
    out.autoCollapsed = !open();                        // set 1 complete → out of the way
    out.peekShown = !!el().querySelector('.suggestion-peek').textContent.trim();
    document.getElementById('trk-suggestion-toggle').click();
    out.reopened = open();
    // once reopened by hand it must stay open — the auto-collapse cannot fight the user
    pending.sets.push({ w: 155, r: 8 }); renderModal();
    suggestionAutoCollapse();
    out.staysOpen = open();
    // a fresh sheet starts over
    suggestionResetForSheet(); renderModal();
    out.freshSheetOpen = open();
    return out;
  });
  expect(r.present).toBe(true);
  expect(r.startsOpen, 'it is worth reading once').toBe(true);
  expect(r.stillOpenMidSet, 'a weight with no reps is not a completed set').toBe(true);
  expect(r.autoCollapsed, 'by set 1 you are working, not reading').toBe(true);
  expect(r.peekShown, 'collapsed still shows a one-line peek').toBe(true);
  expect(r.reopened).toBe(true);
  expect(r.staysOpen, 'a manual open sticks for the rest of the sheet').toBe(true);
  expect(r.freshSheetOpen, 'a new sheet starts open again').toBe(true);
});

test('feat 477 — the baseline chips got compact without losing what they say', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    pending.sets[0] = { w: 133, r: '' };   // a weight with no baseline → the lighter/heavier chips appear
    renderNeighborHints();
    const chips = [...document.querySelectorAll('.neighbor-hint')];
    return {
      n: chips.length,
      sameRow: new Set(chips.map(c => Math.round(c.getBoundingClientRect().top))).size,
      tallest: Math.max(...chips.map(c => Math.round(c.getBoundingClientRect().height))),
      keepsWeight: chips.every(c => !!c.querySelector('.neighbor-hint-weight').textContent.trim()),
      keepsReps: chips.every(c => /rep/.test(c.querySelector('.neighbor-hint-reps').textContent)),
    };
  });
  expect(r.n, 'lighter + heavier both offered').toBeGreaterThanOrEqual(2);
  expect(r.sameRow, 'side by side, not stacked blocks').toBe(1);
  expect(r.tallest, 'a chip, not a card').toBeLessThan(70);
  expect(r.keepsWeight).toBe(true);
  expect(r.keepsReps).toBe(true);
});

test('feat 478 — the targets section collapses, keeps its score in the header, and folds when all are hit', async ({ page }) => {
  const v = await seed(page);
  const r = await page.evaluate((v) => {
    const sec = () => document.getElementById('trk-targets');
    const open = () => sec() && !sec().classList.contains('collapsed');
    const out = { present: !!sec(), startsOpen: open(),
      // both the tiles and the All-weights button live inside the collapsible body
      bodyHasTiles: !!sec().querySelector('.targets-body .target-row'),
      bodyHasAllWeights: !!sec().querySelector('.targets-body #trk-wt-expand') };

    // hit every target the row is offering
    const targets = [...document.querySelectorAll('.target-btn b')].map(b => {
      const [w, rr] = b.textContent.split('×').map(Number); return { w, r: rr };
    });
    out.n = targets.length;
    pending.sets = targets.map(t => ({ w: t.w, r: t.r }));
    renderModal();
    out.allHit = [...document.querySelectorAll('.target-btn')].every(b => b.classList.contains('hit'));
    out.countText = sec().querySelector('.targets-count').textContent.trim();
    out.countAllClass = sec().querySelector('.targets-count').classList.contains('all');

    // the auto-collapse fires off the live-update path
    out.openBeforeAuto = open();
    targetsAutoCollapse();
    out.autoCollapsed = !open();
    // collapsed, the header still reports the score — nothing is hidden that mattered
    out.headerVisible = sec().querySelector('.targets-head').offsetHeight > 0;
    // collapsed, the header picks up the PR badge the hidden button was carrying
    out.headerBadge = (sec().querySelector('.targets-head .wt-pr-badge') || {}).textContent || null;
    out.scoreStillShown = sec().querySelector('.targets-count').textContent.trim();
    out.bodyHidden = getComputedStyle(sec().querySelector('.targets-body')).display === 'none';

    // manual reopen pins it
    document.getElementById('trk-targets-toggle').click();
    out.reopened = open();
    targetsAutoCollapse();
    out.staysOpen = open();

    targetsResetForSheet(); renderModal();
    out.freshSheetOpen = open();
    return out;
  }, v);
  expect(r.present).toBe(true);
  expect(r.startsOpen).toBe(true);
  expect(r.bodyHasTiles, 'the tiles are inside the collapsible body').toBe(true);
  expect(r.bodyHasAllWeights, 'and so is the All-weights button').toBe(true);
  expect(r.n).toBeGreaterThan(2);
  expect(r.allHit).toBe(true);
  expect(r.countText).toBe(r.n + '/' + r.n + ' hit');
  expect(r.countAllClass, 'a full score reads differently').toBe(true);
  expect(r.openBeforeAuto, 'nothing collapses until the auto-pass runs').toBe(true);
  expect(r.autoCollapsed, 'nothing left to aim at — give the room to the sets').toBe(true);
  expect(r.headerVisible, 'the header stays').toBe(true);
  expect(r.headerBadge, 'and picks up the PR count from the hidden button').toMatch(/PR/);
  expect(r.scoreStillShown).toBe(r.n + '/' + r.n + ' hit');
  expect(r.bodyHidden).toBe(true);
  expect(r.reopened).toBe(true);
  expect(r.staysOpen, 'a manual open sticks').toBe(true);
  expect(r.freshSheetOpen).toBe(true);
});

test('feat 478 — a partially-hit section stays open', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(() => {
    const sec = () => document.getElementById('trk-targets');
    const first = document.querySelector('.target-btn b').textContent.split('×').map(Number);
    pending.sets = [{ w: first[0], r: first[1] }];
    renderModal();
    const hits = [...document.querySelectorAll('.target-btn')].filter(b => b.classList.contains('hit')).length;
    const total = document.querySelectorAll('.target-btn').length;
    targetsAutoCollapse();
    return { hits, total, stillOpen: !sec().classList.contains('collapsed'),
      count: sec().querySelector('.targets-count').textContent.trim(),
      allClass: sec().querySelector('.targets-count').classList.contains('all') };
  });
  expect(r.hits).toBeGreaterThan(0);
  expect(r.hits).toBeLessThan(r.total);
  expect(r.stillOpen, 'targets remain — keep them on screen').toBe(true);
  expect(r.count).toBe(r.hits + '/' + r.total + ' hit');
  expect(r.allClass).toBe(false);
});

/* feat 501 — the e1RM-path tile solved Epley for reps and printed whatever fell out, so a light candidate
   weight asked for a set nobody does ("when is the last time you saw a guy do a 423 rep set"). Candidates are
   now restricted to weights whose ask lands within E1_PATH_MAX_REPS; if none qualify there is no tile. */
test('feat 501 — no e1RM target ever asks for an inhuman rep count', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v = null; for (const [u] of VAR_INDEX) if (VAR_INDEX.get(u).variation.id === 'bb-flat-bench') { v = u; break; }
    state.unit = 'kg';
    // 200×3 (e1RM 220) and a light 50kg day. Beating 220 at 50kg needs 103 reps; at 200kg it needs 4.
    state.sessions = [{ date: new Date(Date.now() - 3 * 86400000).toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 200, r: 3 }, { w: 50, r: 10 }], topSet: { w: 200, r: 3 } }] }];
    const R = exWeightRows(v, null);
    const free = exPrTargets(v, null);
    // the real render claims the classic tiles' weights first, which is how the light weight used to win
    const claimed = exPrTargets(v, null, [200]);
    return { allBest: Math.round(R.allBest), ceiling: E1_PATH_MAX_REPS,
      needAt50: e1NeedAt(50, R.allBest), needAt200: e1NeedAt(200, R.allBest),
      freeE1: free.e1, claimedE1: claimed.e1, claimedVuln: claimed.vuln };
  });
  expect(r.allBest).toBe(220);
  expect(r.needAt50, 'the light weight really would need a 3-digit set').toBeGreaterThan(100);
  expect(r.needAt200).toBe(4);
  expect(r.freeE1.w, 'the plausible weight wins the tile').toBe(200);
  expect(r.freeE1.r).toBe(4);
  expect(r.freeE1.r).toBeLessThanOrEqual(r.ceiling);
  // with 200 already claimed by a classic tile, the only weight left is the absurd one → no tile at all
  expect(r.claimedE1, 'no tile beats a fantasy tile').toBeNull();
  // …while the vulnerability pick still works: its reps come from a set you really did
  expect(r.claimedVuln).not.toBeNull();
  expect(r.claimedVuln.r).toBe(11);   // 50kg×10 record + 1
});

test('feat 501 — no rendered target tile asks for more than the ceiling', async ({ page }) => {
  const v = await seed(page);
  const r = await page.evaluate(() => {
    renderModal();
    const asks = [...document.querySelectorAll('#trk-targets .target-btn')].map(b => parseFloat(b.dataset.r) || 1);
    return { asks, ceiling: E1_PATH_MAX_REPS };
  }, v);
  expect(r.asks.length).toBeGreaterThan(1);
  r.asks.forEach(n => expect(n, 'every tile asks for a set a human would attempt').toBeLessThanOrEqual(r.ceiling));
});
