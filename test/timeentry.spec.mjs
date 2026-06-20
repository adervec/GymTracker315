// feat 288 — time-mode exercises (planks / dead hangs / wall sits / L-sits) record a DURATION, not reps. The
// set column header now reflects that ("TIME", from exMode().rLabel) instead of "REPS", and the value can be
// ENTERED as raw seconds ("90") OR as a clock string ("1:30", "1:05:05"). It's stored as total seconds and shown
// back as a clock. The on-screen numpad gains a ":" key in time mode.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof parseTimeToSeconds === 'function' && typeof formatSecondsClock === 'function'
    && typeof exMode === 'function' && typeof openLogModal === 'function' && typeof renderModal === 'function'
    && typeof commitSetField === 'function' && typeof numpadApplyKey === 'function', null, { timeout: 15000 });
});

const timedVar = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'time') return u; return null; });

test('feat 288 — parseTimeToSeconds accepts raw seconds and hh:mm:ss; formatSecondsClock is its inverse', async ({ page }) => {
  const r = await page.evaluate(() => ({
    raw: parseTimeToSeconds('90'),
    mmss: parseTimeToSeconds('1:30'),
    hmmss: parseTimeToSeconds('1:05:05'),
    partial: parseTimeToSeconds('2:'),       // 2 minutes
    leadColon: parseTimeToSeconds(':45'),    // 45 seconds
    empty: parseTimeToSeconds(''),
    junk: parseTimeToSeconds('1:2:3:4'),
    fmt90: formatSecondsClock(90),
    fmt45: formatSecondsClock(45),
    fmt3905: formatSecondsClock(3905),
  }));
  expect(r.raw).toBe(90);
  expect(r.mmss).toBe(90);
  expect(r.hmmss).toBe(3905);
  expect(r.partial).toBe(120);
  expect(r.leadColon).toBe(45);
  expect(r.empty).toBeNull();
  expect(r.junk).toBeNull();             // >3 parts is invalid
  expect(r.fmt90).toBe('1:30');
  expect(r.fmt45).toBe('0:45');
  expect(r.fmt3905).toBe('1:05:05');
});

test('feat 288 — the set header reads "TIME" (not "REPS") for a timed hold', async ({ page }) => {
  const v = await timedVar(page);
  expect(v).not.toBeNull();
  const r = await page.evaluate((v) => {
    state.readonly = false;
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.open = true; renderModal();
    const hdr = [...document.querySelectorAll('#trk-modal .set-header > div')].map(d => d.textContent);
    return { hdr };
  }, v);
  // header columns: #, weight, reps/time, (rpe?), (remove)
  expect(r.hdr[2]).toBe('Time');
  expect(r.hdr).not.toContain('Reps');
});

test('feat 288 — committing a time field accepts both "90" and "1:30" and stores seconds', async ({ page }) => {
  const v = await timedVar(page);
  const r = await page.evaluate((v) => {
    state.readonly = false;
    pending = { varUuid: v, subUuid: null, sets: [{ w: 0, r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.open = true; renderModal();
    commitSetField(0, 'r', '90');  const raw = pending.sets[0].r;
    commitSetField(0, 'r', '1:30'); const clock = pending.sets[0].r;
    commitSetField(0, 'r', '1:05:05'); const long = pending.sets[0].r;
    return { raw, clock, long };
  }, v);
  expect(r.raw).toBe(90);
  expect(r.clock).toBe(90);
  expect(r.long).toBe(3905);
});

test('feat 288 — the numpad builds a clock buffer via the ":" key in time mode', async ({ page }) => {
  const r = await page.evaluate(() => {
    const opt = { time: true, maxLen: 7 };
    let buf = '';
    for (const k of ['1', 'colon', '3', '0']) buf = numpadApplyKey(buf, k, opt);
    const built = buf;
    const noLead = numpadApplyKey('', 'colon', opt);          // no leading colon
    const noDouble = numpadApplyKey('1:', 'colon', opt);       // no double colon
    const maxColons = numpadApplyKey('1:2:3', 'colon', opt);   // at most two colons
    const blockedWhenNotTime = numpadApplyKey('1', 'colon', { time: false }); // inert outside time mode
    return { built, secs: parseTimeToSeconds(built), noLead, noDouble, maxColons, blockedWhenNotTime };
  });
  expect(r.built).toBe('1:30');
  expect(r.secs).toBe(90);
  expect(r.noLead).toBe('');
  expect(r.noDouble).toBe('1:');
  expect(r.maxColons).toBe('1:2:3');
  expect(r.blockedWhenNotTime).toBe('1');
});
