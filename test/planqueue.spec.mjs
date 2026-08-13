// feat 479 — the try-later queue. A favourite says "I like this"; a queue entry says "I intend to do this,
// next". So it is ORDERED, it has a front, and — the part that makes it a to-do list rather than another pile
// of stars — it empties itself once you have actually run the plan since queuing it.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof planQueue === 'function' && typeof queuePlan === 'function'
    && typeof getPlan === 'function' && (state.plans || []).length > 2, null, { timeout: 15000 });
  await page.evaluate(() => { state.readonly = false; state.planQueue = []; state.sessions = []; });
});

const ids = page => page.evaluate(() => (state.plans || []).slice(0, 4).map(p => p.id));

test('feat 479 — queue, dequeue, and the order you put them in is the order you get back', async ({ page }) => {
  const P = await ids(page);
  const r = await page.evaluate((P) => {
    const out = {};
    out.emptyAtFirst = planQueueCount();
    out.added = P.slice(0, 3).map(queuePlan);
    out.order = planQueue().map(e => e.id);
    out.isQueued = P.slice(0, 3).map(isQueuedPlan);
    out.notQueued = isQueuedPlan(P[3]);
    out.dupIgnored = queuePlan(P[0]);           // already there — no duplicate entry
    out.afterDup = planQueue().length;
    out.toggledOff = toggleQueuePlan(P[1]);
    out.afterToggle = planQueue().map(e => e.id);
    out.toggledOn = toggleQueuePlan(P[1]);
    out.backAtEnd = planQueue().map(e => e.id);
    out.next = (nextQueuedPlan() || {}).id;
    // a plan that no longer exists self-heals out of the list on read
    state.planQueue.push({ id: 'gone-forever', at: new Date().toISOString() });
    out.ghostFiltered = planQueue().some(e => e.id === 'gone-forever');
    out.stored = state.planQueue.length;
    planQueuePrune();
    out.afterPrune = state.planQueue.length;
    return out;
  }, P);
  expect(r.emptyAtFirst).toBe(0);
  expect(r.added).toEqual([true, true, true]);
  expect(r.order, 'insertion order is the queue order').toEqual(P.slice(0, 3));
  expect(r.isQueued).toEqual([true, true, true]);
  expect(r.notQueued).toBe(false);
  expect(r.dupIgnored, 'queuing twice is a no-op, not a duplicate').toBe(false);
  expect(r.afterDup).toBe(3);
  expect(r.toggledOff).toBe(false);
  expect(r.afterToggle).toEqual([P[0], P[2]]);
  expect(r.toggledOn).toBe(true);
  expect(r.backAtEnd, 're-queuing puts it at the back').toEqual([P[0], P[2], P[1]]);
  expect(r.next).toBe(P[0]);
  expect(r.ghostFiltered, 'a deleted plan never surfaces').toBe(false);
  expect(r.stored).toBe(4);
  expect(r.afterPrune, 'and prune persists the cleanup').toBe(3);
});

test('feat 479 — an entry drops off once you have RUN it since queuing, not before', async ({ page }) => {
  const P = await ids(page);
  const r = await page.evaluate((P) => {
    const out = {};
    // a plan run LONG ago, then queued, must stay: that old run is not this intention
    state.sessions = [{ id: 'old', date: new Date(Date.now() - 30 * 86400000).toISOString(),
      endedAt: new Date(Date.now() - 30 * 86400000).toISOString(), planId: P[0], exercises: [] }];
    queuePlan(P[0]); queuePlan(P[1]);
    out.survivesOldRun = isQueuedPlan(P[0]);

    // starting it is not finishing it — an abandoned attempt keeps the entry
    state.sessions.push({ id: 'live', date: new Date().toISOString(), planId: P[0], exercises: [] });
    out.survivesUnfinished = isQueuedPlan(P[0]);

    // a COMPLETED run after queuing clears it
    state.sessions.push({ id: 'done', date: new Date().toISOString(), endedAt: new Date().toISOString(), planId: P[0], exercises: [] });
    out.goneAfterDone = isQueuedPlan(P[0]);
    out.othersRemain = isQueuedPlan(P[1]);
    out.count = planQueueCount();
    out.nextMovedUp = (nextQueuedPlan() || {}).id;

    // and you can deliberately queue it AGAIN for another go
    queuePlan(P[0]);
    out.requeued = isQueuedPlan(P[0]);
    return out;
  }, P);
  expect(r.survivesOldRun, 'a run from before you queued it does not count').toBe(true);
  expect(r.survivesUnfinished, 'queued then abandoned stays queued').toBe(true);
  expect(r.goneAfterDone, 'done means done').toBe(false);
  expect(r.othersRemain).toBe(true);
  expect(r.count).toBe(1);
  expect(r.nextMovedUp, 'the next one moves to the front').toBe(P[1]);
  expect(r.requeued, 'you can always queue it again for another go').toBe(true);
});

