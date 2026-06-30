// feat 400 — when NO workout has been started today, the workout page shows a compact auto-rotating slideshow of
// review info (recovery, readiness, weekly volume, ready-to-progress, last session, streak).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const DAY = 86400000;

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderLog === 'function' && typeof workoutReviewSlides === 'function'
    && typeof navTo === 'function' && typeof FAMILIES !== 'undefined', null, { timeout: 15000 });
  // a few past-day sessions (none today) so the review slides have something to say
  await page.evaluate((DAY) => {
    state.readonly = false; state.activeGymId = null; state.gyms = [];
    const bench = FAMILIES.find(f => f.id === 'flat-bench-press').variations.find(v => v.uuid).uuid;
    const squat = FAMILIES.find(f => f.id === 'squat').variations.find(v => v.uuid).uuid;
    const now = Date.now();
    const sess = (dAgo, uuid, w) => ({ id: 's' + dAgo, date: new Date(now - dAgo * DAY).toISOString(), endedAt: new Date(now - dAgo * DAY + 36e5).toISOString(),
      exercises: [{ varUuid: uuid, subUuid: null, sets: Array.from({ length: 4 }, () => ({ w, r: 5 })) }] });
    state.sessions = [sess(2, bench, 100), sess(4, squat, 140), sess(6, bench, 95), sess(9, squat, 135)];
  }, DAY);
});

test('feat 400 — workoutReviewSlides builds review cards from history', async ({ page }) => {
  const r = await page.evaluate(() => {
    const slides = workoutReviewSlides();
    return { count: slides.length, labels: slides.map(s => s.label) };
  });
  expect(r.count).toBeGreaterThanOrEqual(2);
  expect(r.labels).toContain('Recovery');   // the example the request named
  expect(r.labels).toContain('Last');       // last workout always available here
});

test('feat 400 — the slideshow shows on the idle workout page (no workout today), one slide active', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('workout');
    const root = document.querySelector('#trk-main #wo-review');
    return {
      present: !!root,
      slides: root ? root.querySelectorAll('.wo-rev-slide').length : 0,
      active: root ? root.querySelectorAll('.wo-rev-slide.active').length : 0,
      dots: root ? root.querySelectorAll('.wo-rev-dot').length : 0,
    };
  });
  expect(r.present).toBe(true);
  expect(r.slides).toBeGreaterThanOrEqual(2);
  expect(r.active).toBe(1);            // exactly one visible at a time
  expect(r.dots).toBe(r.slides);       // a dot per slide
});

test('feat 400 — it is HIDDEN once a workout exists today', async ({ page }) => {
  const present = await page.evaluate(() => {
    state.sessions.push({ id: 'today', date: new Date().toISOString(), exercises: [] }); // a workout today
    navTo('workout');
    return !!document.querySelector('#trk-main #wo-review');
  });
  expect(present).toBe(false);
});

test('feat 400 — tapping a dot switches the active slide', async ({ page }) => {
  const r = await page.evaluate(() => {
    navTo('workout');
    const root = document.querySelector('#trk-main #wo-review');
    const dots = root.querySelectorAll('.wo-rev-dot');
    const slides = root.querySelectorAll('.wo-rev-slide');
    dots[1].click();
    return { activeIdx: [...slides].findIndex(s => s.classList.contains('active')), dotActiveIdx: [...dots].findIndex(d => d.classList.contains('active')) };
  });
  expect(r.activeIdx).toBe(1);
  expect(r.dotActiveIdx).toBe(1);
});

test('feat 400 — tapping the card opens the active slide\'s detail view', async ({ page }) => {
  const page2 = await page.evaluate(() => {
    navTo('workout');
    const root = document.querySelector('#trk-main #wo-review');
    // force the first slide active and read its nav target, then tap the card
    const first = root.querySelector('.wo-rev-slide');
    const nav = first.dataset.revNav;
    root.click();
    return { nav, landed: currentPage };
  });
  // the first slide (Readiness/Recovery/etc.) navigates somewhere real (volume/log/progression) when it has a target
  if (page2.nav) expect(page2.landed).toBe(page2.nav);
});
