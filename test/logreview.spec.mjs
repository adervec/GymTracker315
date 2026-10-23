// feat 513 — the log review. The app flags sets that look like typos (feat 511); a fifth cowork channel sends them
// to the agent with the lift's recent history, the agent may propose what was meant, and a "Worth checking" list
// on the Analysis page lets the user apply that fix, edit the set by hand, or confirm it is right. Nothing is
// ever changed without a tap.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const DAY = 864e5;

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkImportLogReview === 'function' && typeof logReviewApply === 'function'
    && typeof renderLogReviewCards === 'function' && typeof findLogAnomalies === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// a steady bench history, then a fat-fingered 300×12
const seed = (page) => page.evaluate((DAY) => {
  let bench = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') { bench = u; break; }
  const at = d => new Date(Date.now() - d * DAY).toISOString();
  const S = (d, w, r) => ({ id: 's' + d, date: at(d), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w, r }], topSet: { w, r } }] });
  state.unit = 'kg'; state.logReview = {};
  state.sessions = [S(30, 80, 5), S(20, 82.5, 5), S(10, 85, 5), S(1, 300, 12)];
  const a = findLogAnomalies();
  return { bench, id: a[0] && a[0].id, n: a.length };
}, DAY);

test('feat 513 — each flagged set has a stable id, and "it is right" stops it being flagged', async ({ page }) => {
  const { id, n } = await seed(page);
  expect(n).toBe(1);
  expect(id).toMatch(/^set-/);
  const r = await page.evaluate((id) => {
    const again = findLogAnomalies()[0].id;
    logReviewKeep(id);
    return { again, after: findLogAnomalies().length, brief: buildMorningBrief().anomalies.length };
  }, id);
  expect(r.again, 'the same set keeps the same id').toBe(id);
  expect(r.after, 'confirmed as right — no longer flagged').toBe(0);
  expect(r.brief, 'the morning brief stops flagging it too').toBe(0);
});

test('feat 513 — the log-review channel sends each flagged set with its lift\'s recent history', async ({ page }) => {
  const { id } = await seed(page);
  const ctx = await page.evaluate(() => buildChannelContext('logreview'));
  expect(ctx.anomalies).toHaveLength(1);
  const a = ctx.anomalies[0];
  expect(a).toMatchObject({ id, w: 300, r: 12, kind: 'jump' });
  expect(a.recentHistory.map(h => h.top), 'enough context to tell a typo from a PR').toEqual(['300×12', '85×5', '82.5×5', '80×5']);
});

test('feat 513 — imported proposals are validated, and stored as proposals only', async ({ page }) => {
  const { id } = await seed(page);
  const r = await page.evaluate((id) => {
    const res = coworkImportLogReview({ proposals: [
      { id, action: 'fix', intended: { w: 30, r: 12 }, reason: 'slipped digit' },
      { id: 'set-nope', action: 'fix', intended: { w: 1, r: 1 }, reason: 'not a flagged set' },
      { id, action: 'bogus' },
    ] });
    const set = state.sessions.find(s => s.id === 's1').exercises[0].sets[0];
    return { res, stored: state.logReview[id], setUntouched: set.w === 300 && set.r === 12,
      unknown: 'set-nope' in state.logReview };
  }, id);
  expect(r.res.handled).toBe(true);
  expect(r.res.proposals).toBe(1);
  expect(r.stored).toMatchObject({ action: 'fix', intended: { w: 30, r: 12 }, reason: 'slipped digit' });
  expect(r.setUntouched, 'importing never edits the log').toBe(true);
  expect(r.unknown, 'a proposal for a set the app did not flag is ignored').toBe(false);
});

test('feat 513 — an unusable fix is dropped, never half-applied', async ({ page }) => {
  const { id } = await seed(page);
  const r = await page.evaluate((id) => {
    const res = coworkImportLogReview({ proposals: [{ id, action: 'fix', intended: { w: -5, r: 0 } }] });
    return { res, stored: state.logReview[id] || null };
  }, id);
  expect(r.res.proposals).toBe(0);
  expect(r.stored).toBeNull();
});

test('feat 513 — applying a fix corrects the set, and refuses if the set changed since', async ({ page }) => {
  const { id } = await seed(page);
  const r = await page.evaluate((id) => {
    coworkImportLogReview({ proposals: [{ id, action: 'fix', intended: { w: 30, r: 12 }, reason: 'slipped digit' }] });
    // first: someone edits the set by hand in the meantime — the stale proposal must NOT overwrite it
    const set = state.sessions.find(s => s.id === 's1').exercises[0].sets[0];
    set.w = 301;
    const refused = logReviewApply(id);
    set.w = 300;                                   // put it back as flagged
    const applied = logReviewApply(id);
    return { refused, applied, w: set.w, r: set.r, left: findLogAnomalies().length };
  }, id);
  expect(r.refused, 'never overwrite a set that changed since it was flagged').toBe(false);
  expect(r.applied).toBe(true);
  expect(r.w).toBe(30);
  expect(r.r).toBe(12);
  expect(r.left, 'the corrected set is no longer an anomaly').toBe(0);
});

test('feat 513 — the Analysis page lists it, offers the fix, and "It\'s right" clears it', async ({ page }) => {
  const { id } = await seed(page);
  const r = await page.evaluate((id) => {
    coworkImportLogReview({ proposals: [{ id, action: 'fix', intended: { w: 30, r: 12 }, reason: 'slipped digit' }] });
    const main = document.createElement('div'); document.body.appendChild(main);
    renderAnalysisPage(main);
    const card = main.querySelector('.lr-row');
    const before = { has: !!card, apply: !!main.querySelector('[data-lr-apply]'), text: card ? card.textContent : '' };
    main.querySelector('[data-lr-keep]').click();
    const after = !!main.querySelector('.lr-row');
    main.remove();
    return { before, after };
  }, id);
  expect(r.before.has).toBe(true);
  expect(r.before.apply, 'the agent proposed a fix, so it is offered').toBe(true);
  expect(r.before.text).toMatch(/300×12/);
  expect(r.before.text).toMatch(/Probably 30×12/);
  expect(r.after, 'confirming clears it from the list').toBe(false);
});

test('feat 513 — the hub declares the new channel and documents its reply', async ({ page }) => {
  const r = await page.evaluate(() => ({
    names: buildCoworkManifest().channels.map(c => c.name),
    kind: (buildCoworkManifest().channels.find(c => c.name === 'log-review') || {}).replyKind,
    md: buildInstructionsMd('logreview'),
  }));
  expect(r.names).toContain('log-review');
  expect(r.kind).toBe('log-review-output');
  expect(r.md).toMatch(/log-review-output/);
  expect(r.md).toMatch(/Nothing is changed automatically/);
});

test('feat 513 — a decision made on one device reaches the other', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.logReview = { 'set-a': { dismissed: true } };
    applyImport({ logReview: { 'set-b': { action: 'keep', reason: 'fine' } } }, 'merge');
    return { keys: Object.keys(state.logReview).sort(), synced: SYNC_COLLECTION_KEYS.has('logReview') };
  });
  expect(r.keys).toEqual(['set-a', 'set-b']);
  expect(r.synced).toBe(true);
});
