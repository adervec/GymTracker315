// feat 519 — bodyweight is more than the pull-up/dip/push-up trio, and "± bodyweight" only fits where load can really
// change. Three load styles: 'assist' (belt adds, band/counterweight subtracts), 'vest' (blank, or ≥ 0 added) and
// 'none' (reps only — no weight field at all). Anything naming an implement stays a loaded lift.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exMode === 'function' && typeof VAR_INDEX !== 'undefined' && VAR_INDEX.size > 0,
    null, { timeout: 15000 });
});

const modes = (page, titles) => page.evaluate((titles) => {
  const out = {};
  for (const [u, i] of VAR_INDEX) if (titles.includes(i.variation.title) && !(i.variation.title in out)) {
    const m = exMode(u); out[i.variation.title] = m.mode === 'bodyweight' ? m.load : m.mode;
  }
  return out;
}, titles);

test('feat 519 — the three load styles, and loaded lifts stay loaded', async ({ page }) => {
  const r = await modes(page, ['Pull-Up (Pronated)', 'Bodyweight Dip', 'Weighted Pull-Up', 'Push-Up', 'Walking Lunge', 'Inverted Row (BW)',
    'Nordic Hamstring Curl', 'Bodyweight Squat', 'Crunch', 'Burpee', 'Hanging Leg Raise', 'Mountain Climbers', 'Superman', 'Box Jump',
    'Cable Crunch', 'Weighted Crunch', 'Plate Reverse Lunge', 'Assisted Dip (Machine)', 'Get-Up Sit-Up', 'Mace-Grip Push-Up', 'Band-Resisted Push-Up']);
  expect(r).toEqual({
    'Pull-Up (Pronated)': 'assist', 'Bodyweight Dip': 'assist', 'Weighted Pull-Up': 'assist',
    'Push-Up': 'vest', 'Walking Lunge': 'vest', 'Inverted Row (BW)': 'vest', 'Nordic Hamstring Curl': 'vest', 'Bodyweight Squat': 'vest',
    'Crunch': 'none', 'Burpee': 'none', 'Hanging Leg Raise': 'none', 'Mountain Climbers': 'none', 'Superman': 'none', 'Box Jump': 'none',
    'Cable Crunch': 'standard', 'Weighted Crunch': 'standard', 'Plate Reverse Lunge': 'standard', 'Assisted Dip (Machine)': 'standard',
    'Get-Up Sit-Up': 'standard',              // a kettlebell-family move holds the bell
    'Mace-Grip Push-Up': 'vest',              // a push-up is a push-up whatever the hands rest on
    'Band-Resisted Push-Up': 'vest',          // a band is not a load you can log
  });
});

const sheet = (page, title, sets) => page.evaluate(({ title, sets }) => {
  let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.title === title) { v = u; break; }
  state.readonly = false; state.unit = 'lb'; state.bodyComp = [];
  const at = d => new Date(Date.now() - d * 864e5).toISOString();
  state.sessions = [{ id: 'h', date: at(3), exercises: [{ varUuid: v, subUuid: null, sets: [{ w: '', r: 15, ts: at(3) }] }] }];
  pending = { varUuid: v, subUuid: null, sets };
  openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true; renderModal();
  const row = document.querySelector('#trk-sets-container .set-block');
  return { wInput: !!row.querySelector('input[data-field="w"]'), bwCell: !!row.querySelector('.set-bw-cell'),
    repsDisabled: row.querySelector('input[data-field="r"]').disabled, wLabel: exMode(v).wLabel,
    tag: (document.querySelector('.ex-mode-tag') || {}).textContent, tiles: [...document.querySelectorAll('#trk-targets .target-btn b')].map(b => b.textContent),
    tagPct: (document.querySelector('.set-overload-tag') || {}).textContent || null };
}, { title, sets });

test('feat 519 — a reps-only lift has no weight field, and reps never wait for one', async ({ page }) => {
  const r = await sheet(page, 'Crunch', [{ w: '', r: 12, ts: new Date().toISOString() }]);
  expect(r.wInput).toBe(false);
  expect(r.bwCell).toBe(true);
  expect(r.repsDisabled).toBe(false);
  expect(r.tag).toBe('BW');
  expect(r.tiles, 'no "+5 lb × 1" tile on a crunch').toEqual(['BW×16']);
  expect(r.tagPct, 'blank weight is bodyweight, scored on reps').toBe('-20%');
});

test('feat 519 — a vest-style lift: blank is normal, reps open without a weight, no invented vest tile', async ({ page }) => {
  const r = await sheet(page, 'Push-Up', [{ w: '', r: '' }]);
  expect(r.wInput).toBe(true);
  expect(r.wLabel).toBe('Added (+)');
  expect(r.repsDisabled).toBe(false);
  expect(r.tag).toBe('BW+');
  expect(r.tiles.some(t => t.startsWith('+'))).toBe(false);
});

test('feat 519 — only a ± lift needs a bodyweight on file to save', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const out = {};
    for (const title of ['Crunch', 'Pull-Up (Pronated)']) {
      let v = null; for (const [u, i] of VAR_INDEX) if (i.variation.title === title) { v = u; break; }
      state.readonly = false; state.bodyComp = []; state.sessions = [];
      pending = { varUuid: v, subUuid: null, sets: [{ w: '', r: 10, ts: new Date().toISOString() }] };
      openLogModal(); modalState.showPicker = false; modalState.isEditing = false; modalState.open = true; renderModal();
      const said = []; const t0 = window.toast; window.toast = m => said.push(String(m));
      try { saveSets(); } catch (_) {}           // not awaited: a loggable set may go on to a confirm dialog
      window.toast = t0;
      out[title] = said.some(m => /bodyweight first/i.test(m));
    }
    return out;
  });
  expect(r['Crunch'], 'a crunch never needed a bodyweight on file').toBe(false);
  expect(r['Pull-Up (Pronated)']).toBe(true);
});

test('feat 519 — an inverted row draws empty-handed; a lunge keeps its dumbbells', async ({ page }) => {
  const r = await page.evaluate(() => {
    const k = t => { for (const [u, i] of VAR_INDEX) if (i.variation.title === t) return autoSetupKind(u); };
    return { inv: k('Inverted Row (BW)'), lunge: k('Walking Lunge'), crunch: k('Crunch') };
  });
  expect(r).toEqual({ inv: null, lunge: 'dumbbell', crunch: null });
});
