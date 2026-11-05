// feat 548 — the holds pass: stretches, held yoga poses, V-sits and plate pinches log as Time; an L-sit pull-up
// logs reps; and 39 well-known holds that were missing are in the catalogue, every one of them timed.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof exMode === 'function' && typeof HOLD_ROWS !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

const modeOf = (titles) => {
  const out = {};
  for (const [u, i] of VAR_INDEX) if (titles.includes(i.variation.title)) out[i.variation.title] = exMode(u).mode;
  return out;
};

test('feat 548 — held poses and stretches are timed; flows and L-sit pull-ups are not', async ({ page }) => {
  const r = await page.evaluate((src) => eval(src)(['Couch Stretch', 'Pigeon Pose', "Child's Pose", 'Boat Pose (Navasana)', 'Chair Pose (Utkatasana)',
    'Horse Stance (Mabu)', 'V-Sit', 'Plate Pinch', 'Sleeper Stretch', 'TRX Pec Stretch', "Wrestler's Bridge",
    'L-Sit Pull-Up', 'Cat-Cow', 'Thread the Needle', "World's Greatest Stretch", 'Plate Pinch Curl', 'Pallof Press']), modeOf.toString());
  ['Couch Stretch', 'Pigeon Pose', "Child's Pose", 'Boat Pose (Navasana)', 'Chair Pose (Utkatasana)', 'Horse Stance (Mabu)', 'V-Sit',
    'Plate Pinch', 'Sleeper Stretch', 'TRX Pec Stretch', "Wrestler's Bridge"].forEach(t => expect(r[t], t).toBe('time'));
  ['L-Sit Pull-Up', 'Cat-Cow', 'Thread the Needle', "World's Greatest Stretch", 'Plate Pinch Curl', 'Pallof Press'].forEach(t => expect(r[t], t).not.toBe('time'));
});

test('feat 548 — the new holds are in, complete, unique, and all log as Time', async ({ page }) => {
  const r = await page.evaluate(() => {
    const titles = HOLD_ROWS.map(x => x[2]), all = new Map();
    for (const [u, i] of VAR_INDEX) { const k = i.variation.title.toLowerCase(); all.set(k, (all.get(k) || 0) + 1); }
    const notTime = [], thin = [], missing = [];
    HOLD_ROWS.forEach(row => {
      const fam = FAMILIES.find(f => f.id === row[0]); const v = fam && fam.variations.find(x => x.id === row[1]);
      if (!v) { missing.push(row[1]); return; }
      if (exMode(v.uuid).mode !== 'time') notTime.push(row[2]);
      const ref = exercises.find(e => e.id === row[0]), rv = ref && (ref.variations || []).find(x => x.uuid === v.uuid);
      if (!rv || !(rv.setup || []).length || !(rv.movement || []).length || !(rv.mistakes || []).length || !Object.keys(rv.programming || {}).length) thin.push(row[2]);
    });
    return { n: HOLD_ROWS.length, notTime, thin, missing, dup: titles.filter(t => all.get(t.toLowerCase()) > 1) };
  });
  expect(r.n).toBe(39);
  expect(r.missing).toEqual([]);
  expect(r.notTime).toEqual([]);
  expect(r.thin).toEqual([]);
  expect(r.dup).toEqual([]);
});

test('feat 548 — a new hold is findable and opens with a Time field', async ({ page }) => {
  const r = await page.evaluate(() => {
    openLogModal(); modalState.showPicker = true; modalState.pickerSearch = 'rkc'; renderModal();
    const hit = [...document.querySelectorAll('#trk-picker-results-wrap .picker-var')].map(e => VAR_INDEX.get(e.dataset.varuuid).variation.title);
    const uuid = [...VAR_INDEX.keys()].find(u => VAR_INDEX.get(u).variation.title === 'Spanish Squat Hold');
    return { hit, label: exMode(uuid).rLabel };
  });
  expect(r.hit).toContain('RKC Plank');
  expect(r.label).toBe('Time');
});
