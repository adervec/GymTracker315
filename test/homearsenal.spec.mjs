// feat 585 — Home Arsenal: five 2-hour plans (push, pull, lower, upper, full body) built from small home equipment.
import { test, expect } from '@playwright/test';

test('feat 585 — five home plans: 2 hours and 13 steps each, real exercises, the right category, the listed equipment used', async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof planCategory === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    normalizeState();
    const ids = ['seed-home-push', 'seed-home-pull', 'seed-home-lower', 'seed-home-upper', 'seed-home-full'];
    const titles = new Set();
    const plans = ids.map(id => { const p = SEED_PLANS.find(x => x.id === id); if (!p) return { id, missing: true };
      p.steps.forEach(st => st.options.forEach(o => { const i = VAR_INDEX.get(o.uuid); if (i) titles.add(i.variation.title); }));
      return { id, seeded: !!state.plans.find(x => x.id === id), min: estimatePlanMinutes(p), steps: p.steps.length, cat: planCategory(p),
        bad: p.steps.flatMap(st => st.options).filter(o => o.type !== 'variation' || !VAR_INDEX.get(o.uuid) || isSuppressedVar(o.uuid)).length,
        choice: p.steps.every(st => st.options.length >= 2 && st.desc), heavyFirst: p.steps[0].load === 'heavy', coreLast: /core|ab wheel/i.test(p.steps[12].desc),
        gym: p.steps.flatMap(st => st.options).map(o => VAR_INDEX.get(o.uuid).variation.title).filter(t => /cable|machine|smith|barbell|pull-up|lat pulldown \(/i.test(t) && !/band|burn machine/i.test(t)) };
    });
    const all = [...titles].join(' | ');
    const gear = { plates: /Plate /, ez: /EZ-Bar/, expander: /Chest Expander/, twister: /Power Twister/, neck: /Neck Harness/, fingerBand: /Finger Extension \(Band\)/, gripper: /Captains of Crush/, gripRing: /Grip Ring/,
      mace: /Mace /, wristRoller: /Wrist Roller/, burn: /Burn Machine/, perfect: /Perfect Pushup/, abWheel: /Ab Wheel/, armBlaster: /Arm Blaster/, bands: /Band /, kettlebell: /KB |Kettlebell/, dumbbell: /DB |Dumbbell/ };
    const vest = ids.filter(id => /vest/i.test(SEED_PLANS.find(x => x.id === id).desc)).length;
    return { plans, unused: Object.keys(gear).filter(k => !gear[k].test(all)), vest };
  });
  for (const p of r.plans) {
    expect(p.missing, p.id).toBeUndefined();
    expect(p.seeded, p.id).toBe(true);
    expect(p.min, p.id).toBe(120);
    expect(p.steps, p.id).toBe(13);
    expect(p.bad, p.id).toBe(0);
    expect(p.choice, p.id).toBe(true);
    expect(p.heavyFirst, p.id).toBe(true);
    expect(p.coreLast, p.id).toBe(true);
    expect(p.gym, p.id).toEqual([]);                       // nothing that needs a rack, a cable stack or a pull-up bar
  }
  expect(r.plans.map(p => p.cat)).toEqual(['Push', 'Pull', 'Legs', 'Upper', 'Full Body']);
  expect(r.unused).toEqual([]);                            // every piece of equipment on the list is used somewhere
  expect(r.vest).toBeGreaterThanOrEqual(4);                // the vest is called for in the notes (it has no entries of its own)
});
