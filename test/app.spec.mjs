// Behavioral suite: load the real single-file app in headless Chromium and
// exercise it the way the in-app preview checks do. Each test gets a fresh,
// isolated browser context (its own localStorage), so mutations never leak.
//
// What this covers that the static checks can't:
//   - the inline script actually RUNS (boot + first render) with no errors
//   - the pure helpers compute the right numbers (regressions in plate math,
//     1RM, unit conversion, media parsing, plan estimates)
//   - the state plumbing (normalizeState -> saveState -> localStorage) keeps
//     the sync defaults it's supposed to
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

let consoleErrors;
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + (err && err.message ? err.message : String(err))));
  await page.goto(APP, { waitUntil: 'load' });
  // Wait until the inline script has defined its globals (boot finished).
  await page.waitForFunction(() => typeof window.normalizeState === 'function', null, { timeout: 15000 });
});

test('boots cleanly and renders the shell', async ({ page }) => {
  // Render ran on load -> the nav tabs exist.
  expect(await page.locator('.nav-tab').count()).toBeGreaterThan(0);
  expect(await page.locator('.panel').count()).toBeGreaterThan(0);
  expect(consoleErrors, 'console/page errors during boot:\n' + consoleErrors.join('\n')).toEqual([]);
});

test('critical functions are exposed', async ({ page }) => {
  const missing = await page.evaluate(() => {
    const names = [
      'normalizeState', 'saveState', 'loadState', 'render', 'parseMediaUrl', 'estimated1RM',
      'lbToKg', 'kgToLb', 'autoLoadSupported', 'solveSetupState', 'autoSetupKind', 'setupTotal',
      'estimatePlanMinutes', 'intensityDots', 'importStravaActivities', 'stravaLoadNow',
      'bioLoadNow', 'choiceDialog', 'confirmDialog', 'promptDialog', 'switchPanel',
      'rpeMode', 'rpeEnabled', 'estimated1RMSet', 'rpeSelectHtml', 'commitSetRPE',
    ];
    return names.filter((n) => typeof window[n] !== 'function');
  });
  expect(missing, 'these globals are not functions').toEqual([]);
});

test('estimated1RM (Epley) matches the formula', async ({ page }) => {
  const r = await page.evaluate(() => ({
    one: estimated1RM(100, 1),
    zero: estimated1RM(100, 0),
    neg: estimated1RM(80, -3),
    ten: estimated1RM(100, 10),
    five: estimated1RM(60, 5),
  }));
  expect(r.one).toBe(100);   // 1 rep -> the weight itself
  expect(r.zero).toBe(0);    // 0 reps -> guard
  expect(r.neg).toBe(0);     // negative reps -> guard
  expect(r.ten).toBe(133);   // round(100 * (1 + 10/30))
  expect(r.five).toBe(70);   // round(60 * (1 + 5/30))
});

