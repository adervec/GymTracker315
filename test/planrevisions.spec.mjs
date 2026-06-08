// feat 162 — plan authorship + revisions / audit trail. Every plan has an author and a numbered, append-only
// revision history. The creator edits a working draft; Commit snapshots it, Revert rolls it back, Restore loads
// an old revision into the draft. A workout records the revision it ran (session.planRev) and is only compared
// to other executions of the SAME revision.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof ensurePlanRevisioned === 'function' && typeof commitPlanRevision === 'function'
    && typeof planIsDirty === 'function' && typeof planAtRevision === 'function' && typeof findPlanExecutions === 'function', null, { timeout: 15000 });
});

function freshPlan(page) {
  return page.evaluate(() => {
    state.plans = [{ id: 'P', name: 'My Plan', intensity: 3, steps: [{ id: 's0', sets: 3, load: 'moderate', options: [{ type: 'movement', familyId: 'squat' }] }] }];
    ensurePlanRevisioned(state.plans[0]);
    return { rev: state.plans[0].rev, author: state.plans[0].author, nRev: state.plans[0].revisions.length, dirty: planIsDirty(state.plans[0]) };
  });
}

test('a plan gets an author + an initial committed revision baseline', async ({ page }) => {
  const r = await freshPlan(page);
  expect(r.rev).toBe(1);
  expect(r.author).toBe('You');
  expect(r.nRev).toBe(1);
  expect(r.dirty).toBe(false); // baseline == draft → not dirty
});

test('seed plans are authored to GymTracker315', async ({ page }) => {
  const author = await page.evaluate(() => {
    const seed = (state.plans || []).find(p => /^seed-/.test(p.id));
    return seed ? seed.author : null;
  });
  expect(author).toBe('GymTracker315');
});

test('editing the draft marks it dirty; Commit creates a new revision and clears dirty', async ({ page }) => {
  await freshPlan(page);
  const r = await page.evaluate(() => {
    const p = getPlan('P');
    p.steps[0].sets = 5;                 // edit the working draft
    const dirtyAfterEdit = planIsDirty(p);
    const newRev = commitPlanRevision(p); // snapshot
    return { dirtyAfterEdit, newRev, nRev: p.revisions.length, dirtyAfterCommit: planIsDirty(p), lastNote: p.revisions[p.revisions.length - 1].note };
  });
  expect(r.dirtyAfterEdit).toBe(true);
  expect(r.newRev).toBe(2);
  expect(r.nRev).toBe(2);
  expect(r.dirtyAfterCommit).toBe(false);
});

test('Revert discards uncommitted edits back to the last committed revision', async ({ page }) => {
  await freshPlan(page);
  const r = await page.evaluate(() => {
    const p = getPlan('P');
    p.steps[0].sets = 9; p.name = 'Hacked';
    revertPlanToCommitted(p);
    return { sets: p.steps[0].sets, name: p.name, dirty: planIsDirty(p) };
  });
  expect(r.sets).toBe(3);     // back to the committed value
  expect(r.name).toBe('My Plan');
  expect(r.dirty).toBe(false);
});

test('Restore loads an older revision into the draft (commit to keep it)', async ({ page }) => {
  await freshPlan(page);
  const r = await page.evaluate(() => {
    const p = getPlan('P');
    p.steps[0].sets = 5; commitPlanRevision(p);   // rev 2
    p.steps[0].sets = 8; commitPlanRevision(p);   // rev 3
    restorePlanRevision(p, 1);                    // pull rev 1's content into the draft
    return { setsAfterRestore: p.steps[0].sets, dirtyVsCurrent: planIsDirty(p), rev: p.rev };
  });
  expect(r.setsAfterRestore).toBe(3); // rev 1 had 3 sets
  expect(r.rev).toBe(3);              // restore doesn't bump rev — it's a draft change
  expect(r.dirtyVsCurrent).toBe(true); // draft now differs from rev 3 → dirty until committed
});

test('planAtRevision resolves the content a past execution actually ran', async ({ page }) => {
  await freshPlan(page);
  const r = await page.evaluate(() => {
    const p = getPlan('P');
    const rev1Sets = p.steps[0].sets;            // 3
    p.steps[0].sets = 7; commitPlanRevision(p);  // rev 2 has 7
    const atRev1 = planAtRevision(p, 1);
    const atRev2 = planAtRevision(p, 2);
    return { rev1: atRev1.steps[0].sets, rev2: atRev2.steps[0].sets, rev1Sets };
  });
  expect(r.rev1).toBe(3); // the old revision still reads its own content
  expect(r.rev2).toBe(7);
});

test('findPlanExecutions compares only within the same revision', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = [
      { id: 'a', date: '2026-05-01T00:00:00Z', endedAt: '2026-05-01T01:00:00Z', planId: 'P', planRev: 1, exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }], finalScore: { points: 70 } },
      { id: 'b', date: '2026-05-10T00:00:00Z', endedAt: '2026-05-10T01:00:00Z', planId: 'P', planRev: 1, exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }], finalScore: { points: 80 } },
      { id: 'c', date: '2026-05-20T00:00:00Z', endedAt: '2026-05-20T01:00:00Z', planId: 'P', planRev: 2, exercises: [{ varUuid: 'x', sets: [{ w: 1, r: 1 }] }], finalScore: { points: 95 } },
    ];
    const rev1 = findPlanExecutions('P', null, 1);
    const rev2 = findPlanExecutions('P', null, 2);
    const legacy = findPlanExecutions('P', null);    // no rev → all (back-compat)
    return { rev1Count: rev1.count, rev1Best: rev1.best.id, rev2Count: rev2.count, rev2Best: rev2.best.id, legacyCount: legacy.count };
  });
  expect(r.rev1Count).toBe(2);     // only the two rev-1 runs
  expect(r.rev1Best).toBe('b');    // best WITHIN rev 1 (not the higher-scoring rev-2 run)
  expect(r.rev2Count).toBe(1);
  expect(r.rev2Best).toBe('c');
  expect(r.legacyCount).toBe(3);   // no-rev call still spans everything
});

test('using a plan stamps the session with the current revision', async ({ page }) => {
  await freshPlan(page);
  const planRev = await page.evaluate(() => {
    const p = getPlan('P'); p.steps[0].sets = 4; commitPlanRevision(p); // rev 2
    state.sessions = [{ id: 'cur', date: new Date().toISOString(), exercises: [] }];
    // emulate planUseForWorkout's stamping without the overlay/DOM
    const s = state.sessions[0]; s.planId = 'P'; ensurePlanRevisioned(p); s.planRev = p.rev;
    return s.planRev;
  });
  expect(planRev).toBe(2);
});

test('the editor shows the revision bar; Commit/Revert disabled when clean', async ({ page }) => {
  await freshPlan(page);
  const r = await page.evaluate(() => {
    _plansEditId = 'P'; _plansRevView = false;
    const body = document.getElementById('plans-body');
    renderPlanEditor(body, getPlan('P'));
    const commit = body.querySelector('#plan-commit-btn'), revert = body.querySelector('#plan-revert-btn');
    return { hasBar: !!body.querySelector('.plan-rev-bar'), commitDisabled: commit.disabled, revertDisabled: revert.disabled, hasHistory: !!body.querySelector('#plan-history-btn') };
  });
  expect(r.hasBar).toBe(true);
  expect(r.commitDisabled).toBe(true);  // clean draft
  expect(r.revertDisabled).toBe(true);
  expect(r.hasHistory).toBe(true);
});
