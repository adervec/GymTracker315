// feat 353 — optional video music + event sound effects. Covers the (pure) event→sound mapping, that the synth
// helpers run against a real AudioContext without throwing, the normalize defaults, and the wizard's video-only
// music/SFX controls.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof tlVideoEvents === 'function' && typeof tlPlaySfx === 'function'
    && typeof tlMusic === 'function' && typeof buildWorkoutTimelapse === 'function' && typeof renderTimelapseWizard === 'function'
    && typeof VAR_INDEX !== 'undefined', null, { timeout: 15000 });
});

const twoUuids = (page) => page.evaluate(() => { const o = []; for (const [u] of VAR_INDEX) { o.push(u); if (o.length === 2) break; } return o; });

test('tlVideoEvents maps frames to the right sound cues', async ({ page }) => {
  const [ua, ub] = await twoUuids(page);
  const r = await page.evaluate(([ua, ub]) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    state.plans = [{ id: 'PL1', name: 'Day A', rev: 1, revisions: [{ rev: 1, at: iso(T) }], steps: [
      { id: 'st1', sets: 2, options: [{ type: 'variation', uuid: ua }] }, { id: 'st2', sets: 1, options: [{ type: 'variation', uuid: ub }] } ] }];
    const s = { id: 's', date: iso(T), endedAt: iso(T + 120000), planId: 'PL1', planRev: 1, exercises: [
      { varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }, { w: 100, r: 5, ts: iso(T + 30000) }] },
      { varUuid: ub, subUuid: null, sets: [{ w: 50, r: 8, ts: iso(T + 90000) }] } ] };
    const photos = [{ elapsedMs: 60000, seconds: 2 }];
    const plan = buildWorkoutTimelapse(s, { speed: 32, chapters: ['spotlight', 'plan'], photos });
    const types = tlVideoEvents(plan.frames).map(e => e.type);
    return { first: types[0], last: types[types.length - 1], types,
      ticks: types.filter(t => t === 'tick').length, chimes: types.filter(t => t === 'chime').length,
      shutter: types.includes('shutter'), ding: types.includes('ding') };
  }, [ua, ub]);
  expect(r.first).toBe('start');         // title
  expect(r.last).toBe('fanfare');        // final card
  expect(r.chimes).toBeGreaterThanOrEqual(2); // a new exercise starts twice (set1 of each exercise)
  expect(r.ticks).toBeGreaterThanOrEqual(1);  // the 2nd set of exercise 1 is a plain tick
  expect(r.shutter).toBe(true);          // the spliced photo
  expect(r.ding).toBe(true);             // a plan step completed
});

test('the synth helpers run against a real AudioContext without throwing', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return { skip: true };
    const actx = new AC();
    try { if (actx.resume) await actx.resume().catch(() => {}); } catch (_) {}
    const dest = actx.createMediaStreamDestination();
    let ok = true;
    try {
      ['start', 'tick', 'chime', 'ding', 'shutter', 'fanfare'].forEach(t => tlPlaySfx(actx, dest, t, actx.currentTime + 0.01));
      const m = tlMusic(actx, dest, 'epic'); m.start(); m.stop();
      const audioTracks = dest.stream.getAudioTracks().length;
      await actx.close();
      return { skip: false, ok, audioTracks };
    } catch (e) { try { await actx.close(); } catch (_) {} return { skip: false, ok: false, err: String(e) }; }
  });
  if (r.skip) { test.skip(true, 'no AudioContext'); return; }
  expect(r.ok).toBe(true);
  expect(r.audioTracks).toBeGreaterThan(0); // there is an audio track to feed the recorder
});

test('TL_MUSIC_STYLES + state.timelapse audio defaults', async ({ page }) => {
  const r = await page.evaluate(() => ({ styles: TL_MUSIC_STYLES, music: state.timelapse.music, sfx: state.timelapse.sfx }));
  expect(r.styles).toEqual(['off', 'upbeat', 'chill', 'epic']);
  expect(r.music).toBe('off');
  expect(r.sfx).toBe(false);
});

test('the wizard exposes music + SFX controls only for the video format', async ({ page }) => {
  const [ua] = await twoUuids(page);
  const r = await page.evaluate((ua) => {
    const T = Date.parse('2026-06-20T10:00:00Z'), iso = ms => new Date(ms).toISOString();
    const s = { id: 's', date: iso(T), endedAt: iso(T + 60000), exercises: [{ varUuid: ua, subUuid: null, sets: [{ w: 100, r: 5, ts: iso(T) }] }] };
    // GIF format → no audio controls
    state.timelapse = { ...state.timelapse, format: 'gif' };
    const dg = document.createElement('div'); document.body.appendChild(dg);
    renderTimelapseWizard(dg, { preset: 'session' }, s, 'wk');
    const gifHasMusic = !!dg.querySelector('[data-music]');
    // Video format → music + SFX controls present (only meaningful if video is supported here)
    let videoHasMusic = null, videoHasSfx = null, supported = (typeof timelapseVideoSupported === 'function' && timelapseVideoSupported());
    if (supported) {
      state.timelapse = { ...state.timelapse, format: 'video' };
      const dv = document.createElement('div'); document.body.appendChild(dv);
      renderTimelapseWizard(dv, { preset: 'session' }, s, 'wk');
      videoHasMusic = dv.querySelectorAll('[data-music]').length;
      videoHasSfx = dv.querySelectorAll('[data-sfx]').length;
      dv.remove();
    }
    dg.remove();
    return { gifHasMusic, videoHasMusic, videoHasSfx, supported };
  }, ua);
  expect(r.gifHasMusic).toBe(false);
  if (!r.supported) { test.skip(true, 'video not supported here'); return; }
  expect(r.videoHasMusic).toBe(5);  // Off / Upbeat / Chill / Epic / Custom…
  expect(r.videoHasSfx).toBe(2);    // On / Off
});
