// feat 251 — the exercise (log-sets) screen: a total-time + %-active readout at the top, and a context-aware
// media button — "Configure Media" when empty, else "Watch <type> from <creator>".
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exMediaBtnLabel === 'function' && typeof exerciseTiming === 'function'
    && typeof openLogModal === 'function' && typeof mediaTypeLabel === 'function', null, { timeout: 15000 });
});

const stdVar = (page) => page.evaluate(() => { for (const [u] of VAR_INDEX) if (exMode(u).mode === 'standard') return u; });

test('feat 251 — mediaTypeLabel maps platform to Short / Reel / TikTok / video', async ({ page }) => {
  const r = await page.evaluate(() => ({
    short: mediaTypeLabel(parseMediaUrl('https://www.youtube.com/shorts/abcdefghij1')),
    video: mediaTypeLabel(parseMediaUrl('https://www.youtube.com/watch?v=abcdefghij1')),
    reel: mediaTypeLabel(parseMediaUrl('https://www.instagram.com/squat_university/reel/Cabcdef/')),
    tiktok: mediaTypeLabel(parseMediaUrl('https://www.tiktok.com/@squatuniversity/video/7300000000000000000')),
  }));
  expect(r.short).toBe('Short');
  expect(r.video).toBe('video');
  expect(r.reel).toBe('Reel');
  expect(r.tiktok).toBe('TikTok');
});

test('feat 251 — exMediaBtnLabel reads "Configure Media" when empty, "Watch <type> from <creator>" when not', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    const fi = VAR_INDEX.get(v), mov = fi.family.id;
    state.readonly = false; state.exerciseMedia = {};
    const empty = exMediaBtnLabel(v, mov);
    addExerciseMedia(v, 'https://www.tiktok.com/@squatuniversity/video/7300000000000000123');
    const oneTikTok = exMediaBtnLabel(v, mov);
    addExerciseMedia(v, 'https://www.youtube.com/shorts/zzzzzzzzzzz');
    const two = exMediaBtnLabel(v, mov);
    return { empty, oneTikTok, two };
  }, v);
  expect(r.empty).toBe('⚙ Configure Media');
  expect(r.oneTikTok).toBe('▶ Watch TikTok from @squatuniversity');
  expect(r.two).toContain('+1');          // a second clip is tallied
});

test('feat 251 — exerciseTiming gives total span + % active (active-under-tension ÷ span)', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    const now = Date.now();
    modalState.isEditing = false;
    state.sessions = [{ id: 's', date: new Date(now - 600000).toISOString(), updatedAt: new Date().toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [
        { w: 185, r: 5, wTs: new Date(now - 300000).toISOString(), ts: new Date(now - 270000).toISOString() }, // 30 s
        { w: 185, r: 5, wTs: new Date(now - 120000).toISOString(), ts: new Date(now - 90000).toISOString() },  // 30 s
      ] }] }];
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    const t = exerciseTiming(v, null);
    pending = { varUuid: null, subUuid: null, sets: [{ w: '', r: '' }] };
    return t;
  }, v);
  expect(r.totalMs).toBe(210000);   // first start → last done
  expect(r.activeMs).toBe(60000);   // 30 s + 30 s under tension
  expect(r.pctActive).toBe(29);     // 60 / 210
});

test('feat 251 — the log sheet renders the time stat + the context-aware media button', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    const now = Date.now();
    state.readonly = false; state.exerciseMedia = {};
    state.sessions = [{ id: 's', date: new Date(now - 600000).toISOString(), updatedAt: new Date().toISOString(),
      exercises: [{ varUuid: v, subUuid: null, sets: [{ w: 185, r: 5, wTs: new Date(now - 200000).toISOString(), ts: new Date(now - 170000).toISOString() }] }] }];
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false; renderModal();
    const stat = document.querySelector('#trk-modal-body .ex-time-stat');
    const btn = document.getElementById('trk-ex-media-btn');
    return { hasStat: !!stat, statText: stat?.textContent.replace(/\s+/g, ' ').trim(), btnLabel: btn?.textContent, noMediaClass: btn?.classList.contains('no-media') };
  }, v);
  expect(r.hasStat).toBe(true);
  expect(r.statText).toContain('active');
  expect(r.btnLabel).toBe('⚙ Configure Media');   // none added yet
  expect(r.noMediaClass).toBe(true);
});

