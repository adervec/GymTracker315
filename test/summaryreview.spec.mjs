// feat 545 — summaries at three resolutions (week · month · quarter) on Reflect › Summary, and the cowork
// agent's write-up of each covering training AND body composition (channel summary-review).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkImportSummaryReview === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
    null, { timeout: 15000 });
  await page.evaluate(() => {
    normalizeState(); state.periodReviews = {}; state.unit = 'kg'; state.bodyCompUnit = 'kg';
    let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') { v = u; break; }
    const mid = n => _weekRangeMs(n).start + 3 * 864e5 + 10 * 3600e3;        // mid-week, N complete weeks back
    const ses = (n, w) => ({ id: 'w' + n, date: new Date(mid(n)).toISOString(), endedAt: new Date(mid(n) + 3600e3).toISOString(), exercises: [{ varUuid: v, subUuid: null, sets: [{ w, r: 8 }, { w, r: 7 }] }] });
    // ~5 months of weekly sessions, slowly stronger, slowly lighter
    state.sessions = []; state.bodyComp = [];
    for (let n = 1; n <= 22; n++) { state.sessions.push(ses(n, 110 - n)); state.bodyComp.push({ date: new Date(mid(n)).toISOString(), weightKg: 80 + n * 0.2, bodyFatPct: 16 + n * 0.1 }); }
    state.bodyComp = state.bodyComp.filter((_, i) => i !== 3);                 // week 4: training, no weigh-in
  });
});

test('feat 545 — periods resolve to the last complete week, month and quarter', async ({ page }) => {
  const r = await page.evaluate(() => {
    const now = new Date(), w = periodRange('week', 1), m = periodRange('month', 1), q = periodRange('quarter', 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1), qs = Math.floor(now.getMonth() / 3) * 3 - 3, lq = new Date(now.getFullYear(), qs, 1);
    return { wLen: (w.end - w.start) / 864e5, wEndsBeforeNow: w.end <= Date.now(), mKey: m.key, mWant: lastMonth.getFullYear() + '-' + String(lastMonth.getMonth() + 1).padStart(2, '0'),
      qKey: q.key, qWant: lq.getFullYear() + '-Q' + (Math.floor(lq.getMonth() / 3) + 1), qMonths: Math.round((q.end - q.start) / (30.4 * 864e5)) };
  });
  expect(r.wLen).toBe(7);
  expect(r.wEndsBeforeNow).toBe(true);
  expect(r.mKey).toBe(r.mWant);
  expect(r.qKey).toBe(r.qWant);
  expect(r.qMonths).toBe(3);
});

test('feat 545 — the context carries due weeks, months and a quarter with training AND body numbers', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ctx = buildChannelContext('summaries');
    const by = k => ctx.due.filter(d => d.period === k);
    const w1 = by('week')[0], m1 = by('month')[0], q1 = by('quarter')[0];
    const order = COWORK_CHANNELS.map(c => c.key);
    return { counts: [by('week').length, by('month').length, by('quarter').length], w1, m1, q1, last: order[order.length - 1], afterReview: order.indexOf('summaries') > order.indexOf('review'),
      md: buildInstructionsMd('summaries') };
  });
  expect(r.counts).toEqual([3, 2, 1]);
  expect(r.w1.highlights.length).toBeGreaterThan(0);
  expect(r.w1.workouts[0].id).toBe('w1');
  expect(r.w1.lifts['Barbell Flat Bench Press'].best).toBeGreaterThan(r.w1.lifts['Barbell Flat Bench Press'].previous);
  expect(r.w1.body.weightKg).toBe(80.2);
  expect(r.w1.previousPeriod.body.weightKg).toBe(80.4);
  expect(r.m1.weeks.length).toBeGreaterThanOrEqual(3);
  expect(r.m1.body.weighIns).toBeGreaterThanOrEqual(3);
  expect(r.q1.months).toHaveLength(3);
  expect(r.last).toBe('summaries');
  expect(r.afterReview).toBe(true);
  expect(r.md).toContain('both training and body composition');
  expect(r.md).toContain('quarter about 400-700 words');
});

test('feat 545 — a reply is stored per period, shows on its card, and comes back due after a change', async ({ page }) => {
  const r = await page.evaluate(() => {
    const wk = periodRange('week', 1).key, mo = periodRange('month', 1).key;
    const res = coworkApplyImport('summary-review-output', { summaries: [
      { period: 'week', key: wk, title: 'Stronger and lighter', note: 'Bench up while the scale came down.', training: ['Bench e1RM up'], body: ['−0.2 kg'], focus: ['Keep protein high'] },
      { period: 'month', key: mo, title: 'A steady cut', note: 'Four weeks of the same story.' },
      { period: 'month', key: '1999-01', note: 'not a period we offered' }, { period: 'decade', key: wk, note: 'x' }] });
    const main = document.getElementById('trk-main');
    _sumRes = 'week'; renderSummaryPage(main);
    const weekSummary = main.querySelector('.summary-week .cw-review summary')?.textContent;
    main.querySelector('[data-sum-res="month"]').click();
    const monthCards = main.querySelectorAll('.summary-week').length, monthSummary = main.querySelector('.summary-week .cw-review summary')?.textContent;
    const monthTitle = main.querySelector('.card-title').textContent;
    main.querySelector('[data-sum-res="quarter"]').click();
    const quarterTitle = main.querySelector('.card-title').textContent, qCards = main.querySelectorAll('.summary-week').length;
    state.bodyComp.push({ date: new Date(periodRange('week', 1).start + 5 * 864e5).toISOString(), weightKg: 79.9 });   // a late weigh-in
    const dueNow = buildChannelContext('summaries').due.map(d => d.period + ':' + d.key);
    _sumRes = 'week'; renderSummaryPage(main);
    return { res, weekSummary, monthCards, monthSummary, monthTitle, quarterTitle, qCards, dueNow, wk, stale: !!main.querySelector('.cw-review .cwr-stale') };
  });
  expect(r.res).toEqual({ handled: true, summaries: 2 });
  expect(r.weekSummary).toContain("Coach's week — Stronger and lighter");
  expect(r.monthTitle).toContain('Monthly Summary');
  expect(r.monthCards).toBeGreaterThanOrEqual(4);
  expect(r.monthSummary).toContain("Coach's month — A steady cut");
  expect(r.quarterTitle).toContain('Quarterly Summary');
  expect(r.qCards).toBeGreaterThanOrEqual(1);
  expect(r.dueNow).toContain('week:' + r.wk);          // the week changed → due again (and its month too)
  expect(r.stale).toBe(true);
});

test('feat 545 — write-ups merge per period across devices', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.periodReviews = { 'week:a': { text: 'mine' } };
    applyImport({ sessions: [], periodReviews: { 'month:b': { text: 'theirs' } } }, 'merge');
    return Object.keys(state.periodReviews).sort();
  });
  expect(r).toEqual(['month:b', 'week:a']);
});
