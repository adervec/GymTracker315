// feat 244 — live status next to the brand: 💓 heart rate (bpm + sparkline) while a monitor is connected,
// and ⏱ workout elapsed while a session is active. Driven by the 1 s rest tick + each HR sample.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof refreshTopbarLive === 'function'
    && typeof _fmtElapsedClock === 'function' && typeof hrOnSample === 'function', null, { timeout: 15000 });
});

test('feat 244 — _fmtElapsedClock formats mm:ss and rolls over to h:mm:ss', async ({ page }) => {
  const r = await page.evaluate(() => ({
    secs: _fmtElapsedClock(7 * 1000),
    mmss: _fmtElapsedClock((7 * 60 + 30) * 1000),
    hmmss: _fmtElapsedClock((65 * 60 + 5) * 1000),
    neg: _fmtElapsedClock(-100),
  }));
  expect(r.secs).toBe('0:07');
  expect(r.mmss).toBe('7:30');
  expect(r.hmmss).toBe('1:05:05');
  expect(r.neg).toBe('0:00');
});

test('feat 244 — shows HR (bpm + spark) when connected and elapsed when active; empty when idle', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; _hrConnected = false; _hrLastBpm = null; _hrSpark = [];
    refreshTopbarLive();
    const el = document.getElementById('topbar-live');
    const idleEmpty = el.innerHTML === '' && !document.body.classList.contains('has-topbar-live');
    // HR connected, no workout → HR only (no elapsed)
    _hrConnected = true; _hrSpark = [120, 124, 128, 126, 130]; _hrLastBpm = 130;
    refreshTopbarLive();
    const hrOnly = { bpm: el.querySelector('.tbl-hr b')?.textContent, spark: !!el.querySelector('svg.spark path'), elapsed: !!el.querySelector('.tbl-elapsed') };
    // + active workout → HR and elapsed
    state.sessions = [{ id: 's', date: new Date(Date.now() - 90 * 1000).toISOString(), updatedAt: new Date().toISOString(), exercises: [] }];
    refreshTopbarLive();
    const both = { bpm: el.querySelector('.tbl-hr b')?.textContent, elapsed: el.querySelector('.tbl-elapsed b')?.textContent, liveClass: document.body.classList.contains('has-topbar-live') };
    return { idleEmpty, hrOnly, both };
  });
  expect(r.idleEmpty).toBe(true);
  expect(r.hrOnly.bpm).toBe('130');
  expect(r.hrOnly.spark).toBe(true);
  expect(r.hrOnly.elapsed).toBe(false);  // no workout → no elapsed yet
  expect(r.both.bpm).toBe('130');
  expect(r.both.elapsed).toBe('1:30');   // ~90 s in → 1:30
  expect(r.both.liveClass).toBe(true);
});

test('feat 244 — HR samples accumulate into the capped sparkline buffer and refresh the topbar', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; _hrSpark = []; _hrConnected = true;
    for (let i = 0; i < 75; i++) hrOnSample(100 + (i % 20)); // overfill the ring buffer
    return { len: _hrSpark.length, last: _hrLastBpm, shown: document.getElementById('topbar-live').querySelector('.tbl-hr b')?.textContent };
  });
  expect(r.len).toBe(60);                 // ring buffer capped at 60
  expect(r.shown).toBe(String(r.last));   // hrOnSample refreshed the topbar to the latest bpm
});
