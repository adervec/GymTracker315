// feat 498 — the exercise picker can show only exercises you actually logged within the last
// 1 / 2 / 3 / 4 / 6 / 12 months. One cycling pill (feat 397 pattern), default off; it reads the same
// touch map as the feat-378 "Trained?" filter, so "done" means a logged set or cardio entry.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';
const DAY = 864e5;

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof filterVariations === 'function' && typeof renderModal === 'function'
    && typeof VAR_INDEX !== 'undefined' && typeof buildTouchMap === 'function', null, { timeout: 15000 });
});

test('feat 498 — each window keeps only exercises last logged inside it (primary AND cross-linked rows)', async ({ page }) => {
  const r = await page.evaluate((DAY) => {
    const fam = (id) => FAMILIES.find(f => f.id === id);
    const uuidOf = (f, id) => ((fam(f).variations.find(v => v.id === id)) || {}).uuid || null;
    const firstOf = (f) => ((fam(f).variations.find(v => v.uuid && varVisibleInPicker(fam(f), v))) || {}).uuid || null;
    const V = {
      d10: firstOf('squat'), d50: firstOf('deadlift'), d150: firstOf('flat-bench-press'),
      d300: firstOf('bicep-curl'), d400: firstOf('row'),
      xlinked: uuidOf('roman-chair', 'ghd-sit-up'),          // cross-listed under abs-dynamic (feat 497)
      never: uuidOf('slider-work', 'slider-hamstring-curl'), // cross-listed under leg-curl, never logged
    };
    const at = (days) => new Date(Date.now() - days * DAY).toISOString();
    const log = (u) => ({ varUuid: u, subUuid: null, sets: [{ w: 60, r: 5 }] });
    state.sessions = [
      { id: 'a', date: at(10), exercises: [log(V.d10), log(V.xlinked)] },
      { id: 'b', date: at(50), exercises: [log(V.d50)] },
      { id: 'c', date: at(150), exercises: [log(V.d150)] },
      { id: 'd', date: at(300), exercises: [log(V.d300)] },
      { id: 'e', date: at(400), exercises: [log(V.d400), log(V.d10)] }, // d10's OLD log must not matter — its newest counts
      { id: 'f', date: at(5), exercises: [{ varUuid: V.never, subUuid: null, sets: [] }] }, // opened, nothing logged
    ];
    Object.assign(modalState, { pickerMega: 'all', pickerSub: 'all', pickerEquip: 'all', pickerSearch: '',
      pickerFavOnly: false, pickerExplored: 'all', pickerVolStatus: 'all', pickerTrend: 'all', planStepFilter: null });
    const run = (mode) => {
      modalState.pickerRecent = mode;
      const s = new Set(), sec = new Set();
      filterVariations().forEach(g => { g.variations.forEach(v => s.add(v.uuid)); (g.secondaryVars || []).forEach(x => { s.add(x.v.uuid); sec.add(x.v.uuid); }); });
      return { s, sec };
    };
    const keys = Object.keys(V);
    const pick = (mode) => { const { s } = run(mode); return keys.filter(k => s.has(V[k])); };
    const out = { missing: keys.filter(k => !V[k]) };
    ['all', '1', '2', '3', '4', '6', '12'].forEach(m => { out[m] = pick(m); });
    out.allSize = run('all').s.size;
    out.oneSize = run('1').s.size;
    out.xlinkedInSecondary = run('1').sec.has(V.xlinked); // the cross-linked row under abs-dynamic survives too
    modalState.pickerRecent = 'all';
    return out;
  }, DAY);
  expect(r.missing).toEqual([]);
  expect(r.all).toEqual(['d10', 'd50', 'd150', 'd300', 'd400', 'xlinked', 'never']); // default off: everything shows
  expect(r['1']).toEqual(['d10', 'xlinked']);
  expect(r['2']).toEqual(['d10', 'd50', 'xlinked']);
  expect(r['3']).toEqual(['d10', 'd50', 'xlinked']);
  expect(r['4']).toEqual(['d10', 'd50', 'xlinked']);
  expect(r['6']).toEqual(['d10', 'd50', 'd150', 'xlinked']);
  expect(r['12']).toEqual(['d10', 'd50', 'd150', 'd300', 'xlinked']); // 400 days ago is outside every window
  expect(r.oneSize).toBe(2);                 // nothing else in the catalogue leaks through
  expect(r.allSize).toBeGreaterThan(1000);
  expect(r.xlinkedInSecondary).toBe(true);
});

test('feat 498 — one cycling pill, default off: tap walks 1→2→3→4→6→12 months and back; hold resets', async ({ page }) => {
  const r = await page.evaluate(() => {
    pending.varUuid = null; Object.assign(modalState, { showPicker: true, open: true, supersetMode: false, pickerRecent: 'all' });
    renderModal();
    const el = () => document.getElementById('cyc-recent');
    const tap = () => { const b = el(); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); };
    const off = { active: el().classList.contains('active'), label: el().textContent.trim() };
    const seen = [];
    for (let i = 0; i < 7; i++) { tap(); seen.push([modalState.pickerRecent, el().textContent.trim(), el().classList.contains('active')]); }
    tap(); tap(); // -> '2', then start a hold with no release
    el().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return { off, seen };
  });
  expect(r.off.active).toBe(false);
  expect(r.off.label).toContain('Recent');
  expect(r.seen.map(s => s[0])).toEqual(['1', '2', '3', '4', '6', '12', 'all']);
  expect(r.seen[0][1]).toContain('1 mo');
  expect(r.seen[5][1]).toContain('12 mo');
  expect(r.seen.slice(0, 6).every(s => s[2])).toBe(true); // lit while filtering
  expect(r.seen[6][2]).toBe(false);                        // a full cycle returns to off
  await page.waitForTimeout(2400); // trackerPress long-press threshold is 2000ms
  expect(await page.evaluate(() => modalState.pickerRecent)).toBe('all');
});
