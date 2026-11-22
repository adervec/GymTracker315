// feat 590 — the runner's fitness feed (shared-activities.json / shared-body.json, house standard 27) replaces the
// Garmin and Strava cowork channels, which the runner's tool-less AI could not answer.
import { test, expect } from '@playwright/test';

const DAY = 864e5;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
const ymd = (daysAgo) => { const d = new Date(Date.now() - daysAgo * DAY); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkReadFeed === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  await page.evaluate(() => {
    const files = new Map();
    window._cloud = { files };
    coworkCloud = () => ({ label: () => 'Google Drive', signedIn: () => true, signIn: async () => {}, write: async (n, b) => { files.set(n, String(b)); },
      read: async (n) => files.has(n) ? files.get(n) : null, list: async (pre) => [...files.keys()].filter(n => n.indexOf(pre) === 0).map(n => ({ id: n, name: n, size: files.get(n).length })),
      remove: async (n) => files.delete(n) });
    normalizeState();
    state.cowork.enabled = true; state.coworkLocal.history = []; state.coworkLocal.feedSeen = null; state.coworkLocal.feedSince = null;
    state.sessions = []; state.stravaActivities = []; state.bodyComp = [];
  });
});

test('feat 590 — no Garmin or Strava channel is declared any more; the feed is read on every check', async ({ page }) => {
  const r = await page.evaluate(() => ({ keys: COWORK_CHANNELS.map(c => c.key), names: buildCoworkManifest().channels.map(c => c.name),
    url: [stravaActivityUrl('123'), stravaActivityUrl('garmin:456'), stravaActivityUrl(null)] }));
  expect(r.keys).not.toContain('garmin');
  expect(r.keys).not.toContain('strava');
  expect(r.names.some(n => /garmin|strava/.test(n))).toBe(false);
  expect(r.url).toEqual(['https://www.strava.com/activities/123', null, null]);
});

test('feat 590 — activities: new ones only, strength linked, cardio from the last 30 days, never twice', async ({ page }) => {
  const r = await page.evaluate(({ a }) => {
    let bench = null; for (const [u, i] of VAR_INDEX) if (i.family.id === 'flat-bench-press') { bench = u; break; }
    state.sessions = [{ id: 'gym1', date: a.gymStart, endedAt: a.gymEnd, exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 100, r: 5 }] }] }];
    state.stravaActivities = [{ id: '111', name: 'Canal loop', sportType: 'Run', startDate: a.oldRun, elapsedSec: 1800, route: [0, 0, 50, 50, 100, 100] }];
    const feed = { schema: 1, owner: 'runner', updated: '2026-11-22T06:00:00+00:00', sources: {}, activities: [
      { ids: ['garmin:9', 'strava:111'], start: a.oldRun, kind: 'run', type: 'running', minutes: 30, km: 5, sources: ['Garmin', 'Strava'] },   // already here: untouched
      { ids: ['garmin:10', 'strava:222'], start: a.gymStart, kind: 'strength', type: 'strength_training', minutes: 60, avg_hr: 120, kcal: 400, sources: ['Garmin', 'Strava'] },
      { ids: ['strava:333'], start: a.recentRide, kind: 'ride', type: 'Ride', minutes: 45, km: 20, avg_hr: 140, sources: ['Strava'] },
      { ids: ['garmin:444'], start: a.recentWalk, kind: 'walk', type: 'walking', minutes: 25, km: 2.1, sources: ['Garmin'] },
      { ids: ['strava:555'], start: a.yearAgo, kind: 'run', type: 'Run', minutes: 40, km: 8, sources: ['Strava'] },                           // too old to become cardio
      { ids: ['nope'], start: a.recentRide, kind: 'run' }, { ids: ['strava:666'], start: 'not a date' }, null, { ids: 'strava:777' },
      { ids: ['strava:888'], start: a.recentRide, kind: 'run', type: '<img src=x onerror=1>', minutes: -5, km: 1e9, avg_hr: 9999 } ] };
    _cloud.files.set('shared-activities.json', JSON.stringify(feed));
    return coworkReadFeed(true).then(res => {
      const st = id => state.stravaActivities.find(x => x.id === id);
      const out = { res, ids: state.stravaActivities.map(x => x.id).sort(), kept: st('111'),
        gym: state.sessions.find(s => s.id === 'gym1'), cardio: state.sessions.filter(s => s.source === 'strava-import').map(s => s.stravaId).sort(),
        garminLink: !!state.sessions.find(s => s.stravaId === 'garmin:444'), bad: st('888'), note: coworkRuns('check')[0].note };
      return coworkReadFeed(false).then(again => { out.again = again; out.count = state.sessions.length; return out; });
    });
  }, { a: { gymStart: iso(2), gymEnd: new Date(Date.now() - 2 * DAY + 36e5).toISOString(), oldRun: iso(5), recentRide: iso(3), recentWalk: iso(1), yearAgo: iso(300) } });
  expect(r.ids).toEqual(['111', '222', '333', '555', '888', 'garmin:444']);
  expect(r.kept.name).toBe('Canal loop');                       // a Strava name is never replaced by the feed's type
  expect(r.kept.route).toEqual([0, 0, 50, 50, 100, 100]);
  expect(r.gym.stravaId).toBe('222');                           // the strength workout found its logged session
  expect(r.cardio).toEqual(['111', '333', '888', 'garmin:444']);   // 555 is older than the first read's 30 days
  expect(r.garminLink).toBe(true);
  expect(r.bad.name).toBe('Img src x onerror 1');              // outside text, cleaned; bad numbers dropped
  expect(r.bad.elapsedSec).toBe(null);
  expect(r.bad.avgHr).toBe(null);
  expect(r.note).toMatch(/^fitness feed: /);
  expect(r.again).toEqual({ unchanged: true });                 // same feed again: nothing happens
  expect(r.res.activities).toBe(5);
});