test('feat 479 — reordering moves within the live queue and clamps at the ends', async ({ page }) => {
  const P = await ids(page);
  const r = await page.evaluate((P) => {
    P.slice(0, 3).forEach(queuePlan);
    const out = { start: planQueue().map(e => e.id) };
    out.upFromTop = queueMovePlan(P[0], -1);            // already first
    out.downFromBottom = queueMovePlan(P[2], 1);        // already last
    out.unchanged = planQueue().map(e => e.id);
    out.moved = queueMovePlan(P[2], -1);
    out.after = planQueue().map(e => e.id);
    queueMovePlan(P[2], -1);
    out.toFront = planQueue().map(e => e.id);
    out.unknown = queueMovePlan('nope', -1);
    queueClearPlans();
    out.cleared = planQueueCount();
    return out;
  }, P);
  expect(r.start).toEqual(P.slice(0, 3));
  expect(r.upFromTop, 'the front cannot move up').toBe(false);
  expect(r.downFromBottom, 'the back cannot move down').toBe(false);
  expect(r.unchanged).toEqual(P.slice(0, 3));
  expect(r.moved).toBe(true);
  expect(r.after).toEqual([P[0], P[2], P[1]]);
  expect(r.toFront).toEqual([P[2], P[0], P[1]]);
  expect(r.unknown).toBe(false);
  expect(r.cleared).toBe(0);
});

test('feat 479 — the panel appears only when there is something queued, and drives the queue', async ({ page }) => {
  const P = await ids(page);
  const r = await page.evaluate((P) => {
    navTo('plan-creator'); renderPlansOverlay();
    const out = { hiddenWhenEmpty: !document.querySelector('.pq-card') };

    P.slice(0, 3).forEach(queuePlan);
    renderPlansOverlay();
    out.rows = document.querySelectorAll('.pq-row').length;
    out.firstIsNext = document.querySelector('.pq-row').classList.contains('next');
    out.upDisabledAtTop = document.querySelector('[data-queue-up]').disabled;
    out.hasUse = !!document.querySelector('.pq-row [data-plan-use]');
    out.chip = !!document.querySelector('[data-plan-queued]');

    // the panel's ▼ reorders
    document.querySelector('[data-queue-down]').click();
    out.afterDown = planQueue().map(e => e.id);
    // the panel's ✕ drops
    document.querySelector('.pq-drop').click();
    out.afterDrop = planQueueCount();
    // every plan ROW carries a toggle, and it toggles
    const rowBtn = document.querySelector('.plan-row [data-queue-plan]');
    const rowId = rowBtn.dataset.queuePlan, was = isQueuedPlan(rowId);
    rowBtn.click();
    out.rowToggles = isQueuedPlan(rowId) !== was;
    return out;
  }, P);
  expect(r.hiddenWhenEmpty, 'an empty to-do list is not worth a card').toBe(true);
  expect(r.rows).toBe(3);
  expect(r.firstIsNext, 'the front of the queue is marked').toBe(true);
  expect(r.upDisabledAtTop).toBe(true);
  expect(r.hasUse, 'the queue can start a workout directly').toBe(true);
  expect(r.chip).toBe(true);
  expect(r.afterDown).toEqual([P[1], P[0], P[2]]);
  expect(r.afterDrop).toBe(2);
  expect(r.rowToggles).toBe(true);
});

test('feat 479 — the Queued chip filters the list to the queue', async ({ page }) => {
  const P = await ids(page);
  const r = await page.evaluate((P) => {
    navTo('plan-creator');
    P.slice(0, 2).forEach(queuePlan);
    renderPlansOverlay();
    const all = document.querySelectorAll('.plan-row').length;
    document.querySelector('[data-plan-queued]').click();
    const shown = [...document.querySelectorAll('.plan-row')].map(r => r.dataset.planRow);
    const active = document.querySelector('[data-plan-queued]').classList.contains('active');
    document.querySelector('[data-plan-queued]').click();
    const back = document.querySelectorAll('.plan-row').length;
    return { all, shown, active, back, queued: planQueue().map(e => e.id) };
  }, P);
  expect(r.all).toBeGreaterThan(2);
  expect(r.shown.sort()).toEqual(r.queued.sort());
  expect(r.active).toBe(true);
  expect(r.back, 'toggling it off restores the full list').toBe(r.all);
});

test('feat 479 — the queue is persisted and rides the backup, not left in memory', async ({ page }) => {
  const P = await ids(page);
  const r = await page.evaluate((P) => {
    queuePlan(P[0]); queuePlan(P[1]);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { inStorage: (stored.planQueue || []).map(e => e.id),
      inBackup: SETTINGS_KEYS.includes('planQueue'),
      entryShape: stored.planQueue.every(e => e.id && e.at) };
  }, P);
  expect(r.inStorage).toEqual(P.slice(0, 2));
  expect(r.inBackup, 'a to-do list you lose on reinstall is worthless').toBe(true);
  expect(r.entryShape, 'each entry carries WHEN it was queued — that is what makes "done" detectable').toBe(true);
});