test('feat 261 — RPE/RIR is off by default and maps scales + adjusts e1RM when on', async ({ page }) => {
  const r = await page.evaluate(() => {
    const prev = state.workoutControls.rpeMode;
    const out = {};
    // Default: the feature is fully hidden — no enablement, no per-set <select>.
    out.defaultMode = rpeMode();
    out.defaultEnabled = rpeEnabled();
    out.hiddenSelect = rpeSelectHtml({ w: 100, r: 5 }, 0);     // '' when off
    out.adjNoRpe = estimated1RMSet({ w: 100, r: 5 });          // == raw Epley when no rpe present
    out.epley5 = estimated1RM(100, 5);
    // RPE mode on.
    state.workoutControls.rpeMode = 'rpe';
    out.rpeEnabled = rpeEnabled();
    out.toRir = [rpeToRir(10), rpeToRir(8), rpeToRir(6)];      // 0, 2, 4
    out.adjRpe8 = estimated1RMSet({ w: 100, r: 5, rpe: 8 });   // reps-to-failure 7 → Epley(100,7)
    out.epley7 = estimated1RM(100, 7);
    out.selectIsSelect = /^<select class="set-rpe"/.test(rpeSelectHtml({ w: 100, r: 5 }, 0));
    // RIR mode round-trips the canonical RPE store.
    state.workoutControls.rpeMode = 'rir';
    out.toRpe = [rirToRpe(0), rirToRpe(2), rirToRpe(4)];       // 10, 8, 6
    state.workoutControls.rpeMode = prev;
    return out;
  });
  expect(r.defaultMode).toBe('off');
  expect(r.defaultEnabled).toBe(false);
  expect(r.hiddenSelect).toBe('');
  expect(r.adjNoRpe).toBe(r.epley5);          // untagged sets keep the original 1RM estimate
  expect(r.rpeEnabled).toBe(true);
  expect(r.toRir).toEqual([0, 2, 4]);
  expect(r.adjRpe8).toBe(r.epley7);           // RPE 8 ⇒ 2 in reserve ⇒ sharper e1RM
  expect(r.selectIsSelect).toBe(true);
  expect(r.toRpe).toEqual([10, 8, 6]);
});

test('feat 262 — recovery readiness: recent hard work reads fatigued, rested groups read fresh', async ({ page }) => {
  const r = await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000;
    const bench = findVar('flat-bench-press'), squat = findVar('squat');
    state.sessions = [
      { date: new Date(now - 6 * 3600000).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{w:100,r:5},{w:100,r:5},{w:100,r:5},{w:100,r:5},{w:100,r:5}] }] }, // chest, 6h ago, hard
      { date: new Date(now - 9 * day).toISOString(), exercises: [{ varUuid: squat, subUuid: null, sets: [{w:140,r:5},{w:140,r:5},{w:140,r:5}] }] },                          // quads, 9 days ago
      { date: new Date(now - 20 * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{w:95,r:5}] }] },                                                  // gives a chest reference load
    ];
    const rec = recoveryReadiness(now);
    return { bench: !!bench, squat: !!squat, chest: rec.chest.readiness, quads: rec.quads.readiness, card: renderRecoveryCard() };
  });
  expect(r.bench).toBe(true);
  expect(r.squat).toBe(true);
  expect(r.chest).toBeLessThan(0.4);     // trained hard 6h ago → fatigued
  expect(r.quads).toBeGreaterThan(0.8);  // 9 days of rest → fresh
  expect(r.card).toContain('Recovery');
});

test('feat 263 — plateau detection flags a flat lift but not a climbing one', async ({ page }) => {
  const r = await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000, bench = findVar('flat-bench-press');
    const mk = (d, w, rr) => ({ date: new Date(now - d * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w, r: rr }] }] });
    state.sessions = [ mk(28,100,5), mk(21,98,5), mk(14,99,5), mk(7,98,5), mk(1,99,5) ]; // best e1RM is the oldest → flat since
    const stalled = detectPlateau(bench, null);
    const stallList = findPlateaus().length;
    const card = renderPlateauCard();
    state.sessions = [ mk(28,90,5), mk(21,92,5), mk(14,94,5), mk(7,96,5), mk(1,100,5) ]; // climbing → newest is best
    const climbing = detectPlateau(bench, null);
    return { stalled, stallList, card, climbing };
  });
  expect(r.stalled && r.stalled.stalled).toBe(true);
  expect(r.stalled.sessions).toBe(4);
  expect(r.stallList).toBeGreaterThanOrEqual(1);
  expect(r.card).toContain('plateau');
  expect(r.climbing).toBeNull();         // a progressing lift must not be flagged
});

