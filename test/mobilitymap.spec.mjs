// feat 603 — the mobility map: mobility work coloured by the body areas it reaches, beside the volume heatmap.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderMobilityMapCard === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 603 — mobility exercises reach the right areas; strength work reaches none', async ({ page }) => {
  const r = await page.evaluate(() => {
    const vs = []; FAMILIES.filter(f => f.mega === 'mobility').forEach(f => f.variations.forEach(v => vs.push(v)));
    const of = t => mobilityAreasForVar(vs.find(v => v.title === t).uuid);
    const bench = FAMILIES.find(f => f.id === 'flat-bench-press').variations[0].uuid;
    return { pigeon: of('Pigeon Pose'), couch: of('Couch Stretch'), puppy: of('Puppy Pose (T-Spine)'), calf: of('Calf Roll'), butterfly: of('Butterfly Stretch'),
      bench: mobilityAreasForVar(bench), mapped: vs.filter(v => mobilityAreasForVar(v.uuid).length).length / vs.length };
  });
  expect(r.pigeon).toContain('hips');
  expect(r.couch).toEqual(expect.arrayContaining(['hipflex']));
  expect(r.puppy).toEqual(['tspine']);          // "T-Spine" is the upper back, not the low back too
  expect(r.calf).toContain('calves');
  expect(r.butterfly).toContain('adductors');
  expect(r.bench).toEqual([]);
  expect(r.mapped).toBeGreaterThan(0.9);         // nearly every mobility exercise lands somewhere
});

test('feat 603 — the card counts this week, colours the reached areas and rings the joints, and lists what was skipped', async ({ page }) => {
  const r = await page.evaluate(() => {
    const vs = []; FAMILIES.filter(f => f.mega === 'mobility').forEach(f => f.variations.forEach(v => vs.push(v)));
    const pick = t => vs.find(v => v.title === t).uuid;
    state.sessions = [
      { id: 'a', date: new Date().toISOString(), exercises: [{ varUuid: pick('Standing Hamstring Stretch'), sets: [{ r: 60 }, { r: 60 }] }, { varUuid: pick('Tree Pose (Vrksasana)'), sets: [{ r: 30 }] }] },
      { id: 'b', date: new Date(Date.now() - 30 * 86400000).toISOString(), exercises: [{ varUuid: pick('Neck Stretches'), sets: [{ r: 30 }] }] },
    ];
    const M = weeklyMobilityAreas(0), d = document.createElement('div'); d.innerHTML = renderMobilityMapCard();
    return { hams: M.sets.hams, ankles: M.sets.ankles, neck: M.sets.neck, neckAgo: M.ago.neck,
      hamFill: [...d.querySelectorAll('[data-mob-area="hams"]')].every(x => /fill:hsla/.test(x.getAttribute('style') || '')),
      neckFill: [...d.querySelectorAll('[data-mob-area="neck"]')].some(x => x.getAttribute('style')),
      ankleRings: d.querySelectorAll('circle.mob-joint.on[data-mob-area="ankles"]').length,
      stale: (d.querySelector('.mob-stale') || {}).textContent || '', chipsOn: d.querySelectorAll('.mob-chip.on').length };
  });
  expect(r.hams).toBe(2);
  expect(r.ankles).toBe(1);
  expect(r.neck).toBe(0);                      // last month's neck work is not this week's
  expect(r.neckAgo).toBe(30);
  expect(r.hamFill).toBe(true);
  expect(r.neckFill).toBe(false);
  expect(r.ankleRings).toBe(4);                // both ankles, front and back
  expect(r.stale).toContain('Neck');
  expect(r.chipsOn).toBeGreaterThanOrEqual(2);
});

test('feat 603 — the Volume page shows the mobility map under the heatmap', async ({ page }) => {
  await page.evaluate(() => { navTo('volume'); });
  await page.waitForSelector('#mob-map');
  const order = await page.evaluate(() => { const h = document.querySelector('#vol-heatmap'), m = document.querySelector('#mob-map'); return !!(h && m && (h.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING)); });
  expect(order).toBe(true);
});
