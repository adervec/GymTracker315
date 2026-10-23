// feat 511 — a morning-brief digest in the cowork folder. app-export.json ships raw data, so a separate morning
// brief task had to re-derive every conclusion the app already draws. brief.json carries those conclusions,
// computed with the app's own functions, and BRIEF.md renders them as a ready-to-read digest.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const DAY = 864e5;

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildMorningBrief === 'function' && typeof buildMorningBriefMd === 'function'
    && typeof findLogAnomalies === 'function' && typeof coworkWriteBrief === 'function'
    && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

// bench history: a steady climb, then today's session beats the old best
const seed = (page, extra) => page.evaluate(({ DAY, extra }) => {
  let bench = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') { bench = u; break; }
  const at = d => new Date(Date.now() - d * DAY).toISOString();
  const sess = (d, sets, more) => ({ id: 's' + d, date: at(d), endedAt: new Date(Date.now() - d * DAY + 3600000).toISOString(),
    exercises: [{ varUuid: bench, subUuid: null, sets: sets.map(([w, r]) => ({ w, r })), topSet: { w: sets[0][0], r: sets[0][1] } }], ...(more || {}) });
  state.unit = 'kg';
  state.profile = { ...(state.profile || {}), gender: 'male', dob: '' };
  state.bodyComp = [{ date: at(40).slice(0, 10), weightKg: 82, updatedAt: at(40) }, { date: at(1).slice(0, 10), weightKg: 80, updatedAt: at(1) }];
  state.recoveryLog = [];
  state.analysisRequests = [{ id: 'q1', q: 'Is my bench progressing?', created: at(2), status: 'pending' }];
  state.sessions = [sess(50, [[80, 5]]), sess(40, [[82.5, 5]]), sess(20, [[85, 5]]), sess(10, [[87.5, 5]]), sess(0.1, [[92.5, 5], [90, 5]])];
  if (extra === 'fatfinger') state.sessions.push(sess(0.05, [[300, 12]]));
  return bench;
}, { DAY, extra });

test('feat 511 — the brief carries every section, computed by the app', async ({ page }) => {
  await seed(page);
  const b = await page.evaluate(() => buildMorningBrief());
  ['meta', 'lastWorkout', 'training', 'lifts', 'muscles', 'recovery', 'body', 'plans', 'anomalies', 'diagnostics', 'openQuestions', 'method']
    .forEach(k => expect(b, 'section ' + k).toHaveProperty(k));
  expect(b.meta.unit).toBe('kg');
  expect(b.meta.profile.bodyweight).toBe(80);
  expect(b.meta.freshness.daysSinceLastWorkout).toBe(0);
  expect(b.training.last7.sessions).toBe(1);
  expect(b.body.latest).toBe(80);
  expect(b.body.change30).toBe(-2);
  expect(b.openQuestions.map(q => q.id)).toEqual(['q1']);
  expect(b.muscles.length).toBeGreaterThan(5);
});

test('feat 511 — the last workout marks a PR against everything before it', async ({ page }) => {
  await seed(page);
  const lw = await page.evaluate(() => buildMorningBrief().lastWorkout);
  expect(lw.exercises).toHaveLength(1);
  const e = lw.exercises[0];
  expect(e.topSet).toBe('92.5×5');
  expect(e.pr, '92.5×5 beats the old 87.5×5').toBe(true);
  expect(e.firstTime).toBe(false);
  expect(e.priorBestE1RM).toBe(Math.round(87.5 * (1 + 5 / 30)));
});

test('feat 511 — each lift carries its trend, tier and recency', async ({ page }) => {
  await seed(page);
  const l = await page.evaluate(() => buildMorningBrief().lifts[0]);
  expect(l.exercise).toMatch(/Bench/);
  expect(l.daysSince).toBe(0);
  expect(l.bestE1RM).toBe(Math.round(92.5 * (1 + 5 / 30)));
  expect(l.trend30Pct, 'best of the last 30 days vs the 30 before').toBeGreaterThan(0);
  expect(l.newAllTimeBest30, 'beaten, not merely matched').toBe(true);
  expect(l.tier, 'bodyweight + gender are set, so a tier is available').not.toBeNull();
  expect(l.plateau).toBeNull();     // a steady climb is not a stall
});