test('feat 264 — RPE autoregulates the next-load target, and a stall proposes a deload', async ({ page }) => {
  const r = await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000, bench = findVar('flat-bench-press');
    const one = (daysAgo, w, rr, rpe) => ({ date: new Date(now - daysAgo * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w, r: rr, rpe }] }] });
    const out = {};
    state.workoutControls.rpeMode = 'rpe';
    // Easy top set (RPE 6) mid-range → push 2 reps.
    state.sessions = [ one(2, 100, 8, 6) ];
    out.easy = suggestProgression(bench);
    // All-out top set (RPE 10) → hold and consolidate.
    state.sessions = [ one(2, 100, 8, 10) ];
    out.maxed = suggestProgression(bench);
    // No RPE → unchanged standard double progression (add a rep at mid-range).
    state.sessions = [ one(2, 100, 8) ];
    out.plain = suggestProgression(bench);
    // A flat-for-weeks lift → deload suggestion (overrides progression).
    state.sessions = [ one(26, 100, 5), one(19, 99, 5), one(12, 99, 5), one(6, 99, 5) ];
    out.stalled = suggestProgression(bench);
    out.varStall = !!detectPlateauVar(bench);
    return out;
  });
  expect(r.easy.action).toBe('add-reps');
  expect(r.easy.next.r).toBe(10);          // 8 → +2 reps when there's plenty in reserve
  expect(r.maxed.action).toBe('hold');     // RPE 10 → consolidate, don't add
  expect(r.maxed.next.r).toBe(8);
  expect(r.plain.action).toBe('add-reps'); // no RPE → original behavior preserved
  expect(r.plain.next.r).toBe(9);
  expect(r.stalled.action).toBe('deload'); // stall → back off ~10%
  expect(r.stalled.next.w).toBeLessThan(100);
  expect(r.varStall).toBe(true);
});

test('feat 265 — recovery hint shows for a just-trained group, hides for a rested one', async ({ page }) => {
  const r = await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000, bench = findVar('flat-bench-press'), curl = findVar('bicep-curl');
    state.sessions = [
      { date: new Date(now - 4 * 3600000).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{w:100,r:5},{w:100,r:5},{w:100,r:5},{w:100,r:5},{w:100,r:5}] }] }, // chest 4h ago, hard
      { date: new Date(now - 18 * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{w:95,r:5}] }] }, // chest reference load
    ];
    const benchGroup = exerciseDominantGroup(bench);
    const benchHint = exerciseRecoveryHint(bench);  // chest fatigued → present
    const curlHint = curl ? exerciseRecoveryHint(curl) : 'skip'; // biceps never trained here → null
    return { benchGroup, benchHint, curlHint };
  });
  expect(r.benchGroup).toBe('chest');
  expect(r.benchHint).not.toBeNull();
  expect(r.benchHint.pct).toBeLessThan(60);          // recently hammered
  expect(r.curlHint === null || r.curlHint === 'skip').toBe(true); // fresh/untrained → no hint
});

test('feat 267 — workout export tags sets with effort when enabled, omits it when off', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fv = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const bench = fv('flat-bench-press');
    const session = { id: 'x', date: new Date().toISOString(), endedAt: new Date().toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 100, r: 5, rpe: 8 }, { w: 100, r: 5 }] }] };
    state.sessions = [session];
    state.workoutControls.rpeMode = 'off'; const off = buildWorkoutText([session], { preset: 'session' });
    state.workoutControls.rpeMode = 'rpe'; const on = buildWorkoutText([session], { preset: 'session' });
    state.workoutControls.rpeMode = 'rir'; const rir = buildWorkoutText([session], { preset: 'session' });
    return { off, on, rir };
  });
  expect(r.off).not.toContain('@8');         // fully hidden when off
  expect(r.on).toContain('100×5 @8');        // RPE tag on the tagged set
  expect(r.on).toContain('100×5 @8, 100×5'); // the untagged second set stays bare
  expect(r.rir).toContain('(2 RIR)');        // same value via the RIR lens
});

