// feat 561 — cowork REVIEW BEFORE APPLYING (house standard 3): on by default and switchable per channel. With review
// on, a reply changes nothing until you apply it, and the review list shows exactly what it would change; you can
// apply only the ticked rows, discard it, and undo what was applied. With review off, the reply imports directly.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkReceive === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// Each channel: a fixture, a reply, and how to read whether the reply landed.
const CHANNELS = {
  garmin: {
    kind: 'garmin-output',
    setup: () => { state.bodyComp = []; },
    payload: () => ({ bodyComp: [{ date: '2026-11-01', weightKg: 80.5, bodyFatPct: 17.2 }] }),
    landed: () => (state.bodyComp || []).some(b => b.weightKg === 80.5),
  },
  strava: {
    kind: 'strava-output',
    setup: () => { state.stravaActivities = []; state.sessions = [{ id: 'sv1', date: '2026-06-22T18:00:00.000Z', updatedAt: '2026-06-22T18:00:00.000Z', origin: state.deviceId, exercises: [] }]; },
    payload: () => ({ activities: [{ id: 'act-1', name: 'Lift', sport_type: 'WeightTraining', start_date: '2026-06-22T18:00:00.000Z', elapsed_time: 3600, average_heartrate: 135, calories: 420 }] }),
    landed: () => state.sessions.find(s => s.id === 'sv1').stravaId === 'act-1',
  },
  analysis: {
    kind: 'analysis-output',
    setup: () => { state.analysisRequests = [{ id: 'q1', q: 'How is my bench trending?', status: 'open', createdAt: new Date().toISOString() }]; },
    payload: () => ({ answers: [{ id: 'q1', answer: 'Bench is up 5 kg over four weeks.' }] }),
    landed: () => state.analysisRequests[0].answer === 'Bench is up 5 kg over four weeks.',
    text: 'Bench is up 5 kg over four weeks.',
  },
  review: {
    kind: 'workout-review-output',
    setup: () => { state.sessions = [{ id: 'wr1', date: new Date(Date.now() - 864e5).toISOString(), endedAt: new Date().toISOString(), origin: state.deviceId, exercises: [] }]; },
    payload: () => ({ reviews: [{ id: 'wr1', title: 'Solid day', note: 'Good volume on the squats; rest ran long.' }] }),
    landed: () => !!(state.sessions[0].coworkReview && state.sessions[0].coworkReview.text),
    text: 'Good volume on the squats; rest ran long.',
  },
  logreview: {
    kind: 'log-review-output',
    setup: () => { let b = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') { b = u; break; }
      const at = d => new Date(Date.now() - d * 864e5).toISOString(), S = (d, w, r) => ({ id: 'lr' + d, date: at(d), exercises: [{ varUuid: b, subUuid: null, sets: [{ w, r }], topSet: { w, r } }] });
      state.unit = 'kg'; state.logReview = {}; state.sessions = [S(30, 80, 5), S(20, 82.5, 5), S(10, 85, 5), S(1, 300, 12)]; },
    payload: () => ({ proposals: [{ id: findLogAnomalies()[0].id, action: 'fix', intended: { w: 30, r: 12 }, reason: 'a slipped digit — 30 kg, not 300' }] }),
    landed: () => Object.keys(state.logReview || {}).length > 0,
    text: 'a slipped digit — 30 kg, not 300',
  },
  summaries: {
    kind: 'summary-review-output',
    setup: () => { state.periodReviews = {}; },
    payload: () => ({ summaries: [{ period: 'week', key: periodRange('week', 1).key, title: 'Steady week', note: 'Three sessions, bench held at 85 kg, bodyweight flat.' }] }),
    landed: () => Object.keys(state.periodReviews || {}).length > 0,
    text: 'Three sessions, bench held at 85 kg, bodyweight flat.',
  },
  pod: {
    kind: 'pod-output',
    setup: () => { state.plans = (state.plans || []).filter(p => p.source !== 'daily'); },
    payload: () => ({ date: _localYmd(new Date()), rationale: 'fresh legs', plans: [{ name: 'Leg Focus', intensity: 4, steps: [{ sets: 4, options: [{ type: 'movement', familyId: 'squat' }] }] }] }),
    landed: () => (state.plans || []).some(p => p.source === 'daily' && p.name === 'Leg Focus'),
  },
  gyms: {
    kind: 'gym-directory-output',
    setup: () => { state.gyms = []; state.gymMemberships = []; addGymMembership('GoodLife Fitness', 'Ultimate', 'all'); },
    payload: () => ({ gyms: [{ chain: 'GoodLife Fitness', name: 'GoodLife Barrie South', lat: 44.33, lng: -79.68, placeId: 'P2' }] }),
    landed: () => state.gyms.some(g => g.placeId === 'P2'),
  },
};

