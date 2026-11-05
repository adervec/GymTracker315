// feat 543 — vendor-neutral wearable recovery metrics (Garmin / Whoop / Oura / Suunto …), trended against your
// own baseline and fed into the next-set coach; and the coach's factors can each be switched off.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof recoveryNextSetAdjust === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
    null, { timeout: 15000 });
  await page.evaluate(() => {
    state.unit = 'kg'; state.recoveryLog = []; state.exerciseMaxW = {};
    state.workoutControls = state.workoutControls || {}; delete state.workoutControls.nsFactors;
    window._day = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    window._baseline = (today) => {
      const rows = [];
      for (let d = 28; d >= 1; d--) rows.push({ date: _day(d), hrv: 60 + (d % 5), restingHr: 50 + (d % 3), sleepScore: 80 + (d % 7), sleepMin: 440, readiness: 60 + (d % 15), respiration: 14.5 });
      rows.push({ date: _day(0), ...today });
      state.recoveryLog = []; importBiometrics(JSON.stringify({ recovery: rows }), { silent: true });
    };
    let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.id === 'bb-flat-bench') { v = u; break; }
    window._v = v;
    const at = d => new Date(Date.now() - d * 864e5).toISOString();
    state.sessions = [{ id: 'h4', date: at(4), endedAt: at(4), exercises: [{ varUuid: v, sets: [{ w: 100, r: 8 }, { w: 100, r: 7 }] }] },
      { id: 'h8', date: at(8), endedAt: at(8), exercises: [{ varUuid: v, sets: [{ w: 100, r: 7 }] }] },
      { id: 'live', date: new Date().toISOString(), exercises: [] }];
    pending = { varUuid: v, subUuid: null, sets: [] };
  });
});

test('feat 543 — any vendor\'s field names land on the same metrics', async ({ page }) => {
  const r = await page.evaluate(() => {
    importBiometrics(JSON.stringify({ recovery: [
      { date: '2026-06-01', hrvRmssd: 58, rhr: 49, recoveryScore: 71, dayStrain: 14.2, respiratoryRate: 14.9, skinTempDelta: 0.2, sleepHours: 7.5, source: 'whoop' },
      { date: '2026-06-02', readinessScore: 82, temperatureDeviation: -0.1, lowestHr: 47, sleepNote: '6h45m', source: 'oura' },
    ] }), { silent: true });
    const by = {}; state.recoveryLog.forEach(x => by[x.date.slice(0, 10)] = x);
    return { w: by['2026-06-01'], o: by['2026-06-02'] };
  });
  expect(r.w).toMatchObject({ hrv: 58, restingHr: 49, readiness: 71, strain: 14.2, respiration: 14.9, skinTempDev: 0.2, sleepMin: 450, source: 'whoop' });
  expect(r.o).toMatchObject({ readiness: 82, skinTempDev: -0.1, restingHr: 47, sleepMin: 405, source: 'oura' });
});

test('feat 543 — a bad night shades the next set, against YOUR baseline, with signals not stacked', async ({ page }) => {
  const r = await page.evaluate(() => {
    _baseline({ hrv: 61, restingHr: 51, sleepScore: 83, sleepMin: 440, readiness: 66, respiration: 14.5 });
    const normal = nextSetCoach(_v, null);
    _baseline({ hrv: 45, restingHr: 57, sleepScore: 60, sleepMin: 300, readiness: 28, respiration: 14.5 });
    const bad = nextSetCoach(_v, null), adj = recoveryNextSetAdjust(recoveryToday());
    _baseline({ hrv: 61, restingHr: 51, sleepScore: 83, sleepMin: 440, readiness: 66, respiration: 16 });  // breathing up
    const ill = recoveryNextSetAdjust(recoveryToday());
    return { normal: normal.avail, bad: bad.avail, why: bad.why.join(' | '), p: adj.p, illness: ill.illness, illLines: ill.lines.join(' | ') };
  });
  expect(r.bad).toBeLessThan(r.normal);
  expect(r.why).toMatch(/HRV 45 vs your 6\d/);
  expect(r.why).toContain('Readiness 28');
  expect(r.why).toContain('counted once in full');
  expect(r.p).toBeLessThanOrEqual(0.07);
  expect(r.p).toBeGreaterThan(0.03);
  expect(r.illness).toBe(true);
  expect(r.illLines).toContain('coming down with something');
});