test('feat 511 — a fat-fingered set is flagged as worth checking; honest progress is not', async ({ page }) => {
  await seed(page, 'fatfinger');
  const r = await page.evaluate(() => {
    const a = findLogAnomalies();
    return { kinds: a.map(x => x.kind), first: a[0], brief: buildMorningBrief().anomalies.length };
  });
  expect(r.kinds).toEqual(['jump']);         // only the 300 kg set — the 80 → 92.5 climb is never flagged
  expect(r.first.w).toBe(300);
  expect(r.first.detail).toMatch(/prior best/);
  expect(r.brief).toBe(1);
});

test('feat 511 — a weight above the exercise\'s max is flagged too', async ({ page }) => {
  const bench = await seed(page);
  const kinds = await page.evaluate((bench) => {
    state.exerciseMaxW = { [bench]: 90 };   // the user said this station tops out at 90
    return findLogAnomalies().map(a => a.kind);
  }, bench);
  expect(kinds).toContain('over-cap');
});

test('feat 511 — missing data is said out loud, not left for the brief to invent', async ({ page }) => {
  await seed(page);
  const gaps = await page.evaluate(() => { state.profile.gender = ''; return buildMorningBrief().meta.gaps; });
  expect(gaps.join(' ')).toMatch(/No Garmin recovery data/);
  expect(gaps.join(' ')).toMatch(/No gender set/);
});

test('feat 511 — BRIEF.md reads top to bottom: glance, lifts, attention, guidance, method', async ({ page }) => {
  await seed(page, 'fatfinger');
  const md = await page.evaluate(() => buildMorningBriefMd(buildMorningBrief()));
  ['# GymTracker — morning brief data', '## Data gaps', '## At a glance', '## Last workout', '## Lifts trained in the last 90 days',
    '## Needs attention', '## Writing the brief', '## Method'].forEach(h => expect(md, h).toContain(h));
  expect(md).toMatch(/Worth checking — .*300×12/);
  expect(md).toContain('Open analysis question: "Is my bench progressing?"');
  expect(md).toMatch(/computed by the app/i);
});

test('feat 511 — every hub export writes brief.json and BRIEF.md', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(async () => {
    const written = [];
    if (!('showDirectoryPicker' in window)) window.showDirectoryPicker = () => {};
    const dir = () => ({ name: 'hub', getDirectoryHandle: async () => dir() });
    coworkResolveRoot = async () => { const sub = {}; COWORK_DIRS.forEach(d => { sub[d] = dir(); }); return { root: dir(), sub, perm: 'granted' }; };
    _coworkWriteFile = async (_d, name, text) => { written.push({ name, text }); };
    state.cowork = { ...(state.cowork || {}), enabled: true, minExportGapSec: 0 };
    state.coworkLocal = { ...(state.coworkLocal || {}), declared: {}, lastExportHash: null, lastBriefHash: null };
    const ok1 = await coworkExportNow(true);
    const first = written.map(w => w.name);
    written.length = 0;
    const ok2 = await coworkExportNow(true);   // nothing changed — the brief is STILL written on an export
    const env = JSON.parse((written.find(w => w.name === 'brief.json') || {}).text || '{}');
    return { ok1, ok2, first, second: written.map(w => w.name), kind: env.kind, hasLifts: !!(env.payload && env.payload.lifts) };
  });
  expect(r.ok1).toBe(true);
  expect(r.first).toEqual(expect.arrayContaining(['brief.json', 'BRIEF.md', 'README-COWORK.md']));
  expect(r.second, 'always present, export after export').toEqual(expect.arrayContaining(['brief.json', 'BRIEF.md']));
  expect(r.kind).toBe('morning-brief');
  expect(r.hasLifts).toBe(true);
});

