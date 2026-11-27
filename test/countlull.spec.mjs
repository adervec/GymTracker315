// feat 616 — count your reps aloud and the coach talks you toward a record. feat 617 — the lull: a quiet notice,
// once a workout, when your rests stretch well past your earlier pace; the app learns when you usually drift.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof repCountHear === 'function' && typeof lullDetect === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const seedBench = page => page.evaluate(() => {
  const v = FAMILIES.find(f => f.id === 'flat-bench-press').variations[0].uuid;
  state.unit = 'lb'; state.readonly = false; state.workoutControls = { ...(state.workoutControls || {}), repCount: true };
  state.sessions = [{ id: 'old', date: new Date(Date.now() - 7 * 864e5).toISOString(), exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 185, r: 6 }, { w: 185, r: 5 }] }] },
    { id: 'now', date: new Date(Date.now() - 6e5).toISOString(), exercises: [] }];
  state.coachTalk = { ev: {}, minGap: 0, perMin: 0 }; coachMute('off'); _coachSaid = []; _coachLastText = ''; _coachLastAt = 0;
  window._said = []; window.annunce = txt => window._said.push(String(txt));
  pending = { varUuid: v, subUuid: null, sets: [{ w: 185, r: '' }] };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true; renderModal();
  return v;
});

test('feat 616 — numbers are heard as digits or words, and only the next rep counts', async ({ page }) => {
  const r = await page.evaluate(() => ({ a: repCountNumbers('one two 3 four'), b: repCountNumbers('twenty one, twenty-two'), c: repCountNumbers('weight for the bar'), d: repCountNumbers('') }));
  expect(r.a).toEqual([1, 2, 3, 4]);
  expect(r.b).toEqual([21, 22]);
  expect(r.c).toEqual([4]);            // "for" is only a 4 when the count is at 3 — the counter decides, below
  expect(r.d).toEqual([]);
});

test('feat 616 — counting toward a record: the coach calls the tie and the record, and "done" logs the reps', async ({ page }) => {
  await seedBench(page);
  const r = await page.evaluate(() => {
    const hud = () => document.getElementById('trk-rep-count');
    const T = repCountTargets(pending.varUuid, null, 185);
    repCountHear('for', false);                                  // a stray "for" at zero is not a rep
    const stray = _repCount.n;
    ['one', 'one two', 'one two three', 'four', 'five'].forEach(x => { _repCount.deafUntil = 0; repCountHear(x, false); });   // (a real lifter is slower than the coach's half-second)
    const at5 = { n: _repCount.n, said: window._said.slice() };
    _repCount.deafUntil = 0; repCountHear('nine', false);         // a mishear far ahead is ignored
    const skip = _repCount.n;
    repCountHear('six', false); const at6 = window._said.slice(); _repCount.deafUntil = 0;
    repCountHear('seven', false); const at7 = window._said.slice(), shown = hud().textContent, hidden = hud().hidden; _repCount.deafUntil = 0;
    repCountHear('done', true);
    return { T, stray, at5, skip, at6, at7, shown, hidden, logged: pending.sets[0].r, after: _repCount.n, btn: !!document.getElementById('trk-rep-count-btn') };
  });
  expect(r.T.record).toBe(6);                  // best at 185 is 6 reps
  expect(r.stray).toBe(0);
  expect(r.at5.n).toBe(5);
  expect(r.at5.said.join(' ')).toContain('Two to tie your best');
  expect(r.at5.said.join(' ')).toContain('One to tie your best');
  expect(r.skip).toBe(5);
  expect(r.at6.join(' ')).toContain('One more for a record');
  expect(r.at7.join(' ')).toContain('New rep record');
  expect(r.hidden).toBe(false);
  expect(r.shown).toContain('7');
  expect(String(r.logged)).toBe('7');          // "done" writes the count into the set
  expect(r.after).toBe(0);
  expect(r.btn).toBe(true);
});

test('feat 616 — the coach is not heard as a rep, and the toggle turns it off', async ({ page }) => {
  await seedBench(page);
  const r = await page.evaluate(() => {
    ['one', 'two', 'three', 'four', 'five'].forEach(x => { _repCount.deafUntil = 0; repCountHear(x, false); });   // 5: "One to tie your best."
    const deaf = _repCount.deafUntil > Date.now(), n1 = _repCount.n;
    repCountHear('six', false);                                    // inside the deaf window: the coach's own words
    const n2 = _repCount.n;
    repCountToggle();
    _repCount.deafUntil = 0; const off = repCountHear('six', false);
    return { deaf, n1, n2, off, enabled: repCountEnabled() };
  });
  expect(r.deaf).toBe(true);
  expect(r.n2).toBe(r.n1);
  expect(r.off).toBe(null);
  expect(r.enabled).toBe(false);
});

test('feat 617 — the lull: steady rests are fine, stretched rests are noticed once, and the usual minute is learned', async ({ page }) => {
  const r = await page.evaluate(() => {
    const v = [...VAR_INDEX.keys()][0], t0 = Date.now() - 50 * 60000;
    const mk = (gaps, id, start) => { let t = start; const sets = [{ w: 50, r: 8, ts: new Date(t).toISOString() }]; gaps.forEach(g => { t += g * 1000; sets.push({ w: 50, r: 8, ts: new Date(t).toISOString() }); });
      return { session: { id, date: new Date(start).toISOString(), exercises: [{ varUuid: v, subUuid: null, sets }] }, end: t }; };
    const steady = mk(Array(20).fill(120), 'a', t0), drift = mk(Array(12).fill(110).concat([190, 200, 210]), 'b', t0);
    const none = lullDetect(steady.session, steady.end + 60000), hit = lullDetect(drift.session, drift.end + 30000);
    const early = lullDetect(mk(Array(6).fill(100).concat([220, 230, 240]), 'c', Date.now() - 20 * 60000).session, Date.now());
    const idle = lullDetect(steady.session, steady.end + 9 * 60000);
    const msgs = []; const real = window.toast; window.toast = m => msgs.push(String(m));
    state.sessions = [drift.session]; state.workoutControls = { ...(state.workoutControls || {}) }; delete state.workoutControls.lullWatch;
    _lullAt = 0; lullTick(); const first = msgs.length, rec = state.sessions[0].lull && { min: state.sessions[0].lull.min, why: state.sessions[0].lull.why };
    _lullAt = 0; lullTick(); const second = msgs.length;
    state.sessions = [40, 46, 50].map((m, i) => ({ id: 'p' + i, date: new Date(Date.now() - (i + 2) * 864e5).toISOString(), endedAt: new Date().toISOString(), exercises: [], lull: { min: m } }));
    const usual = lullUsualMinute();
    state.workoutControls.lullWatch = false; state.sessions = [mk(Array(12).fill(110).concat([190, 200, 210]), 'd', t0).session]; _lullAt = 0; lullTick();
    window.toast = real;
    return { none, hit: hit && { why: hit.why, base: Math.round(hit.base), recent: Math.round(hit.recent) }, early, idle: idle && idle.why, first, second, rec, usual, offLull: !!state.sessions[0].lull };
  });
  expect(r.none).toBe(null);
  expect(r.hit).toEqual({ why: 'rests', base: 110, recent: 200 });
  expect(r.early).toBe(null);                 // too early in the workout to call it a lull
  expect(r.idle).toBe('idle');                // nine minutes with no set
  expect(r.first).toBe(1);
  expect(r.second).toBe(1);                   // said once, never nagged
  expect(r.rec.why).toBe('rests');
  expect(r.usual).toBe(46);
  expect(r.offLull).toBe(false);              // switched off: nothing is recorded
});
