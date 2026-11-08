// feat 554 — the Freemotion Row station's five movements, a seated low-row machine, and four lifts from reels are
// in the catalogue, unique, documented, findable, and load the right tool.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof PASS5_ROWS !== 'undefined' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 554 — every new movement is indexed once, documented, and logs the right way', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ids = new Map(), by = {};
    for (const [u, i] of VAR_INDEX) { ids.set(i.variation.id, (ids.get(i.variation.id) || 0) + 1);
      by[i.variation.title] = { fam: i.family.id, mode: exMode(u).mode, tool: (typeof setupKindFor === 'function') ? setupKindFor(u) : null }; }
    const thin = PASS5_ROWS.filter(row => { const ref = exercises.find(e => e.id === row[0]), u = [...VAR_INDEX.keys()].find(k => VAR_INDEX.get(k).variation.id === row[1]);
      const rv = ref && (ref.variations || []).find(x => x.uuid === u); return !rv || !(rv.setup || []).length || !Object.keys(rv.programming || {}).length; }).map(r => r[1]);
    return { n: PASS5_ROWS.length, dup: PASS5_ROWS.filter(row => ids.get(row[1]) !== 1).map(row => row[1]), thin, by };
  });
  expect(r.n).toBe(10);
  expect(r.dup).toEqual([]);
  expect(r.thin).toEqual([]);
  ['Freemotion Seated Row', 'Freemotion Alternating Row with Rotation', 'Freemotion 1-Arm Seated Row', 'Freemotion 1-Arm Lunge Row with Rotation',
    'Freemotion Standing Alternating Row with Rotation', 'Seated Low Row (Machine)'].forEach(t => {
    expect(r.by[t].fam, t).toBe('row'); expect(r.by[t].mode, t).toBe('standard'); expect(r.by[t].tool, t).toBe('pin');
  });
  expect(r.by['Swing to Lunge High Pull']).toMatchObject({ fam: 'kettlebell-specific', tool: 'kettlebell' });
  expect(r.by['Spartan Uppercut']).toMatchObject({ fam: 'kettlebell-specific', tool: 'kettlebell' });
  expect(r.by['Half-Kneeling Wall T-Spine Rotation'].mode).not.toBe('time');      // reps per side, not a hold
  expect(r.by['Partner-Anchored Floor Back Extension'].fam).toBe('back-extension');
});

test('feat 554 — they are findable by the words on the placard and in the reels', async ({ page }) => {
  const r = await page.evaluate(() => {
    openLogModal(); modalState.showPicker = true; renderModal();
    const find = q => { modalState.pickerSearch = q; return filterVariations().flatMap(g => g.variations.map(v => v.title)); };
    return { lunge: find('lunge row rotation'), low: find('low row'), blind: find('blind spot'), spartan: find('spartan'), swing: find('swing lunge high pull') };
  });
  expect(r.lunge).toContain('Freemotion 1-Arm Lunge Row with Rotation');
  expect(r.low).toContain('Seated Low Row (Machine)');
  expect(r.blind).toContain('Half-Kneeling Wall T-Spine Rotation');
  expect(r.spartan).toContain('Spartan Uppercut');
  expect(r.swing).toContain('Swing to Lunge High Pull');
});
