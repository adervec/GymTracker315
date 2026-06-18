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
      'aiExportWriteNow', 'aiExportPickFolder', 'aiExportMaybeDaily', 'aiExportOnWorkoutEnd', 'aiExportScopeLabel',
      'markGlossRead', 'isGlossRead', 'toggleGlossRead', 'glossPodcastQueue', 'glossNarration', 'startGlossPodcast',
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

test('feat 269 — parseMediaUrl recognizes images, GIFs, and giphy links; renders them inline', async ({ page }) => {
  const r = await page.evaluate(() => ({
    png: parseMediaUrl('https://example.com/anatomy-chart.png'),
    jpg: parseMediaUrl('cdn.site.com/form/squat.JPG?w=800'),
    gif: parseMediaUrl('https://i.imgur.com/abc123.gif'),
    fmt: parseMediaUrl('https://images.site.com/x?format=webp'),
    giphy: parseMediaUrl('https://giphy.com/gifs/deadlift-form-aBcD1234'),
    giphyDirect: parseMediaUrl('https://media.giphy.com/media/aBcD1234/giphy.gif'),
    notImg: parseMediaUrl('example.com/guide.html'),
    helpers: (() => {
      const m = parseMediaUrl('https://i.imgur.com/abc123.gif');
      return { isImg: isImageMedia(m), img: mediaImg(m), playable: mediaPlayable(m), name: mediaPlatformName(m.platform) };
    })(),
  }));
  expect(r.png.platform).toBe('image');
  expect(r.png.img).toBe('https://example.com/anatomy-chart.png');
  expect(r.png.embedUrl).toBeNull();                 // not a video iframe
  expect(r.jpg.platform).toBe('image');              // extension survives a query string
  expect(r.gif.platform).toBe('gif');                // .gif → animated kind
  expect(r.fmt.platform).toBe('image');              // ?format=webp hint
  expect(r.giphy.platform).toBe('gif');
  expect(r.giphy.img).toBe('https://media.giphy.com/media/aBcD1234/giphy.gif'); // share link → direct gif
  expect(r.giphy.watchUrl).toContain('giphy.com/gifs');                          // original preserved
  expect(r.giphyDirect.platform).toBe('gif');
  expect(r.notImg.platform).toBe('link');            // a plain .html page is still a link
  expect(r.helpers).toEqual({ isImg: true, img: 'https://i.imgur.com/abc123.gif', playable: true, name: 'GIF' });
});

test('feat 270 — trend peek renders a sparkline + e1RM stats, hidden without enough history', async ({ page }) => {
  const r = await page.evaluate(() => {
    const fv = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const now = Date.now(), day = 86400000, bench = fv('flat-bench-press');
    const s = (d, w, rr) => ({ date: new Date(now - d * day).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w, r: rr }] }] });
    state.sessions = [ s(21, 90, 5), s(14, 95, 5), s(7, 98, 5), s(1, 100, 5) ]; // climbing e1RM
    const peek = renderTrendPeek(bench, null);
    const oneSession = (() => { const saved = state.sessions; state.sessions = [s(1, 100, 5)]; const h = renderTrendPeek(bench, null); state.sessions = saved; return h; })();
    return { peek, oneSession, hasSpark: /class="spark"/.test(peek), hasE1RM: /e1RM/.test(peek), up: /tp-delta tp-up/.test(peek) };
  });
  expect(r.hasSpark).toBe(true);
  expect(r.hasE1RM).toBe(true);
  expect(r.up).toBe(true);        // climbing e1RM reads as an up trend
  expect(r.oneSession).toBe('');  // a single session → no peek
});