test('feat 543 — a stale reading (> 36 h old) is ignored', async ({ page }) => {
  const r = await page.evaluate(() => {
    importBiometrics(JSON.stringify({ recovery: [{ date: _day(3), readiness: 10 }] }), { silent: true });
    return { rt: recoveryToday(), adj: recoveryNextSetAdjust(recoveryToday()) };
  });
  expect(r.rt.stale).toBe(true);
  expect(r.adj).toBeNull();
});

test('feat 543 — each next-set factor can be switched off (default: all on), and the why list says so', async ({ page }) => {
  const r = await page.evaluate(() => {
    _baseline({ hrv: 45, restingHr: 57, sleepScore: 60, readiness: 28 });
    const allOn = NS_FACTORS.every(([k]) => nsOn(k));
    const on = nextSetCoach(_v, null);
    nsToggleFactor('bio');
    const off = nextSetCoach(_v, null);
    _done = (w, r, ago) => pending.sets.push({ w, r, wTs: new Date(Date.now() - (ago + 40) * 1000).toISOString(), ts: new Date(Date.now() - ago * 1000).toISOString() });
    _done(100, 7, 20);
    const restOn = nextSetCoach(_v, null).why.some(x => x.startsWith('⏱'));
    nsToggleFactor('rest');
    const restOff = nextSetCoach(_v, null);
    nsToggleFactor('bio'); nsToggleFactor('rest');
    return { allOn, onAvail: on.avail, offAvail: off.avail, offWhy: off.why.join(' | '), restOn, restOffHasRest: restOff.why.some(x => x.startsWith('⏱')),
      restOffNote: restOff.why.slice(-1)[0], back: NS_FACTORS.every(([k]) => nsOn(k)) };
  });
  expect(r.allOn).toBe(true);
  expect(r.offAvail).toBeGreaterThan(r.onAvail);
  expect(r.offWhy).not.toContain('HRV');
  expect(r.offWhy).toContain('Switched off: 🩺 Sleep & recovery');
  expect(r.restOn).toBe(true);
  expect(r.restOffHasRest).toBe(false);
  expect(r.restOffNote).toContain('⏱ Rest');
  expect(r.back).toBe(true);
});

test('feat 543 — the switches live in the why panel and in Settings', async ({ page }) => {
  const r = await page.evaluate(() => {
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    document.querySelector('#trk-nextset [data-ns-why]').click();
    const chips = document.querySelectorAll('#trk-nextset [data-ns-factor]').length;
    document.querySelector('#trk-nextset [data-ns-factor="hr"]').click();
    const hrOff = !nsOn('hr');
    closeLogModal();
    renderSettingsDrawer();
    document.querySelector('#settings-drawer-body [data-ns-factor="hr"]').click();
    return { chips, hrOff, hrBack: nsOn('hr') };
  });
  expect(r.chips).toBe(10);
  expect(r.hrOff).toBe(true);
  expect(r.hrBack).toBe(true);
});

test('feat 543 — the Body page trends each metric against your baseline', async ({ page }) => {
  const r = await page.evaluate(() => {
    _baseline({ hrv: 45, restingHr: 57, sleepScore: 60, sleepMin: 300, readiness: 28, respiration: 14.5 });
    const html = renderRecoveryLog();
    const w = document.createElement('div'); w.innerHTML = html;
    const row = lbl => [...w.querySelectorAll('.rcv-trend')].find(x => x.textContent.includes(lbl));
    return { n: w.querySelectorAll('.rcv-trend').length, hrvBad: row('HRV').querySelector('.rcv-t-d').className, rhrBad: row('Resting HR').querySelector('.rcv-t-d').className,
      details: !!w.querySelector('details.rcv-details'), spark: !!row('HRV').querySelector('polyline') };
  });
  expect(r.n).toBe(6);
  expect(r.hrvBad).toContain('bad');      // lower HRV is worse
  expect(r.rhrBad).toContain('bad');      // higher resting HR is worse
  expect(r.details).toBe(true);
  expect(r.spark).toBe(true);
});

test('feat 543 — the cowork wearable channel asks for every metric', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const ctx = buildChannelContext('garmin'), md = buildInstructionsMd('garmin');
    return { wanted: ctx.fieldsWanted.map(f => f.key), md: ['readiness', 'skinTempDev', 'Whoop', 'Oura', 'recoveryScore'].every(k => md.includes(k)) };
  });
  expect(r.wanted).toEqual(expect.arrayContaining(['hrv', 'restingHr', 'sleepMin', 'readiness', 'strain', 'respiration', 'spo2', 'skinTempDev', 'vo2max']));
  expect(r.md).toBe(true);
});