test('feat 268 — active-workout recovery strip renders chips, gated by history + the dashboard toggle', async ({ page }) => {
  await page.evaluate(() => {
    const fv = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000, bench = fv('flat-bench-press'), squat = fv('squat');
    state.sessions = [
      { id: 'today', date: new Date(now - 1800000).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] }, // active (no endedAt)
      { id: 'old', date: new Date(now - 2 * day).toISOString(), exercises: [{ varUuid: squat, subUuid: null, sets: [{ w: 140, r: 5 }] }] },
    ];
    saveState(); currentTab = 'log'; render();
  });
  expect(await page.locator('#rstrip-card').count()).toBeGreaterThan(0);   // shows on the live dashboard
  expect(await page.locator('#rstrip-card .rstrip-chip').count()).toBeGreaterThan(0);
  const empty = await page.evaluate(() => { const s = state.sessions; state.sessions = []; const h = renderRecoveryStrip(); state.sessions = s; return h; });
  expect(empty).toBe('');                                                  // no history → no strip
  await page.evaluate(() => { state.dashboard.recovery = false; saveState(); render(); });
  expect(await page.locator('#rstrip-card').count()).toBe(0);              // dashboard toggle hides it
});

test('feat 262/263 — Volume and Trends panels render the new cards with no console errors', async ({ page }) => {
  await page.evaluate(() => {
    const findVar = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000, bench = findVar('flat-bench-press'), squat = findVar('squat');
    const mk = (d, w, rr) => ({ date: new Date(now - d * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w, r: rr }] }] });
    state.sessions = [ mk(28,100,5), mk(21,98,5), mk(14,99,5), mk(7,98,5), mk(0.2,99,5),
      { date: new Date(now - 0.5 * day).toISOString(), exercises: [{ varUuid: squat, subUuid: null, sets: [{w:140,r:5},{w:140,r:5}] }] } ];
    state.workoutControls.rpeMode = 'rpe'; // also exercise the RPE-on render path
    saveState();
  });
  await page.evaluate(() => { currentTab = 'volume'; render(); });
  expect(await page.locator('.rec-card').count()).toBeGreaterThan(0);
  await page.evaluate(() => { currentTab = 'trends'; render(); });
  expect(await page.locator('.plateau-card').count()).toBeGreaterThan(0);
  expect(consoleErrors, 'console/page errors:\n' + consoleErrors.join('\n')).toEqual([]);
});

test('kg/lb conversion is exact and round-trips', async ({ page }) => {
  const r = await page.evaluate(() => ({ lb: kgToLb(100), back: lbToKg(kgToLb(73)) }));
  expect(r.lb).toBeCloseTo(220.46226218, 5);
  expect(r.back).toBeCloseTo(73, 9);
});

test('parseMediaUrl extracts platform + id (or rejects junk)', async ({ page }) => {
  const r = await page.evaluate(() => ({
    yt: parseMediaUrl('https://youtu.be/dQw4w9WgXcQ'),
    shorts: parseMediaUrl('https://www.youtube.com/shorts/abc123_-XYZ'),
    watch: parseMediaUrl('youtube.com/watch?v=AbC123dEf45'),
    tk: parseMediaUrl('https://www.tiktok.com/@user/video/1234567890123456789'),
    ig: parseMediaUrl('https://www.instagram.com/reel/CxYz12/'),
    link: parseMediaUrl('example.com/guide'),
    empty: parseMediaUrl(''),
    junk: parseMediaUrl('not a url'),
  }));
  expect(r.yt.platform).toBe('youtube');
  expect(r.yt.vid).toBe('dQw4w9WgXcQ');
  expect(r.yt.embedUrl).toContain('/embed/dQw4w9WgXcQ');
  expect(r.shorts.vid).toBe('abc123_-XYZ');
  expect(r.watch.vid).toBe('AbC123dEf45');
  expect(r.tk.platform).toBe('tiktok');
  expect(r.tk.vid).toBe('1234567890123456789');
  expect(r.ig.platform).toBe('instagram');
  expect(r.ig.vid).toBe('CxYz12');
  expect(r.link.platform).toBe('link');
  expect(r.empty).toBeNull();
  expect(r.junk).toBeNull();
});

