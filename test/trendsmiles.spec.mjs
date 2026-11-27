// feats 610–612 — readable trend charts (and group trends as an index), app explorer milestones, the media stable.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof trendChartSvg === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 610 — the trend chart has a value axis, dated ticks, a smoothed line and the best point; groups are an index', async ({ page }) => {
  const r = await page.evaluate(() => {
    const day = 864e5, t0 = Date.now() - 100 * day;
    const pts = Array.from({ length: 20 }, (_, i) => ({ date: t0 + i * 5 * day, v: 200 + i * 2 + (i % 3 ? 6 : -6) }));
    const d = document.createElement('div'); d.innerHTML = trendChartSvg(pts, { unit: 'lb' });
    const fam = id => FAMILIES.find(f => f.id === id).variations[0].uuid;
    state.sessions = [0, 7, 14].map((k, i) => ({ id: 's' + i, date: new Date(t0 + k * day).toISOString(), exercises: [
      { varUuid: fam('flat-bench-press'), sets: [{ w: 200 + i * 10, r: 5 }] }, ...(i === 1 ? [] : [{ varUuid: fam('lateral-raise'), sets: [{ w: 15 + i, r: 12 }] }]) ] }));
    const push = buildGroupedSeries(i => i.family.mega).find(g => g.id === 'push');
    return { yLabels: d.querySelectorAll('.tc-y').length, xLabels: d.querySelectorAll('.tc-x').length, dots: d.querySelectorAll('.tc-dot').length, line: !!d.querySelector('.tc-line'),
      best: !!d.querySelector('.tc-best'), stretched: /preserveAspectRatio="none"/.test(d.innerHTML), push: push.series.map(p => p.oneRM), index: push.index,
      tooFew: trendChartSvg([{ date: 1, v: 1 }]).includes('trend-empty') };
  });
  expect(r.yLabels).toBeGreaterThanOrEqual(3);
  expect(r.xLabels).toBe(4);
  expect(r.dots).toBe(20);
  expect(r.line && r.best).toBe(true);
  expect(r.stretched).toBe(false);
  expect(r.index).toBe(true);
  expect(r.push[0]).toBe(100);                               // everything starts at 100
  expect(r.push[1]).toBeGreaterThan(100);                    // the day without raises does not crash the line
  expect(r.push[1]).toBeLessThan(110);
  expect(r.tooFew).toBe(true);
});

test('feat 611 — app milestones come from your data; the first look is silent, a new one is announced once', async ({ page }) => {
  const r = await page.evaluate(() => {
    const msgs = []; const real = window.toast; window.toast = m => msgs.push(String(m));
    state.sessions = []; state.gyms = []; delete state.appMilestones;
    const first = checkAppMilestones(true);
    state.sessions = [{ id: 'a', date: new Date().toISOString(), exercises: [{ varUuid: [...VAR_INDEX.keys()][0], sets: [{ w: 10, r: 5 }] }] }];
    const fresh = checkAppMilestones(true), again = checkAppMilestones(true);
    const html = renderAppMilestones(), d = document.createElement('div'); d.innerHTML = html;
    window.toast = real;
    return { first, fresh, again, recorded: Object.keys(state.appMilestones), earned: d.querySelectorAll('.am-badge.on').length, tries: d.querySelectorAll('.am-try').length, total: APP_MILESTONES.length };
  });
  expect(r.first).toEqual([]);
  expect(r.fresh).toEqual(['first-workout']);
  expect(r.again).toEqual([]);
  expect(r.recorded).toContain('first-workout');
  expect(r.earned).toBeGreaterThanOrEqual(1);
  expect(r.tries).toBe(r.total - r.earned);
});

test('feat 612 — sources are proposed and audited; the gallery takes clips only from approved sources', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.mediaSources = []; state.exerciseMedia = {};
    const u = FAMILIES.find(f => f.id === 'flat-bench-press').variations[0].uuid;
    state.sessions = [{ id: 'a', date: new Date().toISOString(), exercises: [{ varUuid: u, sets: [{ w: 100, r: 5 }] }] }];
    const p1 = coworkImportMediaSources({ proposals: [{ name: '@goodcoach', platform: 'youtube', url: 'https://www.youtube.com/@goodcoach', focus: 'technique', why: 'fits' },
      { name: '@badlink', url: 'javascript:alert(1)' }] });
    const before = mediaGalleryContext().sources.length;
    setMediaSource('@goodcoach', { status: 'approved' });
    setMediaSource('@nope', { status: 'rejected' });
    const again = coworkImportMediaSources({ proposals: [{ name: '@nope', url: 'https://www.youtube.com/@nope' }], audit: [{ name: '@goodcoach', verdict: 'watch', reason: 'check claims' }] });
    const ctx = mediaGalleryContext();
    const g = coworkImportMediaGallery({ media: [
      { uuid: u, url: 'https://www.youtube.com/watch?v=abc123&ab_channel=goodcoach', source: '@goodcoach' },
      { uuid: u, url: 'https://www.youtube.com/watch?v=zzz999', source: '@nope' },
      { uuid: u, url: 'https://www.tiktok.com/@goodcoach/video/1', source: '@goodcoach' } ] });
    return { p1, before, again, audit: mediaSourceFor('@goodcoach').audit.verdict, nope: mediaSourceFor('@nope').status, wanted: ctx.wanted.map(w => w.uuid), g, clips: (state.exerciseMedia[u] || []).length };
  });
  expect(r.p1).toMatchObject({ handled: true, proposed: 1, skipped: 1 });
  expect(r.before).toBe(0);                    // nothing approved yet: nothing to fetch from
  expect(r.again.proposed).toBe(0);            // a rejected source is never proposed again
  expect(r.audit).toBe('watch');
  expect(r.nope).toBe('rejected');
  expect(r.wanted.length).toBe(1);
  expect(r.g.refused).toBe(2);                 // unapproved source, and the wrong platform for that source
  expect(r.clips).toBe(1);
});
