// feat 477 — the log sheet's reference row earns its space. Two new PR-hunting targets (the weight most
// vulnerable to a weight PR, and the weight × reps most likely to take the overall e1RM record), satisfied
// indicators once this session has matched a target, a session PR count on the All-weights button, compact
// baseline chips, and an up/down blurb that collapses itself once you have started working.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exPrTargets === 'function' && typeof exSessionPrCount === 'function'
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
    // 166×6 beats the 155×6 "prev top" on both weight and reps
    commitSetField(0, 'w', 166); commitSetField(0, 'r', 6);
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

test('feat 477 — the All-weights button counts the weights PRd this session', async ({ page }) => {
  const v = await seed(page);
  const r = await page.evaluate((v) => {
    const none = document.querySelector('.wt-pr-badge');
    commitSetField(0, 'w', 166); commitSetField(0, 'r', 6);   // 166 record was 3 reps → PR
    const one = { n: exSessionPrCount(v, null), badge: (document.querySelector('.wt-pr-badge') || {}).textContent };
    pending.sets.push({ w: 155, r: 9 }); renderModal();        // 155 record was 8 reps → second PR
    const two = { n: exSessionPrCount(v, null), badge: (document.querySelector('.wt-pr-badge') || {}).textContent };
    pending.sets.push({ w: 116, r: 4 }); renderModal();        // 116 record is 10 reps → NOT a PR
    const still = exSessionPrCount(v, null);
    pending.sets.push({ w: 205, r: 2 }); renderModal();        // a weight never used before is its own record
    const novel = exSessionPrCount(v, null);
    return { hadNone: !none, one, two, still, novel };
  }, v);
  expect(r.hadNone, 'no badge before anything is logged').toBe(true);
  expect(r.one.n).toBe(1);
  expect(r.one.badge).toContain('1 PR today');
  expect(r.two.n).toBe(2);
  expect(r.two.badge).toContain('2 PRs today');
  expect(r.still, 'a set below the record at that weight adds nothing').toBe(2);
  expect(r.novel, 'a brand-new weight counts as its own record').toBe(3);
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
