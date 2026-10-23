// feat 512 — Plan of the Day feedback. The agent wrote every Plan of the Day blind: it never learned whether the
// last one was used, which steps were skipped, whether the loads landed, or how long it really took.
// podOutcomes() reports that, in the POD channel's context.json and the morning brief.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const DAY = 864e5;

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof podOutcomes === 'function' && typeof buildChannelContext === 'function'
    && typeof buildMorningBrief === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const ymd = (page, daysAgo) => page.evaluate((n) => {
  const d = new Date(Date.now() - n * 864e5);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}, daysAgo);

// two daily plans: yesterday's (bench 3 sets + squat 3 sets) and today's
const seed = async (page, { ran, instead } = {}) => {
  const yday = await ymd(page, 1), today = await ymd(page, 0);
  return page.evaluate(({ yday, today, ran, instead, DAY }) => {
    const find = id => { for (const [u, i] of VAR_INDEX) if (i.variation.id === id) return u; };
    const bench = find('bb-flat-bench'), squat = find('bb-back-squat');
    state.unit = 'kg';
    state.plans = [
      { id: 'podY', name: 'Upper + Legs', source: 'daily', dailyDate: yday, dailyRationale: 'legs fresh', steps: [
        { id: 'a', sets: 3, load: 'moderate', desc: 'bench', options: [{ type: 'variation', uuid: bench }] },
        { id: 'b', sets: 3, load: 'moderate', desc: 'squat', options: [{ type: 'variation', uuid: squat }] } ] },
      { id: 'podT', name: 'Today Pull', source: 'daily', dailyDate: today, dailyRationale: 'back day', steps: [
        { id: 'c', sets: 3, options: [{ type: 'movement', familyId: 'row' }] } ] },
    ];
    const yAt = new Date(Date.now() - DAY).toISOString(), yEnd = new Date(Date.now() - DAY + 80 * 60000).toISOString();
    state.sessions = [];
    if (ran) state.sessions.push({ id: 'r', date: yAt, endedAt: yEnd, planId: 'podY', skippedSteps: ['b'],
      exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 80, r: 8 }, { w: 80, r: 8 }, { w: 80, r: 7 }] }] });
    if (instead) state.sessions.push({ id: 'i', date: yAt, endedAt: yEnd, planId: null,
      exercises: [{ varUuid: squat, subUuid: null, sets: [{ w: 100, r: 5 }] }] });
    return podOutcomes();
  }, { yday, today, ran, instead, DAY });
};

test('feat 512 — a done plan reports steps, sets vs target, skips and real duration', async ({ page }) => {
  const out = await seed(page, { ran: true });
  const y = out.find(o => o.plan === 'Upper + Legs');
  expect(y.status).toBe('done');
  expect(y.durationMin).toBe(80);
  expect(y.estimatedMin, 'so the agent can compare its estimate').not.toBeNull();
  expect(y.summary.stepsTotal).toBe(2);
  expect(y.summary.setsDone).toBe(3);
  expect(y.summary.setsTarget).toBe(6);
  expect(y.steps[0]).toMatchObject({ step: 1, targetSets: 3, loggedSets: 3, satisfied: true, skipped: false });
  expect(y.steps[1]).toMatchObject({ step: 2, loggedSets: 0, satisfied: false, skipped: true });
  expect(y.exercisesUsed.join(' ')).toMatch(/Bench/);
  expect(y.rationale).toBe('legs fresh');
});

test('feat 512 — a passed-over plan says what was done instead; today\'s is only pending', async ({ page }) => {
  const out = await seed(page, { instead: true });
  const y = out.find(o => o.plan === 'Upper + Legs'), t = out.find(o => o.plan === 'Today Pull');
  expect(y.status).toBe('not-done');
  expect(y.didInstead).toEqual(['a free workout']);
  expect(t.status, 'not done YET is not the same as ignored').toBe('pending');
  expect(out.map(o => o.plan), 'newest plan first').toEqual(['Today Pull', 'Upper + Legs']);
});

test('feat 512 — the POD channel context carries the outcomes, and its instructions say to use them', async ({ page }) => {
  await seed(page, { ran: true });
  const r = await page.evaluate(() => ({ ctx: buildChannelContext('pod'), md: buildInstructionsMd('pod') }));
  expect(r.ctx.recentOutcomes.length).toBe(2);
  expect(r.ctx.recentOutcomes.find(o => o.status === 'done').plan).toBe('Upper + Legs');
  expect(r.md).toMatch(/recentOutcomes/);
  expect(r.md).toMatch(/stop prescribing what keeps getting skipped/);
});

test('feat 512 — the morning brief reports how the last Plan of the Day went', async ({ page }) => {
  await seed(page, { ran: true });
  const r = await page.evaluate(() => { const b = buildMorningBrief(); return { o: b.plans.recentOutcomes, md: buildMorningBriefMd(b) }; });
  expect(r.o.map(x => x.status), 'pending plans stay out of the look-back').toEqual(['done']);
  expect(r.md).toMatch(/Last Plan of the Day.*"Upper \+ Legs".*1\/2 steps, 3\/6 sets, 80 min.*skipped: step 2/);
});