test('feat 271 — anatomy chart is a media owner: import attaches it, the detailed view + gallery + sheet use it', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.exerciseMedia = {};
    state.anatomyChart = { view: 'detailed', map: [] };
    const keyById = resolveExerciseKey({ id: 'anatomy-chart' });   // import targets it by id
    const keyByTitle = resolveExerciseKey({ title: 'Anatomy Chart' }); // …or by title
    const res = applyMediaEntries([{ id: 'anatomy-chart', url: 'https://example.com/anatomy.png' }]); // attach via the shared importer
    const owner = mediaOwnerInfo('anatomy-chart');
    const inGallery = allMediaClips().some(c => c.key === 'anatomy-chart' && c.owner.title === 'Anatomy Chart');
    const sheet = buildMediaSheet('all');
    const reparsed = parseMediaSheet(sheet).some(e => e.id === 'anatomy-chart' && /anatomy\.png/.test(e.url));
    return { keyById, keyByTitle, added: res.added, owner, src: anatomyImageSrc(), has: anatomyHasImage(), inGallery, sheetHasSection: /Anatomy Chart/.test(sheet), reparsed };
  });
  expect(r.keyById).toBe('anatomy-chart');
  expect(r.keyByTitle).toBe('anatomy-chart');
  expect(r.added).toBe(1);
  expect(r.owner).toMatchObject({ title: 'Anatomy Chart', kind: 'movement' });
  expect(r.src).toBe('https://example.com/anatomy.png'); // the Detailed Chart View renders this image
  expect(r.has).toBe(true);
  expect(r.inGallery).toBe(true);                         // shows up in the media gallery
  expect(r.sheetHasSection).toBe(true);                   // present in the Claude-fillable sheet…
  expect(r.reparsed).toBe(true);                          // …and round-trips back on import
});

test('feat 272 — sync-on-end + AI export: defaults, scope labels, and a folder write of the digest', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const out = {};
    out.scopeDefault = state.aiExport.scope;
    out.onEndDefault = state.aiExport.onWorkoutEnd;
    out.syncOnEnd = state.cloudSync.syncOnEnd; // feat 272 — guaranteed push on workout end (default on)
    out.labels = [aiExportScopeLabel('all'), aiExportScopeLabel('month'), aiExportScopeLabel('last30')];
    // disabled → the triggers are silent no-ops (must not throw); a write with no handle returns false
    state.aiExport.enabled = false;
    aiExportOnWorkoutEnd(); aiExportMaybeDaily();
    out.noHandle = await aiExportWriteNow(true, false);
    // stub File System Access so the picker returns a capturing mock directory
    let written = null, wroteName = null;
    const mockFile = { createWritable: async () => ({ write: async (b) => { written = await b.text(); }, close: async () => {} }) };
    const mockDir = { name: 'cowork', kind: 'directory', queryPermission: async () => 'granted', requestPermission: async () => 'granted', getFileHandle: async (n) => { wroteName = n; return mockFile; } };
    window.showOpenFilePicker = window.showOpenFilePicker || (async () => []); // keep autoLoadSupported() true
    window.showDirectoryPicker = async () => mockDir;
    const fv = (fid) => { for (const [u, i] of VAR_INDEX) if (i.family.id === fid) return u; return null; };
    const bench = fv('flat-bench-press'), now = Date.now();
    state.sessions = [{ date: new Date(now - 86400000).toISOString(), endedAt: new Date(now - 86400000).toISOString(), exercises: [{ varUuid: bench, subUuid: null, sets: [{ w: 100, r: 5 }] }] }];
    await aiExportPickFolder(); // picks the mock folder, enables, and writes once
    out.enabledAfter = state.aiExport.enabled;
    out.wroteName = wroteName;
    out.wroteDigest = typeof written === 'string' && /Training progress/.test(written);
    out.lastDay = state.aiExport.lastWriteDay;
    return out;
  });
  expect(r.scopeDefault).toBe('last30');
  expect(r.onEndDefault).toBe(true);
  expect(r.syncOnEnd).toBe(true);
  expect(r.labels).toEqual(['All time', 'This month', 'Last 30 days']);
  expect(r.noHandle).toBe(false);            // no folder yet → no-op
  expect(r.enabledAfter).toBe(true);
  expect(r.wroteName).toBe('gymtracker-brief.md');
  expect(r.wroteDigest).toBe(true);          // the AI-ready digest was written to the folder
  expect(r.lastDay).toBeTruthy();
});