for (const [key, ch] of Object.entries(CHANNELS)) {
  test(`feat 561 — ${key}: review ON by default holds the reply and shows what it would change`, async ({ page }) => {
    const r = await page.evaluate(({ key, ch }) => {
      const fx = new Function('return (' + ch + ')')();
      fx.setup(); state.coworkReview = {}; state.coworkLocal.reviewQueue = []; saveState();
      const res = coworkReceive(key, fx.kind, fx.payload());
      const q = coworkReviewQueue();
      return { on: coworkReviewOn(key), queued: res.queued, landed: fx.landed(), n: q.length, rows: q[0] && q[0].rows,
        persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).coworkLocal.reviewQueue === undefined ? 'n/a' : 'ok' };
    }, { key, ch: '{' + Object.entries(ch).map(([k, v]) => k + ':' + (typeof v === 'function' ? v.toString() : JSON.stringify(v))).join(',') + '}' });
    expect(r.on, 'review is on by default').toBe(true);
    expect(r.queued).toBe(true);
    expect(r.landed, 'nothing changed before review').toBe(false);
    expect(r.n).toBe(1);
    expect(r.rows.length).toBeGreaterThan(0);
    if (ch.text) expect(r.rows.map(x => x.detail).join(' ')).toContain(ch.text);  // the text it would store is shown

    const after = await page.evaluate(({ key, ch }) => {
      const fx = new Function('return (' + ch + ')')();
      const it = coworkReviewQueue()[0], res = coworkReviewApply(it.id);
      const landed = fx.landed(), undone = coworkUndo(res.undoId);
      return { res, landed, undone, landedAfterUndo: fx.landed(), left: coworkReviewQueue().length,
        log: coworkHistory().slice(-2).map(h => h.note) };
    }, { key, ch: '{' + Object.entries(ch).map(([k, v]) => k + ':' + (typeof v === 'function' ? v.toString() : JSON.stringify(v))).join(',') + '}' });
    expect(after.landed, 'Apply lands it').toBe(true);
    expect(after.left).toBe(0);
    expect(after.undone).toBe(true);
    expect(after.landedAfterUndo, 'and Undo takes it back').toBe(false);
    expect(after.log[0]).toMatch(/applied after review/);
    expect(after.log[1]).toMatch(/undone/);
  });

  test(`feat 561 — ${key}: review OFF imports directly, as before`, async ({ page }) => {
    const r = await page.evaluate(({ key, ch }) => {
      const fx = new Function('return (' + ch + ')')();
      fx.setup(); state.coworkReview = { [key]: false }; state.coworkLocal.reviewQueue = [];
      const res = coworkReceive(key, fx.kind, fx.payload());
      return { queued: !!res.queued, handled: res.handled, landed: fx.landed(), n: coworkReviewQueue().length, undo: !!res.undoId };
    }, { key, ch: '{' + Object.entries(ch).map(([k, v]) => k + ':' + (typeof v === 'function' ? v.toString() : JSON.stringify(v))).join(',') + '}' });
    expect(r).toMatchObject({ queued: false, handled: true, landed: true, n: 0, undo: true });
  });
}

test('feat 561 — Apply selected keeps only the ticked rows; Discard changes nothing; the setting syncs', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.bodyComp = []; state.coworkReview = {}; state.coworkLocal.reviewQueue = [];
    coworkReceive('garmin', 'garmin-output', { bodyComp: [{ date: '2026-11-01', weightKg: 80 }, { date: '2026-11-02', weightKg: 81 }] });
    const it = coworkReviewQueue()[0], keep = [it.rows[0].id];
    const res = coworkReviewApply(it.id, keep);
    const kept = state.bodyComp.map(b => b.weightKg);
    coworkReceive('garmin', 'garmin-output', { bodyComp: [{ date: '2026-11-03', weightKg: 90 }] });
    coworkReviewDiscard(coworkReviewQueue()[0].id);
    return { rows: it.rows.length, res, kept, discarded: !state.bodyComp.some(b => b.weightKg === 90),
      synced: SETTINGS_KEYS.includes('coworkReview') && !DEVICE_LOCAL_KEYS.has('coworkReview') };
  });
  expect(r.rows).toBe(2);
  expect(r.res).toMatchObject({ kept: 1, dropped: 1 });
  expect(r.kept).toHaveLength(1);
  expect(r.discarded).toBe(true);
  expect(r.synced, 'the review setting is synced; the queue stays on the sync machine').toBe(true);
});

test('feat 561 — Settings shows the switches and the waiting reply; the shared panel reports REVIEW', async ({ page }) => {
  await page.evaluate(() => {
    state.aiExport = { ...(state.aiExport || {}), enabled: true }; state.cowork.enabled = true; state.analysisRequests = [{ id: 'q9', q: 'Rest times?', status: 'open', createdAt: new Date().toISOString() }];
    state.coworkReview = {}; state.coworkLocal.reviewQueue = [];
    coworkReceive('analysis', 'analysis-output', { answers: [{ id: 'q9', answer: 'Your rests average 2:40.' }] });
    openSettingsDrawer();
  });
  await expect(page.locator('[data-cowork-review="analysis"]')).toHaveAttribute('aria-pressed', 'true');
  const item = page.locator('.cowork-review-item');
  await expect(item).toContainText('Your rests average 2:40.');
  const panel = await page.evaluate(() => coworkPanelData().channels.find(c => c.channel === 'analysis'));
  expect(panel.review).toBeTruthy();
  await item.locator('[data-review-apply]').click();
  expect(await page.evaluate(() => state.analysisRequests[0].answer)).toBe('Your rests average 2:40.');
  await page.locator('[data-cowork-review="analysis"]').click();
  expect(await page.evaluate(() => coworkReviewOn('analysis'))).toBe(false);
});
