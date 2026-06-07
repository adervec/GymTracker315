// feat 136 — discrete "needs a spotter" flag. A precision-biased heuristic (spotterMatch) flags the
// free-weight barbell lifts that can pin/trap you at failure (bench/chest press, loaded back squat,
// skullcrusher) and never flags guarded/self-rescuable setups (smith, machine, DB, front squat, …).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.spotterMatch === 'function' && typeof window.spotterBadge === 'function', null, { timeout: 15000 });
});

test('the heuristic flags barbell bench/squat, not machines/DB/front/bodyweight (feat 136)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const byTitle = {};
    for (const [, info] of VAR_INDEX) byTitle[info.variation.title] = spotterMatch(info.variation, info.family);
    return { byTitle, flaggedCount: Object.values(byTitle).filter(Boolean).length };
  });
  // SHOULD flag — the bar sits over you / traps you at failure
  for (const t of ['Barbell Flat Bench Press', 'Close-Grip Bench Press', 'Barbell Back Squat', 'Box Squat', 'Safety Squat Bar (SSB)', 'Skull Crusher']) {
    expect(r.byTitle[t], `flag: ${t}`).toBe(true);
  }
  // should NOT flag — guarded, self-rescuable, or bodyweight
  for (const t of ['Dumbbell Flat Bench', 'Fixed Chest Press Machine', 'Front Squat', 'Goblet Squat', 'Hack Squat', 'Hindu Squat', 'Prisoner Squat']) {
    expect(r.byTitle[t], `no-flag: ${t}`).toBe(false);
  }
  // precision sanity — a small curated set, not a wall of badges
  expect(r.flaggedCount).toBeGreaterThan(12);
  expect(r.flaggedCount).toBeLessThan(45);
});

test('spotterBadge renders only for flagged variations; needsSpotter(uuid) agrees (feat 136)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const find = (title) => { for (const [u, info] of VAR_INDEX) if (info.variation.title === title) return { u, info }; return null; };
    const bb = find('Barbell Back Squat'), db = find('Dumbbell Flat Bench');
    return {
      bbBadge: spotterBadge(bb.info.variation, bb.info.family),
      dbBadge: spotterBadge(db.info.variation, db.info.family),
      bbNeeds: needsSpotter(bb.u), dbNeeds: needsSpotter(db.u),
      junk: needsSpotter('not-a-real-uuid'),
    };
  });
  expect(r.bbBadge).toContain('spotter-badge');
  expect(r.bbBadge).toContain('spot');
  expect(r.dbBadge).toBe('');          // no badge for the dumbbell bench
  expect(r.bbNeeds).toBe(true);
  expect(r.dbNeeds).toBe(false);
  expect(r.junk).toBe(false);          // unknown uuid → no flag, no throw
});

test('the exercise picker renders the spotter badge for flagged lifts (feat 136)', async ({ page }) => {
  const html = await page.evaluate(() => renderPickerResults());
  expect(html).toContain('spotter-badge'); // the picker lists barbell bench/squat, which carry the flag
});