test('feat 274 — glossary read/unread state + an engaging, symbol-free narration', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.glossaryRead = {};
    markGlossRead('1RM', 'manual');
    const info = glossReadInfo('1RM');
    const wasRead = isGlossRead('1RM');
    toggleGlossRead('1RM'); // → unread
    const afterToggle = isGlossRead('1RM');
    const narr = glossNarration({ term: 'Volume', def: 'sets × reps × weight, e.g. 70% load, 6-12 reps' });
    // queue is unread-only, logical order
    glossSearch = ''; glossCat = 'all'; glossPodOrder = 'logical'; state.glossaryRead = {};
    const qAll = glossPodcastQueue().length;
    markGlossRead(glossPodcastQueue()[0].term, 'manual');
    const qAfter = glossPodcastQueue().length;
    return { wasRead, src: info && info.src, hasDate: !!(info && info.at), afterToggle, narr, qAll, qAfter, total: glossary.length };
  });
  expect(r.wasRead).toBe(true);
  expect(r.src).toBe('manual');
  expect(r.hasDate).toBe(true);
  expect(r.afterToggle).toBe(false);          // toggle off works
  expect(r.narr).toContain('Volume');         // names the term
  expect(r.narr).not.toMatch(/×|%|e\.g\./);   // symbols spoken out, not recited raw
  expect(r.narr).toMatch(/by/); expect(r.narr).toMatch(/percent/);
  expect(r.qAll).toBe(r.total);               // nothing read → whole glossary queued
  expect(r.qAfter).toBe(r.total - 1);         // marking one read drops it from the queue
});

test('feat 274 — listen-podcast marks an entry read ONLY after the whole entry is heard; skip does not', async ({ page }) => {
  const r = await page.evaluate(() => {
    const spoken = []; let lastU = null;
    window.SpeechSynthesisUtterance = function (text) { this.text = text; this.onend = null; this.onerror = null; };
    // speechSynthesis is a getter-only window prop — replace it via defineProperty
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: true, getVoices: () => [], cancel() {}, pause() {}, resume() {}, speak(u) { spoken.push(u.text); lastU = u; } } });
    state.sound = { ...(state.sound || {}), audio: true };
    glossSearch = ''; glossCat = 'all'; glossReadFilter = 'all'; glossPodOrder = 'logical';
    // everything read except two known programming terms → queue = ['1RM','AMRAP'] (alpha, logical)
    state.studyRead = {}; glossary.forEach(g => { state.studyRead['glossary:' + g.term] = { at: new Date().toISOString(), src: 'manual' }; });
    delete state.studyRead['glossary:1RM']; delete state.studyRead['glossary:AMRAP'];
    const q = glossPodcastQueue(); const term1 = q[0].term, term2 = q[1].term;
    startGlossPodcast();
    const fire = () => { const u = lastU; if (u && u.onend) u.onend(); };
    fire();          // intro → first entry now speaking
    _podSkip();      // skip the first entry (must NOT mark it read)
    const skippedRead = isGlossRead(term1);
    fire();          // second entry heard in full → marks read by 'listen'
    const t2 = glossReadInfo(term2);
    fire();          // outro → finish
    return { term1, term2, skippedRead, t2Src: t2 && t2.src, podGone: _glossPod === null, spoke: spoken.length };
  });
  expect(r.term1).toBe('1RM');
  expect(r.term2).toBe('AMRAP');
  expect(r.skippedRead).toBe(false);   // skipping leaves it unread
  expect(r.t2Src).toBe('listen');      // listened-through → src 'listen'
  expect(r.podGone).toBe(true);        // finished → player cleared
  expect(r.spoke).toBeGreaterThanOrEqual(4); // intro + 2 entries + outro
});

