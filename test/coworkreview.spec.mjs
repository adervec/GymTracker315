// feat 544 — the cowork agent's moderate-detail review of each recent workout: asked for last in the sweep,
// stored on the session, shown in the Log, and re-asked only when the workout changes.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkImportReview === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
    null, { timeout: 15000 });
  await page.evaluate(() => {
    normalizeState();
    let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') { v = u; break; }
    const at = (d, h = 0) => new Date(Date.now() - d * 864e5 + h * 3600e3).toISOString();
    const mk = (id, d, sets, ended = true) => ({ id, date: at(d), ...(ended ? { endedAt: at(d, 1) } : {}), exercises: [{ varUuid: v, subUuid: null, sets: sets.map(([w, r]) => ({ w, r })) }] });
    state.sessions = [mk('s30', 30, [[95, 8]]), mk('s6', 6, [[100, 8], [100, 7]]), mk('s2', 2, [[100, 9], [100, 8]]), mk('live', 0, [[100, 5]], false)];
    state.recoveryLog = [{ date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10) + 'T12:00:00.000Z', hrv: 58, sleepScore: 74 }];
  });
});

test('feat 544 — the context asks about recent FINISHED workouts, with the app\'s own numbers', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ctx = buildChannelContext('review');
    const keys = COWORK_CHANNELS.map(c => c.key), last = ['garmin', 'strava', 'logreview', 'gyms'].every(k => keys.indexOf(k) < keys.indexOf('review')) ? 'review' : keys;
    const md = buildInstructionsMd('review');
    return { ids: ctx.due.map(d => d.id), s2: ctx.due.find(d => d.id === 's2'), recentN: ctx.recent.length, last, md: md.includes('LAST in the sweep') && md.includes('150-300 words') };
  });
  expect(r.ids).toEqual(['s2', 's6']);            // newest first; the 30-day-old one and the live one are not due
  expect(r.s2.grade).toBeTruthy();
  expect(r.s2.exercises[0].sets).toEqual(['100×9', '100×8']);
  expect(r.s2.exercises[0].lastTime).toMatch(/^100×8 on /);
  expect(r.s2.recovery).toMatchObject({ hrv: 58, sleepScore: 74 });
  expect(r.recentN).toBe(3);
  expect(r.last).toBe('review');                  // after every data-sync channel (only the summary write-ups follow it)
  expect(r.md).toBe(true);
});

test('feat 544 — a reply lands on the session, shows in the Log, and is re-asked only after an edit', async ({ page }) => {
  const r = await page.evaluate(() => {
    const res = coworkApplyImport('workout-review-output', { reviews: [
      { id: 's2', title: 'Rep PR on bench', note: 'Strong day.\nBench moved to 100×9.', highlights: ['100×9 is a rep best'], concerns: ['HRV a touch low'], nextTime: ['Try 102.5×7'] },
      { id: 'nope', note: 'ignored' }, { id: 's6', note: '' } ] });
    const dueAfter = buildChannelContext('review').due.map(d => d.id);
    const html = renderSession(state.sessions.find(s => s.id === 's2'), false, 0);
    const w = document.createElement('div'); w.innerHTML = html;
    const s2 = state.sessions.find(s => s.id === 's2');
    s2.exercises[0].sets.push({ w: 90, r: 10 });   // edited after review
    const dueEdited = buildChannelContext('review').due.map(d => d.id);
    const w2 = document.createElement('div'); w2.innerHTML = renderSession(s2, false, 0);
    return { res, dueAfter, dueEdited, summary: w.querySelector('.cw-review summary').textContent, text: w.querySelector('.cwr-text').textContent,
      items: w.querySelectorAll('.cwr-list li').length, stamped: !!s2.updatedAt, stale: !!w2.querySelector('.cwr-stale') };
  });
  expect(r.res).toEqual({ handled: true, reviews: 1 });
  expect(r.dueAfter).toEqual(['s6']);
  expect(r.dueEdited).toEqual(['s2', 's6']);
  expect(r.summary).toContain('Rep PR on bench');
  expect(r.text).toContain('Bench moved to 100×9.');
  expect(r.items).toBe(3);
  expect(r.stamped).toBe(true);                   // touched, so it syncs to the phone
  expect(r.stale).toBe(true);
});

test('feat 544 — review text is escaped, never rendered as markup', async ({ page }) => {
  const r = await page.evaluate(() => {
    coworkImportReview({ reviews: [{ id: 's2', note: '<img src=x onerror=alert(1)>', title: '<b>t</b>' }] });
    const w = document.createElement('div'); w.innerHTML = renderSession(state.sessions.find(s => s.id === 's2'), false, 0);
    return { img: !!w.querySelector('.cw-review img'), b: !!w.querySelector('.cw-review summary b'), text: w.querySelector('.cwr-text').textContent };
  });
  expect(r.img).toBe(false);
  expect(r.b).toBe(false);
  expect(r.text).toContain('<img');
});