test('feat 511 — the poll refresh skips an unchanged brief and rewrites a changed one', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(async () => {
    let n = 0;
    _coworkWriteFile = async (_d, name) => { if (name === 'brief.json') n++; };
    state.coworkLocal = { ...(state.coworkLocal || {}), lastBriefHash: null };
    const a = await coworkWriteBrief({}, false);           // first: writes
    const b = await coworkWriteBrief({}, false);           // identical content: skipped
    state.analysisRequests.push({ id: 'q2', q: 'Am I neglecting legs?', created: new Date().toISOString(), status: 'pending' });
    const c = await coworkWriteBrief({}, false);           // new data: writes again
    return { a, b, c, n };
  });
  expect(r.a).toBe(true);
  expect(r.b, 'unchanged content is not rewritten every poll').toBe(false);
  expect(r.c).toBe(true);
  expect(r.n).toBe(2);
});

test('feat 511 — the README sends a brief task to BRIEF.md first', async ({ page }) => {
  const md = await page.evaluate(() => buildCoworkReadme());
  expect(md).toMatch(/BRIEF\.md.*start here for a morning brief/i);
});

test('feat 511 — a lift that keeps re-matching its best reads as flat, never as a new best', async ({ page }) => {
  // the case review caught: squat stuck at 142.5×5 for weeks must not be called "an all-time best this month"
  const r = await page.evaluate((DAY) => {
    let sq = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-back-squat') { sq = u; break; }
    const at = d => new Date(Date.now() - d * DAY).toISOString();
    const S = (d, w) => ({ id: 'q' + d, date: at(d), exercises: [{ varUuid: sq, subUuid: null, sets: [{ w, r: 5 }] }] });
    state.unit = 'kg'; state.profile = { gender: 'male', dob: '' };
    state.sessions = [S(56, 140), S(42, 142.5), S(28, 142.5), S(21, 142.5), S(14, 142.5), S(3, 142.5), S(0.2, 140)];
    const b = buildMorningBrief();
    return { lift: b.lifts.find(l => /Squat/.test(l.exercise)), md: buildMorningBriefMd(b) };
  }, DAY);
  expect(r.lift.newAllTimeBest30, 'matching the old best is not a new one').toBe(false);
  expect(r.lift.trend30Pct).toBe(0);
  expect(r.lift.sessions30).toBeGreaterThanOrEqual(3);
  expect(r.md).toMatch(/Barbell Back Squat.*flat for 30 days/);
  expect(r.md).not.toMatch(/Barbell Back Squat.*new all-time best/);
});

// pinned west of UTC: in UTC (where CI runs) the old Date-parsing bug happened to give the right day, so an
// unpinned test would only have guarded it on a machine like the user's
test.describe('west of UTC', () => {
test.use({ timezoneId: 'America/New_York' });
test("feat 511 — today's Plan of the Day is found by its local date, in any timezone", async ({ page }) => {
  // dailyDate is a plain YYYY-MM-DD; parsing it as a Date reads UTC midnight = the previous local day west of UTC
  const r = await page.evaluate(() => {
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    state.plans = [{ id: 'pod1', name: 'Push Day', source: 'daily', dailyDate: today, dailyRationale: 'chest is fresh',
      steps: [{ sets: 3, options: [{ type: 'movement', familyId: 'flat-bench-press' }] }] },
      { id: 'pod0', name: 'Yesterday', source: 'daily', dailyDate: '2000-01-01', steps: [] }];
    state.sessions = [];
    const b = buildMorningBrief();
    return { pod: b.plans.planOfTheDay.map(p => p.name), today: b.meta.today, md: buildMorningBriefMd(b) };
  });
  expect(r.pod).toEqual(['Push Day']);
  expect(r.md).toContain('**Plan of the Day:** "Push Day"');
});
});