test('plan estimates are sane', async ({ page }) => {
  const r = await page.evaluate(() => ({
    empty: estimatePlanMinutes({ steps: [] }),
    two: estimatePlanMinutes({ steps: [{ sets: 5 }, { sets: 5 }] }),
    dots3: intensityDots({ intensity: 3 }),
    dots5: intensityDots({ intensity: 5 }),
    dotsDefault: intensityDots({}),
  }));
  expect(r.empty).toBe(15);            // floor of 15 min
  expect(r.two).toBe(30);              // round((10*2.5 + 2)/15)*15
  expect(r.two % 15).toBe(0);
  expect(r.dots3).toBe('●●●○○');
  expect(r.dots5).toBe('●●●●●');
  expect(r.dotsDefault).toBe('●●●○○'); // default intensity 3
});

test('2-hour seed plans exist, estimate ~120 min, and reference real movements (feat 126)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = ['seed-fullbody-2h', 'seed-legs-2h', 'seed-chestback-2h', 'seed-shouldersarms-2h'];
    const seeds = cloneSeedPlans();
    const famIds = new Set(FAMILIES.map((f) => f.id)); // FAMILIES already merged EXTRA_FAMILIES at init
    const mins = {};
    let allMovesValid = true;
    ids.forEach((id) => {
      const p = seeds.find((s) => s.id === id);
      mins[id] = p ? estimatePlanMinutes(p) : null;
      if (!p) { allMovesValid = false; return; }
      p.steps.forEach((st) => (st.options || []).forEach((o) => { if (o.type === 'movement' && !famIds.has(o.familyId)) allMovesValid = false; }));
    });
    return { mins, allMovesValid, allPresent: ids.every((id) => seeds.some((s) => s.id === id)) };
  });
  expect(r.allPresent).toBe(true);
  expect(r.allMovesValid).toBe(true); // every step references a real movement family (no typos)
  expect(r.mins['seed-fullbody-2h']).toBe(120);
  expect(r.mins['seed-legs-2h']).toBe(120);
  expect(r.mins['seed-chestback-2h']).toBe(120);
  expect(r.mins['seed-shouldersarms-2h']).toBe(120);
});

test('autoLoadSupported returns a boolean', async ({ page }) => {
  const t = await page.evaluate(() => typeof autoLoadSupported());
  expect(t).toBe('boolean');
});

test('normalizeState fills the sync defaults and persists them', async ({ page }) => {
  const st = await page.evaluate(() => {
    normalizeState();
    saveState();
    return JSON.parse(localStorage.getItem('overload_tracker_v2'));
  });
  expect(st.stravaAutoLoad).toEqual({ enabled: false, mode: 'folder' });
  expect(st.bioAutoLoad.enabled).toBe(false);
  expect(st.bioAutoLoad.mode).toBe('folder');
});

test('importStravaActivities merges silently without a toast', async ({ page }) => {
  const out = await page.evaluate(() => {
    // #trk-toast is always in the DOM; toast() pops it by adding the `show` class.
    // Clear it first so we isolate whether the silent import pops one.
    const toastEl = document.getElementById('trk-toast');
    if (toastEl) toastEl.classList.remove('show');
    const sample = JSON.stringify({
      activities: [{
        id: 999000001, name: 'Strength', sport_type: 'WeightTraining',
        start_date: '2026-06-01T17:00:00Z', elapsed_time: 3600,
        average_heartrate: 121, max_heartrate: 150, calories: 305,
      }],
    });
    const res = importStravaActivities(sample, { silent: true });
    return { res, toastShown: !!(toastEl && toastEl.classList.contains('show')) };
  });
  expect(out.res).toBeTruthy();
  expect(out.res.strength).toBeGreaterThanOrEqual(1);
  expect(out.res.added).toBeGreaterThanOrEqual(1);
  expect(out.toastShown, 'silent import must not pop a toast').toBe(false);
});
