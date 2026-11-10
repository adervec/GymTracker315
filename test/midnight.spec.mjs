// A workout that crosses midnight must stay the live workout. getActiveSession() used to require the
// session to have started "today", so at 00:00 a 23:30 workout stopped being active: the heartbeat,
// the auto-end check, the live timers and the wake-lock all stopped, and the timer specs failed
// whenever CI happened to run between 00:00 and ~02:30 UTC. The clock is pinned here so this runs
// the same at any hour and in any time zone.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

// 23:30 on a fixed evening in an explicit zone (Brazil has no DST since 2019), so the test means the
// same thing on any machine and at any hour; the config's UTC pin is overridden for this file.
test.use({ timezoneId: 'America/Sao_Paulo' });
const lateEvening = () => new Date('2026-03-10T23:30:00-03:00');

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: lateEvening() });
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof getActiveSession === 'function' && typeof maybeAutoEndActive === 'function',
    null, { timeout: 15000 });
});

const seed = (page, sessions) => page.evaluate((list) => {
  state.sessions = list;
  state.workoutControls = { ...(state.workoutControls || {}), autoEndMinutes: 40 };
}, sessions);

test('a workout started at 23:30 is still the live workout after midnight', async ({ page }) => {
  const start = lateEvening();
  await seed(page, [{ id: 'late', date: start.toISOString(), exercises: [
    { varUuid: 'x', subUuid: null, sets: [{ w: 100, r: 5, ts: new Date(start.getTime() + 50 * 60000).toISOString() }] }] }]);
  await page.clock.fastForward('01:00:00'); // 00:30, twenty minutes after the last set (00:20)
  const r = await page.evaluate(() => ({
    newDay: new Date().getDate() !== new Date(getActiveSession()?.date || 0).getDate(),
    active: getActiveSession()?.id || null,
    autoEnded: maybeAutoEndActive(),
  }));
  expect(r.newDay, 'the clock really crossed midnight').toBe(true);
  expect(r.active, 'still the live workout').toBe('late');
  expect(r.autoEnded, 'twenty idle minutes is inside the 40-minute auto-end').toBe(false);
});

test('after midnight the inactivity auto-end still ends it', async ({ page }) => {
  const start = lateEvening();
  await seed(page, [{ id: 'late', date: start.toISOString(), exercises: [
    { varUuid: 'x', subUuid: null, sets: [{ w: 100, r: 5, ts: new Date(start.getTime() + 5 * 60000).toISOString() }] }] }]);
  await page.clock.fastForward('01:30:00'); // 01:00, fifty-five minutes after the last set
  // The app's own render loop may already have ended it during the fast-forward; either way it must be ended.
  const r = await page.evaluate(() => { maybeAutoEndActive(); return { reason: state.sessions[0].endReason, active: getActiveSession() }; });
  expect(r.reason).toBe('auto-inactivity');
  expect(r.active).toBeNull();
});

test('a forgotten, never-ended session from days ago does not come back', async ({ page }) => {
  const old = new Date(lateEvening().getTime() - 3 * 864e5);
  await seed(page, [{ id: 'old', date: old.toISOString(), exercises: [] }]);
  expect(await page.evaluate(() => getActiveSession())).toBeNull();
});

test('a legacy session with no exercises array does not break the lookup', async ({ page }) => {
  const old = new Date(lateEvening().getTime() - 2 * 864e5);
  await seed(page, [{ id: 'legacy', date: old.toISOString() }]);
  expect(await page.evaluate(() => getActiveSession())).toBeNull();
});

// House standard: a calendar day is the local day. Run the day helpers on both sides of UTC at a
// late-evening hour, where UTC is already "tomorrow" (west) or still "yesterday" at local midnight (east).
for (const tz of ['America/Sao_Paulo', 'Asia/Tokyo']) {
  test.describe(`local days in ${tz}`, () => {
    test.use({ timezoneId: tz });
    test('today, CSV days and the mesocycle Monday follow the local calendar', async ({ page }) => {
      const r = await page.evaluate(() => {
        const local = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const now = new Date();
        const lateTonight = new Date(now); lateTonight.setHours(22, 30, 0, 0);
        mesoCfg().start = null; mesoRestart();
        return {
          today: _isoToday(), expectToday: local(now),
          csvDay: _dDay(lateTonight.toISOString()), expectCsv: local(lateTonight),
          mesoStoredIsMonday: new Date(mesoCfg().start + 'T00:00:00').getDay(),
          mesoReadBackDay: mesoStartMonday().getDay(),
        };
      });
      expect(r.today).toBe(r.expectToday);
      expect(r.csvDay, 'a 22:30 workout belongs to that evening, not the next UTC day').toBe(r.expectCsv);
      expect(r.mesoStoredIsMonday, 'stored start is a Monday').toBe(1);
      expect(r.mesoReadBackDay, 'and reads back as that Monday, not the Sunday before').toBe(1);
    });
  });
}
