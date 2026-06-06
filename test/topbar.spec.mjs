// feat 99 — top-bar long-press shortcuts: a hold on a top-bar icon fires a separate shortcut and
// swallows the trailing click, while a tap still runs the icon's normal onclick. Covers the gesture
// helper plus the action helpers (mute-all, current/last exercise, coaching relevance).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.attachTopbarLongPress === 'function'
    && typeof window.currentOrLastExercise === 'function'
    && typeof window.coachingCardForExercise === 'function', null, { timeout: 15000 });
});

test('a tap runs the normal onclick; a hold fires the shortcut and swallows the click', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    let taps = 0, longs = 0;
    btn.addEventListener('click', () => taps++);          // stands in for the inline onclick
    attachTopbarLongPress(btn, () => longs++, 'X', 200);  // short hold window for the test
    const pd = () => btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const pu = () => btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const click = () => btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    // quick tap -> onclick runs, no long
    pd(); await wait(40); pu(); click();
    const afterTap = { taps, longs };

    // hold past 200ms -> long fires, the trailing click is swallowed
    pd(); await wait(260); pu(); click();
    await wait(10);
    return { afterTap, final: { taps, longs } };
  });
  expect(r.afterTap).toEqual({ taps: 1, longs: 0 });
  expect(r.final.longs).toBe(1);
  expect(r.final.taps).toBe(1); // the hold did NOT also fire a tap
});

test('long-press volume mutes audio AND haptics', async ({ page }) => {
  const r = await page.evaluate(() => {
    const s = sndState(); s.audio = true; s.haptics = true;
    topbarMuteAll();
    return { audio: sndState().audio, haptics: sndState().haptics, persisted: JSON.parse(localStorage.getItem('overload_tracker_v2')).sound };
  });
  expect(r.audio).toBe(false);
  expect(r.haptics).toBe(false);
  expect(r.persisted.audio).toBe(false);
  expect(r.persisted.haptics).toBe(false);
});

test('currentOrLastExercise prefers the active log, else the most recent history exercise', async ({ page }) => {
  const r = await page.evaluate(() => {
    let v1 = null, v2 = null;
    for (const [uuid] of VAR_INDEX) { if (!v1) { v1 = uuid; continue; } v2 = uuid; break; }
    // no active log -> falls back to newest session's last exercise
    pending = { varUuid: null, subUuid: null, sets: [] };
    state.sessions = [
      { id: 'old', date: '2026-05-01T00:00:00.000Z', exercises: [{ varUuid: v1, sets: [{ w: 1, r: 1 }] }] },
      { id: 'new', date: '2026-06-01T00:00:00.000Z', exercises: [{ varUuid: v2, sets: [{ w: 1, r: 1 }] }] },
    ];
    const fromHistory = currentOrLastExercise();
    // active log wins
    pending = { varUuid: v1, subUuid: null, sets: [] };
    const fromPending = currentOrLastExercise();
    return { historyVar: fromHistory && fromHistory.varUuid, pendingVar: fromPending && fromPending.varUuid, v1, v2 };
  });
  expect(r.historyVar).toBe(r.v2); // newest session's exercise
  expect(r.pendingVar).toBe(r.v1); // active log overrides history
});

test('coachingCardForExercise routes cardio/grip/climbing to the right card', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    // cardio (non-climbing) -> endurance
    out.cardio = coachingCardForExercise({ varUuid: '__none__', cardio: true });
    // a grip/forearm exercise -> grip card (find one whose bp is forearms)
    let gripUuid = null;
    for (const [uuid, info] of VAR_INDEX) { if (info.bp === 'forearms') { gripUuid = uuid; break; } }
    out.grip = gripUuid ? coachingCardForExercise({ varUuid: gripUuid }) : 'coach-grip';
    return out;
  });
  expect(r.cardio).toBe('coach-endurance');
  expect(r.grip).toBe('coach-grip');
});

test('the top-bar icons actually have a long-press wired (boot ran initTopbarShortcuts)', async ({ page }) => {
  // Hold the real glossary button; the glossary panel should open (its long-press shortcut).
  const opened = await page.evaluate(async () => {
    const btn = document.getElementById('app-gloss-btn');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 650)); // default 550ms hold + margin
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 50));
    const panel = document.getElementById('ref-gloss-panel');
    return !!(panel && panel.classList.contains('open'));
  });
  expect(opened).toBe(true);
});