test('feat 590 — weigh-ins: new days added, empty fields filled, a hand-typed day never overwritten', async ({ page }) => {
  const r = await page.evaluate(({ d }) => {
    state.bodyComp = [{ date: d.mine + 'T12:00:00.000Z', weightKg: 82, bodyFatPct: null, waistCm: 86, note: 'by hand', updatedAt: '2026-01-01T00:00:00Z' }];
    _cloud.files.set('shared-body.json', JSON.stringify({ schema: 1, owner: 'runner', updated: 'x', days: [
      { date: d.mine, weight_kg: 90, body_fat_pct: 18.5, source: 'Garmin' },
      { date: d.newDay, weight_kg: 81.4, body_fat_pct: 18.1, muscle_kg: 36.2, bone_kg: 3.4, water_pct: 55, source: 'Garmin' },
      { date: 'yesterday', weight_kg: 80 }, { date: d.newDay2, weight_kg: 5000 }, { date: d.newDay2, weight_kg: 'heavy' } ] }));
    return coworkReadFeed(true).then(res => ({ res, mine: state.bodyComp.find(x => x.note === 'by hand'), n: state.bodyComp.length,
      added: state.bodyComp.find(x => x.date.slice(0, 10) === d.newDay) }));
  }, { d: { mine: ymd(4), newDay: ymd(2), newDay2: ymd(1) } });
  expect(r.mine.weightKg).toBe(82);                    // the hand-typed weight stays
  expect(r.mine.waistCm).toBe(86);                     // and so does the tape measurement
  expect(r.mine.bodyFatPct).toBe(18.5);                // only the empty field was filled
  expect(r.n).toBe(2);
  expect(r.added).toMatchObject({ weightKg: 81.4, bodyFatPct: 18.1, muscleMassKg: 36.2, boneMassKg: 3.4, bodyWaterPct: 55 });
  expect(r.res).toMatchObject({ weighIns: 1, filled: 1 });
});

test('feat 590 — no feed yet, or an unreadable one, is quiet', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const none = await coworkReadFeed(false);
    _cloud.files.set('shared-activities.json', '{not json');
    const broken = await coworkReadFeed(false);
    return { none, broken, runs: coworkRuns('check').length };
  });
  expect(r.none).toBe(null);
  expect(r.broken).toBe(null);
  expect(r.runs).toBe(0);
});