// feat 427 — navigating to any page (the 🔥 Workout / 🗺️ Plan shortcut tabs included) closes the Exercise sheet like its ✕
test('feat 427 — navTo closes the open Exercise sheet like ✕', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; renderModal();
    const openBefore = modalState.open && document.getElementById('trk-modal').classList.contains('open');
    navTo('workout');                                    // the 🔥 Workout tab
    const afterWorkout = { open: modalState.open, cls: document.getElementById('trk-modal').classList.contains('open'), page: currentPage };
    openLogModal();
    navTo('plan-detail');                                // the 🗺️ Plan tab (openPlanLive → navTo('plan-detail'))
    const afterPlan = { open: modalState.open, cls: document.getElementById('trk-modal').classList.contains('open'), page: currentPage };
    openLogModal();
    navTo('exercise');                                   // ✍️ Exercise — legacy-opener path keeps the sheet
    const afterExercise = { open: modalState.open, cls: document.getElementById('trk-modal').classList.contains('open') };
    closeLogModal();
    return { openBefore, afterWorkout, afterPlan, afterExercise };
  }, v);
  expect(r.openBefore).toBe(true);
  expect(r.afterWorkout).toEqual({ open: false, cls: false, page: 'workout' });
  expect(r.afterPlan).toEqual({ open: false, cls: false, page: 'plan-detail' });
  expect(r.afterExercise).toEqual({ open: true, cls: true });
});

// feat 421 — a subtle dot on the media button when THIS variation owns media (movement-only media gets no dot)
test('feat 421 — var-media class marks variation-specific media, not movement-inherited', async ({ page }) => {
  const v = await stdVar(page);
  const r = await page.evaluate((v) => {
    const mov = VAR_INDEX.get(v).family.id;
    state.readonly = false; state.exerciseMedia = {};
    pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: '' }] };
    openLogModal(); modalState.showPicker = false; modalState.isEditing = false;
    const grab = () => { renderModal(); const b = document.getElementById('trk-ex-media-btn'); return { has: b.classList.contains('has-media'), varDot: b.classList.contains('var-media'), title: b.title }; };
    const none = grab();
    addExerciseMedia(mov, 'https://www.youtube.com/shorts/aaaaaaaaaaa'); // movement-level only
    const movOnly = grab();
    addExerciseMedia(v, 'https://www.youtube.com/shorts/bbbbbbbbbbb');  // now the variation owns one too
    const varOwn = grab();
    closeLogModal();
    return { none, movOnly, varOwn };
  }, v);
  expect(r.none.varDot).toBe(false);
  expect(r.movOnly.has).toBe(true);        // inherited media lights the button...
  expect(r.movOnly.varDot).toBe(false);    // ...but no dot — nothing variation-specific
  expect(r.varOwn.varDot).toBe(true);      // the dot appears once the variation itself has media
  expect(r.varOwn.title).toContain('exact variation');
});

test('feat 254 — weightRecordHint clarifies what number to record per equipment', async ({ page }) => {
  const r = await page.evaluate(() => {
    const find = (re) => { for (const [u, i] of VAR_INDEX) { const n = i.variation.title + ' ' + i.family.title; if (re.test(n) && exMode(u).mode === 'standard') return u; } return null; };
    const dbCurl = find(/dumbbell.*curl|db curl|dumbbell bicep/i);
    const goblet = find(/goblet/i);
    const freemo = find(/freemotion/i);
    const barbell = find(/barbell (squat|bench|deadlift)/i);
    return {
      db: dbCurl ? weightRecordHint(dbCurl) : null,
      goblet: goblet ? weightRecordHint(goblet) : null,
      freemo: freemo ? weightRecordHint(freemo) : null,
      barbell: barbell ? weightRecordHint(barbell) : 'no-barbell',
    };
  });
  if (r.db) expect(r.db).toContain('ONE dumbbell');       // standing DB curl → one dumbbell (45, not 90)
  if (r.goblet) expect(r.goblet).toContain('TOTAL');      // goblet squat → total held (legs do the work)
  if (r.freemo) expect(r.freemo).toContain('number you read'); // freemotion → write the number you read
  expect(r.barbell).toBeNull();                            // barbell → unambiguous, no hint
});