test('feat 275 — unified study read-state across advice + guides, totals, nudge, and resume', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.studyRead = {}; state.studyPod = { resumeKey: null, lastListenDay: null, nudgeDay: null }; state.studyNudge = true;
    const out = {};
    // ADVICE read-state via the unified, namespaced store
    const aId = COACHING[0].id;
    out.adviceUnread0 = adviceUnreadCount();
    markStudyRead(studyKey('advice', aId), 'listen');
    out.adviceRead = isStudyRead(studyKey('advice', aId));
    out.adviceSrc = studyReadInfo(studyKey('advice', aId)).src;
    out.adviceUnread1 = adviceUnreadCount();
    // GUIDES are discovered from the embedded templates
    const guides = studyGuides();
    out.hasGuides = guides.length > 0;
    out.guideKeyOk = guides.length ? studyKey('guide', guides[0].gid).startsWith('guide:') : true;
    // total unread = glossary + advice + guides
    out.totalMatches = studyUnreadTotal() === glossUnreadCount() + adviceUnreadCount() + guideUnreadCount();
    // advice narration strips HTML tags and reads conversationally
    out.advNarr = adviceNarration(COACHING[0]);
    // DAILY NUDGE: fires once, marks the day, then is a no-op the same day
    studyDailyNudge();
    const d1 = state.studyPod.nudgeDay;
    studyDailyNudge();
    out.nudgeOnce = !!d1 && d1 === state.studyPod.nudgeDay;
    // RESUME: a stored resumeKey rotates the queue so that entry leads
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: true, getVoices: () => [], cancel() {}, pause() {}, resume() {}, speak() {} } });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    state.studyRead = {}; glossSearch = ''; glossCat = 'all'; glossPodOrder = 'logical';
    const q = glossPodcastQueue();
    state.studyPod.resumeKey = studyKey('glossary', q[2].term); // pretend we stopped on the 3rd
    startGlossPodcast();
    const firstEntry = _glossPod.segs.find(s => s.kind === 'entry');
    out.resumeLeads = firstEntry.readKey === studyKey('glossary', q[2].term);
    _podStop();
    return out;
  });
  expect(r.adviceUnread0).toBeGreaterThan(0);
  expect(r.adviceRead).toBe(true);
  expect(r.adviceSrc).toBe('listen');
  expect(r.adviceUnread1).toBe(r.adviceUnread0 - 1);
  expect(r.hasGuides).toBe(true);              // the embedded guides are found
  expect(r.guideKeyOk).toBe(true);
  expect(r.totalMatches).toBe(true);           // the badge total sums the three surfaces
  expect(r.advNarr).not.toMatch(/<[^>]+>/);    // section HTML stripped for speech
  expect(r.nudgeOnce).toBe(true);              // the daily nudge fires at most once a day
  expect(r.resumeLeads).toBe(true);            // resume rotates the queue to where you left off
});

test('feat 276 — read-only plan view shows the same data with inputs frozen and no commit/edit controls', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const p = state.plans[0];
    openPlanView(p.id);
    const main = document.getElementById('trk-main');
    const hid = (sel) => { const el = main.querySelector(sel); return el ? getComputedStyle(el).display === 'none' : true; };
    const nameInp = main.querySelector('#plan-name-input'), setsInp = main.querySelector('[data-step-sets]');
    const out = {
      banner: !!main.querySelector('.plan-ro-banner'),
      hasEditBtn: !!main.querySelector('#plan-ro-edit'),
      nameDisabled: nameInp ? nameInp.disabled : false,
      setsDisabled: setsInp ? setsInp.disabled : false,
      nameMatches: nameInp ? nameInp.value === p.name : false,
      commitHidden: hid('#plan-commit-btn'), addStepHidden: hid('#plan-add-step-btn'),
    };
    // switching to Edit re-enables everything
    main.querySelector('#plan-ro-edit').click();
    const nameInp2 = document.getElementById('trk-main').querySelector('#plan-name-input');
    out.editableAfter = nameInp2 ? !nameInp2.disabled : false;
    out.commitShownAfter = !(getComputedStyle(document.getElementById('trk-main').querySelector('#plan-commit-btn')).display === 'none');
    return out;
  });
  expect(r.banner).toBe(true);
  expect(r.hasEditBtn).toBe(true);
  expect(r.nameDisabled).toBe(true);
  expect(r.setsDisabled).toBe(true);
  expect(r.nameMatches).toBe(true);      // identical data to the editor
  expect(r.commitHidden).toBe(true);     // the commit button can't be pressed
  expect(r.addStepHidden).toBe(true);
  expect(r.editableAfter).toBe(true);    // ✎ Edit unlocks it
  expect(r.commitShownAfter).toBe(true);
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
