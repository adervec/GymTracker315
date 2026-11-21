// feat 584 — one-limb versions fold under their exercise: the list shows the parent, the parent's sheet has a
// "Both arms / Single arm" row, and the one-limb version stays its own variation (history, records, plans untouched).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof limbGroup === 'function' && typeof foldLimbVersions === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
});

test('feat 584 — every pair resolves, stays inside one family, and no exercise is both a parent and a version', async ({ page }) => {
  const r = await page.evaluate(() => {
    const byId = new Map(); FAMILIES.forEach(f => (f.variations || []).forEach(v => byId.set(f.id + '/' + v.id, v.uuid)));
    const dangling = LIMB_VERSIONS.filter(([c, p]) => !byId.get(c) || !byId.get(p)).map(x => x.join('>'));
    const linked = LIMB_VERSIONS.filter(([c]) => limbParent(byId.get(c))).length;
    const crossFam = LIMB_VERSIONS.filter(([c, p]) => c.split('/')[0] !== p.split('/')[0]).length;
    const both = [..._LIMB_KIDS.keys()].filter(u => _LIMB_PARENT.has(u)).length;
    const oneWord = LIMB_VERSIONS.filter(([c]) => !/single|one|1[- ]arm|unilateral/i.test(VAR_INDEX.get(byId.get(c)).variation.title)).map(([c]) => c);
    const pre = byId.get('bicep-curl/lifefitness-preacher-curl-1arm'), par = byId.get('bicep-curl/lifefitness-preacher-curl');
    const hack = byId.get('leg-press/' + LIMB_VERSIONS.find(([c]) => /^leg-press\//.test(c))[0].split('/')[1]);
    return { n: LIMB_VERSIONS.length, dangling, linked, crossFam, both, oneWord, pre: limbParent(pre) === par, group: limbGroup(par).kids.length, self: limbGroup(pre).parent === par,
      labels: [limbLabel(par), limbLabel(pre), limbLabel(hack), limbLabel(limbParent(hack))], none: limbGroup('nope'),
      stillVar: !!VAR_INDEX.get(pre) && !isSuppressedVar(pre) && varVisibleInPicker(VAR_INDEX.get(pre).family, VAR_INDEX.get(pre).variation) };
  });
  expect(r.n).toBeGreaterThanOrEqual(45);
  expect(r.dangling).toEqual([]);
  expect(r.linked).toBe(r.n);
  expect(r.crossFam).toBe(0);
  expect(r.both).toBe(0);
  expect(r.oneWord).toEqual([]);
  expect(r.pre).toBe(true);
  expect(r.group).toBe(1);
  expect(r.self).toBe(true);
  expect(r.labels).toEqual(['Both arms', 'Single arm', 'Single leg', 'Both legs']);
  expect(r.none).toBe(null);
  expect(r.stillVar).toBe(true);            // still a real, visible variation: plans and history that name it are unaffected
});

test('feat 584 — a list drops a one-limb version only when its parent is in the same list', async ({ page }) => {
  const r = await page.evaluate(() => {
    const f = FAMILIES.find(x => x.id === 'bicep-curl'), vs = f.variations.filter(v => varVisibleInPicker(f, v));
    const kid = vs.find(v => v.id === 'lifefitness-preacher-curl-1arm'), par = vs.find(v => v.id === 'lifefitness-preacher-curl');
    const folded = foldLimbVersions(vs), alone = foldLimbVersions(vs.filter(v => v !== par));
    return { before: vs.length, after: folded.length, kidGone: !folded.includes(kid), parKept: folded.includes(par), aloneKept: alone.includes(kid),
      versions: vs.filter(v => limbParent(v.uuid)).length };
  });
  expect(r.kidGone).toBe(true);
  expect(r.parKept).toBe(true);
  expect(r.before - r.after).toBe(r.versions);
  expect(r.aloneKept).toBe(true);           // parent filtered out of the list: the version shows, so it is never unreachable
});

test('feat 584 — the sheet has a Version row that switches between the two; history stays with each', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const byId = new Map(); FAMILIES.forEach(f => (f.variations || []).forEach(v => byId.set(f.id + '/' + v.id, v.uuid)));
    const kid = byId.get('bicep-curl/lifefitness-preacher-curl-1arm'), par = byId.get('bicep-curl/lifefitness-preacher-curl');
    state.sessions = [{ id: 's1', date: new Date(Date.now() - 3 * 864e5).toISOString(), endedAt: new Date(Date.now() - 3 * 864e5 + 3e6).toISOString(),
      exercises: [{ varUuid: kid, subUuid: null, sets: [{ w: 40, r: 10 }] }, { varUuid: par, subUuid: null, sets: [{ w: 90, r: 8 }, { w: 90, r: 7 }] }] }];
    startExerciseFromSuggestion(par);
    await new Promise(res => setTimeout(res, 400));
    const chips = () => [...document.querySelectorAll('#trk-limb-select [data-limb-pick]')].map(b => ({ lbl: b.querySelector('.sub-chip-lbl').textContent, on: b.classList.contains('active'), meta: b.querySelector('.sub-chip-meta').textContent }));
    const out = { onParent: chips(), parentVar: pending.varUuid === par };
    document.querySelector(`#trk-limb-select [data-limb-pick="${kid}"]`).click();
    await new Promise(res => setTimeout(res, 400));
    out.onKid = chips().map(c => c.lbl + (c.on ? '*' : '')); out.kidVar = pending.varUuid === kid;
    out.hist = [getHistoryByKey(par, null).length, getHistoryByKey(kid, null).length, getHistoryByKey(kid, null)[0].topSet.w];
    out.name = displayName(kid);
    const other = [...VAR_INDEX.keys()].find(u => !limbGroup(u));
    startExerciseFromSuggestion(other); await new Promise(res => setTimeout(res, 400));
    out.noRow = !document.querySelector('#trk-limb-select');
    return out;
  });
  expect(r.parentVar).toBe(true);
  expect(r.onParent.map(c => c.lbl + (c.on ? '*' : ''))).toEqual(['Both arms*', 'Single arm']);
  expect(r.onParent[0].meta).toMatch(/✓ 1×/);
  expect(r.onParent[1].meta).toMatch(/✓ 1×/);
  expect(r.kidVar).toBe(true);
  expect(r.onKid).toEqual(['Both arms', 'Single arm*']);
  expect(r.hist).toEqual([1, 1, 40]);        // each keeps its own history
  expect(r.name).toBe('Single-Arm Preacher Curl Machine (Life Fitness)');
  expect(r.noRow).toBe(true);
});
