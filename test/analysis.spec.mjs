// feat 450 — Analysis requests: a CRUD queue of questions the user has about their training. The Cowork agent
// answers each on its next sweep (channel `analysis`); the answer syncs back onto the request by id. This drives
// the CRUD helpers, the page render, the cowork context/instructions/import wiring, and the cross-device merge.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof navTo === 'function' && typeof PAGES !== 'undefined'
    && typeof saveAnalysisRequest === 'function' && typeof coworkApplyImport === 'function'
    && typeof buildChannelContext === 'function' && typeof applyImport === 'function', null, { timeout: 15000 });
  await page.evaluate(() => { state.analysisRequests = []; _analysisEditId = null; });
});

test('the Analysis page is a reflect leaf and renders into #trk-main', async ({ page }) => {
  const r = await page.evaluate(() => {
    const d = PAGES.analysis;
    navTo('analysis');
    return { parent: d && d.parent, render: !!(d && d.render), inReflect: PAGES.reflect.children.includes('analysis'),
      page: currentPage, mainNonEmpty: document.getElementById('trk-main').innerHTML.length > 20 };
  });
  expect(r.parent).toBe('reflect');
  expect(r.render).toBe(true);
  expect(r.inReflect).toBe(true);
  expect(r.page).toBe('analysis');
  expect(r.mainNonEmpty).toBe(true);
});

test('CRUD: add prepends a pending request; edit re-opens it; delete removes it', async ({ page }) => {
  const r = await page.evaluate(() => {
    saveAnalysisRequest('  How is my squat trending?  ');   // trims
    saveAnalysisRequest('');                                 // empty is ignored
    saveAnalysisRequest('Am I balanced push/pull?');
    const afterAdd = state.analysisRequests.map(x => x.q);
    const first = state.analysisRequests[0];                 // newest is prepended
    // simulate an answer landing, then edit the question → it must go back to pending and clear the answer
    first.status = 'answered'; first.answer = 'balanced enough';
    saveAnalysisRequest('Am I balanced push/pull AND squat/hinge?', first.id);
    const edited = state.analysisRequests.find(x => x.id === first.id);
    const idToDelete = state.analysisRequests[state.analysisRequests.length - 1].id;
    deleteAnalysisRequest(idToDelete);
    return { count: afterAdd.length, order: afterAdd,
      editedQ: edited.q, editedStatus: edited.status, editedAnswer: edited.answer, editedPending: !edited.answeredAt,
      remaining: state.analysisRequests.length, allPending: state.analysisRequests.every(x => x.status === 'pending') };
  });
  expect(r.count).toBe(2);                                    // the empty one was dropped
  expect(r.order[0]).toBe('Am I balanced push/pull?');        // prepended
  expect(r.order[1]).toBe('How is my squat trending?');
  expect(r.editedQ).toBe('Am I balanced push/pull AND squat/hinge?');
  expect(r.editedStatus).toBe('pending');
  expect(r.editedAnswer).toBe('');
  expect(r.editedPending).toBe(true);
  expect(r.remaining).toBe(1);
});

test('the analysis channel context carries only unanswered requests', async ({ page }) => {
  const ctx = await page.evaluate(() => {
    const now = new Date().toISOString();
    state.analysisRequests = [
      { id: 'a1', q: 'Open one', created: now, updatedAt: now, status: 'pending', answer: '', answeredAt: null },
      { id: 'a2', q: 'Done one', created: now, updatedAt: now, status: 'answered', answer: 'yes', answeredAt: now },
    ];
    return buildChannelContext('analysis');
  });
  expect(ctx.requests.length).toBe(1);
  expect(ctx.requests[0].id).toBe('a1');
  expect(ctx.requests[0].question).toBe('Open one');
});

test('INSTRUCTIONS document the analysis-output kind and its id-keyed payload', async ({ page }) => {
  const md = await page.evaluate(() => buildInstructionsMd('analysis'));
  expect(md).toContain('analysis-output');
  expect(md).toContain('"answers"');
  expect(md).toContain('id');
});

test('importing analysis-output fills answers onto the matching request by id', async ({ page }) => {
  const r = await page.evaluate(() => {
    const now = new Date().toISOString();
    state.analysisRequests = [
      { id: 'q1', q: 'How is my bench?', created: now, updatedAt: now, status: 'pending', answer: '', answeredAt: null },
      { id: 'q2', q: 'And my deadlift?', created: now, updatedAt: now, status: 'pending', answer: '', answeredAt: null },
    ];
    const res = coworkApplyImport('analysis-output', { answers: [
      { id: 'q1', answer: 'Bench up 10lb over 6 weeks.' },
      { id: 'nope', answer: 'ignored — no such request' },
    ] });
    const q1 = state.analysisRequests.find(x => x.id === 'q1');
    const q2 = state.analysisRequests.find(x => x.id === 'q2');
    return { handled: res.handled, answered: res.answered,
      q1Status: q1.status, q1Answer: q1.answer, q1At: !!q1.answeredAt, q2Status: q2.status };
  });
  expect(r.handled).toBe(true);
  expect(r.answered).toBe(1);          // the unknown id is skipped
  expect(r.q1Status).toBe('answered');
  expect(r.q1Answer).toContain('Bench up');
  expect(r.q1At).toBe(true);
  expect(r.q2Status).toBe('pending');  // untouched
});

test('cross-device merge: the newer edit wins (an answer beats a stale pending copy)', async ({ page }) => {
  const r = await page.evaluate(() => {
    // local device still holds the pending request; the incoming file carries the answered (newer) version
    state.analysisRequests = [{ id: 'm1', q: 'Q', created: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', status: 'pending', answer: '', answeredAt: null }];
    const data = { savedAt: new Date().toISOString(), analysisRequests: [
      { id: 'm1', q: 'Q', created: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z', status: 'answered', answer: 'the analysis', answeredAt: '2026-07-02T00:00:00.000Z' },
      { id: 'm2', q: 'New from other device', created: '2026-07-03T00:00:00.000Z', updatedAt: '2026-07-03T00:00:00.000Z', status: 'pending', answer: '', answeredAt: null },
    ] };
    applyImport(data, 'merge');
    const m1 = state.analysisRequests.find(x => x.id === 'm1');
    return { count: state.analysisRequests.length, m1Status: m1.status, m1Answer: m1.answer,
      hasM2: state.analysisRequests.some(x => x.id === 'm2') };
  });
  expect(r.count).toBe(2);              // union — the other device's new request came across
  expect(r.m1Status).toBe('answered');  // newer updatedAt won
  expect(r.m1Answer).toBe('the analysis');
  expect(r.hasM2).toBe(true);
});
