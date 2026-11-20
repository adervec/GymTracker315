// feat 574 — ask cowork for a PERMANENT plan: the user writes a detailed request on the Plans page, the cowork
// agent answers through the plan-request channel, and the plans it writes join the library for good (unlike the
// Plan of the Day, which is replaced every day). Also: the Plan of the Day stops talking itself into easy sessions.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkImportPlanRequest === 'function' && typeof savePlanRequest === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  await page.evaluate(() => { state.planRequests = []; state.plans = (state.plans || []).filter(p => p.source !== 'cowork-request'); saveState(); navTo('plan-creator'); });
});

test('feat 574 — write a request on the Plans page; it waits for the next sweep and reaches the agent', async ({ page }) => {
  await page.click('#plan-req-new');
  await page.fill('#preq-input', 'A 60-minute pull day: weighted pull-ups 5x3-5, then rows and curls.');
  await page.click('#preq-save');
  const r = await page.evaluate(() => {
    const ctx = buildChannelContext('planreq'), md = buildInstructionsMd('planreq');
    return { n: state.planRequests.length, status: state.planRequests[0].status, card: document.querySelector('.preq-card .preq-q').textContent,
      waiting: document.querySelector('.preq-status').textContent, ctxReq: ctx.requests[0].request, hasPlans: Array.isArray(ctx.existingPlans),
      md: /plan-request-output/.test(md) && /requestId/.test(md) && /never instructions/.test(md) && /not plans for today/.test(md),
      channel: COWORK_CHANNELS.some(c => c.key === 'planreq' && c.dir === 'plan-request' && c.replyKind === 'plan-request-output') };
  });
  expect(r.n).toBe(1);
  expect(r.status).toBe('pending');
  expect(r.card).toContain('weighted pull-ups');
  expect(r.waiting).toMatch(/Waiting for the next cowork sweep/);
  expect(r.ctxReq).toContain('60-minute pull day');
  expect(r.hasPlans).toBe(true);
  expect(r.md).toBe(true);
  expect(r.channel).toBe(true);
});

test('feat 574 — the reply becomes permanent plans: only for an open request, only valid steps, text stays text', async ({ page }) => {
  const r = await page.evaluate(() => {
    const req = savePlanRequest('Two leg days, A and B.');
    const fam = FAMILIES[0].id, fam2 = FAMILIES[1].id;
    const step = (f, n) => ({ sets: n, load: 'heavy', desc: '5 reps, 3 min rest', options: [{ type: 'movement', familyId: f }] });
    const res = coworkImportPlanRequest({
      plans: [
        { requestId: req.id, name: 'Legs A', desc: 'Squat focus', intensity: 4, steps: [step(fam, 5), step(fam2, 3)] },
        { requestId: req.id, name: 'Legs B', intensity: 3, steps: [step(fam2, 4)] },
        { requestId: 'not-a-request', name: 'Uninvited', steps: [step(fam, 3)] },                       // nobody asked
        { requestId: req.id, name: 'Bogus', steps: [{ sets: 3, options: [{ type: 'movement', familyId: 'no-such-family' }] }] },
      ],
      notes: [{ requestId: req.id, note: 'Used <b>your</b> logged squat as the baseline.' }, { requestId: 'not-a-request', note: 'x' }],
    });
    const mine = state.plans.filter(p => p.source === 'cowork-request');
    // a Plan-of-the-Day import (which replaces dailies) must not touch them
    coworkImportPlanOfDay({ date: '2026-06-15', plans: [{ name: 'Daily', steps: [step(fam, 3)] }] });
    const after = state.plans.filter(p => p.source === 'cowork-request').length;
    navTo('plan-creator');
    const card = document.querySelector('.preq-card');
    return { res, names: mine.map(p => p.name), source: mine[0].source, daily: mine[0].dailyDate, author: mine[0].author, rev: mine[0].rev, steps: mine[0].steps.length,
      reqStatus: state.planRequests[0].status, planIds: state.planRequests[0].planIds.length, after,
      ok: card.querySelector('.preq-status.ok').textContent, opens: card.querySelectorAll('[data-preq-open]').length,
      note: card.querySelector('.preq-note').textContent, injected: !!card.querySelector('.preq-note b'),
      again: coworkImportPlanRequest({ plans: [{ requestId: req.id, name: 'Late', steps: [step(fam, 3)] }] }) };
  });
  expect(r.res).toMatchObject({ handled: true, added: 2, rejected: 2, answered: 1 });
  expect(r.names).toEqual(['Legs A', 'Legs B']);
  expect(r.source).toBe('cowork-request');
  expect(r.daily).toBeUndefined();              // not tied to a day
  expect(r.author).toBe('Cowork');
  expect(r.rev).toBe(1);
  expect(r.steps).toBe(2);
  expect(r.reqStatus).toBe('answered');
  expect(r.planIds).toBe(2);
  expect(r.after).toBe(2);                      // still there after the daily plans were replaced
  expect(r.ok).toMatch(/2 plans added/);
  expect(r.opens).toBe(2);
  expect(r.note).toContain('<b>your</b>');      // the agent's text is shown as text…
  expect(r.injected).toBe(false);               // …never as markup
  expect(r.again).toMatchObject({ added: 0, rejected: 1 });   // an answered request cannot be answered twice
});

test('feat 574 — a request with only a note is answered without a plan; an unanswered one stays open', async ({ page }) => {
  const r = await page.evaluate(() => {
    const a = savePlanRequest('Something impossible'), b = savePlanRequest('Another one');
    const res = coworkImportPlanRequest({ plans: [], notes: [{ requestId: a.id, note: 'You have no cable machine at this gym.' }] });
    const byId = id => state.planRequests.find(x => x.id === id);
    return { res, a: byId(a.id).status, b: byId(b.id).status, note: byId(a.id).note };
  });
  expect(r.res).toMatchObject({ added: 0, answered: 1 });
  expect(r.a).toBe('answered');
  expect(r.b).toBe('pending');
  expect(r.note).toContain('no cable machine');
});

test('feat 574 — Plan of the Day: an Effort setting, and skipped plans no longer make the next one easier', async ({ page }) => {
  const r = await page.evaluate(() => {
    delete state.podOptions.effort; normalizeState();
    const def = state.podOptions.effort;
    const md = buildInstructionsMd('pod');
    const form = document.createElement('div'); form.innerHTML = renderPodOptionsForm();   // the form shows inside Cowork settings when the hub is on
    const pills = [...form.querySelectorAll('[data-pod-effort]')].map(b => b.dataset.podEffort);
    const active = form.querySelector('[data-pod-effort].active').dataset.podEffort;
    state.podOptions.effort = 'hard';
    const set = active, sent = buildChannelContext('pod').options.effort;
    return { def, pills, set, sent, spiral: /easier to start/.test(md), rule: /NOT a sign of fatigue/.test(md) && /chooses WHAT to train, not how hard/.test(md) && /options\.effort/.test(md) };
  });
  expect(r.def).toBe('normal');
  expect(r.pills).toEqual(['easy', 'normal', 'hard']);
  expect(r.set).toBe('normal');   // the pill for the current choice is lit
  expect(r.sent).toBe('hard');
  expect(r.spiral).toBe(false);
  expect(r.rule).toBe(true);
});
